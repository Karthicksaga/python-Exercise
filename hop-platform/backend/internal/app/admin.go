package app

import (
	"net/http"
	"strings"
)

// Operator console: review driver/vehicle documents, then enable the driver and optionally certify them for pink rides.

func (s *Server) adminDrivers(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	rows, e := jsonRows(r.Context(), s.DB, `SELECT d.user_id AS id,a.name,a.email,COALESCE(p.phone,'') AS phone,COALESCE(p.gender,'') AS gender,
 d.status,d.online,ar.name AS area,d.vehicle_category,d.vehicle_number,d.license_reference,d.insurance_reference,d.license_expires,d.insurance_expires,
 d.license_expires<(now() AT TIME ZONE 'Asia/Kolkata')::date OR d.insurance_expires<(now() AT TIME ZONE 'Asia/Kolkata')::date AS docs_expired,
 d.review_note,d.pink_certified,d.updated_at,
 COALESCE(v.identity_ok,false) AS identity_ok,COALESCE(v.license_ok,false) AS license_ok,COALESCE(v.rc_ok,false) AS rc_ok,
 COALESCE(v.insurance_ok,false) AS insurance_ok,COALESCE(v.vehicle_ok,false) AS vehicle_ok,COALESCE(v.police_ok,false) AS police_ok,
 (SELECT count(*) FROM rides WHERE driver_id=d.user_id AND status='completed') AS trips
 FROM drivers d JOIN accounts a ON a.id=d.user_id JOIN areas ar ON ar.id=d.area_id
 LEFT JOIN account_profiles p ON p.account_id=d.user_id LEFT JOIN driver_verifications v ON v.driver_id=d.user_id
 ORDER BY (d.status='pending') DESC,d.updated_at DESC LIMIT 300`)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"drivers": rows})
}

func (s *Server) adminDecision(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	var in struct {
		Identity  bool   `json:"identity_ok"`
		License   bool   `json:"license_ok"`
		RC        bool   `json:"rc_ok"`
		Insurance bool   `json:"insurance_ok"`
		Vehicle   bool   `json:"vehicle_ok"`
		Police    bool   `json:"police_ok"`
		Pink      bool   `json:"pink_certified"`
		Status    string `json:"status"`
		Note      string `json:"note"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Note = strings.TrimSpace(in.Note)
	id := r.PathValue("id")
	if id == user(r).Account.ID {
		fail(w, 403, "An operator cannot verify their own driver application")
		return
	}
	if in.Status != "" && in.Status != "approved" && in.Status != "suspended" && in.Status != "pending" {
		fail(w, 400, "Status must be approved, suspended or pending")
		return
	}
	if in.Status != "" && (len(in.Note) < 10 || len(in.Note) > 1000) {
		fail(w, 400, "Add a review note of 10–1000 characters")
		return
	}
	complete := in.Identity && in.License && in.RC && in.Insurance && in.Vehicle && in.Police
	if in.Status == "approved" && !complete {
		fail(w, 400, "Tick every verification check before enabling the driver")
		return
	}
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var status, gender string
	var expired bool
	e = tx.QueryRow(ctx, `SELECT d.status,COALESCE(p.gender,''),
 d.license_expires<(now() AT TIME ZONE 'Asia/Kolkata')::date OR d.insurance_expires<(now() AT TIME ZONE 'Asia/Kolkata')::date
 FROM drivers d LEFT JOIN account_profiles p ON p.account_id=d.user_id WHERE d.user_id=$1 FOR UPDATE OF d`, id).Scan(&status, &gender, &expired)
	if e != nil {
		dbError(w, e)
		return
	}
	next := status
	if in.Status != "" {
		next = in.Status
	}
	if next == "approved" && expired {
		fail(w, 400, "Driver documents have expired")
		return
	}
	if in.Pink && gender != "female" {
		fail(w, 400, "Pink certification needs the driver's profile gender to be female and verified against their ID")
		return
	}
	if in.Pink && next != "approved" {
		fail(w, 400, "Enable the driver before certifying for pink rides")
		return
	}
	_, e = tx.Exec(ctx, `INSERT INTO driver_verifications(driver_id,identity_ok,license_ok,rc_ok,insurance_ok,vehicle_ok,police_ok,verified_by)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(driver_id) DO UPDATE SET identity_ok=$2,license_ok=$3,rc_ok=$4,insurance_ok=$5,vehicle_ok=$6,police_ok=$7,verified_by=$8,updated_at=now()`,
		id, in.Identity, in.License, in.RC, in.Insurance, in.Vehicle, in.Police, user(r).Account.ID)
	if e == nil {
		_, e = tx.Exec(ctx, `UPDATE drivers SET status=$2,pink_certified=$3,online=online AND $2='approved',
 review_note=CASE WHEN $4<>'' THEN $4 ELSE review_note END,reviewed_by=$5,reviewed_at=now(),updated_at=now() WHERE user_id=$1`,
			id, next, in.Pink && next == "approved", in.Note, user(r).Account.ID)
	}
	if e == nil {
		e = audit(ctx, tx, user(r).Account.ID, "", "driver_verified", map[string]any{"driver_id": id, "status": next, "pink": in.Pink, "complete": complete})
	}
	if e == nil && next != status {
		title, body := "Account "+next, in.Note
		if next == "approved" {
			title, body = "You're approved to drive", "Your documents and vehicle were verified. Go online to receive rides."
		}
		e = notify(ctx, tx, id, "vehicle", title, body)
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
