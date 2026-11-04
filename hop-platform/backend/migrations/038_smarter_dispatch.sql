-- Smarter captain matching (Nov 2026).
-- 1. Exclusive offers: each offer has its own expiry, and a captain holds at most one live offer,
--    so a request goes to one captain at a time instead of a race between three.
-- 2. "Next ride": a captain about to finish a trip near a new pickup can accept it as their next
--    ride. The ride stays requested and reserved for them (reserved_driver_id/reserved_until, as
--    negotiated fares already do) and becomes theirs the moment they complete the current trip.
-- 3. dispatch_due: when a ride's next offer round is due (waits vary by round and by how likely
--    the offered captain is to accept; a decline makes it due at once).
ALTER TABLE ride_offers ADD COLUMN kind text NOT NULL DEFAULT 'now' CHECK (kind IN ('now','next')),
 ADD COLUMN expires_at timestamptz;
ALTER TABLE ride_offers DROP CONSTRAINT IF EXISTS ride_offers_eta_source_check;
ALTER TABLE ride_offers ADD CONSTRAINT ride_offers_eta_source_check CHECK (eta_source IN ('estimate','road','next'));
CREATE INDEX ride_offers_live ON ride_offers(driver_id) WHERE outcome IS NULL;
ALTER TABLE rides ADD COLUMN next_driver_id uuid REFERENCES drivers(user_id), ADD COLUMN dispatch_due timestamptz;
CREATE UNIQUE INDEX one_next_ride ON rides(next_driver_id) WHERE status='requested' AND next_driver_id IS NOT NULL;

INSERT INTO schema_migrations(version) VALUES(38);
