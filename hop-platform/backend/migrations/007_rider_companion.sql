CREATE TABLE account_preferences (
    account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    language text NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','ta','te','kn','ml','bn','mr','gu','pa')),
    wheelchair_access boolean NOT NULL DEFAULT false,
    hearing_impaired boolean NOT NULL DEFAULT false,
    visually_impaired boolean NOT NULL DEFAULT false,
    extra_assistance boolean NOT NULL DEFAULT false,
    large_text boolean NOT NULL DEFAULT false,
    notifications_enabled boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 40),
    title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
    body text NOT NULL DEFAULT '' CHECK (length(body) <= 500),
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_owner ON notifications(account_id, created_at DESC);

CREATE TABLE lost_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    reporter_id uuid NOT NULL REFERENCES accounts(id),
    description text NOT NULL CHECK (length(description) BETWEEN 5 AND 1000),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','driver_contacted','returned','closed')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lost_items_owner ON lost_items(reporter_id, created_at DESC);

CREATE TABLE sos_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES accounts(id),
    incident_id uuid REFERENCES incidents(id),
    lat double precision CHECK (lat BETWEEN -90 AND 90),
    lng double precision CHECK (lng BETWEEN -180 AND 180),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ride_shares (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ride_shares_ride ON ride_shares(ride_id);

CREATE TABLE referral_codes (
    account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z2-9]{8}$')
);
CREATE TABLE referrals (
    referred_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    referrer_id uuid NOT NULL REFERENCES accounts(id),
    rewarded_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (referred_id <> referrer_id)
);
CREATE TABLE reward_ledger (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES accounts(id),
    points integer NOT NULL,
    reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reward_ledger_owner ON reward_ledger(account_id, id DESC);

CREATE TABLE family_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    member_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_id, member_id),
    CHECK (owner_id <> member_id)
);
CREATE INDEX family_members_member ON family_members(member_id);

CREATE TABLE favorite_drivers (
    rider_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    driver_id uuid NOT NULL REFERENCES drivers(user_id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (rider_id, driver_id)
);

CREATE TABLE scheduled_rides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    area_id uuid NOT NULL REFERENCES areas(id),
    category text NOT NULL DEFAULT 'bike' CHECK (category IN ('bike','auto','mini','sedan','suv')),
    pickup_lat double precision NOT NULL, pickup_lng double precision NOT NULL, pickup_label text NOT NULL CHECK (length(pickup_label) BETWEEN 2 AND 160),
    dropoff_lat double precision NOT NULL, dropoff_lng double precision NOT NULL, dropoff_label text NOT NULL CHECK (length(dropoff_label) BETWEEN 2 AND 160),
    scheduled_for timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scheduled_rides_owner ON scheduled_rides(rider_id, scheduled_for);

INSERT INTO schema_migrations(version) VALUES(7);
