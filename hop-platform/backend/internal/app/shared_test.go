package app

import (
	"context"
	"strings"
	"testing"
)

func TestSharedFareMath(t *testing.T) {
	if sharedFare(9000) != 6750 {
		t.Fatalf("25%% off 9000 should be 6750, got %d", sharedFare(9000))
	}
	if !driverEarnsMore(6750, 6750) || driverEarnsMore(500, 9000) {
		t.Fatal("driver earnings guard is wrong")
	}
	if sharedEligible("bike", "city", 0) || sharedEligible("auto", "city", 1) || sharedEligible("auto", "rental", 0) || !sharedEligible("auto", "city", 0) {
		t.Fatal("eligibility rules are wrong")
	}
}

func TestPlanStopsOrdersPickupsThenNearestDrop(t *testing.T) {
	a := shareLeg{RideID: "a", Rider: "A", Pickup: Point{Lat: 13.0800, Lng: 80.27}, Drop: Point{Lat: 13.00, Lng: 80.27}}
	b := shareLeg{RideID: "b", Rider: "B", Pickup: Point{Lat: 13.0830, Lng: 80.27}, Drop: Point{Lat: 13.02, Lng: 80.27}}
	plan := planStops(Point{Lat: 13.09, Lng: 80.27}, a, b) // the driver is nearest to B
	want := []string{"b:pickup", "a:pickup", "b:drop", "a:drop"}
	for i, stop := range plan {
		if stop.RideID+":"+stop.Kind != want[i] {
			t.Fatalf("stop %d is %s:%s, want %s", i, stop.RideID, stop.Kind, want[i])
		}
	}
}

func (f *fixture) autoPricing() {
	f.t.Helper()
	op := f.actor("operator", false)
	code, _ := f.call(op, "POST", "/api/operator/pricing", map[string]any{"area_id": f.area, "category": "auto", "base_paise": 3000, "per_km_paise": 1200, "minimum_paise": 4000, "enabled": true})
	require(f.t, code, 200)
}

// shareQuote quotes an auto ride (₹90.00 on the fixture route) between the given points.
func (f *fixture) shareQuote(c client, pickupLat, dropLat float64, extra map[string]any) map[string]any {
	f.t.Helper()
	body := map[string]any{"area_id": f.area, "vehicle_category": "auto", "pickup": Point{pickupLat, 80.27, "Pickup"}, "dropoff": Point{dropLat, 80.23, "Drop"}}
	for k, v := range extra {
		body[k] = v
	}
	code, out := f.call(c, "POST", "/api/quotes", body)
	require(f.t, code, 201)
	return out
}

func (f *fixture) bookShared(c client, q map[string]any, share bool) string {
	f.t.Helper()
	code, out := f.call(c, "POST", "/api/rides", map[string]any{"quote_id": q["id"], "request_key": "22222222-2222-4222-8222-" + strings.ReplaceAll(c.id, "-", "")[:12], "payment_method": "cash", "share": share})
	if code != 201 {
		f.t.Fatalf("book %d %#v", code, out)
	}
	return out["id"].(string)
}

func (f *fixture) matchShared() {
	f.t.Helper()
	if e := f.s.MatchShared(context.Background()); e != nil {
		f.t.Fatal(e)
	}
	f.dispatch()
}

func (f *fixture) rideState(c client, id string) map[string]any {
	f.t.Helper()
	_, state := f.call(c, "GET", "/api/state", nil)
	for _, r := range state["rides"].([]any) {
		if m := r.(map[string]any); m["id"] == id {
			return m
		}
	}
	f.t.Fatalf("ride %s not in state", id)
	return nil
}

func TestSharedRideMatchesAndEachRiderPaysOwnShare(t *testing.T) {
	f := setup(t)
	f.autoPricing()
	a, b, d := f.actor("rider", false), f.actor("rider", false), f.actor("rider", true)
	f.s.DB.Exec(context.Background(), "UPDATE drivers SET vehicle_category='auto' WHERE user_id=$1", d.id)

	qa := f.shareQuote(a, 13.0800, 13.04, nil)
	qb := f.shareQuote(b, 13.0830, 13.045, nil) // about 330 m and 550 m away from A
	if qa["fare_paise"] != float64(9000) || qa["shared_fare_paise"] != float64(6750) {
		t.Fatalf("quote did not offer the shared price: %#v", qa)
	}
	ra := f.bookShared(a, qa, true)
	f.dispatch()
	_, state := f.call(d, "GET", "/api/state", nil)
	if len(state["offers"].([]any)) != 0 {
		t.Fatal("a rider still waiting for a match must not be offered to drivers")
	}
	if f.rideState(a, ra)["share_state"] != "waiting" {
		t.Fatal("rider should be waiting")
	}

	rb := f.bookShared(b, qb, true)
	f.matchShared()
	if f.rideState(a, ra)["share_state"] != "matched" || f.rideState(b, rb)["share_state"] != "matched" {
		t.Fatal("riders were not matched")
	}
	_, state = f.call(d, "GET", "/api/state", nil)
	offers := state["offers"].([]any)
	if len(offers) != 1 {
		t.Fatalf("driver should see exactly one request for the pair, got %d", len(offers))
	}
	offer := offers[0].(map[string]any)
	if offer["fare_paise"] != float64(13500) {
		t.Fatalf("driver should see both shares (13500), got %v", offer["fare_paise"])
	}
	if len(offer["stop_plan"].([]any)) != 4 {
		t.Fatalf("offer should carry four ordered stops: %#v", offer["stop_plan"])
	}

	require(t, f.act(d, offer["id"].(string), "accept", int(offer["version"].(float64)), ""), 200)
	sa, sb := f.rideState(a, ra), f.rideState(b, rb)
	if sa["status"] != "accepted" || sb["status"] != "accepted" {
		t.Fatalf("both rides should be accepted: %v %v", sa["status"], sb["status"])
	}
	if sa["pickup_code"] == "" || sa["pickup_code"] == sb["pickup_code"] {
		t.Fatalf("each rider needs their own pickup code: %v %v", sa["pickup_code"], sb["pickup_code"])
	}
	if sa["payable_paise"] != float64(6750) || sb["payable_paise"] != float64(6750) {
		t.Fatalf("each rider pays their own share: %v %v", sa["payable_paise"], sb["payable_paise"])
	}
	if p := sa["stop_plan"].([]any)[0].(map[string]any); p["ride_id"] == rb && p["lat"] != float64(0) {
		t.Fatal("a rider must not see the other rider's address")
	}

	for _, id := range []string{ra, rb} {
		s := f.rideState(d, id)
		require(t, f.act(d, id, "arrive", int(s["version"].(float64)), ""), 200)
	}
	sb = f.rideState(d, rb)
	require(t, f.act(d, rb, "start", int(sb["version"].(float64)), f.rideState(a, ra)["pickup_code"].(string)), 400) // A's code does not start B's ride
	require(t, f.act(d, rb, "start", int(sb["version"].(float64)), f.rideState(b, rb)["pickup_code"].(string)), 200)
}

func TestSharedRideFallbackAndFullFare(t *testing.T) {
	f := setup(t)
	f.autoPricing()
	a, d := f.actor("rider", false), f.actor("rider", true)
	f.s.DB.Exec(context.Background(), "UPDATE drivers SET vehicle_category='auto' WHERE user_id=$1", d.id)
	ra := f.bookShared(a, f.shareQuote(a, 13.0800, 13.04, nil), true)
	f.s.DB.Exec(context.Background(), "UPDATE rides SET share_until=now()-interval '1 second' WHERE id=$1", ra)
	f.matchShared()
	s := f.rideState(a, ra)
	if s["share_state"] != "solo_shared" || s["fare_paise"] != float64(6750) {
		t.Fatalf("no match should give a normal ride at the shared price: %#v", s["share_state"])
	}
	_, state := f.call(d, "GET", "/api/state", nil)
	if len(state["offers"].([]any)) != 1 {
		t.Fatal("the fallback ride should now be offered to drivers")
	}
	require(t, f.act(a, ra, "pay_full_fare", int(s["version"].(float64)), ""), 200)
	s = f.rideState(a, ra)
	if s["share_state"] != "solo_full" || s["payable_paise"] != float64(9000) {
		t.Fatalf("full fare should restore the solo price: %#v", s)
	}
}

func TestSharedRideRulesNeverMatchPinkWithMenOptOutOrFarRiders(t *testing.T) {
	f := setup(t)
	f.autoPricing()
	woman, man, other := f.actor("rider", false), f.actor("rider", false), f.actor("rider", false)
	f.s.DB.Exec(context.Background(), "INSERT INTO account_profiles(account_id,gender) VALUES($1,'female') ON CONFLICT(account_id) DO UPDATE SET gender='female'", woman.id)
	f.s.DB.Exec(context.Background(), "UPDATE account_profiles SET gender='male' WHERE account_id=$1", man.id)

	rp := f.bookShared(woman, f.shareQuote(woman, 13.0800, 13.04, map[string]any{"pink": true}), true)
	rm := f.bookShared(man, f.shareQuote(man, 13.0810, 13.04, nil), true)
	f.matchShared()
	if f.rideState(woman, rp)["share_state"] != "waiting" || f.rideState(man, rm)["share_state"] != "waiting" {
		t.Fatal("a pink ride must never be shared with a man")
	}

	// A rider who opted out is never matched, and neither is one whose pickup is about 1 km away.
	ro := f.bookShared(other, f.shareQuote(other, 13.0805, 13.04, nil), false)
	f.matchShared()
	if f.rideState(other, ro)["share_state"] != "none" || f.rideState(man, rm)["share_state"] != "waiting" {
		t.Fatal("opted-out rider was matched")
	}
	far := f.actor("rider", false)
	rf := f.bookShared(far, f.shareQuote(far, 13.0900, 13.04, nil), true)
	f.matchShared()
	if f.rideState(far, rf)["share_state"] != "waiting" {
		t.Fatal("a rider 1 km away must not be matched")
	}
}

func TestSharedPartnerCancelLeavesTheOtherRiderAtTheSharedPrice(t *testing.T) {
	f := setup(t)
	f.autoPricing()
	a, b := f.actor("rider", false), f.actor("rider", false)
	ra := f.bookShared(a, f.shareQuote(a, 13.0800, 13.04, nil), true)
	rb := f.bookShared(b, f.shareQuote(b, 13.0820, 13.045, nil), true)
	f.matchShared()
	sa := f.rideState(a, ra)
	if sa["co_rider"] == nil {
		t.Fatal("rider should see the co-rider's first name")
	}
	require(t, f.act(a, ra, "cancel", int(sa["version"].(float64)), ""), 200)
	if s := f.rideState(b, rb); s["share_state"] != "solo_shared" || s["group_id"] != nil {
		t.Fatalf("the other rider should continue as a normal ride: %#v", s["share_state"])
	}
}

func TestMobileNumberRequiredToRideAndDrive(t *testing.T) {
	f := setup(t)
	rider := f.actor("rider", false)
	f.s.DB.Exec(context.Background(), "UPDATE account_profiles SET phone='' WHERE account_id=$1", rider.id)
	code, _ := f.call(rider, "POST", "/api/rides", map[string]any{"quote_id": f.quote(rider), "request_key": "33333333-3333-4333-8333-" + strings.ReplaceAll(rider.id, "-", "")[:12], "payment_method": "cash"})
	require(t, code, 403)
	code, _ = f.call(rider, "POST", "/api/drivers/apply", map[string]any{"area_id": f.area, "vehicle_category": "bike", "vehicle_number": "TN01AB1234", "license_reference": "DL-12345", "insurance_reference": "INS-12345", "license_expires": "2099-01-01", "insurance_expires": "2099-01-01"})
	require(t, code, 403)
	f.s.DB.Exec(context.Background(), "UPDATE account_profiles SET phone='9876543210' WHERE account_id=$1", rider.id)
	code, _ = f.call(rider, "POST", "/api/rides", map[string]any{"quote_id": f.quote(rider), "request_key": "33333333-3333-4333-8333-" + strings.ReplaceAll(rider.id, "-", "")[:12], "payment_method": "cash"})
	require(t, code, 201)
}
