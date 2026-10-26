package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type fixture struct {
	s     *Server
	http  *httptest.Server
	route *httptest.Server
	area  string
	t     *testing.T
}
type client struct{ id, secret, csrf string }

func setup(t *testing.T) *fixture {
	t.Helper()
	database := os.Getenv("TEST_DATABASE_URL")
	cacheURL := os.Getenv("TEST_REDIS_URL")
	if database == "" || cacheURL == "" {
		t.Skip("integration requires TEST_DATABASE_URL and TEST_REDIS_URL pointing to disposable services")
	}
	ctx := context.Background()
	parsed, e := pgxpool.ParseConfig(database)
	if e != nil {
		t.Fatal(e)
	}
	if !strings.HasSuffix(parsed.ConnConfig.Database, "_test") {
		t.Fatal("refusing destructive fixture: database name must end in _test")
	}
	db, e := pgxpool.NewWithConfig(ctx, parsed)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(ctx, "DROP SCHEMA public CASCADE; CREATE SCHEMA public"); e != nil {
		t.Fatal(e)
	}
	migrations, e := os.ReadDir("../../migrations")
	if e != nil {
		t.Fatal(e)
	}
	for _, migration := range migrations {
		if migration.IsDir() || !strings.HasSuffix(migration.Name(), ".sql") {
			continue
		}
		content, readErr := os.ReadFile("../../migrations/" + migration.Name())
		if readErr != nil {
			t.Fatal(readErr)
		}
		if _, execErr := db.Exec(ctx, string(content)); execErr != nil {
			t.Fatalf("apply %s: %v", migration.Name(), execErr)
		}
	}
	ro, e := redis.ParseURL(cacheURL)
	if e != nil {
		t.Fatal(e)
	}
	if ro.DB != 15 {
		t.Fatal("refusing destructive fixture: Redis must use disposable DB 15")
	}
	cache := redis.NewClient(ro)
	if e = cache.FlushDB(ctx).Err(); e != nil {
		t.Fatal(e)
	}
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		geometry := map[string]any{"type": "LineString", "coordinates": [][]float64{{80.27, 13.08}, {80.23, 13.04}}}
		routes := []map[string]any{{"distance": 5000, "duration": 900, "geometry": geometry}}
		if r.URL.Query().Get("alternatives") == "true" {
			routes = append(routes, map[string]any{"distance": 4200, "duration": 1100, "geometry": geometry})
		}
		write(w, 200, map[string]any{"code": "Ok", "routes": routes})
	}))
	s := &Server{Media: &memoryMedia{objects: map[string][]byte{}}, Config: Config{PublicOrigin: "https://hop.test", SessionKey: strings.Repeat("test-key", 8), RoutingURL: router.URL, Development: true}, DB: db, Cache: cache, HTTP: &http.Client{Timeout: time.Second}}
	httpServer := httptest.NewServer(s.Handler())
	f := &fixture{s: s, http: httpServer, route: router, t: t}
	e = db.QueryRow(ctx, `INSERT INTO areas(name,state,min_lat,max_lat,min_lng,max_lng,base_paise,per_km_paise,minimum_paise,active,approval_reference) VALUES('Test area','Test state',12,14,79,81,1500,800,2500,true,'test only') RETURNING id`).Scan(&f.area)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { httpServer.Close(); router.Close(); s.Close() })
	return f
}
func (f *fixture) actor(role string, driver bool) client {
	f.t.Helper()
	ctx := context.Background()
	c := client{secret: randomToken(), csrf: randomToken()}
	e := f.s.DB.QueryRow(ctx, "INSERT INTO accounts(issuer,subject,email,name,role) VALUES('test',$1,'test@example.invalid','Test person',$2) RETURNING id", randomToken(), role).Scan(&c.id)
	if e != nil {
		f.t.Fatal(e)
	}
	b, _ := json.Marshal(Session{UserID: c.id, CSRF: c.csrf})
	if e = f.s.Cache.Set(ctx, "session:"+digest(c.secret), b, time.Hour).Err(); e != nil {
		f.t.Fatal(e)
	}
	phone := fmt.Sprintf("9%09d", time.Now().UnixNano()%1000000000)
	if _, e = f.s.DB.Exec(ctx, "INSERT INTO verified_phones(account_id,phone) VALUES($1,$2)", c.id, phone); e != nil {
		f.t.Fatal(e)
	}
	if _, e = f.s.DB.Exec(ctx, "INSERT INTO account_profiles(account_id,phone) VALUES($1,$2) ON CONFLICT(account_id) DO NOTHING", c.id, phone); e != nil {
		f.t.Fatal(e)
	}
	if driver {
		_, e = f.s.DB.Exec(ctx, `INSERT INTO drivers(user_id,area_id,status,vehicle_number,upi_id,license_reference,insurance_reference,license_expires,insurance_expires,online,lat,lng,accuracy,location_at) VALUES($1,$2,'approved','TEST1234','test@bank','review-1','review-2',CURRENT_DATE+30,CURRENT_DATE+30,true,13.08,80.27,10,now())`, c.id, f.area)
		if e != nil {
			f.t.Fatal(e)
		}
	}
	return c
}
func (f *fixture) call(c client, method, path string, body any) (int, map[string]any) {
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest(method, f.http.URL+path, bytes.NewReader(b))
	req.AddCookie(&http.Cookie{Name: f.s.cookieName(req), Value: c.secret})
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://hop.test")
	req.Header.Set("X-CSRF-Token", c.csrf)
	res, e := http.DefaultClient.Do(req)
	if e != nil {
		f.t.Error(e)
		return 0, nil
	}
	defer res.Body.Close()
	var out map[string]any
	if e = json.NewDecoder(res.Body).Decode(&out); e != nil {
		f.t.Error(e)
	}
	return res.StatusCode, out
}
func (f *fixture) quote(c client) string {
	return f.quoteVehicle(c, "bike")
}
func (f *fixture) quoteVehicle(c client, category string) string {
	f.t.Helper()
	code, out := f.call(c, "POST", "/api/quotes", map[string]any{"area_id": f.area, "vehicle_category": category, "pickup": Point{13.08, 80.27, "Central"}, "dropoff": Point{13.04, 80.23, "Destination"}})
	if code != 201 {
		f.t.Fatalf("quote %d %#v", code, out)
	}
	if out["fare_paise"] != float64(5500) {
		f.t.Fatalf("wrong price %#v", out)
	}
	if route, ok := out["route"].([]any); !ok || len(route) < 2 {
		f.t.Fatalf("missing route geometry %#v", out["route"])
	}
	return out["id"].(string)
}
func TestVehicleCategoryQuoteAndDriverMatching(t *testing.T) {
	f := setup(t)
	rider := f.actor("rider", false)
	bikeDriver := f.actor("rider", true)
	autoDriver := f.actor("rider", true)
	operator := f.actor("operator", false)
	if _, e := f.s.DB.Exec(context.Background(), "UPDATE drivers SET vehicle_category='auto' WHERE user_id=$1", autoDriver.id); e != nil {
		t.Fatal(e)
	}
	code, _ := f.call(operator, "POST", "/api/operator/pricing", map[string]any{
		"area_id": f.area, "category": "auto", "base_paise": 3000,
		"per_km_paise": 1200, "minimum_paise": 4000, "enabled": true,
	})
	require(t, code, 200)
	code, pricing := f.call(rider, "GET", "/api/config", nil)
	require(t, code, 200)
	var areaVehicles []any
	for _, v := range pricing["vehicles"].([]any) {
		if m, ok := v.(map[string]any); ok && m["area_id"] == f.area {
			areaVehicles = append(areaVehicles, v)
		}
	}
	if len(areaVehicles) != 2 {
		t.Fatalf("expected bike and auto pricing for area %s, got %#v", f.area, areaVehicles)
	}
	code, unavailable := f.call(rider, "POST", "/api/quotes", map[string]any{"area_id": f.area, "vehicle_category": "suv", "pickup": Point{13.08, 80.27, "Central"}, "dropoff": Point{13.04, 80.23, "Destination"}})
	require(t, code, 409)
	if unavailable["error"] == "" {
		t.Fatalf("missing unavailable category error: %#v", unavailable)
	}
	code, quote := f.call(rider, "POST", "/api/quotes", map[string]any{"area_id": f.area, "vehicle_category": "auto", "pickup": Point{13.08, 80.27, "Central"}, "dropoff": Point{13.04, 80.23, "Destination"}})
	require(t, code, 201)
	if quote["vehicle_category"] != "auto" || quote["fare_paise"] != float64(9000) {
		t.Fatalf("incorrect category quote: %#v", quote)
	}
	breakdown := quote["fare_breakdown"].(map[string]any)
	if breakdown["base_paise"] != float64(3000) || breakdown["distance_paise"] != float64(6000) || breakdown["platform_fee_paise"] != float64(0) {
		t.Fatalf("incorrect fare breakdown: %#v", breakdown)
	}
	id := f.book(rider, quote["id"].(string))
	require(t, f.act(bikeDriver, id, "accept", 1, ""), 403)
	require(t, f.act(autoDriver, id, "accept", 1, ""), 200)
}

func TestDriverPreferencesFilterOffersAndAcceptance(t *testing.T) {
	f := setup(t)
	rider := f.actor("rider", false)
	driver := f.actor("rider", true)
	// About 2 km from the pickup, so a 500 m radius excludes it and a 5 km radius includes it.
	if _, e := f.s.DB.Exec(context.Background(), "UPDATE drivers SET lat=13.098 WHERE user_id=$1", driver.id); e != nil {
		t.Fatal(e)
	}
	id := f.book(rider, f.quote(rider))

	code, _ := f.call(driver, "POST", "/api/drivers/preferences", map[string]any{
		"pickup_radius_meters": 500, "minimum_fare_paise": 0,
	})
	require(t, code, 200)
	_, state := f.call(driver, "GET", "/api/state", nil)
	if offers := state["offers"].([]any); len(offers) != 0 {
		t.Fatalf("offer outside configured pickup radius: %#v", offers)
	}
	require(t, f.act(driver, id, "accept", 1, ""), 403)

	code, _ = f.call(driver, "POST", "/api/drivers/preferences", map[string]any{
		"pickup_radius_meters": 5000, "minimum_fare_paise": 5501,
	})
	require(t, code, 200)
	_, state = f.call(driver, "GET", "/api/state", nil)
	if offers := state["offers"].([]any); len(offers) != 0 {
		t.Fatalf("offer below configured minimum fare: %#v", offers)
	}

	code, _ = f.call(driver, "POST", "/api/drivers/preferences", map[string]any{
		"pickup_radius_meters": 5000, "minimum_fare_paise": 5500,
	})
	require(t, code, 200)
	_, state = f.call(driver, "GET", "/api/state", nil)
	if offers := state["offers"].([]any); len(offers) != 1 {
		t.Fatalf("expected one matching offer at preference boundary, got %#v", offers)
	}
	require(t, f.act(driver, id, "accept", 1, ""), 200)

	code, _ = f.call(driver, "POST", "/api/drivers/preferences", map[string]any{
		"pickup_radius_meters": 499, "minimum_fare_paise": 0,
	})
	require(t, code, 400)
}

func TestProfileSavedLocationsAndRideRatings(t *testing.T) {
	f := setup(t)
	rider := f.actor("rider", false)
	driver := f.actor("rider", true)

	code, profile := f.call(rider, "POST", "/api/profile", map[string]string{"name": "  Rider Updated  "})
	require(t, code, 200)
	if profile["name"] != "Rider Updated" {
		t.Fatalf("profile name was not normalized: %#v", profile)
	}

	code, _ = f.call(rider, "POST", "/api/profile", map[string]string{"name": "x"})
	require(t, code, 400)

	code, location := f.call(rider, "POST", "/api/locations", map[string]any{
		"label": "Home", "kind": "home", "lat": 13.08, "lng": 80.27, "place_label": "Central, Chennai",
	})
	require(t, code, 200)
	locationID := location["id"].(string)
	_, state := f.call(rider, "GET", "/api/state", nil)
	if len(state["saved_locations"].([]any)) != 1 {
		t.Fatalf("saved place missing from account state: %#v", state["saved_locations"])
	}
	code, _ = f.call(driver, "POST", "/api/locations/"+locationID+"/delete", nil)
	require(t, code, 404)
	code, _ = f.call(rider, "POST", "/api/locations/"+locationID+"/delete", nil)
	require(t, code, 200)

	rideID := f.book(rider, f.quote(rider))
	require(t, f.act(driver, rideID, "accept", 1, ""), 200)
	require(t, f.act(driver, rideID, "arrive", 2, ""), 200)
	require(t, f.act(driver, rideID, "start", 3, f.s.pin(rideID)), 200)
	f.atDestination(driver, rideID)
	require(t, f.act(driver, rideID, "complete", 4, ""), 200)
	code, rating := f.call(rider, "POST", "/api/rides/"+rideID+"/rating", map[string]any{
		"score": 5, "comment": "A smooth ride",
	})
	require(t, code, 201)
	if rating["score"] != float64(5) {
		t.Fatalf("rating response incorrect: %#v", rating)
	}
	code, _ = f.call(rider, "POST", "/api/rides/"+rideID+"/rating", map[string]any{"score": 4})
	require(t, code, 409)
	_, state = f.call(rider, "GET", "/api/state", nil)
	ride := state["rides"].([]any)[0].(map[string]any)
	if ride["my_rating"] != float64(5) || ride["my_rating_comment"] != "A smooth ride" {
		t.Fatalf("rating not returned to rater: %#v", ride)
	}
}

func TestDriverEarningsAndReceiptAccess(t *testing.T) {
	f := setup(t)
	rider := f.actor("rider", false)
	driver := f.actor("rider", true)
	rideID := f.book(rider, f.quote(rider))
	require(t, f.act(driver, rideID, "accept", 1, ""), 200)
	require(t, f.act(driver, rideID, "arrive", 2, ""), 200)
	require(t, f.act(driver, rideID, "start", 3, f.s.pin(rideID)), 200)
	f.atDestination(driver, rideID)
	require(t, f.act(driver, rideID, "complete", 4, ""), 200)

	code, report := f.call(driver, "GET", "/api/drivers/earnings", nil)
	require(t, code, 200)
	summary := report["summary"].(map[string]any)
	if summary["all_time_completed_trips"] != float64(1) || summary["all_time_fare_paise"] != float64(5500) || summary["all_time_reported_paid_paise"] != float64(0) {
		t.Fatalf("unexpected unconfirmed driver earnings summary: %#v", summary)
	}
	receipts := report["rides"].([]any)
	if len(receipts) != 1 || receipts[0].(map[string]any)["fare_paise"] != float64(5500) {
		t.Fatalf("driver receipt missing fare: %#v", report["rides"])
	}
	code, _ = f.call(rider, "GET", "/api/drivers/earnings", nil)
	require(t, code, 403)

	require(t, f.act(driver, rideID, "payment_received", 5, ""), 200)
	code, report = f.call(driver, "GET", "/api/drivers/earnings", nil)
	require(t, code, 200)
	summary = report["summary"].(map[string]any)
	if summary["all_time_reported_paid_paise"] != float64(5500) {
		t.Fatalf("reported payment not reflected: %#v", summary)
	}
}

func (f *fixture) book(c client, q string) string {
	f.t.Helper()
	code, out := f.call(c, "POST", "/api/rides", map[string]any{"quote_id": q, "request_key": "11111111-1111-4111-8111-" + strings.ReplaceAll(c.id, "-", "")[:12], "payment_method": "cash"})
	if code != 201 {
		f.t.Fatalf("book %d %#v", code, out)
	}
	// Drivers can only accept rides they were offered, so run the dispatcher once as the server loop would.
	f.dispatch()
	return out["id"].(string)
}
func (f *fixture) dispatch() {
	f.t.Helper()
	if e := f.s.DispatchStaged(context.Background()); e != nil {
		f.t.Fatal(e)
	}
}
func (f *fixture) act(c client, id, action string, version int, code string) int {
	status, _ := f.call(c, "POST", "/api/rides/"+id+"/actions", map[string]any{"action": action, "version": version, "code": code, "reason": "Change of plans"})
	return status
}
func require(t *testing.T, got, want int) {
	t.Helper()
	if got != want {
		t.Fatalf("status got %d want %d", got, want)
	}
}

func TestRideLifecycleAndPaymentSeparation(t *testing.T) {
	f := setup(t)
	r := f.actor("rider", false)
	d := f.actor("rider", true)
	stranger := f.actor("rider", false)
	id := f.book(r, f.quote(r))
	_, state := f.call(r, "GET", "/api/state", nil)
	rides := state["rides"].([]any)
	route := rides[0].(map[string]any)["route"].([]any)
	if len(route) < 2 {
		t.Fatalf("booked ride lost its road geometry: %#v", route)
	}
	require(t, f.act(r, id, "accept", 1, ""), 409)
	require(t, f.act(stranger, id, "cancel", 1, ""), 403)
	require(t, f.act(d, id, "accept", 1, ""), 200)
	require(t, f.act(d, id, "complete", 2, ""), 409)
	_, state = f.call(d, "GET", "/api/state", nil)
	ride := state["rides"].([]any)[0].(map[string]any)
	if _, ok := ride["pickup_code"]; ok {
		t.Fatal("driver can see pickup code")
	}
	require(t, f.act(d, id, "arrive", 2, ""), 200)
	require(t, f.act(d, id, "start", 3, "wrong"), 400)
	require(t, f.act(d, id, "start", 3, f.s.pin(id)), 200)
	require(t, f.act(r, id, "cancel", 4, ""), 409)
	f.atDestination(d, id)
	require(t, f.act(d, id, "complete", 4, ""), 200)
	var status string
	f.s.DB.QueryRow(context.Background(), "SELECT payment_status FROM rides WHERE id=$1", id).Scan(&status)
	if status != "unconfirmed" {
		t.Fatal("completion marked paid")
	}
	require(t, f.act(d, id, "payment_received", 5, ""), 200)
	require(t, f.act(r, id, "payment_disputed", 6, ""), 200)
	require(t, f.act(d, id, "payment_received", 7, ""), 409)
	code, _ := f.call(r, "POST", "/api/incidents", map[string]string{"ride_id": id, "message": "Payment issue needs review"})
	require(t, code, 201)
	code, _ = f.call(stranger, "POST", "/api/incidents", map[string]string{"ride_id": id, "message": "This is not my ride"})
	require(t, code, 403)
	var events int
	f.s.DB.QueryRow(context.Background(), "SELECT count(*) FROM audit_events WHERE ride_id=$1", id).Scan(&events)
	if events < 8 {
		t.Fatalf("missing audit events: %d", events)
	}
}
func TestCompetingDriverAcceptance(t *testing.T) {
	f := setup(t)
	r := f.actor("rider", false)
	d1 := f.actor("rider", true)
	d2 := f.actor("rider", true)
	id := f.book(r, f.quote(r))
	results := make(chan int, 2)
	var wg sync.WaitGroup
	for _, d := range []client{d1, d2} {
		wg.Add(1)
		go func(c client) { defer wg.Done(); results <- f.act(c, id, "accept", 1, "") }(d)
	}
	wg.Wait()
	close(results)
	success := 0
	conflicts := 0
	for code := range results {
		if code == 200 {
			success++
		}
		if code == 409 {
			conflicts++
		}
	}
	if success != 1 || conflicts != 1 {
		t.Fatalf("success=%d conflicts=%d", success, conflicts)
	}
}
func TestIdempotencyOwnershipExpiryAndDriverDoubleAssignment(t *testing.T) {
	f := setup(t)
	r := f.actor("rider", false)
	other := f.actor("rider", false)
	d := f.actor("rider", true)
	q := f.quote(r)
	id := f.book(r, q)
	body := map[string]any{"quote_id": q, "request_key": "11111111-1111-4111-8111-" + strings.ReplaceAll(r.id, "-", "")[:12], "payment_method": "cash"}
	code, out := f.call(r, "POST", "/api/rides", body)
	require(t, code, 200)
	if out["id"] != id {
		t.Fatal("idempotency returned a different ride")
	}
	body["quote_id"] = f.quote(r)
	code, _ = f.call(r, "POST", "/api/rides", body)
	require(t, code, 409)
	body["request_key"] = "22222222-2222-4222-8222-222222222222"
	body["quote_id"] = q
	code, _ = f.call(other, "POST", "/api/rides", body)
	require(t, code, 409)
	require(t, f.act(d, id, "accept", 1, ""), 200)
	second := f.book(other, f.quote(other))
	require(t, f.act(d, second, "accept", 1, ""), 409)
	f.s.DB.Exec(context.Background(), "UPDATE rides SET expires_at=now()-interval '1 second' WHERE id=$1", second)
	if e := f.s.Expire(context.Background()); e != nil {
		t.Fatal(e)
	}
	var status string
	f.s.DB.QueryRow(context.Background(), "SELECT status FROM rides WHERE id=$1", second).Scan(&status)
	if status != "expired" {
		t.Fatal(status)
	}
}
func TestDriverEligibilityAndPickupLockout(t *testing.T) {
	f := setup(t)
	r := f.actor("rider", false)
	d := f.actor("rider", true)
	id := f.book(r, f.quote(r))
	ctx := context.Background()
	f.s.DB.Exec(ctx, "UPDATE drivers SET location_at=now()-interval '61 seconds' WHERE user_id=$1", d.id)
	require(t, f.act(d, id, "accept", 1, ""), 403)
	f.s.DB.Exec(ctx, "UPDATE drivers SET location_at=now(),status='pending',online=false WHERE user_id=$1", d.id)
	code, _ := f.call(d, "POST", "/api/drivers/location", map[string]any{"lat": 13.08, "lng": 80.27, "accuracy": 10})
	require(t, code, 403)
	f.s.DB.Exec(ctx, "UPDATE drivers SET status='approved',online=true WHERE user_id=$1", d.id)
	require(t, f.act(d, id, "accept", 1, ""), 200)
	require(t, f.act(d, id, "arrive", 2, ""), 200)
	for i := 0; i < 5; i++ {
		require(t, f.act(d, id, "start", 3, "wrong"), 400)
	}
	require(t, f.act(d, id, "start", 3, f.s.pin(id)), 429)
}
func TestCSRFSessionRolesAndUnavailableRoutes(t *testing.T) {
	f := setup(t)
	r := f.actor("rider", false)
	code, _ := f.call(client{}, "GET", "/api/me", nil)
	require(t, code, 401)
	bad := r
	bad.csrf = "bad"
	code, _ = f.call(bad, "POST", "/api/rides", map[string]string{})
	require(t, code, 403)
	code, _ = f.call(r, "GET", "/api/operator", nil)
	require(t, code, 403)
	code, _ = f.call(r, "POST", "/api/quotes", map[string]any{"area_id": f.area, "pickup": Point{20, 80, "Outside"}, "dropoff": Point{13.04, 80.23, "Inside"}})
	require(t, code, 400)
	f.route.Close()
	code, _ = f.call(r, "POST", "/api/quotes", map[string]any{"area_id": f.area, "pickup": Point{13.08, 80.27, "Inside"}, "dropoff": Point{13.04, 80.23, "Inside"}})
	require(t, code, 503)
	code, _ = f.call(r, "POST", "/auth/logout", map[string]string{})
	require(t, code, 200)
	code, _ = f.call(r, "GET", "/api/me", nil)
	require(t, code, 401)
}
func TestOperatorApprovalAndAreaActivation(t *testing.T) {
	f := setup(t)
	op := f.actor("operator", false)
	d := f.actor("rider", false)
	f.uploadEvidence(d)
	code, _ := f.call(d, "POST", "/api/drivers/apply", map[string]string{"area_id": f.area, "vehicle_make": "Honda", "vehicle_model": "Shine", "vehicle_color": "Black", "vehicle_number": "TEST12345", "upi_id": "driver@bank", "license_reference": "verified-license-reference", "insurance_reference": "verified-insurance-reference", "license_expires": time.Now().Add(24 * time.Hour).Format("2006-01-02"), "insurance_expires": time.Now().Add(24 * time.Hour).Format("2006-01-02")})
	require(t, code, 201)
	code, _ = f.call(d, "POST", "/api/operator/drivers/"+d.id, map[string]string{"status": "approved", "note": "Approve myself improperly"})
	require(t, code, 403)
	code, _ = f.call(op, "POST", "/api/operator/drivers/"+d.id, map[string]string{"status": "approved", "note": "Reviewed evidence in verification record TEST-001"})
	require(t, code, 400)
	code, _ = f.call(op, "POST", "/api/admin/drivers/"+d.id, map[string]any{"identity_ok": true, "license_ok": true, "rc_ok": true, "insurance_ok": true, "vehicle_ok": true, "status": "approved", "note": "Missing police check should block"})
	require(t, code, 400)
	code, _ = f.call(op, "POST", "/api/admin/drivers/"+d.id, map[string]any{"identity_ok": true, "license_ok": true, "rc_ok": true, "insurance_ok": true, "vehicle_ok": true, "police_ok": true, "status": "approved", "note": "Reviewed evidence in verification record TEST-001"})
	require(t, code, 200)
	code, _ = f.call(d, "POST", "/api/drivers/online", map[string]any{})
	require(t, code, 200)
	code, _ = f.call(d, "POST", "/api/drivers/location", map[string]any{"lat": 13.08, "lng": 80.27, "accuracy": 10})
	require(t, code, 200)
	code, _ = f.call(op, "POST", "/api/operator/drivers/"+d.id, map[string]string{"status": "suspended", "note": "Suspended following documented review"})
	require(t, code, 200)
	code, _ = f.call(d, "POST", "/api/drivers/location", map[string]any{"lat": 13.08, "lng": 80.27, "accuracy": 10})
	require(t, code, 403)
}
func TestConfigurationFailsClosed(t *testing.T) {
	for _, name := range []string{"DATABASE_URL", "REDIS_URL", "OIDC_ISSUER", "OIDC_CLIENT_ID", "SESSION_KEY", "APP_ENV"} {
		t.Setenv(name, "")
	}
	if _, e := ConfigFromEnv(); e == nil {
		t.Fatal("empty production config passed")
	}
	if got := distance(Point{Lat: 13, Lng: 80}, Point{Lat: 13, Lng: 80}); got != 0 {
		t.Fatal(got)
	}
	if got := fmt.Sprint(1500 + (int64(5000)*800+999)/1000); got != "5500" {
		t.Fatal(got)
	}
}

func TestPinkRidesNeedFemaleRiderAndCertifiedDriver(t *testing.T) {
	f := setup(t)
	op := f.actor("operator", false)
	rider := f.actor("rider", false)
	d := f.actor("rider", true)
	body := map[string]any{"area_id": f.area, "vehicle_category": "bike", "pink": true, "pickup": Point{13.08, 80.27, "Central"}, "dropoff": Point{13.04, 80.23, "Destination"}}
	code, _ := f.call(rider, "POST", "/api/quotes", body)
	require(t, code, 403)
	_, e := f.s.DB.Exec(context.Background(), "INSERT INTO account_profiles(account_id,gender) VALUES($1,'female'),($2,'male') ON CONFLICT(account_id) DO UPDATE SET gender=EXCLUDED.gender", rider.id, d.id)
	if e != nil {
		t.Fatal(e)
	}
	code, _ = f.call(rider, "POST", "/api/quotes", body)
	require(t, code, 201)
	checks := map[string]any{"identity_ok": true, "license_ok": true, "rc_ok": true, "insurance_ok": true, "vehicle_ok": true, "police_ok": true, "status": "approved", "pink_certified": true, "note": "Verified in person at the hub"}
	code, _ = f.call(op, "POST", "/api/admin/drivers/"+d.id, checks)
	require(t, code, 400) // male profile cannot be pink certified
	_, _ = f.s.DB.Exec(context.Background(), "UPDATE account_profiles SET gender='female' WHERE account_id=$1", d.id)
	code, _ = f.call(op, "POST", "/api/admin/drivers/"+d.id, checks)
	require(t, code, 200)
	code, _ = f.call(rider, "GET", "/api/admin/drivers", nil)
	require(t, code, 403)
	code, _ = f.call(op, "GET", "/api/admin/drivers", nil)
	require(t, code, 200)
}

func TestRouteAlternativesChangeTheQuote(t *testing.T) {
	f := setup(t)
	rider := f.actor("rider", false)
	body := map[string]any{"pickup": Point{13.08, 80.27, "Central"}, "dropoff": Point{13.04, 80.23, "Destination"}}
	code, out := f.call(rider, "POST", "/api/routes/alternatives", body)
	if code != 200 || len(out["routes"].([]any)) != 2 {
		t.Fatalf("alternatives = %d %v", code, out)
	}
	quote := func(index int) map[string]any {
		code, q := f.call(rider, "POST", "/api/quotes", map[string]any{"area_id": f.area, "vehicle_category": "bike", "pickup": body["pickup"], "dropoff": body["dropoff"], "route_index": index})
		if code != 201 {
			t.Fatalf("quote %d = %d %v", index, code, q)
		}
		return q
	}
	if quote(0)["meters"].(float64) != 5000 || quote(1)["meters"].(float64) != 4200 {
		t.Fatal("route_index should select the matching route distance")
	}
	if code, _ := f.call(rider, "POST", "/api/quotes", map[string]any{"area_id": f.area, "vehicle_category": "bike", "pickup": body["pickup"], "dropoff": body["dropoff"], "route_index": 5}); code != 400 {
		t.Fatalf("bad route_index = %d", code)
	}
}

func TestEarlyFinishAdjustsFareUnlessRiderApprovesFull(t *testing.T) {
	f := setup(t)
	fare := func(c client, id string) (float64, any) {
		_, state := f.call(c, "GET", "/api/state", nil)
		for _, item := range state["rides"].([]any) {
			if ride := item.(map[string]any); ride["id"] == id {
				return ride["fare_paise"].(float64), ride["adjusted_from_paise"]
			}
		}
		f.t.Fatal("ride not in state")
		return 0, nil
	}
	run := func(approve bool) (float64, any) {
		rider := f.actor("rider", false)
		driver := f.actor("rider", true)
		id := f.book(rider, f.quote(rider))
		require(t, f.act(driver, id, "accept", 1, ""), 200)
		require(t, f.act(driver, id, "arrive", 2, ""), 200)
		require(t, f.act(driver, id, "start", 3, f.s.pin(id)), 200)
		version := 4
		if approve {
			require(t, f.act(driver, id, "request_full_fare", 4, ""), 200)
			require(t, f.act(rider, id, "approve_full_fare", 5, ""), 200)
			version = 6
		}
		if !approve {
			require(t, f.act(driver, id, "complete", version, ""), 409)
		}
		status, _ := f.call(driver, "POST", "/api/rides/"+id+"/actions", map[string]any{"action": "complete", "version": version, "confirm": true})
		require(t, status, 200)
		return fare(rider, id)
	}
	early, from := run(false)
	if early >= 5500 || from != float64(5500) {
		t.Fatalf("early finish should reduce the fare, got %v from %v", early, from)
	}
	full, from := run(true)
	if full != 5500 || from != nil {
		t.Fatalf("approved full fare should be kept, got %v from %v", full, from)
	}
}

// atDestination moves the driver to the ride's drop-off so completing is not treated as an early finish.
func (f *fixture) atDestination(driver client, rideID string) {
	f.t.Helper()
	_, e := f.s.DB.Exec(context.Background(), `UPDATE drivers SET lat=q.dropoff_lat,lng=q.dropoff_lng,location_at=now() FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.id=$1 AND drivers.user_id=$2`, rideID, driver.id)
	if e != nil {
		f.t.Fatal(e)
	}
}
