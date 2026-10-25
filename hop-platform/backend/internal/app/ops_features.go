package app

import (
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
)

// operatorLiveMap returns live driver locations, active trips in progress, and service areas.
func (s *Server) operatorLiveMap(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	ctx := r.Context()
	drivers, e := jsonRows(ctx, s.DB, `SELECT d.user_id, a.name, a.email, d.vehicle_category, d.vehicle_number,
		d.online, d.status, round(d.lat::numeric, 5) AS lat, round(d.lng::numeric, 5) AS lng,
		d.location_at, d.updated_at
		FROM drivers d
		JOIN accounts a ON a.id = d.user_id
		WHERE d.lat IS NOT NULL AND d.lng IS NOT NULL
		ORDER BY d.online DESC, d.location_at DESC NULLS LAST LIMIT 150`)
	if e != nil {
		dbError(w, e)
		return
	}
	rides, e := jsonRows(ctx, s.DB, `SELECT r.id, r.status, r.payment_method, r.payment_status,
		r.created_at, r.updated_at,
		ra.name AS rider_name, COALESCE(da.name, '') AS driver_name,
		COALESCE(d.vehicle_category, 'auto') AS vehicle_category,
		COALESCE(d.vehicle_number, '') AS vehicle_number,
		q.pickup_label, q.dropoff_label,
		round(q.pickup_lat::numeric, 5) AS pickup_lat, round(q.pickup_lng::numeric, 5) AS pickup_lng,
		round(q.dropoff_lat::numeric, 5) AS dropoff_lat, round(q.dropoff_lng::numeric, 5) AS dropoff_lng,
		round(d.lat::numeric, 5) AS driver_lat, round(d.lng::numeric, 5) AS driver_lng,
		q.fare_paise
		FROM rides r
		JOIN quotes q ON q.id = r.quote_id
		JOIN accounts ra ON ra.id = r.rider_id
		LEFT JOIN accounts da ON da.id = r.driver_id
		LEFT JOIN drivers d ON d.user_id = r.driver_id
		WHERE r.status IN ('requested', 'accepted', 'arrived', 'in_progress')
		ORDER BY r.created_at DESC LIMIT 50`)
	if e != nil {
		dbError(w, e)
		return
	}
	areas, e := jsonRows(ctx, s.DB, `SELECT id, name, state, min_lat, max_lat, min_lng, max_lng, active FROM areas ORDER BY name`)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{
		"drivers":      drivers,
		"active_rides": rides,
		"areas":        areas,
	})
}

// operatorCancelRide allows operators to cancel any stuck or disputed active ride with audit tracking.
func (s *Server) operatorCancelRide(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	_ = decode(w, r, &in)
	reason := strings.TrimSpace(in.Reason)
	if reason == "" {
		reason = "Cancelled by operator"
	}
	rideID := r.PathValue("id")
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var rider, driver string
	e = tx.QueryRow(ctx, "UPDATE rides SET status='cancelled', cancel_reason=$2, updated_at=now() WHERE id=$1 AND status IN ('requested','accepted','arrived','in_progress') RETURNING rider_id, COALESCE(driver_id::text,'')", rideID, reason).Scan(&rider, &driver)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 409, "Ride is not in an active state that can be cancelled")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	_ = notify(ctx, tx, rider, "ride", "Ride cancelled by operator", reason)
	if driver != "" {
		_ = notify(ctx, tx, driver, "ride", "Ride cancelled by operator", reason)
	}
	_ = audit(ctx, tx, user(r).Account.ID, rideID, "operator_cancel", map[string]string{"reason": reason})
	if e = tx.Commit(ctx); e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

// operatorSOSEvents lists all safety emergency SOS triggers and their resolutions.
func (s *Server) operatorSOSEvents(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	ctx := r.Context()
	events, e := jsonRows(ctx, s.DB, `SELECT s.id, s.ride_id, s.account_id, round(s.lat::numeric, 5) AS lat, round(s.lng::numeric, 5) AS lng, s.created_at,
		ra.name AS rider_name, ra.email AS rider_email,
		COALESCE(da.name, '') AS driver_name, COALESCE(d.vehicle_number, '') AS vehicle_number,
		r.status AS ride_status, q.pickup_label, q.dropoff_label,
		COALESCE(i.status, 'open') AS incident_status,
		COALESCE(i.message, 'Emergency SOS triggered during trip') AS incident_message,
		COALESCE(i.resolution, '') AS resolution,
		s.incident_id
		FROM sos_events s
		JOIN rides r ON r.id = s.ride_id
		JOIN quotes q ON q.id = r.quote_id
		JOIN accounts ra ON ra.id = s.account_id
		LEFT JOIN accounts da ON da.id = r.driver_id
		LEFT JOIN drivers d ON d.user_id = r.driver_id
		LEFT JOIN incidents i ON i.id = s.incident_id
		ORDER BY s.created_at DESC LIMIT 50`)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"sos_events": events})
}

// operatorResolveSOS resolves or closes an SOS emergency incident with audit trails.
func (s *Server) operatorResolveSOS(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		Resolution string `json:"resolution"`
		Status     string `json:"status"`
	}
	if !decode(w, r, &in) {
		return
	}
	resolution := strings.TrimSpace(in.Resolution)
	if len(resolution) < 3 {
		fail(w, 400, "Please provide a resolution note")
		return
	}
	status := in.Status
	if status == "" {
		status = "closed"
	}
	ctx, uid := r.Context(), user(r).Account.ID
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var incidentID *string
	var rideID string
	e = tx.QueryRow(ctx, "SELECT incident_id, ride_id FROM sos_events WHERE id=$1", r.PathValue("id")).Scan(&incidentID, &rideID)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "SOS event not found")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	if incidentID != nil {
		_, e = tx.Exec(ctx, "UPDATE incidents SET status=$2, resolution=$3, updated_by=$4, updated_at=now() WHERE id=$1", *incidentID, status, resolution, uid)
	} else {
		var newIncID string
		e = tx.QueryRow(ctx, "INSERT INTO incidents(ride_id, reporter_id, message, status, resolution, updated_by) VALUES($1, $2, 'SOS Emergency Resolved', $3, $4, $5) RETURNING id", rideID, uid, status, resolution, uid).Scan(&newIncID)
		if e == nil {
			_, e = tx.Exec(ctx, "UPDATE sos_events SET incident_id=$2 WHERE id=$1", r.PathValue("id"), newIncID)
		}
	}
	if e == nil {
		e = audit(ctx, tx, uid, rideID, "sos_resolved", map[string]string{"sos_id": r.PathValue("id"), "resolution": resolution})
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

// operatorLostItems lists all passenger lost property claims across the platform.
func (s *Server) operatorLostItems(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	ctx := r.Context()
	items, e := jsonRows(ctx, s.DB, `SELECT l.id, l.ride_id, l.reporter_id, l.description, l.status, l.created_at,
		ra.name AS rider_name, ra.email AS rider_email,
		COALESCE(da.name, '') AS driver_name, COALESCE(da.email, '') AS driver_email,
		COALESCE(d.vehicle_number, '') AS vehicle_number,
		q.pickup_label, q.dropoff_label, r.created_at AS ride_date
		FROM lost_items l
		JOIN rides r ON r.id = l.ride_id
		JOIN quotes q ON q.id = r.quote_id
		JOIN accounts ra ON ra.id = l.reporter_id
		LEFT JOIN accounts da ON da.id = r.driver_id
		LEFT JOIN drivers d ON d.user_id = r.driver_id
		ORDER BY l.created_at DESC LIMIT 100`)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"lost_items": items})
}

// operatorUpdateLostItem updates the workflow state of a lost item claim.
func (s *Server) operatorUpdateLostItem(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		Status string `json:"status"` // 'open','driver_contacted','returned','closed'
		Note   string `json:"note"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Status != "open" && in.Status != "driver_contacted" && in.Status != "returned" && in.Status != "closed" {
		fail(w, 400, "Status must be open, driver_contacted, returned, or closed")
		return
	}
	ctx, uid := r.Context(), user(r).Account.ID
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var reporterID, rideID string
	e = tx.QueryRow(ctx, "UPDATE lost_items SET status=$2 WHERE id=$1 RETURNING reporter_id, ride_id", r.PathValue("id"), in.Status).Scan(&reporterID, &rideID)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Lost item claim not found")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	msg := "Status updated to " + in.Status
	if in.Note != "" {
		msg += ": " + in.Note
	}
	_ = notify(ctx, tx, reporterID, "safety", "Lost item report update", msg)
	_ = audit(ctx, tx, uid, rideID, "lost_item_update", map[string]string{"id": r.PathValue("id"), "status": in.Status, "note": in.Note})
	if e = tx.Commit(ctx); e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

// operatorAnalytics computes high-level executive and financial KPIs.
func (s *Server) operatorAnalytics(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	ctx := r.Context()
	var gmvToday, gmvAllTime, commissionAllTime, completedRides, cancelledRides, totalRides int64
	var activeDrivers, totalDrivers, totalRiders int
	_ = s.DB.QueryRow(ctx, `SELECT
		COALESCE((SELECT sum(COALESCE(r.offered_fare_paise, q.fare_paise)) FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.status='completed' AND r.created_at >= CURRENT_DATE), 0),
		COALESCE((SELECT sum(COALESCE(r.offered_fare_paise, q.fare_paise)) FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.status='completed'), 0),
		COALESCE((SELECT sum(COALESCE(r.offered_fare_paise, q.fare_paise) * 20 / 100) FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.status='completed'), 0),
		(SELECT count(*) FROM rides WHERE status='completed'),
		(SELECT count(*) FROM rides WHERE status='cancelled'),
		(SELECT count(*) FROM rides),
		(SELECT count(*) FROM drivers WHERE online AND status='approved'),
		(SELECT count(*) FROM drivers WHERE status='approved'),
		(SELECT count(*) FROM accounts WHERE role='rider')`).
		Scan(&gmvToday, &gmvAllTime, &commissionAllTime, &completedRides, &cancelledRides, &totalRides,
			&activeDrivers, &totalDrivers, &totalRiders)

	paymentStats, _ := jsonRows(ctx, s.DB, `SELECT payment_method, count(*) AS count, COALESCE(sum(COALESCE(r.offered_fare_paise, q.fare_paise)), 0) AS total_paise
		FROM rides r JOIN quotes q ON q.id=r.quote_id
		GROUP BY payment_method`)

	dailyVolume, _ := jsonRows(ctx, s.DB, `SELECT to_char(created_at, 'YYYY-MM-DD') AS day, count(*) AS count,
		count(*) FILTER (WHERE status='completed') AS completed
		FROM rides
		WHERE created_at > now() - interval '14 days'
		GROUP BY 1 ORDER BY 1 ASC`)

	write(w, 200, map[string]any{
		"gmv_today_paise":           gmvToday,
		"gmv_all_time_paise":        gmvAllTime,
		"commission_all_time_paise": commissionAllTime,
		"completed_rides":           completedRides,
		"cancelled_rides":           cancelledRides,
		"total_rides":               totalRides,
		"active_drivers":            activeDrivers,
		"total_drivers":             totalDrivers,
		"total_riders":              totalRiders,
		"payments":                  paymentStats,
		"volume":                    dailyVolume,
	})
}
