package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"time"

	"github.com/redis/go-redis/v9"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/jwt"
)

func (s *Server) configureNativePush(ctx context.Context) error {
	if s.Config.FCMServiceAccountFile == "" {
		return nil
	}
	raw, e := os.ReadFile(s.Config.FCMServiceAccountFile)
	if e != nil {
		return fmt.Errorf("read Firebase service account: %w", e)
	}
	var key struct {
		Project string `json:"project_id"`
		Email   string `json:"client_email"`
		Key     string `json:"private_key"`
		ID      string `json:"private_key_id"`
	}
	if json.Unmarshal(raw, &key) != nil || !regexp.MustCompile(`^[a-z][a-z0-9-]{4,62}$`).MatchString(key.Project) || key.Email == "" || key.Key == "" {
		return fmt.Errorf("invalid Firebase service account")
	}
	config := jwt.Config{Email: key.Email, PrivateKey: []byte(key.Key), PrivateKeyID: key.ID, Scopes: []string{"https://www.googleapis.com/auth/firebase.messaging"}, TokenURL: "https://oauth2.googleapis.com/token"}
	s.FCM = config.TokenSource(context.WithValue(ctx, oauth2.HTTPClient, s.HTTP))
	s.FCMProject = key.Project
	return nil
}
func (s *Server) androidPushSubscribe(w http.ResponseWriter, r *http.Request) {
	if s.FCM == nil {
		fail(w, 503, "Android push delivery is not configured")
		return
	}
	var in struct {
		Token string `json:"token"`
	}
	if !decode(w, r, &in) {
		return
	}
	app := appIdentity(r)
	if !validMobileApp(app) || len(in.Token) < 20 || len(in.Token) > 4096 {
		fail(w, 400, "Invalid Android push registration")
		return
	}
	_, e := s.DB.Exec(r.Context(), `INSERT INTO android_push_tokens(token,account_id,app) VALUES($1,$2,$3) ON CONFLICT(token) DO UPDATE SET account_id=excluded.account_id,app=excluded.app,updated_at=now()`, in.Token, user(r).Account.ID, app)
	if e != nil {
		dbError(w, e)
		return
	}
	session := user(r).Session
	session.NativePushToken = in.Token
	raw, _ := json.Marshal(session)
	cookie, _ := r.Cookie(s.cookieName(r))
	if s.Cache.SetArgs(r.Context(), "session:"+digest(cookie.Value), raw, redis.SetArgs{KeepTTL: true, Mode: "XX"}).Err() != nil {
		s.DB.Exec(r.Context(), "DELETE FROM android_push_tokens WHERE token=$1 AND account_id=$2", in.Token, user(r).Account.ID)
		fail(w, 503, "Could not register notification session")
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}
func (s *Server) androidPushUnsubscribe(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token string `json:"token"`
	}
	if !decode(w, r, &in) {
		return
	}
	_, e := s.DB.Exec(r.Context(), "DELETE FROM android_push_tokens WHERE token=$1 AND account_id=$2", in.Token, user(r).Account.ID)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}
func (s *Server) deliverNative(ctx context.Context, tx pushDB, account string, msg pushMessage) bool {
	if s.FCM == nil {
		return false
	}
	rows, e := tx.Query(ctx, "SELECT token FROM android_push_tokens WHERE account_id=$1", account)
	if e != nil {
		return true
	}
	var tokens []string
	for rows.Next() {
		var token string
		if rows.Scan(&token) == nil {
			tokens = append(tokens, token)
		}
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return true
	}
	if len(tokens) == 0 {
		return false
	}
	credential, e := s.FCM.Token()
	if e != nil {
		return true
	}
	retry := false
	for _, token := range tokens {
		raw, _ := json.Marshal(map[string]any{"message": map[string]any{"token": token, "notification": map[string]string{"title": msg.Title, "body": msg.Body}, "data": map[string]string{"tag": msg.Tag}, "android": map[string]any{"priority": "high", "notification": map[string]string{"channel_id": "hop-rides", "tag": msg.Tag}}}})
		req, e := http.NewRequestWithContext(ctx, "POST", "https://fcm.googleapis.com/v1/projects/"+s.FCMProject+"/messages:send", bytes.NewReader(raw))
		if e != nil {
			continue
		}
		req.Header.Set("Authorization", "Bearer "+credential.AccessToken)
		req.Header.Set("Content-Type", "application/json")
		client := &http.Client{Timeout: 8 * time.Second}
		res, e := client.Do(req)
		if e != nil {
			retry = true
			continue
		}
		body, _ := io.ReadAll(io.LimitReader(res.Body, 65536))
		res.Body.Close()
		if res.StatusCode == 404 && bytes.Contains(body, []byte("UNREGISTERED")) {
			tx.Exec(ctx, "DELETE FROM android_push_tokens WHERE token=$1", token)
		} else if res.StatusCode >= 500 || res.StatusCode == 429 || res.StatusCode == 401 || res.StatusCode == 403 {
			retry = true
		}
	}
	return retry
}
