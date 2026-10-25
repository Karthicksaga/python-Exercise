-- In-ride chat between rider and driver. Messages are only accepted while the trip is active.
CREATE TABLE ride_messages (
    id bigserial PRIMARY KEY,
    ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    body text NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ride_messages_ride ON ride_messages(ride_id, id);
INSERT INTO schema_migrations(version) VALUES(18);
