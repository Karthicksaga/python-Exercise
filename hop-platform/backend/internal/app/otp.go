package app

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func (s *Server) otpHash(phone, code string) string {
	h := hmac.New(sha256.New, []byte(s.Config.SessionKey))
	h.Write([]byte("otp:" + phone + ":" + code))
	return hex.EncodeToString(h.Sum(nil))
}

// sendSMS posts to a provider-neutral webhook: {"to":"+91…","message":"…"} with a bearer token.
func (s *Server) smsConfigured() bool {
	return s.Config.SMSWebhookURL != "" || (s.Config.MSG91AuthKey != "" && s.Config.MSG91TemplateID != "")
}

func (s *Server) devSMS() bool {
	return s.Config.Development || s.Config.DevSMS
}

// sendOTPSMS delivers the code through MSG91 (DLT template with an ##otp## variable) or the generic webhook.
func (s *Server) sendOTPSMS(ctx context.Context, phone, code string) error {
	if s.Config.MSG91AuthKey == "" || s.Config.MSG91TemplateID == "" {
		return s.sendSMS(ctx, phone, code+" is your hop sign-in code. It expires in 10 minutes. Do not share it.")
	}
	body, _ := json.Marshal(map[string]any{
		"template_id": s.Config.MSG91TemplateID,
		"recipients":  []map[string]string{{"mobiles": "91" + phone, "otp": code}},
	})
	req, e := http.NewRequestWithContext(ctx, "POST", "https://control.msg91.com/api/v5/flow", bytes.NewReader(body))
	if e != nil {
		return e
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("authkey", s.Config.MSG91AuthKey)
	res, e := s.HTTP.Do(req)
	if e != nil {
		return e
	}
	defer res.Body.Close()
	var out struct {
		Type string `json:"type"`
	}
	json.NewDecoder(http.MaxBytesReader(nil, res.Body, 1<<16)).Decode(&out)
	if res.StatusCode/100 != 2 || out.Type == "error" {
		return fmt.Errorf("msg91 status %d", res.StatusCode)
	}
	return nil
}

func (s *Server) sendSMS(ctx context.Context, phone, message string) error {
	body, _ := json.Marshal(map[string]string{"to": "+91" + phone, "message": message})
	req, e := http.NewRequestWithContext(ctx, "POST", s.Config.SMSWebhookURL, bytes.NewReader(body))
	if e != nil {
		return e
	}
	req.Header.Set("Content-Type", "application/json")
	if s.Config.SMSWebhookToken != "" {
		req.Header.Set("Authorization", "Bearer "+s.Config.SMSWebhookToken)
	}
	res, e := s.HTTP.Do(req)
	if e != nil {
		return e
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		return fmt.Errorf("sms provider status %d", res.StatusCode)
	}
	return nil
}

// originAllowed accepts the public origin, any origin listed in ALLOWED_ORIGINS (comma separated, for the
// separate rider/captain/admin hosts) and, in development only, localhost on any port.
func (s *Server) originAllowed(origin string) bool {
	if origin == "" {
		return false
	}
	if origin == s.Config.PublicOrigin || (origin != "" && (origin == s.Config.RiderOrigin || origin == s.Config.CaptainOrigin || origin == s.Config.AdminOrigin)) {
		return true
	}
	for _, o := range strings.Split(s.Config.AllowedOrigins, ",") {
		if strings.TrimSpace(o) == origin {
			return true
		}
	}
	u, e := url.Parse(origin)
	if e == nil && u.Scheme == "https" && strings.HasSuffix(u.Hostname(), ".run.app") {
		if strings.HasPrefix(u.Hostname(), "hop-") {
			return true
		}
	}
	if s.Config.Development {
		return e == nil && u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1")
	}
	return false
}

func (s *Server) sameOrigin(w http.ResponseWriter, r *http.Request) bool {
	if !s.originAllowed(r.Header.Get("Origin")) {
		fail(w, 403, "Cross-origin request blocked")
		return false
	}
	return true
}

func (s *Server) otpRequest(w http.ResponseWriter, r *http.Request) {
	if !s.sameOrigin(w, r) {
		return
	}
	var in struct {
		Phone string `json:"phone"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !validPhone(in.Phone) {
		fail(w, 400, "Enter a valid 10-digit mobile number")
		return
	}
	if !s.smsConfigured() && !s.devSMS() {
		fail(w, 503, "SMS sign-in is not configured")
		return
	}
	if !s.limit(w, r, "otp-ip:"+s.peer(r), 20, 3600) || !s.limit(w, r, "otp-phone:"+in.Phone, 5, 600) {
		return
	}
	ctx := r.Context()
	n, e := rand.Int(rand.Reader, big.NewInt(1000000))
	if e != nil {
		fail(w, 500, "Could not generate a code")
		return
	}
	code := fmt.Sprintf("%06d", n.Int64())
	tag, e := s.DB.Exec(ctx, `INSERT INTO phone_otps(phone,code_hash,expires_at) VALUES($1,$2,now()+interval '10 minutes')
 ON CONFLICT(phone) DO UPDATE SET code_hash=excluded.code_hash,attempts=0,expires_at=excluded.expires_at,created_at=now()
 WHERE phone_otps.created_at<now()-interval '30 seconds'`, in.Phone, s.otpHash(in.Phone, code))
	if e != nil {
		dbError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 429, "Wait 30 seconds before requesting another code")
		return
	}
	out := map[string]any{"ok": true, "expires_in": 600}
	if s.smsConfigured() {
		if e = s.sendOTPSMS(ctx, in.Phone, code); e != nil {
			s.DB.Exec(ctx, "DELETE FROM phone_otps WHERE phone=$1", in.Phone)
			fail(w, 502, "Could not send the SMS; try again later")
			return
		}
	} else {
		out["dev_code"] = code
	}
	write(w, 200, out)
}

func (s *Server) otpVerify(w http.ResponseWriter, r *http.Request) {
	if !s.sameOrigin(w, r) {
		return
	}
	var in struct {
		Phone string `json:"phone"`
		Code  string `json:"code"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !validPhone(in.Phone) || len(in.Code) != 6 {
		fail(w, 400, "Enter your mobile number and the 6-digit code")
		return
	}
	if !s.limit(w, r, "otpv-ip:"+s.peer(r), 60, 3600) {
		return
	}
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var hash string
	var attempts int
	var expired bool
	e = tx.QueryRow(ctx, "SELECT code_hash,attempts,expires_at<now() FROM phone_otps WHERE phone=$1 FOR UPDATE", in.Phone).Scan(&hash, &attempts, &expired)
	if errors.Is(e, pgx.ErrNoRows) || (e == nil && (expired || attempts >= 5)) {
		tx.Exec(ctx, "DELETE FROM phone_otps WHERE phone=$1", in.Phone)
		tx.Commit(ctx)
		fail(w, 400, "That code has expired; request a new one")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	if !hmac.Equal([]byte(hash), []byte(s.otpHash(in.Phone, in.Code))) {
		tx.Exec(ctx, "UPDATE phone_otps SET attempts=attempts+1 WHERE phone=$1", in.Phone)
		tx.Commit(ctx)
		fail(w, 400, "Incorrect code")
		return
	}
	defaultName := "Rider " + in.Phone[6:]
	if strings.Contains(strings.ToLower(r.Header.Get("Origin")), "captain") || strings.Contains(strings.ToLower(r.Header.Get("Referer")), "captain") {
		defaultName = "Captain " + in.Phone[6:]
	}
	var account string
	e = tx.QueryRow(ctx, `INSERT INTO accounts(issuer,subject,email,name) VALUES('phone',$1,$2,$3)
 ON CONFLICT(issuer,subject) DO UPDATE SET issuer=accounts.issuer RETURNING id`, in.Phone, in.Phone+"@phone.invalid", defaultName).Scan(&account)
	if e == nil {
		_, e = tx.Exec(ctx, `INSERT INTO verified_phones(account_id,phone) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET phone=$2,verified_at=now()`, account, in.Phone)
	}
	if e == nil {
		_, e = tx.Exec(ctx, `INSERT INTO account_profiles(account_id,phone) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET phone=$2,updated_at=now()`, account, in.Phone)
	}
	if e == nil {
		_, e = tx.Exec(ctx, "DELETE FROM phone_otps WHERE phone=$1", in.Phone)
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	if old, e := r.Cookie(s.cookieName(r)); e == nil {
		s.Cache.Del(ctx, "session:"+digest(old.Value))
	}
	session := Session{UserID: account, CSRF: randomToken()}
	b, _ := json.Marshal(session)
	secret := randomToken()
	if s.Cache.Set(ctx, "session:"+digest(secret), b, 12*time.Hour).Err() != nil {
		fail(w, 503, "Could not create session")
		return
	}
	s.cookie(w, s.cookieName(r), secret, 43200)
	write(w, 200, map[string]any{"ok": true, "csrf": session.CSRF})
}
