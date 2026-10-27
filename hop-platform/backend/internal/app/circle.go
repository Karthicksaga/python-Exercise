package app

import (
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"net/http"
)

func (s *Server) circleRoutes() map[string]http.HandlerFunc {
	routes := map[string]http.HandlerFunc{
		"GET /api/circle/captains":              s.circleCaptains,
		"POST /api/circle/captains":             s.circleAddCaptain,
		"POST /api/circle/captains/{id}/remove": s.circleRemoveCaptain,
		"GET /api/drivers/circle/preferences":   s.circlePreferences,
		"POST /api/drivers/circle/preferences":  s.saveCirclePreferences,
		"POST /api/drivers/circle/blocks/{id}":  s.circleBlock,
		"GET /api/drivers/circle/invitations":   s.circleInvitations,
	}
	for path, handler := range routes {
		routes[path] = func(w http.ResponseWriter, r *http.Request) {
			if !s.Config.Features.HopCircle {
				fail(w, 404, "Hop Circle is not enabled")
				return
			}
			if r.Method == http.MethodPost && !s.limit(w, r, "circle-write:"+user(r).Account.ID, 30, 60) {
				return
			}
			handler(w, r)
		}
	}
	return routes
}

// All expressions passed here are server constants. Legacy rides and flag-OFF
// dispatch retain their previous predicates. Blocked Circle requests stay hidden
// after fallback; opt-out only removes preferred invitations, not normal work.
func (s *Server) circleEligibility(driver string) string {
	if !s.Config.Features.HopCircle {
		return ""
	}
	return ` AND (NOT r.circle_requested OR (
 NOT EXISTS(SELECT 1 FROM circle_blocks cb WHERE cb.captain_id=` + driver + ` AND cb.rider_id=r.rider_id)
 AND (r.circle_until IS NULL OR r.circle_until<=now() OR EXISTS(
 SELECT 1 FROM favorite_drivers cf JOIN circle_captain_preferences cp ON cp.captain_id=cf.driver_id AND cp.opted_in
 WHERE cf.rider_id=r.rider_id AND cf.driver_id=` + driver + ` AND (r.circle_captain_id IS NULL OR r.circle_captain_id=` + driver + `)))))`
}
func (s *Server) circleOfferFrom() string { return offerFrom + s.circleEligibility("d.user_id") }

func (s *Server) circleCaptains(w http.ResponseWriter, r *http.Request) {
	rows, e := jsonRows(r.Context(), s.DB, `SELECT d.user_id AS id,a.name,d.vehicle_category,d.vehicle_number,
 (d.status='approved' AND COALESCE(cp.opted_in,false) AND NOT EXISTS(SELECT 1 FROM circle_blocks b WHERE b.captain_id=d.user_id AND b.rider_id=$1)) AS accepts_circle,
 (SELECT count(*) FROM rides h WHERE h.rider_id=$1 AND h.driver_id=d.user_id AND h.status='completed') AS rides_together
 FROM favorite_drivers f JOIN drivers d ON d.user_id=f.driver_id JOIN accounts a ON a.id=d.user_id
 LEFT JOIN circle_captain_preferences cp ON cp.captain_id=d.user_id WHERE f.rider_id=$1 ORDER BY f.created_at DESC`, user(r).Account.ID)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"captains": rows})
}
func (s *Server) circlePreferences(w http.ResponseWriter, r *http.Request) {
	uid := user(r).Account.ID
	var opted bool
	e := s.DB.QueryRow(r.Context(), `SELECT COALESCE(cp.opted_in,false) FROM drivers d LEFT JOIN circle_captain_preferences cp ON cp.captain_id=d.user_id WHERE d.user_id=$1`, uid).Scan(&opted)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 403, "A Captain account is required")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	blocks, e := jsonRows(r.Context(), s.DB, `SELECT b.rider_id AS id,split_part(a.name,' ',1) AS name FROM circle_blocks b JOIN accounts a ON a.id=b.rider_id WHERE b.captain_id=$1 ORDER BY b.created_at DESC`, uid)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"opted_in": opted, "blocked_riders": blocks})
}
func (s *Server) saveCirclePreferences(w http.ResponseWriter, r *http.Request) {
	var in struct {
		OptedIn *bool `json:"opted_in"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.OptedIn == nil {
		fail(w, 400, "Choose Circle participation")
		return
	}
	uid := user(r).Account.ID
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	var approved bool
	e = tx.QueryRow(r.Context(), "SELECT status='approved' FROM drivers WHERE user_id=$1 FOR UPDATE", uid).Scan(&approved)
	if errors.Is(e, pgx.ErrNoRows) || e == nil && *in.OptedIn && !approved {
		fail(w, 403, "An approved Captain is required to participate")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	_, e = tx.Exec(r.Context(), `INSERT INTO circle_captain_preferences(captain_id,opted_in) VALUES($1,$2) ON CONFLICT(captain_id) DO UPDATE SET opted_in=$2,updated_at=now()`, uid, *in.OptedIn)
	if e == nil {
		e = audit(r.Context(), tx, uid, "", "circle_participation", map[string]bool{"opted_in": *in.OptedIn})
	}
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}
func (s *Server) circleBlock(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Blocked *bool `json:"blocked"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Blocked == nil {
		fail(w, 400, "Choose whether to block Circle requests")
		return
	}
	uid, rider := user(r).Account.ID, r.PathValue("id")
	var parsed pgtype.UUID
	if parsed.Scan(rider) != nil {
		fail(w, 400, "Invalid rider identifier")
		return
	}
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	var id string
	e = tx.QueryRow(r.Context(), "SELECT user_id FROM drivers WHERE user_id=$1 FOR UPDATE", uid).Scan(&id)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 403, "A Captain account is required")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	var known bool
	e = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM rides WHERE rider_id=$1 AND driver_id=$2 AND status='completed') OR EXISTS(SELECT 1 FROM circle_blocks WHERE rider_id=$1 AND captain_id=$2)`, rider, uid).Scan(&known)
	if e != nil {
		dbError(w, e)
		return
	}
	if !known {
		fail(w, 404, "No eligible Circle relationship")
		return
	}
	if *in.Blocked {
		_, e = tx.Exec(r.Context(), "INSERT INTO circle_blocks(captain_id,rider_id) VALUES($1,$2) ON CONFLICT DO NOTHING", uid, rider)
	} else {
		_, e = tx.Exec(r.Context(), "DELETE FROM circle_blocks WHERE captain_id=$1 AND rider_id=$2", uid, rider)
	}
	if e == nil {
		e = audit(r.Context(), tx, uid, "", "circle_block", map[string]any{"rider_id": rider, "blocked": *in.Blocked})
	}
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}
func (s *Server) circleInvitations(w http.ResponseWriter, r *http.Request) {
	var captain bool
	if e := s.DB.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM drivers WHERE user_id=$1)", user(r).Account.ID).Scan(&captain); e != nil {
		dbError(w, e)
		return
	}
	if !captain {
		fail(w, 403, "A Captain account is required")
		return
	}
	rows, e := jsonRows(r.Context(), s.DB, `SELECT r.id,r.version,r.rider_id,
 (SELECT split_part(name,' ',1) FROM accounts WHERE id=r.rider_id) AS rider_name,q.vehicle_category,
 q.pickup_label,q.dropoff_label,COALESCE(r.offered_fare_paise,q.fare_paise) AS fare_paise,LEAST(r.expires_at,r.circle_until) AS expires_at
 `+s.circleOfferFrom()+` AND r.circle_until>now() AND EXISTS(SELECT 1 FROM ride_offers co WHERE co.ride_id=r.id AND co.driver_id=$1 AND co.circle_invitation) ORDER BY r.created_at LIMIT 20`, user(r).Account.ID)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"invitations": rows})
}

func (s *Server) circleAddCaptain(w http.ResponseWriter, r *http.Request) {
	var in struct {
		RideID string `json:"ride_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	var id pgtype.UUID
	if id.Scan(in.RideID) != nil {
		fail(w, 400, "Invalid completed ride identifier")
		return
	}
	s.addFavoriteDriverForRide(w, r, in.RideID)
}
func (s *Server) circleRemoveCaptain(w http.ResponseWriter, r *http.Request) {
	var id pgtype.UUID
	if id.Scan(r.PathValue("id")) != nil {
		fail(w, 400, "Invalid Captain identifier")
		return
	}
	s.removeFavoriteDriver(w, r)
}
