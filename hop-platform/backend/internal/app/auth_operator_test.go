package app

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/go-jose/go-jose/v4"
	"golang.org/x/oauth2"
)

func TestLoginPromptMatchesProvider(t *testing.T) {
	for issuer, want := range map[string]string{
		"https://accounts.google.com":         "select_account",
		"https://accounts.google.com/":        "select_account",
		"https://keycloak.example/realms/hop": "login",
		"https://hop.eu.auth0.com/":           "login",
	} {
		if got := loginPrompt(issuer); got != want {
			t.Errorf("loginPrompt(%q) = %q, want %q", issuer, got, want)
		}
	}
}

func TestOperatorEmailsConfig(t *testing.T) {
	base := map[string]string{"DATABASE_URL": "postgres://x", "REDIS_URL": "redis://x", "OIDC_ISSUER": "https://accounts.google.com", "OIDC_CLIENT_ID": "id", "SESSION_KEY": strings.Repeat("k", 32), "APP_ENV": "development"}
	for k, v := range base {
		t.Setenv(k, v)
	}
	t.Setenv("OPERATOR_EMAILS", " Ops@Example.com, second@example.com ,")
	c, e := ConfigFromEnv()
	if e != nil {
		t.Fatal(e)
	}
	if len(c.OperatorEmails) != 2 || c.OperatorEmails[0] != "ops@example.com" || c.OperatorEmails[1] != "second@example.com" {
		t.Fatalf("parsed %v", c.OperatorEmails)
	}
	t.Setenv("OPERATOR_EMAILS", "not-an-email")
	if _, e = ConfigFromEnv(); e == nil {
		t.Fatal("an invalid operator email must stop startup")
	}
}

// Signs in through a fake OIDC provider as the given email and returns the account's role.
func TestListedEmailsBecomeOperatorsOnSignIn(t *testing.T) {
	f := setup(t)
	key, e := rsa.GenerateKey(rand.Reader, 2048)
	if e != nil {
		t.Fatal(e)
	}
	signer, e := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, (&jose.SignerOptions{}).WithType("JWT").WithHeader("kid", "k1"))
	if e != nil {
		t.Fatal(e)
	}
	var issuer string
	idp := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/.well-known/openid-configuration":
			write(w, 200, map[string]any{"issuer": issuer, "authorization_endpoint": issuer + "/authorize", "token_endpoint": issuer + "/token", "jwks_uri": issuer + "/keys", "id_token_signing_alg_values_supported": []string{"RS256"}})
		case "/keys":
			write(w, 200, jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, KeyID: "k1", Algorithm: "RS256", Use: "sig"}}})
		case "/token":
			r.ParseForm()
			email := r.Form.Get("code") // the test passes the email as the code
			b, _ := json.Marshal(map[string]any{"iss": issuer, "sub": "sub-" + email, "aud": "client", "exp": time.Now().Add(time.Minute).Unix(), "iat": time.Now().Unix(), "nonce": "n", "email": email, "email_verified": true, "name": "Ops Person"})
			signed, _ := signer.Sign(b)
			raw, _ := signed.CompactSerialize()
			write(w, 200, map[string]any{"access_token": "x", "token_type": "Bearer", "expires_in": 60, "id_token": raw})
		default:
			fail(w, 404, "missing")
		}
	}))
	defer idp.Close()
	issuer = idp.URL
	provider, e := oidc.NewProvider(context.Background(), issuer)
	if e != nil {
		t.Fatal(e)
	}
	f.s.Config.Issuer = issuer
	f.s.Config.OperatorEmails = []string{"ops@example.com"}
	f.s.OAuth = oauth2.Config{ClientID: "client", Endpoint: provider.Endpoint(), RedirectURL: "https://hop.test/auth/callback", Scopes: []string{"openid", "email", "profile"}}
	f.s.Verifier = provider.Verifier(&oidc.Config{ClientID: "client"})
	noFollow := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}

	signIn := func(email string) string {
		t.Helper()
		state := randomToken()
		b, _ := json.Marshal(loginState{Verifier: oauth2.GenerateVerifier(), Nonce: "n"})
		f.s.Cache.Set(context.Background(), "login:"+digest(state), b, time.Minute)
		req, _ := http.NewRequest("GET", f.http.URL+"/auth/callback?state="+url.QueryEscape(state)+"&code="+url.QueryEscape(email), nil)
		req.AddCookie(&http.Cookie{Name: "hop_login", Value: state})
		res, e := noFollow.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		res.Body.Close()
		require(t, res.StatusCode, 303)
		var role string
		if e = f.s.DB.QueryRow(context.Background(), "SELECT role FROM accounts WHERE issuer=$1 AND subject=$2", issuer, "sub-"+email).Scan(&role); e != nil {
			t.Fatal(e)
		}
		return role
	}
	audits := func() int {
		var n int
		f.s.DB.QueryRow(context.Background(), "SELECT count(*) FROM audit_events WHERE action='operator_promoted_by_config'").Scan(&n)
		return n
	}

	// Listed (any letter case): becomes an operator, audited once.
	if role := signIn("Ops@Example.com"); role != "operator" {
		t.Fatalf("listed email should be operator, got %q", role)
	}
	if role := signIn("Ops@Example.com"); role != "operator" || audits() != 1 {
		t.Fatalf("signing in again keeps the role without a second audit entry: role=%q audits=%d", role, audits())
	}
	// Not listed: stays an ordinary account.
	if role := signIn("someone@example.com"); role == "operator" {
		t.Fatal("unlisted email must not become an operator")
	}

	// Google gets prompt=select_account on the way out.
	f.s.Config.Issuer = "https://accounts.google.com"
	res, e := noFollow.Get(f.http.URL + "/auth/login")
	if e != nil {
		t.Fatal(e)
	}
	res.Body.Close()
	location, _ := url.Parse(res.Header.Get("Location"))
	if location == nil || location.Query().Get("prompt") != "select_account" {
		t.Fatalf("Google sign-in should ask prompt=select_account, got %q", res.Header.Get("Location"))
	}
}
