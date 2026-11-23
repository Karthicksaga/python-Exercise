package app

// Advertisable features (Nov 2026; suggestions/2026-11-07-advertisable-unique-features.md):
// price promise, meter-honest auto fare, accepted-means-coming, back-seat check, train-aware
// pickup and booking by SMS. Usual captain and the comfort map reuse existing pieces.

import (
	"bytes"
	"context"
	"crypto/hmac"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ── Price promise ──────────────────────────────────────

// applyPricePromise runs as a ride completes. The rider never pays more than the promised fare
// (the agreed price plus the wait charge shown on both phones). If the fare came out higher, it
// is cut to the promise and Hop pays the captain the difference.
func applyPricePromise(ctx context.Context, tx pgx.Tx, rideID string) (int64, error) {
	var refund int64
	var driver *string
	e := tx.QueryRow(ctx, `WITH f AS (SELECT r.id,COALESCE(r.offered_fare_paise,q.fare_paise) AS fare,r.promised_fare_paise AS promise
 FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.id=$1 AND r.promised_fare_paise IS NOT NULL)
 UPDATE rides r SET promise_refund_paise=f.fare-f.promise,offered_fare_paise=f.promise
 FROM f WHERE r.id=f.id AND f.fare>f.promise RETURNING r.promise_refund_paise,r.driver_id::text`, rideID).Scan(&refund, &driver)
	if e == pgx.ErrNoRows {
		return 0, nil
	}
	if e != nil {
		return 0, e
	}
	if driver != nil && refund > 0 {
		_, e = tx.Exec(ctx, `INSERT INTO driver_ledger(driver_id,ride_id,kind,amount_paise,note) VALUES($1,$2,'price_promise',$3,'Hop paid the price promise difference')
 ON CONFLICT (ride_id,kind) DO NOTHING`, *driver, rideID, refund)
	}
	return refund, e
}

// ── Accepted means coming ──────────────────────────────

// requeueAfterCaptainCancel sends a ride back to matching when its captain cancels after
// accepting: that captain won't be offered it again, the next round starts now, and the rider
// gets the zone's wallet credit once per ride. Shared rides keep the plain cancel.
func requeueAfterCaptainCancel(ctx context.Context, tx pgx.Tx, rideID, driver, rider, reason string) (bool, int64, error) {
	var shared bool
	if e := tx.QueryRow(ctx, "SELECT group_id IS NOT NULL FROM rides WHERE id=$1", rideID).Scan(&shared); e != nil || shared {
		return false, 0, e
	}
	if _, e := tx.Exec(ctx, `UPDATE rides SET status='requested',driver_id=NULL,reserved_driver_id=NULL,reserved_until=NULL,
 expires_at=GREATEST(expires_at,now()+interval '5 minutes'),dispatch_stage=0,dispatch_due=now(),captain_cancels=captain_cancels+1,
 version=version+1,updated_at=now() WHERE id=$1`, rideID); e != nil {
		return false, 0, e
	}
	if _, e := tx.Exec(ctx, "INSERT INTO ride_declines(ride_id,driver_id) VALUES($1,$2) ON CONFLICT DO NOTHING", rideID, driver); e != nil {
		return false, 0, e
	}
	if _, e := tx.Exec(ctx, "INSERT INTO captain_cancellations(ride_id,driver_id,reason) VALUES($1,$2,$3)", rideID, driver, reason); e != nil {
		return false, 0, e
	}
	var credit int64
	if e := tx.QueryRow(ctx, `SELECT a.captain_cancel_credit_paise FROM rides r JOIN quotes q ON q.id=r.quote_id JOIN areas a ON a.id=q.area_id
 WHERE r.id=$1 AND r.cancel_credit_paise=0`, rideID).Scan(&credit); e != nil && e != pgx.ErrNoRows {
		return false, 0, e
	}
	if credit > 0 {
		if e := walletCredit(ctx, tx, rider, credit, "cancel_credit", rideID, "Your captain cancelled after accepting", "cancel-credit:"+rideID); e != nil {
			return false, 0, e
		}
		if _, e := tx.Exec(ctx, "UPDATE rides SET cancel_credit_paise=$2 WHERE id=$1", rideID, credit); e != nil {
			return false, 0, e
		}
	}
	body := "We're finding you another captain first."
	if credit > 0 {
		body += " " + rupees(credit) + " has been added to your hop wallet for the trouble."
	}
	return true, credit, notify(ctx, tx, rider, "ride", "Your captain cancelled", body)
}

// ── Meter-honest auto fare ─────────────────────────────

// saveMeterTariff sets (or clears with off) the official meter tariff shown next to Hop's fare.
func (s *Server) saveMeterTariff(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		AreaID     string `json:"area_id"`
		Category   string `json:"category"`
		BasePaise  int    `json:"base_paise"`
		BaseMeters int    `json:"base_meters"`
		PerKMPaise int    `json:"per_km_paise"`
		Off        bool   `json:"off"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !validVehicleCategory(in.Category) || (!in.Off && (in.BasePaise < 1 || in.BasePaise > 100000 || in.BaseMeters < 0 || in.BaseMeters > 20000 || in.PerKMPaise < 1 || in.PerKMPaise > 20000)) {
		fail(w, 400, "Invalid meter tariff")
		return
	}
	var base, meters, perKM any
	if !in.Off {
		base, meters, perKM = in.BasePaise, in.BaseMeters, in.PerKMPaise
	}
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	tag, e := tx.Exec(ctx, "UPDATE area_vehicle_pricing SET meter_base_paise=$3,meter_base_meters=$4,meter_per_km_paise=$5,updated_at=now() WHERE area_id=$1 AND category=$2", in.AreaID, in.Category, base, meters, perKM)
	if e == nil && tag.RowsAffected() == 0 {
		fail(w, 404, "Configure the vehicle category for this area first")
		return
	}
	if e == nil {
		e = audit(ctx, tx, user(r).Account.ID, "", "meter_tariff_updated", in)
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

// meterFare is the official meter fare for a distance, or 0 when no tariff is set.
func meterFare(p VehiclePricing, meters int64) int64 {
	if p.MeterBase == nil || p.MeterPerKM == nil {
		return 0
	}
	extra := meters - int64(derefInt(p.MeterBaseMeters))
	if extra < 0 {
		extra = 0
	}
	// Meters charge by the started 100 m, like the printed fare charts.
	return int64(*p.MeterBase) + (extra+99)/100*int64(*p.MeterPerKM)/10
}
func derefInt(v *int) int {
	if v == nil {
		return 0
	}
	return *v
}

// ── Left something behind ──────────────────────────────

// backSeat records the captain's back-seat check after a trip; "found" tells the rider at once.
func (s *Server) backSeat(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Found bool   `json:"found"`
		Note  string `json:"note"`
	}
	if !decode(w, r, &in) {
		return
	}
	note := strings.TrimSpace(in.Note)
	if len(note) > 200 {
		fail(w, 400, "Keep the note under 200 characters")
		return
	}
	ctx, uid, rideID := r.Context(), user(r).Account.ID, r.PathValue("id")
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var rider string
	e = tx.QueryRow(ctx, "SELECT rider_id::text FROM rides WHERE id=$1 AND driver_id=$2 AND status='completed' AND completed_at>now()-interval '24 hours' FOR UPDATE", rideID, uid).Scan(&rider)
	if e == pgx.ErrNoRows {
		fail(w, 404, "Back-seat checks are for your trips from the last 24 hours")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	result := "clear"
	if in.Found {
		result = "found"
	}
	_, e = tx.Exec(ctx, "UPDATE rides SET back_seat=$2,version=version+1,updated_at=now() WHERE id=$1", rideID, result)
	if e == nil && in.Found {
		desc := "Found by your captain"
		if note != "" {
			desc += ": " + note
		}
		_, e = tx.Exec(ctx, "INSERT INTO lost_items(ride_id,reporter_id,description,found_by_driver) VALUES($1,$2,$3,true)", rideID, uid, desc)
		if e == nil {
			msg := "Your captain found something after your trip"
			if note != "" {
				msg += " (" + note + ")"
			}
			e = notify(ctx, tx, rider, "lost_item", "Left something behind?", msg+". Message them from the trip receipt to collect it.")
		}
	}
	if e == nil {
		e = audit(ctx, tx, uid, rideID, "back_seat_"+result, map[string]string{})
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	s.wake(rider)
	write(w, 200, map[string]string{"back_seat": result})
}

// ── Train-aware pickup ─────────────────────────────────

// delayScheduledRide moves a scheduled pickup later (a late train), without cancelling it.
func (s *Server) delayScheduledRide(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Minutes int `json:"minutes"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Minutes < 5 || in.Minutes > 120 {
		fail(w, 400, "Move the pickup by 5–120 minutes")
		return
	}
	var at time.Time
	e := s.DB.QueryRow(r.Context(), `UPDATE scheduled_rides SET scheduled_for=scheduled_for+make_interval(mins=>$3),delay_minutes=delay_minutes+$3
 WHERE id=$1 AND rider_id=$2 AND status='scheduled' AND delay_minutes+$3<=240 RETURNING scheduled_for`, r.PathValue("id"), user(r).Account.ID, in.Minutes).Scan(&at)
	if e == pgx.ErrNoRows {
		fail(w, 409, "This pickup can't be moved now (already on its way, or moved by 4 hours)")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"scheduled_for": at})
}

var trainNo = regexp.MustCompile(`^[0-9]{5}$`)

// meterFareFor reads the zone's meter tariff for a vehicle and prices a distance with it.
func meterFareFor(ctx context.Context, db querier, area, category string, meters int64) int64 {
	var p VehiclePricing
	if db.QueryRow(ctx, "SELECT meter_base_paise,meter_base_meters,meter_per_km_paise FROM area_vehicle_pricing WHERE area_id=$1 AND category=$2", area, category).Scan(&p.MeterBase, &p.MeterBaseMeters, &p.MeterPerKM) != nil {
		return 0
	}
	return meterFare(p, meters)
}

// ── Book without internet (SMS) ────────────────────────

var smsBooking = regexp.MustCompile(`(?i)^\s*hop\s+(.{3,80}?)\s+to\s+(.{3,80}?)\s*$`)

// smsInbound receives texts from the SMS provider's webhook (header X-Hop-SMS-Secret).
// "HOP Adyar to Central" quotes an auto and replies with the fare; "YES" within 10 minutes books
// it, paid in cash. Only phones verified on a Hop account can book.
func (s *Server) smsInbound(w http.ResponseWriter, r *http.Request) {
	secret := s.Config.SMSInboundSecret
	if secret == "" || !hmac.Equal([]byte(r.Header.Get("X-Hop-SMS-Secret")), []byte(secret)) {
		fail(w, 403, "SMS booking isn't set up")
		return
	}
	var in struct {
		From string `json:"from"`
		Text string `json:"text"`
	}
	if !decode(w, r, &in) {
		return
	}
	phone := normalPhone(in.From)
	text := strings.TrimSpace(in.Text)
	if phone == "" || text == "" || len(text) > 200 {
		fail(w, 400, "Expected a 10-digit Indian mobile and a message")
		return
	}
	ctx := r.Context()
	reply, status, quote, ride := s.handleSMS(ctx, phone, text)
	if _, e := s.DB.Exec(ctx, `INSERT INTO sms_bookings(phone,account_id,body,quote_id,ride_id,status,reply)
 VALUES($1,(SELECT account_id FROM account_profiles WHERE phone=$1 LIMIT 1),$2,NULLIF($3,'')::uuid,NULLIF($4,'')::uuid,$5,$6)`, phone, text, quote, ride, status, reply); e != nil {
		slog.Warn("sms booking log failed", "error", e)
	}
	sent := s.textOut(ctx, phone, reply)
	write(w, 200, map[string]string{"reply": reply, "status": status, "sms": sent})
}

func normalPhone(v string) string {
	digits := regexp.MustCompile(`\D`).ReplaceAllString(v, "")
	if len(digits) == 12 && strings.HasPrefix(digits, "91") {
		digits = digits[2:]
	}
	if len(digits) == 11 && digits[0] == '0' {
		digits = digits[1:]
	}
	if !validPhone(digits) {
		return ""
	}
	return digits
}

const smsHelp = "To book an auto, text: HOP <pickup> to <drop>. Example: HOP Adyar to Central Station"

func (s *Server) handleSMS(ctx context.Context, phone, text string) (reply, status, quote, ride string) {
	var account Account
	e := s.DB.QueryRow(ctx, `SELECT a.id::text,COALESCE(a.name,''),COALESCE(a.email,''),COALESCE(a.role,'') FROM account_profiles p JOIN accounts a ON a.id=p.account_id
 WHERE p.phone=$1 ORDER BY p.updated_at DESC LIMIT 1`, phone).Scan(&account.ID, &account.Name, &account.Email, &account.Role)
	if e != nil {
		return "This number isn't on a hop account yet. Sign up in the hop app once, then you can book by SMS.", "unknown_number", "", ""
	}
	if strings.EqualFold(text, "yes") || strings.EqualFold(text, "y") {
		e = s.DB.QueryRow(ctx, `SELECT quote_id::text FROM sms_bookings WHERE phone=$1 AND status='quoted' AND created_at>now()-interval '10 minutes'
 ORDER BY created_at DESC LIMIT 1`, phone).Scan(&quote)
		if e != nil {
			return "No fare is waiting for you. " + smsHelp, "expired", "", ""
		}
		code, body := s.invokeAs(ctx, account, s.book, "POST", "/api/rides", map[string]any{"quote_id": quote, "payment_method": "cash", "request_key": quote})
		var out struct {
			ID    string `json:"id"`
			Error string `json:"error"`
		}
		_ = json.Unmarshal(body, &out)
		if code >= 300 || out.ID == "" {
			return "Couldn't book: " + firstNonEmpty(out.Error, "please try again") + ".", "failed", quote, ""
		}
		_, _ = s.DB.Exec(ctx, "UPDATE sms_bookings SET status='booked',ride_id=$2 WHERE quote_id=$1 AND status='quoted'", quote, out.ID)
		_, _ = s.DB.Exec(ctx, "UPDATE rides SET sms_updates=true WHERE id=$1", out.ID)
		return "Booked! We're finding your captain. You'll get their name, auto number and pickup code by SMS. Pay in cash.", "booked", quote, out.ID
	}
	m := smsBooking.FindStringSubmatch(text)
	if m == nil {
		return smsHelp, "failed", "", ""
	}
	// Search in the zone the rider last booked in, else the first live zone.
	var areaID string
	if e = s.DB.QueryRow(ctx, `SELECT id::text FROM areas WHERE active ORDER BY
 (id=(SELECT area_id FROM quotes WHERE rider_id=$1 ORDER BY created_at DESC LIMIT 1)) DESC, name LIMIT 1`, account.ID).Scan(&areaID); e != nil {
		return "SMS booking isn't available right now.", "failed", "", ""
	}
	find := func(q string) (Point, bool) {
		code, body := s.invokeAs(ctx, account, s.places, "GET", "/api/places?area_id="+areaID+"&q="+urlQuery(q), nil)
		var points []Point
		if code != 200 || json.Unmarshal(body, &points) != nil || len(points) == 0 {
			return Point{}, false
		}
		return points[0], true
	}
	pickup, ok1 := find(m[1])
	drop, ok2 := find(m[2])
	if !ok1 || !ok2 {
		missing := m[1]
		if ok1 {
			missing = m[2]
		}
		return fmt.Sprintf("Couldn't find %q. Try a landmark or area name. %s", missing, smsHelp), "failed", "", ""
	}
	_ = s.DB.QueryRow(ctx, "SELECT id::text FROM areas WHERE active AND $1 BETWEEN min_lat AND max_lat AND $2 BETWEEN min_lng AND max_lng LIMIT 1", pickup.Lat, pickup.Lng).Scan(&areaID)
	out, qe := s.buildQuote(ctx, account.ID, quoteInput{AreaID: areaID, VehicleCategory: "auto", Pickup: pickup, Dropoff: drop, TripType: "city"})
	if qe != nil {
		return "Couldn't price that trip: " + firstNonEmpty(qe.Message, "outside the service area") + ".", "failed", "", ""
	}
	quote, _ = out["id"].(string)
	fare, _ := out["payable_paise"].(int64)
	return fmt.Sprintf("Auto from %s to %s: %s (price promise: you won't pay more). Reply YES within 10 minutes to book. Pay in cash.",
		shortLabel(pickup.Label), shortLabel(drop.Label), rupees(fare)), "quoted", quote, ""
}

// invokeAs runs one of our handlers as a signed-in account (SMS has no session or CSRF token).
func (s *Server) invokeAs(ctx context.Context, account Account, h http.HandlerFunc, method, target string, body any) (int, []byte) {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, target, &buf).WithContext(context.WithValue(ctx, userKey, requestContext{Account: account}))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec.Code, rec.Body.Bytes()
}

func firstNonEmpty(v ...string) string {
	for _, s := range v {
		if strings.TrimSpace(s) != "" {
			return s
		}
	}
	return ""
}
func shortLabel(v string) string {
	if i := strings.Index(v, ","); i > 0 {
		v = v[:i]
	}
	if len(v) > 40 {
		v = v[:40]
	}
	return v
}
func urlQuery(v string) string { return url.QueryEscape(v) }
