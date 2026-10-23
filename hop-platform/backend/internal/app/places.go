package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

func (s *Server) places(w http.ResponseWriter, r *http.Request) {
	if !s.limit(w, r, "places:"+user(r).Account.ID, 30, 60) {
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(query) < 3 || len(query) > 120 {
		fail(w, 400, "Enter 3–120 characters to search")
		return
	}
	if s.Config.GeocodingURL == "" {
		fail(w, 503, "Address search is not configured for this service")
		return
	}
	var a Area
	e := s.DB.QueryRow(r.Context(), "SELECT min_lat,max_lat,min_lng,max_lng FROM areas WHERE id=$1 AND active", r.URL.Query().Get("area_id")).Scan(&a.MinLat, &a.MaxLat, &a.MinLng, &a.MaxLng)
	if e != nil {
		dbError(w, e)
		return
	}
	endpoint, e := url.Parse(s.Config.GeocodingURL)
	if e != nil {
		fail(w, 503, "Address search unavailable")
		return
	}
	q := endpoint.Query()
	q.Set("q", query)
	q.Set("limit", "8")
	q.Set("lat", fmt.Sprint((a.MinLat+a.MaxLat)/2))
	q.Set("lon", fmt.Sprint((a.MinLng+a.MaxLng)/2))
	endpoint.RawQuery = q.Encode()
	req, _ := http.NewRequestWithContext(r.Context(), "GET", endpoint.String(), nil)
	response, e := s.HTTP.Do(req)
	if e != nil {
		fail(w, 503, "Address search unavailable")
		return
	}
	defer response.Body.Close()
	var data struct {
		Features []struct {
			Geometry struct {
				Coordinates []float64 `json:"coordinates"`
			} `json:"geometry"`
			Properties struct {
				Name   string `json:"name"`
				Street string `json:"street"`
				City   string `json:"city"`
				State  string `json:"state"`
			} `json:"properties"`
		} `json:"features"`
	}
	if response.StatusCode != 200 || json.NewDecoder(http.MaxBytesReader(nil, response.Body, 1024*1024)).Decode(&data) != nil {
		fail(w, 503, "Address search unavailable")
		return
	}
	result := []Point{}
	for _, f := range data.Features {
		if len(f.Geometry.Coordinates) < 2 {
			continue
		}
		parts := []string{}
		for _, p := range []string{f.Properties.Name, f.Properties.Street, f.Properties.City} {
			if p != "" {
				parts = append(parts, p)
			}
		}
		p := Point{Lat: f.Geometry.Coordinates[1], Lng: f.Geometry.Coordinates[0], Label: strings.Join(parts, ", ")}
		if len(p.Label) > 160 {
			p.Label = p.Label[:160]
		}
		if p.valid() && a.contains(p) {
			result = append(result, p)
		}
	}
	write(w, 200, result)
}
