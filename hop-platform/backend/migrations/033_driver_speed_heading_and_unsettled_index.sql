-- Add speed and heading to drivers for real-time navigation telemetry
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS speed double precision DEFAULT 0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS heading double precision DEFAULT 0;

-- Index to quickly check if a rider has an outstanding unsettled completed ride
CREATE INDEX IF NOT EXISTS idx_rides_rider_unsettled ON rides(rider_id) 
WHERE status = 'completed' AND payment_status NOT IN ('paid_online', 'driver_reported_received');

INSERT INTO schema_migrations(version) VALUES(33);

-- Rollback strategy:
-- DROP INDEX IF EXISTS idx_rides_rider_unsettled;
-- ALTER TABLE drivers DROP COLUMN IF EXISTS heading;
-- ALTER TABLE drivers DROP COLUMN IF EXISTS speed;
-- DELETE FROM schema_migrations WHERE version = 33;
