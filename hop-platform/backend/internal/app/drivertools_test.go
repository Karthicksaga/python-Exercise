package app

import (
	"context"
	"testing"
)

func TestWaitingChargeAddedAfterFreeWindow(t *testing.T) {
	f := setup(t)
	r, d := f.actor("rider", false), f.actor("rider", true)
	id := f.book(r, f.quote(r))
	require(t, f.act(d, id, "accept", 1, ""), 200)
	require(t, f.act(d, id, "arrive", 2, ""), 200)
	f.s.DB.Exec(context.Background(), "UPDATE audit_events SET created_at=now()-interval '10 minutes' WHERE ride_id=$1 AND action='arrived'", id)
	require(t, f.act(d, id, "start", 3, f.s.pin(id)), 200)
	ride := f.rideState(r, id)
	if got := ride["wait_charge_paise"].(float64); got != 1400 {
		t.Fatalf("10 min wait with 3 free should be 7*200=1400, got %v", got)
	}
}

func TestNoWaitingChargeWithinFreeWindow(t *testing.T) {
	f := setup(t)
	r, d := f.actor("rider", false), f.actor("rider", true)
	id := f.book(r, f.quote(r))
	require(t, f.act(d, id, "accept", 1, ""), 200)
	require(t, f.act(d, id, "arrive", 2, ""), 200)
	require(t, f.act(d, id, "start", 3, f.s.pin(id)), 200)
	if got := f.rideState(r, id)["wait_charge_paise"].(float64); got != 0 {
		t.Fatalf("no charge expected, got %v", got)
	}
}

func TestGoHomeHidesRidesAwayFromHomeAndLimitsUse(t *testing.T) {
	f := setup(t)
	r, d := f.actor("rider", false), f.actor("rider", true)
	var lat, lng float64
	f.s.DB.QueryRow(context.Background(), "SELECT lat,lng FROM drivers WHERE user_id=$1", d.id).Scan(&lat, &lng)
	f.book(r, f.quote(r))
	count := func() int {
		_, st := f.call(d, "GET", "/api/state", nil)
		o, _ := st["offers"].([]any)
		return len(o)
	}
	if count() == 0 {
		t.Fatal("driver should see the offer before go-home")
	}
	// Home far away: the drop is neither near home nor closer to it than the pickup.
	require(t, mustCall(f, d, "/api/drivers/go-home", map[string]any{"lat": lat + 0.5, "lng": lng + 0.5}), 200)
	if count() != 0 {
		t.Fatal("offer leading away from home must be hidden")
	}
	require(t, mustCall(f, d, "/api/drivers/go-home", map[string]any{"off": true}), 200)
	if count() == 0 {
		t.Fatal("offers return after go-home is switched off")
	}
	require(t, mustCall(f, d, "/api/drivers/go-home", map[string]any{"lat": lat, "lng": lng}), 200)
	require(t, mustCall(f, d, "/api/drivers/go-home", map[string]any{"off": true}), 200)
	require(t, mustCall(f, d, "/api/drivers/go-home", map[string]any{"lat": lat, "lng": lng}), 409)
}

func TestDailyGoalValidation(t *testing.T) {
	f := setup(t)
	d, r := f.actor("rider", true), f.actor("rider", false)
	require(t, mustCall(f, d, "/api/drivers/goal", map[string]any{"daily_goal_paise": 150000}), 200)
	require(t, mustCall(f, d, "/api/drivers/goal", map[string]any{"daily_goal_paise": -1}), 400)
	require(t, mustCall(f, r, "/api/drivers/goal", map[string]any{"daily_goal_paise": 1000}), 404)
}

func TestDemandCellShowsDriverSupply(t *testing.T) {
	f := setup(t)
	r, d := f.actor("rider", false), f.actor("rider", true)
	f.book(r, f.quote(r))
	_, body := f.call(d, "GET", "/api/drivers/demand", nil)
	c := body["cells"].([]any)[0].(map[string]any)
	if _, ok := c["drivers"]; !ok {
		t.Fatalf("cell needs a drivers count: %#v", c)
	}
}

func mustCall(f *fixture, c client, path string, body map[string]any) int {
	code, _ := f.call(c, "POST", path, body)
	return code
}
