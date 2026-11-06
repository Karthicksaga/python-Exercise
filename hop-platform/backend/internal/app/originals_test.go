package app

import (
	"context"
	"testing"
	"time"
)

// Hop originals: ride notes reach the captain, a chai break pauses offers, the rider can switch
// alerts on during the trip, and the arrival alert reports honestly what happened to the text.
func TestRideNotesBreakAlertsAndArrivalText(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	rider, captain := f.actor("rider", false), f.actor("rider", true)

	code, _ := f.call(rider, "POST", "/api/rides", map[string]any{"quote_id": f.quote(rider), "request_key": "55555555-5555-4555-8555-555555555555", "payment_method": "cash", "notes": []string{"sing loudly"}})
	require(t, code, 400)

	code, _ = f.call(captain, "POST", "/api/drivers/break", map[string]any{"minutes": 15})
	require(t, code, 200)
	code, out := f.call(rider, "POST", "/api/rides", map[string]any{"quote_id": f.quote(rider), "request_key": "66666666-6666-4666-8666-666666666666", "payment_method": "cash", "notes": []string{"luggage", "quiet", "luggage"}, "arrival_alert": true})
	require(t, code, 201)
	id := out["id"].(string)
	f.dispatch()
	_, st := f.call(captain, "GET", "/api/state", nil)
	if offers, _ := st["offers"].([]any); len(offers) != 0 {
		t.Fatalf("a captain on a break was offered a ride: %#v", offers)
	}
	code, _ = f.call(captain, "POST", "/api/drivers/break", map[string]any{"minutes": 0})
	require(t, code, 200)
	f.elapse(id)
	_, st = f.call(captain, "GET", "/api/state", nil)
	offers, _ := st["offers"].([]any)
	if len(offers) != 1 {
		t.Fatalf("captain back from a break was not offered the ride: %#v", st["offers"])
	}
	notes, _ := offers[0].(map[string]any)["rider_notes"].([]any)
	if len(notes) != 2 || notes[0] != "luggage" || notes[1] != "quiet" {
		t.Fatalf("ride notes not shown to the captain: %#v", notes)
	}

	require(t, f.act(captain, id, "accept", 1, ""), 200)
	code, _ = f.call(captain, "POST", "/api/rides/"+id+"/alerts", map[string]any{"sms_updates": true})
	require(t, code, 404)
	code, _ = f.call(rider, "POST", "/api/rides/"+id+"/alerts", map[string]any{"sms_updates": true})
	require(t, code, 200)

	if _, e := f.s.DB.Exec(ctx, "INSERT INTO emergency_contacts(account_id,name,phone) VALUES($1,'Amma','9876500000')", rider.id); e != nil {
		t.Fatal(e)
	}
	require(t, f.act(captain, id, "arrive", 2, ""), 200)
	require(t, f.act(captain, id, "start", 3, f.s.pin(id)), 200)
	f.atDestination(captain, id)
	require(t, f.act(captain, id, "complete", 4, ""), 200)
	// No SMS provider in tests, but development SMS is on: the text is logged and marked "test".
	var status string
	for i := 0; i < 40 && status == ""; i++ {
		time.Sleep(50 * time.Millisecond)
		f.s.DB.QueryRow(ctx, "SELECT COALESCE(arrival_alert_status,'') FROM rides WHERE id=$1", id).Scan(&status)
	}
	if status != "test" {
		t.Fatalf("arrival alert status = %q, want test", status)
	}

	code, _ = f.call(rider, "POST", "/api/translate", map[string]any{"text": "On my way", "to": "ta"})
	require(t, code, 503)
}

func TestHomeByTime(t *testing.T) {
	f := setup(t)
	captain := f.actor("rider", true)
	code, out := f.call(captain, "POST", "/api/drivers/home-by", map[string]any{"at": "21:00", "lat": 13.05, "lng": 80.25})
	require(t, code, 200)
	if out["home_by"] == nil {
		t.Fatalf("home_by not returned: %#v", out)
	}
	code, _ = f.call(captain, "POST", "/api/drivers/home-by", map[string]any{"at": "9pm", "lat": 13.05, "lng": 80.25})
	require(t, code, 400)
	code, _ = f.call(captain, "POST", "/api/drivers/home-by", map[string]any{"off": true})
	require(t, code, 200)
}
