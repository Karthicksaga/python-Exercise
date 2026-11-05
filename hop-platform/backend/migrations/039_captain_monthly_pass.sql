-- Captain monthly pass: captains pay a flat price for a number of days instead of a per-ride commission.
-- Off by default: a zone only needs a pass once an operator switches pass_required on.

ALTER TABLE areas ADD COLUMN pass_required boolean NOT NULL DEFAULT false;

-- One price per vehicle type. Starting prices are placeholders for operators to change.
CREATE TABLE captain_pass_prices (
    category text PRIMARY KEY CHECK (category IN ('bike', 'auto', 'mini', 'sedan', 'suv')),
    price_paise bigint NOT NULL CHECK (price_paise BETWEEN 0 AND 10000000),
    days int NOT NULL DEFAULT 30 CHECK (days BETWEEN 1 AND 90),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES accounts(id)
);
INSERT INTO captain_pass_prices(category, price_paise) VALUES
    ('bike', 49900), ('auto', 79900), ('mini', 149900), ('sedan', 179900), ('suv', 199900);

-- Each purchase or grant is one period. Periods queue: a renewal starts when the current one ends.
CREATE TABLE captain_passes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id uuid NOT NULL REFERENCES drivers(user_id),
    category text NOT NULL CHECK (category IN ('bike', 'auto', 'mini', 'sedan', 'suv')),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
    -- earnings: paid from the captain's Hop balance. operator: granted by an operator, with any
    -- amount collected outside the app (for example cash at the office) recorded in price_paise.
    source text NOT NULL CHECK (source IN ('earnings', 'operator')),
    price_paise bigint NOT NULL CHECK (price_paise >= 0),
    note text NOT NULL DEFAULT '',
    created_by uuid NOT NULL REFERENCES accounts(id),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX captain_passes_driver ON captain_passes(driver_id, ends_at DESC);

ALTER TABLE driver_ledger DROP CONSTRAINT driver_ledger_kind_check;
ALTER TABLE driver_ledger ADD CONSTRAINT driver_ledger_kind_check
    CHECK (kind IN ('online_fare', 'promo_subsidy', 'payout', 'adjustment', 'pass'));

INSERT INTO schema_migrations(version) VALUES(39);
