-- Waiting-time charge on rides, and driver tools: go-home mode and a daily earnings goal.
ALTER TABLE rides ADD COLUMN wait_charge_paise bigint NOT NULL DEFAULT 0 CHECK (wait_charge_paise >= 0);
ALTER TABLE drivers
    ADD COLUMN home_lat double precision,
    ADD COLUMN home_lng double precision,
    ADD COLUMN home_until timestamptz,
    ADD COLUMN home_uses int NOT NULL DEFAULT 0,
    ADD COLUMN home_uses_on date,
    ADD COLUMN daily_goal_paise bigint NOT NULL DEFAULT 0 CHECK (daily_goal_paise >= 0);

INSERT INTO schema_migrations(version) VALUES(25);
