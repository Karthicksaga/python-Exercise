CREATE TABLE area_change_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id uuid NOT NULL REFERENCES drivers(user_id) ON DELETE CASCADE,
    area_id uuid NOT NULL REFERENCES areas(id),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    review_note text NOT NULL DEFAULT '',
    reviewed_by uuid REFERENCES accounts(id),
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX area_change_one_pending ON area_change_requests(driver_id) WHERE status = 'pending';

INSERT INTO schema_migrations(version) VALUES(32);
