CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), issuer text NOT NULL, subject text NOT NULL,
 email text NOT NULL, name text NOT NULL, role text NOT NULL DEFAULT 'rider' CHECK(role IN ('rider','operator')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(issuer,subject)
);
CREATE TABLE areas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, state text NOT NULL,
 min_lat double precision NOT NULL, max_lat double precision NOT NULL, min_lng double precision NOT NULL, max_lng double precision NOT NULL,
 base_paise bigint NOT NULL CHECK(base_paise>=0), per_km_paise bigint NOT NULL CHECK(per_km_paise>0), minimum_paise bigint NOT NULL CHECK(minimum_paise>0),
 pricing_version integer NOT NULL DEFAULT 1, active boolean NOT NULL DEFAULT false, approval_reference text NOT NULL DEFAULT '',
 CHECK(min_lat>=6 AND max_lat<=38 AND min_lat<max_lat AND min_lng>=68 AND max_lng<=98 AND min_lng<max_lng),
 CHECK(NOT active OR length(approval_reference)>5)
);
CREATE TABLE drivers (
 user_id uuid PRIMARY KEY REFERENCES accounts(id), area_id uuid NOT NULL REFERENCES areas(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','suspended')),
 vehicle_number text NOT NULL, upi_id text NOT NULL DEFAULT '', license_reference text NOT NULL, insurance_reference text NOT NULL,
 license_expires date NOT NULL, insurance_expires date NOT NULL,
 review_note text NOT NULL DEFAULT '', reviewed_by uuid REFERENCES accounts(id), reviewed_at timestamptz,
 online boolean NOT NULL DEFAULT false, lat double precision, lng double precision, accuracy double precision,
 location_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT online OR status='approved'), CHECK(lat BETWEEN -90 AND 90), CHECK(lng BETWEEN -180 AND 180)
);
CREATE INDEX drivers_dispatch ON drivers(area_id,location_at) WHERE online AND status='approved';
CREATE TABLE quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rider_id uuid NOT NULL REFERENCES accounts(id), area_id uuid NOT NULL REFERENCES areas(id),
 pickup_lat double precision NOT NULL, pickup_lng double precision NOT NULL, pickup_label text NOT NULL,
 dropoff_lat double precision NOT NULL, dropoff_lng double precision NOT NULL, dropoff_label text NOT NULL,
 meters bigint NOT NULL CHECK(meters>0), seconds bigint NOT NULL CHECK(seconds>0), fare_paise bigint NOT NULL CHECK(fare_paise>0),
 pricing_version integer NOT NULL, route_source text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '2 minutes'), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quotes_owner ON quotes(rider_id,created_at DESC);
CREATE TABLE rides (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quote_id uuid NOT NULL UNIQUE REFERENCES quotes(id),
 rider_id uuid NOT NULL REFERENCES accounts(id), driver_id uuid REFERENCES drivers(user_id),
 request_key uuid NOT NULL, status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','accepted','arrived','in_progress','completed','cancelled','expired')),
 payment_method text NOT NULL CHECK(payment_method IN ('cash','upi')), payment_status text NOT NULL DEFAULT 'unconfirmed' CHECK(payment_status IN ('unconfirmed','driver_reported_received','rider_disputed')),
 pin_attempts integer NOT NULL DEFAULT 0 CHECK(pin_attempts>=0), cancel_reason text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1,
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '5 minutes'), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(rider_id,request_key), CHECK(driver_id IS NULL OR rider_id<>driver_id)
);
CREATE UNIQUE INDEX one_rider_active ON rides(rider_id) WHERE status IN ('requested','accepted','arrived','in_progress');
CREATE UNIQUE INDEX one_driver_active ON rides(driver_id) WHERE status IN ('accepted','arrived','in_progress');
CREATE INDEX rides_dispatch ON rides(created_at) WHERE status='requested';
CREATE TABLE audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid REFERENCES accounts(id), ride_id uuid REFERENCES rides(id),
 action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_ride ON audit_events(ride_id,id);
CREATE TABLE incidents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ride_id uuid NOT NULL REFERENCES rides(id), reporter_id uuid NOT NULL REFERENCES accounts(id),
 message text NOT NULL CHECK(length(message) BETWEEN 5 AND 2000), status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','closed')),
 resolution text NOT NULL DEFAULT '', updated_by uuid REFERENCES accounts(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES(1);
