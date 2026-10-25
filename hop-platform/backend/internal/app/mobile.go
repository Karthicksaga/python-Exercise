package app

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type mobileGrant struct{ Account, Challenge, App string }

func mobileChallenge(verifier string) string {
	h := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(h[:])
}
func validMobileApp(app string) bool { return app == "rider" || app == "captain" }
func (s *Server) mobileReturn(w http.ResponseWriter, r *http.Request, account string, entry loginState) {
	code := randomToken()
	body, _ := json.Marshal(mobileGrant{account, entry.MobileChallenge, entry.MobileApp})
	if s.Cache.Set(r.Context(), "mobile-login:"+digest(code), body, time.Minute).Err() != nil {
		fail(w, 503, "Sign-in temporarily unavailable")
		return
	}
	http.Redirect(w, r, "com.hop."+entry.MobileApp+"://auth/callback?code="+url.QueryEscape(code), http.StatusSeeOther)
}
func (s *Server) mobileExchange(w http.ResponseWriter, r *http.Request) {
	if !s.sameOrigin(w, r) || !s.limit(w, r, "mobile-login:"+s.peer(r), 30, 60) {
		return
	}
	var in struct {
		Code     string `json:"code"`
		Verifier string `json:"verifier"`
	}
	if !decode(w, r, &in) {
		return
	}
	if len(in.Code) != 43 || len(in.Verifier) < 43 || len(in.Verifier) > 128 {
		fail(w, 400, "Invalid sign-in grant")
		return
	}
	// A grant is consumed once, including failed attempts; it is not a reusable mobile token.
	raw, e := s.Cache.GetDel(r.Context(), "mobile-login:"+digest(in.Code)).Bytes()
	var grant mobileGrant
	if e != nil || json.Unmarshal(raw, &grant) != nil || !validMobileApp(grant.App) || grant.App != appIdentity(r) || !hmac.Equal([]byte(grant.Challenge), []byte(mobileChallenge(in.Verifier))) {
		fail(w, 401, "Sign-in grant expired or invalid")
		return
	}
	if old, e := r.Cookie(s.cookieName(r)); e == nil {
		s.Cache.Del(r.Context(), "session:"+digest(old.Value))
	}
	session := Session{UserID: grant.Account, CSRF: randomToken()}
	body, _ := json.Marshal(session)
	secret := randomToken()
	if s.Cache.Set(r.Context(), "session:"+digest(secret), body, 12*time.Hour).Err() != nil {
		fail(w, 503, "Could not create session")
		return
	}
	s.cookie(w, s.cookieName(r), secret, 43200)
	write(w, 200, map[string]any{"ok": true, "csrf": session.CSRF})
}
func validMobileChallenge(value string) bool {
	b, e := base64.RawURLEncoding.DecodeString(value)
	return e == nil && len(b) == 32 && !strings.Contains(value, "=")
}
