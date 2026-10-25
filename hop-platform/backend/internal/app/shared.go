package app

import (
	"context"
	"encoding/json"
	"errors"
	"sort"

	"github.com/jackc/pgx/v5"
)

// Shared rides: two riders whose pickups are within 500 m, drops within 1 km and requests within 5 minutes
// ride with one driver. Each rider keeps their own ride, price, payment and pickup code.
const (
	sharedDiscountPercent = 25
	shareWait             = "3 minutes"
	shareWaitSeconds      = 180
	sharePickupMeters     = 500
	shareDropMeters       = 1000
	shareWindow           = "5 minutes"
)

// sharedFare is the per-rider price when sharing.
func sharedFare(fare int64) int64 {
	return fare * (100 - sharedDiscountPercent) / 100
}

// sharedEligible reports whether a quote can be offered a shared price: city trips only, no extra stops, no bikes.
func sharedEligible(category, tripType string, stops int) bool {
	return tripType == "city" && stops == 0 && category != "bike"
}

// driverEarnsMore reports whether the driver's combined shared fares clearly beat the longer single ride.
func driverEarnsMore(a, b int64) bool {
	return (a+b)*10 > max(a, b)*11
}

// groupFareExtra is the fare of the other rider in a shared group, added to the leader's offer so drivers see the total.
const groupFareExtra = `COALESCE((SELECT sum(COALESCE(f.offered_fare_paise,fq.fare_paise)) FROM rides f JOIN quotes fq ON fq.id=f.quote_id WHERE f.group_id=r.group_id AND f.id<>r.id AND f.status='requested'),0)`

// requestable limits dispatch and offers to rides that are ready for a driver: not waiting for a match, and
// only the leader of a matched pair.
const requestable = ` AND r.share_state<>'waiting' AND (r.group_id IS NULL OR r.group_leader)`

type planStop struct {
	RideID string  `json:"ride_id"`
	Kind   string  `json:"kind"` // pickup | drop
	Label  string  `json:"label"`
	Lat    float64 `json:"lat"`
	Lng    float64 `json:"lng"`
	Rider  string  `json:"rider"`
}

type shareLeg struct {
	RideID, Rider, PickupLabel, DropLabel string
	Pickup, Drop                          Point
}

// planStops orders the stops: the nearer pickup first, then the second pickup, then drops nearest-first.
func planStops(driver Point, a, b shareLeg) []planStop {
	first, second := a, b
	if distance(driver, b.Pickup) < distance(driver, a.Pickup) {
		first, second = b, a
	}
	drops := []shareLeg{first, second}
	sort.SliceStable(drops, func(i, j int) bool {
		return distance(second.Pickup, drops[i].Drop) < distance(second.Pickup, drops[j].Drop)
	})
	stop := func(l shareLeg, kind string) planStop {
		p, label := l.Pickup, l.PickupLabel
		if kind == "drop" {
			p, label = l.Drop, l.DropLabel
		}
		return planStop{RideID: l.RideID, Kind: kind, Label: label, Lat: p.Lat, Lng: p.Lng, Rider: l.Rider}
	}
	return []planStop{stop(first, "pickup"), stop(second, "pickup"), stop(drops[0], "drop"), stop(drops[1], "drop")}
}

// hasMobile is true when the account has a mobile number (phone login or a number saved in the profile).
func hasMobile(ctx context.Context, db querier, uid string) bool {
	var ok bool
	e := db.QueryRow(ctx, `SELECT COALESCE((SELECT phone<>'' FROM account_profiles WHERE account_id=$1),false) OR EXISTS(SELECT 1 FROM accounts WHERE id=$1 AND issuer='phone')`, uid).Scan(&ok)
	return e == nil && ok
}

const mobileRequired = "Add your mobile number in Profile before you ride or drive"

// MatchShared moves waiting riders to a normal ride at the shared price when the wait is over, and pairs
// compatible riders. One instance at a time.
func (s *Server) MatchShared(ctx context.Context) error {
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	var locked bool
	if e = tx.QueryRow(ctx, "SELECT pg_try_advisory_xact_lock(8472103)").Scan(&locked); e != nil || !locked {
		return e
	}
	rows, e := tx.Query(ctx, `UPDATE rides SET share_state='solo_shared',version=version+1,updated_at=now() WHERE status='requested' AND share_state='waiting' AND share_until<=now() RETURNING rider_id::text`)
	if e != nil {
		return e
	}
	var timedOut []string
	for rows.Next() {
		var id string
		if e = rows.Scan(&id); e != nil {
			return e
		}
		timedOut = append(timedOut, id)
	}
	rows.Close()
	for _, id := range timedOut {
		if e = notify(ctx, tx, id, "ride", "No shared match yet", "We are finding you a driver now at the shared price. You can also pay the full fare from the ride screen."); e != nil {
			return e
		}
	}
	pairs, e := tx.Query(ctx, `SELECT a.id::text,b.id::text FROM rides a JOIN quotes qa ON qa.id=a.quote_id
 JOIN rides b ON b.id<>a.id AND b.created_at>=a.created_at JOIN quotes qb ON qb.id=b.quote_id
 WHERE a.status='requested' AND b.status='requested' AND a.group_id IS NULL AND b.group_id IS NULL
 AND a.share_state IN ('waiting','solo_shared') AND b.share_state IN ('waiting','solo_shared') AND (a.share_state='waiting' OR b.share_state='waiting')
 AND a.rider_id<>b.rider_id AND a.expires_at>now() AND b.expires_at>now()
 AND qa.area_id=qb.area_id AND qa.vehicle_category=qb.vehicle_category AND qa.pink=qb.pink
 AND b.created_at-a.created_at<=$1::interval
 AND (NOT qa.pink OR ((SELECT gender FROM account_profiles WHERE account_id=a.rider_id)='female' AND (SELECT gender FROM account_profiles WHERE account_id=b.rider_id)='female'))
 AND 6371000*acos(least(1,greatest(-1,sin(radians(qa.pickup_lat))*sin(radians(qb.pickup_lat))+cos(radians(qa.pickup_lat))*cos(radians(qb.pickup_lat))*cos(radians(qa.pickup_lng-qb.pickup_lng)))))<=$2
 AND 6371000*acos(least(1,greatest(-1,sin(radians(qa.dropoff_lat))*sin(radians(qb.dropoff_lat))+cos(radians(qa.dropoff_lat))*cos(radians(qb.dropoff_lat))*cos(radians(qa.dropoff_lng-qb.dropoff_lng)))))<=$3
 AND (COALESCE(a.offered_fare_paise,qa.fare_paise)+COALESCE(b.offered_fare_paise,qb.fare_paise))*10>GREATEST(qa.fare_paise,qb.fare_paise)*11
 ORDER BY a.created_at,b.created_at LIMIT 20`, shareWindow, sharePickupMeters, shareDropMeters)
	if e != nil {
		return e
	}
	type pair struct{ a, b string }
	var found []pair
	for pairs.Next() {
		var p pair
		if e = pairs.Scan(&p.a, &p.b); e != nil {
			return e
		}
		found = append(found, p)
	}
	pairs.Close()
	for _, p := range found {
		if e = s.linkPair(ctx, tx, p.a, p.b); e != nil {
			return e
		}
	}
	return tx.Commit(ctx)
}

// linkPair re-checks both rides under row locks (a driver may be accepting one right now) and groups them.
// The older ride leads: it is the one drivers are offered.
func (s *Server) linkPair(ctx context.Context, tx pgx.Tx, a, b string) error {
	rows, e := tx.Query(ctx, `SELECT id::text,rider_id::text FROM rides WHERE id IN ($1,$2) AND status='requested' AND group_id IS NULL AND share_state IN ('waiting','solo_shared') ORDER BY id FOR UPDATE`, a, b)
	if e != nil {
		return e
	}
	riders := map[string]string{}
	for rows.Next() {
		var id, rider string
		if e = rows.Scan(&id, &rider); e != nil {
			return e
		}
		riders[id] = rider
	}
	rows.Close()
	if len(riders) != 2 {
		return nil
	}
	var group string
	if e = tx.QueryRow(ctx, "INSERT INTO ride_groups DEFAULT VALUES RETURNING id::text").Scan(&group); e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, `UPDATE rides SET group_id=$1,group_leader=(id=$2),share_state='matched',share_until=NULL,
 expires_at=(SELECT max(expires_at) FROM rides WHERE id IN ($2,$3)),version=version+1,updated_at=now() WHERE id IN ($2,$3)`, group, a, b); e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, "DELETE FROM ride_offers WHERE ride_id=$1", b); e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, "DELETE FROM ride_bids WHERE ride_id IN ($1,$2)", a, b); e != nil {
		return e
	}
	for id, rider := range riders {
		if e = audit(ctx, tx, rider, id, "shared_matched", map[string]string{"group": group}); e != nil {
			return e
		}
		if e = notify(ctx, tx, rider, "ride", "Shared ride matched", "You are sharing this trip with another rider. You pay your own lower fare and have your own pickup code."); e != nil {
			return e
		}
	}
	return nil
}

// releaseOrphans turns a requested ride whose partner cancelled or expired back into a normal ride at the shared price.
func releaseOrphans(ctx context.Context, tx pgx.Tx) error {
	rows, e := tx.Query(ctx, `UPDATE rides f SET group_id=NULL,group_leader=false,share_state='solo_shared',version=version+1,updated_at=now()
 WHERE f.status='requested' AND f.group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM rides o WHERE o.group_id=f.group_id AND o.id<>f.id AND o.status IN ('requested','accepted','arrived','in_progress'))
 RETURNING f.rider_id::text`)
	if e != nil {
		return e
	}
	var riders []string
	for rows.Next() {
		var id string
		if e = rows.Scan(&id); e != nil {
			return e
		}
		riders = append(riders, id)
	}
	rows.Close()
	for _, id := range riders {
		if e = notify(ctx, tx, id, "ride", "Your shared partner left", "We are finding you a driver now at the shared price."); e != nil {
			return e
		}
	}
	return nil
}

// acceptGroup assigns the follower to the same driver and stores the stop order. Called inside the accept transaction.
func (s *Server) acceptGroup(ctx context.Context, tx pgx.Tx, leaderID, driver string, at Point) error {
	rows, e := tx.Query(ctx, `SELECT r.id::text,r.group_id::text,r.rider_id::text,split_part(a.name,' ',1),q.pickup_label,q.dropoff_label,q.pickup_lat,q.pickup_lng,q.dropoff_lat,q.dropoff_lng
 FROM rides r JOIN quotes q ON q.id=r.quote_id JOIN accounts a ON a.id=r.rider_id
 WHERE r.group_id=(SELECT group_id FROM rides WHERE id=$1) AND r.status='requested' ORDER BY r.id FOR UPDATE OF r`, leaderID)
	if e != nil {
		return e
	}
	var legs []shareLeg
	var group string
	riders := map[string]string{}
	for rows.Next() {
		var l shareLeg
		var rider string
		if e = rows.Scan(&l.RideID, &group, &rider, &l.Rider, &l.PickupLabel, &l.DropLabel, &l.Pickup.Lat, &l.Pickup.Lng, &l.Drop.Lat, &l.Drop.Lng); e != nil {
			return e
		}
		riders[l.RideID] = rider
		legs = append(legs, l)
	}
	rows.Close()
	if len(legs) != 2 {
		return errors.New("shared ride partner is no longer available")
	}
	plan, _ := json.Marshal(planStops(at, legs[0], legs[1]))
	if _, e = tx.Exec(ctx, "UPDATE ride_groups SET driver_id=$2,stop_plan=$3 WHERE id=$1", group, driver, plan); e != nil {
		return e
	}
	for _, l := range legs {
		if l.RideID == leaderID {
			continue
		}
		if _, e = tx.Exec(ctx, "UPDATE rides SET status='accepted',driver_id=$2,version=version+1,updated_at=now() WHERE id=$1", l.RideID, driver); e != nil {
			return e
		}
		if e = audit(ctx, tx, driver, l.RideID, "accepted", map[string]string{"shared": group}); e != nil {
			return e
		}
		if e = notifyRideStatus(ctx, tx, l.RideID, "accepted", driver, riders[l.RideID], driver); e != nil {
			return e
		}
	}
	return nil
}

// shareAction handles the rider's choices on a shared request: stop waiting, or pay the full fare instead.
func (s *Server) shareAction(ctx context.Context, tx pgx.Tx, action, id string) (bool, error) {
	var tag string
	switch action {
	case "stop_waiting":
		tag = `UPDATE rides SET share_state='solo_shared',share_until=NULL,version=version+1,updated_at=now() WHERE id=$1 AND status='requested' AND share_state='waiting'`
	case "pay_full_fare":
		tag = `UPDATE rides SET share_state='solo_full',share_until=NULL,offered_fare_paise=NULL,version=version+1,updated_at=now() WHERE id=$1 AND status='requested' AND share_state IN ('waiting','solo_shared')`
	default:
		return false, nil
	}
	res, e := tx.Exec(ctx, tag, id)
	if e != nil {
		return false, e
	}
	return res.RowsAffected() == 1, nil
}

// shareView adds the co-rider and stop order to ride JSON. Riders never see the other rider's addresses.
func (s *Server) shareView(ctx context.Context, uid string, list []map[string]any) {
	for _, ride := range list {
		gid, _ := ride["group_id"].(string)
		if gid == "" {
			continue
		}
		id, _ := ride["id"].(string)
		var name, status string
		if s.DB.QueryRow(ctx, `SELECT split_part(a.name,' ',1),r.status FROM rides r JOIN accounts a ON a.id=r.rider_id WHERE r.group_id=$1 AND r.id<>$2 LIMIT 1`, gid, id).Scan(&name, &status) == nil {
			ride["co_rider"] = map[string]any{"name": name, "status": status}
		}
		var raw []byte
		if s.DB.QueryRow(ctx, "SELECT stop_plan FROM ride_groups WHERE id=$1", gid).Scan(&raw) != nil {
			continue
		}
		var plan []planStop
		if json.Unmarshal(raw, &plan) != nil || len(plan) == 0 {
			continue
		}
		if ride["driving"] != true {
			for i := range plan {
				if plan[i].RideID != id {
					plan[i].Label, plan[i].Lat, plan[i].Lng = "Co-rider "+plan[i].Kind, 0, 0
				}
			}
		}
		ride["stop_plan"] = plan
	}
}

// shareOffers adds the second rider and the stop order to driver offers for matched pairs.
func (s *Server) shareOffers(ctx context.Context, driver Point, offers []map[string]any) {
	for _, offer := range offers {
		gid, _ := offer["group_id"].(string)
		id, _ := offer["id"].(string)
		if gid == "" {
			continue
		}
		rows, e := s.DB.Query(ctx, `SELECT r.id::text,split_part(ra.name,' ',1),q.pickup_label,q.dropoff_label,q.pickup_lat,q.pickup_lng,q.dropoff_lat,q.dropoff_lng
 FROM rides r JOIN quotes q ON q.id=r.quote_id JOIN accounts ra ON ra.id=r.rider_id WHERE r.group_id=$1 AND r.status='requested' ORDER BY (r.id::text=$2) DESC`, gid, id)
		if e != nil {
			continue
		}
		legs := []shareLeg{}
		for rows.Next() {
			var l shareLeg
			if rows.Scan(&l.RideID, &l.Rider, &l.PickupLabel, &l.DropLabel, &l.Pickup.Lat, &l.Pickup.Lng, &l.Drop.Lat, &l.Drop.Lng) == nil {
				legs = append(legs, l)
			}
		}
		rows.Close()
		if len(legs) == 2 {
			offer["stop_plan"] = planStops(driver, legs[0], legs[1])
		}
	}
}
