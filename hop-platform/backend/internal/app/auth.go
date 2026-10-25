package app

import (
	"context"
	"crypto/hmac"
	"encoding/json"
	"net/http"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/redis/go-redis/v9"
	"golang.org/x/oauth2"
)

type loginState struct{ Verifier, Nonce, RedirectURL, MobileChallenge, MobileApp string }

// App gateways supply a fixed app identity; callback origins come only from configuration.
func appIdentity(r *http.Request) string {
	switch app := r.Header.Get("X-Hop-App"); app {
	case "rider", "captain", "admin":
		return app
	default:
		return ""
	}
}
func (s *Server) appOrigin(r *http.Request) string {
	var origin string
	switch appIdentity(r) {
	case "rider":
		origin = s.Config.RiderOrigin
	case "captain":
		origin = s.Config.CaptainOrigin
	case "admin":
		origin = s.Config.AdminOrigin
	}
	if origin == "" {
		return s.Config.PublicOrigin
	}
	return origin
}
func loginCookie(r *http.Request) string {
	if app := appIdentity(r); app != "" {
		return "hop_login_" + app
	}
	return "hop_login"
}
func (s *Server) cookieName(r *http.Request) string {
	suffix := ""
	if app := appIdentity(r); app != "" {
		suffix = "_" + app
	}
	if s.Config.Development {
		return "hop_session" + suffix
	}
	return "__Host-hop_session" + suffix
}
func (s *Server) cookie(w http.ResponseWriter, name, value string, age int) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: "/", HttpOnly: true, Secure: !s.Config.Development, SameSite: http.SameSiteLaxMode, MaxAge: age})
}
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	if !s.limit(w, r, "login:"+s.peer(r), 30, 60) {
		return
	}
	state := randomToken()
	oauth := s.OAuth
	oauth.RedirectURL = s.appOrigin(r) + "/auth/callback"
	entry := loginState{Verifier: oauth2.GenerateVerifier(), Nonce: randomToken(), RedirectURL: oauth.RedirectURL}
	if challenge := r.URL.Query().Get("mobile_challenge"); challenge != "" {
		app := r.URL.Query().Get("mobile_app")
		if !validMobileApp(app) || app != appIdentity(r) || !validMobileChallenge(challenge) {
			fail(w, 400, "Invalid Android sign-in request")
			return
		}
		entry.MobileChallenge, entry.MobileApp = challenge, app
	}
	b, _ := json.Marshal(entry)
	if s.Cache.Set(r.Context(), "login:"+digest(state), b, 5*time.Minute).Err() != nil {
		fail(w, 503, "Sign-in temporarily unavailable")
		return
	}
	s.cookie(w, loginCookie(r), state, 300)
	http.Redirect(w, r, oauth.AuthCodeURL(state, oauth2.S256ChallengeOption(entry.Verifier), oidc.Nonce(entry.Nonce), oauth2.SetAuthURLParam("prompt", "login")), http.StatusFound)
}
func (s *Server) callback(w http.ResponseWriter, r *http.Request) {
	state := r.URL.Query().Get("state")
	cookie, e := r.Cookie(loginCookie(r))
	if e != nil || len(state) < 32 || !hmac.Equal([]byte(cookie.Value), []byte(state)) {
		fail(w, 400, "Invalid sign-in state; start sign-in again")
		return
	}
	b, e := s.Cache.GetDel(r.Context(), "login:"+digest(state)).Bytes()
	if e != nil {
		fail(w, 400, "Sign-in expired; start again")
		return
	}
	s.cookie(w, loginCookie(r), "", -1)
	var entry loginState
	if json.Unmarshal(b, &entry) != nil {
		fail(w, 400, "Invalid sign-in state")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	ctx = oidc.ClientContext(ctx, s.HTTP)
	oauth := s.OAuth
	if entry.RedirectURL != "" {
		if entry.RedirectURL != s.appOrigin(r)+"/auth/callback" {
			fail(w, 400, "Sign-in belongs to another app")
			return
		}
		oauth.RedirectURL = entry.RedirectURL
	}
	token, e := oauth.Exchange(ctx, r.URL.Query().Get("code"), oauth2.VerifierOption(entry.Verifier))
	if e != nil {
		fail(w, 401, "Identity provider rejected sign-in")
		return
	}
	raw, ok := token.Extra("id_token").(string)
	if !ok {
		fail(w, 401, "Identity token missing")
		return
	}
	id, e := s.Verifier.Verify(ctx, raw)
	if e != nil || id.Nonce != entry.Nonce {
		fail(w, 401, "Identity verification failed")
		return
	}
	var claims struct {
		Email    string `json:"email"`
		Name     string `json:"name"`
		Verified bool   `json:"email_verified"`
	}
	if id.Claims(&claims) != nil || !claims.Verified || claims.Email == "" {
		fail(w, 403, "Verify your email with the identity provider before continuing")
		return
	}
	if len(claims.Name) > 160 || len(claims.Email) > 254 || len(id.Subject) > 500 {
		fail(w, 400, "Invalid identity profile")
		return
	}
	var account string
	e = s.DB.QueryRow(ctx, `INSERT INTO accounts(issuer,subject,email,name) VALUES($1,$2,$3,$4) ON CONFLICT(issuer,subject) DO UPDATE SET email=excluded.email,name=excluded.name RETURNING id`, s.Config.Issuer, id.Subject, claims.Email, claims.Name).Scan(&account)
	if e != nil {
		dbError(w, e)
		return
	}
	if entry.MobileChallenge != "" {
		s.mobileReturn(w, r, account, entry)
		return
	}
	// Invalidate the current local session before rotating it at sign-in.
	if old, e := r.Cookie(s.cookieName(r)); e == nil {
		s.Cache.Del(ctx, "session:"+digest(old.Value))
	}
	session := Session{UserID: account, CSRF: randomToken()}
	b, _ = json.Marshal(session)
	secret := randomToken()
	if s.Cache.Set(ctx, "session:"+digest(secret), b, 12*time.Hour).Err() != nil {
		fail(w, 503, "Could not create session")
		return
	}
	s.cookie(w, s.cookieName(r), secret, 43200)
	http.Redirect(w, r, "/", http.StatusSeeOther)
}
func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, e := r.Cookie(s.cookieName(r))
		if e != nil || len(cookie.Value) > 100 {
			fail(w, 401, "Sign in to continue")
			return
		}
		b, e := s.Cache.Get(r.Context(), "session:"+digest(cookie.Value)).Bytes()
		if e == redis.Nil {
			fail(w, 401, "Your session has expired")
			return
		}
		if e != nil {
			fail(w, 503, "Session service unavailable")
			return
		}
		var session Session
		if json.Unmarshal(b, &session) != nil {
			fail(w, 401, "Invalid session")
			return
		}
		var account Account
		e = s.DB.QueryRow(r.Context(), "SELECT id,name,email,role FROM accounts WHERE id=$1", session.UserID).Scan(&account.ID, &account.Name, &account.Email, &account.Role)
		if e != nil {
			dbError(w, e)
			return
		}
		if !s.limit(w, r, "account:"+account.ID, 240, 60) {
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" {
			if !s.originAllowed(r.Header.Get("Origin")) || !hmac.Equal([]byte(r.Header.Get("X-CSRF-Token")), []byte(session.CSRF)) {
				fail(w, 403, "Request origin or CSRF token is invalid")
				return
			}
			if !s.limit(w, r, "mutate:"+account.ID, 90, 60) {
				return
			}
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userKey, requestContext{Account: account, Session: session})))
	})
}
func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if token := user(r).Session.NativePushToken; token != "" {
		if _, e := s.DB.Exec(r.Context(), "DELETE FROM android_push_tokens WHERE token=$1 AND account_id=$2", token, user(r).Account.ID); e != nil {
			dbError(w, e)
			return
		}
	}

	cookie, _ := r.Cookie(s.cookieName(r))
	if s.Cache.Del(r.Context(), "session:"+digest(cookie.Value)).Err() != nil {
		fail(w, 503, "Could not sign out; retry")
		return
	}
	s.cookie(w, s.cookieName(r), "", -1)
	write(w, 200, map[string]bool{"ok": true})
}
