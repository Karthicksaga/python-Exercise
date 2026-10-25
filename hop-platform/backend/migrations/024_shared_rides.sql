-- Shared rides: two riders with nearby pickups and drops share one driver trip.
-- Each rider keeps their own ride row, fare, payment and pickup code; a group links them.
CREATE TABLE ride_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id uuid REFERENCES drivers(user_id),
    stop_plan jsonb NOT NULL DEFAULT '[]',
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quotes ADD COLUMN shared_fare_paise bigint CHECK (shared_fare_paise IS NULL OR shared_fare_paise > 0);

ALTER TABLE rides
    ADD COLUMN group_id uuid REFERENCES ride_groups(id),
    ADD COLUMN group_leader boolean NOT NULL DEFAULT false,
    ADD COLUMN share_state text NOT NULL DEFAULT 'none' CHECK (share_state IN ('none','waiting','matched','solo_shared','solo_full')),
    ADD COLUMN share_until timestamptz,
    ADD CONSTRAINT rides_leader_needs_group CHECK (NOT group_leader OR group_id IS NOT NULL);

-- A driver may have one active solo ride, or one active group (two rides sharing a driver).
DROP INDEX one_driver_active;
CREATE UNIQUE INDEX one_driver_active ON rides(driver_id) WHERE status IN ('accepted','arrived','in_progress') AND group_id IS NULL;
CREATE UNIQUE INDEX one_leader_per_group ON rides(group_id) WHERE group_leader;
CREATE INDEX rides_group ON rides(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX rides_share_pool ON rides(created_at) WHERE status = 'requested' AND share_state IN ('waiting','solo_shared');

INSERT INTO schema_migrations(version) VALUES(24);
