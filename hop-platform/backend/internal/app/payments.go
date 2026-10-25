package app

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/jackc/pgx/v5"
)

// Online payments use a Razorpay-compatible gateway: the server creates the order,
// the browser pays through the provider checkout, and the result is confirmed by a
// signed webhook (or the signed checkout response). Nothing is trusted without a valid HMAC.

func (s *Server) paymentsConfigured() bool {
	return s.Config.PaymentKeyID != "" && s.Config.PaymentKeySecret != ""
}

func hmacHex(secret, message string) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(message))
	return hex.EncodeToString(h.Sum(nil))
}

func (s *Server) createPaymentOrder(w http.ResponseWriter, r *http.Request) {
	if !s.paymentsConfigured() {
		fail(w, 503, "Online payments are not configured")
		return
	}
	ctx, uid, id := r.Context(), user(r).Account.ID, r.PathValue("id")
	if !s.limit(w, r, "pay:"+uid, 10, 60) {
		return
	}
	var status, payStatus string
	var fare int64
	e := s.DB.QueryRow(ctx, `SELECT r.status,r.payment_status,GREATEST(0,COALESCE(r.offered_fare_paise,q.fare_paise)-q.discount_paise) FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.id=$1 AND r.rider_id=$2`, id, uid).Scan(&status, &payStatus, &fare)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "Ride not found")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	if status != "in_progress" && status != "completed" {
		fail(w, 409, "You can pay online once the trip has started")
		return
	}
	if payStatus != "unconfirmed" {
		fail(w, 409, "This trip's payment is already settled or under review")
		return
	}
	orderID, e := s.providerOrder(ctx, fare, id[:8]+"-"+randomToken()[:8])
	if e != nil {
		fail(w, 502, "Payment provider rejected the order")
		return
	}
	if _, e = s.DB.Exec(ctx, "INSERT INTO online_payments(ride_id,provider_order_id,amount_paise) VALUES($1,$2,$3)", id, orderID, fare); e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]any{"order_id": orderID, "amount_paise": fare, "currency": "INR", "key_id": s.Config.PaymentKeyID})
}

// settlePayment marks an order paid exactly once, after the caller verified the provider signature.
// A non-zero amount must equal the amount recorded when the order was created. Ride orders mark the ride
// paid and credit the driver ledger; wallet orders credit the rider's wallet.
func (s *Server) settlePayment(r *http.Request, orderID, paymentID string, amount int64) (bool, error) {
	ctx := r.Context()
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return false, e
	}
	defer tx.Rollback(ctx)
	var purpose, status string
	var rideID, account *string
	var paid int64
	e = tx.QueryRow(ctx, `SELECT p.purpose,p.status,p.ride_id::text,COALESCE(p.account_id::text,r.rider_id::text),p.amount_paise FROM online_payments p LEFT JOIN rides r ON r.id=p.ride_id
 WHERE p.provider_order_id=$1 AND ($2::bigint=0 OR p.amount_paise=$2::bigint) FOR UPDATE OF p`, orderID, amount).Scan(&purpose, &status, &rideID, &account, &paid)
	if errors.Is(e, pgx.ErrNoRows) {
		return false, nil
	}
	if e != nil {
		return false, e
	}
	if status == "paid" {
		return true, nil
	}
	if _, e = tx.Exec(ctx, "UPDATE online_payments SET status='paid',provider_payment_id=$2,paid_at=now() WHERE provider_order_id=$1", orderID, paymentID); e != nil {
		return false, e
	}
	if purpose == "wallet" {
		if e = walletCredit(ctx, tx, *account, paid, "topup", "", "Online top-up", "topup:"+orderID); e != nil {
			return false, e
		}
		if e = notify(ctx, tx, *account, "payment", "Wallet topped up", "₹"+rupees(paid)+" was added to your wallet."); e != nil {
			return false, e
		}
		return true, tx.Commit(ctx)
	}
	if _, e = tx.Exec(ctx, "UPDATE rides SET payment_status='paid_online',version=version+1,updated_at=now() WHERE id=$1 AND payment_status<>'rider_disputed'", *rideID); e != nil {
		return false, e
	}
	if e = creditDriverFare(ctx, tx, *rideID); e != nil {
		return false, e
	}
	if e = audit(ctx, tx, *account, *rideID, "paid_online", map[string]string{"order": orderID}); e != nil {
		return false, e
	}
	if e = notify(ctx, tx, *account, "payment", "Payment received", "Your online payment was received. Your receipt is in ride history."); e != nil {
		return false, e
	}
	return true, tx.Commit(ctx)
}

// verifyPayment confirms the browser checkout result using the signature the provider returns to the client.
func (s *Server) verifyPayment(w http.ResponseWriter, r *http.Request) {
	if !s.paymentsConfigured() {
		fail(w, 503, "Online payments are not configured")
		return
	}
	var in struct {
		OrderID   string `json:"razorpay_order_id"`
		PaymentID string `json:"razorpay_payment_id"`
		Signature string `json:"razorpay_signature"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !verifySignature(s.Config.PaymentKeySecret, in.OrderID, in.PaymentID, in.Signature) {
		fail(w, 400, "Payment signature is invalid")
		return
	}
	var owner string
	if e := s.DB.QueryRow(r.Context(), "SELECT r.rider_id FROM online_payments p JOIN rides r ON r.id=p.ride_id WHERE p.provider_order_id=$1 AND p.ride_id=$2", in.OrderID, r.PathValue("id")).Scan(&owner); e != nil || owner != user(r).Account.ID {
		fail(w, 404, "Payment not found")
		return
	}
	ok, e := s.settlePayment(r, in.OrderID, in.PaymentID, 0)
	if e != nil {
		dbError(w, e)
		return
	}
	if !ok {
		fail(w, 404, "Payment not found")
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

func (s *Server) paymentWebhook(w http.ResponseWriter, r *http.Request) {
	if s.Config.PaymentWebhookKey == "" {
		fail(w, 503, "Webhook is not configured")
		return
	}
	body, e := io.ReadAll(r.Body)
	if e != nil {
		fail(w, 400, "Invalid body")
		return
	}
	if !hmac.Equal([]byte(r.Header.Get("X-Razorpay-Signature")), []byte(hmacHex(s.Config.PaymentWebhookKey, string(body)))) {
		fail(w, 400, "Invalid signature")
		return
	}
	var ev struct {
		Event   string `json:"event"`
		Payload struct {
			Payment struct {
				Entity struct {
					ID      string `json:"id"`
					OrderID string `json:"order_id"`
					Amount  int64  `json:"amount"`
				} `json:"entity"`
			} `json:"payment"`
		} `json:"payload"`
	}
	if json.Unmarshal(body, &ev) != nil {
		fail(w, 400, "Invalid payload")
		return
	}
	p := ev.Payload.Payment.Entity
	if (ev.Event == "payment.captured" || ev.Event == "order.paid") && p.OrderID != "" && p.Amount > 0 {
		if _, e = s.settlePayment(r, p.OrderID, p.ID, p.Amount); e != nil {
			fail(w, 500, "Could not record payment")
			return
		}
	} else if ev.Event == "payment.failed" && p.OrderID != "" {
		s.DB.Exec(r.Context(), "UPDATE online_payments SET status='failed' WHERE provider_order_id=$1 AND status='created'", p.OrderID)
	}
	write(w, 200, map[string]string{"status": "ok"})
}

// providerOrder creates a gateway order for amount paise and returns its id.
func (s *Server) providerOrder(ctx context.Context, amount int64, receipt string) (string, error) {
	body, _ := json.Marshal(map[string]any{"amount": amount, "currency": "INR", "receipt": receipt})
	req, e := http.NewRequestWithContext(ctx, "POST", s.Config.PaymentAPIURL+"/orders", bytes.NewReader(body))
	if e != nil {
		return "", e
	}
	req.SetBasicAuth(s.Config.PaymentKeyID, s.Config.PaymentKeySecret)
	req.Header.Set("Content-Type", "application/json")
	res, e := s.HTTP.Do(req)
	if e != nil {
		return "", e
	}
	defer res.Body.Close()
	var order struct {
		ID     string `json:"id"`
		Amount int64  `json:"amount"`
	}
	if res.StatusCode/100 != 2 || json.NewDecoder(io.LimitReader(res.Body, 1<<16)).Decode(&order) != nil || order.ID == "" || order.Amount != amount {
		return "", errors.New("provider rejected the order")
	}
	return order.ID, nil
}

func verifySignature(secret, orderID, paymentID, signature string) bool {
	return hmac.Equal([]byte(signature), []byte(hmacHex(secret, orderID+"|"+paymentID)))
}
