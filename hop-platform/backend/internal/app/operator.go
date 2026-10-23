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
	drivers, e := jsonRows(ctx, s.DB, `SELECT d.user_id,d.area_id,d.status,d.vehicle_number,d.license_reference,d.insurance_reference,d.license_expires,d.insurance_expires,d.review_note,a.name,a.email FROM drivers d JOIN accounts a ON a.id=d.user_id ORDER BY d.updated_at DESC LIMIT 100`)
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
	write(w, 200, map[string]any{"areas": areas, "drivers": drivers, "incidents": incidents, "events": events})
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
