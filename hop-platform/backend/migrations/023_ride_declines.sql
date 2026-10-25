CREATE TABLE IF NOT EXISTS ride_declines(
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(ride_id, driver_id)
);

INSERT INTO schema_migrations(version) VALUES(23);
