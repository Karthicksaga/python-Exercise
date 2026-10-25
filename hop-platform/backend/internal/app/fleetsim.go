package app

import (
	"context"
	"math"
	"math/rand"
	"time"
)

// RunFleetSim keeps the seeded dev drivers driving around their home spot so riders can watch vehicles
// move on the map. It only runs in development and never touches real accounts or drivers on a ride.
func (s *Server) RunFleetSim(ctx context.Context) {
	type car struct{ homeLat, homeLng, lat, lng, heading float64 }
	cars := map[string]*car{}
	tick := time.NewTicker(3 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
		rows, e := s.DB.Query(ctx, `SELECT d.user_id::text,d.lat,d.lng FROM drivers d JOIN accounts a ON a.id=d.user_id
 WHERE a.issuer='dev-seed' AND d.online AND d.status='approved' AND d.lat IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM rides r WHERE r.driver_id=d.user_id AND r.status IN ('accepted','arrived','in_progress'))`)
		if e != nil {
			continue
		}
		type pos struct {
			id       string
			lat, lng float64
		}
		var list []pos
		for rows.Next() {
			var p pos
			if rows.Scan(&p.id, &p.lat, &p.lng) == nil {
				list = append(list, p)
			}
		}
		rows.Close()
		for _, p := range list {
			c := cars[p.id]
			if c == nil {
				c = &car{homeLat: p.lat, homeLng: p.lng, lat: p.lat, lng: p.lng, heading: rand.Float64() * 2 * math.Pi}
				cars[p.id] = c
			}
			c.heading += (rand.Float64() - 0.5) * 0.9
			if math.Hypot(c.lat-c.homeLat, c.lng-c.homeLng) > 0.02 { // stay within ~2 km, turn back home
				c.heading = math.Atan2(c.homeLng-c.lng, c.homeLat-c.lat)
			}
			const step = 0.00035 // about 40 m every 3 s
			c.lat += math.Cos(c.heading) * step
			c.lng += math.Sin(c.heading) * step
			_, _ = s.DB.Exec(ctx, "UPDATE drivers SET lat=$2,lng=$3,accuracy=10,location_at=now() WHERE user_id=$1", p.id, c.lat, c.lng)
		}
	}
}
