package app

import (
	"context"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// Hot driver location layer.
//
// Drivers post their position every ~2 s. Writing each ping to PostgreSQL does not scale (WAL, bloat, row
// locks), so the latest position lives in Redis: a per-category GEO index for proximity search and a
// per-driver hash with the exact ping. PostgreSQL is only touched to revalidate the driver (approval,
// documents, service area) and to persist a checkpoint every liveFlushEvery. Redis problems degrade to
// the old direct-to-database path rather than failing the driver.

const (
	liveFlushEvery  = 10 * time.Second
	liveMetaTTL     = 30 * time.Second
	liveLocTTL      = 90 * time.Second
	liveFresh       = 60 * time.Second
	liveSearchLimit = 200
)

var liveCategories = []string{"bike", "auto", "mini", "sedan", "suv"}

// One GEO set per city and vehicle category keeps each key small and lets Redis Cluster spread cities across shards.
func geoKey(area, category string) string { return "geo:" + area + ":" + category }
func locKey(uid string) string            { return "drv:loc:" + uid }
func metaKey(uid string) string           { return "drv:ok:" + uid }
func flushKey(uid string) string          { return "drv:flush:" + uid }

// liveMeta is the slow-changing driver data cached next to the position.
type liveMeta struct {
	Area     string
	Category string
	Radius   int
}

// putLive stores the latest ping in Redis.
func (s *Server) putLive(ctx context.Context, uid string, m liveMeta, lat, lng, accuracy float64) error {
	return s.putLiveAt(ctx, uid, m, lat, lng, accuracy, time.Now())
}

func (s *Server) putLiveAt(ctx context.Context, uid string, m liveMeta, lat, lng, accuracy float64, at time.Time) error {
	pipe := s.Cache.Pipeline()
	pipe.HSet(ctx, locKey(uid), "lat", lat, "lng", lng, "acc", accuracy, "at", at.UnixMilli(), "cat", m.Category, "area", m.Area)
	pipe.Expire(ctx, locKey(uid), liveLocTTL)
	pipe.GeoAdd(ctx, geoKey(m.Area, m.Category), &redis.GeoLocation{Name: uid, Longitude: lng, Latitude: lat})
	pipe.HSet(ctx, metaKey(uid), "cat", m.Category, "area", m.Area, "radius", m.Radius)
	pipe.Expire(ctx, metaKey(uid), liveMetaTTL)
	_, e := pipe.Exec(ctx)
	return e
}

// dropLive removes a driver from the live index (offline, vehicle change, failed validation).
func (s *Server) dropLive(ctx context.Context, uid string) {
	v, _ := s.Cache.HGetAll(ctx, locKey(uid)).Result()
	if v["area"] == "" || v["cat"] == "" {
		if m, _ := s.Cache.HGetAll(ctx, metaKey(uid)).Result(); m["area"] != "" {
			v = m
		}
	}
	pipe := s.Cache.Pipeline()
	if v["area"] != "" && v["cat"] != "" {
		pipe.ZRem(ctx, geoKey(v["area"], v["cat"]), uid)
	}
	pipe.Del(ctx, locKey(uid), metaKey(uid), flushKey(uid))
	_, _ = pipe.Exec(ctx)
}

// liveMetaFor returns the cached meta when the driver was validated recently.
func (s *Server) liveMetaFor(ctx context.Context, uid string) (liveMeta, bool) {
	v, e := s.Cache.HGetAll(ctx, metaKey(uid)).Result()
	if e != nil || v["cat"] == "" || v["area"] == "" {
		return liveMeta{}, false
	}
	r, _ := strconv.Atoi(v["radius"])
	return liveMeta{Area: v["area"], Category: v["cat"], Radius: r}, true
}

// shouldFlush is true when the database checkpoint is due (at most one winner per interval).
func (s *Server) shouldFlush(ctx context.Context, uid string) bool {
	ok, e := s.Cache.SetNX(ctx, flushKey(uid), 1, liveFlushEvery).Result()
	return e != nil || ok
}

// liveDriverPos returns a fresh Redis position for a driver.
func (s *Server) liveDriverPos(ctx context.Context, uid string) (lat, lng float64, at time.Time, ok bool) {
	v, e := s.Cache.HGetAll(ctx, locKey(uid)).Result()
	if e != nil || v["at"] == "" {
		return
	}
	ms, _ := strconv.ParseInt(v["at"], 10, 64)
	lat, _ = strconv.ParseFloat(v["lat"], 64)
	lng, _ = strconv.ParseFloat(v["lng"], 64)
	at = time.UnixMilli(ms)
	return lat, lng, at, time.Since(at) < liveFresh
}

// syncDriverLocation persists the newest Redis position to PostgreSQL. Call it before logic that compares
// the driver's position with a pickup (accept, arrive, start) so those checks never see a stale checkpoint.
func (s *Server) syncDriverLocation(ctx context.Context, uid string) {
	lat, lng, at, ok := s.liveDriverPos(ctx, uid)
	if !ok {
		return
	}
	_, _ = s.DB.Exec(ctx, "UPDATE drivers SET lat=$2,lng=$3,location_at=$4 WHERE user_id=$1 AND location_at<$4", uid, lat, lng, at)
}

type liveHit struct {
	ID     string
	Cat    string
	Lat    float64
	Lng    float64
	Meters float64
}

// searchLive returns fresh, in-radius drivers around a point using the Redis GEO index. Results are
// sorted by distance. Drivers whose own pickup radius is smaller than the distance are skipped.
func (s *Server) searchLive(ctx context.Context, area string, lat, lng, withinMeters float64) ([]liveHit, error) {
	type cand struct {
		id, cat string
		dist    float64
	}
	pipe := s.Cache.Pipeline()
	searches := make([]*redis.GeoSearchLocationCmd, len(liveCategories))
	for i, c := range liveCategories {
		searches[i] = pipe.GeoSearchLocation(ctx, geoKey(area, c), &redis.GeoSearchLocationQuery{
			GeoSearchQuery: redis.GeoSearchQuery{Longitude: lng, Latitude: lat, Radius: withinMeters, RadiusUnit: "m", Sort: "ASC", Count: liveSearchLimit},
			WithDist:       true,
		})
	}
	if _, e := pipe.Exec(ctx); e != nil && e != redis.Nil {
		return nil, e
	}
	var cands []cand
	for i, cmd := range searches {
		locs, e := cmd.Result()
		if e != nil {
			continue
		}
		for _, l := range locs {
			cands = append(cands, cand{l.Name, liveCategories[i], l.Dist})
		}
	}
	if len(cands) == 0 {
		return nil, nil
	}
	pipe = s.Cache.Pipeline()
	locs := make([]*redis.SliceCmd, len(cands))
	radii := make([]*redis.StringCmd, len(cands))
	for i, c := range cands {
		locs[i] = pipe.HMGet(ctx, locKey(c.id), "lat", "lng", "at")
		radii[i] = pipe.HGet(ctx, metaKey(c.id), "radius")
	}
	_, _ = pipe.Exec(ctx)
	var hits []liveHit
	var stale []string
	for i, c := range cands {
		v, e := locs[i].Result()
		if e != nil || len(v) < 3 || v[2] == nil {
			stale = append(stale, c.id)
			continue
		}
		ms, _ := strconv.ParseInt(v[2].(string), 10, 64)
		if time.Since(time.UnixMilli(ms)) >= liveFresh {
			continue
		}
		radius := 3000.0
		if r, e := strconv.ParseFloat(radii[i].Val(), 64); e == nil && r > 0 {
			radius = r
		}
		if c.dist > radius {
			continue
		}
		la, _ := strconv.ParseFloat(v[0].(string), 64)
		ln, _ := strconv.ParseFloat(v[1].(string), 64)
		hits = append(hits, liveHit{ID: c.id, Cat: c.cat, Lat: la, Lng: ln, Meters: c.dist})
	}
	if len(stale) > 0 {
		// GEO members never expire on their own; evict drivers whose ping hash is gone.
		pipe = s.Cache.Pipeline()
		for _, id := range stale {
			for _, c := range liveCategories {
				pipe.ZRem(ctx, geoKey(area, c), id)
			}
		}
		_, _ = pipe.Exec(ctx)
	}
	if len(hits) == 0 {
		return nil, nil
	}
	ids := make([]string, len(hits))
	for i, h := range hits {
		ids[i] = h.ID
	}
	busy := map[string]bool{}
	rows, e := s.DB.Query(ctx, "SELECT DISTINCT driver_id::text FROM rides WHERE driver_id=ANY($1::uuid[]) AND status IN ('accepted','arrived','in_progress')", ids)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			busy[id] = true
		}
	}
	out := hits[:0]
	for _, h := range hits {
		if !busy[h.ID] {
			out = append(out, h)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Meters < out[j].Meters })
	return out, nil
}

// shortlistLive returns the nearest driver ids of one category from the GEO index. truncated reports that
// the result was cut at shortlistSize, so more drivers may exist inside the radius.
func (s *Server) shortlistLive(ctx context.Context, area, category string, lat, lng, radius float64) (ids []string, truncated bool) {
	locs, e := s.Cache.GeoSearch(ctx, geoKey(area, category), &redis.GeoSearchQuery{Longitude: lng, Latitude: lat, Radius: radius, RadiusUnit: "m", Sort: "ASC", Count: shortlistSize}).Result()
	if e != nil {
		return nil, false
	}
	truncated = len(locs) >= shortlistSize
	if len(locs) == 0 {
		return nil, false
	}
	// Drop drivers that stopped pinging so ghosts do not take shortlist slots; evict those whose ping expired.
	pipe := s.Cache.Pipeline()
	ats := make([]*redis.StringCmd, len(locs))
	for i, id := range locs {
		ats[i] = pipe.HGet(ctx, locKey(id), "at")
	}
	_, _ = pipe.Exec(ctx)
	var gone []string
	for i, id := range locs {
		v, e := ats[i].Result()
		if e != nil {
			gone = append(gone, id)
			continue
		}
		if ms, e := strconv.ParseInt(v, 10, 64); e == nil && time.Since(time.UnixMilli(ms)) < liveFresh {
			ids = append(ids, id)
		}
	}
	if len(gone) > 0 {
		pipe = s.Cache.Pipeline()
		for _, id := range gone {
			pipe.ZRem(ctx, geoKey(area, category), id)
		}
		_, _ = pipe.Exec(ctx)
	}
	return ids, truncated
}

// HydrateLive rebuilds the Redis index from the database checkpoint. It runs at startup so a Redis restart
// or a fresh instance does not hide drivers until their next ping.
func (s *Server) HydrateLive(ctx context.Context) error {
	rows, e := s.DB.Query(ctx, `SELECT user_id::text,area_id::text,vehicle_category,lat,lng,COALESCE(accuracy,10),pickup_radius_meters,location_at
 FROM drivers WHERE online AND status='approved' AND lat IS NOT NULL AND location_at>now()-interval '60 seconds'`)
	if e != nil {
		return e
	}
	defer rows.Close()
	for rows.Next() {
		var id, area, cat string
		var lat, lng, acc float64
		var radius int
		var at time.Time
		if e = rows.Scan(&id, &area, &cat, &lat, &lng, &acc, &radius, &at); e != nil {
			return e
		}
		if e = s.putLiveAt(ctx, id, liveMeta{Area: area, Category: cat, Radius: radius}, lat, lng, acc, at); e != nil {
			return e
		}
	}
	return rows.Err()
}

type areaBox struct {
	id                             string
	minLat, maxLat, minLng, maxLng float64
}

var (
	areaMu    sync.RWMutex
	areaCache []areaBox
	areaAt    time.Time
)

// areaAt returns the active service area containing a point. The area list is tiny and cached for a minute.
func (s *Server) areaFor(ctx context.Context, lat, lng float64) (string, bool) {
	areaMu.RLock()
	fresh := time.Since(areaAt) < time.Minute && areaCache != nil
	list := areaCache
	areaMu.RUnlock()
	if !fresh {
		rows, e := s.DB.Query(ctx, "SELECT id::text,min_lat,max_lat,min_lng,max_lng FROM areas WHERE active")
		if e != nil {
			return "", false
		}
		list = []areaBox{}
		for rows.Next() {
			var a areaBox
			if rows.Scan(&a.id, &a.minLat, &a.maxLat, &a.minLng, &a.maxLng) == nil {
				list = append(list, a)
			}
		}
		rows.Close()
		areaMu.Lock()
		areaCache, areaAt = list, time.Now()
		areaMu.Unlock()
	}
	for _, a := range list {
		if lat >= a.minLat && lat <= a.maxLat && lng >= a.minLng && lng <= a.maxLng {
			return a.id, true
		}
	}
	return "", false
}
