CREATE TABLE saved_locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    label text NOT NULL CHECK (length(label) BETWEEN 1 AND 40),
    kind text NOT NULL CHECK (kind IN ('home', 'work', 'favorite')),
    lat double precision NOT NULL CHECK (lat BETWEEN 6 AND 38),
    lng double precision NOT NULL CHECK (lng BETWEEN 68 AND 98),
    place_label text NOT NULL CHECK (length(place_label) BETWEEN 2 AND 160),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (account_id, kind, label)
);
CREATE INDEX saved_locations_owner ON saved_locations(account_id, kind, label);

CREATE TABLE ride_ratings (
    ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    rater_id uuid NOT NULL REFERENCES accounts(id),
    rated_id uuid NOT NULL REFERENCES accounts(id),
    score smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment text NOT NULL DEFAULT '' CHECK (length(comment) <= 1000),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (ride_id, rater_id),
    CHECK (rater_id <> rated_id)
);
CREATE INDEX ride_ratings_rated ON ride_ratings(rated_id, created_at DESC);

INSERT INTO schema_migrations(version) VALUES(5);
