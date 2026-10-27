package app

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

type querier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

// ---- Surge ----------------------------------------------------------------------------------------------

type surgeInfo struct {
	Multiplier float64 `json:"multiplier"`
	Reason     string  `json:"reason"` // "", "demand", "peak" or "operator"
}

// surgeFor resolves the fare multiplier for one area and vehicle: an active operator override wins;
// otherwise the higher of the recurring peak window and the demand-based multiplier, capped per area.
func (s *Server) surgeFor(ctx context.Context, db querier, areaID, category string) surgeInfo {
	var override *float64
	if e := db.QueryRow(ctx, `SELECT multiplier::float8 FROM surge_overrides
 WHERE area_id=$1 AND (category IS NULL OR category=$2) AND starts_at<=now() AND ends_at>now() ORDER BY created_at DESC LIMIT 1`, areaID, category).Scan(&override); e == nil && override != nil {
		return surgeInfo{round2(*override), "operator"}
	}
	var capM float64
	var auto bool
	if db.QueryRow(ctx, "SELECT surge_cap::float8,surge_auto FROM areas WHERE id=$1", areaID).Scan(&capM, &auto) != nil {
		return surgeInfo{1, ""}
	}
	best, reason := 1.0, ""
	var peak *float64
	if e := db.QueryRow(ctx, `SELECT max(multiplier)::float8 FROM peak_windows WHERE area_id=$1 AND active
 AND extract(isodow FROM now() AT TIME ZONE 'Asia/Kolkata')::smallint = ANY(days)
 AND (now() AT TIME ZONE 'Asia/Kolkata')::time >= start_time AND (now() AT TIME ZONE 'Asia/Kolkata')::time < end_time`, areaID).Scan(&peak); e == nil && peak != nil && *peak > best {
		best, reason = *peak, "peak"
	}
	if auto {
		var demand, supply int
		if db.QueryRow(ctx, `SELECT
 (SELECT count(*) FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE q.area_id=$1 AND q.vehicle_category=$2 AND r.status='requested' AND r.created_at>now()-interval '10 minutes'),
 (SELECT count(*) FROM drivers WHERE area_id=$1 AND vehicle_category=$2 AND status='approved' AND online AND location_at>now()-interval '2 minutes')`, areaID, category).Scan(&demand, &supply) == nil {
			if m := demandMultiplier(demand, supply); m > best {
				best, reason = m, "demand"
			}
		}
	}
	return surgeInfo{round2(math.Min(best, capM)), reasonIf(math.Min(best, capM) > 1, reason)}
}

func reasonIf(ok bool, reason string) string {
	if ok {
		return reason
	}
	return ""
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

// demandMultiplier raises prices by 25% for each point the open requests outnumber online drivers; small
// queues (under three open requests) never surge.
func demandMultiplier(demand, supply int) float64 {
	if demand < 3 {
		return 1
	}
	ratio := float64(demand) / float64(max(supply, 1))
	if ratio <= 1 {
		return 1
	}
	return math.Round((1+0.25*(ratio-1))*10) / 10
}

func applySurge(fare int64, m float64) int64 {
	if m <= 1 {
		return fare
	}
	pct := int64(math.Round(m * 100))
	return (fare*pct + 99) / 100
}

// ---- Promo codes ----------------------------------------------------------------------------------------

type promoResult struct {
	Code        string `json:"code"`
	Description string `json:"description"`
	Discount    int64  `json:"discount_paise"`
}

// promoDiscount validates a code for this rider, area and fare. With lock set it row-locks the promo so
// the caller can redeem it atomically.
func promoDiscount(ctx context.Context, db querier, rider, code, area string, fare int64, lock bool) (*promoResult, *quoteError) {
	code = strings.ToUpper(strings.TrimSpace(code))
	q := `SELECT description,kind,value,max_discount_paise,min_fare_paise,max_uses,per_user_limit,area_id::text FROM promo_codes
 WHERE code=$1 AND active AND now()>=valid_from AND now()<valid_to`
	if lock {
		q += " FOR UPDATE"
	}
	var desc, kind string
	var value, maxDiscount, minFare int64
	var maxUses *int
	var perUser int
	var promoArea *string
	if e := db.QueryRow(ctx, q, code).Scan(&desc, &kind, &value, &maxDiscount, &minFare, &maxUses, &perUser, &promoArea); e != nil {
		if errors.Is(e, pgx.ErrNoRows) {
			return nil, qerr(400, "That promo code is not valid")
		}
		return nil, qerr(0, "")
	}
	if promoArea != nil && *promoArea != area {
		return nil, qerr(400, "That promo code is not available in this area")
	}
	if fare < minFare {
		return nil, qerr(400, "This promo needs a fare of at least ₹"+rupees(minFare))
	}
	var total, mine int
	if e := db.QueryRow(ctx, `SELECT count(*),count(*) FILTER (WHERE p.rider_id=$2::uuid) FROM promo_redemptions p JOIN rides r ON r.id=p.ride_id
 WHERE p.code=$1 AND r.status NOT IN ('cancelled','expired')`, code, rider).Scan(&total, &mine); e != nil {
		return nil, qerr(0, "")
	}
	if maxUses != nil && total >= *maxUses {
		return nil, qerr(400, "This promo has been fully redeemed")
	}
	if mine >= perUser {
		return nil, qerr(400, "You have already used this promo")
	}
	var d int64
	if kind == "percent" {
		d = fare * value / 100
	} else {
		d = value
	}
	if maxDiscount > 0 && d > maxDiscount {
		d = maxDiscount
	}
	if d > fare {
		d = fare
	}
	if d <= 0 {
		return nil, qerr(400, "That promo code is not valid")
	}
	return &promoResult{Code: code, Description: desc, Discount: d}, nil
}

func rupees(paise int64) string {
	if paise%100 == 0 {
		return strconv.FormatInt(paise/100, 10)
	}
	return fmt.Sprintf("%d.%02d", paise/100, paise%100)
}

func (s *Server) promoCheck(w http.ResponseWriter, r *http.Request) {
	uid := user(r).Account.ID
	if !s.limit(w, r, "promo:"+uid, 30, 60) {
		return
	}
	var in struct {
		AreaID    string `json:"area_id"`
		Code      string `json:"code"`
		FarePaise int64  `json:"fare_paise"`
	}
	if !decode(w, r, &in) {
		return
	}
	res, qe := promoDiscount(r.Context(), s.DB, uid, in.Code, in.AreaID, in.FarePaise, false)
	if qe != nil {
		if qe.Status == 0 {
			dbError(w, errors.New("promo lookup"))
			return
		}
		fail(w, qe.Status, qe.Message)
		return
	}
	write(w, 200, res)
}

func (s *Server) promoList(w http.ResponseWriter, r *http.Request) {
	rows, e := jsonRows(r.Context(), s.DB, `SELECT code,description,kind,value,max_discount_paise,min_fare_paise,valid_to FROM promo_codes
 WHERE active AND listed AND now()>=valid_from AND now()<valid_to AND (area_id IS NULL OR area_id::text=$1) ORDER BY valid_to LIMIT 20`, r.URL.Query().Get("area_id"))
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"promos": rows})
}

// ---- Rider wallet ---------------------------------------------------------------------------------------

func walletBalance(ctx context.Context, db querier, account string) (int64, error) {
	var b int64
	e := db.QueryRow(ctx, "SELECT COALESCE(sum(amount_paise),0) FROM wallet_entries WHERE account_id=$1", account).Scan(&b)
	return b, e
}

// walletCredit appends a credit; a repeated idempotency key is a no-op.
func walletCredit(ctx context.Context, tx pgx.Tx, account string, amount int64, kind, ride, note, idem string) error {
	_, e := tx.Exec(ctx, `INSERT INTO wallet_entries(account_id,amount_paise,kind,ride_id,note,idem_key) VALUES($1,$2,$3,NULLIF($4,'')::uuid,$5,NULLIF($6,''))
 ON CONFLICT (idem_key) DO NOTHING`, account, amount, kind, ride, note, idem)
	return e
}

// walletDebit spends from the balance under an account-row lock and reports whether funds were sufficient.
func walletDebit(ctx context.Context, tx pgx.Tx, account string, amount int64, kind, ride, note, idem string) (bool, error) {
	if _, e := tx.Exec(ctx, "SELECT 1 FROM accounts WHERE id=$1 FOR UPDATE", account); e != nil {
		return false, e
	}
	if idem != "" {
		var n int
		if e := tx.QueryRow(ctx, "SELECT count(*) FROM wallet_entries WHERE idem_key=$1", idem).Scan(&n); e != nil {
			return false, e
		}
		if n > 0 {
			return true, nil
		}
	}
	bal, e := walletBalance(ctx, tx, account)
	if e != nil || bal < amount {
		return false, e
	}
	_, e = tx.Exec(ctx, `INSERT INTO wallet_entries(account_id,amount_paise,kind,ride_id,note,idem_key) VALUES($1,$2,$3,NULLIF($4,'')::uuid,$5,NULLIF($6,''))`, account, -amount, kind, ride, note, idem)
	return true, e
}

func (s *Server) walletState(w http.ResponseWriter, r *http.Request) {
	uid := user(r).Account.ID
	bal, e := walletBalance(r.Context(), s.DB, uid)
	if e != nil {
		dbError(w, e)
		return
	}
	entries, e := jsonRows(r.Context(), s.DB, "SELECT id,amount_paise,kind,note,created_at FROM wallet_entries WHERE account_id=$1 ORDER BY id DESC LIMIT 50", uid)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"balance_paise": bal, "entries": entries, "gateway": s.paymentsActive(), "test_mode": s.isPaymentTestMode(), "dev_topup": s.devPayments() && !s.paymentsConfigured()})
}

const maxTopup = 1000000 // ₹10,000

func (s *Server) walletTopup(w http.ResponseWriter, r *http.Request) {
	ctx, uid := r.Context(), user(r).Account.ID
	if !s.limit(w, r, "topup:"+uid, 10, 60) {
		return
	}
	var in struct {
		AmountPaise int64 `json:"amount_paise"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.AmountPaise < 1000 || in.AmountPaise > maxTopup {
		fail(w, 400, "Add between ₹10 and ₹10,000")
		return
	}
	if s.paymentsActive() {
		order, e := s.providerOrder(ctx, in.AmountPaise, "wallet-"+randomToken()[:10])
		if e != nil {
			fail(w, 502, "Payment provider unavailable")
			return
		}
		if _, e = s.DB.Exec(ctx, "INSERT INTO online_payments(purpose,account_id,provider_order_id,amount_paise) VALUES('wallet',$1,$2,$3)", uid, order, in.AmountPaise); e != nil {
			dbError(w, e)
			return
		}
		keyID := s.Config.PaymentKeyID
		if keyID == "" && s.devPayments() {
			keyID = "rzp_test_mock"
		}
		write(w, 201, map[string]any{"order_id": order, "amount_paise": in.AmountPaise, "currency": "INR", "key_id": keyID, "test_mode": s.isPaymentTestMode()})
		return
	}
	if !s.devPayments() {
		fail(w, 503, "Wallet top-ups are not configured")
		return
	}
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	if e = walletCredit(ctx, tx, uid, in.AmountPaise, "topup", "", "Development top-up (no real money)", ""); e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	bal, _ := walletBalance(ctx, s.DB, uid)
	write(w, 200, map[string]any{"balance_paise": bal})
}

func (s *Server) walletVerify(w http.ResponseWriter, r *http.Request) {
	if !s.paymentsActive() {
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
	in.OrderID = strings.TrimSpace(in.OrderID)
	in.PaymentID = strings.TrimSpace(in.PaymentID)
	in.Signature = strings.TrimSpace(in.Signature)
	if in.OrderID == "" || in.PaymentID == "" || in.Signature == "" || len(in.OrderID) > 100 || len(in.PaymentID) > 100 || len(in.Signature) > 128 {
		fail(w, 400, "Invalid payment parameters")
		return
	}
	valid := s.Config.PaymentKeySecret != "" && verifySignature(s.Config.PaymentKeySecret, in.OrderID, in.PaymentID, in.Signature)
	if !valid && s.devPayments() {
		if s.Config.PaymentKeySecret == "" && (in.Signature == "test_signature" || in.Signature == "dev_mock_signature" || verifySignature("dev_secret", in.OrderID, in.PaymentID, in.Signature)) {
			valid = true
		}
	}
	if !valid {
		fail(w, 400, "Payment signature is invalid")
		return
	}
	var owner string
	if e := s.DB.QueryRow(r.Context(), "SELECT account_id FROM online_payments WHERE provider_order_id=$1 AND purpose='wallet'", in.OrderID).Scan(&owner); e != nil || owner != user(r).Account.ID {
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

// ---- Driver ledger and payouts --------------------------------------------------------------------------

func (s *Server) driverWallet(w http.ResponseWriter, r *http.Request) {
	ctx, uid := r.Context(), user(r).Account.ID
	var upi string
	if e := s.DB.QueryRow(ctx, "SELECT upi_id FROM drivers WHERE user_id=$1", uid).Scan(&upi); e != nil {
		fail(w, 403, "Driver account required")
		return
	}
	var bal int64
	if e := s.DB.QueryRow(ctx, "SELECT COALESCE(sum(amount_paise),0) FROM driver_ledger WHERE driver_id=$1", uid).Scan(&bal); e != nil {
		dbError(w, e)
		return
	}
	ledger, e := jsonRows(ctx, s.DB, "SELECT id,kind,amount_paise,note,ride_id,created_at FROM driver_ledger WHERE driver_id=$1 ORDER BY id DESC LIMIT 50", uid)
	if e != nil {
		dbError(w, e)
		return
	}
	payouts, e := jsonRows(ctx, s.DB, "SELECT id,amount_paise,upi_id,status,reference,note,requested_at,processed_at FROM driver_payouts WHERE driver_id=$1 ORDER BY requested_at DESC LIMIT 20", uid)
	if e != nil {
		dbError(w, e)
		return
	}
	daily, e := jsonRows(ctx, s.DB, `SELECT to_char(d::date,'YYYY-MM-DD') AS day,to_char(d::date,'Dy') AS label,
 COALESCE(sum(COALESCE(r.offered_fare_paise,q.fare_paise)),0)::bigint AS fare_paise,count(r.id)::int AS trips
 FROM generate_series((now() AT TIME ZONE 'Asia/Kolkata')::date-6,(now() AT TIME ZONE 'Asia/Kolkata')::date,interval '1 day') d
 LEFT JOIN rides r ON r.driver_id=$1 AND r.status='completed' AND (r.completed_at AT TIME ZONE 'Asia/Kolkata')::date=d::date
 LEFT JOIN quotes q ON q.id=r.quote_id GROUP BY d ORDER BY d`, uid)
	if e != nil {
		dbError(w, e)
		return
	}
	score, factors := safetyScore(ctx, s.DB, uid)
	factors["score"] = score
	write(w, 200, map[string]any{"balance_paise": bal, "upi_id": upi, "min_payout_paise": minPayout, "ledger": ledger, "payouts": payouts, "daily": daily, "safety": factors})
}

const minPayout = 10000 // ₹100

func (s *Server) requestPayout(w http.ResponseWriter, r *http.Request) {
	ctx, uid := r.Context(), user(r).Account.ID
	if !s.limit(w, r, "payout:"+uid, 5, 60) {
		return
	}
	var in struct {
		AmountPaise int64 `json:"amount_paise"`
	}
	if !decode(w, r, &in) {
		return
	}
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	var upi string
	if e = tx.QueryRow(ctx, "SELECT upi_id FROM drivers WHERE user_id=$1 FOR UPDATE", uid).Scan(&upi); e != nil {
		fail(w, 403, "Driver account required")
		return
	}
	if upi == "" {
		fail(w, 409, "Add your UPI ID in driver preferences before requesting a payout")
		return
	}
	var bal int64
	if e = tx.QueryRow(ctx, "SELECT COALESCE(sum(amount_paise),0) FROM driver_ledger WHERE driver_id=$1", uid).Scan(&bal); e != nil {
		dbError(w, e)
		return
	}
	if in.AmountPaise == 0 {
		in.AmountPaise = bal
	}
	if in.AmountPaise < minPayout {
		fail(w, 400, "The minimum payout is ₹100")
		return
	}
	if in.AmountPaise > bal {
		fail(w, 409, "That is more than your available balance")
		return
	}
	var id string
	if e = tx.QueryRow(ctx, "INSERT INTO driver_payouts(driver_id,amount_paise,upi_id) VALUES($1,$2,$3) RETURNING id", uid, in.AmountPaise, upi).Scan(&id); e != nil {
		if strings.Contains(e.Error(), "driver_payouts_one_open") {
			fail(w, 409, "You already have a payout waiting for review")
			return
		}
		dbError(w, e)
		return
	}
	if _, e = tx.Exec(ctx, "INSERT INTO driver_ledger(driver_id,kind,amount_paise,note) VALUES($1,'payout',$2,$3)", uid, -in.AmountPaise, "Payout "+id[:8]); e != nil {
		dbError(w, e)
		return
	}
	if e = tx.Commit(ctx); e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, map[string]string{"id": id})
}

// creditDriverFare records the amount the platform collected from the rider (the payable fare) and
// reimburses any promo discount, so the driver is credited the full gross fare either way.
func creditDriverFare(ctx context.Context, tx pgx.Tx, rideID string) error {
	_, e := tx.Exec(ctx, `INSERT INTO driver_ledger(driver_id,ride_id,kind,amount_paise,note)
 SELECT r.driver_id,r.id,'online_fare',GREATEST(0,COALESCE(r.offered_fare_paise,q.fare_paise)-q.discount_paise),'Fare collected by the platform'
 FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.id=$1 AND r.driver_id IS NOT NULL
  AND GREATEST(0,COALESCE(r.offered_fare_paise,q.fare_paise)-q.discount_paise)>0
 ON CONFLICT (ride_id,kind) DO NOTHING`, rideID)
	if e != nil {
		return e
	}
	return creditPromoSubsidy(ctx, tx, rideID)
}

// creditPromoSubsidy reimburses a driver who collected the discounted fare in cash or by direct UPI.
func creditPromoSubsidy(ctx context.Context, tx pgx.Tx, rideID string) error {
	_, e := tx.Exec(ctx, `INSERT INTO driver_ledger(driver_id,ride_id,kind,amount_paise,note)
 SELECT r.driver_id,r.id,'promo_subsidy',LEAST(q.discount_paise,COALESCE(r.offered_fare_paise,q.fare_paise)),'Promo '||q.promo_code||' funded by the platform'
 FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.id=$1 AND r.driver_id IS NOT NULL AND q.discount_paise>0
 ON CONFLICT (ride_id,kind) DO NOTHING`, rideID)
	return e
}

// settleWalletRide charges the rider's wallet when a wallet ride completes. If funds fell short the ride
// stays unpaid and the rider is told to settle with the driver.
func settleWalletRide(ctx context.Context, tx pgx.Tx, rideID, rider string) error {
	var payable int64
	if e := tx.QueryRow(ctx, `SELECT GREATEST(0,COALESCE(r.offered_fare_paise,q.fare_paise)-q.discount_paise) FROM rides r JOIN quotes q ON q.id=r.quote_id WHERE r.id=$1`, rideID).Scan(&payable); e != nil {
		return e
	}
	ok := true
	if payable > 0 {
		var e error
		if ok, e = walletDebit(ctx, tx, rider, payable, "ride_payment", rideID, "Ride payment", "ride:"+rideID); e != nil {
			return e
		}
	}
	if !ok {
		return notify(ctx, tx, rider, "payment", "Wallet balance too low", "Your wallet could not cover this ride. Please pay the driver directly.")
	}
	if _, e := tx.Exec(ctx, "UPDATE rides SET payment_status='paid_online' WHERE id=$1", rideID); e != nil {
		return e
	}
	return creditDriverFare(ctx, tx, rideID)
}
