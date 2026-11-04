package app

import (
	"net/http"
	"strconv"
)

// dispatchReport shows how well captain matching works over the last N days (default 7, max 90),
// optionally for one zone: how many requests found a captain, how long that took, how offers
// ended, where travel times came from, and how often a finishing captain took the next ride.
func (s *Server) dispatchReport(w http.ResponseWriter, r *http.Request) {
	if !operator(w, r) {
		return
	}
	days, e := strconv.Atoi(r.URL.Query().Get("days"))
	if e != nil || days < 1 {
		days = 7
	}
	days = min(days, 90)
	area := r.URL.Query().Get("area_id")
	if area != "" && !uuidPattern.MatchString(area) {
		fail(w, 400, "Invalid area")
		return
	}
	report, e := jsonRows(r.Context(), s.DB, `WITH req AS (
  SELECT r.id, r.status, r.created_at,
   (SELECT min(a.created_at) FROM audit_events a WHERE a.ride_id=r.id AND a.action='accepted') AS accepted_at,
   EXISTS(SELECT 1 FROM audit_events a WHERE a.ride_id=r.id AND a.action='accepted' AND a.detail->>'next_ride'='true') AS via_next
  FROM rides r JOIN quotes q ON q.id=r.quote_id
  WHERE r.created_at>now()-make_interval(days=>$1) AND ($2='' OR q.area_id=$2::uuid)),
 off AS (SELECT o.* FROM ride_offers o JOIN req ON req.id=o.ride_id)
SELECT
 (SELECT count(*) FROM req) AS requests,
 (SELECT count(*) FROM req WHERE accepted_at IS NOT NULL) AS matched,
 (SELECT count(*) FROM req WHERE accepted_at IS NULL AND status='expired') AS no_captain,
 (SELECT count(*) FROM req WHERE accepted_at IS NULL AND status='cancelled') AS cancelled_while_searching,
 (SELECT count(*) FROM req WHERE status='requested') AS still_searching,
 (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM accepted_at-created_at))::numeric,1)::float8 FROM req WHERE accepted_at IS NOT NULL) AS seconds_to_match_median,
 (SELECT round(percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM accepted_at-created_at))::numeric,1)::float8 FROM req WHERE accepted_at IS NOT NULL) AS seconds_to_match_p90,
 (SELECT round(avg(n)::numeric,2)::float8 FROM (SELECT count(o.driver_id) AS n FROM req LEFT JOIN off o ON o.ride_id=req.id WHERE req.accepted_at IS NOT NULL GROUP BY req.id) x) AS offers_per_matched_ride,
 (SELECT round(avg(o.eta_seconds)::numeric)::float8 FROM off o WHERE o.outcome='accepted') AS accepted_pickup_eta_seconds,
 (SELECT count(*) FROM req WHERE via_next) AS next_rides,
 (SELECT COALESCE(json_object_agg(k,n),'{}') FROM (SELECT COALESCE(o.outcome, CASE WHEN o.expires_at<now() THEN 'expired' ELSE 'live' END) AS k, count(*) AS n FROM off o GROUP BY 1) x) AS offer_outcomes,
 (SELECT COALESCE(json_object_agg(k,n),'{}') FROM (SELECT COALESCE(o.eta_source,'estimate') AS k, count(*) AS n FROM off o GROUP BY 1) x) AS eta_sources,
 (SELECT COALESCE(json_agg(json_build_object('round',stage,'offers',n,'accepted',a) ORDER BY stage),'[]') FROM
   (SELECT o.stage, count(*) AS n, count(*) FILTER (WHERE o.outcome='accepted') AS a FROM off o GROUP BY o.stage) x) AS by_round`, days, area)
	if e != nil {
		dbError(w, e)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Write(report[1 : len(report)-1]) // one row: send the object, not a one-item list
}
