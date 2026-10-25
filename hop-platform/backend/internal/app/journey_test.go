package app

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestDriverCanBookAsRiderAndMustExplicitlyResumeDriving(t *testing.T) {
	f := setup(t)
	d := f.actor("rider", true)
	ctx := context.Background()
	ping := map[string]any{"lat": 13.08, "lng": 80.27, "accuracy": 10}
	code, _ := f.call(d, "POST", "/api/drivers/location", ping)
	require(t, code, 200)
	body := map[string]any{"quote_id": f.quote(d), "request_key": d.id, "payment_method": "cash"}
	code, out := f.call(d, "POST", "/api/rides", body)
	require(t, code, 409)
	if out["code"] != "driver_online" {
		t.Fatalf("expected offline confirmation: %#v", out)
	}
	body["go_offline"] = true
	code, out = f.call(d, "POST", "/api/rides", body)
	require(t, code, 201)
	id := out["id"].(string)
	code, retry := f.call(d, "POST", "/api/rides", body)
	require(t, code, 200)
	if retry["id"] != id {
		t.Fatal("retry created a different ride")
	}
	var online bool
	var status string
	if err := f.s.DB.QueryRow(ctx, "SELECT online,status FROM drivers WHERE user_id=$1", d.id).Scan(&online, &status); err != nil {
		t.Fatal(err)
	}
	if online || status != "approved" {
		t.Fatal("booking must go offline and retain driver approval")
	}
	code, availability := f.call(d, "GET", "/api/drivers/availability", nil)
	require(t, code, 200)
	if availability["online"] != false {
		t.Fatal("background tracking must observe the offline transition")
	}
	if _, ok := f.s.liveMetaFor(ctx, d.id); ok {
		t.Fatal("driver remained in the live location cache")
	}
	code, _ = f.call(d, "POST", "/api/drivers/location", ping)
	require(t, code, 403)
	code, _ = f.call(d, "POST", "/api/drivers/online", map[string]any{})
	require(t, code, 409)
	other := f.actor("rider", false)
	otherRide := f.book(other, f.quote(other))
	require(t, f.act(d, otherRide, "accept", 1, ""), 409)
	require(t, f.act(d, id, "cancel", 1, ""), 200)
	// A delayed location ping after the rider trip ends must not bring Captain online.
	code, _ = f.call(d, "POST", "/api/drivers/location", ping)
	require(t, code, 403)
	code, _ = f.call(d, "POST", "/api/drivers/online", map[string]any{})
	require(t, code, 200)
	code, _ = f.call(d, "POST", "/api/drivers/location", ping)
	require(t, code, 200)
}

func TestActiveDriverTripBlocksRiderBooking(t *testing.T) {
	f := setup(t)
	r, d := f.actor("rider", false), f.actor("rider", true)
	id := f.book(r, f.quote(r))
	require(t, f.act(d, id, "accept", 1, ""), 200)
	code, _ := f.call(d, "POST", "/api/rides", map[string]any{"quote_id": f.quote(d), "request_key": d.id, "payment_method": "cash", "go_offline": true})
	require(t, code, 409)
}

func TestConcurrentDriverAcceptAndRiderBookingCannotBothSucceed(t *testing.T) {
	f := setup(t)
	r, d := f.actor("rider", false), f.actor("rider", true)
	id := f.book(r, f.quote(r))
	quote := f.quote(d)
	start := make(chan struct{})
	var wg sync.WaitGroup
	var booked, accepted int
	wg.Add(2)
	go func() {
		defer wg.Done()
		<-start
		booked, _ = f.call(d, "POST", "/api/rides", map[string]any{"quote_id": quote, "request_key": d.id, "payment_method": "cash", "go_offline": true})
	}()
	go func() { defer wg.Done(); <-start; accepted = f.act(d, id, "accept", 1, "") }()
	close(start)
	wg.Wait()
	if !((booked == 201 && accepted == 409) || (accepted == 200 && booked == 409)) {
		t.Fatalf("expected one successful transition: booking=%d accepting=%d", booked, accepted)
	}
}

func TestConcurrentOnlineAndRiderBookingCannotLeaveRiderOnline(t *testing.T) {
	f := setup(t)
	d := f.actor("rider", true)
	code, _ := f.call(d, "POST", "/api/drivers/offline", map[string]any{})
	require(t, code, 200)
	quote := f.quote(d)
	start := make(chan struct{})
	var wg sync.WaitGroup
	var booked, enabled int
	wg.Add(2)
	go func() {
		defer wg.Done()
		<-start
		booked, _ = f.call(d, "POST", "/api/rides", map[string]any{"quote_id": quote, "request_key": d.id, "payment_method": "cash", "go_offline": true})
	}()
	go func() {
		defer wg.Done()
		<-start
		enabled, _ = f.call(d, "POST", "/api/drivers/online", map[string]any{})
	}()
	close(start)
	wg.Wait()
	require(t, booked, 201)
	if enabled != 200 && enabled != 409 {
		t.Fatalf("online status %d", enabled)
	}
	var online bool
	if err := f.s.DB.QueryRow(context.Background(), "SELECT online FROM drivers WHERE user_id=$1", d.id).Scan(&online); err != nil {
		t.Fatal(err)
	}
	if online {
		t.Fatal("account with an active rider booking was left online as a driver")
	}
}

func TestRejectedRiderBookingKeepsDriverOnline(t *testing.T) {
	f := setup(t)
	d := f.actor("rider", true)
	quote := f.quote(d)
	if _, err := f.s.DB.Exec(context.Background(), "UPDATE quotes SET expires_at=now()-interval '1 minute' WHERE id=$1", quote); err != nil {
		t.Fatal(err)
	}
	code, _ := f.call(d, "POST", "/api/rides", map[string]any{"quote_id": quote, "request_key": d.id, "payment_method": "cash", "go_offline": true})
	require(t, code, 409)
	var online bool
	if err := f.s.DB.QueryRow(context.Background(), "SELECT online FROM drivers WHERE user_id=$1", d.id).Scan(&online); err != nil {
		t.Fatal(err)
	}
	if !online {
		t.Fatal("failed booking changed driver availability")
	}
}

func TestConcurrentCachedLocationPingCannotUndoRiderBooking(t *testing.T) {
	f := setup(t)
	d := f.actor("rider", true)
	ping := map[string]any{"lat": 13.08, "lng": 80.27, "accuracy": 10}
	for i := 0; i < 3; i++ {
		code, _ := f.call(d, "POST", "/api/drivers/location", ping)
		require(t, code, 200)
	}
	quote := f.quote(d)
	start := make(chan struct{})
	var wg sync.WaitGroup
	var booked, located int
	wg.Add(2)
	go func() {
		defer wg.Done()
		<-start
		booked, _ = f.call(d, "POST", "/api/rides", map[string]any{"quote_id": quote, "request_key": d.id, "payment_method": "cash", "go_offline": true})
	}()
	go func() { defer wg.Done(); <-start; located, _ = f.call(d, "POST", "/api/drivers/location", ping) }()
	close(start)
	wg.Wait()
	require(t, booked, 201)
	if located != 200 && located != 403 {
		t.Fatalf("location status %d", located)
	}
	var online bool
	if err := f.s.DB.QueryRow(context.Background(), "SELECT online FROM drivers WHERE user_id=$1", d.id).Scan(&online); err != nil {
		t.Fatal(err)
	}
	if online {
		t.Fatal("location ping restored driver availability")
	}
	if _, ok := f.s.liveMetaFor(context.Background(), d.id); ok {
		t.Fatal("cached location survived rider booking")
	}
}

func TestScheduledRiderTripWaitsUntilDriverIsOfflineAndFree(t *testing.T) {
	f := setup(t)
	d, rider := f.actor("rider", true), f.actor("rider", false)
	drivingRide := f.book(rider, f.quote(rider))
	require(t, f.act(d, drivingRide, "accept", 1, ""), 200)
	code, schedule := f.call(d, "POST", "/api/scheduled-rides", map[string]any{"category": "bike", "pickup_lat": 13.08, "pickup_lng": 80.27, "pickup_label": "Central", "dropoff_lat": 13.04, "dropoff_lng": 80.23, "dropoff_label": "Destination", "scheduled_for": time.Now().Add(time.Hour).UTC()})
	require(t, code, 201)
	ctx := context.Background()
	if _, err := f.s.DB.Exec(ctx, "UPDATE scheduled_rides SET scheduled_for=now()+interval '5 minutes' WHERE id=$1", schedule["id"]); err != nil { t.Fatal(err) }
	check := func(want string) {
		t.Helper()
		if err := f.s.DispatchScheduled(ctx); err != nil { t.Fatal(err) }
		var status string
		if err := f.s.DB.QueryRow(ctx, "SELECT status FROM scheduled_rides WHERE id=$1", schedule["id"]).Scan(&status); err != nil { t.Fatal(err) }
		if status != want { t.Fatalf("schedule status %s, want %s", status, want) }
	}
	check("scheduled")
	code, _ = f.call(d, "POST", "/api/drivers/offline", map[string]any{})
	require(t, code, 200)
	check("scheduled") // Going offline does not end an accepted driver trip.
	require(t, f.act(d, drivingRide, "cancel", 2, ""), 200)
	check("dispatched")
	code, _ = f.call(d, "POST", "/api/drivers/online", map[string]any{})
	require(t, code, 409)
}
