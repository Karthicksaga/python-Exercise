package app

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

// eventHub fans database change signals out to the open streams of this instance. One LISTEN connection
// serves every connected user, so database load no longer grows with the number of streams.
type eventHub struct {
	mu   sync.RWMutex
	subs map[string]map[chan struct{}]struct{}
}

func newEventHub() *eventHub { return &eventHub{subs: map[string]map[chan struct{}]struct{}{}} }

// subscribe returns a coalescing wake-up channel for an account and a function that unsubscribes.
func (h *eventHub) subscribe(uid string) (<-chan struct{}, func()) {
	ch := make(chan struct{}, 1)
	h.mu.Lock()
	if h.subs[uid] == nil {
		h.subs[uid] = map[chan struct{}]struct{}{}
	}
	h.subs[uid][ch] = struct{}{}
	h.mu.Unlock()
	return ch, func() {
		h.mu.Lock()
		delete(h.subs[uid], ch)
		if len(h.subs[uid]) == 0 {
			delete(h.subs, uid)
		}
		h.mu.Unlock()
	}
}

func (h *eventHub) wake(uid string) {
	h.mu.RLock()
	for ch := range h.subs[uid] {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
	h.mu.RUnlock()
}

func (h *eventHub) wakeAll() {
	h.mu.RLock()
	for _, set := range h.subs {
		for ch := range set {
			select {
			case ch <- struct{}{}:
			default:
			}
		}
	}
	h.mu.RUnlock()
}

// RunEvents listens for hop_events notifications until the context ends. It needs a direct (non-pooled)
// PostgreSQL connection: set DATABASE_LISTEN_URL when DATABASE_URL points at a transaction-mode pooler.
// After any reconnect every stream is woken once so nothing is missed.
func (s *Server) RunEvents(ctx context.Context) {
	url := s.Config.ListenURL
	if url == "" {
		url = s.Config.DatabaseURL
	}
	backoff := time.Second
	for ctx.Err() == nil {
		e := s.listenOnce(ctx, url)
		if ctx.Err() != nil {
			return
		}
		slog.Error("event listener stopped; reconnecting", "error", e)
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < 15*time.Second {
			backoff *= 2
		}
	}
}

func (s *Server) listenOnce(ctx context.Context, url string) error {
	conn, e := pgx.Connect(ctx, url)
	if e != nil {
		return e
	}
	defer conn.Close(context.Background())
	if _, e = conn.Exec(ctx, "LISTEN hop_events"); e != nil {
		return e
	}
	s.Events.wakeAll()
	for {
		n, e := conn.WaitForNotification(ctx)
		if e != nil {
			return e
		}
		s.Events.wake(n.Payload)
	}
}
