package app

import (
	"strconv"
	"testing"
)

func TestEstimatesCompareVehiclesForOneRoute(t *testing.T) {
	f := setup(t)
	rider := f.actor("rider", false)
	operator := f.actor("operator", false)
	code, _ := f.call(operator, "POST", "/api/operator/pricing", map[string]any{
		"area_id": f.area, "category": "auto", "base_paise": 3000, "per_km_paise": 1200, "minimum_paise": 4000, "enabled": true,
	})
	require(t, code, 200)
	body := map[string]any{"area_id": f.area, "pickup": Point{13.08, 80.27, "Central"}, "dropoff": Point{13.04, 80.23, "Destination"}}
	code, out := f.call(rider, "POST", "/api/estimates", body)
	require(t, code, 200)
	options := out["options"].([]any)
	if len(options) != 2 {
		t.Fatalf("expected bike and auto, got %#v", options)
	}
	first, second := options[0].(map[string]any), options[1].(map[string]any)
	if first["category"] != "bike" || first["fare_paise"] != float64(5500) || first["tag"] != "cheapest" {
		t.Fatalf("cheapest option wrong: %#v", first)
	}
	if second["category"] != "auto" || second["fare_paise"] != float64(9000) {
		t.Fatalf("auto option wrong: %#v", second)
	}
	if out["meters"] != float64(5000) || len(out["route"].([]any)) < 2 {
		t.Fatalf("route missing: %#v", out)
	}
	// The estimate must agree with the quote the rider will actually be charged.
	_, quote := f.call(rider, "POST", "/api/quotes", map[string]any{"area_id": f.area, "vehicle_category": "auto", "pickup": body["pickup"], "dropoff": body["dropoff"]})
	if quote["fare_paise"] != second["fare_paise"] {
		t.Fatalf("estimate %v differs from quote %v", second["fare_paise"], quote["fare_paise"])
	}
	body["dropoff"] = Point{40, 70, "Far away"}
	code, _ = f.call(rider, "POST", "/api/estimates", body)
	require(t, code, 400)
	body["dropoff"] = Point{13.08, 80.27, "Same"}
	code, _ = f.call(rider, "POST", "/api/estimates", body)
	require(t, code, 400)
}

func TestRideChatIsPrivateAndOnlyWhileActive(t *testing.T) {
	f := setup(t)
	rider := f.actor("rider", false)
	driver := f.actor("rider", true)
	stranger := f.actor("rider", false)
	id := f.book(rider, f.quote(rider))
	code, _ := f.call(rider, "POST", "/api/rides/"+id+"/messages", map[string]any{"body": "hello"})
	require(t, code, 404) // no driver yet
	require(t, f.act(driver, id, "accept", 1, ""), 200)

	code, sent := f.call(rider, "POST", "/api/rides/"+id+"/messages", map[string]any{"body": "  I am at the gate\x00  "})
	require(t, code, 201)
	if sent["body"] != "I am at the gate" || sent["mine"] != true {
		t.Fatalf("message not sanitised: %#v", sent)
	}
	code, _ = f.call(driver, "POST", "/api/rides/"+id+"/messages", map[string]any{"body": "On my way"})
	require(t, code, 201)
	code, _ = f.call(rider, "POST", "/api/rides/"+id+"/messages", map[string]any{"body": "   "})
	require(t, code, 400)

	code, list := f.call(driver, "GET", "/api/rides/"+id+"/messages", nil)
	require(t, code, 200)
	msgs := list["messages"].([]any)
	if len(msgs) != 2 || msgs[0].(map[string]any)["mine"] != false || msgs[1].(map[string]any)["mine"] != true {
		t.Fatalf("driver view wrong: %#v", msgs)
	}
	code, list = f.call(driver, "GET", "/api/rides/"+id+"/messages?after="+formatID(msgs[0]), nil)
	require(t, code, 200)
	if len(list["messages"].([]any)) != 1 {
		t.Fatalf("after cursor ignored: %#v", list)
	}
	code, _ = f.call(stranger, "GET", "/api/rides/"+id+"/messages", nil)
	require(t, code, 404)
	code, _ = f.call(stranger, "POST", "/api/rides/"+id+"/messages", map[string]any{"body": "hi"})
	require(t, code, 404)

	var notes int
	if e := f.s.DB.QueryRow(t.Context(), "SELECT count(*) FROM notifications WHERE account_id=$1 AND kind='chat'", driver.id).Scan(&notes); e != nil || notes != 1 {
		t.Fatalf("driver should get one chat notification, got %d (%v)", notes, e)
	}

	f.s.DB.Exec(t.Context(), "UPDATE rides SET status='completed' WHERE id=$1", id)
	code, _ = f.call(rider, "POST", "/api/rides/"+id+"/messages", map[string]any{"body": "thanks"})
	require(t, code, 409)
	code, _ = f.call(rider, "GET", "/api/rides/"+id+"/messages", nil)
	require(t, code, 200)
}

func formatID(m any) string { return strconv.FormatInt(int64(m.(map[string]any)["id"].(float64)), 10) }
