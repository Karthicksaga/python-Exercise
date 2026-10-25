package app

import (
	"testing"
	"time"
)

func TestValidateDriverApplication(t *testing.T) {
	future := time.Now().AddDate(1, 0, 0).Format("2006-01-02")
	past := time.Now().AddDate(0, 0, -3).Format("2006-01-02")
	area := "6e6fce3b-cd5b-4468-b032-44450c6b868f"
	cases := []struct {
		name, area, veh, lic, ins, upi, le, ie string
		ok                                     bool
	}{
		{"ok", area, "ka 01-ab 1234", "DL-12345", "INS/2026/77", "ab@bank", future, future, true},
		{"bad area", "x", "KA01AB1234", "DL-12345", "INS-12345", "", future, future, false},
		{"plate letters only", area, "ABCDEFG", "DL-12345", "INS-12345", "", future, future, false},
		{"plate short", area, "KA01", "DL-12345", "INS-12345", "", future, future, false},
		{"short licence", area, "KA01AB1234", "DL1", "INS-12345", "", future, future, false},
		{"bad upi", area, "KA01AB1234", "DL-12345", "INS-12345", "nope", future, future, false},
		{"expired", area, "KA01AB1234", "DL-12345", "INS-12345", "", past, future, false},
		{"missing date", area, "KA01AB1234", "DL-12345", "INS-12345", "", future, "", false},
	}
	for _, c := range cases {
		area, veh, lic, ins, upi := c.area, c.veh, c.lic, c.ins, c.upi
		msg := validateDriverApplication(&area, &veh, &lic, &ins, &upi, c.le, c.ie)
		if (msg == "") != c.ok {
			t.Errorf("%s: got %q", c.name, msg)
		}
	}
	a, v, l, i, u := area, "ka 01-ab 1234", "DL-12345", "INS-12345", ""
	validateDriverApplication(&a, &v, &l, &i, &u, future, future)
	if v != "KA01AB1234" {
		t.Errorf("vehicle not normalised: %s", v)
	}
}

func TestOriginAllowed(t *testing.T) {
	prod := &Server{Config: Config{PublicOrigin: "https://app.hop.in", AllowedOrigins: "https://captain.hop.in, https://admin.hop.in"}}
	dev := &Server{Config: Config{PublicOrigin: "http://localhost:8080", Development: true}}
	for origin, want := range map[string]bool{"https://app.hop.in": true, "https://admin.hop.in": true, "https://evil.example": false, "http://localhost:5174": false, "": false} {
		if got := prod.originAllowed(origin); got != want {
			t.Errorf("prod %q = %v", origin, got)
		}
	}
	for origin, want := range map[string]bool{"http://localhost:5173": true, "http://127.0.0.1:5175": true, "https://evil.example": false, "http://localhost.evil.com": false} {
		if got := dev.originAllowed(origin); got != want {
			t.Errorf("dev %q = %v", origin, got)
		}
	}
}
