-- Phone OTP login (codes are stored only as HMAC digests) and online gateway payments.
CREATE TABLE phone_otps (
    phone text PRIMARY KEY CHECK (phone ~ '^[6-9][0-9]{9}$'),
    code_hash text NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_payment_status_check;
ALTER TABLE rides ADD CONSTRAINT rides_payment_status_check CHECK (payment_status IN ('unconfirmed','driver_reported_received','rider_disputed','paid_online'));

CREATE TABLE online_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id uuid NOT NULL REFERENCES rides(id),
    provider_order_id text NOT NULL UNIQUE,
    provider_payment_id text UNIQUE,
    amount_paise bigint NOT NULL CHECK (amount_paise > 0),
    status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    paid_at timestamptz
);
CREATE INDEX online_payments_ride ON online_payments(ride_id);

INSERT INTO schema_migrations(version) VALUES(10);
