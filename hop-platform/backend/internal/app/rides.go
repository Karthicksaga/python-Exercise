package app

import (
	"context"
	"crypto/hmac"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const rideSelect = `SELECT r.id,r.status,r.version,r.payment_method,r.payment_status,r.created_at,r.expires_at,r.cancel_reason,
 q.pickup_label,q.dropoff_label,q.pickup_lat,q.pickup_lng,q.dropoff_lat,q.dropoff_lng,q.meters,q.seconds,q.fare_paise,q.area_id,
 r.rider_id=$1::uuid AS mine,r.driver_id=$1::uuid AS driving,
 CASE WHEN r.driver_id IS NOT NULL THEN d.vehicle_number ELSE '' END AS vehicle_number,
 CASE WHEN r.driver_id IS NOT NULL THEN da.name ELSE '' END AS driver_name,
 CASE WHEN r.driver_id IS NOT NULL AND r.rider_id=$1::uuid AND r.payment_method='upi' THEN d.upi_id ELSE '' END AS driver_upi,
 CASE WHEN r.driver_id=$1::uuid THEN ra.name ELSE '' END AS rider_name,
 CASE WHEN r.rider_id=$1::uuid AND r.status IN ('accepted','arrived','in_progress') AND d.location_at>now()-interval '60 seconds' THEN d.lat ELSE NULL END AS driver_lat,
 CASE WHEN r.rider_id=$1::uuid AND r.status IN ('accepted','arrived','in_progress') AND d.location_at>now()-interval '60 seconds' THEN d.lng ELSE NULL END AS driver_lng
 FROM rides r JOIN quotes q ON q.id=r.quote_id JOIN accounts ra ON ra.id=r.rider_id LEFT JOIN drivers d ON d.user_id=r.driver_id LEFT JOIN accounts da ON da.id=r.driver_id`

func (s *Server) state(w http.ResponseWriter, r *http.Request) {
	uid := user(r).Account.ID
	rides, e := jsonRows(r.Context(), s.DB, rideSelect+" WHERE r.rider_id=$1 OR r.driver_id=$1 ORDER BY r.created_at DESC LIMIT 50", uid)
	if e != nil {
		dbError(w, e)
		return
	}
	var list []map[string]any
	if json.Unmarshal(rides, &list) != nil {
		fail(w, 500, "Invalid ride state")
		return
	}
	for _, ride := range list {
		if ride["mine"] == true && (ride["status"] == "accepted" || ride["status"] == "arrived") {
			ride["pickup_code"] = s.pin(ride["id"].(string))
		}
	}
	driver, e := jsonRows(r.Context(), s.DB, `SELECT user_id,area_id,status,vehicle_number,upi_id,license_expires,insurance_expires,review_note,online,location_at FROM drivers WHERE user_id=$1`, uid)
	if e != nil {
		dbError(w, e)
		return
	}
	// The SQL proximity filter is an inexpensive candidate filter; acceptance repeats exact distance validation.
	offers, e := jsonRows(r.Context(), s.DB, `SELECT r.id,r.version,q.pickup_label,q.dropoff_label,q.pickup_lat,q.pickup_lng,q.dropoff_lat,q.dropoff_lng,q.meters,q.seconds,q.fare_paise,r.payment_method,r.expires_at
 FROM rides r JOIN quotes q ON q.id=r.quote_id JOIN areas a ON a.id=q.area_id JOIN drivers d ON d.user_id=$1
 WHERE r.status='requested' AND r.expires_at>now() AND r.rider_id<>$1 AND d.status='approved' AND d.online AND a.active AND d.area_id=q.area_id
 AND d.license_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date AND d.insurance_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date AND d.location_at>now()-interval '60 seconds'
 AND (r.payment_method='cash' OR d.upi_id<>'')
 AND 6371000*acos(least(1,greatest(-1,sin(radians(d.lat))*sin(radians(q.pickup_lat))+cos(radians(d.lat))*cos(radians(q.pickup_lat))*cos(radians(d.lng-q.pickup_lng)))))<=3000
 AND NOT EXISTS(SELECT 1 FROM rides busy WHERE busy.driver_id=d.user_id AND busy.status IN ('accepted','arrived','in_progress'))
 ORDER BY r.created_at LIMIT 20`, uid)
	if e != nil {
		dbError(w, e)
		return
	}
	incidents, e := jsonRows(r.Context(), s.DB, "SELECT id,ride_id,message,status,resolution,created_at FROM incidents WHERE reporter_id=$1 ORDER BY created_at DESC LIMIT 20", uid)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"rides": list, "driver": driver, "offers": offers, "incidents": incidents})
}
func (s *Server) book(w http.ResponseWriter, r *http.Request) {
	uid := user(r).Account.ID
	if !s.limit(w, r, "book:"+uid, 10, 60) {
		return
	}
	var input struct {
		QuoteID    string `json:"quote_id"`
		RequestKey string `json:"request_key"`
		Payment    string `json:"payment_method"`
	}
	if !decode(w, r, &input) {
		return
	}
	if input.Payment != "cash" && input.Payment != "upi" {
		fail(w, 400, "Choose cash or direct UPI")
		return
	}
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	// Lock the rider before checking idempotency so concurrent retried requests have the same result.
	var lock string
	e = tx.QueryRow(ctx, "SELECT id FROM accounts WHERE id=$1 FOR UPDATE", uid).Scan(&lock)
	if e != nil {
		dbError(w, e)
		return
	}
	var existing, oldQuote, oldPayment string
	e = tx.QueryRow(ctx, "SELECT id,quote_id,payment_method FROM rides WHERE rider_id=$1 AND request_key=$2", uid, input.RequestKey).Scan(&existing, &oldQuote, &oldPayment)
	if e == nil {
		if oldQuote != input.QuoteID || oldPayment != input.Payment {
			fail(w, 409, "Request key was already used for a different booking")
			return
		}
		write(w, 200, map[string]string{"id": existing})
		return
	}
	if !errors.Is(e, pgx.ErrNoRows) {
		dbError(w, e)
		return
	}
	// Expiration and its audit event are written atomically before releasing the active-rider constraint.
	if e = expire(ctx, tx, uid); e != nil {
		dbError(w, e)
		return
	}
	var id string
	e = tx.QueryRow(ctx, `INSERT INTO rides(quote_id,rider_id,request_key,payment_method) SELECT q.id,q.rider_id,$3,$4 FROM quotes q JOIN areas a ON a.id=q.area_id WHERE q.id=$1 AND q.rider_id=$2 AND q.expires_at>now() AND a.active RETURNING id`, input.QuoteID, uid, input.RequestKey, input.Payment).Scan(&id)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 409, "Quote expired or service area unavailable; request a fresh quote")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	if e = audit(ctx, tx, uid, id, "requested", map[string]string{"payment_method": input.Payment}); e != nil {
		dbError(w, e)
		return
	}
	if e = tx.Commit(ctx); e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]string{"id": id})
}
func expire(ctx context.Context, tx pgx.Tx, uid string) error {
	_, e := tx.Exec(ctx, `WITH expired AS (UPDATE rides SET status='expired',version=version+1,updated_at=now() WHERE status='requested' AND expires_at<=now() AND ($1='' OR rider_id=NULLIF($1,'')::uuid) RETURNING id) INSERT INTO audit_events(ride_id,action) SELECT id,'expired' FROM expired`, uid)
	return e
}
func (s *Server) Expire(ctx context.Context) error {
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if e = expire(ctx, tx, ""); e != nil {
		return e
	}
	return tx.Commit(ctx)
}
func (s *Server) action(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Action  string `json:"action"`
		Version int    `json:"version"`
		Code    string `json:"code"`
		Reason  string `json:"reason"`
	}
	if !decode(w, r, &input) {
		return
	}
	ctx := r.Context()
	uid := user(r).Account.ID
	id := r.PathValue("id")
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var rider, driver, status, area, payment string
	var version, attempts int
	var expires time.Time
	var pickup Point
	e = tx.QueryRow(ctx, `SELECT r.rider_id,COALESCE(r.driver_id::text,''),r.status,r.version,r.pin_attempts,r.expires_at,q.area_id,q.pickup_lat,q.pickup_lng,r.payment_method FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.id=$1 FOR UPDATE OF r`, id).Scan(&rider, &driver, &status, &version, &attempts, &expires, &area, &pickup.Lat, &pickup.Lng, &payment)
	if e != nil {
		dbError(w, e)
		return
	}
	if input.Action != "accept" && uid != rider && uid != driver {
		fail(w, 403, "This ride does not belong to you")
		return
	}
	if input.Version != version {
		fail(w, 409, "Ride changed; refresh and try again")
		return
	}
	next := ""
	event := input.Action
	switch input.Action {
	case "accept":
		if uid == rider || status != "requested" || time.Now().After(expires) {
			fail(w, 409, "Ride is no longer available")
			return
		}
		var at Point
		var has bool
		e = tx.QueryRow(ctx, `SELECT d.lat,d.lng,(d.status='approved' AND d.online AND d.area_id=$2 AND a.active AND d.location_at>now()-interval '60 seconds' AND d.license_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date AND d.insurance_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date AND ($3='cash' OR d.upi_id<>'')) FROM drivers d JOIN areas a ON a.id=d.area_id WHERE d.user_id=$1 FOR UPDATE OF d`, uid, area, payment).Scan(&at.Lat, &at.Lng, &has)
		if e != nil || !has || distance(at, pickup) > 3000 {
			fail(w, 403, "An approved, nearby driver with fresh location is required")
			return
		}
		var busy bool
		e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM rides WHERE driver_id=$1 AND status IN ('accepted','arrived','in_progress'))", uid).Scan(&busy)
		if e != nil {
			dbError(w, e)
			return
		}
		if busy {
			fail(w, 409, "Finish your active ride first")
			return
		}
		driver = uid
		next = "accepted"
	case "arrive":
		if uid == driver && status == "accepted" {
			next = "arrived"
		}
	case "start":
		if uid != driver || status != "arrived" {
			break
		}
		if attempts >= 5 {
			fail(w, 429, "Pickup code locked after five attempts; cancel and contact support")
			return
		}
		if !hmac.Equal([]byte(input.Code), []byte(s.pin(id))) {
			_, e = tx.Exec(ctx, "UPDATE rides SET pin_attempts=pin_attempts+1 WHERE id=$1", id)
			if e == nil {
				e = audit(ctx, tx, uid, id, "pickup_code_rejected", map[string]int{"attempt": attempts + 1})
			}
			if e == nil {
				e = tx.Commit(ctx)
			}
			if e != nil {
				dbError(w, e)
				return
			}
			fail(w, 400, "Incorrect pickup code")
			return
		}
		next = "in_progress"
	case "complete":
		if uid == driver && status == "in_progress" {
			next = "completed"
		}
	case "cancel":
		if (uid == rider || uid == driver) && (status == "requested" || status == "accepted" || status == "arrived") {
			if len(strings.TrimSpace(input.Reason)) < 3 || len(input.Reason) > 300 {
				fail(w, 400, "Provide a cancellation reason (3–300 characters)")
				return
			}
			next = "cancelled"
		}
	case "payment_received", "payment_disputed":
		if status != "completed" || (input.Action == "payment_received" && uid != driver) || (input.Action == "payment_disputed" && uid != rider) {
			break
		}
		reported := "driver_reported_received"
		if input.Action == "payment_disputed" {
			reported = "rider_disputed"
		}
		tag, err := tx.Exec(ctx, "UPDATE rides SET payment_status=$2,version=version+1,updated_at=now() WHERE id=$1 AND payment_status<>'rider_disputed'", id, reported)
		if err != nil {
			dbError(w, err)
			return
		}
		if tag.RowsAffected() == 0 {
			fail(w, 409, "Payment is disputed; operator review required")
			return
		}
		if e = audit(ctx, tx, uid, id, event, map[string]string{}); e == nil {
			e = tx.Commit(ctx)
		}
		if e != nil {
			dbError(w, e)
			return
		}
		write(w, 200, map[string]bool{"ok": true})
		return
	}
	if next == "" {
		fail(w, 409, "This transition is not allowed")
		return
	}
	_, e = tx.Exec(ctx, "UPDATE rides SET status=$2,driver_id=NULLIF($3,'')::uuid,cancel_reason=$4,version=version+1,updated_at=now() WHERE id=$1", id, next, driver, input.Reason)
	if e == nil {
		e = audit(ctx, tx, uid, id, next, map[string]string{"reason": input.Reason})
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
