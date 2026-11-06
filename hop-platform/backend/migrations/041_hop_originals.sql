-- Hop originals (approved Nov 2026 prototype, phases 2 and 3).
-- Ride notes the captain sees in their own language, an arrival text to the rider's emergency contact,
-- SMS trip updates when the rider's internet drops, a captain's chai break and "home by" time.

ALTER TABLE rides
    ADD COLUMN rider_notes text[] NOT NULL DEFAULT '{}' CHECK (rider_notes <@ ARRAY['quiet','luggage','boarding','call']::text[]),
    ADD COLUMN arrival_alert boolean NOT NULL DEFAULT false,
    -- sent | test (development SMS: logged, not delivered) | unavailable (no SMS provider) | no_contact | failed
    ADD COLUMN arrival_alert_status text CHECK (arrival_alert_status IN ('sent','test','unavailable','no_contact','failed')),
    ADD COLUMN sms_updates boolean NOT NULL DEFAULT false;

ALTER TABLE drivers
    ADD COLUMN online_since timestamptz,
    ADD COLUMN break_until timestamptz,
    ADD COLUMN home_by timestamptz;

INSERT INTO schema_migrations(version) VALUES(41);
