package app

import (
	"context"
	"testing"
	"time"
)

// Captains moving away from the pickup lose to a slightly farther one heading towards it.
func TestRankingPenalisesCaptainsMovingAway(t *testing.T) {
	picks := []pick{
		{id: "away", dist: 800, turn: 200},  // 800 m but needs a U-turn
		{id: "toward", dist: 1200, turn: 0}, // 1.2 km, already heading there
	}
	ranked := rankCandidates(picks, nil, 2)
	if ranked[0].id != "toward" {
		t.Fatalf("captain moving away ranked first: %+v", ranked)
	}
	// With road times, only half the turnaround penalty applies (the router routes from where they are).
	ranked = rankCandidates([]pick{{id: "a", dist: 800, turn: 200}}, map[string]float64{"a": 300}, 1)
	if ranked[0].eta != 400 || ranked[0].source != "road" {
		t.Fatalf("road eta with turn = %+v", ranked[0])
	}
	// A finishing captain's estimate is their own (drop-off, handover, then the drive).
	ranked = rankCandidates([]pick{{id: "n", dist: 300, kind: "next", base: 420}}, map[string]float64{"n": 60}, 1)
	if ranked[0].eta != 420 || ranked[0].source != "next" {
		t.Fatalf("next-ride eta = %+v", ranked[0])
	}
}

// Requests are matched together: best pairs first, without leaving a request short when the
// captain it needs could be swapped for another request's spare option.
func TestBatchAssignmentGivesEachCaptainOneRequest(t *testing.T) {
	a := &ridePlan{ride: openRide{id: "a"}, want: 1, picks: []pick{{id: "x", score: 1}, {id: "y", score: 2}}}
	b := &ridePlan{ride: openRide{id: "b"}, want: 1, picks: []pick{{id: "x", score: 1.5}}}
	assignCaptains([]*ridePlan{a, b})
	if len(a.assigned) != 1 || len(b.assigned) != 1 || a.assigned[0].id != "y" || b.assigned[0].id != "x" {
		t.Fatalf("a=%+v b=%+v", a.assigned, b.assigned)
	}
	c := &ridePlan{ride: openRide{id: "c"}, want: 2, picks: []pick{{id: "x", score: 1}, {id: "y", score: 2}}}
	d := &ridePlan{ride: openRide{id: "d"}, closed: true, picks: []pick{{id: "x", score: 0}}}
	assignCaptains([]*ridePlan{c, d, nil})
	if len(c.assigned) != 2 || len(d.assigned) != 0 {
		t.Fatalf("closed plan or wide round mishandled: c=%+v d=%+v", c.assigned, d.assigned)
	}
}

// Rounds are shorter for captains who rarely accept, but never below the minimum.
func TestRoundWaitAdaptsToAcceptance(t *testing.T) {
	r := round{3000, 1, 8 * time.Second}
	if w := roundWait(r, []pick{{rate: 1}}); w != 8*time.Second {
		t.Fatalf("reliable captain wait %v", w)
	}
	if w := roundWait(r, []pick{{rate: 0.5}}); w != 6*time.Second {
		t.Fatalf("average captain wait %v", w)
	}
	if w := roundWait(r, []pick{{rate: 0}}); w != minimumWait {
		t.Fatalf("unresponsive captain wait %v", w)
	}
}

func liveOffers(f *fixture, ride string) []string {
	f.t.Helper()
	rows, e := f.s.DB.Query(context.Background(), "SELECT driver_id::text FROM ride_offers WHERE ride_id=$1 AND outcome IS NULL AND expires_at>now() ORDER BY driver_id", ride)
	if e != nil {
		f.t.Fatal(e)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		rows.Scan(&id)
		out = append(out, id)
	}
	return out
}

// A request goes to one captain at a time; when their window passes it moves to the next, and
// the first can no longer take it. A decline moves it on at once.
func TestOffersAreExclusiveAndMoveOn(t *testing.T) {
	f := setup(t)
	rider := f.actor("rider", false)
	x, y, z := f.actor("rider", true), f.actor("rider", true), f.actor("rider", true)
	id := f.book(rider, f.quote(rider))
	first := liveOffers(f, id)
	if len(first) != 1 {
		t.Fatalf("first round offered to %d captains, want 1", len(first))
	}
	byID := map[string]client{x.id: x, y.id: y, z.id: z}
	f.elapse(id)
	second := liveOffers(f, id)
	if len(second) != 1 || second[0] == first[0] {
		t.Fatalf("second round %v after %v", second, first)
	}
	require(t, f.act(byID[first[0]], id, "accept", 1, ""), 409) // their window has passed
	// A decline hands it on without waiting for the window.
	code, _ := f.call(byID[second[0]], "POST", "/api/rides/"+id+"/decline", map[string]any{})
	require(t, code, 200)
	f.dispatch()
	// The next round is the wider one (two captains): never the one who declined, and it includes
	// the captain who hasn't seen the request yet.
	third := liveOffers(f, id)
	unseen := ""
	for c := range byID {
		if c != first[0] && c != second[0] {
			unseen = c
		}
	}
	hasUnseen := false
	for _, c := range third {
		if c == second[0] {
			t.Fatalf("offered again to the captain who declined: %v", third)
		}
		hasUnseen = hasUnseen || c == unseen
	}
	if len(third) == 0 || !hasUnseen {
		t.Fatalf("after a decline: %v (unseen %s)", third, unseen)
	}
	require(t, f.act(byID[unseen], id, "accept", 1, ""), 200)
}

// One captain never holds two live requests: the second rider's request waits for another captain.
func TestCaptainHoldsOneLiveOffer(t *testing.T) {
	f := setup(t)
	r1, r2 := f.actor("rider", false), f.actor("rider", false)
	driver := f.actor("rider", true)
	id1 := f.book(r1, f.quote(r1))
	id2 := f.book(r2, f.quote(r2))
	if got := liveOffers(f, id1); len(got) != 1 || got[0] != driver.id {
		t.Fatalf("first request offers %v", got)
	}
	if got := liveOffers(f, id2); len(got) != 0 {
		t.Fatalf("captain holding an offer got a second one: %v", got)
	}
	other := f.actor("rider", true)
	f.elapse(id2)
	if got := liveOffers(f, id2); len(got) != 1 || got[0] != other.id {
		t.Fatalf("second request should go to the free captain: %v", got)
	}
}

// A captain about to drop off near a new pickup is offered it as their next ride; accepting holds
// it, the rider is told, and completing the current trip makes it theirs.
func TestNextRideForCaptainFinishingNearby(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	r1, r2 := f.actor("rider", false), f.actor("rider", false)
	captain := f.actor("rider", true)
	trip := f.book(r1, f.quote(r1)) // Central (13.08, 80.27) → Destination (13.04, 80.23)
	require(t, f.act(captain, trip, "accept", 1, ""), 200)
	require(t, f.act(captain, trip, "arrive", 2, ""), 200)
	require(t, f.act(captain, trip, "start", 3, f.s.pin(trip)), 200)
	// Nearly there: about 600 m from the drop-off.
	if _, e := f.s.DB.Exec(ctx, "UPDATE drivers SET lat=13.045,lng=80.233,location_at=now() WHERE user_id=$1", captain.id); e != nil {
		t.Fatal(e)
	}
	code, q := f.call(r2, "POST", "/api/quotes", map[string]any{"area_id": f.area, "vehicle_category": "bike",
		"pickup": Point{13.041, 80.231, "Near the drop-off"}, "dropoff": Point{13.08, 80.27, "Central"}})
	require(t, code, 201)
	code, out := f.call(r2, "POST", "/api/rides", map[string]any{"quote_id": q["id"], "request_key": "44444444-4444-4444-8444-444444444444", "payment_method": "cash"})
	require(t, code, 201)
	next := out["id"].(string)
	f.dispatch()
	var kind string
	if e := f.s.DB.QueryRow(ctx, "SELECT kind FROM ride_offers WHERE ride_id=$1 AND driver_id=$2", next, captain.id).Scan(&kind); e != nil || kind != "next" {
		t.Fatalf("finishing captain not offered the next ride: %q %v", kind, e)
	}
	_, st := f.call(captain, "GET", "/api/state", nil)
	offers := st["offers"].([]any)
	if len(offers) != 1 || offers[0].(map[string]any)["offer_kind"] != "next" {
		t.Fatalf("captain state offers %v", offers)
	}
	code, held := f.call(captain, "POST", "/api/rides/"+next+"/actions", map[string]any{"action": "accept", "version": 1})
	require(t, code, 200)
	if held["next_ride"] != true {
		t.Fatalf("accept did not hold the next ride: %v", held)
	}
	_, st = f.call(r2, "GET", "/api/state", nil)
	for _, item := range st["rides"].([]any) {
		if ride := item.(map[string]any); ride["id"] == next && (ride["status"] != "requested" || ride["next_ride"] != true) {
			t.Fatalf("rider view of a held next ride: %v", ride)
		}
	}
	// Nobody else is offered a ride that is held.
	other := f.actor("rider", true)
	f.elapse(next)
	for _, d := range liveOffers(f, next) {
		if d == other.id {
			t.Fatal("held next ride offered to another captain")
		}
	}
	f.atDestination(captain, trip)
	require(t, f.act(captain, trip, "complete", 4, ""), 200)
	var status, driver string
	if e := f.s.DB.QueryRow(ctx, "SELECT status,driver_id::text FROM rides WHERE id=$1", next).Scan(&status, &driver); e != nil || status != "accepted" || driver != captain.id {
		t.Fatalf("next ride after completing: %s %s %v", status, driver, e)
	}
}

// A next-ride hold the captain doesn't use in time is released and the search continues.
func TestUnusedNextRideHoldIsReleased(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	rider := f.actor("rider", false)
	captain := f.actor("rider", true)
	id := f.book(rider, f.quote(rider))
	if _, e := f.s.DB.Exec(ctx, "UPDATE rides SET next_driver_id=$2,reserved_driver_id=$2,reserved_until=now()-interval '1 second' WHERE id=$1", id, captain.id); e != nil {
		t.Fatal(e)
	}
	f.dispatch()
	var held *string
	if e := f.s.DB.QueryRow(ctx, "SELECT next_driver_id::text FROM rides WHERE id=$1", id).Scan(&held); e != nil || held != nil {
		t.Fatalf("lapsed hold kept: %v %v", held, e)
	}
}

// The operator matching report counts requests, matches and offer outcomes.
func TestDispatchReport(t *testing.T) {
	f := setup(t)
	rider, op := f.actor("rider", false), f.actor("operator", false)
	driver := f.actor("rider", true)
	id := f.book(rider, f.quote(rider))
	require(t, f.act(driver, id, "accept", 1, ""), 200)
	f.dispatch()
	code, _ := f.call(rider, "GET", "/api/operator/dispatch-report", nil)
	if code != 403 && code != 401 {
		t.Fatalf("riders must not read the matching report: %d", code)
	}
	code, out := f.call(op, "GET", "/api/operator/dispatch-report?days=1&area_id="+f.area, nil)
	require(t, code, 200)
	if out["requests"].(float64) < 1 || out["matched"].(float64) < 1 || out["seconds_to_match_median"] == nil {
		t.Fatalf("report %v", out)
	}
	if outcomes := out["offer_outcomes"].(map[string]any); outcomes["accepted"].(float64) < 1 {
		t.Fatalf("offer outcomes %v", outcomes)
	}
}

// With only one captain nearby, a request they let time out comes back to them; one they
// declined never does.
func TestMissedRequestReturnsDeclinedDoesNot(t *testing.T) {
	f := setup(t)
	rider := f.actor("rider", false)
	only := f.actor("rider", true)
	id := f.book(rider, f.quote(rider))
	f.elapse(id) // the window passes without an answer
	if got := liveOffers(f, id); len(got) != 1 || got[0] != only.id {
		t.Fatalf("missed request not offered again: %v", got)
	}
	code, _ := f.call(only, "POST", "/api/rides/"+id+"/decline", map[string]any{})
	require(t, code, 200)
	f.elapse(id)
	if got := liveOffers(f, id); len(got) != 0 {
		t.Fatalf("declined request offered again: %v", got)
	}
}
