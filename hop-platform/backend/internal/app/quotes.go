package app

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"
)

type Point struct {
	Lat   float64 `json:"lat"`
	Lng   float64 `json:"lng"`
	Label string  `json:"label"`
}

func (p Point) valid() bool {
	return !math.IsNaN(p.Lat) && !math.IsNaN(p.Lng) && p.Lat >= 6 && p.Lat <= 38 && p.Lng >= 68 && p.Lng <= 98 && len(strings.TrimSpace(p.Label)) >= 2 && len(p.Label) <= 160
}

type Area struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	State    string  `json:"state"`
	MinLat   float64 `json:"min_lat"`
	MaxLat   float64 `json:"max_lat"`
	MinLng   float64 `json:"min_lng"`
	MaxLng   float64 `json:"max_lng"`
	Base     int64   `json:"base_paise"`
	PerKM    int64   `json:"per_km_paise"`
	Minimum  int64   `json:"minimum_paise"`
	Version  int     `json:"pricing_version"`
	Active   bool    `json:"active"`
	Approval string  `json:"approval_reference"`
}

func (a Area) contains(p Point) bool {
	return p.Lat >= a.MinLat && p.Lat <= a.MaxLat && p.Lng >= a.MinLng && p.Lng <= a.MaxLng
}
func (s *Server) publicConfig(w http.ResponseWriter, r *http.Request) {
	areas, e := jsonRows(r.Context(), s.DB, "SELECT id,name,state,min_lat,max_lat,min_lng,max_lng FROM areas WHERE active ORDER BY state,name")
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"areas": areas, "commission_paise": 0, "development": s.Config.Development, "routing_configured": s.Config.RoutingURL != ""})
}
func distance(a, b Point) float64 {
	lat1 := a.Lat * math.Pi / 180
	lat2 := b.Lat * math.Pi / 180
	dl := (b.Lat - a.Lat) * math.Pi / 180
	dn := (b.Lng - a.Lng) * math.Pi / 180
	h := math.Pow(math.Sin(dl/2), 2) + math.Cos(lat1)*math.Cos(lat2)*math.Pow(math.Sin(dn/2), 2)
	return 6371000 * 2 * math.Asin(math.Sqrt(math.Min(1, h)))
}
func (s *Server) route(ctx context.Context, a, b Point) (int64, int64, error) {
	if s.Config.RoutingURL == "" {
		return 0, 0, fmt.Errorf("routing is not configured")
	}
	endpoint := fmt.Sprintf("%s/route/v1/driving/%.6f,%.6f;%.6f,%.6f?overview=false&alternatives=false&steps=false", strings.TrimRight(s.Config.RoutingURL, "/"), a.Lng, a.Lat, b.Lng, b.Lat)
	req, _ := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	res, e := s.HTTP.Do(req)
	if e != nil {
		return 0, 0, e
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return 0, 0, fmt.Errorf("routing unavailable")
	}
	var result struct {
		Code   string `json:"code"`
		Routes []struct {
			Distance float64 `json:"distance"`
			Duration float64 `json:"duration"`
		} `json:"routes"`
	}
	if json.NewDecoder(http.MaxBytesReader(nil, res.Body, 1024*1024)).Decode(&result) != nil || result.Code != "Ok" || len(result.Routes) == 0 {
		return 0, 0, fmt.Errorf("no road route")
	}
	d, t := result.Routes[0].Distance, result.Routes[0].Duration
	if d < 100 || d > 100000 || t < 1 || t > 86400 || math.IsNaN(d) || math.IsNaN(t) {
		return 0, 0, fmt.Errorf("route outside supported trip limits")
	}
	return int64(math.Ceil(d)), int64(math.Ceil(t)), nil
}
func (s *Server) quote(w http.ResponseWriter, r *http.Request) {
	uid := user(r).Account.ID
	if !s.limit(w, r, "quote:"+uid, 15, 60) {
		return
	}
	var input struct {
		AreaID  string `json:"area_id"`
		Pickup  Point  `json:"pickup"`
		Dropoff Point  `json:"dropoff"`
	}
	if !decode(w, r, &input) {
		return
	}
	if !input.Pickup.valid() || !input.Dropoff.valid() || distance(input.Pickup, input.Dropoff) < 100 {
		fail(w, 400, "Choose valid pickup and destination at least 100 metres apart")
		return
	}
	var a Area
	e := s.DB.QueryRow(r.Context(), "SELECT id,min_lat,max_lat,min_lng,max_lng,base_paise,per_km_paise,minimum_paise,pricing_version FROM areas WHERE id=$1 AND active", input.AreaID).Scan(&a.ID, &a.MinLat, &a.MaxLat, &a.MinLng, &a.MaxLng, &a.Base, &a.PerKM, &a.Minimum, &a.Version)
	if e != nil {
		dbError(w, e)
		return
	}
	if !a.contains(input.Pickup) || !a.contains(input.Dropoff) {
		fail(w, 400, "Both locations must be inside the selected service area")
		return
	}
	meters, seconds, e := s.route(r.Context(), input.Pickup, input.Dropoff)
	if e != nil {
		fail(w, 503, "A road quote is unavailable. Please try again later")
		return
	}
	fare := max(a.Minimum, a.Base+(meters*a.PerKM+999)/1000)
	var id string
	var expires time.Time
	e = s.DB.QueryRow(r.Context(), `INSERT INTO quotes(rider_id,area_id,pickup_lat,pickup_lng,pickup_label,dropoff_lat,dropoff_lng,dropoff_label,meters,seconds,fare_paise,pricing_version,route_source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'osrm') RETURNING id,expires_at`, uid, a.ID, input.Pickup.Lat, input.Pickup.Lng, input.Pickup.Label, input.Dropoff.Lat, input.Dropoff.Lng, input.Dropoff.Label, meters, seconds, fare, a.Version).Scan(&id, &expires)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]any{"id": id, "meters": meters, "seconds": seconds, "fare_paise": fare, "commission_paise": 0, "expires_at": expires, "pricing_version": a.Version})
}
