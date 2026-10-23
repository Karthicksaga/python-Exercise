package app

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"golang.org/x/oauth2"
)

type Server struct {
	Config   Config
	DB       *pgxpool.Pool
	Cache    *redis.Client
	OAuth    oauth2.Config
	Verifier *oidc.IDTokenVerifier
	HTTP     *http.Client
}
type Account struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`
}
type Session struct {
	UserID string `json:"user_id"`
	CSRF   string `json:"csrf"`
}
type requestContext struct {
	Account Account
	Session Session
}
type contextKey int

const userKey contextKey = 0

func user(r *http.Request) requestContext { return r.Context().Value(userKey).(requestContext) }
func New(ctx context.Context, c Config) (*Server, error) {
	db, e := pgxpool.New(ctx, c.DatabaseURL)
	if e != nil {
		return nil, e
	}
	if e = db.Ping(ctx); e != nil {
		db.Close()
		return nil, e
	}
	ro, e := redis.ParseURL(c.RedisURL)
	if e != nil {
		db.Close()
		return nil, e
	}
	cache := redis.NewClient(ro)
	if e = cache.Ping(ctx).Err(); e != nil {
		db.Close()
		cache.Close()
		return nil, e
	}
	hc := &http.Client{Timeout: 8 * time.Second}
	provider, e := oidc.NewProvider(oidc.ClientContext(ctx, hc), c.Issuer)
	if e != nil {
		db.Close()
		cache.Close()
		return nil, fmt.Errorf("OIDC discovery: %w", e)
	}
	return &Server{Config: c, DB: db, Cache: cache, HTTP: hc, OAuth: oauth2.Config{ClientID: c.ClientID, ClientSecret: c.ClientSecret, RedirectURL: c.PublicOrigin + "/auth/callback", Endpoint: provider.Endpoint(), Scopes: []string{oidc.ScopeOpenID, "profile", "email"}}, Verifier: provider.Verifier(&oidc.Config{ClientID: c.ClientID})}, nil
}
func (s *Server) Close() { s.DB.Close(); s.Cache.Close() }
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { write(w, 200, map[string]bool{"ok": true}) })
	mux.HandleFunc("GET /readyz", s.ready)
	mux.HandleFunc("GET /auth/login", s.login)
	mux.HandleFunc("GET /auth/callback", s.callback)
	mux.Handle("POST /auth/logout", s.auth(http.HandlerFunc(s.logout)))
	mux.Handle("GET /api/me", s.auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := user(r)
		write(w, 200, map[string]any{"user": u.Account, "csrf": u.Session.CSRF})
	})))
	mux.HandleFunc("GET /api/config", s.publicConfig)
	routes := map[string]http.HandlerFunc{
		"GET /api/state": s.state, "GET /api/places": s.places, "POST /api/quotes": s.quote, "POST /api/rides": s.book,
		"POST /api/rides/{id}/actions": s.action, "POST /api/drivers/apply": s.applyDriver,
		"POST /api/drivers/location": s.location, "POST /api/drivers/offline": s.offline,
		"POST /api/incidents": s.incident, "GET /api/operator": s.operatorState,
		"POST /api/operator/areas": s.saveArea, "POST /api/operator/drivers/{id}": s.reviewDriver,
		"POST /api/operator/incidents/{id}": s.reviewIncident,
	}
	for pattern, handler := range routes {
		mux.Handle(pattern, s.auth(handler))
	}
	mux.HandleFunc("GET /", s.static)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				slog.Error("request panic", "method", r.Method)
				fail(w, 500, "Internal server error")
			}
		}()
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("Permissions-Policy", "geolocation=(self), camera=(), microphone=()")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
		w.Header().Set("Cache-Control", "no-store")
		if !s.Config.Development {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
		ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
		defer cancel()
		mux.ServeHTTP(w, r.WithContext(ctx))
	})
}
func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if s.DB.Ping(ctx) != nil || s.Cache.Ping(ctx).Err() != nil {
		fail(w, 503, "Dependencies unavailable")
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}
func (s *Server) static(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/auth/") {
		fail(w, 404, "Not found")
		return
	}
	path := filepath.Join(s.Config.WebDir, filepath.Clean("/"+r.URL.Path))
	if info, e := os.Stat(path); e != nil || info.IsDir() {
		path = filepath.Join(s.Config.WebDir, "index.html")
	}
	http.ServeFile(w, r, path)
}
func write(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, message string) {
	write(w, status, map[string]string{"error": message})
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		fail(w, 415, "JSON content type required")
		return false
	}
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if d.Decode(v) != nil {
		fail(w, 400, "Invalid request fields")
		return false
	}
	if d.Decode(&struct{}{}) != io.EOF {
		fail(w, 400, "Expected one JSON object")
		return false
	}
	return true
}
func dbError(w http.ResponseWriter, e error) {
	var pg *pgconn.PgError
	if errors.As(e, &pg) {
		switch pg.Code {
		case "23505":
			fail(w, 409, "An active ride or request already exists")
			return
		case "23503", "23514", "22P02", "22003", "22007", "22008":
			fail(w, 400, "Invalid record or field value")
			return
		}
	}
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Record not found")
		return
	}
	slog.Error("database operation failed", "type", fmt.Sprintf("%T", e))
	fail(w, 503, "Service unavailable; retry shortly")
}
func randomToken() string {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}
func digest(value string) string { h := sha256.Sum256([]byte(value)); return hex.EncodeToString(h[:]) }
func (s *Server) pin(id string) string {
	h := hmac.New(sha256.New, []byte(s.Config.SessionKey))
	h.Write([]byte("pickup:" + id))
	return fmt.Sprintf("%06d", binary.BigEndian.Uint32(h.Sum(nil)[:4])%1000000)
}
func (s *Server) peer(r *http.Request) string {
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	address, err := netip.ParseAddr(host)
	if err != nil {
		return host
	}
	trusted := func(ip netip.Addr) bool {
		for _, prefix := range s.Config.TrustedProxies {
			if prefix.Contains(ip) {
				return true
			}
		}
		return false
	}
	if !trusted(address) {
		return address.String()
	}
	chain := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for i := len(chain) - 1; i >= 0; i-- {
		forwarded, err := netip.ParseAddr(strings.TrimSpace(chain[i]))
		if err != nil {
			return address.String()
		}
		if !trusted(forwarded) {
			return forwarded.String()
		}
	}
	return address.String()
}

var limitScript = redis.NewScript(`local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n`)

func (s *Server) limit(w http.ResponseWriter, r *http.Request, key string, n int64, seconds int) bool {
	count, e := limitScript.Run(r.Context(), s.Cache, []string{"limit:" + key}, seconds).Int64()
	if e != nil {
		fail(w, 503, "Rate-limit service unavailable")
		return false
	}
	if count > n {
		w.Header().Set("Retry-After", fmt.Sprint(seconds))
		fail(w, 429, "Too many requests; please wait")
		return false
	}
	return true
}
func operator(w http.ResponseWriter, r *http.Request) bool {
	if user(r).Account.Role != "operator" {
		fail(w, 403, "Operator access required")
		return false
	}
	return true
}
func jsonRows(ctx context.Context, db interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, query string, args ...any) (json.RawMessage, error) {
	var result []byte
	e := db.QueryRow(ctx, "SELECT COALESCE(json_agg(t),'[]'::json) FROM ("+query+") t", args...).Scan(&result)
	return result, e
}
func audit(ctx context.Context, tx pgx.Tx, actor, ride, action string, detail any) error {
	b, e := json.Marshal(detail)
	if e != nil {
		return e
	}
	_, e = tx.Exec(ctx, "INSERT INTO audit_events(actor_id,ride_id,action,detail) VALUES(NULLIF($1,'')::uuid,NULLIF($2,'')::uuid,$3,$4)", actor, ride, action, b)
	return e
}
