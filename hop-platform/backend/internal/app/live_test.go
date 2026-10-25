package app

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestPushEndpointAllowlist(t *testing.T) {
	allowed := []string{
		"https://fcm.googleapis.com/fcm/send/abc",
		"https://updates.push.services.mozilla.com/wpush/v2/abc",
		"https://web.push.apple.com/abc",
		"https://fcm.googleapis.com:443/fcm/send/abc",
	}
	refused := []string{
		"http://fcm.googleapis.com/fcm/send/abc",
		"https://evil.example/fcm.googleapis.com",
		"https://fcm.googleapis.com.evil.example/x",
		"https://notfcm.googleapis.com.attacker.io/x",
		"https://127.0.0.1/x",
		"https://169.254.169.254/latest/meta-data",
		"https://fcm.googleapis.com:8443/x",
		"https://user:pass@fcm.googleapis.com/x",
		"ftp://fcm.googleapis.com/x",
		"",
	}
	for _, u := range allowed {
		if !pushEndpointAllowed(u) {
			t.Errorf("should allow %q", u)
		}
	}
	for _, u := range refused {
		if pushEndpointAllowed(u) {
			t.Errorf("should refuse %q", u)
		}
	}
}

func TestPushOutboxLeaseAndUnsafeEndpoints(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	rider := f.actor("rider", false)
	// Inserted directly: a stored endpoint that is not an allowed push host must never be contacted.
	if _, e := f.s.DB.Exec(ctx, `INSERT INTO push_subscriptions(account_id,endpoint,p256dh,auth) VALUES($1,$2,$3,$4)`,
		rider.id, "https://internal.example.local/push/"+strings.Repeat("a", 20), strings.Repeat("p", 30), strings.Repeat("a", 12)); e != nil {
		t.Fatal(e)
	}
	if _, e := f.s.DB.Exec(ctx, `INSERT INTO notifications(account_id,kind,title,body) VALUES($1,'test','Hello','Body')`, rider.id); e != nil {
		t.Fatal(e)
	}
	count := func(q string) (n int) {
		if e := f.s.DB.QueryRow(ctx, q).Scan(&n); e != nil {
			t.Fatal(e)
		}
		return n
	}
	if count("SELECT count(*) FROM push_outbox") != 1 {
		t.Fatal("notification trigger did not enqueue a push job")
	}
	// A row leased by another worker is skipped.
	f.s.DB.Exec(ctx, "UPDATE push_outbox SET lease_until=now()+interval '1 minute'")
	if e := f.s.pushBatch(ctx); e != nil {
		t.Fatal(e)
	}
	if count("SELECT count(*) FROM push_outbox") != 1 || count("SELECT count(*) FROM push_subscriptions") != 1 {
		t.Fatal("leased job should be left alone")
	}
	f.s.DB.Exec(ctx, "UPDATE push_outbox SET lease_until=NULL")
	if e := f.s.pushBatch(ctx); e != nil {
		t.Fatal(e)
	}
	if count("SELECT count(*) FROM push_outbox") != 0 {
		t.Fatal("job should be settled after delivery")
	}
	if count("SELECT count(*) FROM push_subscriptions") != 0 {
		t.Fatal("unsafe subscription should be removed")
	}
	// Accounts without a subscription never enqueue.
	other := f.actor("rider", false)
	f.s.DB.Exec(ctx, `INSERT INTO notifications(account_id,kind,title,body) VALUES($1,'test','Hello','Body')`, other.id)
	if count("SELECT count(*) FROM push_outbox") != 0 {
		t.Fatal("no subscription, no job")
	}
}

func TestLiveLocationIndex(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	meta := liveMeta{Area: f.area, Category: "auto", Radius: 3000}
	if e := f.s.putLive(ctx, "11111111-1111-4111-8111-aaaaaaaaaaaa", meta, 13.08, 80.27, 8); e != nil {
		t.Fatal(e)
	}
	if e := f.s.putLiveAt(ctx, "11111111-1111-4111-8111-bbbbbbbbbbbb", meta, 13.0801, 80.2701, 8, time.Now().Add(-10*time.Minute)); e != nil {
		t.Fatal(e)
	}
	hits, e := f.s.searchLive(ctx, f.area, 13.08, 80.27, 2000)
	if e != nil {
		t.Fatal(e)
	}
	if len(hits) != 1 || hits[0].ID != "11111111-1111-4111-8111-aaaaaaaaaaaa" {
		t.Fatalf("only the fresh driver should be found, got %#v", hits)
	}
	if ids, _ := f.s.shortlistLive(ctx, f.area, "auto", 13.08, 80.27, 2000); len(ids) != 1 {
		t.Fatalf("shortlist %v", ids)
	}
	if hits, _ = f.s.searchLive(ctx, "other-area", 13.08, 80.27, 2000); len(hits) != 0 {
		t.Fatal("areas must be isolated")
	}
	f.s.dropLive(ctx, "11111111-1111-4111-8111-aaaaaaaaaaaa")
	if hits, _ = f.s.searchLive(ctx, f.area, 13.08, 80.27, 2000); len(hits) != 0 {
		t.Fatalf("dropped driver still listed: %#v", hits)
	}
}

func TestEventHubWakesOnlyTheSubscriber(t *testing.T) {
	h := newEventHub()
	a, cancelA := h.subscribe("a")
	b, cancelB := h.subscribe("b")
	defer cancelB()
	h.wake("a")
	select {
	case <-a:
	case <-time.After(time.Second):
		t.Fatal("subscriber a was not woken")
	}
	select {
	case <-b:
		t.Fatal("subscriber b should not wake")
	default:
	}
	cancelA()
	h.wake("a")
	h.wakeAll()
	select {
	case <-b:
	case <-time.After(time.Second):
		t.Fatal("wakeAll should reach b")
	}
}
