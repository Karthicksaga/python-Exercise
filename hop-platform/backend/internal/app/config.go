package app

import (
	"fmt"
	"net/netip"
	"net/url"
	"os"
	"strings"
)

type Config struct {
	RiderOrigin, CaptainOrigin, AdminOrigin                                                                                                                                                string
	VAPIDPublic, VAPIDPrivate, VAPIDSubject, Address, DatabaseURL, ListenURL, RedisURL, PublicOrigin, AllowedOrigins, Issuer, ClientID, ClientSecret, SessionKey, RoutingURL, GeocodingURL string
	Development                                                                                                                                                                            bool
	TrustedProxies                                                                                                                                                                         []netip.Prefix
	// Optional providers. OTP login needs an SMS webhook; online payments need Razorpay-style keys.
	SMSWebhookURL, SMSWebhookToken                                   string
	MSG91AuthKey, MSG91TemplateID                                    string
	PaymentAPIURL, PaymentKeyID, PaymentKeySecret, PaymentWebhookKey string
}

func ConfigFromEnv() (Config, error) {
	c := Config{VAPIDPublic: os.Getenv("VAPID_PUBLIC_KEY"), VAPIDPrivate: os.Getenv("VAPID_PRIVATE_KEY"), VAPIDSubject: os.Getenv("VAPID_SUBJECT"), Address: env("ADDRESS", ":8080"), DatabaseURL: os.Getenv("DATABASE_URL"), ListenURL: os.Getenv("DATABASE_LISTEN_URL"), RedisURL: os.Getenv("REDIS_URL"), PublicOrigin: env("PUBLIC_ORIGIN", "http://localhost:8080"), AllowedOrigins: os.Getenv("ALLOWED_ORIGINS"), Issuer: os.Getenv("OIDC_ISSUER"), ClientID: os.Getenv("OIDC_CLIENT_ID"), ClientSecret: os.Getenv("OIDC_CLIENT_SECRET"), SessionKey: os.Getenv("SESSION_KEY"), RoutingURL: os.Getenv("ROUTING_URL"), GeocodingURL: os.Getenv("GEOCODING_URL"), Development: os.Getenv("APP_ENV") == "development"}
	c.RiderOrigin, c.CaptainOrigin, c.AdminOrigin = os.Getenv("RIDER_ORIGIN"), os.Getenv("CAPTAIN_ORIGIN"), os.Getenv("ADMIN_ORIGIN")
	if c.Development {
		c.RiderOrigin = env("RIDER_ORIGIN", "http://localhost:5173")
		c.CaptainOrigin = env("CAPTAIN_ORIGIN", "http://localhost:5174")
		c.AdminOrigin = env("ADMIN_ORIGIN", "http://localhost:5175")
	}
	for _, origin := range []string{c.RiderOrigin, c.CaptainOrigin, c.AdminOrigin} {
		if origin == "" {
			continue
		}
		u, err := url.Parse(origin)
		if err != nil || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || u.User != nil || (u.Scheme != "https" && !(c.Development && u.Scheme == "http")) {
			return c, fmt.Errorf("app origins must be HTTPS origins without paths (HTTP allowed in development)")
		}
	}
	c.SMSWebhookURL, c.SMSWebhookToken = os.Getenv("SMS_WEBHOOK_URL"), os.Getenv("SMS_WEBHOOK_TOKEN")
	c.MSG91AuthKey, c.MSG91TemplateID = os.Getenv("MSG91_AUTH_KEY"), os.Getenv("MSG91_TEMPLATE_ID")
	c.PaymentAPIURL, c.PaymentKeyID, c.PaymentKeySecret, c.PaymentWebhookKey = env("PAYMENT_API_URL", "https://api.razorpay.com/v1"), os.Getenv("PAYMENT_KEY_ID"), os.Getenv("PAYMENT_KEY_SECRET"), os.Getenv("PAYMENT_WEBHOOK_SECRET")
	if c.SMSWebhookURL != "" && !strings.HasPrefix(c.SMSWebhookURL, "https://") && os.Getenv("APP_ENV") != "development" {
		return c, fmt.Errorf("SMS_WEBHOOK_URL must use HTTPS")
	}
	if c.DatabaseURL == "" || c.RedisURL == "" || c.Issuer == "" || c.ClientID == "" || len(c.SessionKey) < 32 {
		return c, fmt.Errorf("DATABASE_URL, REDIS_URL, OIDC_ISSUER, OIDC_CLIENT_ID and a SESSION_KEY of at least 32 characters are required")
	}
	u, e := url.Parse(c.PublicOrigin)
	if e != nil || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.User != nil || u.Fragment != "" {
		return c, fmt.Errorf("PUBLIC_ORIGIN must be an origin without path")
	}
	if !c.Development && (u.Scheme != "https" || !strings.HasPrefix(c.Issuer, "https://") || c.ClientSecret == "" || c.RoutingURL == "" || c.GeocodingURL == "") {
		return c, fmt.Errorf("production requires HTTPS public origin and issuer, OIDC client secret and ROUTING_URL/GEOCODING_URL")
	}
	if c.RoutingURL != "" {
		ru, e := url.Parse(c.RoutingURL)
		if e != nil || ru.Host == "" || (ru.Scheme != "https" && ru.Scheme != "http") {
			return c, fmt.Errorf("invalid routing URL")
		}
	}
	for _, cidr := range strings.Split(os.Getenv("TRUSTED_PROXY_CIDRS"), ",") {
		if strings.TrimSpace(cidr) == "" {
			continue
		}
		prefix, err := netip.ParsePrefix(strings.TrimSpace(cidr))
		if err != nil {
			return c, fmt.Errorf("invalid trusted proxy CIDR")
		}
		c.TrustedProxies = append(c.TrustedProxies, prefix)
	}
	if c.GeocodingURL != "" {
		u, err := url.Parse(c.GeocodingURL)
		if err != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") {
			return c, fmt.Errorf("invalid geocoding URL")
		}
	}
	return c, nil
}
func env(key, fallback string) string {
	if s := os.Getenv(key); s != "" {
		return s
	}
	return fallback
}
