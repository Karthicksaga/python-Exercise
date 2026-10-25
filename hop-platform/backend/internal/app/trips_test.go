package app

import (
	"context"
	"testing"
	"time"
)

func TestTripTypesStopsRentalAndOutstation(t *testing.T) {
	f := setup(t)
	r := f.actor("rider", false)
	ctx := context.Background()
	if _, e := f.s.DB.Exec(ctx, `UPDATE area_vehicle_pricing SET stop_fee_paise=2000,hourly_paise=20000,included_km_per_hour=10,extra_km_paise=1500,outstation_per_km_paise=1200,outstation_allowance_paise=30000`); e != nil {
		t.Fatal(e)
	}
	base := map[string]any{"area_id": f.area, "vehicle_category": "bike", "pickup": Point{13.08, 80.27, "Central"}, "dropoff": Point{13.04, 80.23, "Destination"}}
	with := func(extra map[string]any) map[string]any {
		m := map[string]any{}
		for k, v := range base {
			m[k] = v
		}
		for k, v := range extra {
			m[k] = v
		}
		return m
	}
	code, out := f.call(r, "POST", "/api/quotes", with(map[string]any{"stops": []Point{{13.06, 80.25, "Mid"}}}))
	require(t, code, 201)
	if out["fare_paise"].(float64) <= 5500 {
		t.Fatalf("stop should add fee: %#v", out)
	}
	code, _ = f.call(r, "POST", "/api/quotes", with(map[string]any{"stops": []Point{{13.06, 80.25, "a"}, {13.06, 80.25, "b"}, {13.06, 80.25, "c"}, {13.06, 80.25, "d"}}}))
	require(t, code, 400)
	code, out = f.call(r, "POST", "/api/quotes", with(map[string]any{"trip_type": "rental", "rental_hours": 3}))
	require(t, code, 201)
	if out["fare_paise"].(float64) < 60000 || out["trip_type"] != "rental" {
		t.Fatalf("rental fare: %#v", out)
	}
	code, _ = f.call(r, "POST", "/api/quotes", with(map[string]any{"trip_type": "rental", "rental_hours": 13}))
	require(t, code, 400)
	// Mock routing always returns 5 km, below the outstation minimum.
	code, _ = f.call(r, "POST", "/api/quotes", with(map[string]any{"trip_type": "outstation", "trip_days": 1}))
	require(t, code, 400)
}

func TestFareNegotiationAndReservation(t *testing.T) {
	f := setup(t)
	r := f.actor("rider", false)
	d := f.actor("rider", true)
	d2 := f.actor("rider", true)
	q := f.quote(r)
	code, _ := f.call(r, "POST", "/api/rides", map[string]any{"quote_id": q, "request_key": "33333333-3333-4333-8333-333333333333", "payment_method": "cash", "offer_paise": 1000})
	require(t, code, 400)
	code, out := f.call(r, "POST", "/api/rides", map[string]any{"quote_id": q, "request_key": "33333333-3333-4333-8333-333333333333", "payment_method": "cash", "offer_paise": 5000})
	require(t, code, 201)
	id := out["id"].(string)
	f.dispatch()
	code, _ = f.call(d, "POST", "/api/rides/"+id+"/bids", map[string]any{"amount_paise": 99999})
	require(t, code, 400)
	code, _ = f.call(d, "POST", "/api/rides/"+id+"/bids", map[string]any{"amount_paise": 5300})
	require(t, code, 201)
	var bid string
	if e := f.s.DB.QueryRow(context.Background(), "SELECT id FROM ride_bids WHERE ride_id=$1", id).Scan(&bid); e != nil {
		t.Fatal(e)
	}
	code, _ = f.call(r, "POST", "/api/rides/"+id+"/bids/"+bid+"/accept", map[string]any{})
	require(t, code, 200)
	require(t, f.act(d2, id, "accept", 2, ""), 409)
	require(t, f.act(d, id, "accept", 2, ""), 200)
	var fare int64
	f.s.DB.QueryRow(context.Background(), "SELECT COALESCE(r.offered_fare_paise,q.fare_paise) FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.id=$1", id).Scan(&fare)
	if fare != 5300 {
		t.Fatalf("agreed fare %d", fare)
	}
}

func TestScheduledRideAutoDispatch(t *testing.T) {
	f := setup(t)
	r := f.actor("rider", false)
	ctx := context.Background()
	when := time.Now().Add(time.Hour).UTC()
	code, out := f.call(r, "POST", "/api/scheduled-rides", map[string]any{"category": "bike", "pickup_lat": 13.08, "pickup_lng": 80.27, "pickup_label": "Central", "dropoff_lat": 13.04, "dropoff_lng": 80.23, "dropoff_label": "Destination", "scheduled_for": when})
	require(t, code, 201)
	id := out["id"].(string)
	if e := f.s.DispatchScheduled(ctx); e != nil {
		t.Fatal(e)
	}
	var status string
	f.s.DB.QueryRow(ctx, "SELECT status FROM scheduled_rides WHERE id=$1", id).Scan(&status)
	if status != "scheduled" {
		t.Fatalf("dispatched too early: %s", status)
	}
	f.s.DB.Exec(ctx, "UPDATE scheduled_rides SET scheduled_for=now()+interval '5 minutes' WHERE id=$1", id)
	if e := f.s.DispatchScheduled(ctx); e != nil {
		t.Fatal(e)
	}
	var ride *string
	f.s.DB.QueryRow(ctx, "SELECT status,dispatched_ride_id::text FROM scheduled_rides WHERE id=$1", id).Scan(&status, &ride)
	if status != "dispatched" || ride == nil {
		t.Fatalf("not dispatched: %s %v", status, ride)
	}
	var rs string
	f.s.DB.QueryRow(ctx, "SELECT status FROM rides WHERE id=$1", *ride).Scan(&rs)
	if rs != "requested" {
		t.Fatalf("ride status %s", rs)
	}
	// A second dispatch for a rider with an active ride fails cleanly.
	code, out = f.call(r, "POST", "/api/scheduled-rides", map[string]any{"category": "bike", "pickup_lat": 13.08, "pickup_lng": 80.27, "pickup_label": "Central", "dropoff_lat": 13.04, "dropoff_lng": 80.23, "dropoff_label": "Destination", "scheduled_for": when})
	require(t, code, 201)
	id2 := out["id"].(string)
	f.s.DB.Exec(ctx, "UPDATE scheduled_rides SET scheduled_for=now()+interval '5 minutes' WHERE id=$1", id2)
	if e := f.s.DispatchScheduled(ctx); e != nil {
		t.Fatal(e)
	}
	f.s.DB.QueryRow(ctx, "SELECT status FROM scheduled_rides WHERE id=$1", id2).Scan(&status)
	if status != "failed" {
		t.Fatalf("expected failed, got %s", status)
	}
}

func TestDriverDeclineHidesRideAndDropsBid(t *testing.T) {
	f := setup(t)
	r := f.actor("rider", false)
	d := f.actor("rider", true)
	q := f.quote(r)
	_, out := f.call(r, "POST", "/api/rides", map[string]any{"quote_id": q, "request_key": "44444444-4444-4444-8444-444444444444", "payment_method": "cash"})
	id := out["id"].(string)
	f.dispatch()
	code, _ := f.call(d, "POST", "/api/rides/"+id+"/bids", map[string]any{"amount_paise": 5300})
	require(t, code, 201)
	code, _ = f.call(d, "POST", "/api/rides/"+id+"/decline", map[string]any{})
	require(t, code, 200)
	code, _ = f.call(d, "POST", "/api/rides/"+id+"/decline", map[string]any{})
	require(t, code, 404)
	var n int
	f.s.DB.QueryRow(context.Background(), "SELECT count(*) FROM ride_bids WHERE ride_id=$1", id).Scan(&n)
	if n != 0 {
		t.Fatalf("bid should be removed, got %d", n)
	}
}
