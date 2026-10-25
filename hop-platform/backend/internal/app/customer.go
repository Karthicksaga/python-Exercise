package app

import (
	"math"
	"net/http"
	"strings"
	"unicode/utf8"
)

func (s *Server) saveLocation(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Label     string  `json:"label"`
		Kind      string  `json:"kind"`
		Lat       float64 `json:"lat"`
		Lng       float64 `json:"lng"`
		PlaceName string  `json:"place_label"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Label = strings.TrimSpace(in.Label)
	in.PlaceName = strings.TrimSpace(in.PlaceName)
	if utf8.RuneCountInString(in.Label) < 1 || utf8.RuneCountInString(in.Label) > 40 ||
		(in.Kind != "home" && in.Kind != "work" && in.Kind != "favorite") ||
		len(in.PlaceName) < 2 || len(in.PlaceName) > 160 ||
		math.IsNaN(in.Lat) || math.IsInf(in.Lat, 0) || math.IsNaN(in.Lng) || math.IsInf(in.Lng, 0) ||
		in.Lat < 6 || in.Lat > 38 || in.Lng < 68 || in.Lng > 98 {
		fail(w, 400, "Provide a valid saved-place label and location")
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
	var id string
	e = tx.QueryRow(ctx, `INSERT INTO saved_locations(account_id,label,kind,lat,lng,place_label)
 VALUES($1,$2,$3,$4,$5,$6)
 ON CONFLICT(account_id,kind,label) DO UPDATE SET lat=EXCLUDED.lat,lng=EXCLUDED.lng,
 place_label=EXCLUDED.place_label,updated_at=now()
 RETURNING id`, uid, in.Label, in.Kind, in.Lat, in.Lng, in.PlaceName).Scan(&id)
	if e == nil {
		e = audit(ctx, tx, uid, "", "saved_location_updated", map[string]string{"kind": in.Kind})
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]string{"id": id})
}

func (s *Server) deleteLocation(w http.ResponseWriter, r *http.Request) {
	tag, e := s.DB.Exec(r.Context(), "DELETE FROM saved_locations WHERE id=$1 AND account_id=$2", r.PathValue("id"), user(r).Account.ID)
	if e != nil {
		dbError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 404, "Saved location not found")
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

func (s *Server) rateRide(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Score   int    `json:"score"`
		Comment string `json:"comment"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Comment = strings.TrimSpace(in.Comment)
	if in.Score < 1 || in.Score > 5 || utf8.RuneCountInString(in.Comment) > 1000 {
		fail(w, 400, "Rating must be 1–5 stars and feedback at most 1000 characters")
		return
	}
	ctx := r.Context()
	uid := user(r).Account.ID
	rideID := r.PathValue("id")
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var rated string
	e = tx.QueryRow(ctx, `SELECT CASE WHEN r.rider_id=$2 THEN r.driver_id::text ELSE r.rider_id::text END
 FROM rides r WHERE r.id=$1 AND r.status='completed' AND r.driver_id IS NOT NULL AND (r.rider_id=$2 OR r.driver_id=$2)
 FOR UPDATE`, rideID, uid).Scan(&rated)
	if e != nil {
		dbError(w, e)
		return
	}
	if rated == "" {
		fail(w, 409, "A completed ride with another participant is required to leave a rating")
		return
	}
	_, e = tx.Exec(ctx, "INSERT INTO ride_ratings(ride_id,rater_id,rated_id,score,comment) VALUES($1,$2,$3,$4,$5)", rideID, uid, rated, in.Score, in.Comment)
	if e == nil {
		e = audit(ctx, tx, uid, rideID, "ride_rated", map[string]int{"score": in.Score})
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]any{"ride_id": rideID, "score": in.Score})
}
