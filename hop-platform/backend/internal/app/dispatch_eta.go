package app

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type candidateQuerier interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

// Route calls happen before the dispatch transaction/ride row lock. The shortlist
// is bounded and eligibility is independently revalidated inside dispatch/accept.
func (s *Server) dispatchRoadETAs(ctx context.Context, ride string) map[string]float64 {
	result := map[string]float64{}
	if s.Config.RoutingURL == "" {
		return result
	}
	cooldownKey := "dispatch:road:cooldown:" + digest(s.Config.RoutingURL)
	if s.Cache != nil {
		if v, _ := s.Cache.Exists(ctx, cooldownKey).Result(); v > 0 {
			return result
		}
	}
	var area, category string
	var lat, lng float64
	if s.DB.QueryRow(ctx, `SELECT q.area_id::text,q.vehicle_category,q.pickup_lat,q.pickup_lng FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.id=$1 AND r.status='requested'`, ride).Scan(&area, &category, &lat, &lng) != nil {
		return result
	}
	picks, e := s.candidates(ctx, s.DB, ride, area, category, lat, lng, stageRadius[len(stageRadius)-1], 24, nil)
	if e != nil || len(picks) == 0 {
		return result
	}
	// Use a short, coordinate-sensitive Redis cache to bound repeated table calls.
	pending := make([]pick, 0, len(picks))
	cacheKey := func(p pick) string {
		return "dispatch:eta:" + digest(fmt.Sprintf("%s:%.4f:%.4f:%.4f:%.4f", s.Config.RoutingURL, lat, lng, p.lat, p.lng))
	}
	for _, p := range picks {
		if s.Cache != nil {
			if v, e := s.Cache.Get(ctx, cacheKey(p)).Float64(); e == nil {
				result[p.id] = v
				continue
			}
		}
		pending = append(pending, p)
	}
	picks = pending
	if len(picks) == 0 {
		return result
	}
	success := false
	defer func() {
		if !success && s.Cache != nil {
			c, cancel := context.WithTimeout(context.WithoutCancel(ctx), 100*time.Millisecond)
			defer cancel()
			_ = s.Cache.Set(c, cooldownKey, "1", 30*time.Second).Err()
		}
	}()
	coords := []string{fmt.Sprintf("%.6f,%.6f", lng, lat)}
	sources := []string{}
	for i, p := range picks {
		coords = append(coords, fmt.Sprintf("%.6f,%.6f", p.lng, p.lat))
		sources = append(sources, strconv.Itoa(i+1))
	}
	endpoint := fmt.Sprintf("%s/table/v1/driving/%s?sources=%s&destinations=0&annotations=duration", strings.TrimRight(s.Config.RoutingURL, "/"), strings.Join(coords, ";"), strings.Join(sources, ";"))
	routeCtx, cancel := context.WithTimeout(ctx, 1200*time.Millisecond)
	defer cancel()
	req, e := http.NewRequestWithContext(routeCtx, "GET", endpoint, nil)
	if e != nil {
		return result
	}
	res, e := s.HTTP.Do(req)
	if e != nil {
		return result
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return result
	}
	var out struct {
		Code      string       `json:"code"`
		Durations [][]*float64 `json:"durations"`
	}
	if json.NewDecoder(http.MaxBytesReader(nil, res.Body, 64*1024)).Decode(&out) != nil || out.Code != "Ok" || len(out.Durations) != len(picks) {
		return result
	}
	success = true
	for i, row := range out.Durations {
		if len(row) == 1 && row[0] != nil {
			v := *row[0]
			if !math.IsNaN(v) && !math.IsInf(v, 0) && v >= 0 && v <= 7200 {
				result[picks[i].id] = v
				if s.Cache != nil {
					_ = s.Cache.Set(ctx, cacheKey(picks[i]), v, 20*time.Second).Err()
				}
			}
		}
	}
	return result
}
func rankCandidates(picks []pick, road map[string]float64, limit int) []pick {
	for i := range picks {
		p := &picks[i]
		p.eta = p.dist * 1.3 / 6.5
		p.source = "estimate"
		if sec, ok := road[p.id]; ok {
			p.score += sec/60 - p.dist*1.3/6.5/60
			p.eta = sec
			p.source = "road"
		}
	}
	sort.SliceStable(picks, func(i, j int) bool {
		if picks[i].score == picks[j].score {
			return picks[i].id < picks[j].id
		}
		return picks[i].score < picks[j].score
	})
	if len(picks) > limit {
		picks = picks[:limit]
	}
	return picks
}
func (s *Server) offerSeen(w http.ResponseWriter, r *http.Request) {
	uid, id := user(r).Account.ID, r.PathValue("id")
	tag, e := s.DB.Exec(r.Context(), `UPDATE ride_offers o SET displayed_at=COALESCE(displayed_at,now()) WHERE o.driver_id=$1 AND o.ride_id=$2 AND outcome IS NULL AND EXISTS(SELECT 1`+offerFrom+` AND r.id=$2)`, uid, id)
	if e != nil {
		dbError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 409, "Offer is no longer available")
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}
