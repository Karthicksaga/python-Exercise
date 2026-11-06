package app

// Hop originals, phases 2 and 3 of the approved Nov 2026 prototype: ride notes, arrival alert,
// SMS trip updates, chai break, "home by" time and message translation.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var rideNoteCodes = map[string]bool{"quiet": true, "luggage": true, "boarding": true, "call": true}

// validNotes keeps the known note codes, once each.
func validNotes(in []string) ([]string, bool) {
	out, seen := []string{}, map[string]bool{}
	for _, n := range in {
		if !rideNoteCodes[n] {
			return nil, false
		}
		if !seen[n] {
			seen[n] = true
			out = append(out, n)
		}
	}
	return out, true
}

// textOut sends an SMS when a provider is set up. In development or with DEV_SMS it is only logged
// ("test"); with neither it reports "unavailable", so the apps never claim a text was delivered.
func (s *Server) textOut(ctx context.Context, phone, message string) string {
	if s.smsConfigured() {
		if e := s.sendSMS(ctx, phone, message); e != nil {
			slog.Warn("sms failed", "error", e)
			return "failed"
		}
		return "sent"
	}
	if s.devSMS() {
		slog.Info("test sms (not delivered)", "to_last4", phone[max(0, len(phone)-4):], "message", message)
		return "test"
	}
	return "unavailable"
}

// rideTexts runs after a ride's status is saved: SMS trip updates for riders who asked for them, and
// the arrival alert to the rider's first emergency contact when the trip completes.
func (s *Server) rideTexts(rideID, status string) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	var riderPhone, riderName, drop, captain, plate, contact string
	var sms, alert bool
	e := s.DB.QueryRow(ctx, `SELECT COALESCE(vp.phone,''),split_part(COALESCE(ra.name,'Your rider'),' ',1),q.dropoff_label,
 split_part(COALESCE(da.name,'Your captain'),' ',1),COALESCE(d.vehicle_number,''),r.sms_updates,r.arrival_alert,
 COALESCE((SELECT phone FROM emergency_contacts c WHERE c.account_id=r.rider_id ORDER BY created_at LIMIT 1),'')
 FROM rides r JOIN quotes q ON q.id=r.quote_id JOIN accounts ra ON ra.id=r.rider_id
 LEFT JOIN verified_phones vp ON vp.account_id=r.rider_id LEFT JOIN accounts da ON da.id=r.driver_id LEFT JOIN drivers d ON d.user_id=r.driver_id
 WHERE r.id=$1`, rideID).Scan(&riderPhone, &riderName, &drop, &captain, &plate, &sms, &alert, &contact)
	if e != nil {
		slog.Warn("ride texts lookup failed", "ride_id", rideID, "error", e)
		return
	}
	if sms && riderPhone != "" {
		msg := map[string]string{
			"accepted":    fmt.Sprintf("Hop: %s is coming to pick you up in %s.", captain, plate),
			"arrived":     fmt.Sprintf("Hop: %s has arrived at your pickup (%s).", captain, plate),
			"in_progress": fmt.Sprintf("Hop: your trip to %s has started.", drop),
		}[status]
		if msg != "" {
			s.textOut(ctx, riderPhone, msg)
		}
	}
	if alert && status == "completed" {
		result := "no_contact"
		if contact != "" {
			result = s.textOut(ctx, contact, fmt.Sprintf("Hop: %s reached %s at %s.", riderName, drop, time.Now().In(istLocation()).Format("3:04 pm")))
		}
		if _, e := s.DB.Exec(ctx, "UPDATE rides SET arrival_alert_status=$2 WHERE id=$1", rideID, result); e != nil {
			slog.Warn("arrival alert status not saved", "ride_id", rideID, "error", e)
		}
	}
}

func istLocation() *time.Location {
	if l, e := time.LoadLocation("Asia/Kolkata"); e == nil {
		return l
	}
	return time.FixedZone("IST", 5*3600+1800)
}

// rideAlerts lets the rider switch the arrival alert or SMS updates on or off during their trip.
func (s *Server) rideAlerts(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ArrivalAlert *bool `json:"arrival_alert"`
		SMSUpdates   *bool `json:"sms_updates"`
	}
	if !decode(w, r, &in) {
		return
	}
	tag, e := s.DB.Exec(r.Context(), `UPDATE rides SET arrival_alert=COALESCE($3,arrival_alert),sms_updates=COALESCE($4,sms_updates),updated_at=now()
 WHERE id=$1 AND rider_id=$2 AND status IN ('requested','accepted','arrived','in_progress')`, r.PathValue("id"), user(r).Account.ID, in.ArrivalAlert, in.SMSUpdates)
	if e != nil {
		dbError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 404, "Only your current trip can be changed")
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

// driverBreak pauses ride requests for 15 to 60 minutes without going offline; minutes 0 ends it.
func (s *Server) driverBreak(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Minutes int `json:"minutes"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Minutes != 0 && (in.Minutes < 5 || in.Minutes > 60) {
		fail(w, 400, "A break is 5 to 60 minutes")
		return
	}
	var until *time.Time
	e := s.DB.QueryRow(r.Context(), `UPDATE drivers SET break_until=CASE WHEN $2=0 THEN NULL ELSE now()+make_interval(mins=>$2) END,updated_at=now()
 WHERE user_id=$1 AND status='approved' RETURNING break_until`, user(r).Account.ID, in.Minutes).Scan(&until)
	if e != nil {
		fail(w, 404, "Only approved captains can take a break")
		return
	}
	write(w, 200, map[string]any{"ok": true, "break_until": until})
}

// homeBy sets a time to be home by: from an hour before it, matching only offers rides that bring the
// captain closer to home (the same rule as go-home mode). {off:true} clears it.
func (s *Server) homeBy(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Off bool    `json:"off"`
		At  string  `json:"at"`
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	}
	if !decode(w, r, &in) {
		return
	}
	ctx, uid := r.Context(), user(r).Account.ID
	if in.Off {
		if _, e := s.DB.Exec(ctx, "UPDATE drivers SET home_by=NULL WHERE user_id=$1", uid); e != nil {
			dbError(w, e)
			return
		}
		write(w, 200, map[string]bool{"ok": true})
		return
	}
	clock, e := time.Parse("15:04", in.At)
	if e != nil {
		fail(w, 400, "Choose a time like 21:00")
		return
	}
	if !(Point{Lat: in.Lat, Lng: in.Lng, Label: "home"}).valid() {
		fail(w, 400, "Choose a valid home location")
		return
	}
	ist := istLocation()
	now := time.Now().In(ist)
	at := time.Date(now.Year(), now.Month(), now.Day(), clock.Hour(), clock.Minute(), 0, 0, ist)
	if !at.After(now) {
		at = at.Add(24 * time.Hour)
	}
	tag, e := s.DB.Exec(ctx, "UPDATE drivers SET home_lat=$2,home_lng=$3,home_by=$4,updated_at=now() WHERE user_id=$1 AND status='approved'", uid, in.Lat, in.Lng, at)
	if e != nil {
		dbError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 404, "Only approved captains can set a home time")
		return
	}
	write(w, 200, map[string]any{"ok": true, "home_by": at})
}

// translate turns a chat message into the reader's language with Google Cloud Translation, when a key
// is configured (TRANSLATE_API_KEY). Without one it says so instead of pretending.
func (s *Server) translate(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Text string `json:"text"`
		To   string `json:"to"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !s.limit(w, r, "translate:"+user(r).Account.ID, 60, 60) {
		return
	}
	in.Text = strings.TrimSpace(in.Text)
	if in.Text == "" || len(in.Text) > 1000 || !map[string]bool{"en": true, "hi": true, "ta": true, "te": true, "kn": true, "ml": true, "bn": true, "mr": true, "gu": true, "pa": true}[in.To] {
		fail(w, 400, "Send text up to 1,000 characters and a supported language")
		return
	}
	if s.Config.TranslateAPIKey == "" {
		fail(w, 503, "Translation isn't set up yet")
		return
	}
	body, _ := json.Marshal(map[string]any{"q": in.Text, "target": in.To, "format": "text"})
	req, e := http.NewRequestWithContext(r.Context(), "POST", "https://translation.googleapis.com/language/translate/v2?key="+url.QueryEscape(s.Config.TranslateAPIKey), bytes.NewReader(body))
	if e != nil {
		dbError(w, e)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	res, e := s.HTTP.Do(req)
	if e != nil {
		fail(w, 502, "Translation is unavailable right now")
		return
	}
	defer res.Body.Close()
	var out struct {
		Data struct {
			Translations []struct {
				Text   string `json:"translatedText"`
				Source string `json:"detectedSourceLanguage"`
			} `json:"translations"`
		} `json:"data"`
	}
	if res.StatusCode/100 != 2 || json.NewDecoder(http.MaxBytesReader(nil, res.Body, 1<<16)).Decode(&out) != nil || len(out.Data.Translations) == 0 {
		fail(w, 502, "Translation is unavailable right now")
		return
	}
	t := out.Data.Translations[0]
	write(w, 200, map[string]string{"text": t.Text, "from": t.Source})
}
