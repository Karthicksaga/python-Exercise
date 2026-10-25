package app

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// pushHosts are the push services browsers use. Subscription endpoints are user supplied and the server
// connects to them, so anything else is refused (SSRF guard).
var pushHosts = []string{"fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com", "push.microsoft.com"}

func pushEndpointAllowed(raw string) bool {
	u, e := url.Parse(raw)
	if e != nil || u.Scheme != "https" || u.User != nil || (u.Port() != "" && u.Port() != "443") {
		return false
	}
	h := strings.ToLower(u.Hostname())
	for _, allowed := range pushHosts {
		if h == allowed || strings.HasSuffix(h, "."+allowed) {
			return true
		}
	}
	return false
}

func (s *Server) pushEnabled() bool {
	return s.Config.VAPIDPublic != "" && s.Config.VAPIDPrivate != ""
}

func (s *Server) pushKey(w http.ResponseWriter, r *http.Request) {
	if !s.pushEnabled() {
		fail(w, 503, "Push notifications are not configured")
		return
	}
	write(w, 200, map[string]string{"key": s.Config.VAPIDPublic})
}

func (s *Server) pushSubscribe(w http.ResponseWriter, r *http.Request) {
	if !s.pushEnabled() {
		fail(w, 503, "Push notifications are not configured")
		return
	}
	var in struct {
		Endpoint string `json:"endpoint"`
		Keys     struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
	}
	if !decode(w, r, &in) {
		return
	}
	uid := user(r).Account.ID
	if !pushEndpointAllowed(in.Endpoint) || len(in.Keys.P256dh) < 20 || len(in.Keys.Auth) < 8 {
		fail(w, 400, "Unsupported push subscription")
		return
	}
	if !s.limit(w, r, "push:"+uid, 30, 3600) {
		return
	}
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, `INSERT INTO push_subscriptions(account_id,endpoint,p256dh,auth) VALUES($1,$2,$3,$4)
 ON CONFLICT (endpoint) DO UPDATE SET account_id=EXCLUDED.account_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth`, uid, in.Endpoint, in.Keys.P256dh, in.Keys.Auth); e != nil {
		dbError(w, e)
		return
	}
	// A person keeps at most 10 devices; the oldest are dropped.
	if _, e = tx.Exec(ctx, `DELETE FROM push_subscriptions WHERE account_id=$1 AND id NOT IN
 (SELECT id FROM push_subscriptions WHERE account_id=$1 ORDER BY created_at DESC LIMIT 10)`, uid); e != nil {
		dbError(w, e)
		return
	}
	if e = tx.Commit(ctx); e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]bool{"subscribed": true})
}

func (s *Server) pushUnsubscribe(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Endpoint string `json:"endpoint"`
	}
	if !decode(w, r, &in) {
		return
	}
	if _, e := s.DB.Exec(r.Context(), "DELETE FROM push_subscriptions WHERE account_id=$1 AND endpoint=$2", user(r).Account.ID, in.Endpoint); e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"subscribed": false})
}

type pushJob struct {
	id           int64
	account      string
	kind, ref    string
	status, role string
	attempts     int
}

type pushMessage struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	Tag   string `json:"tag"`
	URL   string `json:"url"`
}

// pushDB is the query surface shared by the pool and transactions.
type pushDB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

const pushMaxAttempts = 5

// RunPush drains the push outbox until the context ends. It does nothing without VAPID keys.
func (s *Server) RunPush(ctx context.Context) {
	if !s.pushEnabled() {
		return
	}
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if e := s.pushBatch(ctx); e != nil && ctx.Err() == nil {
				slog.Error("push delivery failed", "error", e)
			}
		}
	}
}

// pushBatch claims due rows with a short lease, sends outside any transaction, then settles each row on its
// own, so a slow push service or a failure part-way never replays notifications that were already sent.
func (s *Server) pushBatch(ctx context.Context) error {
	rows, e := s.DB.Query(ctx, `UPDATE push_outbox SET lease_until=now()+interval '30 seconds', attempts=attempts+1 WHERE id IN (
 SELECT id FROM push_outbox WHERE lease_until IS NULL OR lease_until<now() ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED)
 RETURNING id,account_id::text,kind,ref,status,role,attempts`)
	if e != nil {
		return e
	}
	var jobs []pushJob
	for rows.Next() {
		var j pushJob
		if e = rows.Scan(&j.id, &j.account, &j.kind, &j.ref, &j.status, &j.role, &j.attempts); e != nil {
			rows.Close()
			return e
		}
		jobs = append(jobs, j)
	}
	rows.Close()
	if e = rows.Err(); e != nil {
		return e
	}
	work := make(chan pushJob)
	var wg sync.WaitGroup
	for w := 0; w < 8 && w < len(jobs); w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range work {
				s.pushOne(ctx, j)
			}
		}()
	}
	for _, j := range jobs {
		work <- j
	}
	close(work)
	wg.Wait()
	return nil
}

func (s *Server) pushOne(ctx context.Context, j pushJob) {
	jobCtx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	retry := false
	if msg, ok := s.composePush(jobCtx, s.DB, j); ok {
		retry = s.deliver(jobCtx, s.DB, j.account, msg)
	}
	var e error
	if retry && j.attempts < pushMaxAttempts {
		// Back off by leaving the lease in place; the row becomes due again when it expires.
		_, e = s.DB.Exec(ctx, "UPDATE push_outbox SET lease_until=now()+interval '5 seconds' * $2 WHERE id=$1", j.id, j.attempts)
	} else {
		_, e = s.DB.Exec(ctx, "DELETE FROM push_outbox WHERE id=$1", j.id)
	}
	if e != nil && ctx.Err() == nil {
		slog.Error("push outbox update failed", "error", e)
	}
}

// composePush turns an outbox row into text, dropping offers that are no longer open.
func (s *Server) composePush(ctx context.Context, tx pushDB, j pushJob) (pushMessage, bool) {
	switch j.kind {
	case "offer":
		var from, to string
		var fare int64
		e := tx.QueryRow(ctx, `SELECT q.pickup_label,q.dropoff_label,COALESCE(r.offered_fare_paise,q.fare_paise) FROM rides r JOIN quotes q ON q.id=r.quote_id
 WHERE r.id=$1 AND r.status='requested' AND r.expires_at>now()`, j.ref).Scan(&from, &to, &fare)
		if e != nil {
			return pushMessage{}, false
		}
		return pushMessage{Title: "New ride request", Body: fmt.Sprintf("%s → %s · ₹%d", from, to, fare/100), Tag: "offer-" + j.ref, URL: "/"}, true
	case "ride":
		title, body := rideMessage(j.status, j.role == "rider")
		if title == "" {
			return pushMessage{}, false
		}
		return pushMessage{Title: title, Body: body, Tag: "ride-" + j.ref, URL: "/"}, true
	case "notification":
		var title, body string
		if tx.QueryRow(ctx, "SELECT title,body FROM notifications WHERE id=$1::uuid", j.ref).Scan(&title, &body) != nil {
			return pushMessage{}, false
		}
		return pushMessage{Title: title, Body: body, Tag: "note-" + j.ref, URL: "/"}, true
	}
	return pushMessage{}, false
}

// deliver sends to every device of an account. It returns true when a transient failure should be retried.
func (s *Server) deliver(ctx context.Context, tx pushDB, account string, msg pushMessage) (retry bool) {
	rows, e := tx.Query(ctx, "SELECT id::text,endpoint,p256dh,auth FROM push_subscriptions WHERE account_id=$1", account)
	if e != nil {
		return true
	}
	type sub struct{ id, endpoint, p256dh, auth string }
	var subs []sub
	for rows.Next() {
		var x sub
		if rows.Scan(&x.id, &x.endpoint, &x.p256dh, &x.auth) == nil {
			subs = append(subs, x)
		}
	}
	rows.Close()
	payload, _ := json.Marshal(msg)
	client := &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	for _, x := range subs {
		if !pushEndpointAllowed(x.endpoint) {
			_, _ = tx.Exec(ctx, "DELETE FROM push_subscriptions WHERE id=$1::uuid", x.id)
			continue
		}
		res, e := webpush.SendNotificationWithContext(ctx, payload, &webpush.Subscription{Endpoint: x.endpoint, Keys: webpush.Keys{P256dh: x.p256dh, Auth: x.auth}}, &webpush.Options{
			HTTPClient: client, Subscriber: s.pushSubject(), VAPIDPublicKey: s.Config.VAPIDPublic, VAPIDPrivateKey: s.Config.VAPIDPrivate, TTL: 60, Urgency: webpush.UrgencyHigh,
		})
		if e != nil {
			retry = true
			continue
		}
		res.Body.Close()
		switch {
		case res.StatusCode == 404 || res.StatusCode == 410:
			_, _ = tx.Exec(ctx, "DELETE FROM push_subscriptions WHERE id=$1::uuid", x.id)
		case res.StatusCode >= 500 || res.StatusCode == 429:
			retry = true
		}
	}
	return retry
}

func (s *Server) pushSubject() string {
	if s.Config.VAPIDSubject != "" {
		return s.Config.VAPIDSubject
	}
	return s.Config.PublicOrigin
}
