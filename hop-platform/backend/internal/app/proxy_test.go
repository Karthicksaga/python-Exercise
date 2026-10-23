package app

import (
	"net/http/httptest"
	"net/netip"
	"testing"
)

func TestForwardedClientIPRequiresTrustedImmediatePeer(t *testing.T) {
	s := Server{Config: Config{TrustedProxies: []netip.Prefix{netip.MustParsePrefix("10.0.0.0/24")}}}
	cases := []struct{ remote, header, want string }{
		{"192.0.2.5:3000", "203.0.113.99", "192.0.2.5"},
		{"10.0.0.2:3000", "203.0.113.99, 192.0.2.5", "192.0.2.5"},
		{"10.0.0.2:3000", "192.0.2.5, 10.0.0.3", "192.0.2.5"},
		{"10.0.0.2:3000", "invalid", "10.0.0.2"},
	}
	for _, c := range cases {
		r := httptest.NewRequest("GET", "/auth/login", nil)
		r.RemoteAddr = c.remote
		r.Header.Set("X-Forwarded-For", c.header)
		if got := s.peer(r); got != c.want {
			t.Fatalf("%s: got %s want %s", c.remote, got, c.want)
		}
	}
}
