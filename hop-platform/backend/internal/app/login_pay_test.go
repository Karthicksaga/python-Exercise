package app

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func publicPost(t *testing.T, f *fixture, path string, body any, headers map[string]string) (int, map[string]any, []*http.Cookie) {
	t.Helper()
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest("POST", f.http.URL+path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://hop.test")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, e := http.DefaultClient.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	defer res.Body.Close()
	var out map[string]any
	json.NewDecoder(res.Body).Decode(&out)
	return res.StatusCode, out, res.Cookies()
}

func TestPhoneOTPLogin(t *testing.T) {
	f := setup(t)
	code, _, _ := publicPost(t, f, "/auth/otp/request", map[string]string{"phone": "12345"}, nil)
	require(t, code, 400)
	code, _, _ = publicPost(t, f, "/auth/otp/request", map[string]string{"phone": "9876543210"}, map[string]string{"Origin": "https://evil.test"})
	require(t, code, 403)
	code, out, _ := publicPost(t, f, "/auth/otp/request", map[string]string{"phone": "9876543210"}, nil)
	require(t, code, 200)
	otp, _ := out["dev_code"].(string)
	if len(otp) != 6 {
		t.Fatalf("expected dev code, got %#v", out)
	}
	code, _, _ = publicPost(t, f, "/auth/otp/request", map[string]string{"phone": "9876543210"}, nil)
	require(t, code, 429)
	bad := "000000"
	if otp == bad {
		bad = "111111"
	}
	code, _, _ = publicPost(t, f, "/auth/otp/verify", map[string]string{"phone": "9876543210", "code": bad}, nil)
	require(t, code, 400)
	var stored string
	f.s.DB.QueryRow(context.Background(), "SELECT code_hash FROM phone_otps WHERE phone='9876543210'").Scan(&stored)
	if stored == otp || !strings.HasPrefix(stored, f.s.otpHash("9876543210", otp)[:8]) {
		t.Fatal("code must be stored hashed")
	}
	code, _, cookies := publicPost(t, f, "/auth/otp/verify", map[string]string{"phone": "9876543210", "code": otp}, nil)
	require(t, code, 200)
	if len(cookies) == 0 {
		t.Fatal("no session cookie")
	}
	c := client{secret: cookies[0].Value}
	req, _ := http.NewRequest("GET", f.http.URL+"/api/me", nil)
	req.AddCookie(&http.Cookie{Name: "hop_session", Value: c.secret})
	res, _ := http.DefaultClient.Do(req)
	res.Body.Close()
	require(t, res.StatusCode, 200)
	code, _, _ = publicPost(t, f, "/auth/otp/verify", map[string]string{"phone": "9876543210", "code": otp}, nil)
	require(t, code, 400)
}

func TestOnlinePaymentOrderAndSignedConfirmation(t *testing.T) {
	f := setup(t)
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if u, p, ok := r.BasicAuth(); !ok || u != "key" || p != "secret" {
			w.WriteHeader(401)
			return
		}
		var in map[string]any
		json.NewDecoder(r.Body).Decode(&in)
		write(w, 200, map[string]any{"id": "order_TEST1", "amount": in["amount"]})
	}))
	defer gateway.Close()
	f.s.Config.PaymentAPIURL, f.s.Config.PaymentKeyID, f.s.Config.PaymentKeySecret, f.s.Config.PaymentWebhookKey = gateway.URL, "key", "secret", "whsec"
	r := f.actor("rider", false)
	d := f.actor("rider", true)
	id := f.book(r, f.quote(r))
	code, _ := f.call(r, "POST", "/api/rides/"+id+"/pay", map[string]any{})
	require(t, code, 409)
	require(t, f.act(d, id, "accept", 1, ""), 200)
	require(t, f.act(d, id, "arrive", 2, ""), 200)
	require(t, f.act(d, id, "start", 3, f.s.pin(id)), 200)
	code, out := f.call(r, "POST", "/api/rides/"+id+"/pay", map[string]any{})
	require(t, code, 201)
	if out["amount_paise"] != float64(5500) || out["order_id"] != "order_TEST1" {
		t.Fatalf("order %#v", out)
	}
	code, _ = f.call(r, "POST", "/api/rides/"+id+"/pay/verify", map[string]any{"razorpay_order_id": "order_TEST1", "razorpay_payment_id": "pay_1", "razorpay_signature": "forged"})
	require(t, code, 400)
	body := `{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1","order_id":"order_TEST1","amount":100}}}}`
	code, _, _ = publicPost(t, f, "/api/payments/webhook", json.RawMessage(body), map[string]string{"X-Razorpay-Signature": "bad"})
	require(t, code, 400)
	sign := hmacHex("whsec", body)
	code, _, _ = publicPost(t, f, "/api/payments/webhook", json.RawMessage(body), map[string]string{"X-Razorpay-Signature": sign})
	require(t, code, 200)
	var st string
	f.s.DB.QueryRow(context.Background(), "SELECT payment_status FROM rides WHERE id=$1", id).Scan(&st)
	if st != "unconfirmed" {
		t.Fatalf("wrong amount must not settle, got %s", st)
	}
	body = strings.Replace(body, `"amount":100`, `"amount":5500`, 1)
	code, _, _ = publicPost(t, f, "/api/payments/webhook", json.RawMessage(body), map[string]string{"X-Razorpay-Signature": hmacHex("whsec", body)})
	require(t, code, 200)
	f.s.DB.QueryRow(context.Background(), "SELECT payment_status FROM rides WHERE id=$1", id).Scan(&st)
	if st != "paid_online" {
		t.Fatalf("payment status %s", st)
	}
	code, _ = f.call(r, "POST", "/api/rides/"+id+"/pay/verify", map[string]any{"razorpay_order_id": "order_TEST1", "razorpay_payment_id": "pay_1", "razorpay_signature": hmacHex("secret", "order_TEST1|pay_1")})
	require(t, code, 200)
}
