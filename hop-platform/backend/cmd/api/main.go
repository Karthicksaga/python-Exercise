package main

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"hop/internal/app"
)

func main() {
	if e := run(); e != nil {
		slog.Error("startup failed", "error", e)
		os.Exit(1)
	}
}
func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		client := &http.Client{Timeout: 3 * time.Second}
		address := os.Getenv("ADDRESS")
		if address == "" {
			address = ":8080"
		}
		_, port, err := net.SplitHostPort(address)
		if err != nil {
			return err
		}
		response, err := client.Get("http://127.0.0.1:" + port + "/readyz")
		if err != nil {
			return err
		}
		defer response.Body.Close()
		if response.StatusCode != 200 {
			return fmt.Errorf("not ready")
		}
		return nil
	}
	if len(os.Args) > 1 {
		return command(ctx, os.Args[1:])
	}
	config, e := app.ConfigFromEnv()
	if e != nil {
		return e
	}
	s, e := app.New(ctx, config)
	if e != nil {
		return e
	}
	defer s.Close()
	httpServer := &http.Server{Addr: config.Address, Handler: s.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 * 1024}
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				job, cancel := context.WithTimeout(ctx, 5*time.Second)
				if e := s.Expire(job); e != nil {
					slog.Error("ride expiration failed")
				}
				cancel()
			}
		}
	}()
	errors := make(chan error, 1)
	go func() { slog.Info("API listening", "address", config.Address); errors <- httpServer.ListenAndServe() }()
	select {
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return httpServer.Shutdown(shutdown)
	case e := <-errors:
		if e == http.ErrServerClosed {
			return nil
		}
		return e
	}
}
func command(ctx context.Context, args []string) error {
	db, e := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if e != nil {
		return e
	}
	defer db.Close()
	switch args[0] {
	case "migrate":
		data, e := os.ReadFile("migrations/001_initial.sql")
		if e != nil {
			return e
		}
		tx, e := db.Begin(ctx)
		if e != nil {
			return e
		}
		defer tx.Rollback(ctx)
		if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(704001)"); e != nil {
			return e
		}
		var exists bool
		if e = tx.QueryRow(ctx, "SELECT to_regclass('public.schema_migrations') IS NOT NULL").Scan(&exists); e != nil {
			return e
		}
		if exists {
			var version int
			if e = tx.QueryRow(ctx, "SELECT COALESCE(max(version),0) FROM schema_migrations").Scan(&version); e != nil {
				return e
			}
			if version >= 1 {
				fmt.Println("Schema already current")
				return nil
			}
		}
		if _, e = tx.Exec(ctx, string(data)); e != nil {
			return e
		}
		if e = tx.Commit(ctx); e != nil {
			return e
		}
		fmt.Println("Applied migration 001")
		return nil
	case "promote-operator":
		if len(args) != 2 {
			return fmt.Errorf("usage: api promote-operator <account UUID>; account must sign in first")
		}
		tx, e := db.Begin(ctx)
		if e != nil {
			return e
		}
		defer tx.Rollback(ctx)
		tag, e := tx.Exec(ctx, "UPDATE accounts SET role='operator' WHERE id=$1", args[1])
		if e != nil {
			return e
		}
		if tag.RowsAffected() != 1 {
			return fmt.Errorf("account not found")
		}
		if _, e = tx.Exec(ctx, "INSERT INTO audit_events(action,detail) VALUES('operator_promoted',jsonb_build_object('account_id',$1::text,'source','maintenance_command'))", args[1]); e != nil {
			return e
		}
		if e = tx.Commit(ctx); e != nil {
			return e
		}
		fmt.Println("Operator role assigned; require MFA at the identity provider")
		return nil
	default:
		return fmt.Errorf("unknown command")
	}
}
