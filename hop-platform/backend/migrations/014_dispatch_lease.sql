-- Short lease so several API instances can dispatch different rides in parallel without a global lock.
ALTER TABLE rides ADD COLUMN dispatch_lease timestamptz;

INSERT INTO schema_migrations(version) VALUES(14);
