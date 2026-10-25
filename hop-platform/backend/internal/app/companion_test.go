package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"
)

func TestCompanionSafetyShareAndTripFeatures(t *testing.T) {
	f := setup(t)
	r := f.actor("rider", false)
	d := f.actor("rider", true)
	stranger := f.actor("rider", false)
	id := f.book(r, f.quote(r))
	require(t, f.act(d, id, "accept", 1, ""), 200)

	code, _ := f.call(stranger, "POST", "/api/rides/"+id+"/share", map[string]any{})
	require(t, code, 404)
	code, share := f.call(r, "POST", "/api/rides/"+id+"/share", map[string]any{})
	require(t, code, 201)
	token := share["token"].(string)

	res, e := http.Get(f.http.URL + "/api/share/" + token)
	if e != nil {
		t.Fatal(e)
	}
	var view map[string]any
	json.NewDecoder(res.Body).Decode(&view)
	res.Body.Close()
	require(t, res.StatusCode, 200)
	if view["vehicle_number"] != "TEST1234" || view["driver_name"] != "Test" {
		t.Fatalf("share view missing driver info: %#v", view)
	}
	if _, leaked := view["pickup_code"]; leaked {
		t.Fatal("share view leaks pickup code")
	}

	code, _ = f.call(stranger, "POST", "/api/rides/"+id+"/sos", map[string]any{})
	require(t, code, 404)
	code, _ = f.call(r, "POST", "/api/rides/"+id+"/sos", map[string]any{"lat": 13.08, "lng": 80.27})
	require(t, code, 201)
	code, _ = f.call(r, "POST", "/api/rides/"+id+"/sos", map[string]any{"lat": 13.08})
	require(t, code, 400)
	var incidents int
	f.s.DB.QueryRow(context.Background(), "SELECT count(*) FROM incidents WHERE ride_id=$1 AND message LIKE 'EMERGENCY SOS%'", id).Scan(&incidents)
	if incidents != 1 {
		t.Fatalf("SOS did not create operator incident: %d", incidents)
	}

	code, _ = f.call(r, "POST", "/api/rides/"+id+"/lost-items", map[string]string{"description": "Black backpack"})
	require(t, code, 409)

	code, _ = f.call(r, "POST", "/api/rides/"+id+"/share/revoke", map[string]any{})
	require(t, code, 200)
	res, _ = http.Get(f.http.URL + "/api/share/" + token)
	res.Body.Close()
	require(t, res.StatusCode, 404)

	require(t, f.act(d, id, "arrive", 2, ""), 200)
	require(t, f.act(d, id, "start", 3, f.s.pin(id)), 200)
	f.atDestination(d, id)
	require(t, f.act(d, id, "complete", 4, ""), 200)

	code, _ = f.call(r, "POST", "/api/rides/"+id+"/lost-items", map[string]string{"description": "Black backpack"})
	require(t, code, 201)
	code, _ = f.call(stranger, "POST", "/api/rides/"+id+"/lost-items", map[string]string{"description": "Not my ride"})
	require(t, code, 404)
	code, _ = f.call(r, "POST", "/api/rides/"+id+"/sos", map[string]any{})
	require(t, code, 409)

	code, _ = f.call(stranger, "POST", "/api/favorite-drivers", map[string]string{"ride_id": id})
	require(t, code, 409)
	code, _ = f.call(r, "POST", "/api/favorite-drivers", map[string]string{"ride_id": id})
	require(t, code, 201)
	_, state := f.call(r, "GET", "/api/companion", nil)
	if len(state["favorite_drivers"].([]any)) != 1 || len(state["lost_items"].([]any)) != 1 || len(state["notifications"].([]any)) < 2 {
		t.Fatalf("companion state incomplete: %#v", state)
	}
}

func TestCompanionReferralFamilyScheduleAndPreferences(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	referrer := f.actor("rider", false)
	friend := f.actor("rider", false)
	driver := f.actor("rider", true)

	_, state := f.call(referrer, "GET", "/api/companion", nil)
	referral := state["referral"].([]any)[0].(map[string]any)
	codeValue := referral["code"].(string)
	code, _ := f.call(referrer, "POST", "/api/referrals/redeem", map[string]string{"code": codeValue})
	require(t, code, 400)
	code, _ = f.call(friend, "POST", "/api/referrals/redeem", map[string]string{"code": "ZZZZZZZZ"})
	require(t, code, 400)
	code, _ = f.call(friend, "POST", "/api/referrals/redeem", map[string]string{"code": codeValue})
	require(t, code, 201)
	code, _ = f.call(friend, "POST", "/api/referrals/redeem", map[string]string{"code": codeValue})
	require(t, code, 400)

	id := f.book(friend, f.quote(friend))
	require(t, f.act(driver, id, "accept", 1, ""), 200)
	require(t, f.act(driver, id, "arrive", 2, ""), 200)
	require(t, f.act(driver, id, "start", 3, f.s.pin(id)), 200)
	f.atDestination(driver, id)
	require(t, f.act(driver, id, "complete", 4, ""), 200)
	for i := 0; i < 2; i++ { // second read must not double-credit
		f.call(friend, "GET", "/api/companion", nil)
	}
	for _, c := range []client{friend, referrer} {
		_, state = f.call(c, "GET", "/api/companion", nil)
		if state["referral"].([]any)[0].(map[string]any)["points"] != float64(referralRewardPoints) {
			t.Fatalf("reward not credited exactly once: %#v", state["referral"])
		}
	}
	code, _ = f.call(friend, "POST", "/api/referrals/redeem", map[string]string{"code": codeValue})
	require(t, code, 409)

	f.s.DB.Exec(ctx, "UPDATE accounts SET email='family@example.invalid' WHERE id=$1", friend.id)
	code, _ = f.call(referrer, "POST", "/api/family/invite", map[string]string{"email": "nobody@example.invalid"})
	require(t, code, 404)
	code, invite := f.call(referrer, "POST", "/api/family/invite", map[string]string{"email": "Family@Example.invalid"})
	require(t, code, 201)
	famID := invite["id"].(string)
	code, _ = f.call(referrer, "POST", "/api/family/"+famID+"/respond", map[string]any{"accept": true})
	require(t, code, 404)
	code, _ = f.call(friend, "POST", "/api/family/"+famID+"/respond", map[string]any{"accept": true})
	require(t, code, 200)
	code, _ = f.call(driver, "POST", "/api/family/"+famID+"/delete", map[string]any{})
	require(t, code, 404)
	code, _ = f.call(friend, "POST", "/api/family/"+famID+"/delete", map[string]any{})
	require(t, code, 200)

	when := time.Now().Add(2 * time.Hour).UTC().Format(time.RFC3339)
	body := map[string]any{"category": "bike", "pickup_lat": 13.08, "pickup_lng": 80.27, "pickup_label": "Central",
		"dropoff_lat": 13.04, "dropoff_lng": 80.23, "dropoff_label": "Destination", "scheduled_for": when}
	code, sched := f.call(referrer, "POST", "/api/scheduled-rides", body)
	require(t, code, 201)
	body["scheduled_for"] = time.Now().Add(time.Minute).UTC().Format(time.RFC3339)
	code, _ = f.call(referrer, "POST", "/api/scheduled-rides", body)
	require(t, code, 400)
	body["scheduled_for"], body["pickup_lat"] = when, 20.0
	code, _ = f.call(referrer, "POST", "/api/scheduled-rides", body)
	require(t, code, 422)
	code, _ = f.call(friend, "POST", "/api/scheduled-rides/"+sched["id"].(string)+"/cancel", map[string]any{})
	require(t, code, 404)
	code, _ = f.call(referrer, "POST", "/api/scheduled-rides/"+sched["id"].(string)+"/cancel", map[string]any{})
	require(t, code, 200)

	prefs := map[string]any{"language": "ta", "wheelchair_access": true, "hearing_impaired": false, "visually_impaired": false,
		"extra_assistance": true, "large_text": true, "notifications_enabled": true}
	code, _ = f.call(referrer, "POST", "/api/preferences", prefs)
	require(t, code, 200)
	prefs["language"] = "xx"
	code, _ = f.call(referrer, "POST", "/api/preferences", prefs)
	require(t, code, 400)
	_, state = f.call(referrer, "GET", "/api/companion", nil)
	if p := state["preferences"].(map[string]any); p["language"] != "ta" || p["wheelchair_access"] != true {
		t.Fatalf("preferences not saved: %#v", p)
	}
	code, _ = f.call(referrer, "POST", "/api/notifications/read", map[string]any{})
	require(t, code, 200)
}

func TestRideForOtherPersonFamilyAndFavoriteFirst(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	rider := f.actor("rider", false)
	family := f.actor("rider", false)
	fav := f.actor("rider", true)
	other := f.actor("rider", true)

	n := 0
	book := func(c client, extra map[string]any) (int, map[string]any) {
		n++
		q := f.quote(c)
		body := map[string]any{"quote_id": q, "request_key": fmt.Sprintf("22222222-2222-4222-8222-%012d", n), "payment_method": "cash"}
		for k, v := range extra {
			body[k] = v
		}
		return f.call(c, "POST", "/api/rides", body)
	}
	cancelAll := func() {
		f.s.DB.Exec(ctx, "UPDATE rides SET status='cancelled' WHERE status='requested'")
	}

	code, _ := book(rider, map[string]any{"passenger_name": "Asha"})
	require(t, code, 400)
	code, _ = book(rider, map[string]any{"passenger_name": "Asha", "passenger_phone": "12345"})
	require(t, code, 400)
	code, _ = book(rider, map[string]any{"family_member_id": "00000000-0000-4000-8000-000000000000"})
	require(t, code, 404)
	code, out := book(rider, map[string]any{"passenger_name": "Asha", "passenger_phone": "9876543210"})
	require(t, code, 201)
	_, state := f.call(rider, "GET", "/api/state", nil)
	ride := state["rides"].([]any)[0].(map[string]any)
	if ride["passenger_name"] != "Asha" || ride["id"] != out["id"] {
		t.Fatalf("passenger not stored: %#v", ride)
	}
	cancelAll()

	f.s.DB.Exec(ctx, "UPDATE accounts SET email='fam@example.invalid', name='Meena Member' WHERE id=$1", family.id)
	_, inv := f.call(rider, "POST", "/api/family/invite", map[string]string{"email": "fam@example.invalid"})
	famID := inv["id"].(string)
	code, _ = book(rider, map[string]any{"family_member_id": famID})
	require(t, code, 404) // not yet accepted
	f.call(family, "POST", "/api/family/"+famID+"/respond", map[string]any{"accept": true})
	code, _ = book(rider, map[string]any{"family_member_id": famID})
	require(t, code, 201)
	_, state = f.call(rider, "GET", "/api/state", nil)
	if state["rides"].([]any)[0].(map[string]any)["passenger_name"] != "Meena Member" {
		t.Fatal("family passenger name not used")
	}
	cancelAll()

	// Favorite-first: only the favorite sees and may accept during the reservation window.
	f.s.DB.Exec(ctx, "INSERT INTO favorite_drivers(rider_id,driver_id) VALUES($1,$2)", rider.id, fav.id)
	code, out = book(rider, map[string]any{"favorite_first": true})
	require(t, code, 201)
	rideID := out["id"].(string)
	f.dispatch()
	_, st := f.call(other, "GET", "/api/state", nil)
	if len(st["offers"].([]any)) != 0 {
		t.Fatal("non-favorite saw reserved offer")
	}
	require(t, f.act(other, rideID, "accept", 1, ""), 409)
	_, st = f.call(fav, "GET", "/api/state", nil)
	if len(st["offers"].([]any)) != 1 {
		t.Fatal("favorite did not see offer")
	}
	f.s.DB.Exec(ctx, "UPDATE rides SET favorite_first_until=now()-interval '1 second', dispatch_at=now()-interval '20 seconds' WHERE id=$1", rideID)
	f.dispatch()
	require(t, f.act(other, rideID, "accept", 1, ""), 200)
}
