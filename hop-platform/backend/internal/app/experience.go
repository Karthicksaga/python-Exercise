package app

import (
	"errors"
	"net/http"
	"sort"

	"github.com/jackc/pgx/v5"
)

// estimateOption is one vehicle's fare for the same road route.
type estimateOption struct {
	Category    string  `json:"category"`
	Name        string  `json:"name"`
	FarePaise   int64   `json:"fare_paise"`
	MinutesAway *int    `json:"minutes_away,omitempty"`
	Tag         string  `json:"tag,omitempty"`
	Surge       float64 `json:"surge_multiplier,omitempty"`
	SurgeReason string  `json:"surge_reason,omitempty"`
}

// estimates prices every enabled vehicle for one city route with a single routing call, so the rider can
// compare fares before choosing. It stores nothing; booking still goes through /api/quotes.
func (s *Server) estimates(w http.ResponseWriter, r *http.Request) {
	uid := user(r).Account.ID
	if !s.limit(w, r, "estimate:"+uid, 40, 60) {
		return
	}
	var in struct {
		AreaID  string  `json:"area_id"`
		Pickup  Point   `json:"pickup"`
		Dropoff Point   `json:"dropoff"`
		Stops   []Point `json:"stops"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !in.Pickup.valid() || !in.Dropoff.valid() {
		fail(w, 400, "Choose a valid pickup and destination")
		return
	}
	if len(in.Stops) > 3 {
		fail(w, 400, "Up to 3 extra stops")
		return
	}
	if len(in.Stops) == 0 && distance(in.Pickup, in.Dropoff) < 100 {
		fail(w, 400, "Choose valid pickup and destination at least 100 metres apart")
		return
	}
	var a Area
	if e := s.DB.QueryRow(r.Context(), "SELECT id,min_lat,max_lat,min_lng,max_lng FROM areas WHERE id=$1 AND active", in.AreaID).Scan(&a.ID, &a.MinLat, &a.MaxLat, &a.MinLng, &a.MaxLng); e != nil {
		if errors.Is(e, pgx.ErrNoRows) {
			fail(w, 404, "Service area not found")
			return
		}
		dbError(w, e)
		return
	}
	points := append(append([]Point{in.Pickup}, in.Stops...), in.Dropoff)
	for _, p := range points {
		if !p.valid() || !a.contains(p) {
			fail(w, 400, "Every location must be inside the selected service area")
			return
		}
	}
	meters, seconds, route, e := s.routeVia(r.Context(), points, 100000, 86400, false)
	if e != nil {
		fail(w, 503, "A road quote is unavailable. Please try again later")
		return
	}
	seconds = trafficAdjustDuration(float64(meters), float64(seconds), "", false)
	rows, e := s.DB.Query(r.Context(), "SELECT category,base_paise,per_km_paise,minimum_paise,stop_fee_paise FROM area_vehicle_pricing WHERE area_id=$1 AND enabled", in.AreaID)
	if e != nil {
		dbError(w, e)
		return
	}
	defer rows.Close()
	var options []estimateOption
	for rows.Next() {
		var category string
		var base, perKM, minimum, stopFee int64
		if e = rows.Scan(&category, &base, &perKM, &minimum, &stopFee); e != nil {
			dbError(w, e)
			return
		}
		fare := max(minimum, base+(meters*perKM+999)/1000+stopFee*int64(len(in.Stops)))
		opt := estimateOption{Category: category, Name: vehicleNames[category], FarePaise: fare}
		if sg := s.surgeFor(r.Context(), s.DB, in.AreaID, category); sg.Multiplier > 1 {
			opt.FarePaise, opt.Surge, opt.SurgeReason = applySurge(fare, sg.Multiplier), sg.Multiplier, sg.Reason
		}
		options = append(options, opt)
	}
	if rows.Err() != nil {
		dbError(w, rows.Err())
		return
	}
	sort.Slice(options, func(i, j int) bool { return options[i].FarePaise < options[j].FarePaise })
	if len(options) > 1 {
		options[0].Tag = "cheapest"
	}
	write(w, 200, map[string]any{"meters": meters, "seconds": seconds, "route": route, "options": options})
}
