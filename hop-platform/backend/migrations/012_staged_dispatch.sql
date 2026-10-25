ALTER TABLE rides ADD COLUMN dispatch_stage integer NOT NULL DEFAULT 0, ADD COLUMN dispatch_at timestamptz;
CREATE TABLE ride_offers (
    ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    driver_id uuid NOT NULL REFERENCES drivers(user_id) ON DELETE CASCADE,
    stage integer NOT NULL,
    score double precision NOT NULL,
    eta_seconds integer NOT NULL,
    offered_at timestamptz NOT NULL DEFAULT now(),
    outcome text CHECK (outcome IN ('accepted', 'missed')),
    PRIMARY KEY (ride_id, driver_id)
);
CREATE INDEX ride_offers_driver_recent ON ride_offers(driver_id, offered_at DESC);
CREATE INDEX drivers_geo ON drivers(lat, lng) WHERE online AND status = 'approved';

INSERT INTO schema_migrations(version) VALUES(12);
