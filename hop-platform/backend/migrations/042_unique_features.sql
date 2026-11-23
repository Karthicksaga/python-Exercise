-- Advertisable features (Nov 2026; suggestions/2026-11-07-advertisable-unique-features.md).

-- Price promise: the price the rider agreed to (quote or accepted offer, plus any shown wait
-- charge). If the final fare is ever higher, the rider pays the promise and Hop pays the captain
-- the difference (driver_ledger kind 'price_promise').
ALTER TABLE rides ADD COLUMN promised_fare_paise bigint;
ALTER TABLE rides ADD COLUMN promise_refund_paise bigint NOT NULL DEFAULT 0;
ALTER TABLE driver_ledger DROP CONSTRAINT driver_ledger_kind_check;
ALTER TABLE driver_ledger ADD CONSTRAINT driver_ledger_kind_check
    CHECK (kind IN ('online_fare', 'promo_subsidy', 'payout', 'adjustment', 'pass', 'price_promise'));

-- Meter-honest auto fare: the official meter tariff, set by operations per zone and vehicle.
-- NULL means not set, and the app shows nothing.
ALTER TABLE area_vehicle_pricing ADD COLUMN meter_base_paise int CHECK (meter_base_paise BETWEEN 0 AND 100000);
ALTER TABLE area_vehicle_pricing ADD COLUMN meter_base_meters int CHECK (meter_base_meters BETWEEN 0 AND 20000);
ALTER TABLE area_vehicle_pricing ADD COLUMN meter_per_km_paise int CHECK (meter_per_km_paise BETWEEN 0 AND 20000);

-- Accepted means coming: a captain who cancels after accepting sends the ride back to matching
-- first, and the rider gets a wallet credit (per zone; 0 turns it off).
ALTER TABLE areas ADD COLUMN captain_cancel_credit_paise int NOT NULL DEFAULT 2000
    CHECK (captain_cancel_credit_paise BETWEEN 0 AND 20000);
ALTER TABLE rides ADD COLUMN captain_cancels int NOT NULL DEFAULT 0;
ALTER TABLE rides ADD COLUMN cancel_credit_paise bigint NOT NULL DEFAULT 0;
CREATE TABLE captain_cancellations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id uuid NOT NULL REFERENCES rides(id),
    driver_id uuid NOT NULL REFERENCES accounts(id),
    reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX captain_cancellations_driver ON captain_cancellations(driver_id, created_at);
ALTER TABLE wallet_entries DROP CONSTRAINT wallet_entries_kind_check;
ALTER TABLE wallet_entries ADD CONSTRAINT wallet_entries_kind_check
    CHECK (kind IN ('topup', 'ride_payment', 'refund', 'adjustment', 'cancel_credit'));

-- Left something behind: the captain's back-seat check at trip end.
ALTER TABLE rides ADD COLUMN back_seat text CHECK (back_seat IN ('clear', 'found'));
ALTER TABLE lost_items ADD COLUMN found_by_driver boolean NOT NULL DEFAULT false;

-- Train-aware pickup: a scheduled station pickup can carry the train number and be pushed later.
ALTER TABLE scheduled_rides ADD COLUMN train_no text CHECK (train_no ~ '^[0-9]{5}$');
ALTER TABLE scheduled_rides ADD COLUMN delay_minutes int NOT NULL DEFAULT 0 CHECK (delay_minutes BETWEEN 0 AND 240);

-- Book without internet: inbound SMS bookings ("HOP Adyar to Central", then "YES").
CREATE TABLE sms_bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone text NOT NULL,
    account_id uuid REFERENCES accounts(id),
    body text NOT NULL,
    quote_id uuid REFERENCES quotes(id),
    ride_id uuid REFERENCES rides(id),
    status text NOT NULL CHECK (status IN ('quoted', 'booked', 'expired', 'failed', 'unknown_number')),
    reply text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sms_bookings_phone ON sms_bookings(phone, created_at DESC);

INSERT INTO schema_migrations(version) VALUES(42);
