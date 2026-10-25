-- Surge/peak pricing, promo codes, rider wallet, driver ledger and payouts, refunds, masked calls.

-- Surge. Auto surge follows open demand vs online supply; peak windows are recurring operator schedules;
-- overrides are one-off operator decisions (a multiplier of 1.00 suppresses surge).
ALTER TABLE areas ADD COLUMN surge_cap numeric(3,1) NOT NULL DEFAULT 2.0 CHECK (surge_cap >= 1 AND surge_cap <= 3);
ALTER TABLE areas ADD COLUMN surge_auto boolean NOT NULL DEFAULT true;

CREATE TABLE peak_windows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id uuid NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    label text NOT NULL CHECK (length(label) BETWEEN 2 AND 60),
    days smallint[] NOT NULL CHECK (cardinality(days) BETWEEN 1 AND 7),
    start_time time NOT NULL,
    end_time time NOT NULL,
    multiplier numeric(3,2) NOT NULL CHECK (multiplier > 1 AND multiplier <= 3),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (start_time < end_time)
);

CREATE TABLE surge_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id uuid NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    category text,
    multiplier numeric(3,2) NOT NULL CHECK (multiplier >= 1 AND multiplier <= 3),
    reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 200),
    starts_at timestamptz NOT NULL DEFAULT now(),
    ends_at timestamptz NOT NULL,
    created_by uuid REFERENCES accounts(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);
CREATE INDEX surge_overrides_active ON surge_overrides(area_id, ends_at);

ALTER TABLE quotes ADD COLUMN surge_multiplier numeric(3,2) NOT NULL DEFAULT 1.00;
ALTER TABLE quotes ADD COLUMN promo_code text;
ALTER TABLE quotes ADD COLUMN discount_paise bigint NOT NULL DEFAULT 0 CHECK (discount_paise >= 0);

-- Promo codes. The rider pays fare minus discount; the driver is always owed the full fare
-- (the platform funds the discount through the driver ledger).
CREATE TABLE promo_codes (
    code text PRIMARY KEY CHECK (code ~ '^[A-Z0-9]{3,20}$'),
    description text NOT NULL DEFAULT '',
    kind text NOT NULL CHECK (kind IN ('percent','flat')),
    value integer NOT NULL CHECK (value > 0),
    max_discount_paise bigint NOT NULL DEFAULT 0 CHECK (max_discount_paise >= 0),
    min_fare_paise bigint NOT NULL DEFAULT 0 CHECK (min_fare_paise >= 0),
    max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
    per_user_limit integer NOT NULL DEFAULT 1 CHECK (per_user_limit > 0),
    area_id uuid REFERENCES areas(id),
    valid_from timestamptz NOT NULL DEFAULT now(),
    valid_to timestamptz NOT NULL,
    active boolean NOT NULL DEFAULT true,
    listed boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (kind <> 'percent' OR value <= 100),
    CHECK (valid_to > valid_from)
);
CREATE TABLE promo_redemptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL REFERENCES promo_codes(code),
    rider_id uuid NOT NULL REFERENCES accounts(id),
    ride_id uuid NOT NULL UNIQUE REFERENCES rides(id),
    discount_paise bigint NOT NULL CHECK (discount_paise > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promo_redemptions_rider ON promo_redemptions(rider_id, code);

-- Rider wallet: append-only ledger, balance is the sum. Writers lock the account row first.
CREATE TABLE wallet_entries (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES accounts(id),
    amount_paise bigint NOT NULL CHECK (amount_paise <> 0),
    kind text NOT NULL CHECK (kind IN ('topup','ride_payment','refund','adjustment')),
    ride_id uuid REFERENCES rides(id),
    note text NOT NULL DEFAULT '',
    idem_key text UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wallet_entries_account ON wallet_entries(account_id, id DESC);

ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_payment_method_check;
ALTER TABLE rides ADD CONSTRAINT rides_payment_method_check CHECK (payment_method IN ('cash','upi','wallet'));

-- Gateway orders may now be wallet top-ups instead of ride payments.
ALTER TABLE online_payments ALTER COLUMN ride_id DROP NOT NULL;
ALTER TABLE online_payments ADD COLUMN account_id uuid REFERENCES accounts(id);
ALTER TABLE online_payments ADD COLUMN purpose text NOT NULL DEFAULT 'ride' CHECK (purpose IN ('ride','wallet'));
ALTER TABLE online_payments ADD CONSTRAINT online_payments_target CHECK ((purpose = 'ride' AND ride_id IS NOT NULL) OR (purpose = 'wallet' AND account_id IS NOT NULL));

-- Driver ledger: what the platform owes the driver (online/wallet fares, promo subsidies) minus payouts.
CREATE TABLE driver_ledger (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    driver_id uuid NOT NULL REFERENCES drivers(user_id),
    ride_id uuid REFERENCES rides(id),
    kind text NOT NULL CHECK (kind IN ('online_fare','promo_subsidy','payout','adjustment')),
    amount_paise bigint NOT NULL CHECK (amount_paise <> 0),
    note text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (ride_id, kind)
);
CREATE INDEX driver_ledger_driver ON driver_ledger(driver_id, id DESC);

CREATE TABLE driver_payouts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id uuid NOT NULL REFERENCES drivers(user_id),
    amount_paise bigint NOT NULL CHECK (amount_paise > 0),
    upi_id text NOT NULL,
    status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','paid','rejected')),
    reference text NOT NULL DEFAULT '',
    note text NOT NULL DEFAULT '',
    requested_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    processed_by uuid REFERENCES accounts(id)
);
CREATE INDEX driver_payouts_driver ON driver_payouts(driver_id, requested_at DESC);
CREATE UNIQUE INDEX driver_payouts_one_open ON driver_payouts(driver_id) WHERE status = 'requested';

-- Operator refunds always return to the rider's wallet.
CREATE TABLE refunds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id uuid NOT NULL REFERENCES rides(id),
    rider_id uuid NOT NULL REFERENCES accounts(id),
    amount_paise bigint NOT NULL CHECK (amount_paise > 0),
    reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 300),
    created_by uuid NOT NULL REFERENCES accounts(id),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refunds_ride ON refunds(ride_id);

-- Masked calling: the other party's real number is never returned to the client.
CREATE TABLE call_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id uuid NOT NULL REFERENCES rides(id),
    caller_id uuid NOT NULL REFERENCES accounts(id),
    callee_id uuid NOT NULL REFERENCES accounts(id),
    masked_number text NOT NULL,
    simulated boolean NOT NULL DEFAULT false,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX call_sessions_ride ON call_sessions(ride_id, created_at DESC);

INSERT INTO schema_migrations(version) VALUES(19);
