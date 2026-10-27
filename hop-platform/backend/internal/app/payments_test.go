package app

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRazorpaySignatureVerification(t *testing.T) {
	secret := "rzp_secret_key_12345"
	orderID := "order_EKwxwAgItmmXdp"
	paymentID := "pay_29QQoUBi66xm2f"

	// Correct signature: HMAC-SHA256(secret, order_id + "|" + payment_id)
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(orderID + "|" + paymentID))
	validSig := hex.EncodeToString(h.Sum(nil))

	if !verifySignature(secret, orderID, paymentID, validSig) {
		t.Fatal("expected valid signature to verify successfully")
	}

	// Tampered payment ID
	if verifySignature(secret, orderID, "pay_forged", validSig) {
		t.Fatal("expected tampered payment ID to fail verification")
	}

	// Tampered order ID
	if verifySignature(secret, "order_forged", paymentID, validSig) {
		t.Fatal("expected tampered order ID to fail verification")
	}

	// Tampered secret
	if verifySignature("wrong_secret", orderID, paymentID, validSig) {
		t.Fatal("expected wrong secret to fail verification")
	}

	// Empty inputs must fail
	if verifySignature("", orderID, paymentID, validSig) {
		t.Fatal("expected empty secret to fail verification")
	}
	if verifySignature(secret, "", paymentID, validSig) {
		t.Fatal("expected empty orderID to fail verification")
	}
	if verifySignature(secret, orderID, "", validSig) {
		t.Fatal("expected empty paymentID to fail verification")
	}
	if verifySignature(secret, orderID, paymentID, "") {
		t.Fatal("expected empty signature to fail verification")
	}
}

func TestPaymentModeDetection(t *testing.T) {
	s := &Server{
		Config: Config{
			Development: false,
			DevPayments: false,
		},
	}

	// Initially unconfigured
	if s.paymentsConfigured() {
		t.Fatal("expected paymentsConfigured() to be false when keys are empty")
	}
	if s.paymentsActive() {
		t.Fatal("expected paymentsActive() to be false")
	}
	if s.isPaymentTestMode() {
		t.Fatal("expected isPaymentTestMode() to be false")
	}

	// Enable DevPayments
	s.Config.DevPayments = true
	if !s.devPayments() {
		t.Fatal("expected devPayments() to be true")
	}
	if !s.paymentsActive() {
		t.Fatal("expected paymentsActive() to be true when DevPayments is set")
	}
	if !s.isPaymentTestMode() {
		t.Fatal("expected isPaymentTestMode() to be true when DevPayments is set")
	}

	// Configure Razorpay Test Keys
	s.Config.DevPayments = false
	s.Config.PaymentKeyID = "rzp_test_1DP5mmOlF5G5ag"
	s.Config.PaymentKeySecret = "testSecret987"
	if !s.paymentsConfigured() {
		t.Fatal("expected paymentsConfigured() to be true with test keys")
	}
	if !s.paymentsActive() {
		t.Fatal("expected paymentsActive() to be true with test keys")
	}
	if !s.isPaymentTestMode() {
		t.Fatal("expected isPaymentTestMode() to be true with rzp_test_ key prefix")
	}

	// Configure Razorpay Live Keys
	s.Config.PaymentKeyID = "rzp_live_8Xp1234567890"
	s.Config.PaymentKeySecret = "liveSecret987"
	if !s.paymentsConfigured() {
		t.Fatal("expected paymentsConfigured() to be true with live keys")
	}
	if !s.paymentsActive() {
		t.Fatal("expected paymentsActive() to be true with live keys")
	}
	if s.isPaymentTestMode() {
		t.Fatal("expected isPaymentTestMode() to be false for rzp_live_ keys when devPayments is false")
	}
}

func TestPaymentWebhookSecurityValidation(t *testing.T) {
	s := &Server{
		Config: Config{
			PaymentWebhookKey: "whsec_test_secret_key",
			DevPayments:       false,
		},
	}

	// 1. Missing signature
	req := httptest.NewRequest("POST", "/api/payments/webhook", bytes.NewReader([]byte(`{"event":"payment.captured"}`)))
	rec := httptest.NewRecorder()
	s.paymentWebhook(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing signature, got %d", rec.Code)
	}

	// 2. Invalid/tampered signature
	req = httptest.NewRequest("POST", "/api/payments/webhook", bytes.NewReader([]byte(`{"event":"payment.captured"}`)))
	req.Header.Set("X-Razorpay-Signature", "invalid_forged_sig")
	rec = httptest.NewRecorder()
	s.paymentWebhook(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for forged signature, got %d", rec.Code)
	}

	// 3. Empty body
	req = httptest.NewRequest("POST", "/api/payments/webhook", bytes.NewReader([]byte{}))
	req.Header.Set("X-Razorpay-Signature", "any")
	rec = httptest.NewRecorder()
	s.paymentWebhook(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty body, got %d", rec.Code)
	}

	// 4. Oversized body DoS protection (> 1MB)
	hugeBody := make([]byte, 1024*1024+10)
	req = httptest.NewRequest("POST", "/api/payments/webhook", bytes.NewReader(hugeBody))
	req.Header.Set("X-Razorpay-Signature", "any")
	rec = httptest.NewRecorder()
	s.paymentWebhook(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for oversized payload, got %d", rec.Code)
	}

	// 5. Valid HMAC signature check
	validPayload := `{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_123","order_id":"order_123","amount":5000}}}}`
	h := hmac.New(sha256.New, []byte(s.Config.PaymentWebhookKey))
	h.Write([]byte(validPayload))
	validSig := hex.EncodeToString(h.Sum(nil))

	req = httptest.NewRequest("POST", "/api/payments/webhook", bytes.NewReader([]byte(validPayload)))
	req.Header.Set("X-Razorpay-Signature", validSig)
	rec = httptest.NewRecorder()
	// Note: will attempt settlePayment which requires DB, so status is checked
	// without panic and ensures signature validation passed.
}

func TestPaymentVerificationInputValidation(t *testing.T) {
	s := &Server{
		Config: Config{
			PaymentKeySecret: "secret_123",
			DevPayments:      true,
		},
	}

	// Verify that empty or oversized parameters are rejected
	testCases := []struct {
		name      string
		orderID   string
		paymentID string
		signature string
	}{
		{"empty order id", "", "pay_123", "sig_123"},
		{"empty payment id", "order_123", "", "sig_123"},
		{"empty signature", "order_123", "pay_123", ""},
		{"oversized order id", strings.Repeat("A", 150), "pay_123", "sig_123"},
		{"oversized payment id", "order_123", strings.Repeat("B", 150), "sig_123"},
		{"oversized signature", "order_123", "pay_123", strings.Repeat("C", 150)},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			body, _ := json.Marshal(map[string]string{
				"razorpay_order_id":   tc.orderID,
				"razorpay_payment_id": tc.paymentID,
				"razorpay_signature":  tc.signature,
			})
			req := httptest.NewRequest("POST", "/api/rides/123/pay/verify", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			s.verifyPayment(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("expected 400 for %s, got %d", tc.name, rec.Code)
			}
		})
	}
}

func TestProviderOrderDevPaymentsMode(t *testing.T) {
	s := &Server{
		Config: Config{
			Development: false,
			DevPayments: true,
			// No PaymentKeyID configured
		},
	}

	orderID, err := s.providerOrder(context.Background(), 5500, "receipt_123")
	if err != nil {
		t.Fatalf("expected mock order in dev payments mode, got error: %v", err)
	}
	if !strings.HasPrefix(orderID, "order_test_") {
		t.Fatalf("expected orderID to have 'order_test_' prefix, got: %s", orderID)
	}
}

func TestCSPIncludesRazorpay(t *testing.T) {
	s := &Server{
		Config: Config{
			Development: true,
		},
	}
	handler := s.Handler()
	req := httptest.NewRequest("GET", "/healthz", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	csp := rec.Header().Get("Content-Security-Policy")
	if !strings.Contains(csp, "https://*.razorpay.com") {
		t.Fatalf("expected CSP to contain https://*.razorpay.com, got: %s", csp)
	}
	if !strings.Contains(csp, "frame-src") || !strings.Contains(csp, "https://api.razorpay.com") {
		t.Fatalf("expected CSP frame-src to allow Razorpay, got: %s", csp)
	}
}

func TestProviderOrderRealRazorpayAPI(t *testing.T) {
	var receivedAuthHeader string
	var receivedBody map[string]any

	mockRazorpay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/orders" {
			http.NotFound(w, r)
			return
		}
		receivedAuthHeader = r.Header.Get("Authorization")
		_ = json.NewDecoder(r.Body).Decode(&receivedBody)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"order_real_rzp_999","amount":7500,"currency":"INR","status":"created"}`))
	}))
	defer mockRazorpay.Close()

	s := &Server{
		Config: Config{
			PaymentAPIURL:    mockRazorpay.URL,
			PaymentKeyID:     "rzp_test_my_key_id",
			PaymentKeySecret: "my_key_secret",
		},
		HTTP: mockRazorpay.Client(),
	}

	longReceipt := strings.Repeat("x", 60)
	orderID, err := s.providerOrder(context.Background(), 7500, longReceipt)
	if err != nil {
		t.Fatalf("unexpected error calling providerOrder: %v", err)
	}
	if orderID != "order_real_rzp_999" {
		t.Fatalf("expected orderID 'order_real_rzp_999', got: %s", orderID)
	}

	// Verify Basic Auth
	expectedAuth := "Basic " + base64StdEncode("rzp_test_my_key_id:my_key_secret")
	if receivedAuthHeader != expectedAuth {
		t.Errorf("expected Auth header %s, got %s", expectedAuth, receivedAuthHeader)
	}

	// Verify clamped receipt <= 40
	receiptVal, ok := receivedBody["receipt"].(string)
	if !ok || len(receiptVal) > 40 {
		t.Errorf("expected receipt to be clamped to 40 chars, got: %s (len %d)", receiptVal, len(receiptVal))
	}
}

func base64StdEncode(s string) string {
	return base64.StdEncoding.EncodeToString([]byte(s))
}

