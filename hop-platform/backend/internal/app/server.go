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
	Media      mediaStore
	FCM        oauth2.TokenSource
	FCMProject string
	Config     Config
	DB         *pgxpool.Pool
	Cache      *redis.Client
	OAuth      oauth2.Config
	Verifier   *oidc.IDTokenVerifier
	HTTP       *http.Client
	Events     *eventHub
}
type Account struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`
}
type Session struct {
	NativePushToken string `json:"native_push_token,omitempty"`
	UserID          string `json:"user_id"`
	CSRF            string `json:"csrf"`
}
type requestContext struct {
	Account Account
	Session Session
}
type contextKey int

const (
	userKey  contextKey = 0
	nonceKey contextKey = 1
)

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
	server := &Server{Events: newEventHub(), Config: c, DB: db, Cache: cache, HTTP: hc, OAuth: oauth2.Config{ClientID: c.ClientID, ClientSecret: c.ClientSecret, RedirectURL: c.PublicOrigin + "/auth/callback", Endpoint: provider.Endpoint(), Scopes: []string{oidc.ScopeOpenID, "profile", "email"}}, Verifier: provider.Verifier(&oidc.Config{ClientID: c.ClientID})}
	if e := server.configureMedia(ctx); e != nil {
		server.Close()
		return nil, e
	}
	if e := server.configureNativePush(ctx); e != nil {
		server.Close()
		return nil, e
	}
	return server, nil
}
func (s *Server) Close() { s.DB.Close(); s.Cache.Close() }
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { write(w, 200, map[string]bool{"ok": true}) })
	mux.HandleFunc("GET /readyz", s.ready)
	mux.HandleFunc("GET /auth/login", s.login)
	mux.HandleFunc("GET /auth/callback", s.callback)
	mux.HandleFunc("POST /auth/otp/request", s.otpRequest)
	mux.HandleFunc("POST /auth/otp/verify", s.otpVerify)
	mux.HandleFunc("POST /auth/mobile/exchange", s.mobileExchange)
	mux.HandleFunc("POST /api/payments/webhook", s.paymentWebhook)
	mux.Handle("POST /auth/logout", s.auth(http.HandlerFunc(s.logout)))
	mux.Handle("GET /api/me", s.auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := user(r)
		write(w, 200, map[string]any{"user": u.Account, "csrf": u.Session.CSRF})
	})))
	mux.HandleFunc("GET /api/config", s.publicConfig)
	routes := map[string]http.HandlerFunc{
		"GET /api/state": s.state, "POST /api/estimates": s.estimates, "GET /api/rides/{id}/messages": s.rideMessages, "POST /api/rides/{id}/messages": s.sendRideMessage, "GET /api/places": s.places, "GET /api/places/reverse": s.placesReverse, "POST /api/quotes": s.quote, "POST /api/routes/alternatives": s.routeAlternatives, "POST /api/rides": s.book,
		"POST /api/profile/phone/request": s.requestProfilePhone, "POST /api/profile/phone/verify": s.verifyProfilePhone,
		"GET /api/profile/photo/{id}": s.profilePhoto, "POST /api/profile/photo": s.uploadProfilePhoto, "POST /api/profile/photo/delete": s.deleteProfilePhoto,
		"GET /api/drivers/onboarding": s.onboardingState, "POST /api/drivers/onboarding": s.saveOnboarding,
		"POST /api/drivers/documents/{kind}": s.uploadDriverDocument, "GET /api/drivers/documents/{id}/{kind}": s.driverDocument,
		"GET /api/rides/{id}/receipt": s.tripReceipt, "POST /api/rides/{id}/offer-seen": s.offerSeen,
		"POST /api/profile": s.updateProfile, "GET /api/profile": s.profileState, "POST /api/profile/contacts": s.addEmergencyContact,
		"POST /api/profile/contacts/{id}/delete": s.deleteEmergencyContact, "GET /api/profile/export": s.exportProfile, "POST /api/profile/deletion": s.requestDeletion, "POST /api/locations": s.saveLocation,
		"POST /api/locations/{id}/delete": s.deleteLocation, "POST /api/rides/{id}/rating": s.rateRide, "GET /api/rides/{id}/nav": s.navigate, "GET /api/rides/{id}/position": s.ridePosition, "POST /api/dev/driver-near-request": s.devDriverNearRequest,
		"POST /api/rides/{id}/actions": s.action, "POST /api/drivers/apply": s.applyDriver,
		"POST /api/drivers/location": s.location, "POST /api/drivers/offline": s.offline,
		"POST /api/drivers/online":      s.online,
		"GET /api/drivers/availability": s.driverAvailability,
		"POST /api/drivers/preferences": s.saveDriverPreferences, "POST /api/drivers/vehicle": s.requestVehicleChange, "POST /api/drivers/area": s.requestAreaChange,
		"POST /api/android/push/subscribe": s.androidPushSubscribe, "POST /api/android/push/unsubscribe": s.androidPushUnsubscribe,
		"GET /api/push/key": s.pushKey, "POST /api/push/subscribe": s.pushSubscribe, "POST /api/push/unsubscribe": s.pushUnsubscribe,
		"GET /api/nearby": s.nearby, "GET /api/stream": s.stream, "POST /api/operator/vehicle-changes/{id}": s.reviewVehicleChange, "POST /api/operator/area-changes/{id}": s.reviewAreaChange,
		"GET /api/drivers/earnings": s.driverEarnings, "GET /api/drivers/demand": s.driverDemand, "POST /api/drivers/go-home": s.goHome, "POST /api/drivers/goal": s.saveGoal, "GET /api/drivers/insights": s.driverInsights,
		"POST /api/incidents": s.incident, "GET /api/operator": s.operatorState,
		"POST /api/operator/areas": s.saveArea, "POST /api/operator/drivers/{id}": s.reviewDriver,
		"POST /api/operator/pricing":        s.saveVehiclePricing,
		"POST /api/operator/incidents/{id}": s.reviewIncident,
		"GET /api/wallet":                   s.walletState, "POST /api/wallet/topup": s.walletTopup, "POST /api/wallet/verify": s.walletVerify,
		"POST /api/promos/check": s.promoCheck, "GET /api/promos": s.promoList,
		"GET /api/drivers/wallet": s.driverWallet, "POST /api/drivers/payouts": s.requestPayout,
		"POST /api/rides/{id}/call": s.rideCall,
		"GET /api/operator/finance": s.operatorFinance, "POST /api/operator/promos": s.operatorSavePromo,
		"POST /api/operator/peak-windows": s.operatorSavePeak, "POST /api/operator/peak-windows/{id}/delete": s.operatorDeleteRow("peak_windows"),
		"POST /api/operator/surge": s.operatorSaveSurge, "POST /api/operator/surge/{id}/delete": s.operatorDeleteRow("surge_overrides"),
		"POST /api/operator/areas/{id}/surge": s.operatorAreaSurge, "POST /api/operator/payouts/{id}": s.operatorPayout,
		"POST /api/operator/refunds": s.operatorRefund, "GET /api/operator/rides": s.operatorRides,
		"GET /api/operator/live-map": s.operatorLiveMap, "POST /api/operator/rides/{id}/cancel": s.operatorCancelRide,
		"GET /api/operator/sos": s.operatorSOSEvents, "POST /api/operator/sos/{id}/resolve": s.operatorResolveSOS,
		"GET /api/operator/lost-items": s.operatorLostItems, "POST /api/operator/lost-items/{id}": s.operatorUpdateLostItem,
		"GET /api/operator/analytics": s.operatorAnalytics,
		"GET /api/admin/drivers":      s.adminDrivers, "POST /api/admin/drivers/{id}": s.adminDecision,
	}
	for pattern, handler := range s.circleRoutes() {
		routes[pattern] = handler
	}
	for pattern, handler := range s.companionRoutes() {
		routes[pattern] = handler
	}
	mux.HandleFunc("GET /api/share/{token}", s.viewShare)
	for pattern, handler := range routes {
		mux.Handle(pattern, s.auth(handler))
	}
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { fail(w, http.StatusNotFound, "Not found") })
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				slog.Error("request panic", "method", r.Method)
				fail(w, 500, "Internal server error")
			}
		}()
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "geolocation=(self), camera=(), microphone=()")
		nonce := randomToken()
		w.Header().Set("Content-Security-Policy", fmt.Sprintf("default-src 'self'; script-src 'nonce-%s' 'strict-dynamic' https: 'unsafe-eval' blob:; style-src 'self' 'nonce-%s' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; img-src 'self' https://server.arcgisonline.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.googleapis.com https://*.gstatic.com *.google.com *.googleusercontent.com data: blob:; connect-src 'self' https://server.arcgisonline.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.razorpay.com https://*.googleapis.com *.google.com https://*.gstatic.com data: blob:; frame-src *.google.com https://api.razorpay.com https://*.razorpay.com; font-src 'self' https://fonts.gstatic.com data:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'", nonce, nonce))
		w.Header().Set("Cache-Control", "no-store")
		if !s.Config.Development {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		limit := int64(16 * 1024)
		if r.URL.Path == "/api/profile/photo" || strings.HasPrefix(r.URL.Path, "/api/drivers/documents/") {
			limit = 3 * 1024 * 1024
		}
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
		if r.URL.Path == "/api/stream" {
			cancel()
			ctx, cancel = context.WithCancel(r.Context())
		}
		defer cancel()
		ctx = context.WithValue(ctx, nonceKey, nonce)
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
	if s.Cache == nil {
		return true
	}
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
