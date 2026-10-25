-- Operator verification checklist for drivers/vehicles and "pink" (women-driver) rides.
CREATE TABLE driver_verifications (
    driver_id uuid PRIMARY KEY REFERENCES drivers(user_id) ON DELETE CASCADE,
    identity_ok boolean NOT NULL DEFAULT false,
    license_ok boolean NOT NULL DEFAULT false,
    rc_ok boolean NOT NULL DEFAULT false,
    insurance_ok boolean NOT NULL DEFAULT false,
    vehicle_ok boolean NOT NULL DEFAULT false,
    police_ok boolean NOT NULL DEFAULT false,
    verified_by uuid REFERENCES accounts(id),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Drivers approved before this checklist existed keep working.
INSERT INTO driver_verifications(driver_id, identity_ok, license_ok, rc_ok, insurance_ok, vehicle_ok, police_ok)
SELECT user_id, true, true, true, true, true, true FROM drivers WHERE status = 'approved';

ALTER TABLE drivers ADD COLUMN pink_certified boolean NOT NULL DEFAULT false;
ALTER TABLE quotes ADD COLUMN pink boolean NOT NULL DEFAULT false;
CREATE INDEX drivers_pink ON drivers(area_id) WHERE pink_certified;

INSERT INTO schema_migrations(version) VALUES(21);
