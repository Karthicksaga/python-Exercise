package app

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// Serialize role transitions for the same account across apps and API instances.
// Acquire this before any account, driver or ride row locks.
func lockJourney(ctx context.Context, tx pgx.Tx, uid string) error {
	_, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('hop-journey:' || $1, 0))", uid)
	return err
}

func ridingNow(ctx context.Context, tx pgx.Tx, uid string) (bool, error) {
	var busy bool
	err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM rides WHERE rider_id=$1
 AND (status IN ('accepted','arrived','in_progress') OR (status='requested' AND expires_at>now())))`, uid).Scan(&busy)
	return busy, err
}

const riderBusyFilter = ` AND NOT EXISTS(SELECT 1 FROM rides passenger WHERE passenger.rider_id=d.user_id
 AND (passenger.status IN ('accepted','arrived','in_progress') OR (passenger.status='requested' AND passenger.expires_at>now())))`
