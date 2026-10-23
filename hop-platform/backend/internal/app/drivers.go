package app

import (
	"math"
	"net/http"
	"regexp"
	"strings"
	"time"
)

var upiPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{2,128}@[A-Za-z0-9.-]{2,64}$`)

func (s *Server) applyDriver(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Area             string `json:"area_id"`
		Vehicle          string `json:"vehicle_number"`
		UPI              string `json:"upi_id"`
		License          string `json:"license_reference"`
		Insurance        string `json:"insurance_reference"`
		LicenseExpires   string `json:"license_expires"`
		InsuranceExpires string `json:"insurance_expires"`
	}
	if !decode(w, r, &in) {
		return
	}
	if len(in.Vehicle) < 6 || len(in.Vehicle) > 20 || len(in.License) < 5 || len(in.License) > 160 || len(in.Insurance) < 5 || len(in.Insurance) > 160 || (in.UPI != "" && !upiPattern.MatchString(in.UPI)) {
		fail(w, 400, "Complete valid vehicle, verification references and optional UPI ID")
		return
	}
	today := time.Now().UTC().Add(5*time.Hour + 30*time.Minute).Truncate(24 * time.Hour)
	for _, value := range []string{in.LicenseExpires, in.InsuranceExpires} {
		date, e := time.Parse("2006-01-02", value)
		if e != nil || date.Before(today) {
			fail(w, 400, "Driver documents must be unexpired (YYYY-MM-DD)")
			return
		}
	}
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var active bool
	if e = tx.QueryRow(ctx, "SELECT active FROM areas WHERE id=$1", in.Area).Scan(&active); e != nil {
		dbError(w, e)
		return
	}
	if !active {
		fail(w, 400, "This service area is not accepting applications")
		return
	}
	_, e = tx.Exec(ctx, `INSERT INTO drivers(user_id,area_id,vehicle_number,upi_id,license_reference,insurance_reference,license_expires,insurance_expires) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, user(r).Account.ID, in.Area, strings.ToUpper(in.Vehicle), in.UPI, in.License, in.Insurance, in.LicenseExpires, in.InsuranceExpires)
	if e == nil {
		e = audit(ctx, tx, user(r).Account.ID, "", "driver_application", map[string]string{"area": in.Area})
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]string{"status": "pending"})
}
func (s *Server) location(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Lat      float64 `json:"lat"`
		Lng      float64 `json:"lng"`
		Accuracy float64 `json:"accuracy"`
	}
	if !decode(w, r, &in) {
		return
	}
	if math.IsNaN(in.Lat) || math.IsNaN(in.Lng) || in.Accuracy < 1 || in.Accuracy > 100 {
		fail(w, 400, "Location accuracy must be within 100 metres")
		return
	}
	tag, e := s.DB.Exec(r.Context(), `UPDATE drivers d SET lat=$2,lng=$3,accuracy=$4,location_at=now(),online=true,updated_at=now() FROM areas a WHERE d.user_id=$1 AND d.area_id=a.id AND d.status='approved' AND d.license_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date AND d.insurance_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date AND a.active AND $2 BETWEEN a.min_lat AND a.max_lat AND $3 BETWEEN a.min_lng AND a.max_lng`, user(r).Account.ID, in.Lat, in.Lng, in.Accuracy)
	if e != nil {
		dbError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 403, "Approval, valid documents and a location inside your active area are required")
		return
	}
	write(w, 200, map[string]any{"online": true, "fresh_for_seconds": 60})
}
func (s *Server) offline(w http.ResponseWriter, r *http.Request) {
	_, e := s.DB.Exec(r.Context(), "UPDATE drivers SET online=false WHERE user_id=$1", user(r).Account.ID)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"online": false})
}
func (s *Server) incident(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Ride    string `json:"ride_id"`
		Message string `json:"message"`
	}
	if !decode(w, r, &in) {
		return
	}
	if len(strings.TrimSpace(in.Message)) < 5 || len(in.Message) > 2000 {
		fail(w, 400, "Describe the issue in 5–2000 characters")
		return
	}
	ctx := r.Context()
	uid := user(r).Account.ID
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var allowed bool
	e = tx.QueryRow(ctx, "SELECT rider_id=$2 OR COALESCE(driver_id=$2,false) FROM rides WHERE id=$1", in.Ride, uid).Scan(&allowed)
	if e != nil {
		dbError(w, e)
		return
	}
	if !allowed {
		fail(w, 403, "You may only report your own ride")
		return
	}
	var id string
	e = tx.QueryRow(ctx, "INSERT INTO incidents(ride_id,reporter_id,message) VALUES($1,$2,$3) RETURNING id", in.Ride, uid, in.Message).Scan(&id)
	if e == nil {
		e = audit(ctx, tx, uid, in.Ride, "incident_reported", map[string]string{"incident_id": id})
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
