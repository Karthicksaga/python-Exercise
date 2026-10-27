package app

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
)

func circleFixture(t *testing.T) (*fixture, client, client, client) {
	f := setup(t)
	f.s.Config.Features.HopCircle = true
	rider := f.actor("rider", false)
	captain := f.actor("rider", true)
	other := f.actor("rider", true)
	return f, rider, captain, other
}
func circleRelationship(t *testing.T, f *fixture, rider, captain client) {
	t.Helper()
	_, e := f.s.DB.Exec(context.Background(), `INSERT INTO rides(quote_id,rider_id,driver_id,request_key,payment_method,status) VALUES($1,$2,$3,$4,'cash','completed')`, f.quote(rider), rider.id, captain.id, "99999999-9999-4999-8999-"+strings.ReplaceAll(captain.id, "-", "")[:12])
	if e != nil {
		t.Fatal(e)
	}
	_, e = f.s.DB.Exec(context.Background(), "INSERT INTO favorite_drivers(rider_id,driver_id) VALUES($1,$2) ON CONFLICT DO NOTHING", rider.id, captain.id)
	if e != nil {
		t.Fatal(e)
	}
	status, _ := f.call(captain, "POST", "/api/drivers/circle/preferences", map[string]bool{"opted_in": true})
	require(t, status, 200)
}
func circleBook(t *testing.T, f *fixture, rider client, captain string) string {
	t.Helper()
	status, out := f.call(rider, "POST", "/api/rides", map[string]any{"quote_id": f.quote(rider), "request_key": "11111111-1111-4111-8111-" + strings.ReplaceAll(rider.id, "-", "")[:12], "payment_method": "cash", "circle": true, "circle_captain_id": captain})
	if status != 201 {
		t.Fatalf("Circle booking: %d %#v", status, out)
	}
	return out["id"].(string)
}
func TestCircleFlagGateAndLegacyFavorites(t *testing.T) {
	f, rider, captain, _ := circleFixture(t)
	f.s.Config.Features.HopCircle = false
	require(t, func() int { code, _ := f.call(rider, "GET", "/api/circle/captains", nil); return code }(), 404)
	code, _ := f.call(rider, "POST", "/api/rides", map[string]any{"quote_id": f.quote(rider), "request_key": "11111111-1111-4111-8111-000000000001", "payment_method": "cash", "circle": true})
	require(t, code, 404)
	// Legacy favorite-first is independently exercised by the existing companion test.
	f.s.Config.Features.HopCircle = true
	code, _ = f.call(rider, "GET", "/api/drivers/circle/preferences", nil)
	require(t, code, 403)
	code, _ = f.call(captain, "POST", "/api/drivers/circle/preferences", map[string]any{})
	require(t, code, 400)
	r := httptest.NewRequest("GET", "/api/circle/captains", nil)
	w := httptest.NewRecorder()
	f.s.Handler().ServeHTTP(w, r)
	require(t, w.Code, 401)
}
func TestCirclePreferredInvitationFallbackAndFlagDisable(t *testing.T) {
	f, rider, captain, other := circleFixture(t)
	circleRelationship(t, f, rider, captain)
	id := circleBook(t, f, rider, captain.id)
	f.dispatch()
	code, out := f.call(captain, "GET", "/api/drivers/circle/invitations", nil)
	require(t, code, 200)
	if len(out["invitations"].([]any)) != 1 {
		t.Fatalf("missing invitation: %#v", out)
	}
	_, out = f.call(other, "GET", "/api/state", nil)
	if len(out["offers"].([]any)) != 0 {
		t.Fatal("non-preferred Captain saw invitation")
	}
	require(t, f.act(other, id, "accept", 1, ""), 409)
	// Expiry releases the window through the existing staged dispatcher.
	f.s.DB.Exec(context.Background(), "UPDATE rides SET circle_until=now()-interval '1 second',dispatch_at=now()-interval '20 seconds',dispatch_lease=NULL WHERE id=$1", id)
	f.dispatch()
	require(t, f.act(other, id, "accept", 1, ""), 200)
	// An accepted ride's lifecycle is not gated by Circle.
	f.s.Config.Features.HopCircle = false
	_, out = f.call(other, "GET", "/api/state", nil)
	if len(out["rides"].([]any)) == 0 {
		t.Fatal("flag disable hid accepted ride")
	}
}
func TestCircleOptOutBlockAndOwnership(t *testing.T) {
	f, rider, captain, other := circleFixture(t)
	circleRelationship(t, f, rider, captain)
	id := circleBook(t, f, rider, captain.id)
	f.dispatch()
	code, _ := f.call(captain, "POST", "/api/drivers/circle/preferences", map[string]bool{"opted_in": false})
	require(t, code, 200)
	require(t, f.act(captain, id, "accept", 1, ""), 409)
	code, _ = f.call(captain, "POST", "/api/drivers/circle/preferences", map[string]bool{"opted_in": true})
	require(t, code, 200)
	code, _ = f.call(other, "POST", "/api/drivers/circle/blocks/"+rider.id, map[string]bool{"blocked": true})
	require(t, code, 404)
	code, _ = f.call(captain, "POST", "/api/drivers/circle/blocks/"+rider.id, map[string]bool{"blocked": true})
	require(t, code, 200)
	require(t, f.act(captain, id, "accept", 1, ""), 409)
	code, out := f.call(rider, "GET", "/api/circle/captains", nil)
	require(t, code, 200)
	if out["captains"].([]any)[0].(map[string]any)["accepts_circle"] != false {
		t.Fatal("blocked Captain shown as participating")
	}
	f.s.DB.Exec(context.Background(), "UPDATE rides SET circle_until=now()-interval '1 second' WHERE id=$1", id)
	require(t, f.act(captain, id, "accept", 1, ""), 409)
	code, _ = f.call(captain, "POST", "/api/drivers/circle/blocks/"+rider.id, map[string]bool{"blocked": false})
	require(t, code, 200)
	require(t, f.act(captain, id, "accept", 1, ""), 200)
}
func TestCircleFlagDisableReleasesPendingRide(t *testing.T) {
	f, rider, captain, other := circleFixture(t)
	circleRelationship(t, f, rider, captain)
	id := circleBook(t, f, rider, captain.id)
	f.dispatch()
	f.s.Config.Features.HopCircle = false
	f.s.DB.Exec(context.Background(), "UPDATE rides SET dispatch_at=now()-interval '20 seconds',dispatch_lease=NULL WHERE id=$1", id)
	f.dispatch()
	require(t, f.act(other, id, "accept", 1, ""), 200)
}
func TestCircleAddOnlyOwnCompletedRide(t *testing.T) {
	f, rider, captain, other := circleFixture(t)
	id := f.book(rider, f.quote(rider))
	require(t, f.act(captain, id, "accept", 1, ""), 200)
	f.s.DB.Exec(context.Background(), "UPDATE rides SET status='completed' WHERE id=$1", id)
	code, _ := f.call(other, "POST", "/api/circle/captains", map[string]string{"ride_id": id})
	require(t, code, 409)
	code, _ = f.call(rider, "POST", "/api/circle/captains", map[string]string{"ride_id": id})
	require(t, code, 201)
	code, _ = f.call(rider, "POST", "/api/circle/captains", map[string]string{"ride_id": "invalid"})
	require(t, code, 400)
	code, _ = f.call(rider, "POST", "/api/circle/captains/"+captain.id+"/remove", map[string]any{})
	require(t, code, 200)
	_, out := f.call(rider, "GET", "/api/circle/captains", nil)
	if len(out["captains"].([]any)) != 0 {
		t.Fatal("Circle removal did not update legacy favorites")
	}
}

func TestCircleEligibilityExpiryDeclineAndRetry(t *testing.T) {
	f, rider, captain, other := circleFixture(t)
	// Cannot request a random Captain, or combine Circle and shared matching.
	code, _ := f.call(rider, "POST", "/api/rides", map[string]any{"quote_id": f.quote(rider), "request_key": "11111111-1111-4111-8111-000000000010", "payment_method": "cash", "circle": true, "circle_captain_id": captain.id})
	require(t, code, 409)
	circleRelationship(t, f, rider, captain)
	code, _ = f.call(rider, "POST", "/api/rides", map[string]any{"quote_id": f.quote(rider), "request_key": "11111111-1111-4111-8111-000000000011", "payment_method": "cash", "circle": true, "share": true})
	require(t, code, 400)
	code, _ = f.call(rider, "POST", "/api/rides", map[string]any{"quote_id": f.quote(rider), "request_key": "11111111-1111-4111-8111-000000000012", "payment_method": "cash", "circle": true, "circle_captain_id": "invalid"})
	require(t, code, 400)
	id := circleBook(t, f, rider, "")
	f.dispatch()
	code, _ = f.call(captain, "POST", "/api/rides/"+id+"/decline", map[string]any{})
	require(t, code, 200)
	_, out := f.call(captain, "GET", "/api/drivers/circle/invitations", nil)
	if len(out["invitations"].([]any)) != 0 {
		t.Fatal("declined invitation still shown")
	}
	f.s.DB.Exec(context.Background(), "UPDATE rides SET circle_until=now()-interval '1 second',dispatch_at=now()-interval '20 seconds',dispatch_lease=NULL WHERE id=$1", id)
	f.dispatch()
	// Existing acceptance still checks expiry and version.
	f.s.DB.Exec(context.Background(), "UPDATE rides SET expires_at=now()-interval '1 second' WHERE id=$1", id)
	require(t, f.act(other, id, "accept", 1, ""), 409)
}
func TestCircleIdempotentRetryAfterFlagDisable(t *testing.T) {
	f, rider, captain, _ := circleFixture(t)
	circleRelationship(t, f, rider, captain)
	quote := f.quote(rider)
	body := map[string]any{"quote_id": quote, "request_key": "11111111-1111-4111-8111-000000000050", "payment_method": "cash", "circle": true}
	code, first := f.call(rider, "POST", "/api/rides", body)
	require(t, code, 201)
	f.s.Config.Features.HopCircle = false
	code, second := f.call(rider, "POST", "/api/rides", body)
	require(t, code, 200)
	if first["id"] != second["id"] {
		t.Fatal("retry created another booking")
	}
}
func TestCircleInvalidPreferencesAndUnavailableCaptain(t *testing.T) {
	f, rider, captain, _ := circleFixture(t)
	f.s.DB.Exec(context.Background(), "UPDATE drivers SET online=false,status='pending' WHERE user_id=$1", captain.id)
	code, _ := f.call(captain, "POST", "/api/drivers/circle/preferences", map[string]bool{"opted_in": true})
	require(t, code, 403)
	code, _ = f.call(captain, "POST", "/api/drivers/circle/blocks/not-a-uuid", map[string]bool{"blocked": true})
	require(t, code, 400)
	code, _ = f.call(rider, "POST", "/api/drivers/circle/blocks/"+captain.id, map[string]bool{"blocked": true})
	require(t, code, 403)
}

func TestCircleConcurrentAcceptance(t *testing.T) {
	f, rider, first, second := circleFixture(t)
	circleRelationship(t, f, rider, first)
	circleRelationship(t, f, rider, second)
	id := circleBook(t, f, rider, "")
	f.dispatch()
	results := make(chan int, 2)
	go func() { results <- f.act(first, id, "accept", 1, "") }()
	go func() { results <- f.act(second, id, "accept", 1, "") }()
	a, b := <-results, <-results
	if !((a == 200 && b == 409) || (b == 200 && a == 409)) {
		t.Fatalf("expected one acceptance: %d %d", a, b)
	}
}
func TestCircleOptOutRevalidatedAfterDriverLock(t *testing.T) {
	f, rider, captain, _ := circleFixture(t)
	circleRelationship(t, f, rider, captain)
	id := circleBook(t, f, rider, "")
	f.dispatch()
	tx, e := f.s.DB.Begin(context.Background())
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback(context.Background())
	if _, e = tx.Exec(context.Background(), "SELECT 1 FROM drivers WHERE user_id=$1 FOR UPDATE", captain.id); e != nil {
		t.Fatal(e)
	}
	result := make(chan int, 1)
	go func() { result <- f.act(captain, id, "accept", 1, "") }()
	if _, e = tx.Exec(context.Background(), "UPDATE circle_captain_preferences SET opted_in=false WHERE captain_id=$1", captain.id); e != nil {
		t.Fatal(e)
	}
	if e = tx.Commit(context.Background()); e != nil {
		t.Fatal(e)
	}
	require(t, <-result, 409)
}
func TestCircleFlagsDefaultOff(t *testing.T) {
	t.Setenv("FEATURE_HOP_CIRCLE", "")
	t.Setenv("APP_ENV", "development")
	t.Setenv("DATABASE_URL", "postgres://localhost/hop_test")
	t.Setenv("REDIS_URL", "redis://localhost/15")
	t.Setenv("OIDC_ISSUER", "https://issuer.example.invalid")
	t.Setenv("OIDC_CLIENT_ID", "test")
	t.Setenv("SESSION_KEY", strings.Repeat("x", 32))
	t.Setenv("PUBLIC_ORIGIN", "http://localhost:8080")
	c, e := ConfigFromEnv()
	if e != nil {
		t.Fatal(e)
	}
	if c.Features != (FeatureFlags{}) {
		t.Fatal("new features must default to disabled")
	}
	t.Setenv("FEATURE_HOP_CIRCLE", "true")
	c, e = ConfigFromEnv()
	if e != nil {
		t.Fatal(e)
	}
	if !c.Features.HopCircle {
		t.Fatal("Circle flag did not load")
	}
	c.Features.HopCircle = false
	if c.Features != (FeatureFlags{}) {
		t.Fatal("Circle enabled an unrelated feature")
	}
}

func TestCircleRequestKeyCannotChangePreference(t *testing.T) {
	f, rider, captain, _ := circleFixture(t)
	circleRelationship(t, f, rider, captain)
	body := map[string]any{"quote_id": f.quote(rider), "request_key": "11111111-1111-4111-8111-000000000070", "payment_method": "cash", "circle": true}
	code, _ := f.call(rider, "POST", "/api/rides", body)
	require(t, code, 201)
	body["circle_captain_id"] = captain.id
	code, _ = f.call(rider, "POST", "/api/rides", body)
	require(t, code, 409)
	code, _ = f.call(rider, "GET", "/api/drivers/circle/invitations", nil)
	require(t, code, 403)
}
