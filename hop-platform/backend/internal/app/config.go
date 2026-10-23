package app

import (
	"fmt"
	"net/netip"
	"net/url"
	"os"
	"strings"
)

type Config struct {
	Address, DatabaseURL, RedisURL, PublicOrigin, Issuer, ClientID, ClientSecret, SessionKey, RoutingURL, GeocodingURL, WebDir string
	Development                                                                                                                bool
	TrustedProxies                                                                                                             []netip.Prefix
}

func ConfigFromEnv() (Config, error) {
	c := Config{Address: env("ADDRESS", ":8080"), DatabaseURL: os.Getenv("DATABASE_URL"), RedisURL: os.Getenv("REDIS_URL"), PublicOrigin: env("PUBLIC_ORIGIN", "http://localhost:8080"), Issuer: os.Getenv("OIDC_ISSUER"), ClientID: os.Getenv("OIDC_CLIENT_ID"), ClientSecret: os.Getenv("OIDC_CLIENT_SECRET"), SessionKey: os.Getenv("SESSION_KEY"), RoutingURL: os.Getenv("ROUTING_URL"), GeocodingURL: os.Getenv("GEOCODING_URL"), WebDir: env("WEB_DIR", "../web/dist"), Development: os.Getenv("APP_ENV") == "development"}
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
