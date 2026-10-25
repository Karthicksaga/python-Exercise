package app

import (
	"context"
	"crypto/rand"
	"math"
	"net/http"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

// Rider companion features: preferences, notifications, safety, rewards,
// family, favorites and scheduled-ride intents.

var supportedLanguages = map[string]bool{"en": true, "hi": true, "ta": true, "te": true, "kn": true, "ml": true, "bn": true, "mr": true, "gu": true, "pa": true}
var vehicleCategories = map[string]bool{"bike": true, "auto": true, "mini": true, "sedan": true, "suv": true}

const referralRewardPoints = 100

func (s *Server) companionRoutes() map[string]http.HandlerFunc {
	return map[string]http.HandlerFunc{
		"GET /api/companion":                     s.companion,
		"POST /api/preferences":                  s.savePreferences,
		"POST /api/notifications/read":           s.readNotifications,
		"GET /api/notifications/new":             s.newNotifications,
		"POST /api/rides/{id}/lost-items":        s.reportLostItem,
		"POST /api/rides/{id}/sos":               s.sos,
		"POST /api/rides/{id}/share":             s.createShare,
		"POST /api/rides/{id}/share/revoke":      s.revokeShare,
		"POST /api/rides/{id}/bids":              s.bid,
		"POST /api/rides/{id}/decline":           s.decline,
		"POST /api/rides/{id}/bids/{bid}/accept": s.acceptBid,
		"POST /api/operator/trip-pricing":        s.saveTripPricing,
		"POST /api/referrals/redeem":             s.redeemReferral,
		"POST /api/family/invite":                s.inviteFamily,
		"POST /api/family/{id}/respond":          s.respondFamily,
		"POST /api/family/{id}/delete":           s.removeFamily,
		"POST /api/favorite-drivers":             s.addFavoriteDriver,
		"POST /api/favorite-drivers/{id}/delete": s.removeFavoriteDriver,
		"POST /api/rides/{id}/pay":               s.createPaymentOrder, "POST /api/rides/{id}/pay/verify": s.verifyPayment,
		"POST /api/scheduled-rides":             s.scheduleRide,
		"POST /api/scheduled-rides/{id}/cancel": s.cancelScheduledRide,
	}
}

func validLatLng(lat, lng float64) bool {
	return !math.IsNaN(lat) && !math.IsInf(lat, 0) && !math.IsNaN(lng) && !math.IsInf(lng, 0) &&
		lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98
}

func cleanText(v string, min, max int) (string, bool) {
	v = strings.TrimSpace(v)
	n := utf8.RuneCountInString(v)
	if n < min || n > max {
		return "", false
	}
	for _, c := range v {
		if unicode.IsControl(c) && c != '\n' {
			return "", false
		}
	}
	return v, true
}

func validPhone(v string) bool {
	if len(v) != 10 || v[0] < '6' {
		return false
	}
	for _, c := range v {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

func notify(ctx context.Context, tx pgx.Tx, account, kind, title, body string) error {
	_, e := tx.Exec(ctx, `INSERT INTO notifications(account_id,kind,title,body)
 SELECT $1::uuid,$2::text,$3::text,$4::text WHERE COALESCE((SELECT notifications_enabled FROM account_preferences WHERE account_id=$1::uuid),true)`, account, kind, title, body)
	return e
}

func newReferralCode() string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 8)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(b)
}

// settleReferral credits both sides once the referred rider completes a first ride.
func (s *Server) settleReferral(ctx context.Context, uid string) error {
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	var referrer string
	e = tx.QueryRow(ctx, `UPDATE referrals SET rewarded_at=now()
 WHERE referred_id=$1 AND rewarded_at IS NULL AND EXISTS(SELECT 1 FROM rides WHERE rider_id=$1 AND status='completed')
 RETURNING referrer_id`, uid).Scan(&referrer)
	if e == pgx.ErrNoRows {
		return nil
	}
	if e != nil {
		return e
	}
	for _, p := range [][2]string{{referrer, "Referral bonus: friend completed a first ride"}, {uid, "Welcome bonus: first completed ride"}} {
		if _, e = tx.Exec(ctx, "INSERT INTO reward_ledger(account_id,points,reason) VALUES($1,$2,$3)", p[0], referralRewardPoints, p[1]); e != nil {
			return e
		}
		if e = notify(ctx, tx, p[0], "reward", "Reward earned", p[1]); e != nil {
			return e
		}
	}
	return tx.Commit(ctx)
}

func (s *Server) companion(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid := user(r).Account.ID
	if e := s.settleReferral(ctx, uid); e != nil {
		dbError(w, e)
		return
	}
	if _, e := s.DB.Exec(ctx, "INSERT INTO referral_codes(account_id,code) VALUES($1,$2) ON CONFLICT DO NOTHING", uid, newReferralCode()); e != nil {
		dbError(w, e)
		return
	}
	out := map[string]any{}
	queries := []struct{ key, sql string }{
		{"preferences", `SELECT COALESCE((SELECT row_to_json(p) FROM (SELECT language,wheelchair_access,hearing_impaired,visually_impaired,extra_assistance,large_text,notifications_enabled FROM account_preferences WHERE account_id=$1) p),
 '{"language":"en","wheelchair_access":false,"hearing_impaired":false,"visually_impaired":false,"extra_assistance":false,"large_text":false,"notifications_enabled":true}'::json) AS t`},
		{"notifications", "SELECT id,kind,title,body,read_at,created_at FROM notifications WHERE account_id=$1 ORDER BY created_at DESC LIMIT 30"},
		{"referral", "SELECT c.code,(SELECT COALESCE(sum(points),0) FROM reward_ledger WHERE account_id=$1) AS points,(SELECT count(*) FROM referrals WHERE referrer_id=$1) AS referred,EXISTS(SELECT 1 FROM referrals WHERE referred_id=$1) AS redeemed FROM referral_codes c WHERE c.account_id=$1"},
		{"rewards", "SELECT points,reason,created_at FROM reward_ledger WHERE account_id=$1 ORDER BY id DESC LIMIT 20"},
		{"family", `SELECT f.id,f.status,CASE WHEN f.owner_id=$1 THEN 'owner' ELSE 'member' END AS role,
 a.name,a.email FROM family_members f JOIN accounts a ON a.id=CASE WHEN f.owner_id=$1 THEN f.member_id ELSE f.owner_id END
 WHERE f.owner_id=$1 OR f.member_id=$1 ORDER BY f.created_at DESC`},
		{"favorite_drivers", `SELECT fd.driver_id AS id,a.name,d.vehicle_number FROM favorite_drivers fd
 JOIN accounts a ON a.id=fd.driver_id JOIN drivers d ON d.user_id=fd.driver_id WHERE fd.rider_id=$1 ORDER BY fd.created_at DESC`},
		{"scheduled_rides", "SELECT id,category,pickup_label,dropoff_label,scheduled_for,status FROM scheduled_rides WHERE rider_id=$1 AND scheduled_for>now()-interval '1 day' ORDER BY scheduled_for"},
		{"lost_items", "SELECT id,ride_id,description,status,created_at FROM lost_items WHERE reporter_id=$1 ORDER BY created_at DESC LIMIT 20"},
	}
	for _, q := range queries {
		var rows any
		var e error
		if q.key == "preferences" {
			e = s.DB.QueryRow(ctx, q.sql, uid).Scan(&rows)
		} else {
			rows, e = jsonRows(ctx, s.DB, q.sql, uid)
		}
		if e != nil {
			dbError(w, e)
			return
		}
		out[q.key] = rows
	}
	write(w, 200, out)
}

func (s *Server) savePreferences(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Language             string `json:"language"`
		WheelchairAccess     bool   `json:"wheelchair_access"`
		HearingImpaired      bool   `json:"hearing_impaired"`
		VisuallyImpaired     bool   `json:"visually_impaired"`
		ExtraAssistance      bool   `json:"extra_assistance"`
		LargeText            bool   `json:"large_text"`
		NotificationsEnabled bool   `json:"notifications_enabled"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !supportedLanguages[in.Language] {
		fail(w, 400, "Unsupported language")
		return
	}
	_, e := s.DB.Exec(r.Context(), `INSERT INTO account_preferences(account_id,language,wheelchair_access,hearing_impaired,visually_impaired,extra_assistance,large_text,notifications_enabled)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(account_id) DO UPDATE SET language=EXCLUDED.language,
 wheelchair_access=EXCLUDED.wheelchair_access,hearing_impaired=EXCLUDED.hearing_impaired,visually_impaired=EXCLUDED.visually_impaired,
 extra_assistance=EXCLUDED.extra_assistance,large_text=EXCLUDED.large_text,notifications_enabled=EXCLUDED.notifications_enabled,updated_at=now()`,
		user(r).Account.ID, in.Language, in.WheelchairAccess, in.HearingImpaired, in.VisuallyImpaired, in.ExtraAssistance, in.LargeText, in.NotificationsEnabled)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

func (s *Server) readNotifications(w http.ResponseWriter, r *http.Request) {
	if _, e := s.DB.Exec(r.Context(), "UPDATE notifications SET read_at=now() WHERE account_id=$1 AND read_at IS NULL", user(r).Account.ID); e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

// riderRide verifies the caller rode (or drove) the given ride and returns its status.
func (s *Server) riderRide(ctx context.Context, rideID, uid string, riderOnly bool) (status string, e error) {
	q := "SELECT status FROM rides WHERE id=$1 AND (rider_id=$2 OR driver_id=$2)"
	if riderOnly {
		q = "SELECT status FROM rides WHERE id=$1 AND rider_id=$2"
	}
	e = s.DB.QueryRow(ctx, q, rideID, uid).Scan(&status)
	return
}

func (s *Server) reportLostItem(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Description string `json:"description"`
	}
	if !decode(w, r, &in) {
		return
	}
	desc, ok := cleanText(in.Description, 5, 1000)
	if !ok {
		fail(w, 400, "Describe the lost item in 5–1000 characters")
		return
	}
	ctx, uid, rideID := r.Context(), user(r).Account.ID, r.PathValue("id")
	status, e := s.riderRide(ctx, rideID, uid, true)
	if e != nil {
		dbError(w, e)
		return
	}
	if status != "completed" && status != "cancelled" {
		fail(w, 409, "Lost items can be reported after the ride has ended")
		return
	}
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var id string
	e = tx.QueryRow(ctx, "INSERT INTO lost_items(ride_id,reporter_id,description) VALUES($1,$2,$3) RETURNING id", rideID, uid, desc).Scan(&id)
	if e == nil {
		_, e = tx.Exec(ctx, "INSERT INTO incidents(ride_id,reporter_id,message) VALUES($1,$2,$3)", rideID, uid, "Lost item: "+desc)
	}
	if e == nil {
		e = audit(ctx, tx, uid, rideID, "lost_item_reported", map[string]string{"id": id})
	}
	if e == nil {
		e = notify(ctx, tx, uid, "lost_item", "Lost item reported", "Support will review your report and contact the driver.")
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]string{"id": id})
}

func (s *Server) sos(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Lat *float64 `json:"lat"`
		Lng *float64 `json:"lng"`
	}
	if !decode(w, r, &in) {
		return
	}
	if (in.Lat == nil) != (in.Lng == nil) || (in.Lat != nil && !validLatLng(*in.Lat, *in.Lng)) {
		fail(w, 400, "Provide a valid location or none")
		return
	}
	ctx, uid, rideID := r.Context(), user(r).Account.ID, r.PathValue("id")
	if !s.limit(w, r, "sos:"+uid, 5, 300) {
		return
	}
	status, e := s.riderRide(ctx, rideID, uid, false)
	if e != nil {
		dbError(w, e)
		return
	}
	if status != "accepted" && status != "arrived" && status != "in_progress" {
		fail(w, 409, "SOS is available during an active ride. In an emergency call 112.")
		return
	}
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var incident, id string
	e = tx.QueryRow(ctx, "INSERT INTO incidents(ride_id,reporter_id,message) VALUES($1,$2,'EMERGENCY SOS triggered during an active ride') RETURNING id", rideID, uid).Scan(&incident)
	if e == nil {
		e = tx.QueryRow(ctx, "INSERT INTO sos_events(ride_id,account_id,incident_id,lat,lng) VALUES($1,$2,$3,$4,$5) RETURNING id", rideID, uid, incident, in.Lat, in.Lng).Scan(&id)
	}
	if e == nil {
		e = audit(ctx, tx, uid, rideID, "sos_triggered", map[string]string{"id": id})
	}
	if e == nil {
		e = notify(ctx, tx, uid, "sos", "SOS recorded", "Operators have been alerted. If you are in danger call 112 now.")
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]any{"id": id, "emergency_number": "112"})
}

func (s *Server) createShare(w http.ResponseWriter, r *http.Request) {
	ctx, uid, rideID := r.Context(), user(r).Account.ID, r.PathValue("id")
	status, e := s.riderRide(ctx, rideID, uid, true)
	if e != nil {
		dbError(w, e)
		return
	}
	if status != "accepted" && status != "arrived" && status != "in_progress" {
		fail(w, 409, "Trips can only be shared while a driver is assigned and the ride is active")
		return
	}
	token := randomToken()
	expires := time.Now().Add(6 * time.Hour)
	if _, e = s.DB.Exec(ctx, "INSERT INTO ride_shares(ride_id,token_hash,expires_at) VALUES($1,$2,$3)", rideID, digest(token), expires); e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]any{"path": "/?share=" + token, "token": token, "expires_at": expires})
}

func (s *Server) revokeShare(w http.ResponseWriter, r *http.Request) {
	_, e := s.DB.Exec(r.Context(), `UPDATE ride_shares SET revoked_at=now() WHERE ride_id=$1 AND revoked_at IS NULL
 AND EXISTS(SELECT 1 FROM rides WHERE id=$1 AND rider_id=$2)`, r.PathValue("id"), user(r).Account.ID)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

// viewShare is intentionally unauthenticated: possession of the unguessable token is the credential.
func (s *Server) viewShare(w http.ResponseWriter, r *http.Request) {
	if !s.limit(w, r, "share:"+s.peer(r), 60, 60) {
		return
	}
	var out struct {
		Status      string     `json:"status"`
		Pickup      string     `json:"pickup"`
		Dropoff     string     `json:"dropoff"`
		PickLat     float64    `json:"pickup_lat"`
		PickLng     float64    `json:"pickup_lng"`
		DropLat     float64    `json:"dropoff_lat"`
		DropLng     float64    `json:"dropoff_lng"`
		DriverName  *string    `json:"driver_name"`
		Vehicle     *string    `json:"vehicle_number"`
		DriverLat   *float64   `json:"driver_lat"`
		DriverLng   *float64   `json:"driver_lng"`
		LocationAt  *time.Time `json:"driver_location_at"`
		SharedUntil time.Time  `json:"shared_until"`
	}
	e := s.DB.QueryRow(r.Context(), `SELECT r.status,q.pickup_label,q.dropoff_label,q.pickup_lat,q.pickup_lng,q.dropoff_lat,q.dropoff_lng,
 split_part(a.name,' ',1),d.vehicle_number,d.lat,d.lng,d.location_at,sh.expires_at
 FROM ride_shares sh JOIN rides r ON r.id=sh.ride_id JOIN quotes q ON q.id=r.quote_id
 LEFT JOIN drivers d ON d.user_id=r.driver_id LEFT JOIN accounts a ON a.id=r.driver_id
 WHERE sh.token_hash=$1 AND sh.revoked_at IS NULL AND sh.expires_at>now()
 AND r.status IN ('accepted','arrived','in_progress')`, digest(r.PathValue("token"))).
		Scan(&out.Status, &out.Pickup, &out.Dropoff, &out.PickLat, &out.PickLng, &out.DropLat, &out.DropLng, &out.DriverName, &out.Vehicle, &out.DriverLat, &out.DriverLng, &out.LocationAt, &out.SharedUntil)
	if e == pgx.ErrNoRows {
		fail(w, 404, "This share link is invalid, expired, or the trip has ended")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, out)
}

func (s *Server) redeemReferral(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code string `json:"code"`
	}
	if !decode(w, r, &in) {
		return
	}
	code := strings.ToUpper(strings.TrimSpace(in.Code))
	ctx, uid := r.Context(), user(r).Account.ID
	if !s.limit(w, r, "referral:"+uid, 10, 3600) {
		return
	}
	var completed bool
	if e := s.DB.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM rides WHERE rider_id=$1 AND status='completed')", uid).Scan(&completed); e != nil {
		dbError(w, e)
		return
	}
	if completed {
		fail(w, 409, "Referral codes can only be applied before your first completed ride")
		return
	}
	tag, e := s.DB.Exec(ctx, `INSERT INTO referrals(referred_id,referrer_id) SELECT $1::uuid,account_id FROM referral_codes WHERE code=$2 AND account_id<>$1::uuid
 ON CONFLICT DO NOTHING`, uid, code)
	if e != nil {
		dbError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 400, "Code is invalid, your own, or a referral was already applied")
		return
	}
	write(w, 201, map[string]bool{"ok": true})
}

func (s *Server) inviteFamily(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email string `json:"email"`
	}
	if !decode(w, r, &in) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	ctx, uid := r.Context(), user(r).Account.ID
	if !s.limit(w, r, "family:"+uid, 20, 3600) {
		return
	}
	var count int
	if e := s.DB.QueryRow(ctx, "SELECT count(*) FROM family_members WHERE owner_id=$1", uid).Scan(&count); e != nil {
		dbError(w, e)
		return
	}
	if count >= 6 {
		fail(w, 409, "A family account supports up to 6 members")
		return
	}
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var member, id string
	e = tx.QueryRow(ctx, "SELECT id FROM accounts WHERE lower(email)=$1 AND id<>$2 ORDER BY created_at LIMIT 1", email, uid).Scan(&member)
	if e == pgx.ErrNoRows {
		fail(w, 404, "No registered rider with that email; ask them to sign up first")
		return
	}
	if e == nil {
		e = tx.QueryRow(ctx, "INSERT INTO family_members(owner_id,member_id) VALUES($1,$2) RETURNING id", uid, member).Scan(&id)
	}
	if e == nil {
		e = notify(ctx, tx, member, "family_invite", "Family invitation", user(r).Account.Name+" invited you to join their family account.")
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]string{"id": id})
}

func (s *Server) respondFamily(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Accept bool `json:"accept"`
	}
	if !decode(w, r, &in) {
		return
	}
	ctx, uid, id := r.Context(), user(r).Account.ID, r.PathValue("id")
	var tag int64
	if in.Accept {
		t, e := s.DB.Exec(ctx, "UPDATE family_members SET status='accepted' WHERE id=$1 AND member_id=$2 AND status='pending'", id, uid)
		if e != nil {
			dbError(w, e)
			return
		}
		tag = t.RowsAffected()
	} else {
		t, e := s.DB.Exec(ctx, "DELETE FROM family_members WHERE id=$1 AND member_id=$2 AND status='pending'", id, uid)
		if e != nil {
			dbError(w, e)
			return
		}
		tag = t.RowsAffected()
	}
	if tag == 0 {
		fail(w, 404, "Pending invitation not found")
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

func (s *Server) removeFamily(w http.ResponseWriter, r *http.Request) {
	uid := user(r).Account.ID
	tag, e := s.DB.Exec(r.Context(), "DELETE FROM family_members WHERE id=$1 AND (owner_id=$2 OR member_id=$2)", r.PathValue("id"), uid)
	if e != nil {
		dbError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 404, "Family member not found")
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

func (s *Server) addFavoriteDriver(w http.ResponseWriter, r *http.Request) {
	var in struct {
		RideID string `json:"ride_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	// Only the driver of the rider's own completed ride can be favorited.
	tag, e := s.DB.Exec(r.Context(), `INSERT INTO favorite_drivers(rider_id,driver_id)
 SELECT rider_id,driver_id FROM rides WHERE id=$1::uuid AND rider_id=$2::uuid AND status='completed' AND driver_id IS NOT NULL
 ON CONFLICT DO NOTHING`, in.RideID, user(r).Account.ID)
	if e != nil {
		dbError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 409, "Complete a ride with this driver to add them as a favorite")
		return
	}
	write(w, 201, map[string]bool{"ok": true})
}

func (s *Server) removeFavoriteDriver(w http.ResponseWriter, r *http.Request) {
	if _, e := s.DB.Exec(r.Context(), "DELETE FROM favorite_drivers WHERE rider_id=$1 AND driver_id=$2", user(r).Account.ID, r.PathValue("id")); e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

func (s *Server) scheduleRide(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Category     string    `json:"category"`
		PickupLat    float64   `json:"pickup_lat"`
		PickupLng    float64   `json:"pickup_lng"`
		PickupLabel  string    `json:"pickup_label"`
		DropoffLat   float64   `json:"dropoff_lat"`
		DropoffLng   float64   `json:"dropoff_lng"`
		DropoffLabel string    `json:"dropoff_label"`
		ScheduledFor time.Time `json:"scheduled_for"`
		Payment      string    `json:"payment_method"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Payment == "" {
		in.Payment = "cash"
	}
	if in.Payment != "cash" && in.Payment != "upi" {
		fail(w, 400, "Payment must be cash or upi")
		return
	}
	pickup, ok1 := cleanText(in.PickupLabel, 2, 160)
	drop, ok2 := cleanText(in.DropoffLabel, 2, 160)
	if !vehicleCategories[in.Category] || !ok1 || !ok2 || !validLatLng(in.PickupLat, in.PickupLng) || !validLatLng(in.DropoffLat, in.DropoffLng) {
		fail(w, 400, "Provide valid pickup, drop, and vehicle category")
		return
	}
	if in.ScheduledFor.Before(time.Now().Add(15*time.Minute)) || in.ScheduledFor.After(time.Now().Add(30*24*time.Hour)) {
		fail(w, 400, "Schedule between 15 minutes and 30 days ahead")
		return
	}
	ctx, uid := r.Context(), user(r).Account.ID
	var pending int
	if e := s.DB.QueryRow(ctx, "SELECT count(*) FROM scheduled_rides WHERE rider_id=$1 AND status='scheduled' AND scheduled_for>now()", uid).Scan(&pending); e != nil {
		dbError(w, e)
		return
	}
	if pending >= 10 {
		fail(w, 409, "You can have at most 10 upcoming scheduled rides")
		return
	}
	var id string
	e := s.DB.QueryRow(ctx, `INSERT INTO scheduled_rides(rider_id,area_id,category,pickup_lat,pickup_lng,pickup_label,dropoff_lat,dropoff_lng,dropoff_label,scheduled_for,payment_method)
 SELECT $1::uuid,a.id,$2::text,$3::float8,$4::float8,$5::text,$6::float8,$7::float8,$8::text,$9::timestamptz,$10::text FROM areas a
 WHERE a.active AND $3 BETWEEN a.min_lat AND a.max_lat AND $4 BETWEEN a.min_lng AND a.max_lng
 AND EXISTS(SELECT 1 FROM area_vehicle_pricing p WHERE p.area_id=a.id AND p.category=$2::text AND p.enabled) LIMIT 1
 RETURNING id`, uid, in.Category, in.PickupLat, in.PickupLng, pickup, in.DropoffLat, in.DropoffLng, drop, in.ScheduledFor, in.Payment).Scan(&id)
	if e == pgx.ErrNoRows {
		fail(w, 422, "Pickup is outside an active service area for that vehicle")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]string{"id": id})
}

func (s *Server) cancelScheduledRide(w http.ResponseWriter, r *http.Request) {
	tag, e := s.DB.Exec(r.Context(), "UPDATE scheduled_rides SET status='cancelled' WHERE id=$1 AND rider_id=$2 AND status='scheduled'", r.PathValue("id"), user(r).Account.ID)
	if e != nil {
		dbError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 404, "Scheduled ride not found")
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

// newNotifications lets the open app show alerts that arrived after the given time, without needing push.
func (s *Server) newNotifications(w http.ResponseWriter, r *http.Request) {
	after, e := time.Parse(time.RFC3339Nano, r.URL.Query().Get("after"))
	if e != nil {
		after = time.Now().Add(-time.Minute)
	}
	rows, e := jsonRows(r.Context(), s.DB, "SELECT id,kind,title,body,created_at FROM notifications WHERE account_id=$1 AND created_at>$2 ORDER BY created_at LIMIT 10", user(r).Account.ID, after)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"notifications": rows, "now": time.Now().UTC().Format(time.RFC3339Nano)})
}
