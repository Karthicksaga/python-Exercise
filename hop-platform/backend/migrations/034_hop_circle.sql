-- Existing favorites are the sole source of rider/Captain relationships.
CREATE TABLE circle_captain_preferences (
 captain_id uuid PRIMARY KEY REFERENCES drivers(user_id) ON DELETE CASCADE,
 opted_in boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE circle_blocks (
 captain_id uuid NOT NULL REFERENCES drivers(user_id) ON DELETE CASCADE,
 rider_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(captain_id,rider_id), CHECK(captain_id<>rider_id)
);
ALTER TABLE rides ADD COLUMN circle_requested boolean NOT NULL DEFAULT false,
 ADD COLUMN circle_captain_id uuid REFERENCES drivers(user_id),
 ADD COLUMN circle_until timestamptz,
 ADD CONSTRAINT circle_request_metadata CHECK(circle_requested OR (circle_captain_id IS NULL AND circle_until IS NULL));
ALTER TABLE ride_offers ADD COLUMN circle_invitation boolean NOT NULL DEFAULT false;
CREATE INDEX circle_pending_offers ON ride_offers(driver_id,offered_at DESC) WHERE circle_invitation AND outcome IS NULL;
CREATE INDEX circle_favorites_reverse ON favorite_drivers(driver_id,rider_id);
INSERT INTO schema_migrations(version) VALUES(34);
