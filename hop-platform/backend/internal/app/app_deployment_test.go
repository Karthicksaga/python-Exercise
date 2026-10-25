package app

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"golang.org/x/oauth2"
)

func TestAppOriginsAndCookieIsolation(t *testing.T) {
	s := &Server{Config: Config{Development: true, PublicOrigin: "http://localhost:8080", RiderOrigin: "http://localhost:5173", CaptainOrigin: "http://localhost:5174", AdminOrigin: "http://localhost:5175"}}
	seen := map[string]bool{}
	for app, origin := range map[string]string{"rider": s.Config.RiderOrigin, "captain": s.Config.CaptainOrigin, "admin": s.Config.AdminOrigin} {
		r := httptest.NewRequest("GET", "/auth/login", nil)
		r.Header.Set("X-Hop-App", app)
		if got := s.appOrigin(r); got != origin {
			t.Fatalf("%s origin: %s", app, got)
		}
		name := s.cookieName(r)
		if seen[name] {
			t.Fatal("app session cookies must be isolated")
		}
		seen[name] = true
		if loginCookie(r) != "hop_login_"+app {
			t.Fatal("login cookie must be app-specific")
		}
		if !s.originAllowed(origin) {
			t.Fatal("configured app origin rejected")
		}
	}
	r := httptest.NewRequest("GET", "/auth/login", nil)
	r.Header.Set("X-Hop-App", "https://evil.example")
	if s.appOrigin(r) != s.Config.PublicOrigin {
		t.Fatal("unrecognised app must not control redirect")
	}
}

func TestAppLoginUsesFrontendCallback(t *testing.T) {
	f := setup(t)
	f.s.Config.RiderOrigin = "http://localhost:5173"
	f.s.OAuth = oauth2.Config{ClientID: "hop-web", Endpoint: oauth2.Endpoint{AuthURL: "https://identity.test/authorize"}}
	req := httptest.NewRequest("GET", "/auth/login", nil)
	req.Header.Set("X-Hop-App", "rider")
	out := httptest.NewRecorder()
	f.s.login(out, req)
	if out.Code != 302 {
		t.Fatalf("login status %d", out.Code)
	}
	location, err := url.Parse(out.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	if location.Query().Get("redirect_uri") != "http://localhost:5173/auth/callback" {
		t.Fatal("login redirected to common backend")
	}
	if out.Result().Cookies()[0].Name != "hop_login_rider" {
		t.Fatal("login did not isolate rider state")
	}
}

func TestAppSessionsDoNotConflict(t *testing.T) {
	f := setup(t)
	actor := f.actor("rider", false)
	for _, app := range []string{"rider", "captain", "admin"} {
		req := httptest.NewRequest("GET", "/api/me", nil)
		req.Header.Set("X-Hop-App", app)
		req.AddCookie(&http.Cookie{Name: "hop_session_rider", Value: actor.secret})
		out := httptest.NewRecorder()
		f.s.Handler().ServeHTTP(out, req)
		want := 401
		if app == "rider" {
			want = 200
		}
		if out.Code != want {
			t.Fatalf("%s got %d, want %d", app, out.Code, want)
		}
	}
}
