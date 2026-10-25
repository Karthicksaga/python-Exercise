-- Push workers claim outbox rows with a lease instead of holding row locks while talking to push services.
ALTER TABLE push_outbox ADD COLUMN lease_until timestamptz;
CREATE INDEX push_outbox_due ON push_outbox(lease_until, id);
INSERT INTO schema_migrations(version) VALUES(17);
