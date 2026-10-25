package app

import (
	"fmt"
	"net/http"
)

const (
	waitFreeMinutes   = 3
	waitPaisePerMin   = 200
	waitChargeCap     = 10000
	goHomeMinutes     = 90
	goHomePerDay      = 2
	goHomeNearMeters  = 3000
	goHomeCloserMeter = 800
)

// meterSQL is the great-circle distance in metres between two lat/lng SQL expressions.
func meterSQL(lat1, lng1, lat2, lng2 string) string {
	return fmt.Sprintf("6371000*acos(least(1,greatest(-1,sin(radians(%[1]s))*sin(radians(%[3]s))+cos(radians(%[1]s))*cos(radians(%[3]s))*cos(radians(%[2]s-%[4]s)))))", lat1, lng1, lat2, lng2)
}

// goHomeFilter hides rides that lead away from home while a driver's go-home mode is on:
// the drop must be near home or clearly closer to home than the pickup.
var goHomeFilter = fmt.Sprintf(` AND (d.home_until IS NULL OR d.home_until<=now() OR d.home_lat IS NULL OR %[1]s<=%[3]d OR %[1]s<%[2]s-%[4]d)`,
	meterSQL("q.dropoff_lat", "q.dropoff_lng", "d.home_lat", "d.home_lng"),
	meterSQL("q.pickup_lat", "q.pickup_lng", "d.home_lat", "d.home_lng"), goHomeNearMeters, goHomeCloserMeter)

// waitChargeSQL is the fee for rider no-shows past the free window, measured from the "arrived" event.
const waitChargeSQL = `SELECT CASE WHEN r.group_id IS NULL THEN LEAST(` + "10000" + `,GREATEST(0,floor(extract(epoch FROM now()-COALESCE((SELECT max(created_at) FROM audit_events e WHERE e.ride_id=r.id AND e.action='arrived'),now()))/60)::bigint-` + "3" + `)*` + "200" + `) ELSE 0 END FROM rides r WHERE r.id=$1`

func (s *Server) goHome(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Off bool    `json:"off"`
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	}
	if !decode(w, r, &in) {
		return
	}
	ctx, uid := r.Context(), user(r).Account.ID
	if in.Off {
		if _, e := s.DB.Exec(ctx, "UPDATE drivers SET home_until=NULL WHERE user_id=$1", uid); e != nil {
			dbError(w, e)
			return
		}
		write(w, 200, map[string]bool{"ok": true})
		return
	}
	if !(Point{Lat: in.Lat, Lng: in.Lng, Label: "home"}).valid() {
		fail(w, 400, "Choose a valid home location")
		return
	}
	var left int
	e := s.DB.QueryRow(ctx, `UPDATE drivers SET home_lat=$2,home_lng=$3,home_until=now()+make_interval(mins=>$4),
 home_uses=CASE WHEN home_uses_on=(now() AT TIME ZONE 'Asia/Kolkata')::date THEN home_uses+1 ELSE 1 END,
 home_uses_on=(now() AT TIME ZONE 'Asia/Kolkata')::date
 WHERE user_id=$1 AND status='approved' AND (home_until>now() OR home_uses_on IS DISTINCT FROM (now() AT TIME ZONE 'Asia/Kolkata')::date OR home_uses<$5)
 RETURNING $5-home_uses`, uid, in.Lat, in.Lng, goHomeMinutes, goHomePerDay).Scan(&left)
	if e != nil {
		fail(w, 409, fmt.Sprintf("Go-home mode can be used %d times a day, and only by approved drivers", goHomePerDay))
		return
	}
	write(w, 200, map[string]any{"ok": true, "minutes": goHomeMinutes, "uses_left": left})
}

func (s *Server) saveGoal(w http.ResponseWriter, r *http.Request) {
	var in struct {
		GoalPaise int64 `json:"daily_goal_paise"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.GoalPaise < 0 || in.GoalPaise > 10000000 {
		fail(w, 400, "Daily goal must be between ₹0 and ₹1,00,000")
		return
	}
	tag, e := s.DB.Exec(r.Context(), "UPDATE drivers SET daily_goal_paise=$2 WHERE user_id=$1", user(r).Account.ID, in.GoalPaise)
	if e != nil {
		dbError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 404, "Submit a driver application first")
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}
