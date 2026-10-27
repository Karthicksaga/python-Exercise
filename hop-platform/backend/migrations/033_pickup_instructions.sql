ALTER TABLE rides ADD COLUMN IF NOT EXISTS pickup_instructions text NOT NULL DEFAULT '' CHECK (char_length(pickup_instructions) <= 250);

INSERT INTO schema_migrations(version) VALUES(33);
