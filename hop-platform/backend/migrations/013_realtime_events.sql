-- Commit-time realtime signals. Every change that a rider, driver or notification stream cares about emits
-- a payload-only NOTIFY (the account id). Streams wake on the signal instead of polling the database.
CREATE FUNCTION hop_signal_ride() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('hop_events', NEW.rider_id::text);
    IF NEW.driver_id IS NOT NULL THEN
        PERFORM pg_notify('hop_events', NEW.driver_id::text);
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.driver_id IS NOT NULL AND OLD.driver_id IS DISTINCT FROM NEW.driver_id THEN
            PERFORM pg_notify('hop_events', OLD.driver_id::text);
        END IF;
        PERFORM pg_notify('hop_events', o.driver_id::text) FROM ride_offers o WHERE o.ride_id = NEW.id;
    END IF;
    RETURN NULL;
END $$;
CREATE TRIGGER rides_signal AFTER INSERT OR UPDATE ON rides FOR EACH ROW EXECUTE FUNCTION hop_signal_ride();

CREATE FUNCTION hop_signal_offer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('hop_events', NEW.driver_id::text);
    RETURN NULL;
END $$;
CREATE TRIGGER ride_offers_signal AFTER INSERT OR UPDATE ON ride_offers FOR EACH ROW EXECUTE FUNCTION hop_signal_offer();

CREATE FUNCTION hop_signal_notification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('hop_events', NEW.account_id::text);
    RETURN NULL;
END $$;
CREATE TRIGGER notifications_signal AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION hop_signal_notification();

INSERT INTO schema_migrations(version) VALUES(13);
