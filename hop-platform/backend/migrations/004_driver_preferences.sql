ALTER TABLE drivers
    ADD COLUMN pickup_radius_meters integer NOT NULL DEFAULT 3000
        CHECK (pickup_radius_meters BETWEEN 500 AND 20000),
    ADD COLUMN minimum_fare_paise bigint NOT NULL DEFAULT 0
        CHECK (minimum_fare_paise BETWEEN 0 AND 1000000);

INSERT INTO schema_migrations(version) VALUES(4);
