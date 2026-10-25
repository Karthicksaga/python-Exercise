-- Operator-configured rental, outstation and multi-stop pricing (all optional per area/category).
ALTER TABLE area_vehicle_pricing
    ADD COLUMN stop_fee_paise bigint NOT NULL DEFAULT 0 CHECK (stop_fee_paise BETWEEN 0 AND 10000),
    ADD COLUMN hourly_paise bigint CHECK (hourly_paise IS NULL OR hourly_paise BETWEEN 1 AND 500000),
    ADD COLUMN included_km_per_hour integer NOT NULL DEFAULT 10 CHECK (included_km_per_hour BETWEEN 1 AND 100),
    ADD COLUMN extra_km_paise bigint NOT NULL DEFAULT 0 CHECK (extra_km_paise BETWEEN 0 AND 10000),
    ADD COLUMN outstation_per_km_paise bigint CHECK (outstation_per_km_paise IS NULL OR outstation_per_km_paise BETWEEN 1 AND 10000),
    ADD COLUMN outstation_allowance_paise bigint NOT NULL DEFAULT 0 CHECK (outstation_allowance_paise BETWEEN 0 AND 500000);

ALTER TABLE quotes
    ADD COLUMN trip_type text NOT NULL DEFAULT 'city' CHECK (trip_type IN ('city','rental','outstation')),
    ADD COLUMN stops jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(stops) = 'array' AND jsonb_array_length(stops) <= 3),
    ADD COLUMN rental_hours integer CHECK (rental_hours IS NULL OR rental_hours BETWEEN 1 AND 12),
    ADD COLUMN round_trip boolean NOT NULL DEFAULT false,
    ADD COLUMN trip_days integer NOT NULL DEFAULT 1 CHECK (trip_days BETWEEN 1 AND 10),
    ADD COLUMN breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Fare negotiation: the rider may bid, drivers may counter, and the rider may reserve the ride for one driver.
ALTER TABLE rides
    ADD COLUMN offered_fare_paise bigint CHECK (offered_fare_paise IS NULL OR offered_fare_paise > 0),
    ADD COLUMN reserved_driver_id uuid REFERENCES drivers(user_id),
    ADD COLUMN reserved_until timestamptz;

CREATE TABLE ride_bids (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    driver_id uuid NOT NULL REFERENCES drivers(user_id),
    amount_paise bigint NOT NULL CHECK (amount_paise > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (ride_id, driver_id)
);

-- Scheduled rides are converted into requested rides by a worker shortly before pickup.
ALTER TABLE scheduled_rides
    ADD COLUMN payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','upi')),
    ADD COLUMN dispatched_ride_id uuid REFERENCES rides(id),
    ADD COLUMN failure_reason text NOT NULL DEFAULT '';
ALTER TABLE scheduled_rides DROP CONSTRAINT scheduled_rides_status_check;
ALTER TABLE scheduled_rides ADD CONSTRAINT scheduled_rides_status_check CHECK (status IN ('scheduled','cancelled','dispatched','failed'));

INSERT INTO schema_migrations(version) VALUES(9);
