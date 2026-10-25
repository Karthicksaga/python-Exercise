-- Rider/driver profile details, trusted emergency contacts, ride defaults and account deletion requests.
CREATE TABLE account_profiles (
    account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    phone text NOT NULL DEFAULT '' CHECK (phone ~ '^([6-9][0-9]{9})?$'),
    gender text NOT NULL DEFAULT '' CHECK (gender IN ('', 'female', 'male', 'other', 'undisclosed')),
    birth_date date CHECK (birth_date IS NULL OR birth_date >= DATE '1900-01-01'),
    avatar_color text NOT NULL DEFAULT 'indigo' CHECK (avatar_color IN ('indigo', 'emerald', 'rose', 'amber', 'sky', 'slate')),
    default_payment text NOT NULL DEFAULT 'cash' CHECK (default_payment IN ('cash', 'upi', 'wallet')),
    default_vehicle text NOT NULL DEFAULT '' CHECK (default_vehicle IN ('', 'bike', 'auto', 'mini', 'sedan', 'suv')),
    deletion_requested_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE emergency_contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (length(name) BETWEEN 2 AND 60),
    phone text NOT NULL CHECK (phone ~ '^[6-9][0-9]{9}$'),
    relation text NOT NULL DEFAULT '' CHECK (length(relation) <= 30),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (account_id, phone)
);

INSERT INTO schema_migrations(version) VALUES(20);
