-- Dispatch bumps lease and stage columns every few seconds; only meaningful ride changes should wake streams.
DROP TRIGGER rides_signal ON rides;
CREATE TRIGGER rides_signal_insert AFTER INSERT ON rides FOR EACH ROW EXECUTE FUNCTION hop_signal_ride();
CREATE TRIGGER rides_signal_update AFTER UPDATE ON rides FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.driver_id IS DISTINCT FROM NEW.driver_id
          OR OLD.offered_fare_paise IS DISTINCT FROM NEW.offered_fare_paise OR OLD.version IS DISTINCT FROM NEW.version)
    EXECUTE FUNCTION hop_signal_ride();

INSERT INTO schema_migrations(version) VALUES(15);
