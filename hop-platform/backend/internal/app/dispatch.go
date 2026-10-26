package app

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

// Staged, scored dispatch: each ride is offered to the best few drivers first, then to wider rings
// every stageWait until someone accepts. Acceptance itself stays first-come under a row lock.
var (
	stageRadius = []float64{1500, 3000, 6000, 20000}
	stageSize   = []int{3, 3, 5, 10}
)

const stageWait = "15 seconds"

// Lower score is better: road-ish ETA in minutes, penalties for low rating and low recent acceptance,
// a small reward for idle time (fairness) and a bonus for the rider's favourite drivers.
var candidateSQL = `SELECT d.user_id::text, c.dist, d.lat,d.lng,
 (c.dist*1.3/6.5/60.0)
 + (5-COALESCE((SELECT (sum(score)+22.5)/(count(*)+5) FROM ride_ratings WHERE rated_id=d.user_id),4.5))*1.5
 + (1-COALESCE((SELECT avg((outcome='accepted')::int) FROM (SELECT outcome FROM ride_offers WHERE driver_id=d.user_id AND outcome IN ('accepted','declined') AND (outcome='accepted' OR displayed_at IS NOT NULL) ORDER BY offered_at DESC LIMIT 20) x),0.5))*3
 - LEAST(COALESCE((SELECT extract(epoch FROM now()-max(updated_at))/60 FROM rides WHERE driver_id=d.user_id AND status='completed'),30),30)*0.05
 - CASE WHEN EXISTS(SELECT 1 FROM favorite_drivers f WHERE f.rider_id=r.rider_id AND f.driver_id=d.user_id) THEN 1 ELSE 0 END AS score
 FROM rides r JOIN quotes q ON q.id=r.quote_id JOIN areas a ON a.id=q.area_id
 JOIN drivers d ON d.area_id=q.area_id AND d.vehicle_category=q.vehicle_category
 CROSS JOIN LATERAL (SELECT 6371000*acos(least(1,greatest(-1,sin(radians(d.lat))*sin(radians(q.pickup_lat))+cos(radians(d.lat))*cos(radians(q.pickup_lat))*cos(radians(d.lng-q.pickup_lng))))) AS dist) c
 WHERE r.id=$1 AND r.share_state<>'waiting' AND d.status='approved' AND d.online AND a.active AND d.user_id<>r.rider_id AND (NOT q.pink OR d.pink_certified)
 AND d.lat BETWEEN q.pickup_lat-$3::float8/111320.0 AND q.pickup_lat+$3::float8/111320.0
 AND d.lng BETWEEN q.pickup_lng-$3::float8/(111320.0*cos(radians(q.pickup_lat))) AND q.pickup_lng+$3::float8/(111320.0*cos(radians(q.pickup_lat)))
 AND d.license_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date AND d.insurance_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date AND d.location_at>now()-interval '60 seconds'
 AND (r.payment_method<>'upi' OR d.upi_id<>'') AND COALESCE(r.offered_fare_paise,q.fare_paise)+` + groupFareExtra + `>=d.minimum_fare_paise
 AND (r.favorite_first_until IS NULL OR r.favorite_first_until<=now() OR EXISTS(SELECT 1 FROM favorite_drivers f WHERE f.rider_id=r.rider_id AND f.driver_id=d.user_id))
 AND (r.reserved_until IS NULL OR r.reserved_until<=now() OR r.reserved_driver_id=d.user_id)
 AND NOT EXISTS(SELECT 1 FROM rides busy WHERE busy.driver_id=d.user_id AND busy.status IN ('accepted','arrived','in_progress'))
 AND NOT EXISTS(SELECT 1 FROM ride_offers o WHERE o.ride_id=r.id AND o.driver_id=d.user_id)
 AND c.dist<=LEAST(d.pickup_radius_meters,$2::float8)
 AND ($5::uuid[] IS NULL OR d.user_id=ANY($5::uuid[]))` + riderBusyFilter + goHomeFilter + `
 ORDER BY score LIMIT $4::int`

const (
	dispatchBatch   = 60
	dispatchWorkers = 6
	shortlistSize   = 200
)

type openRide struct {
	id     string
	stage  int
	window bool
}

type pick struct {
	id            string
	dist, score   float64
	lat, lng, eta float64
	source        string
}

// DispatchStaged advances open rides by at most one successful stage each and records offer outcomes.
// Any number of API instances may run it: rides are claimed with a short lease (FOR UPDATE SKIP LOCKED),
// so work is partitioned across instances and workers instead of serialised behind one global lock.
func (s *Server) DispatchStaged(ctx context.Context) error {
	if e := s.MatchShared(ctx); e != nil {
		return e
	}
	if e := s.settleOffers(ctx); e != nil {
		return e
	}
	rides, e := s.claimRides(ctx)
	if e != nil || len(rides) == 0 {
		return e
	}
	jobs := make(chan openRide)
	var wg sync.WaitGroup
	var mu sync.Mutex
	var first error
	for w := 0; w < dispatchWorkers && w < len(rides); w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for r := range jobs {
				if e := s.dispatchRide(ctx, r); e != nil {
					mu.Lock()
					if first == nil {
						first = e
					}
					mu.Unlock()
				}
			}
		}()
	}
	for _, r := range rides {
		jobs <- r
	}
	close(jobs)
	wg.Wait()
	return first
}

// settleOffers marks the outcome of offers whose ride is no longer open. One instance at a time.
func (s *Server) settleOffers(ctx context.Context) error {
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	var locked bool
	if e = tx.QueryRow(ctx, "SELECT pg_try_advisory_xact_lock(8472102)").Scan(&locked); e != nil || !locked {
		return e
	}
	if _, e = tx.Exec(ctx, `UPDATE ride_offers o SET outcome=CASE WHEN r.driver_id=o.driver_id THEN 'accepted' WHEN EXISTS(SELECT 1 FROM ride_declines dc WHERE dc.ride_id=o.ride_id AND dc.driver_id=o.driver_id) THEN 'declined' WHEN r.driver_id IS NOT NULL THEN 'superseded' ELSE 'expired' END
 FROM rides r WHERE r.id=o.ride_id AND o.outcome IS NULL AND r.status<>'requested'`); e != nil {
		return e
	}
	return tx.Commit(ctx)
}

// claimRides leases the open rides that are due for their next stage.
func (s *Server) claimRides(ctx context.Context) ([]openRide, error) {
	rows, e := s.DB.Query(ctx, `UPDATE rides SET dispatch_lease=now()+interval '10 seconds' WHERE id IN (
 SELECT id FROM rides WHERE status='requested' AND expires_at>now() AND share_state<>'waiting' AND (group_id IS NULL OR group_leader)
 AND ((dispatch_stage<$1 AND (dispatch_at IS NULL OR dispatch_at<now()-$2::interval)) OR (dispatch_stage>=$1 AND dispatch_at<now()-interval '5 seconds'))
 AND (dispatch_lease IS NULL OR dispatch_lease<now())
 ORDER BY created_at LIMIT $3 FOR UPDATE SKIP LOCKED)
 RETURNING id::text, dispatch_stage, COALESCE(favorite_first_until>now() OR reserved_until>now(),false)`, len(stageRadius), stageWait, dispatchBatch)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	var out []openRide
	for rows.Next() {
		var o openRide
		if e = rows.Scan(&o.id, &o.stage, &o.window); e != nil {
			return nil, e
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// candidates scores eligible drivers. The nearest drivers come from the Redis GEO index; PostgreSQL then
// validates and ranks only that shortlist. It falls back to the bounding-box query when Redis has no
// shortlist (cold start, database-only demo drivers) or the shortlist was cut off and nothing qualified.
func (s *Server) candidates(ctx context.Context, tx candidateQuerier, rideID, area, category string, lat, lng, radius float64, limit int, road map[string]float64) ([]pick, error) {
	ids, truncated := s.shortlistLive(ctx, area, category, lat, lng, radius)
	run := func(ids []string) ([]pick, error) {
		rows, e := tx.Query(ctx, candidateSQL, rideID, radius, radius, max(limit, 24), ids)
		if e != nil {
			return nil, e
		}
		defer rows.Close()
		var out []pick
		for rows.Next() {
			var p pick
			if e = rows.Scan(&p.id, &p.dist, &p.lat, &p.lng, &p.score); e != nil {
				return nil, e
			}
			out = append(out, p)
		}
		return rankCandidates(out, road, limit), rows.Err()
	}
	if len(ids) > 0 {
		picks, e := run(ids)
		if e != nil || len(picks) > 0 || !truncated {
			return picks, e
		}
	}
	return run(nil)
}

func (s *Server) dispatchRide(ctx context.Context, ride openRide) error {
	road := s.dispatchRoadETAs(ctx, ride.id)
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	var area, category string
	var lat, lng float64
	e = tx.QueryRow(ctx, `SELECT q.area_id::text,q.vehicle_category,q.pickup_lat,q.pickup_lng FROM rides r JOIN quotes q ON q.id=r.quote_id
 WHERE r.id=$1 AND r.status='requested' AND r.expires_at>now() AND r.share_state<>'waiting' AND (r.group_id IS NULL OR r.group_leader) FOR UPDATE OF r`, ride.id).Scan(&area, &category, &lat, &lng)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil
	}
	if e != nil {
		return e
	}
	offer := func(picks []pick, stage int) error {
		for _, p := range picks {
			etaSec := int(p.eta)
			if _, e := tx.Exec(ctx, "INSERT INTO ride_offers(ride_id,driver_id,stage,score,eta_seconds,eta_source) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING", ride.id, p.id, stage, p.score, etaSec, p.source); e != nil {
				return e
			}
		}
		return nil
	}
	last := len(stageRadius) - 1
	if ride.stage >= len(stageRadius) {
		// Every stage has run: keep sweeping at the widest radius so drivers who come online or move closer still get the request.
		picks, e := s.candidates(ctx, tx, ride.id, area, category, lat, lng, stageRadius[last], stageSize[last], road)
		if e != nil {
			return e
		}
		if e = offer(picks, len(stageRadius)); e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, "UPDATE rides SET dispatch_at=now(),dispatch_lease=NULL WHERE id=$1", ride.id); e != nil {
			return e
		}
		return tx.Commit(ctx)
	}
	// While a favourite-driver or negotiated reservation is active, only the first stage runs and only if someone qualifies.
	if ride.window && ride.stage > 0 {
		return nil
	}
	for stage := ride.stage; stage < len(stageRadius); stage++ {
		radius := stageRadius[stage]
		if ride.window {
			radius = stageRadius[last]
		}
		picks, e := s.candidates(ctx, tx, ride.id, area, category, lat, lng, radius, stageSize[stage], road)
		if e != nil {
			return e
		}
		if len(picks) == 0 && ride.window {
			break
		}
		if e = offer(picks, stage+1); e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, "UPDATE rides SET dispatch_stage=$2,dispatch_at=now(),dispatch_lease=NULL WHERE id=$1", ride.id, stage+1); e != nil {
			return e
		}
		if len(picks) > 0 {
			break
		}
	}
	return tx.Commit(ctx)
}

// RunDispatch polls for open rides until the context ends.
func (s *Server) RunDispatch(ctx context.Context, onError func(error)) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			job, cancel := context.WithTimeout(ctx, 4*time.Second)
			if e := s.DispatchStaged(job); e != nil && ctx.Err() == nil {
				onError(e)
			}
			cancel()
		}
	}
}
