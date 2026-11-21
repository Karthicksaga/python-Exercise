package app

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

// Accepted means coming: a captain's cancel after accepting re-matches the ride (not to them),
// credits the rider once, and counts against the captain.
func TestCaptainCancelRequeuesAndCredits(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	rider, first := f.actor("rider", false), f.actor("rider", true)
	id := f.book(rider, f.quote(rider))
	f.offerTo(first, id)
	require(t, f.act(first, id, "accept", 1, ""), 200)
	require(t, f.act(first, id, "cancel", 2, ""), 200)

	var status string
	var credit int64
	if e := f.s.DB.QueryRow(ctx, "SELECT status,cancel_credit_paise FROM rides WHERE id=$1", id).Scan(&status, &credit); e != nil {
		t.Fatal(e)
	}
	if status != "requested" || credit != 2000 {
		t.Fatalf("after captain cancel: status %q credit %d, want requested and 2000", status, credit)
	}
	if b := f.balance(rider.id); b != 2000 {
		t.Fatalf("rider wallet %d, want 2000", b)
	}
	// The same captain isn't offered it again; another captain is.
	second := f.actor("rider", true)
	f.offerTo(second, id)
	_, st := f.call(first, "GET", "/api/state", nil)
	if offers, _ := st["offers"].([]any); len(offers) != 0 {
		t.Fatalf("the captain who cancelled was offered the ride again: %#v", offers)
	}
	drivers, _ := st["driver"].([]any)
	if n := drivers[0].(map[string]any)["cancels_30d"]; n != float64(1) {
		t.Fatalf("cancels_30d = %v, want 1", n)
	}
	// A second cancel on the same ride doesn't pay the credit twice.
	require(t, f.act(second, id, "accept", 3, ""), 200)
	require(t, f.act(second, id, "cancel", 4, ""), 200)
	if b := f.balance(rider.id); b != 2000 {
		t.Fatalf("rider credited twice: wallet %d", b)
	}
}

// Price promise: if the fare somehow ends above what the rider agreed to, the rider pays the
// promise and the captain is paid the difference.
func TestPricePromiseCapsFare(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	rider, captain := f.actor("rider", false), f.actor("rider", true)
	id := f.book(rider, f.quote(rider))
	f.offerTo(captain, id)
	require(t, f.act(captain, id, "accept", 1, ""), 200)
	require(t, f.act(captain, id, "arrive", 2, ""), 200)
	require(t, f.act(captain, id, "start", 3, f.s.pin(id)), 200)
	if _, e := f.s.DB.Exec(ctx, "UPDATE rides SET offered_fare_paise=7000 WHERE id=$1", id); e != nil {
		t.Fatal(e)
	}
	f.atDestination(captain, id)
	require(t, f.act(captain, id, "complete", 4, ""), 200)
	var fare, refund, promised int64
	f.s.DB.QueryRow(ctx, "SELECT offered_fare_paise,promise_refund_paise,promised_fare_paise FROM rides WHERE id=$1", id).Scan(&fare, &refund, &promised)
	if promised != 5500 || fare != 5500 || refund != 1500 {
		t.Fatalf("promise: fare %d refund %d promised %d, want 5500/1500/5500", fare, refund, promised)
	}
	if got := f.ledger(captain.id); got != 1500 {
		t.Fatalf("captain ledger %d, want the 1500 difference", got)
	}
}

// Meter-honest fare: once operations set the official tariff, quotes and config show it.
func TestMeterTariff(t *testing.T) {
	f := setup(t)
	op, rider := f.actor("operator", false), f.actor("rider", false)
	code, _ := f.call(op, "POST", "/api/operator/meter-tariff", map[string]any{"area_id": f.area, "category": "bike", "base_paise": 3000, "base_meters": 1800, "per_km_paise": 1500})
	require(t, code, 200)
	code, out := f.quoteWith(rider, nil)
	require(t, code, 201)
	meters := int64(out["meters"].(float64))
	want := int64(3000) + (max(0, meters-1800)+99)/100*1500/10
	if out["meter_fare_paise"] != float64(want) {
		t.Fatalf("meter fare %v, want %d for %d m", out["meter_fare_paise"], want, meters)
	}
	code, _ = f.call(rider, "POST", "/api/operator/meter-tariff", map[string]any{"area_id": f.area, "category": "bike", "off": true})
	require(t, code, 403)
	code, _ = f.call(op, "POST", "/api/operator/meter-tariff", map[string]any{"area_id": f.area, "category": "bike", "off": true})
	require(t, code, 200)
	_, out = f.quoteWith(rider, nil)
	if _, ok := out["meter_fare_paise"]; ok {
		t.Fatal("meter fare shown after the tariff was cleared")
	}
}

// Back-seat check and a late train.
func TestBackSeatAndTrainDelay(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	rider, captain := f.actor("rider", false), f.actor("rider", true)
	id := f.book(rider, f.quote(rider))
	f.offerTo(captain, id)
	require(t, f.act(captain, id, "accept", 1, ""), 200)
	code, _ := f.call(captain, "POST", "/api/rides/"+id+"/back-seat", map[string]any{"found": true})
	require(t, code, 404) // not finished yet
	require(t, f.act(captain, id, "arrive", 2, ""), 200)
	require(t, f.act(captain, id, "start", 3, f.s.pin(id)), 200)
	f.atDestination(captain, id)
	require(t, f.act(captain, id, "complete", 4, ""), 200)
	code, _ = f.call(rider, "POST", "/api/rides/"+id+"/back-seat", map[string]any{"found": true})
	require(t, code, 404) // captain only
	code, out := f.call(captain, "POST", "/api/rides/"+id+"/back-seat", map[string]any{"found": true, "note": "Black umbrella"})
	require(t, code, 200)
	if out["back_seat"] != "found" {
		t.Fatalf("back seat %#v", out)
	}
	var n int
	f.s.DB.QueryRow(ctx, "SELECT count(*) FROM notifications WHERE account_id=$1 AND kind='lost_item' AND body LIKE '%Black umbrella%'", rider.id).Scan(&n)
	if n != 1 {
		t.Fatal("rider wasn't told the captain found something")
	}

	at := time.Now().Add(2 * time.Hour).UTC().Truncate(time.Second)
	code, out = f.call(rider, "POST", "/api/scheduled-rides", map[string]any{"category": "bike", "pickup_lat": 13.08, "pickup_lng": 80.27, "pickup_label": "Chennai Central", "dropoff_lat": 13.04, "dropoff_lng": 80.23, "dropoff_label": "Home", "scheduled_for": at, "train_no": "12622"})
	require(t, code, 201)
	sid := out["id"].(string)
	code, _ = f.call(rider, "POST", "/api/scheduled-rides", map[string]any{"category": "bike", "pickup_lat": 13.08, "pickup_lng": 80.27, "pickup_label": "Chennai Central", "dropoff_lat": 13.04, "dropoff_lng": 80.23, "dropoff_label": "Home", "scheduled_for": at, "train_no": "12A"})
	require(t, code, 400)
	code, out = f.call(rider, "POST", "/api/scheduled-rides/"+sid+"/delay", map[string]any{"minutes": 20})
	require(t, code, 200)
	moved, _ := time.Parse(time.RFC3339, out["scheduled_for"].(string))
	if !moved.Equal(at.Add(20 * time.Minute)) {
		t.Fatalf("pickup moved to %v, want %v", moved, at.Add(20*time.Minute))
	}
	code, _ = f.call(captain, "POST", "/api/scheduled-rides/"+sid+"/delay", map[string]any{"minutes": 20})
	require(t, code, 409) // not their ride
}

// Booking by SMS: only with the provider's secret; a quoted fare is booked with YES.
func TestSMSBooking(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	rider := f.actor("rider", false)
	var phone string
	f.s.DB.QueryRow(ctx, "SELECT phone FROM account_profiles WHERE account_id=$1", rider.id).Scan(&phone)
	send := func(secret, from, text string) (int, map[string]string) {
		b, _ := json.Marshal(map[string]string{"from": from, "text": text})
		req, _ := http.NewRequest("POST", f.http.URL+"/api/sms/inbound", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Hop-SMS-Secret", secret)
		res, e := http.DefaultClient.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		defer res.Body.Close()
		var out map[string]string
		json.NewDecoder(res.Body).Decode(&out)
		return res.StatusCode, out
	}
	code, _ := send("anything", "+91"+phone, "HOP Adyar to Central")
	require(t, code, 403) // not set up
	f.s.Config.SMSInboundSecret = "sms-secret"
	code, _ = send("wrong", "+91"+phone, "HOP Adyar to Central")
	require(t, code, 403)
	_, out := send("sms-secret", "9000000001", "HOP Adyar to Central")
	if out["status"] != "unknown_number" {
		t.Fatalf("unknown number: %#v", out)
	}
	_, out = send("sms-secret", "+91 "+phone, "hello")
	if out["status"] != "failed" || out["reply"] != smsHelp {
		t.Fatalf("help reply: %#v", out)
	}
	_, out = send("sms-secret", phone, "YES")
	if out["status"] != "expired" {
		t.Fatalf("YES without a fare: %#v", out)
	}
	// A fare quoted by SMS (address search isn't configured in tests, so the quote is made here).
	q := f.quote(rider)
	if _, e := f.s.DB.Exec(ctx, "INSERT INTO sms_bookings(phone,account_id,body,quote_id,status) VALUES($1,$2,'HOP Adyar to Central',$3,'quoted')", phone, rider.id, q); e != nil {
		t.Fatal(e)
	}
	_, out = send("sms-secret", phone, "yes")
	if out["status"] != "booked" {
		t.Fatalf("YES didn't book: %#v", out)
	}
	var method string
	var sms bool
	f.s.DB.QueryRow(ctx, "SELECT payment_method,sms_updates FROM rides WHERE quote_id=$1", q).Scan(&method, &sms)
	if method != "cash" || !sms {
		t.Fatalf("SMS ride: payment %q sms updates %v", method, sms)
	}
}

func TestMeterFareMath(t *testing.T) {
	base, start, perKM := 3000, 1800, 1500
	p := VehiclePricing{MeterBase: &base, MeterBaseMeters: &start, MeterPerKM: &perKM}
	for _, c := range []struct{ meters, want int64 }{{1000, 3000}, {1800, 3000}, {1801, 3150}, {5000, 3000 + 32*150}} {
		if got := meterFare(p, c.meters); got != c.want {
			t.Fatalf("meterFare(%d) = %d, want %d", c.meters, got, c.want)
		}
	}
	if meterFare(VehiclePricing{}, 5000) != 0 {
		t.Fatal("no tariff should give no meter fare")
	}
}
