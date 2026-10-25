package app

import (
	"encoding/json"
	"golang.org/x/oauth2"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestMobileGrantIsBoundAndSingleUse(t *testing.T) {
	f := setup(t)
	a := f.actor("rider", false)
	verifier := strings.Repeat("v", 43)
	grant := func(app string) string {
		code := randomToken()
		body, _ := json.Marshal(mobileGrant{a.id, mobileChallenge(verifier), app})
		if e := f.s.Cache.Set(t.Context(), "mobile-login:"+digest(code), body, time.Minute).Err(); e != nil {
			t.Fatal(e)
		}
		return code
	}
	exchange := func(code, proof, app string) *httptest.ResponseRecorder {
		b, _ := json.Marshal(map[string]string{"code": code, "verifier": proof})
		req := httptest.NewRequest("POST", "/auth/mobile/exchange", strings.NewReader(string(b)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", "https://hop.test")
		req.Header.Set("X-Hop-App", app)
		out := httptest.NewRecorder()
		f.s.Handler().ServeHTTP(out, req)
		return out
	}
	code := grant("rider")
	ok := exchange(code, verifier, "rider")
	if ok.Code != 200 {
		t.Fatalf("exchange: %d %s", ok.Code, ok.Body.String())
	}
	if len(ok.Result().Cookies()) != 1 || ok.Result().Cookies()[0].Name != "hop_session_rider" || !ok.Result().Cookies()[0].HttpOnly {
		t.Fatal("missing native app HttpOnly session")
	}
	if strings.Contains(ok.Body.String(), ok.Result().Cookies()[0].Value) {
		t.Fatal("session secret exposed to JavaScript")
	}
	if exchange(code, verifier, "rider").Code != 401 {
		t.Fatal("grant replay accepted")
	}
	code = grant("rider")
	if exchange(code, strings.Repeat("w", 43), "rider").Code != 401 {
		t.Fatal("wrong verifier accepted")
	}
	if exchange(code, verifier, "rider").Code != 401 {
		t.Fatal("failed grant was not consumed")
	}
	if exchange(grant("rider"), verifier, "captain").Code != 401 {
		t.Fatal("cross-app exchange accepted")
	}
}
func TestMobileLoginRejectsUntrustedReturnApps(t *testing.T) {
	f := setup(t)
	f.s.Config.RiderOrigin = "https://rider.hop.test"
	f.s.OAuth = oauth2.Config{ClientID: "hop-web", Endpoint: oauth2.Endpoint{AuthURL: "https://idp.test/auth"}}
	for _, app := range []string{"evil", "admin", "captain"} {
		req := httptest.NewRequest("GET", "/auth/login?mobile_app="+app+"&mobile_challenge="+mobileChallenge(strings.Repeat("x", 43)), nil)
		req.Header.Set("X-Hop-App", "rider")
		out := httptest.NewRecorder()
		f.s.login(out, req)
		if out.Code != 400 {
			t.Fatalf("%s accepted", app)
		}
	}
}
func TestAndroidPushRegistrationNeedsConfigurationAndOwnership(t *testing.T) {
	f := setup(t)
	a := f.actor("rider", false)
	b := f.actor("rider", false)
	f.s.FCM = oauth2.StaticTokenSource(&oauth2.Token{AccessToken: "test-only"})
	post := func(actor client, path string, body string) int {
		req := httptest.NewRequest("POST", path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", "https://hop.test")
		req.Header.Set("X-Hop-App", "rider")
		req.Header.Set("X-CSRF-Token", actor.csrf)
		req.AddCookie(&http.Cookie{Name: "hop_session_rider", Value: actor.secret})
		out := httptest.NewRecorder()
		f.s.Handler().ServeHTTP(out, req)
		return out.Code
	}
	token := strings.Repeat("t", 32)
	body := `{"token":"` + token + `"}`
	if post(a, "/api/android/push/subscribe", body) != 200 {
		t.Fatal("registration failed")
	}
	if _, e := f.s.DB.Exec(t.Context(), `INSERT INTO notifications(account_id,kind,title,body) VALUES($1,'test','Android test','Body')`, a.id); e != nil {
		t.Fatal(e)
	}
	var jobs int
	f.s.DB.QueryRow(t.Context(), "SELECT count(*) FROM push_outbox WHERE account_id=$1", a.id).Scan(&jobs)
	if jobs != 1 {
		t.Fatal("native-only subscription did not enqueue notification")
	}
	if post(b, "/api/android/push/unsubscribe", body) != 200 {
		t.Fatal("unsubscribe failed")
	}
	var n int
	f.s.DB.QueryRow(t.Context(), "SELECT count(*) FROM android_push_tokens").Scan(&n)
	if n != 1 {
		t.Fatal("another account removed token")
	}
	if post(a, "/api/android/push/unsubscribe", body) != 200 {
		t.Fatal("owner unsubscribe failed")
	}
}
