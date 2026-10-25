package app

import (
	"context"
	"fmt"
	"math/rand/v2"
	"testing"
	"time"
)

func (f *fixture) quoteWith(c client, extra map[string]any) (int, map[string]any) {
	f.t.Helper()
	body := map[string]any{"area_id": f.area, "vehicle_category": "bike", "pickup": Point{13.08, 80.27, "Central"}, "dropoff": Point{13.04, 80.23, "Destination"}}
	for k, v := range extra {
		body[k] = v
	}
	return f.call(c, "POST", "/api/quotes", body)
}

func (f *fixture) bookWith(c client, quote, payment string) (int, map[string]any) {
	f.t.Helper()
	code, out := f.call(c, "POST", "/api/rides", map[string]any{"quote_id": quote, "request_key": fmt.Sprintf("22222222-2222-4222-8222-%012x", rand.Uint64()&0xffffffffffff), "payment_method": payment})
	if code == 201 {
		f.dispatch()
	}
	return code, out
}

func (f *fixture) balance(account string) int64 {
	f.t.Helper()
	b, e := walletBalance(context.Background(), f.s.DB, account)
	if e != nil {
		f.t.Fatal(e)
	}
	return b
}

func (f *fixture) ledger(driver string) (total int64) {
	f.t.Helper()
	f.s.DB.QueryRow(context.Background(), "SELECT COALESCE(sum(amount_paise),0) FROM driver_ledger WHERE driver_id=$1", driver).Scan(&total)
	return
}

func TestSurgeMath(t *testing.T) {
	if got := applySurge(5500, 1.5); got != 8250 {
		t.Fatalf("surge fare %d", got)
	}
	if demandMultiplier(2, 0) != 1 {
		t.Fatal("thin demand must not surge")
	}
	if m := demandMultiplier(8, 2); m <= 1 {
		t.Fatalf("demand 8 vs supply 2 should surge, got %v", m)
	}
}

func TestPromoWalletAndDriverLedger(t *testing.T) {
	f := setup(t)
	op := f.actor("operator", false)
	r := f.actor("rider", false)
	d := f.actor("rider", true)

	code, _ := f.call(op, "POST", "/api/operator/promos", map[string]any{"code": "SAVE10", "kind": "percent", "value": 10, "per_user_limit": 1, "active": true, "listed": true})
	require(t, code, 200)
	code, _ = f.call(r, "POST", "/api/operator/promos", map[string]any{"code": "HACK", "kind": "flat", "value": 100, "per_user_limit": 1, "active": true})
	require(t, code, 403)

	code, q := f.quoteWith(r, map[string]any{"promo_code": "nope"})
	require(t, code, 400)
	code, q = f.quoteWith(r, map[string]any{"promo_code": "save10"})
	require(t, code, 201)
	if q["fare_paise"] != float64(5500) || q["discount_paise"] != float64(550) || q["payable_paise"] != float64(4950) {
		t.Fatalf("promo quote %#v", q)
	}

	// Wallet booking needs funds.
	code, _ = f.bookWith(r, q["id"].(string), "wallet")
	require(t, code, 402)
	code, _ = f.call(r, "POST", "/api/wallet/topup", map[string]any{"amount_paise": 2000})
	require(t, code, 200)
	code, _ = f.call(r, "POST", "/api/wallet/topup", map[string]any{"amount_paise": 50})
	require(t, code, 400)
	code, _ = f.call(r, "POST", "/api/wallet/topup", map[string]any{"amount_paise": 5000})
	require(t, code, 200)

	code, out := f.bookWith(r, q["id"].(string), "wallet")
	require(t, code, 201)
	id := out["id"].(string)

	// The per-user limit blocks a second use while the first ride is live.
	code, _ = f.quoteWith(f.actor("rider", false), map[string]any{"promo_code": "SAVE10"})
	require(t, code, 201)
	var redemptions int
	f.s.DB.QueryRow(context.Background(), "SELECT count(*) FROM promo_redemptions WHERE ride_id=$1", id).Scan(&redemptions)
	if redemptions != 1 {
		t.Fatalf("redemptions %d", redemptions)
	}
	code, _ = f.quoteWith(r, map[string]any{"promo_code": "SAVE10"})
	require(t, code, 400)

	require(t, f.act(d, id, "accept", 1, ""), 200)
	require(t, f.act(d, id, "arrive", 2, ""), 200)
	require(t, f.act(d, id, "start", 3, f.s.pin(id)), 200)
	f.atDestination(d, id)
	require(t, f.act(d, id, "complete", 4, ""), 200)

	if b := f.balance(r.id); b != 7000-4950 {
		t.Fatalf("wallet balance %d", b)
	}
	// The driver is owed the gross fare: collected payable plus the platform-funded discount.
	if l := f.ledger(d.id); l != 5500 {
		t.Fatalf("driver ledger %d", l)
	}
	var paid string
	f.s.DB.QueryRow(context.Background(), "SELECT payment_status FROM rides WHERE id=$1", id).Scan(&paid)
	if paid != "paid_online" {
		t.Fatalf("payment status %s", paid)
	}
	// Settling twice must not double charge or double credit.
	tx, _ := f.s.DB.Begin(context.Background())
	if e := settleWalletRide(context.Background(), tx, id, r.id); e != nil {
		t.Fatal(e)
	}
	tx.Commit(context.Background())
	if f.balance(r.id) != 2050 || f.ledger(d.id) != 5500 {
		t.Fatal("wallet settlement is not idempotent")
	}

	// Refunds are capped by what was paid and return to the wallet.
	code, _ = f.call(op, "POST", "/api/operator/refunds", map[string]any{"ride_id": id, "amount_paise": 9999, "reason": "too much"})
	require(t, code, 409)
	code, _ = f.call(op, "POST", "/api/operator/refunds", map[string]any{"ride_id": id, "amount_paise": 1000, "reason": "Long detour", "clawback_driver": true})
	require(t, code, 201)
	if f.balance(r.id) != 3050 || f.ledger(d.id) != 4500 {
		t.Fatalf("refund balances %d %d", f.balance(r.id), f.ledger(d.id))
	}
	code, _ = f.call(r, "POST", "/api/operator/refunds", map[string]any{"ride_id": id, "amount_paise": 100, "reason": "self refund"})
	require(t, code, 403)

	// Payouts: minimum, one open request, and the balance leaves the ledger immediately.
	f.s.DB.Exec(context.Background(), "INSERT INTO driver_ledger(driver_id,kind,amount_paise,note) VALUES($1,'adjustment',20000,'bonus')", d.id)
	code, _ = f.call(d, "POST", "/api/drivers/payouts", map[string]any{"amount_paise": 500})
	require(t, code, 400)
	code, _ = f.call(d, "POST", "/api/drivers/payouts", map[string]any{"amount_paise": 999999})
	require(t, code, 409)
	code, _ = f.call(d, "POST", "/api/drivers/payouts", map[string]any{"amount_paise": 12000})
	require(t, code, 201)
	code, _ = f.call(d, "POST", "/api/drivers/payouts", map[string]any{"amount_paise": 10000})
	require(t, code, 409)
	if f.ledger(d.id) != 12500 {
		t.Fatalf("ledger after payout %d", f.ledger(d.id))
	}
	var payout string
	f.s.DB.QueryRow(context.Background(), "SELECT id FROM driver_payouts WHERE driver_id=$1", d.id).Scan(&payout)
	code, _ = f.call(op, "POST", "/api/operator/payouts/"+payout, map[string]any{"decision": "rejected", "note": "UPI mismatch"})
	require(t, code, 200)
	if f.ledger(d.id) != 24500 {
		t.Fatalf("rejected payout should return funds, got %d", f.ledger(d.id))
	}
	code, _ = f.call(op, "POST", "/api/operator/payouts/"+payout, map[string]any{"decision": "paid", "reference": "UTR12345"})
	require(t, code, 409)
}

func TestCashPromoSubsidyAndCancelledPromoRelease(t *testing.T) {
	f := setup(t)
	op := f.actor("operator", false)
	r := f.actor("rider", false)
	d := f.actor("rider", true)
	code, _ := f.call(op, "POST", "/api/operator/promos", map[string]any{"code": "FLAT5", "kind": "flat", "value": 500, "per_user_limit": 1, "active": true})
	require(t, code, 200)

	_, q := f.quoteWith(r, map[string]any{"promo_code": "FLAT5"})
	code, out := f.bookWith(r, q["id"].(string), "cash")
	require(t, code, 201)
	id := out["id"].(string)
	require(t, f.act(r, id, "cancel", 1, ""), 200)
	code, _ = f.quoteWith(r, map[string]any{"promo_code": "FLAT5"})
	require(t, code, 201) // a cancelled ride does not burn the promo

	_, q = f.quoteWith(r, map[string]any{"promo_code": "FLAT5"})
	code, out = f.bookWith(r, q["id"].(string), "cash")
	require(t, code, 201)
	id = out["id"].(string)
	require(t, f.act(d, id, "accept", 1, ""), 200)
	require(t, f.act(d, id, "arrive", 2, ""), 200)
	require(t, f.act(d, id, "start", 3, f.s.pin(id)), 200)
	f.atDestination(d, id)
	require(t, f.act(d, id, "complete", 4, ""), 200)
	if f.ledger(d.id) != 0 {
		t.Fatal("cash ride credited before the driver confirmed")
	}
	require(t, f.act(d, id, "payment_received", 5, ""), 200)
	if l := f.ledger(d.id); l != 500 {
		t.Fatalf("driver should be reimbursed the promo discount, got %d", l)
	}
}

func TestSurgeAppliesToQuote(t *testing.T) {
	f := setup(t)
	op := f.actor("operator", false)
	r := f.actor("rider", false)
	code, _ := f.call(op, "POST", "/api/operator/surge", map[string]any{"area_id": f.area, "multiplier": 1.5, "reason": "Rain", "minutes": 30})
	require(t, code, 201)
	code, q := f.quoteWith(r, nil)
	require(t, code, 201)
	if q["fare_paise"] != float64(8250) || q["surge_multiplier"] != 1.5 || q["surge_reason"] != "operator" {
		t.Fatalf("surged quote %#v", q)
	}
	// An out-of-range multiplier is rejected.
	code, _ = f.call(op, "POST", "/api/operator/surge", map[string]any{"area_id": f.area, "multiplier": 9, "reason": "Rain", "minutes": 30})
	require(t, code, 400)
	_ = time.Now
}

func TestMaskedCallAndSafetyScore(t *testing.T) {
	f := setup(t)
	r := f.actor("rider", false)
	d := f.actor("rider", true)
	stranger := f.actor("rider", false)
	id := f.book(r, f.quote(r))
	code, _ := f.call(r, "POST", "/api/rides/"+id+"/call", nil)
	require(t, code, 409)
	require(t, f.act(d, id, "accept", 1, ""), 200)
	code, _ = f.call(stranger, "POST", "/api/rides/"+id+"/call", nil)
	require(t, code, 404)
	code, out := f.call(r, "POST", "/api/rides/"+id+"/call", nil)
	require(t, code, 201)
	if n, _ := out["masked_number"].(string); n == "" || len(n) < 8 {
		t.Fatalf("masked number %#v", out)
	}
	if score, _ := safetyScore(context.Background(), f.s.DB, d.id); score != 100 {
		t.Fatalf("fresh driver score %d", score)
	}
	f.s.DB.Exec(context.Background(), "INSERT INTO incidents(ride_id,reporter_id,message) VALUES($1,$2,'Unsafe driving reported')", id, r.id)
	if score, _ := safetyScore(context.Background(), f.s.DB, d.id); score != 88 {
		t.Fatalf("score after incident %d", score)
	}
}
