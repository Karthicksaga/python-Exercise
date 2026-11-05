package app

import (
	"context"
	"crypto/rand"
	"fmt"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

// Chat for any feature. A conversation belongs to something (kind + ref, e.g. "ride" + ride id) and has
// participants with roles. The endpoints under /api/chats work the same for every kind; a chatPolicy per
// kind decides who may post and when. To add chat to a new feature: register a policy below and create
// the conversation with openConversation when the feature needs it.
//
// Delivery: GET /api/chats/{id}/wait holds the request (long polling) until something changes, woken by
// the database triggers in migration 040 through the event hub, so it works across API instances and
// through the native HTTP plugin. Phones that aren't looking get a push (composePush, kind "chat").

const (
	chatMaxBody   = 1000
	chatPageSize  = 50
	chatWaitHold  = 10 * time.Second // under the mobile client's 12 s request timeout
	chatTypingTTL = 6 * time.Second
)

type chatPolicy interface {
	// postable says whether uid may post in the conversation now, and why not.
	postable(ctx context.Context, s *Server, ref, uid string) (bool, string, error)
}

var chatPolicies = map[string]chatPolicy{
	"ride": rideChatPolicy{},
}

type chatParticipant struct {
	Role       string `json:"role"`
	Name       string `json:"name"`
	Me         bool   `json:"me"`
	LastReadID int64  `json:"last_read_id"`
	Typing     bool   `json:"typing"`
}

type chatMsg struct {
	ID       int64   `json:"id"`
	Body     string  `json:"body"`
	Mine     bool    `json:"mine"`
	System   bool    `json:"system"`
	Sender   string  `json:"sender_role"`
	ClientID *string `json:"client_id"`
	SentAt   string  `json:"sent_at"`
}

type chatView struct {
	ID            string            `json:"id"`
	Kind          string            `json:"kind"`
	Ref           string            `json:"ref"`
	CanPost       bool              `json:"can_post"`
	ClosedReason  string            `json:"closed_reason,omitempty"`
	LastMessageID int64             `json:"last_message_id"`
	Unread        int               `json:"unread"`
	Participants  []chatParticipant `json:"participants"`
	Messages      []chatMsg         `json:"messages"`
	HasMore       bool              `json:"has_more"`
}

// openConversation returns the conversation for kind+ref, creating it, and adds the participants
// (account id → role). Safe to call repeatedly.
func openConversation(ctx context.Context, tx pgx.Tx, kind, ref string, members map[string]string) (string, error) {
	var id string
	if e := tx.QueryRow(ctx, `INSERT INTO chat_conversations(kind,ref) VALUES($1,$2)
 ON CONFLICT (kind,ref) DO UPDATE SET kind=EXCLUDED.kind RETURNING id`, kind, ref).Scan(&id); e != nil {
		return "", e
	}
	for account, role := range members {
		if _, e := tx.Exec(ctx, `INSERT INTO chat_participants(conversation_id,account_id,role,last_read_id)
 VALUES($1,$2,$3,(SELECT last_message_id FROM chat_conversations WHERE id=$1)) ON CONFLICT DO NOTHING`, id, account, role); e != nil {
			return "", e
		}
	}
	return id, nil
}

// cleanChatBody drops control characters (keeping new lines) and trims; ok is false when it's empty or too long.
func cleanChatBody(raw string) (string, bool) {
	body := strings.TrimSpace(strings.Map(func(c rune) rune {
		if unicode.IsControl(c) && c != '\n' {
			return -1
		}
		return c
	}, raw))
	n := utf8.RuneCountInString(body)
	return body, n >= 1 && n <= chatMaxBody
}

// member loads a conversation the caller belongs to. ok is false (and a 404 was written) otherwise.
func (s *Server) chatMember(w http.ResponseWriter, r *http.Request, id string) (kind, ref string, ok bool) {
	uid := user(r).Account.ID
	e := s.DB.QueryRow(r.Context(), `SELECT c.kind,c.ref FROM chat_conversations c JOIN chat_participants p ON p.conversation_id=c.id AND p.account_id=$2
 WHERE c.id=$1::uuid`, id, uid).Scan(&kind, &ref)
	if e != nil {
		if !errors.Is(e, pgx.ErrNoRows) && !strings.Contains(e.Error(), "uuid") {
			dbError(w, e)
			return "", "", false
		}
		fail(w, 404, "Conversation not found")
		return "", "", false
	}
	return kind, ref, true
}

func (s *Server) chatPostable(ctx context.Context, kind, ref, uid string) (bool, string, error) {
	p, known := chatPolicies[kind]
	if !known {
		return false, "This conversation is read-only.", nil
	}
	return p.postable(ctx, s, ref, uid)
}

func typingKey(conversation, account string) string { return "chat:typing:" + conversation + ":" + account }

// view builds what a participant sees: who's in it, read and typing state, and a page of messages.
// after>0 returns messages newer than it; before>0 returns the page older than it; neither returns the latest page.
func (s *Server) chatView(ctx context.Context, id, kind, ref, uid string, after, before int64) (chatView, error) {
	v := chatView{ID: id, Kind: kind, Ref: ref, Participants: []chatParticipant{}, Messages: []chatMsg{}}
	ok, reason, e := s.chatPostable(ctx, kind, ref, uid)
	if e != nil {
		return v, e
	}
	v.CanPost, v.ClosedReason = ok, reason
	var myRead int64
	if e = s.DB.QueryRow(ctx, `SELECT c.last_message_id,p.last_read_id,
 (SELECT count(*) FROM chat_messages m WHERE m.conversation_id=c.id AND m.id>p.last_read_id AND m.sender_id IS DISTINCT FROM p.account_id)::int
 FROM chat_conversations c JOIN chat_participants p ON p.conversation_id=c.id AND p.account_id=$2 WHERE c.id=$1`, id, uid).Scan(&v.LastMessageID, &myRead, &v.Unread); e != nil {
		return v, e
	}
	rows, e := s.DB.Query(ctx, `SELECT p.account_id::text,p.role,split_part(a.name,' ',1),p.last_read_id FROM chat_participants p JOIN accounts a ON a.id=p.account_id
 WHERE p.conversation_id=$1 ORDER BY p.joined_at`, id)
	if e != nil {
		return v, e
	}
	var others []string
	for rows.Next() {
		var account string
		var p chatParticipant
		if e = rows.Scan(&account, &p.Role, &p.Name, &p.LastReadID); e != nil {
			rows.Close()
			return v, e
		}
		p.Me = account == uid
		if !p.Me {
			others = append(others, account)
		}
		v.Participants = append(v.Participants, p)
	}
	rows.Close()
	if s.Cache != nil && len(others) > 0 {
		keys := make([]string, len(others))
		for i, account := range others {
			keys[i] = typingKey(id, account)
		}
		if typing, e := s.Cache.MGet(ctx, keys...).Result(); e == nil {
			j := 0
			for i := range v.Participants {
				if !v.Participants[i].Me {
					v.Participants[i].Typing = typing[j] != nil
					j++
				}
			}
		}
	}
	query := `SELECT id,body,sender_id IS NOT DISTINCT FROM $2::uuid,sender_id IS NULL,COALESCE(p.role,''),client_id::text,
 to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
 FROM chat_messages m LEFT JOIN chat_participants p ON p.conversation_id=m.conversation_id AND p.account_id=m.sender_id WHERE m.conversation_id=$1`
	args := []any{id, uid}
	switch {
	case after > 0:
		query += ` AND m.id>$3 ORDER BY m.id LIMIT $4`
		args = append(args, after, chatPageSize*4+1)
	case before > 0:
		query += ` AND m.id<$3 ORDER BY m.id DESC LIMIT $4`
		args = append(args, before, chatPageSize+1)
	default:
		query += ` ORDER BY m.id DESC LIMIT $3`
		args = append(args, chatPageSize+1)
	}
	rows, e = s.DB.Query(ctx, query, args...)
	if e != nil {
		return v, e
	}
	defer rows.Close()
	for rows.Next() {
		var m chatMsg
		if e = rows.Scan(&m.ID, &m.Body, &m.Mine, &m.System, &m.Sender, &m.ClientID, &m.SentAt); e != nil {
			return v, e
		}
		v.Messages = append(v.Messages, m)
	}
	if e = rows.Err(); e != nil {
		return v, e
	}
	limit := chatPageSize
	if after > 0 {
		limit = chatPageSize * 4
	}
	if len(v.Messages) > limit {
		v.HasMore = true
		v.Messages = v.Messages[:limit]
	}
	if after <= 0 { // fetched newest first; show oldest first
		for i, j := 0, len(v.Messages)-1; i < j; i, j = i+1, j-1 {
			v.Messages[i], v.Messages[j] = v.Messages[j], v.Messages[i]
		}
	}
	return v, nil
}

// ---- Endpoints -------------------------------------------------------------------------------------------

// listChats is the inbox: the caller's conversations, newest activity first.
func (s *Server) listChats(w http.ResponseWriter, r *http.Request) {
	uid := user(r).Account.ID
	rows, e := jsonRows(r.Context(), s.DB, `SELECT c.id,c.kind,c.ref,p.role,c.last_message_id,
 (SELECT count(*) FROM chat_messages m WHERE m.conversation_id=c.id AND m.id>p.last_read_id AND m.sender_id IS DISTINCT FROM p.account_id)::int AS unread,
 (SELECT json_build_object('body',m.body,'mine',m.sender_id IS NOT DISTINCT FROM p.account_id,'sent_at',m.created_at) FROM chat_messages m WHERE m.id=c.last_message_id) AS last_message,
 (SELECT json_agg(json_build_object('role',o.role,'name',split_part(a.name,' ',1))) FROM chat_participants o JOIN accounts a ON a.id=o.account_id
   WHERE o.conversation_id=c.id AND o.account_id<>p.account_id) AS others
 FROM chat_participants p JOIN chat_conversations c ON c.id=p.conversation_id WHERE p.account_id=$1
 ORDER BY c.last_message_id DESC, c.created_at DESC LIMIT 50`, uid)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]any{"conversations": rows})
}

func (s *Server) getChat(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	kind, ref, ok := s.chatMember(w, r, id)
	if !ok {
		return
	}
	after, _ := strconv.ParseInt(r.URL.Query().Get("after"), 10, 64)
	before, _ := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64)
	v, e := s.chatView(r.Context(), id, kind, ref, user(r).Account.ID, after, before)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, v)
}

// waitChat returns as soon as there are messages after ?after=, someone else has read past ?seen=, typing
// changed from ?typing= (1/0), or the conversation opened or closed versus ?open= (1/0); otherwise it holds
// for up to 10 seconds and returns the latest state.
func (s *Server) waitChat(w http.ResponseWriter, r *http.Request) {
	id, uid := r.PathValue("id"), user(r).Account.ID
	if !s.limit(w, r, "chatwait:"+uid, 120, 60) {
		return
	}
	kind, ref, ok := s.chatMember(w, r, id)
	if !ok {
		return
	}
	q := r.URL.Query()
	after, _ := strconv.ParseInt(q.Get("after"), 10, 64)
	seen, _ := strconv.ParseInt(q.Get("seen"), 10, 64)
	typingBefore := q.Get("typing") == "1"
	openBefore := q.Get("open")
	// Subscribe before looking, so a change between the look and the wait still wakes us.
	wake, unsubscribe := s.Events.subscribe(uid)
	defer unsubscribe()
	ctx, cancel := context.WithTimeout(r.Context(), chatWaitHold)
	defer cancel()
	for {
		v, e := s.chatView(r.Context(), id, kind, ref, uid, after, 0)
		if e != nil {
			if r.Context().Err() != nil {
				return
			}
			dbError(w, e)
			return
		}
		changed := len(v.Messages) > 0
		typing := false
		for _, p := range v.Participants {
			if !p.Me {
				changed = changed || p.LastReadID > seen
				typing = typing || p.Typing
			}
		}
		changed = changed || typing != typingBefore || (openBefore != "" && (openBefore == "1") != v.CanPost)
		if changed {
			write(w, 200, v)
			return
		}
		select {
		case <-wake:
		case <-ctx.Done():
			if r.Context().Err() != nil {
				return // the client went away
			}
			write(w, 200, v)
			return
		}
	}
}

func (s *Server) postChat(w http.ResponseWriter, r *http.Request) {
	id, uid := r.PathValue("id"), user(r).Account.ID
	var in struct {
		ClientID string `json:"client_id"`
		Body     string `json:"body"`
	}
	if !decode(w, r, &in) {
		return
	}
	body, valid := cleanChatBody(in.Body)
	if !valid {
		fail(w, 400, "Write a message of 1 to 1000 characters")
		return
	}
	if len(in.ClientID) != 36 {
		fail(w, 400, "Each message needs a client_id (a UUID made by the sending device)")
		return
	}
	kind, ref, ok := s.chatMember(w, r, id)
	if !ok {
		return
	}
	m, created, status, e := s.sendChat(r.Context(), w, r, id, kind, ref, uid, in.ClientID, body)
	if e != nil || status != 0 {
		return
	}
	code := 201
	if !created {
		code = 200 // a retry of a message already stored
	}
	write(w, code, m)
}

// sendChat stores a message once per client id. It writes the error response itself and reports a non-zero
// status when it did.
func (s *Server) sendChat(ctx context.Context, w http.ResponseWriter, r *http.Request, id, kind, ref, uid, clientID, body string) (chatMsg, bool, int, error) {
	m := chatMsg{Mine: true}
	// A retry of a stored message succeeds even if the conversation closed meanwhile.
	e := s.DB.QueryRow(ctx, `SELECT m.id,m.body,p.role,m.client_id::text,to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
 FROM chat_messages m JOIN chat_participants p ON p.conversation_id=m.conversation_id AND p.account_id=m.sender_id
 WHERE m.conversation_id=$1 AND m.sender_id=$2 AND m.client_id=$3::uuid`, id, uid, clientID).Scan(&m.ID, &m.Body, &m.Sender, &m.ClientID, &m.SentAt)
	if e == nil {
		return m, false, 0, nil
	}
	if !errors.Is(e, pgx.ErrNoRows) {
		if strings.Contains(e.Error(), "uuid") {
			fail(w, 400, "client_id must be a UUID")
			return m, false, 400, nil
		}
		dbError(w, e)
		return m, false, 500, e
	}
	ok, reason, e := s.chatPostable(ctx, kind, ref, uid)
	if e != nil {
		dbError(w, e)
		return m, false, 500, e
	}
	if !ok {
		fail(w, 409, reason)
		return m, false, 409, nil
	}
	if !s.limit(w, r, "chat:"+uid, 40, 60) {
		return m, false, 429, nil
	}
	e = s.DB.QueryRow(ctx, `WITH ins AS (INSERT INTO chat_messages(conversation_id,sender_id,client_id,body) VALUES($1,$2,$3::uuid,$4)
 ON CONFLICT (conversation_id,sender_id,client_id) WHERE client_id IS NOT NULL DO UPDATE SET body=chat_messages.body RETURNING id,body,client_id::text,created_at)
 SELECT ins.id,ins.body,p.role,ins.client_id,to_char(ins.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
 FROM ins JOIN chat_participants p ON p.conversation_id=$1 AND p.account_id=$2`, id, uid, clientID, body).Scan(&m.ID, &m.Body, &m.Sender, &m.ClientID, &m.SentAt)
	if e != nil {
		dbError(w, e)
		return m, false, 500, e
	}
	// Sending implies reading everything before it.
	_, _ = s.DB.Exec(ctx, "UPDATE chat_participants SET last_read_id=$3 WHERE conversation_id=$1 AND account_id=$2 AND last_read_id<$3", id, uid, m.ID)
	if s.Cache != nil {
		s.Cache.Del(ctx, typingKey(id, uid))
	}
	return m, true, 0, nil
}

func (s *Server) readChat(w http.ResponseWriter, r *http.Request) {
	id, uid := r.PathValue("id"), user(r).Account.ID
	var in struct {
		MessageID int64 `json:"message_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	if _, _, ok := s.chatMember(w, r, id); !ok {
		return
	}
	// Only forward, and never past the newest message.
	if _, e := s.DB.Exec(r.Context(), `UPDATE chat_participants p SET last_read_id=LEAST($3,c.last_message_id) FROM chat_conversations c
 WHERE p.conversation_id=$1 AND p.account_id=$2 AND c.id=p.conversation_id AND p.last_read_id<LEAST($3,c.last_message_id)`, id, uid, in.MessageID); e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}

// typingChat marks the caller as typing for a few seconds and wakes the others.
func (s *Server) typingChat(w http.ResponseWriter, r *http.Request) {
	id, uid := r.PathValue("id"), user(r).Account.ID
	if !s.limit(w, r, "chattyping:"+uid, 30, 60) {
		return
	}
	if !decode(w, r, &struct{}{}) {
		return
	}
	kind, ref, ok := s.chatMember(w, r, id)
	if !ok {
		return
	}
	if can, _, e := s.chatPostable(r.Context(), kind, ref, uid); e != nil || !can {
		write(w, 200, map[string]bool{"ok": false})
		return
	}
	if s.Cache != nil {
		if e := s.Cache.Set(r.Context(), typingKey(id, uid), "1", chatTypingTTL).Err(); e != nil {
			fail(w, 503, "Service unavailable; retry shortly")
			return
		}
	}
	// pg_notify reaches every API instance, so the others' open waits return.
	_, _ = s.DB.Exec(r.Context(), `SELECT pg_notify('hop_events',account_id::text) FROM chat_participants WHERE conversation_id=$1 AND account_id<>$2`, id, uid)
	write(w, 200, map[string]bool{"ok": true})
}

// ---- Ride chat -------------------------------------------------------------------------------------------

// Riders and captains can message from acceptance until the trip ends, and for a short while after a
// completed trip (for lost items and pickup questions).
const rideChatAfterTrip = 30 * time.Minute

type rideChatPolicy struct{}

func (rideChatPolicy) postable(ctx context.Context, s *Server, ref, uid string) (bool, string, error) {
	var status string
	var completed *time.Time
	if e := s.DB.QueryRow(ctx, "SELECT status,completed_at FROM rides WHERE id=$1::uuid", ref).Scan(&status, &completed); e != nil {
		return false, "", e
	}
	switch status {
	case "accepted", "arrived", "in_progress":
		return true, "", nil
	case "completed":
		if completed != nil && time.Since(*completed) < rideChatAfterTrip {
			return true, "", nil
		}
		return false, "This trip has ended, so chat is closed.", nil
	case "cancelled":
		return false, "This ride was cancelled, so chat is closed.", nil
	}
	return false, "Chat opens when a captain accepts your ride.", nil
}

// rideConversation opens (or finds) a ride's conversation for one of its two people.
func (s *Server) rideConversation(ctx context.Context, rideID, uid string) (string, bool, error) {
	var rider string
	var driver *string
	if e := s.DB.QueryRow(ctx, "SELECT rider_id::text,driver_id::text FROM rides WHERE id=$1::uuid", rideID).Scan(&rider, &driver); e != nil {
		if errors.Is(e, pgx.ErrNoRows) || strings.Contains(e.Error(), "uuid") {
			return "", false, nil
		}
		return "", false, e
	}
	if driver == nil || (uid != rider && uid != *driver) {
		return "", false, nil
	}
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return "", false, e
	}
	defer tx.Rollback(ctx)
	id, e := openConversation(ctx, tx, "ride", rideID, map[string]string{rider: "rider", *driver: "captain"})
	if e != nil {
		return "", false, e
	}
	return id, true, tx.Commit(ctx)
}

// openRideChat: POST /api/rides/{id}/chat → the conversation for this ride.
func (s *Server) openRideChat(w http.ResponseWriter, r *http.Request) {
	id, found, e := s.rideConversation(r.Context(), r.PathValue("id"), user(r).Account.ID)
	if e != nil {
		dbError(w, e)
		return
	}
	if !found {
		fail(w, 404, "Ride not found, or no captain has accepted it yet")
		return
	}
	write(w, 200, map[string]string{"id": id})
}

// Older app builds use /api/rides/{id}/messages. These wrap the new chat so they keep working.
func (s *Server) rideMessages(w http.ResponseWriter, r *http.Request) {
	uid := user(r).Account.ID
	id, found, e := s.rideConversation(r.Context(), r.PathValue("id"), uid)
	if e != nil {
		dbError(w, e)
		return
	}
	if !found {
		fail(w, 404, "Ride not found")
		return
	}
	after, _ := strconv.ParseInt(r.URL.Query().Get("after"), 10, 64)
	v, e := s.chatView(r.Context(), id, "ride", r.PathValue("id"), uid, after, 0)
	if e != nil {
		dbError(w, e)
		return
	}
	out := make([]map[string]any, 0, len(v.Messages))
	for _, m := range v.Messages {
		out = append(out, map[string]any{"id": m.ID, "mine": m.Mine, "body": m.Body, "sent_at": m.SentAt})
	}
	write(w, 200, map[string]any{"messages": out})
}

func (s *Server) sendRideMessage(w http.ResponseWriter, r *http.Request) {
	uid, ride := user(r).Account.ID, r.PathValue("id")
	var in struct {
		Body string `json:"body"`
	}
	if !decode(w, r, &in) {
		return
	}
	body, valid := cleanChatBody(in.Body)
	if !valid || utf8.RuneCountInString(body) > 500 {
		fail(w, 400, "Write a message of 1 to 500 characters")
		return
	}
	id, found, e := s.rideConversation(r.Context(), ride, uid)
	if e != nil {
		dbError(w, e)
		return
	}
	if !found {
		fail(w, 404, "Ride not found")
		return
	}
	m, _, status, e := s.sendChat(r.Context(), w, r, id, "ride", ride, uid, newUUID(), body)
	if e != nil || status != 0 {
		return
	}
	write(w, 201, map[string]any{"id": m.ID, "mine": true, "body": m.Body, "sent_at": m.SentAt})
}

// newUUID makes a random (version 4) UUID, for messages sent through the old endpoint.
func newUUID() string {
	b := make([]byte, 16)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	b[6], b[8] = b[6]&0x0f|0x40, b[8]&0x3f|0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}
