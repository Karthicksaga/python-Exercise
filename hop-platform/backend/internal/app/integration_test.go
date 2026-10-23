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
	migration, e := os.ReadFile("../../migrations/001_initial.sql")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(ctx, string(migration)); e != nil {
		t.Fatal(e)
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
		write(w, 200, map[string]any{"code": "Ok", "routes": []map[string]any{{"distance": 5000, "duration": 900}}})
	}))
	s := &Server{Config: Config{PublicOrigin: "https://hop.test", SessionKey: strings.Repeat("test-key", 8), RoutingURL: router.URL, Development: true}, DB: db, Cache: cache, HTTP: &http.Client{Timeout: time.Second}}
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
	req.AddCookie(&http.Cookie{Name: "hop_session", Value: c.secret})
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
	f.t.Helper()
	code, out := f.call(c, "POST", "/api/quotes", map[string]any{"area_id": f.area, "pickup": Point{13.08, 80.27, "Central"}, "dropoff": Point{13.04, 80.23, "Destination"}})
	if code != 201 {
		f.t.Fatalf("quote %d %#v", code, out)
	}
	if out["fare_paise"] != float64(5500) {
		f.t.Fatalf("wrong price %#v", out)
	}
	return out["id"].(string)
}
func (f *fixture) book(c client, q string) string {
	f.t.Helper()
	code, out := f.call(c, "POST", "/api/rides", map[string]any{"quote_id": q, "request_key": "11111111-1111-4111-8111-" + strings.ReplaceAll(c.id, "-", "")[:12], "payment_method": "cash"})
	if code != 201 {
		f.t.Fatalf("book %d %#v", code, out)
	}
	return out["id"].(string)
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
	require(t, f.act(r, id, "accept", 1, ""), 409)
	require(t, f.act(stranger, id, "cancel", 1, ""), 403)
	require(t, f.act(d, id, "accept", 1, ""), 200)
	require(t, f.act(d, id, "complete", 2, ""), 409)
	_, state := f.call(d, "GET", "/api/state", nil)
	ride := state["rides"].([]any)[0].(map[string]any)
	if _, ok := ride["pickup_code"]; ok {
		t.Fatal("driver can see pickup code")
	}
	require(t, f.act(d, id, "arrive", 2, ""), 200)
	require(t, f.act(d, id, "start", 3, "wrong"), 400)
	require(t, f.act(d, id, "start", 3, f.s.pin(id)), 200)
	require(t, f.act(r, id, "cancel", 4, ""), 409)
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
	code, _ := f.call(d, "POST", "/api/drivers/apply", map[string]string{"area_id": f.area, "vehicle_number": "TEST12345", "upi_id": "driver@bank", "license_reference": "verified-license-reference", "insurance_reference": "verified-insurance-reference", "license_expires": time.Now().Add(24 * time.Hour).Format("2006-01-02"), "insurance_expires": time.Now().Add(24 * time.Hour).Format("2006-01-02")})
	require(t, code, 201)
	code, _ = f.call(d, "POST", "/api/operator/drivers/"+d.id, map[string]string{"status": "approved", "note": "Approve myself improperly"})
	require(t, code, 403)
	code, _ = f.call(op, "POST", "/api/operator/drivers/"+d.id, map[string]string{"status": "approved", "note": "Reviewed evidence in verification record TEST-001"})
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
