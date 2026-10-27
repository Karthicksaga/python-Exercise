package main

import (
	"context"
	"fmt"
	webpush "github.com/SherClockHolmes/webpush-go"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"hop/internal/app"

	"github.com/jackc/pgx/v5/pgxpool"
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
	if len(os.Args) > 1 && os.Args[1] == "vapid-keys" {
		private, public, err := webpush.GenerateVAPIDKeys()
		if err != nil {
			return err
		}
		fmt.Printf("VAPID_PUBLIC_KEY=%s\nVAPID_PRIVATE_KEY=%s\n", public, private)
		return nil
	}
	if len(os.Args) > 1 {
		return command(ctx, os.Args[1:])
	}
	config, e := app.ConfigFromEnv()
	if e != nil {
		return e
	}
	var logHandler slog.Handler
	if config.Development {
		logHandler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	} else {
		logHandler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelInfo,
			ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
				if a.Key == slog.LevelKey {
					level, ok := a.Value.Any().(slog.Level)
					if ok {
						severity := "INFO"
						switch {
						case level >= slog.LevelError:
							severity = "ERROR"
						case level >= slog.LevelWarn:
							severity = "WARNING"
						case level >= slog.LevelInfo:
							severity = "INFO"
						default:
							severity = "DEBUG"
						}
						return slog.String("severity", severity)
					}
				}
				if a.Key == slog.MessageKey {
					return slog.String("message", a.Value.String())
				}
				return a
			},
		})
	}
	slog.SetDefault(slog.New(logHandler))
	migrate, e := startupMigrationsEnabled()
	if e != nil {
		return e
	}
	if migrate {
		// Free container hosts may not provide a separate migration job.
		// The migration transaction takes a database lock across replicas.
		migrationCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
		e = command(migrationCtx, []string{"migrate"})
		cancel()
		if e != nil {
			return fmt.Errorf("startup migration: %w", e)
		}
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
				if e := s.DispatchScheduled(job); e != nil {
					slog.Error("scheduled dispatch failed")
				}
				cancel()
			}
		}
	}()
	if e := s.HydrateLive(ctx); e != nil {
		slog.Error("live index hydration failed", "error", e)
	}
	if config.Development {
		go s.RunFleetSim(ctx)
	}
	go s.RunMediaCleanup(ctx)
	go s.RunEvents(ctx)
	go s.RunPush(ctx)
	go s.RunDispatch(ctx, func(e error) { slog.Error("staged dispatch failed", "error", e) })
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
func startupMigrationsEnabled() (bool, error) {
	value := os.Getenv("MIGRATE_ON_START")
	if value == "" {
		return false, nil
	}
	enabled, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("MIGRATE_ON_START must be true or false")
	}
	return enabled, nil
}
func command(ctx context.Context, args []string) error {
	db, e := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if e != nil {
		return e
	}
	defer db.Close()
	switch args[0] {
	case "migrate":
		return migrate(ctx, db)
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

func migrate(ctx context.Context, db *pgxpool.Pool) error {
	files, err := os.ReadDir("migrations")
	if err != nil {
		return err
	}
	applied := 0
	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".sql") {
			continue
		}
		prefix, _, ok := strings.Cut(file.Name(), "_")
		if !ok {
			return fmt.Errorf("invalid migration filename %q", file.Name())
		}
		version, err := strconv.Atoi(prefix)
		if err != nil || version < 1 {
			return fmt.Errorf("invalid migration version in %q", file.Name())
		}
		tx, err := db.Begin(ctx)
		if err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(704001)"); err != nil {
			tx.Rollback(ctx)
			return err
		}
		var exists bool
		if err = tx.QueryRow(ctx, "SELECT to_regclass('public.schema_migrations') IS NOT NULL").Scan(&exists); err != nil {
			tx.Rollback(ctx)
			return err
		}
		current := 0
		if exists {
			if err = tx.QueryRow(ctx, "SELECT COALESCE(max(version),0) FROM schema_migrations").Scan(&current); err != nil {
				tx.Rollback(ctx)
				return err
			}
		}
		if version <= current {
			tx.Rollback(ctx)
			continue
		}
		if version != current+1 {
			tx.Rollback(ctx)
			return fmt.Errorf("migration sequence gap: database is at %d, found %d", current, version)
		}
		data, err := os.ReadFile("migrations/" + file.Name())
		if err != nil {
			tx.Rollback(ctx)
			return err
		}
		if _, err = tx.Exec(ctx, string(data)); err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("migration %03d: %w", version, err)
		}
		if err = tx.Commit(ctx); err != nil {
			return err
		}
		applied++
		fmt.Printf("Applied migration %03d\n", version)
	}
	if applied == 0 {
		fmt.Println("Schema already current")
	}
	return nil
}
