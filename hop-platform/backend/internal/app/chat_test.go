package app

import (
	"context"
	"os"
	"strconv"
	"testing"
	"time"
)

// chatRide books a ride, has the captain accept it, and opens its conversation.
func chatRide(t *testing.T, f *fixture) (rider, captain client, ride, chat string) {
	t.Helper()
	rider, captain = f.actor("rider", false), f.actor("rider", true)
	ride = f.book(rider, f.quote(rider))
	code, _ := f.call(rider, "POST", "/api/rides/"+ride+"/chat", map[string]any{})
	require(t, code, 404) // no captain yet
	f.offerTo(captain, ride)
	require(t, f.act(captain, ride, "accept", 1, ""), 200)
	code, out := f.call(rider, "POST", "/api/rides/"+ride+"/chat", map[string]any{})
	require(t, code, 200)
	chat = out["id"].(string)
	code, again := f.call(captain, "POST", "/api/rides/"+ride+"/chat", map[string]any{})
	require(t, code, 200)
	if again["id"] != chat {
		t.Fatalf("both people must share one conversation: %v vs %v", again["id"], chat)
	}
	return
}

// listen runs the real database listener, so waits are woken by triggers as in production.
func listen(t *testing.T, f *fixture) {
	t.Helper()
	f.s.Config.DatabaseURL = os.Getenv("TEST_DATABASE_URL")
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go f.s.RunEvents(ctx)
	time.Sleep(300 * time.Millisecond) // LISTEN is in place
}

func msgs(v map[string]any) []map[string]any {
	out := []map[string]any{}
	for _, m := range v["messages"].([]any) {
		out = append(out, m.(map[string]any))
	}
	return out
}

func idOf(m map[string]any) string { return strconv.FormatInt(int64(m["id"].(float64)), 10) }

func TestChatIsPrivateIdempotentAndTracksReads(t *testing.T) {
	f := setup(t)
	rider, captain, ride, chat := chatRide(t, f)
	stranger := f.actor("rider", false)

	// Only the two people on the ride can see or use it.
	code, _ := f.call(stranger, "GET", "/api/chats/"+chat, nil)
	require(t, code, 404)
	code, _ = f.call(stranger, "POST", "/api/chats/"+chat+"/messages", map[string]any{"client_id": newUUID(), "body": "hi"})
	require(t, code, 404)
	code, _ = f.call(stranger, "POST", "/api/rides/"+ride+"/chat", map[string]any{})
	require(t, code, 404)
	code, _ = f.call(rider, "GET", "/api/chats/not-a-uuid", nil)
	require(t, code, 404)

	// A retried send (same client_id) is stored once.
	cid := newUUID()
	code, first := f.call(rider, "POST", "/api/chats/"+chat+"/messages", map[string]any{"client_id": cid, "body": "  I'm at gate 2\x07 "})
	require(t, code, 201)
	code, retry := f.call(rider, "POST", "/api/chats/"+chat+"/messages", map[string]any{"client_id": cid, "body": "I'm at gate 2"})
	require(t, code, 200)
	if first["id"] != retry["id"] || first["body"] != "I'm at gate 2" || first["client_id"] != cid || first["sender_role"] != "rider" {
		t.Fatalf("retry must return the stored message: %#v vs %#v", first, retry)
	}
	code, _ = f.call(rider, "POST", "/api/chats/"+chat+"/messages", map[string]any{"client_id": "nope", "body": "x"})
	require(t, code, 400)
	code, _ = f.call(rider, "POST", "/api/chats/"+chat+"/messages", map[string]any{"client_id": newUUID(), "body": "   "})
	require(t, code, 400)

	// The captain sees one unread message from the named rider; the rider sees none.
	code, view := f.call(captain, "GET", "/api/chats/"+chat, nil)
	require(t, code, 200)
	if view["unread"] != float64(1) || len(msgs(view)) != 1 || msgs(view)[0]["mine"] != false || view["can_post"] != true {
		t.Fatalf("captain view %#v", view)
	}
	var riderName string
	for _, p := range view["participants"].([]any) {
		if p := p.(map[string]any); p["role"] == "rider" {
			riderName, _ = p["name"].(string)
		}
	}
	if riderName != "Test" {
		t.Fatalf("participants should carry first names, got %q", riderName)
	}
	_, st := f.call(captain, "GET", "/api/state", nil)
	unread := -1.0
	for _, r := range st["rides"].([]any) {
		if r := r.(map[string]any); r["id"] == ride {
			unread, _ = r["chat_unread"].(float64)
		}
	}
	if unread != 1 {
		t.Fatalf("ride row should show 1 unread, got %v", unread)
	}

	// Reading only moves forward and never past the newest message; the rider sees "Seen".
	last := first["id"].(float64)
	require(t, mustCall(f, captain, "/api/chats/"+chat+"/read", map[string]any{"message_id": last + 1000}), 200)
	require(t, mustCall(f, captain, "/api/chats/"+chat+"/read", map[string]any{"message_id": 0}), 200)
	_, view = f.call(rider, "GET", "/api/chats/"+chat, nil)
	for _, p := range view["participants"].([]any) {
		if p := p.(map[string]any); p["role"] == "captain" && p["last_read_id"] != last {
			t.Fatalf("captain's read position should be %v, got %v", last, p["last_read_id"])
		}
	}

	// The inbox lists it with the last message.
	code, inbox := f.call(captain, "GET", "/api/chats", nil)
	require(t, code, 200)
	list := inbox["conversations"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["unread"] != float64(0) || list[0].(map[string]any)["last_message"].(map[string]any)["body"] != "I'm at gate 2" {
		t.Fatalf("inbox %#v", inbox)
	}

	// Paging back through history.
	for i := 0; i < 55; i++ {
		f.s.DB.Exec(context.Background(), "INSERT INTO chat_messages(conversation_id,sender_id,body) VALUES($1,$2,$3)", chat, captain.id, "m"+strconv.Itoa(i))
	}
	_, page := f.call(rider, "GET", "/api/chats/"+chat, nil)
	if len(msgs(page)) != chatPageSize || page["has_more"] != true || msgs(page)[chatPageSize-1]["body"] != "m54" {
		t.Fatalf("latest page wrong: %d has_more=%v", len(msgs(page)), page["has_more"])
	}
	_, older := f.call(rider, "GET", "/api/chats/"+chat+"?before="+idOf(msgs(page)[0]), nil)
	if len(msgs(older)) != 6 || older["has_more"] != false || msgs(older)[0]["body"] != "I'm at gate 2" {
		t.Fatalf("older page wrong: %#v", msgs(older))
	}
}

func TestChatWaitIsWokenByMessagesReadsAndTyping(t *testing.T) {
	f := setup(t)
	listen(t, f)
	rider, captain, _, chat := chatRide(t, f)

	type result struct {
		view    map[string]any
		elapsed time.Duration
	}
	wait := func(c client, query string) <-chan result {
		ch := make(chan result, 1)
		go func() {
			start := time.Now()
			_, v := f.call(c, "GET", "/api/chats/"+chat+"/wait?"+query, nil)
			ch <- result{v, time.Since(start)}
		}()
		time.Sleep(400 * time.Millisecond) // the wait is now holding
		return ch
	}

	// A new message ends the captain's wait straight away.
	pending := wait(captain, "after=0&seen=0&typing=0")
	code, sent := f.call(rider, "POST", "/api/chats/"+chat+"/messages", map[string]any{"client_id": newUUID(), "body": "Where are you?"})
	require(t, code, 201)
	got := <-pending
	if got.elapsed > 2*time.Second || len(msgs(got.view)) != 1 || msgs(got.view)[0]["body"] != "Where are you?" {
		t.Fatalf("message should arrive within ~1 s, took %v: %#v", got.elapsed, got.view)
	}
	after := idOf(sent)

	// Typing ends the rider's wait, and shows on the captain.
	pending = wait(rider, "after="+after+"&seen=0&typing=0")
	require(t, mustCall(f, captain, "/api/chats/"+chat+"/typing", map[string]any{}), 200)
	got = <-pending
	typing := false
	for _, p := range got.view["participants"].([]any) {
		if p := p.(map[string]any); p["role"] == "captain" {
			typing = p["typing"] == true
		}
	}
	if got.elapsed > 2*time.Second || !typing {
		t.Fatalf("typing should arrive quickly, took %v typing=%v", got.elapsed, typing)
	}

	// The captain reading the message ends the rider's wait with "Seen".
	pending = wait(rider, "after="+after+"&seen=0&typing=1")
	require(t, mustCall(f, captain, "/api/chats/"+chat+"/read", map[string]any{"message_id": sent["id"]}), 200)
	got = <-pending
	if got.elapsed > 2*time.Second {
		t.Fatalf("read receipt took %v", got.elapsed)
	}

	// Nothing new: the wait holds for the full period and returns the current state.
	f.s.Cache.Del(context.Background(), typingKey(chat, captain.id))
	start := time.Now()
	code, idle := f.call(rider, "GET", "/api/chats/"+chat+"/wait?after="+after+"&seen="+after+"&typing=0", nil)
	require(t, code, 200)
	if held := time.Since(start); held < chatWaitHold-time.Second || len(msgs(idle)) != 0 {
		t.Fatalf("idle wait should hold ~%v, held %v with %d messages", chatWaitHold, held, len(msgs(idle)))
	}
}

func TestRideChatClosesAfterTheTripAndAlertsPhones(t *testing.T) {
	f := setup(t)
	rider, captain, ride, chat := chatRide(t, f)
	ctx := context.Background()
	if _, e := f.s.DB.Exec(ctx, "INSERT INTO android_push_tokens(token,account_id,app) VALUES($1,$2,'captain')", "test-token-"+newUUID(), captain.id); e != nil {
		t.Fatal(e)
	}

	// A message to a captain with a phone registered queues a delayed alert, with the rider's name.
	cid := newUUID()
	code, sent := f.call(rider, "POST", "/api/chats/"+chat+"/messages", map[string]any{"client_id": cid, "body": "Please come to gate 2"})
	require(t, code, 201)
	var kind, ref string
	var delayed bool
	if e := f.s.DB.QueryRow(ctx, "SELECT kind,ref,lease_until>now() FROM push_outbox WHERE account_id=$1 ORDER BY id DESC LIMIT 1", captain.id).Scan(&kind, &ref, &delayed); e != nil {
		t.Fatal(e)
	}
	if kind != "chat" || ref != idOf(sent) || !delayed {
		t.Fatalf("expected a delayed chat alert, got %s %s delayed=%v", kind, ref, delayed)
	}
	msg, ok := f.s.composePush(ctx, f.s.DB, pushJob{kind: "chat", ref: ref, account: captain.id})
	if !ok || msg.Title != "Test sent a message" || msg.Body != "Please come to gate 2" || msg.Tag != "chat-"+chat {
		t.Fatalf("alert text %#v ok=%v", msg, ok)
	}
	// Read in the app before the alert went out: no alert.
	require(t, mustCall(f, captain, "/api/chats/"+chat+"/read", map[string]any{"message_id": sent["id"]}), 200)
	if _, ok = f.s.composePush(ctx, f.s.DB, pushJob{kind: "chat", ref: ref, account: captain.id}); ok {
		t.Fatal("a message already read must not alert")
	}
	// The sender never gets an alert for their own message.
	var own int
	f.s.DB.QueryRow(ctx, "SELECT count(*) FROM push_outbox WHERE account_id=$1 AND kind='chat'", rider.id).Scan(&own)
	if own != 0 {
		t.Fatal("sender must not be alerted")
	}

	// Completed: open for 30 minutes (lost items), then closed. Retrying a stored message still succeeds.
	f.s.DB.Exec(ctx, "UPDATE rides SET status='completed',completed_at=now()-interval '5 minutes' WHERE id=$1", ride)
	code, _ = f.call(captain, "POST", "/api/chats/"+chat+"/messages", map[string]any{"client_id": newUUID(), "body": "Did you leave a bag?"})
	require(t, code, 201)
	f.s.DB.Exec(ctx, "UPDATE rides SET completed_at=now()-interval '31 minutes' WHERE id=$1", ride)
	code, out := f.call(rider, "POST", "/api/chats/"+chat+"/messages", map[string]any{"client_id": newUUID(), "body": "Yes!"})
	if code != 409 || out["error"] != "This trip has ended, so chat is closed." {
		t.Fatalf("closed chat: %d %#v", code, out)
	}
	code, _ = f.call(rider, "POST", "/api/chats/"+chat+"/messages", map[string]any{"client_id": cid, "body": "Please come to gate 2"})
	require(t, code, 200)
	code, view := f.call(rider, "GET", "/api/chats/"+chat, nil)
	require(t, code, 200)
	if view["can_post"] != false || view["closed_reason"] != "This trip has ended, so chat is closed." || len(msgs(view)) != 2 {
		t.Fatalf("history stays readable after closing: %#v", view)
	}
	// Typing in a closed chat is ignored.
	code, typed := f.call(rider, "POST", "/api/chats/"+chat+"/typing", map[string]any{})
	if code != 200 || typed["ok"] != false {
		t.Fatalf("typing in a closed chat: %d %#v", code, typed)
	}

	// Cancelled rides close straight away.
	r2, c2, ride2, chat2 := chatRide(t, f)
	_ = c2
	f.s.DB.Exec(ctx, "UPDATE rides SET status='cancelled' WHERE id=$1", ride2)
	code, out = f.call(r2, "POST", "/api/chats/"+chat2+"/messages", map[string]any{"client_id": newUUID(), "body": "hello"})
	if code != 409 || out["error"] != "This ride was cancelled, so chat is closed." {
		t.Fatalf("cancelled ride chat: %d %#v", code, out)
	}
}

// Migration 040 copies existing ride chat into the new tables, marked as read.
func TestChatMigrationCopiesRideMessages(t *testing.T) {
	f := setup(t)
	rider, captain := f.actor("rider", false), f.actor("rider", true)
	ride := f.book(rider, f.quote(rider))
	f.offerTo(captain, ride)
	require(t, f.act(captain, ride, "accept", 1, ""), 200)
	ctx := context.Background()
	// Undo 040, write messages the old way, then run 040 again.
	undo := `DROP TABLE chat_messages, chat_participants, chat_conversations CASCADE;
 DROP FUNCTION hop_chat_message(); DROP FUNCTION hop_chat_read();
 DELETE FROM push_outbox WHERE kind='chat';
 ALTER TABLE push_outbox DROP CONSTRAINT push_outbox_kind_check;
 ALTER TABLE push_outbox ADD CONSTRAINT push_outbox_kind_check CHECK (kind IN ('offer','ride','notification'));
 DELETE FROM schema_migrations WHERE version=40;`
	if _, e := f.s.DB.Exec(ctx, undo); e != nil {
		t.Fatal(e)
	}
	for i, m := range []struct{ from, body string }{{rider.id, "At the gate"}, {captain.id, "Coming"}, {rider.id, "Thanks"}} {
		if _, e := f.s.DB.Exec(ctx, "INSERT INTO ride_messages(ride_id,sender_id,body,created_at) VALUES($1,$2,$3,now()-make_interval(mins=>10-$4))", ride, m.from, m.body, i); e != nil {
			t.Fatal(e)
		}
	}
	migration, e := os.ReadFile("../../migrations/040_chat.sql")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = f.s.DB.Exec(ctx, string(migration)); e != nil {
		t.Fatalf("re-running 040: %v", e)
	}
	code, out := f.call(captain, "GET", "/api/rides/"+ride+"/messages", nil)
	require(t, code, 200)
	got := msgs(out)
	if len(got) != 3 || got[0]["body"] != "At the gate" || got[0]["mine"] != false || got[1]["mine"] != true || got[2]["body"] != "Thanks" {
		t.Fatalf("copied messages wrong: %#v", got)
	}
	_, st := f.call(captain, "GET", "/api/state", nil)
	for _, r := range st["rides"].([]any) {
		if r := r.(map[string]any); r["id"] == ride && r["chat_unread"] != float64(0) {
			t.Fatalf("copied messages should count as read, got %v unread", r["chat_unread"])
		}
	}
	var alerts int
	f.s.DB.QueryRow(ctx, "SELECT count(*) FROM push_outbox WHERE kind='chat'").Scan(&alerts)
	if alerts != 0 {
		t.Fatal("copying old messages must not send alerts")
	}
}
