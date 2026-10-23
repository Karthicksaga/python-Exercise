package app

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/go-jose/go-jose/v4"
	"golang.org/x/oauth2"
)

func TestOIDCStateNonceVerificationAndSessionRotation(t *testing.T) {
	f := setup(t)
	key, e := rsa.GenerateKey(rand.Reader, 2048)
	if e != nil {
		t.Fatal(e)
	}
	signer, e := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, (&jose.SignerOptions{}).WithType("JWT").WithHeader("kid", "test-key"))
	if e != nil {
		t.Fatal(e)
	}
	var issuer string
	idp := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/.well-known/openid-configuration":
			write(w, 200, map[string]any{"issuer": issuer, "authorization_endpoint": issuer + "/authorize", "token_endpoint": issuer + "/token", "jwks_uri": issuer + "/keys", "id_token_signing_alg_values_supported": []string{"RS256"}})
		case "/keys":
			write(w, 200, jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, KeyID: "test-key", Algorithm: "RS256", Use: "sig"}}})
		case "/token":
			if e := r.ParseForm(); e != nil {
				t.Error(e)
			}
			if r.Form.Get("code_verifier") == "" {
				t.Error("PKCE verifier missing")
			}
			code := r.Form.Get("code")
			nonce := "correct-nonce"
			if code == "wrong-nonce" {
				nonce = "attacker-nonce"
			}
			claims := map[string]any{"iss": issuer, "sub": "identity-001", "aud": "hop-web", "exp": time.Now().Add(time.Minute).Unix(), "iat": time.Now().Unix(), "nonce": nonce, "email": "verified@example.invalid", "email_verified": code != "unverified", "name": "Verified User"}
			if code == "expired" {
				claims["exp"] = time.Now().Add(-time.Hour).Unix()
			}
			if code == "wrong-audience" {
				claims["aud"] = "other-client"
			}
			b, _ := json.Marshal(claims)
			signed, _ := signer.Sign(b)
			raw, _ := signed.CompactSerialize()
			write(w, 200, map[string]any{"access_token": "not-stored", "token_type": "Bearer", "expires_in": 60, "id_token": raw})
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
	f.s.OAuth = oauth2.Config{ClientID: "hop-web", Endpoint: provider.Endpoint(), RedirectURL: "https://hop.test/auth/callback", Scopes: []string{"openid", "email", "profile"}}
	f.s.Verifier = provider.Verifier(&oidc.Config{ClientID: "hop-web"})
	httpClient := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	for _, code := range []string{"unverified", "wrong-nonce", "expired", "wrong-audience", "valid"} {
		t.Run(code, func(t *testing.T) {
			state := randomToken()
			b, _ := json.Marshal(loginState{Verifier: oauth2.GenerateVerifier(), Nonce: "correct-nonce"})
			f.s.Cache.Set(context.Background(), "login:"+digest(state), b, time.Minute)
			req, _ := http.NewRequest("GET", f.http.URL+"/auth/callback?state="+url.QueryEscape(state)+"&code="+code, nil)
			req.AddCookie(&http.Cookie{Name: "hop_login", Value: state})
			res, e := httpClient.Do(req)
			if e != nil {
				t.Fatal(e)
			}
			res.Body.Close()
			expected := 401
			if code == "unverified" {
				expected = 403
			}
			if code == "valid" {
				expected = 303
			}
			require(t, res.StatusCode, expected)
			if code == "valid" {
				var sessionCookie *http.Cookie
				for _, c := range res.Cookies() {
					if c.Name == "hop_session" {
						sessionCookie = c
					}
				}
				if sessionCookie == nil || !sessionCookie.HttpOnly {
					t.Fatal("session cookie missing HttpOnly")
				}
				if f.s.Cache.Exists(context.Background(), "session:"+digest(sessionCookie.Value)).Val() != 1 {
					t.Fatal("session missing")
				}
			}
			replay, e := httpClient.Do(req)
			if e != nil {
				t.Fatal(e)
			}
			replay.Body.Close()
			require(t, replay.StatusCode, 400)
		})
	}
	// An unmatched login cookie is rejected before any token exchange.
	response, e := httpClient.Get(f.http.URL + "/auth/callback?state=attacker-state&code=valid")
	if e != nil {
		t.Fatal(e)
	}
	response.Body.Close()
	require(t, response.StatusCode, 400)
}
