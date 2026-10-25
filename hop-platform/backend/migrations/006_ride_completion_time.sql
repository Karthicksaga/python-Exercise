ALTER TABLE rides
    ADD COLUMN completed_at timestamptz;

UPDATE rides
SET completed_at = updated_at
WHERE status = 'completed';

CREATE INDEX rides_driver_completed ON rides(driver_id, completed_at DESC)
WHERE status = 'completed';

INSERT INTO schema_migrations(version) VALUES(6);
