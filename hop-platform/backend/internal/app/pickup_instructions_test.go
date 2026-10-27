package app

import (
	"context"
	"strings"
	"testing"
)

func TestPickupInstructionsAndIdempotentRetry(t *testing.T) {
	f := setup(t)
	rider := f.actor("rider", false)
	driver := f.actor("rider", true)
	quote := f.quote(rider)
	body := map[string]any{"quote_id": quote, "request_key": "22222222-2222-4222-8222-000000000099", "payment_method": "cash", "pickup_instructions": strings.Repeat("界", 251)}
	status, _ := f.call(rider, "POST", "/api/rides", body)
	require(t, status, 400)
	body["pickup_instructions"] = "  Meet at the main entrance  "
	status, first := f.call(rider, "POST", "/api/rides", body)
	require(t, status, 201)
	status, retry := f.call(rider, "POST", "/api/rides", body)
	require(t, status, 200)
	if first["id"] != retry["id"] {
		t.Fatal("retry created another ride")
	}
	var count int
	f.s.DB.QueryRow(context.Background(), "SELECT count(*) FROM rides WHERE rider_id=$1", rider.id).Scan(&count)
	if count != 1 {
		t.Fatalf("expected one ride, got %d", count)
	}
	_, state := f.call(rider, "GET", "/api/state", nil)
	ride := state["rides"].([]any)[0].(map[string]any)
	if ride["pickup_instructions"] != "Meet at the main entrance" {
		t.Fatalf("instructions not stored: %#v", ride)
	}
	// Only the rider and assigned driver receive the instructions.
	f.s.DB.Exec(context.Background(), "UPDATE rides SET driver_id=$2,status='accepted' WHERE id=$1", first["id"], driver.id)
	_, state = f.call(driver, "GET", "/api/state", nil)
	ride = state["rides"].([]any)[0].(map[string]any)
	if ride["pickup_instructions"] != "Meet at the main entrance" {
		t.Fatal("assigned driver missing instructions")
	}
}
