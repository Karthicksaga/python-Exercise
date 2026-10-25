package app

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ---- Safety score ---------------------------------------------------------------------------------------

// safetyScore blends recent behaviour into 0-100. Driver cancellations after accepting, reported incidents
// and low ratings lower it; it is computed on demand so it never goes stale.
func safetyScore(ctx context.Context, db querier, driver string) (int, map[string]any) {
	var cancels, incidents, rated, trips int
	var avg float64
	db.QueryRow(ctx, `SELECT
 (SELECT count(*) FROM audit_events e JOIN rides r ON r.id=e.ride_id WHERE e.actor_id=$1 AND e.action='cancelled' AND r.driver_id=$1 AND e.created_at>now()-interval '90 days'),
 (SELECT count(*) FROM incidents i JOIN rides r ON r.id=i.ride_id WHERE r.driver_id=$1 AND i.reporter_id<>$1 AND i.created_at>now()-interval '90 days'),
 (SELECT count(*) FROM ride_ratings WHERE rated_id=$1),
 COALESCE((SELECT avg(score)::float8 FROM ride_ratings WHERE rated_id=$1),0),
 (SELECT count(*) FROM rides WHERE driver_id=$1 AND status='completed')`, driver).Scan(&cancels, &incidents, &rated, &avg, &trips)
	score := 100 - 6*cancels - 12*incidents
	if rated >= 3 && avg < 4.5 {
		score -= int((4.5 - avg) * 20)
	}
	score = max(0, min(100, score))
	label := "Excellent"
	switch {
	case score < 60:
		label = "Needs attention"
	case score < 80:
		label = "Good"
	}
	return score, map[string]any{"cancellations": cancels, "incidents": incidents, "ratings": rated, "rating_avg": avg, "completed_trips": trips, "label": label}
}

// ---- Masked calling -------------------------------------------------------------------------------------

// rideCall opens a short-lived masked call session. The other party's real number is never returned.
func (s *Server) rideCall(w http.ResponseWriter, r *http.Request) {
	ctx, uid, id := r.Context(), user(r).Account.ID, r.PathValue("id")
	if !s.limit(w, r, "call:"+uid, 10, 300) {
		return
	}
	var rider, driver, status string
	if e := s.DB.QueryRow(ctx, "SELECT rider_id,COALESCE(driver_id::text,''),status FROM rides WHERE id=$1", id).Scan(&rider, &driver, &status); e != nil || (uid != rider && uid != driver) {
		fail(w, 404, "Ride not found")
		return
	}
	if driver == "" || (status != "accepted" && status != "arrived" && status != "in_progress") {
		fail(w, 409, "Calling is available once a driver is assigned and until the trip ends")
		return
	}
	if !s.Config.Development {
		fail(w, 503, "Masked calling is not configured")
		return
	}
	callee := driver
	if uid == driver {
		callee = rider
	}
	masked := fmt.Sprintf("+91 80%03d %05d", rand.IntN(1000), rand.IntN(100000))
	expires := time.Now().Add(10 * time.Minute)
	if _, e := s.DB.Exec(ctx, "INSERT INTO call_sessions(ride_id,caller_id,callee_id,masked_number,simulated,expires_at) VALUES($1,$2,$3,$4,true,$5)", id, uid, callee, masked, expires); e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]any{"masked_number": masked, "expires_at": expires, "simulated": true})
}

// ---- Operator finance -----------------------------------------------------------------------------------

func (s *Server) operatorFinance(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	ctx := r.Context()
	out := map[string]any{}
	queries := map[string]string{
		"promos":       `SELECT p.*,(SELECT count(*) FROM promo_redemptions x WHERE x.code=p.code) AS redemptions FROM promo_codes p ORDER BY created_at DESC LIMIT 100`,
		"peak_windows": `SELECT w.id,w.area_id,a.name AS area,w.label,w.days,to_char(w.start_time,'HH24:MI') AS start_time,to_char(w.end_time,'HH24:MI') AS end_time,w.multiplier::float8,w.active FROM peak_windows w JOIN areas a ON a.id=w.area_id ORDER BY a.name,w.start_time`,
		"surges":       `SELECT o.id,o.area_id,a.name AS area,o.category,o.multiplier::float8,o.reason,o.starts_at,o.ends_at FROM surge_overrides o JOIN areas a ON a.id=o.area_id WHERE o.ends_at>now() ORDER BY o.ends_at`,
		"payouts":      `SELECT p.id,p.driver_id,a.name,p.amount_paise,p.upi_id,p.status,p.reference,p.note,p.requested_at,p.processed_at FROM driver_payouts p JOIN accounts a ON a.id=p.driver_id ORDER BY (p.status='requested') DESC,p.requested_at DESC LIMIT 100`,
		"refunds":      `SELECT f.id,f.ride_id,a.name AS rider,f.amount_paise,f.reason,f.created_at FROM refunds f JOIN accounts a ON a.id=f.rider_id ORDER BY f.created_at DESC LIMIT 50`,
		"area_surge":   `SELECT id,name,surge_cap::float8,surge_auto FROM areas ORDER BY name`,
	}
	for key, q := range queries {
		rows, e := jsonRows(ctx, s.DB, q)
		if e != nil {
			dbError(w, e)
			return
		}
		out[key] = rows
	}
	var liability, platformFunded, refunded, walletHeld int64
	s.DB.QueryRow(ctx, `SELECT
 COALESCE((SELECT sum(amount_paise) FROM driver_ledger),0),
 COALESCE((SELECT sum(amount_paise) FROM driver_ledger WHERE kind='promo_subsidy'),0),
 COALESCE((SELECT sum(amount_paise) FROM refunds),0),
 COALESCE((SELECT sum(amount_paise) FROM wallet_entries),0)`).Scan(&liability, &platformFunded, &refunded, &walletHeld)
	out["totals"] = map[string]int64{"driver_liability_paise": liability, "promo_funded_paise": platformFunded, "refunded_paise": refunded, "wallet_held_paise": walletHeld}
	rows, e := s.DB.Query(ctx, "SELECT user_id::text FROM drivers WHERE status='approved' ORDER BY updated_at DESC LIMIT 50")
	if e != nil {
		dbError(w, e)
		return
	}
	var ids []string
	for rows.Next() {
		var id string
		rows.Scan(&id)
		ids = append(ids, id)
	}
	rows.Close()
	safety := []map[string]any{}
	for _, id := range ids {
		var name string
		s.DB.QueryRow(ctx, "SELECT name FROM accounts WHERE id=$1", id).Scan(&name)
		score, f := safetyScore(ctx, s.DB, id)
		f["driver_id"], f["name"], f["score"] = id, name, score
		safety = append(safety, f)
	}
	out["driver_safety"] = safety
	write(w, 200, out)
}

var promoCodeRE = regexp.MustCompile(`^[A-Z0-9]{3,20}$`)

func (s *Server) operatorSavePromo(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		Code        string  `json:"code"`
		Description string  `json:"description"`
		Kind        string  `json:"kind"`
		Value       int     `json:"value"`
		MaxDiscount int64   `json:"max_discount_paise"`
		MinFare     int64   `json:"min_fare_paise"`
		MaxUses     int     `json:"max_uses"`
		PerUser     int     `json:"per_user_limit"`
		AreaID      string  `json:"area_id"`
		Days        float64 `json:"valid_days"`
		Listed      bool    `json:"listed"`
		Active      bool    `json:"active"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Code = strings.ToUpper(strings.TrimSpace(in.Code))
	if !promoCodeRE.MatchString(in.Code) || (in.Kind != "percent" && in.Kind != "flat") || in.Value <= 0 ||
		(in.Kind == "percent" && in.Value > 100) || in.MaxDiscount < 0 || in.MinFare < 0 || in.MaxUses < 0 || in.PerUser < 1 || len(in.Description) > 200 || in.Days < 0 || in.Days > 730 {
		fail(w, 400, "Invalid promo: code 3-20 letters/digits, percent 1-100 or flat paise, per-user limit at least 1")
		return
	}
	ctx := r.Context()
	if in.Days == 0 {
		in.Days = 90
	}
	_, e := s.DB.Exec(ctx, `INSERT INTO promo_codes(code,description,kind,value,max_discount_paise,min_fare_paise,max_uses,per_user_limit,area_id,valid_to,listed,active)
 VALUES($1,$2,$3,$4,$5,$6,NULLIF($7,0),$8,NULLIF($9,'')::uuid,now()+make_interval(secs=>$10::float8*86400),$11,$12)
 ON CONFLICT (code) DO UPDATE SET description=$2,kind=$3,value=$4,max_discount_paise=$5,min_fare_paise=$6,max_uses=NULLIF($7,0),per_user_limit=$8,area_id=NULLIF($9,'')::uuid,
  valid_from=now(),valid_to=now()+make_interval(secs=>$10::float8*86400),listed=$11,active=$12`,
		in.Code, in.Description, in.Kind, in.Value, in.MaxDiscount, in.MinFare, in.MaxUses, in.PerUser, in.AreaID, in.Days, in.Listed, in.Active)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

func (s *Server) operatorSavePeak(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		AreaID     string  `json:"area_id"`
		Label      string  `json:"label"`
		Days       []int16 `json:"days"`
		Start      string  `json:"start_time"`
		End        string  `json:"end_time"`
		Multiplier float64 `json:"multiplier"`
	}
	if !decode(w, r, &in) {
		return
	}
	label, ok := cleanText(in.Label, 2, 60)
	if !ok || len(in.Days) == 0 || len(in.Days) > 7 || in.Multiplier <= 1 || in.Multiplier > 3 || in.Start >= in.End {
		fail(w, 400, "Provide a label, days, a start before the end, and a multiplier above 1.0 up to 3.0")
		return
	}
	for _, d := range in.Days {
		if d < 1 || d > 7 {
			fail(w, 400, "Days must be 1 (Mon) to 7 (Sun)")
			return
		}
	}
	if _, e := s.DB.Exec(r.Context(), "INSERT INTO peak_windows(area_id,label,days,start_time,end_time,multiplier) VALUES($1,$2,$3,$4::time,$5::time,$6)", in.AreaID, label, in.Days, in.Start, in.End, in.Multiplier); e != nil {
		fail(w, 400, "Could not save the peak window; check the area and times")
		return
	}
	write(w, 201, map[string]bool{"ok": true})
}

func (s *Server) operatorDeleteRow(table string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !operator(w, r) {
			return
		}
		if _, e := s.DB.Exec(r.Context(), "DELETE FROM "+table+" WHERE id=$1", r.PathValue("id")); e != nil {
			fail(w, 400, "Could not delete")
			return
		}
		write(w, 200, map[string]bool{"ok": true})
	}
}

func (s *Server) operatorSaveSurge(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		AreaID     string  `json:"area_id"`
		Category   string  `json:"category"`
		Multiplier float64 `json:"multiplier"`
		Reason     string  `json:"reason"`
		Minutes    int     `json:"minutes"`
	}
	if !decode(w, r, &in) {
		return
	}
	reason, ok := cleanText(in.Reason, 3, 200)
	if !ok || in.Multiplier < 1 || in.Multiplier > 3 || in.Minutes < 5 || in.Minutes > 24*60 {
		fail(w, 400, "Provide a reason, a multiplier from 1.0 to 3.0 and a duration of 5 minutes to 24 hours")
		return
	}
	if _, e := s.DB.Exec(r.Context(), "INSERT INTO surge_overrides(area_id,category,multiplier,reason,ends_at,created_by) VALUES($1,NULLIF($2,''),$3,$4,now()+make_interval(mins=>$5),$6)", in.AreaID, in.Category, in.Multiplier, reason, in.Minutes, user(r).Account.ID); e != nil {
		fail(w, 400, "Could not save the surge override; check the area")
		return
	}
	write(w, 201, map[string]bool{"ok": true})
}

func (s *Server) operatorAreaSurge(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		Cap  float64 `json:"surge_cap"`
		Auto bool    `json:"surge_auto"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Cap < 1 || in.Cap > 3 {
		fail(w, 400, "Surge cap must be between 1.0 and 3.0")
		return
	}
	if _, e := s.DB.Exec(r.Context(), "UPDATE areas SET surge_cap=$2,surge_auto=$3 WHERE id=$1", r.PathValue("id"), in.Cap, in.Auto); e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

// operatorPayout marks a requested payout paid (with the bank/UPI reference) or rejects it, returning the funds.
func (s *Server) operatorPayout(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		Decision  string `json:"decision"`
		Reference string `json:"reference"`
		Note      string `json:"note"`
	}
	if !decode(w, r, &in) {
		return
	}
	if (in.Decision != "paid" && in.Decision != "rejected") || (in.Decision == "paid" && len(strings.TrimSpace(in.Reference)) < 4) || (in.Decision == "rejected" && len(strings.TrimSpace(in.Note)) < 3) || len(in.Reference) > 80 || len(in.Note) > 300 {
		fail(w, 400, "Paid payouts need a payment reference; rejected ones need a note")
		return
	}
	ctx, uid := r.Context(), user(r).Account.ID
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var driver string
	var amount int64
	e = tx.QueryRow(ctx, "UPDATE driver_payouts SET status=$2,reference=$3,note=$4,processed_at=now(),processed_by=$5 WHERE id=$1 AND status='requested' RETURNING driver_id,amount_paise",
		r.PathValue("id"), in.Decision, strings.TrimSpace(in.Reference), strings.TrimSpace(in.Note), uid).Scan(&driver, &amount)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 409, "That payout is not awaiting a decision")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	title, body := "Payout sent", "₹"+rupees(amount)+" was sent to your UPI. Reference "+strings.TrimSpace(in.Reference)
	if in.Decision == "rejected" {
		if _, e = tx.Exec(ctx, "INSERT INTO driver_ledger(driver_id,kind,amount_paise,note) VALUES($1,'adjustment',$2,'Payout rejected - funds returned')", driver, amount); e != nil {
			dbError(w, e)
			return
		}
		title, body = "Payout rejected", strings.TrimSpace(in.Note)
	}
	if e = notify(ctx, tx, driver, "payment", title, body); e == nil {
		e = audit(ctx, tx, uid, "", "payout_"+in.Decision, map[string]any{"payout": r.PathValue("id"), "amount_paise": amount})
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

// operatorRefund credits a rider's wallet for a completed ride, capped by what the ride cost.
func (s *Server) operatorRefund(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		RideID      string `json:"ride_id"`
		AmountPaise int64  `json:"amount_paise"`
		Reason      string `json:"reason"`
		Clawback    bool   `json:"clawback_driver"`
	}
	if !decode(w, r, &in) {
		return
	}
	reason, ok := cleanText(in.Reason, 3, 300)
	if !ok || in.AmountPaise <= 0 {
		fail(w, 400, "Provide a refund amount and a reason")
		return
	}
	ctx, uid := r.Context(), user(r).Account.ID
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var rider, driver, status string
	var payable, refunded int64
	e = tx.QueryRow(ctx, `SELECT r.rider_id,COALESCE(r.driver_id::text,''),r.status,GREATEST(0,COALESCE(r.offered_fare_paise,q.fare_paise)-q.discount_paise),
 COALESCE((SELECT sum(amount_paise) FROM refunds WHERE ride_id=r.id),0) FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.id=$1 FOR UPDATE OF r`, in.RideID).Scan(&rider, &driver, &status, &payable, &refunded)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Ride not found")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	if status != "completed" {
		fail(w, 409, "Only completed rides can be refunded")
		return
	}
	if in.AmountPaise > payable-refunded {
		fail(w, 409, "Refund exceeds what the rider paid for this ride (₹"+rupees(payable-refunded)+" refundable)")
		return
	}
	var refundID string
	if e = tx.QueryRow(ctx, "INSERT INTO refunds(ride_id,rider_id,amount_paise,reason,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id", in.RideID, rider, in.AmountPaise, reason, uid).Scan(&refundID); e == nil {
		e = walletCredit(ctx, tx, rider, in.AmountPaise, "refund", in.RideID, "Refund: "+reason, "refund:"+refundID)
	}
	if e == nil && in.Clawback && driver != "" {
		_, e = tx.Exec(ctx, "INSERT INTO driver_ledger(driver_id,ride_id,kind,amount_paise,note) VALUES($1,$2,'adjustment',$3,$4) ON CONFLICT DO NOTHING", driver, in.RideID, -in.AmountPaise, "Refund claw-back: "+reason)
	}
	if e == nil {
		e = notify(ctx, tx, rider, "payment", "Refund issued", "₹"+rupees(in.AmountPaise)+" was added to your wallet. "+reason)
	}
	if e == nil {
		e = audit(ctx, tx, uid, in.RideID, "refund", map[string]any{"amount_paise": in.AmountPaise, "clawback": in.Clawback})
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		fail(w, 409, "Could not issue the refund; a claw-back may already exist for this ride")
		return
	}
	write(w, 201, map[string]bool{"ok": true})
}

// operatorRides searches rides by id prefix, rider/driver name, phone-free email, or status.
func (s *Server) operatorRides(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) > 60 {
		q = q[:60]
	}
	rows, e := jsonRows(r.Context(), s.DB, `SELECT r.id,r.status,r.payment_method,r.payment_status,r.created_at,ra.name AS rider,COALESCE(da.name,'') AS driver,
 q.pickup_label,q.dropoff_label,q.fare_paise,q.discount_paise,GREATEST(0,COALESCE(r.offered_fare_paise,q.fare_paise)-q.discount_paise) AS payable_paise,
 COALESCE((SELECT sum(amount_paise) FROM refunds WHERE ride_id=r.id),0) AS refunded_paise
 FROM rides r JOIN quotes q ON q.id=r.quote_id JOIN accounts ra ON ra.id=r.rider_id LEFT JOIN accounts da ON da.id=r.driver_id
 WHERE $1='' OR r.id::text LIKE $1||'%' OR ra.name ILIKE '%'||$1||'%' OR da.name ILIKE '%'||$1||'%' OR ra.email ILIKE '%'||$1||'%' OR r.status=lower($1)
 ORDER BY r.created_at DESC LIMIT 30`, q)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"rides": rows})
}
