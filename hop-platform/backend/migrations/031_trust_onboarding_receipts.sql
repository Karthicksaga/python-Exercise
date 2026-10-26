-- Explicit phone ownership, private media, resumable applications and immutable trip statements.
ALTER TABLE account_profiles ADD COLUMN company_name text NOT NULL DEFAULT '',
 ADD COLUMN business_gstin text NOT NULL DEFAULT '', ADD COLUMN cost_centre text NOT NULL DEFAULT '',
 ADD COLUMN work_email text NOT NULL DEFAULT '';
CREATE TABLE verified_phones (
 account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 phone text NOT NULL UNIQUE CHECK(phone ~ '^[6-9][0-9]{9}$'),
 verified_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO verified_phones(account_id,phone)
 SELECT id,subject FROM accounts WHERE issuer='phone' AND subject ~ '^[6-9][0-9]{9}$';
CREATE TABLE profile_phone_challenges (
 account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 phone text NOT NULL CHECK(phone ~ '^[6-9][0-9]{9}$'),
 code_hash text NOT NULL, attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE TABLE media_objects (
 object_key text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('portrait','kyc')),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 2097152), sha256 text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE profile_photos (
 account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 object_key text NOT NULL UNIQUE REFERENCES media_objects(object_key),
 approved boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE driver_documents (
 account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('identity','license','rc','insurance')),
 object_key text NOT NULL UNIQUE REFERENCES media_objects(object_key),
 content_type text NOT NULL CHECK(content_type IN ('image/jpeg','image/png')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id,kind)
);
CREATE TABLE driver_application_drafts (
 account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 details jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE drivers ADD COLUMN vehicle_make text NOT NULL DEFAULT '',
 ADD COLUMN vehicle_model text NOT NULL DEFAULT '', ADD COLUMN vehicle_color text NOT NULL DEFAULT '',
 ADD COLUMN onboarding_version integer NOT NULL DEFAULT 0;
CREATE TABLE trip_statements (
 ride_id uuid PRIMARY KEY REFERENCES rides(id),
 issued_at timestamptz NOT NULL DEFAULT now(), details jsonb NOT NULL
);
ALTER TABLE ride_offers DROP CONSTRAINT ride_offers_outcome_check;
ALTER TABLE ride_offers ADD CONSTRAINT ride_offers_outcome_check
 CHECK(outcome IN ('accepted','missed','declined','superseded','expired'));
ALTER TABLE ride_offers ADD COLUMN displayed_at timestamptz,
 ADD COLUMN eta_source text NOT NULL DEFAULT 'estimate' CHECK(eta_source IN ('estimate','road'));
-- Historical missed offers are ambiguous; do not interpret them as an explicit decline.
UPDATE ride_offers SET outcome='superseded' WHERE outcome='missed';
INSERT INTO schema_migrations(version) VALUES(31);
