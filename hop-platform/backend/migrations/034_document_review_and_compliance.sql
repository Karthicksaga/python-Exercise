-- Production document review (Nov 2026).
-- 1. Two-sided documents and a police clearance certificate.
-- 2. Every uploaded version is kept with its own review outcome, so evidence an operator
--    approved is never silently replaced or garbage-collected.
-- 3. Approval records exactly which files were verified, plus ID-verified gender (pink rides)
--    and the police verification reference.
-- 4. Review queue fields (submission time, claim) and an idempotent expiry-reminder log.

ALTER TABLE driver_documents DROP CONSTRAINT IF EXISTS driver_documents_kind_check;
ALTER TABLE driver_documents ADD CONSTRAINT driver_documents_kind_check
  CHECK (kind IN ('identity','identity_back','license','license_back','rc','rc_back','insurance','police'));
ALTER TABLE driver_documents
  ADD COLUMN review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','accepted','rejected')),
  ADD COLUMN review_reason text NOT NULL DEFAULT '' CHECK (length(review_reason) <= 300),
  ADD COLUMN reviewed_by uuid REFERENCES accounts(id),
  ADD COLUMN reviewed_at timestamptz;

CREATE TABLE driver_document_versions (
  id bigserial PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('identity','identity_back','license','license_back','rc','rc_back','insurance','police')),
  object_key text NOT NULL UNIQUE REFERENCES media_objects(object_key),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','accepted','rejected')),
  review_reason text NOT NULL DEFAULT '' CHECK (length(review_reason) <= 300),
  reviewed_by uuid REFERENCES accounts(id),
  reviewed_at timestamptz
);
CREATE INDEX driver_document_versions_owner ON driver_document_versions(account_id, kind, uploaded_at DESC);

-- Existing documents become the first recorded version.
INSERT INTO driver_document_versions(account_id, kind, object_key, uploaded_at)
SELECT account_id, kind, object_key, updated_at FROM driver_documents
ON CONFLICT (object_key) DO NOTHING;

ALTER TABLE driver_verifications
  ADD COLUMN gender_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN police_reference text NOT NULL DEFAULT '' CHECK (length(police_reference) <= 80),
  ADD COLUMN evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE drivers
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN claimed_by uuid REFERENCES accounts(id),
  ADD COLUMN claimed_at timestamptz;
UPDATE drivers SET submitted_at = COALESCE(updated_at, now()) WHERE submitted_at IS NULL;
ALTER TABLE drivers ALTER COLUMN submitted_at SET DEFAULT now();
CREATE INDEX drivers_review_queue ON drivers(status, submitted_at);

CREATE TABLE compliance_reminders (
  driver_id uuid NOT NULL REFERENCES drivers(user_id) ON DELETE CASCADE,
  document text NOT NULL CHECK (document IN ('license','insurance')),
  threshold text NOT NULL CHECK (threshold IN ('30d','7d','1d','expired')),
  expires date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (driver_id, document, threshold, expires)
);

INSERT INTO schema_migrations(version) VALUES(34);
