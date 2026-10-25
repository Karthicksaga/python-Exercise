-- Wake the same account in both apps when its driver availability changes.
CREATE FUNCTION hop_signal_driver_availability() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('hop_events', NEW.user_id::text);
    RETURN NULL;
END $$;
CREATE TRIGGER driver_availability_signal AFTER UPDATE OF online ON drivers
FOR EACH ROW WHEN (OLD.online IS DISTINCT FROM NEW.online)
EXECUTE FUNCTION hop_signal_driver_availability();

INSERT INTO schema_migrations(version) VALUES(28);
