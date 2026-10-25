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
	if r.URL.Query().Get("scope") != "india" {
		q.Set("bbox", fmt.Sprintf("%v,%v,%v,%v", a.MinLng, a.MinLat, a.MaxLng, a.MaxLat))
	}
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
				Name     string `json:"name"`
				Street   string `json:"street"`
				Locality string `json:"locality"`
				District string `json:"district"`
				City     string `json:"city"`
				State    string `json:"state"`
			} `json:"properties"`
		} `json:"features"`
	}
	if response.StatusCode != 200 || json.NewDecoder(http.MaxBytesReader(nil, response.Body, 1024*1024)).Decode(&data) != nil {
		fail(w, 503, "Address search unavailable")
		return
	}
	// Outstation destinations may lie anywhere in India; other searches stay inside the area.
	anywhere := r.URL.Query().Get("scope") == "india"
	result := []Point{}
	for _, f := range data.Features {
		if len(f.Geometry.Coordinates) < 2 {
			continue
		}
		parts := []string{}
		for _, p := range []string{f.Properties.Name, f.Properties.Street, f.Properties.Locality, f.Properties.District, f.Properties.City} {
			if p != "" && !contains(parts, p) {
				parts = append(parts, p)
			}
		}
		p := Point{Lat: f.Geometry.Coordinates[1], Lng: f.Geometry.Coordinates[0], Label: strings.Join(parts, ", ")}
		if len(p.Label) > 160 {
			p.Label = p.Label[:160]
		}
		if p.valid() && (anywhere || a.contains(p)) {
			result = append(result, p)
		}
	}
	write(w, 200, result)
}

func contains(list []string, item string) bool {
	for _, v := range list {
		if v == item {
			return true
		}
	}
	return false
}

// placesReverse turns a map pin into a readable address. It never fails the
// caller: if the geocoder is unavailable the label falls back to coordinates.
func (s *Server) placesReverse(w http.ResponseWriter, r *http.Request) {
	if !s.limit(w, r, "reverse:"+user(r).Account.ID, 60, 60) {
		return
	}
	var lat, lng float64
	if _, e := fmt.Sscan(r.URL.Query().Get("lat"), &lat); e != nil {
		fail(w, 400, "Invalid coordinates")
		return
	}
	if _, e := fmt.Sscan(r.URL.Query().Get("lng"), &lng); e != nil {
		fail(w, 400, "Invalid coordinates")
		return
	}
	p := Point{Lat: lat, Lng: lng, Label: "pin"}
	if !p.valid() {
		fail(w, 400, "Invalid coordinates")
		return
	}
	label := fmt.Sprintf("Pinned location (%.4f, %.4f)", lat, lng)
	if endpoint, e := url.Parse(s.Config.GeocodingURL); e == nil && s.Config.GeocodingURL != "" {
		endpoint.Path = strings.TrimSuffix(endpoint.Path, "/")
		endpoint.Path = strings.TrimSuffix(endpoint.Path, "/api") + "/reverse"
		q := url.Values{}
		q.Set("lat", fmt.Sprint(lat))
		q.Set("lon", fmt.Sprint(lng))
		endpoint.RawQuery = q.Encode()
		req, _ := http.NewRequestWithContext(r.Context(), "GET", endpoint.String(), nil)
		if response, e := s.HTTP.Do(req); e == nil {
			defer response.Body.Close()
			var data struct {
				Features []struct {
					Properties struct {
						Name     string `json:"name"`
						Street   string `json:"street"`
						Locality string `json:"locality"`
						District string `json:"district"`
						City     string `json:"city"`
					} `json:"properties"`
				} `json:"features"`
			}
			if response.StatusCode == 200 && json.NewDecoder(http.MaxBytesReader(nil, response.Body, 1024*1024)).Decode(&data) == nil && len(data.Features) > 0 {
				parts := []string{}
				f := data.Features[0].Properties
				for _, v := range []string{f.Name, f.Street, f.Locality, f.District, f.City} {
					if v != "" && !contains(parts, v) {
						parts = append(parts, v)
					}
				}
				if len(parts) > 0 {
					label = strings.Join(parts, ", ")
					if len(label) > 160 {
						label = label[:160]
					}
				}
			}
		}
	}
	write(w, 200, map[string]string{"label": label})
}
