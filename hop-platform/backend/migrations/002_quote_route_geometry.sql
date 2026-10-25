ALTER TABLE quotes
    ADD COLUMN route_geometry jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(route_geometry) = 'array' AND jsonb_array_length(route_geometry) <= 10000);

INSERT INTO schema_migrations(version) VALUES(2);