package app

import (
	"context"
	"testing"
)

func TestCaptainPassIsOptionalUntilAZoneRequiresIt(t *testing.T) {
	f := setup(t)
	op, r, d := f.actor("operator", false), f.actor("rider", false), f.actor("rider", true)
	ctx := context.Background()

	// Off by default: no pass needed to be matched.
	code, st := f.call(d, "GET", "/api/drivers/pass", nil)
	require(t, code, 200)
	if st["required"] != false || st["active"] != nil || st["can_buy"] != true || st["price_paise"] != float64(49900) {
		t.Fatalf("unexpected pass state %#v", st)
	}
	ride := f.book(r, f.quote(r))
	f.offerTo(d, ride)
	if _, e := f.s.DB.Exec(ctx, "UPDATE rides SET status='cancelled' WHERE id=$1", ride); e != nil {
		t.Fatal(e)
	}

	// Only operators can switch it on.
	require(t, mustCall(f, d, "/api/operator/areas/"+f.area+"/pass", map[string]any{"required": true}), 403)
	require(t, mustCall(f, op, "/api/operator/areas/"+f.area+"/pass", map[string]any{"required": true}), 200)

	// Without a pass the captain can't go online or be offered rides.
	code, out := f.call(d, "POST", "/api/drivers/online", map[string]any{})
	if code != 403 || out["error"] != passRequiredMessage {
		t.Fatalf("go online without a pass: %d %#v", code, out)
	}
	r2 := f.actor("rider", false)
	blocked := f.book(r2, f.quote(r2))
	var offers int
	f.s.DB.QueryRow(ctx, "SELECT count(*) FROM ride_offers WHERE ride_id=$1 AND driver_id=$2", blocked, d.id).Scan(&offers)
	if offers != 0 {
		t.Fatal("a captain without a pass must not be offered rides in a pass zone")
	}

	// Buying needs enough earnings and the price the captain saw.
	require(t, mustCall(f, d, "/api/drivers/pass", map[string]any{"price_paise": 49900}), 409)
	if _, e := f.s.DB.Exec(ctx, "INSERT INTO driver_ledger(driver_id,kind,amount_paise,note) VALUES($1,'adjustment',60000,'test earnings')", d.id); e != nil {
		t.Fatal(e)
	}
	require(t, mustCall(f, d, "/api/drivers/pass", map[string]any{"price_paise": 100}), 409)
	require(t, mustCall(f, d, "/api/drivers/pass", map[string]any{"price_paise": 49900}), 201)
	// A second purchase straight away would buy a month ahead: refused (double tap).
	require(t, mustCall(f, d, "/api/drivers/pass", map[string]any{"price_paise": 49900}), 409)

	code, st = f.call(d, "GET", "/api/drivers/pass", nil)
	require(t, code, 200)
	if st["required"] != true || st["active"] == nil || st["can_buy"] != false || st["balance_paise"] != float64(10100) {
		t.Fatalf("after buying %#v", st)
	}
	require(t, mustCall(f, d, "/api/drivers/online", map[string]any{}), 200)
	// Going online waits for a fresh GPS fix.
	if _, e := f.s.DB.Exec(ctx, "UPDATE drivers SET lat=13.08,lng=80.27,location_at=now() WHERE user_id=$1", d.id); e != nil {
		t.Fatal(e)
	}
	f.offerTo(d, blocked)

	// Operator grants queue after the current period and don't touch the balance.
	require(t, mustCall(f, op, "/api/operator/drivers/"+d.id+"/pass", map[string]any{"days": 30, "collected_paise": 49900, "note": "x"}), 400)
	require(t, mustCall(f, op, "/api/operator/drivers/"+d.id+"/pass", map[string]any{"days": 30, "collected_paise": 49900, "note": "Cash at office"}), 201)
	var periods int
	var balance int64
	f.s.DB.QueryRow(ctx, "SELECT count(*) FROM captain_passes a JOIN captain_passes b ON a.driver_id=b.driver_id AND a.id<>b.id AND a.ends_at=b.starts_at WHERE a.driver_id=$1", d.id).Scan(&periods)
	f.s.DB.QueryRow(ctx, "SELECT sum(amount_paise) FROM driver_ledger WHERE driver_id=$1", d.id).Scan(&balance)
	if periods != 1 || balance != 10100 {
		t.Fatalf("grant should start when the bought pass ends (%d) and leave the balance (%d)", periods, balance)
	}

	// Operator view and price change.
	code, view := f.call(op, "GET", "/api/operator/passes", nil)
	require(t, code, 200)
	if view["revenue_month_paise"] != float64(99800) || view["active_passes"] != float64(1) {
		t.Fatalf("operator view %#v", view)
	}
	require(t, mustCall(f, op, "/api/operator/pass-prices", map[string]any{"category": "bike", "price_paise": 59900, "days": 30}), 200)
	require(t, mustCall(f, op, "/api/operator/pass-prices", map[string]any{"category": "boat", "price_paise": 59900, "days": 30}), 400)

	// When the pass runs out, matching stops even if the captain stays online.
	if _, e := f.s.DB.Exec(ctx, "UPDATE captain_passes SET starts_at=now()-interval '40 days', ends_at=now()-interval '1 second' WHERE driver_id=$1", d.id); e != nil {
		t.Fatal(e)
	}
	r3 := f.actor("rider", false)
	late := f.book(r3, f.quote(r3))
	f.s.DB.QueryRow(ctx, "SELECT count(*) FROM ride_offers WHERE ride_id=$1 AND driver_id=$2", late, d.id).Scan(&offers)
	if offers != 0 {
		t.Fatal("an expired pass must stop matching")
	}
}
