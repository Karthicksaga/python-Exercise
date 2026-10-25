-- Ending a trip before the destination adjusts the fare to the distance covered, unless the rider approves the full fare.
ALTER TABLE rides
    ADD COLUMN full_fare_status text NOT NULL DEFAULT 'none' CHECK (full_fare_status IN ('none','requested','approved','declined')),
    ADD COLUMN adjusted_from_paise bigint,
    ADD COLUMN covered_meters bigint;

INSERT INTO schema_migrations(version) VALUES(22);
