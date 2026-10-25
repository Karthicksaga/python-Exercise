CREATE TABLE vehicle_change_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id uuid NOT NULL REFERENCES drivers(user_id) ON DELETE CASCADE,
    vehicle_category text NOT NULL CHECK (vehicle_category IN ('bike', 'auto', 'mini', 'sedan', 'suv')),
    vehicle_number text NOT NULL CHECK (length(vehicle_number) BETWEEN 6 AND 20),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    review_note text NOT NULL DEFAULT '',
    reviewed_by uuid REFERENCES accounts(id),
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX vehicle_change_one_pending ON vehicle_change_requests(driver_id) WHERE status = 'pending';

INSERT INTO schema_migrations(version) VALUES(11);
