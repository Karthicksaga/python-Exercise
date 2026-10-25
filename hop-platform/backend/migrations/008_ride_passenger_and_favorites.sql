ALTER TABLE rides
    ADD COLUMN passenger_name text NOT NULL DEFAULT '' CHECK (length(passenger_name) <= 80),
    ADD COLUMN passenger_phone text NOT NULL DEFAULT '' CHECK (passenger_phone ~ '^([6-9][0-9]{9})?$'),
    ADD COLUMN favorite_first_until timestamptz;

INSERT INTO schema_migrations(version) VALUES(8);
