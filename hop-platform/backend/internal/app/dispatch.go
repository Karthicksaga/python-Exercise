package app

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

// Captain matching (Nov 2026).
//
// Each open request is offered in rounds. A round offers it exclusively to the best captain (or a
// few in wider rounds) for a short window; if nobody accepts, the next round goes to the next best.
// A captain holds at most one live offer, so nobody taps Accept only to be told the ride was taken.
// All requests due in one tick are matched together (best pairs first), so two riders asking at
// the same moment don't both get the same captain while another nearby one sits idle.
//
// Ranking is by estimated time to the pickup (road time when the router answers, otherwise a
// distance estimate with a penalty for captains moving away from the pickup), adjusted for rating,
// recent acceptance, idle time (fairness) and the rider's favourites. A captain finishing a trip
// near the pickup can be offered it as their "next ride".
type round struct {
	radius float64
	size   int
	wait   time.Duration
}

var rounds = []round{
	{3000, 1, 8 * time.Second},
	{3000, 1, 8 * time.Second},
	{6000, 2, 10 * time.Second},
	{20000, 4, 12 * time.Second},
}

// After every round has run, keep sweeping the widest ring so captains who come online or move
// closer still get the request.
var sweep = round{20000, 4, 10 * time.Second}

func roundFor(stage int) round {
	if stage < len(rounds) {
		return rounds[stage]
	}
	return sweep
}

// roundRadius is the search radius shown to the rider for a ride's current stage.
func roundRadius(stage int) float64 { return roundFor(max(0, stage-1)).radius }

const (
	// A captain qualifies for a "next ride" when they are this close to their current drop-off,
	// and that drop-off is this close to the new pickup.
	nextRemainMeters = 1200
	nextGapMeters    = 2000
	// Time allowed at the drop-off for payment and the rider getting out.
	nextHandoverSeconds = 90
	// How long a next ride stays held for that captain before searching again.
	nextHold = "6 minutes"
	// An Accept that left the phone just before the window closed still counts.
	offerGrace = "3 seconds"
	// Shortest wait for a round, even for a captain who rarely accepts.
	minimumWait = 5 * time.Second
)

const (
	dispatchBatch   = 60
	dispatchWorkers = 6
	shortlistSize   = 200
)

// Shared by both candidate kinds: the captain is eligible for this ride and free to see it now.
// $1 ride, $2 radius, $3 radius (box), $4 limit, $5 optional shortlist.
var candidateFrom = ` FROM rides r JOIN quotes q ON q.id=r.quote_id JOIN areas a ON a.id=q.area_id
 JOIN drivers d ON d.area_id=q.area_id AND d.vehicle_category=q.vehicle_category
 CROSS JOIN LATERAL (SELECT ` + meterSQL("d.lat", "d.lng", "q.pickup_lat", "q.pickup_lng") + ` AS dist,
   degrees(atan2(sin(radians(q.pickup_lng-d.lng))*cos(radians(q.pickup_lat)),
     cos(radians(d.lat))*sin(radians(q.pickup_lat))-sin(radians(d.lat))*cos(radians(q.pickup_lat))*cos(radians(q.pickup_lng-d.lng)))) AS bearing) c
 CROSS JOIN LATERAL (SELECT COALESCE(avg(COALESCE(x.outcome='accepted',false)::int),0.5)::float8 AS rate FROM (
   SELECT outcome FROM ride_offers WHERE driver_id=d.user_id AND (outcome='accepted' OR (displayed_at IS NOT NULL
     AND (outcome IN ('declined','expired') OR (outcome IS NULL AND expires_at<now())))) ORDER BY offered_at DESC LIMIT 20) x) ar
 %s
 WHERE r.id=$1 AND r.share_state<>'waiting' AND d.status='approved' AND d.online AND a.active AND d.user_id<>r.rider_id AND (NOT q.pink OR d.pink_certified)
 AND d.lat BETWEEN q.pickup_lat-$3::float8/111320.0 AND q.pickup_lat+$3::float8/111320.0
 AND d.lng BETWEEN q.pickup_lng-$3::float8/(111320.0*cos(radians(q.pickup_lat))) AND q.pickup_lng+$3::float8/(111320.0*cos(radians(q.pickup_lat)))
 AND d.license_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date AND d.insurance_expires>=(now() AT TIME ZONE 'Asia/Kolkata')::date AND d.location_at>now()-interval '60 seconds'
 AND (r.payment_method<>'upi' OR d.upi_id<>'') AND COALESCE(r.offered_fare_paise,q.fare_paise)+` + groupFareExtra + `>=d.minimum_fare_paise
 AND (r.favorite_first_until IS NULL OR r.favorite_first_until<=now() OR EXISTS(SELECT 1 FROM favorite_drivers f WHERE f.rider_id=r.rider_id AND f.driver_id=d.user_id))
 AND (r.reserved_until IS NULL OR r.reserved_until<=now() OR r.reserved_driver_id=d.user_id)
 AND NOT EXISTS(SELECT 1 FROM ride_offers o WHERE o.ride_id=r.id AND o.driver_id=d.user_id AND (o.outcome IS NOT NULL OR o.expires_at IS NULL OR o.expires_at>now()))
 AND NOT EXISTS(SELECT 1 FROM ride_declines dc WHERE dc.ride_id=r.id AND dc.driver_id=d.user_id)
 AND NOT EXISTS(SELECT 1 FROM ride_offers lo JOIN rides lr ON lr.id=lo.ride_id WHERE lo.driver_id=d.user_id AND lo.outcome IS NULL AND lo.expires_at>now() AND lr.status='requested')
 AND c.dist<=LEAST(d.pickup_radius_meters,$2::float8)
 AND ($5::uuid[] IS NULL OR d.user_id=ANY($5::uuid[]))` + riderBusyFilter + goHomeFilter + ` AND ` + passOK + ` %s`

// Minutes added to (or taken off) the travel time: low rating, low recent acceptance, idle time
// (a small reward, for fairness), the rider's favourites, and having already let this request
// time out (they can get it again, but after captains who haven't seen it).
const candidatePenalty = `CASE WHEN EXISTS(SELECT 1 FROM ride_offers o WHERE o.ride_id=r.id AND o.driver_id=d.user_id) THEN 3 ELSE 0 END
 + (5-COALESCE((SELECT (sum(score)+22.5)/(count(*)+5) FROM ride_ratings WHERE rated_id=d.user_id),4.5))*1.5
 + (1-ar.rate)*3
 - LEAST(COALESCE((SELECT extract(epoch FROM now()-max(updated_at))/60 FROM rides WHERE driver_id=d.user_id AND status='completed'),30),30)*0.05
 - CASE WHEN EXISTS(SELECT 1 FROM favorite_drivers f WHERE f.rider_id=r.rider_id AND f.driver_id=d.user_id) THEN 1 ELSE 0 END`

// Seconds lost turning around: a captain moving away from the pickup (heading opposite the
// direction to it) needs a U-turn, more so on longer approaches. Only while actually moving.
const turnSeconds = `CASE WHEN COALESCE(d.speed,0)>=2 AND c.dist>150 THEN
 (1-cos(radians(COALESCE(d.heading,0)-c.bearing)))/2*(120+LEAST(c.dist,1500)*0.6/6.5) ELSE 0 END`

// candidateQuery fills in candidateFrom's extra joins and conditions.
func candidateQuery(selectList, joins, where, order string) string {
	return "SELECT " + selectList + fmt.Sprintf(candidateFrom, joins, where) + " ORDER BY " + order + " LIMIT $4::int"
}

// Free captains: travel estimated from straight-line distance (×1.3 for roads, at 6.5 m/s).
var nowCandidateSQL = candidateQuery(`d.user_id::text, c.dist, d.lat, d.lng, `+candidatePenalty+` AS penalty, ar.rate,
 `+turnSeconds+` AS turn, 'now' AS kind, c.dist*1.3/6.5 AS base`,
	"", ` AND NOT EXISTS(SELECT 1 FROM rides busy WHERE busy.driver_id=d.user_id AND busy.status IN ('accepted','arrived','in_progress'))`,
	"c.dist")

// Captains finishing a nearby trip: time to their drop-off, a handover allowance, then the drive
// from that drop-off to this pickup. Only solo trips, only one next ride at a time.
var nextCandidateSQL = candidateQuery(fmt.Sprintf(`d.user_id::text, c.dist, d.lat, d.lng, `+candidatePenalty+` AS penalty, ar.rate,
 0::float8 AS turn, 'next' AS kind, n.remain*1.3/6.5+%d+n.gap*1.3/6.5 AS base`, nextHandoverSeconds),
	` JOIN rides cur ON cur.driver_id=d.user_id AND cur.status='in_progress' AND cur.group_id IS NULL
 JOIN quotes cq ON cq.id=cur.quote_id
 CROSS JOIN LATERAL (SELECT `+meterSQL("d.lat", "d.lng", "cq.dropoff_lat", "cq.dropoff_lng")+` AS remain,
   `+meterSQL("cq.dropoff_lat", "cq.dropoff_lng", "q.pickup_lat", "q.pickup_lng")+` AS gap) n`,
	fmt.Sprintf(` AND r.group_id IS NULL AND n.remain<=%d AND n.gap<=%d
 AND NOT EXISTS(SELECT 1 FROM rides nx WHERE nx.next_driver_id=d.user_id AND nx.status='requested' AND nx.reserved_until>now())`, nextRemainMeters, nextGapMeters),
	"n.remain+n.gap")

type openRide struct {
	id     string
	stage  int
	window bool
}

type pick struct {
	id            string
	dist, score   float64
	lat, lng, eta float64
	penalty, rate float64
	turn, base    float64
	kind, source  string
}

// DispatchStaged runs one matching tick: it claims the requests that are due, finds candidates
// for each, assigns captains to requests together (best pairs first), and records the offers.
// Any number of API instances may run it: rides are claimed with a short lease (FOR UPDATE SKIP LOCKED).
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
	busy := s.areaPressure(ctx)
	plans := make([]*ridePlan, len(rides))
	jobs := make(chan int)
	var wg sync.WaitGroup
	var mu sync.Mutex
	var first error
	for w := 0; w < dispatchWorkers && w < len(rides); w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range jobs {
				p, e := s.planRide(ctx, rides[i], busy)
				if e != nil {
					mu.Lock()
					if first == nil {
						first = e
					}
					mu.Unlock()
					continue
				}
				plans[i] = p
			}
		}()
	}
	for i := range rides {
		jobs <- i
	}
	close(jobs)
	wg.Wait()
	assignCaptains(plans)
	for _, p := range plans {
		if p == nil {
			continue
		}
		if e := s.writeOffers(ctx, p); e != nil && first == nil {
			first = e
		}
	}
	return first
}

// ridePlan is one request's candidates for this tick and the captains assigned to it.
type ridePlan struct {
	ride     openRide
	stage    int // the round being run (index into rounds; ≥ len(rounds) means the sweep)
	round    round
	want     int
	picks    []pick
	assigned []pick
	closed   bool // the ride is no longer open; nothing to write
}

// planRide finds the first round (from the ride's current one) that has any eligible captain.
func (s *Server) planRide(ctx context.Context, ride openRide, busy map[string]bool) (*ridePlan, error) {
	var area, category string
	var lat, lng float64
	e := s.DB.QueryRow(ctx, `SELECT q.area_id::text,q.vehicle_category,q.pickup_lat,q.pickup_lng FROM rides r JOIN quotes q ON q.id=r.quote_id
 WHERE r.id=$1 AND r.status='requested' AND r.expires_at>now() AND r.share_state<>'waiting' AND (r.group_id IS NULL OR r.group_leader)`, ride.id).Scan(&area, &category, &lat, &lng)
	if errors.Is(e, pgx.ErrNoRows) {
		return &ridePlan{ride: ride, closed: true}, nil
	}
	if e != nil {
		return nil, e
	}
	// While a favourite-driver or negotiated reservation is active, only the first round runs
	// (at the widest radius), and only if someone qualifies.
	if ride.window {
		if ride.stage > 0 {
			return &ridePlan{ride: ride, closed: true}, nil
		}
		r := rounds[len(rounds)-1]
		r.size = rounds[0].size
		picks, e := s.candidates(ctx, s.DB, ride.id, area, category, lat, lng, r.radius, 8, s.dispatchRoadETAs(ctx, ride.id))
		if e != nil {
			return nil, e
		}
		return &ridePlan{ride: ride, stage: 0, round: r, want: r.size, picks: picks, closed: len(picks) == 0}, nil
	}
	road := s.dispatchRoadETAs(ctx, ride.id)
	for stage := ride.stage; ; stage++ {
		r := roundFor(stage)
		want := r.size
		if busy[area] && stage < 2 {
			want = 2 // many open requests, few free captains: two at once, so riders aren't kept waiting
		}
		picks, e := s.candidates(ctx, s.DB, ride.id, area, category, lat, lng, r.radius, want*3+2, road)
		if e != nil {
			return nil, e
		}
		if len(picks) > 0 || stage >= len(rounds) {
			return &ridePlan{ride: ride, stage: stage, round: r, want: want, picks: picks}, nil
		}
	}
}

// assignCaptains gives each request its best captains, best pairs first across all requests, and
// never gives one captain two requests in the same tick.
func assignCaptains(plans []*ridePlan) {
	type pair struct {
		plan *ridePlan
		pick pick
	}
	var pairs []pair
	for _, p := range plans {
		if p == nil || p.closed {
			continue
		}
		for _, c := range p.picks {
			pairs = append(pairs, pair{p, c})
		}
	}
	sort.SliceStable(pairs, func(i, j int) bool {
		if pairs[i].pick.score == pairs[j].pick.score {
			return pairs[i].plan.ride.id+pairs[i].pick.id < pairs[j].plan.ride.id+pairs[j].pick.id
		}
		return pairs[i].pick.score < pairs[j].pick.score
	})
	used := map[string]*ridePlan{}
	for _, x := range pairs {
		if used[x.pick.id] != nil || len(x.plan.assigned) >= x.plan.want {
			continue
		}
		used[x.pick.id] = x.plan
		x.plan.assigned = append(x.plan.assigned, x.pick)
	}
	// Best-pairs-first can leave a request with nobody when its only captain went to another
	// request that had other options. Hand that captain over and give the other request its next
	// free option instead (each swap takes a captain nobody had, so this always finishes).
	for _, p := range plans {
		if p == nil || p.closed {
			continue
		}
		for _, c := range p.picks {
			if len(p.assigned) >= p.want {
				break
			}
			holder := used[c.id]
			if holder == nil || holder == p {
				continue
			}
			for _, alt := range holder.picks {
				if used[alt.id] != nil {
					continue
				}
				for i := range holder.assigned {
					if holder.assigned[i].id == c.id {
						holder.assigned[i] = alt
					}
				}
				used[alt.id], used[c.id] = holder, p
				p.assigned = append(p.assigned, c)
				break
			}
		}
	}
}

// roundWait shortens a round when the offered captains rarely accept, so the rider isn't kept
// waiting on someone who probably won't respond.
func roundWait(r round, assigned []pick) time.Duration {
	best := 0.0
	for _, p := range assigned {
		best = max(best, p.rate)
	}
	return max(minimumWait, time.Duration(float64(r.wait)*(0.5+0.5*best)))
}

// writeOffers records a plan's offers and schedules the ride's next round.
func (s *Server) writeOffers(ctx context.Context, p *ridePlan) error {
	if p.closed && p.ride.window {
		return nil // reservation window with nobody eligible: wait for the window to end
	}
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	var open bool
	if e = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM rides WHERE id=$1 AND status='requested' AND expires_at>now()) FROM rides WHERE id=$1 FOR UPDATE`, p.ride.id).Scan(&open); errors.Is(e, pgx.ErrNoRows) || (e == nil && !open) {
		return nil
	}
	if e != nil {
		return e
	}
	if p.closed {
		return nil
	}
	wait := roundWait(p.round, p.assigned)
	for _, c := range p.assigned {
		if _, e = tx.Exec(ctx, `INSERT INTO ride_offers(ride_id,driver_id,stage,score,eta_seconds,eta_source,kind,expires_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,now()+$8::interval)
 ON CONFLICT (ride_id,driver_id) DO UPDATE SET stage=EXCLUDED.stage,score=EXCLUDED.score,eta_seconds=EXCLUDED.eta_seconds,
   eta_source=EXCLUDED.eta_source,kind=EXCLUDED.kind,expires_at=EXCLUDED.expires_at,offered_at=now(),displayed_at=NULL
 WHERE ride_offers.outcome IS NULL`,
			p.ride.id, c.id, p.stage+1, c.score, int(c.eta), c.source, c.kind, fmt.Sprintf("%d milliseconds", wait.Milliseconds())); e != nil {
			return e
		}
	}
	next, due := p.stage, wait
	switch {
	case len(p.assigned) > 0:
		next = min(p.stage+1, len(rounds))
	case len(p.picks) > 0:
		due = time.Second // every candidate went to another request this tick: try again shortly
	default:
		next, due = len(rounds), sweep.wait // nobody anywhere yet: keep sweeping
	}
	if _, e = tx.Exec(ctx, "UPDATE rides SET dispatch_stage=$2,dispatch_at=now(),dispatch_due=now()+$3::interval,dispatch_lease=NULL WHERE id=$1",
		p.ride.id, next, fmt.Sprintf("%d milliseconds", due.Milliseconds())); e != nil {
		return e
	}
	return tx.Commit(ctx)
}

// areaPressure marks areas with more open requests than free captains.
func (s *Server) areaPressure(ctx context.Context) map[string]bool {
	out := map[string]bool{}
	rows, e := s.DB.Query(ctx, `SELECT a.id::text,
 (SELECT count(*) FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE q.area_id=a.id AND r.status='requested' AND r.expires_at>now()),
 (SELECT count(*) FROM drivers d WHERE d.area_id=a.id AND d.online AND d.status='approved' AND d.location_at>now()-interval '60 seconds'
   AND NOT EXISTS(SELECT 1 FROM rides b WHERE b.driver_id=d.user_id AND b.status IN ('accepted','arrived','in_progress')))
 FROM areas a WHERE a.active`)
	if e != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var open, free int
		if rows.Scan(&id, &open, &free) == nil && open >= 3 && open > free {
			out[id] = true
		}
	}
	return out
}

// settleOffers marks the outcome of offers whose ride is no longer open, and releases next-ride
// holds whose captain didn't finish in time. One instance at a time.
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
	if _, e = tx.Exec(ctx, `UPDATE rides SET next_driver_id=NULL,reserved_driver_id=NULL,reserved_until=NULL,dispatch_due=now(),version=version+1,updated_at=now()
 WHERE status='requested' AND next_driver_id IS NOT NULL AND reserved_until<=now()`); e != nil {
		return e
	}
	return tx.Commit(ctx)
}

// claimRides leases the open rides whose next round is due. Rides held for a captain's next ride
// wait for that captain.
func (s *Server) claimRides(ctx context.Context) ([]openRide, error) {
	rows, e := s.DB.Query(ctx, `UPDATE rides SET dispatch_lease=now()+interval '10 seconds' WHERE id IN (
 SELECT id FROM rides WHERE status='requested' AND expires_at>now() AND share_state<>'waiting' AND (group_id IS NULL OR group_leader)
 AND (dispatch_due IS NULL OR dispatch_due<=now())
 AND NOT (next_driver_id IS NOT NULL AND reserved_until>now())
 AND (dispatch_lease IS NULL OR dispatch_lease<now())
 ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED)
 RETURNING id::text, dispatch_stage, COALESCE(favorite_first_until>now() OR reserved_until>now(),false)`, dispatchBatch)
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

// candidates scores eligible captains: free ones, plus those finishing a nearby trip. The nearest
// come from the Redis GEO index; PostgreSQL validates and ranks only that shortlist. It falls back
// to the bounding-box query when Redis has no shortlist or the shortlist was cut off and nothing
// qualified.
func (s *Server) candidates(ctx context.Context, tx candidateQuerier, rideID, area, category string, lat, lng, radius float64, limit int, road map[string]float64) ([]pick, error) {
	ids, truncated := s.shortlistLive(ctx, area, category, lat, lng, radius)
	query := func(sql string, ids []string) ([]pick, error) {
		rows, e := tx.Query(ctx, sql, rideID, radius, radius, max(limit, 24), ids)
		if e != nil {
			return nil, e
		}
		defer rows.Close()
		var out []pick
		for rows.Next() {
			var p pick
			if e = rows.Scan(&p.id, &p.dist, &p.lat, &p.lng, &p.penalty, &p.rate, &p.turn, &p.kind, &p.base); e != nil {
				return nil, e
			}
			out = append(out, p)
		}
		return out, rows.Err()
	}
	run := func(ids []string) ([]pick, error) {
		free, e := query(nowCandidateSQL, ids)
		if e != nil {
			return nil, e
		}
		finishing, e := query(nextCandidateSQL, ids)
		if e != nil {
			return nil, e
		}
		return rankCandidates(append(free, finishing...), road, limit), nil
	}
	if len(ids) > 0 {
		picks, e := run(ids)
		if e != nil || len(picks) > 0 || !truncated {
			return picks, e
		}
	}
	return run(nil)
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
