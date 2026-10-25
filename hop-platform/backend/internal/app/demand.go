package app

import "net/http"

// driverDemand returns recent ride requests in the driver's area, bucketed into ~1 km cells for the heatmap.
func (s *Server) driverDemand(w http.ResponseWriter, r *http.Request) {
	ctx, uid := r.Context(), user(r).Account.ID
	var area string
	if e := s.DB.QueryRow(ctx, "SELECT area_id::text FROM drivers WHERE user_id=$1", uid).Scan(&area); e != nil {
		fail(w, 403, "Demand map is available to driver accounts")
		return
	}
	cells, e := jsonRows(ctx, s.DB, `WITH c AS (
 SELECT floor(q.pickup_lat*100) AS cy,floor(q.pickup_lng*100) AS cx,avg(q.pickup_lat) AS lat,avg(q.pickup_lng) AS lng,count(*)::int AS requests
 FROM rides r JOIN quotes q ON q.id=r.quote_id
 WHERE q.area_id=$1 AND r.created_at>now()-interval '45 minutes' AND r.status<>'cancelled' GROUP BY 1,2)
 SELECT round(c.lat::numeric,5)::float8 AS lat,round(c.lng::numeric,5)::float8 AS lng,c.requests,
 (SELECT count(*) FROM drivers d WHERE d.area_id=$1 AND d.online AND d.status='approved' AND d.location_at>now()-interval '2 minutes' AND floor(d.lat*100)=c.cy AND floor(d.lng*100)=c.cx)::int AS drivers
 FROM c ORDER BY c.requests DESC LIMIT 60`, area)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"cells": cells, "window_minutes": 45})
}
