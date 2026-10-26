package app

import (
	"github.com/jackc/pgx/v5/pgconn"
	"net/http"
	"strings"
)

func (s *Server) operatorState(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	ctx := r.Context()
	areas, e := jsonRows(ctx, s.DB, "SELECT * FROM areas ORDER BY state,name")
	if e != nil {
		dbError(w, e)
		return
	}
	pricing, e := jsonRows(ctx, s.DB, `SELECT area_id,category,base_paise,per_km_paise,minimum_paise,pricing_version,enabled FROM area_vehicle_pricing ORDER BY area_id,category`)
	if e != nil {
		dbError(w, e)
		return
	}
	drivers, e := jsonRows(ctx, s.DB, `SELECT d.user_id,d.area_id,d.status,d.vehicle_category,d.vehicle_number,d.license_reference,d.insurance_reference,d.license_expires,d.insurance_expires,d.review_note,a.name,a.email FROM drivers d JOIN accounts a ON a.id=d.user_id ORDER BY d.updated_at DESC LIMIT 100`)
	if e != nil {
		dbError(w, e)
		return
	}
	vehicleChanges, e := jsonRows(ctx, s.DB, `SELECT v.id,v.driver_id,a.name,d.vehicle_category AS current_category,d.vehicle_number AS current_number,v.vehicle_category,v.vehicle_number,v.created_at FROM vehicle_change_requests v JOIN drivers d ON d.user_id=v.driver_id JOIN accounts a ON a.id=v.driver_id WHERE v.status='pending' ORDER BY v.created_at`)
	if e != nil {
		dbError(w, e)
		return
	}
	incidents, e := jsonRows(ctx, s.DB, "SELECT id,ride_id,reporter_id,message,status,resolution,created_at FROM incidents ORDER BY created_at DESC LIMIT 100")
	if e != nil {
		dbError(w, e)
		return
	}
	events, e := jsonRows(ctx, s.DB, "SELECT id,actor_id,ride_id,action,detail,created_at FROM audit_events ORDER BY id DESC LIMIT 100")
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"areas": areas, "pricing": pricing, "drivers": drivers, "vehicle_changes": vehicleChanges, "incidents": incidents, "events": events})
}
func (s *Server) saveArea(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var a Area
	if !decode(w, r, &a) {
		return
	}
	if len(strings.TrimSpace(a.Name)) < 2 || len(a.Name) > 100 || len(a.State) < 2 || len(a.State) > 100 || a.Base < 0 || a.Base > 100000 || a.PerKM <= 0 || a.PerKM > 10000 || a.Minimum <= 0 || a.Minimum > 100000 || len(a.Approval) > 500 {
		fail(w, 400, "Invalid area or fare settings")
		return
	}
	if a.Active && len(strings.TrimSpace(a.Approval)) < 6 {
		fail(w, 400, "Activation requires an operator review reference")
		return
	}
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	if a.ID == "" {
		e = tx.QueryRow(ctx, `INSERT INTO areas(name,state,min_lat,max_lat,min_lng,max_lng,base_paise,per_km_paise,minimum_paise,active,approval_reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, a.Name, a.State, a.MinLat, a.MaxLat, a.MinLng, a.MaxLng, a.Base, a.PerKM, a.Minimum, a.Active, a.Approval).Scan(&a.ID)
	} else {
		var tag pgconn.CommandTag
		tag, e = tx.Exec(ctx, `UPDATE areas SET name=$2,state=$3,min_lat=$4,max_lat=$5,min_lng=$6,max_lng=$7,base_paise=$8,per_km_paise=$9,minimum_paise=$10,active=$11,approval_reference=$12,pricing_version=pricing_version+1 WHERE id=$1`, a.ID, a.Name, a.State, a.MinLat, a.MaxLat, a.MinLng, a.MaxLng, a.Base, a.PerKM, a.Minimum, a.Active, a.Approval)
		if e == nil && tag.RowsAffected() == 0 {
			fail(w, 404, "Area not found")
			return
		}
	}
	if e == nil {
		_, e = tx.Exec(ctx, `INSERT INTO area_vehicle_pricing(area_id,category,base_paise,per_km_paise,minimum_paise,enabled)
 VALUES($1,'bike',$2,$3,$4,$5)
 ON CONFLICT(area_id,category) DO UPDATE SET base_paise=EXCLUDED.base_paise,per_km_paise=EXCLUDED.per_km_paise,
 minimum_paise=EXCLUDED.minimum_paise,enabled=EXCLUDED.enabled,pricing_version=area_vehicle_pricing.pricing_version+1,updated_at=now()`,
			a.ID, a.Base, a.PerKM, a.Minimum, a.Active)
	}
	if e == nil {
		e = audit(ctx, tx, user(r).Account.ID, "", "area_updated", a)
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]string{"id": a.ID})
}

func (s *Server) saveVehiclePricing(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		AreaID   string `json:"area_id"`
		Category string `json:"category"`
		Base     int64  `json:"base_paise"`
		PerKM    int64  `json:"per_km_paise"`
		Minimum  int64  `json:"minimum_paise"`
		Enabled  bool   `json:"enabled"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !validVehicleCategory(in.Category) || in.Category == "bike" || in.Base < 0 || in.Base > 100000 || in.PerKM <= 0 || in.PerKM > 10000 || in.Minimum <= 0 || in.Minimum > 100000 {
		fail(w, 400, "Invalid non-bike category or fare settings")
		return
	}
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var areaActive bool
	e = tx.QueryRow(ctx, "SELECT active FROM areas WHERE id=$1 FOR UPDATE", in.AreaID).Scan(&areaActive)
	if e != nil {
		dbError(w, e)
		return
	}
	if in.Enabled && !areaActive {
		fail(w, 409, "Activate the service area before enabling vehicle bookings")
		return
	}
	_, e = tx.Exec(ctx, `INSERT INTO area_vehicle_pricing(area_id,category,base_paise,per_km_paise,minimum_paise,enabled)
 VALUES($1,$2,$3,$4,$5,$6)
 ON CONFLICT(area_id,category) DO UPDATE SET base_paise=EXCLUDED.base_paise,per_km_paise=EXCLUDED.per_km_paise,
 minimum_paise=EXCLUDED.minimum_paise,enabled=EXCLUDED.enabled,pricing_version=area_vehicle_pricing.pricing_version+1,updated_at=now()`,
		in.AreaID, in.Category, in.Base, in.PerKM, in.Minimum, in.Enabled)
	if e == nil {
		e = audit(ctx, tx, user(r).Account.ID, "", "vehicle_pricing_updated", in)
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
func (s *Server) reviewDriver(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	if !decode(w, r, &in) {
		return
	}
	if (in.Status != "approved" && in.Status != "suspended") || len(strings.TrimSpace(in.Note)) < 10 || len(in.Note) > 1000 {
		fail(w, 400, "Provide status and a review note of 10–1000 characters")
		return
	}
	if r.PathValue("id") == user(r).Account.ID {
		fail(w, 403, "An operator cannot approve their own driver application")
		return
	}
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	if e = lockJourney(ctx, tx, r.PathValue("id")); e != nil {
		dbError(w, e)
		return
	}
	if in.Status == "approved" {
		var ok bool
		_ = tx.QueryRow(ctx, "SELECT COALESCE((SELECT identity_ok AND license_ok AND rc_ok AND insurance_ok AND vehicle_ok AND police_ok FROM driver_verifications WHERE driver_id=$1),false)", r.PathValue("id")).Scan(&ok)
		var ready bool
		err := tx.QueryRow(ctx, `SELECT onboarding_version=0 OR EXISTS(SELECT 1 FROM profile_photos WHERE account_id=$1 AND approved) FROM drivers WHERE user_id=$1`, r.PathValue("id")).Scan(&ready)
		if err != nil {
			dbError(w, err)
			return
		}
		if !ok || !ready || !hasMobile(ctx, tx, r.PathValue("id")) {
			fail(w, 400, "Complete the verification checklist in the admin console first")
			return
		}
	}
	tag, e := tx.Exec(ctx, `UPDATE drivers SET status=$2,online=false,review_note=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now() WHERE user_id=$1 AND ($2='suspended' OR (license_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date AND insurance_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date))`, r.PathValue("id"), in.Status, in.Note, user(r).Account.ID)
	if e != nil {
		dbError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 400, "Driver is missing or documents have expired")
		return
	}
	if e = audit(ctx, tx, user(r).Account.ID, "", "driver_reviewed", map[string]string{"driver_id": r.PathValue("id"), "status": in.Status, "note": in.Note}); e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}
func (s *Server) reviewIncident(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		Status     string `json:"status"`
		Resolution string `json:"resolution"`
	}
	if !decode(w, r, &in) {
		return
	}
	if (in.Status != "reviewing" && in.Status != "closed") || len(strings.TrimSpace(in.Resolution)) < 5 || len(in.Resolution) > 2000 {
		fail(w, 400, "Choose a status and provide a resolution note")
		return
	}
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var ride string
	e = tx.QueryRow(ctx, "UPDATE incidents SET status=$2,resolution=$3,updated_by=$4,updated_at=now() WHERE id=$1 RETURNING ride_id", r.PathValue("id"), in.Status, in.Resolution, user(r).Account.ID).Scan(&ride)
	if e == nil {
		e = audit(ctx, tx, user(r).Account.ID, ride, "incident_reviewed", map[string]string{"id": r.PathValue("id"), "status": in.Status})
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
