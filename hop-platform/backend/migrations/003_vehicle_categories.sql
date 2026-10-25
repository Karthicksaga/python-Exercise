CREATE TABLE area_vehicle_pricing (
    area_id uuid NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    category text NOT NULL CHECK (category IN ('bike', 'auto', 'mini', 'sedan', 'suv')),
    base_paise bigint NOT NULL CHECK (base_paise >= 0 AND base_paise <= 100000),
    per_km_paise bigint NOT NULL CHECK (per_km_paise > 0 AND per_km_paise <= 10000),
    minimum_paise bigint NOT NULL CHECK (minimum_paise > 0 AND minimum_paise <= 100000),
    pricing_version integer NOT NULL DEFAULT 1,
    enabled boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (area_id, category)
);

INSERT INTO area_vehicle_pricing(area_id, category, base_paise, per_km_paise, minimum_paise, enabled)
SELECT id, 'bike', base_paise, per_km_paise, minimum_paise, active
FROM areas;

CREATE FUNCTION seed_area_bike_pricing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO area_vehicle_pricing(area_id, category, base_paise, per_km_paise, minimum_paise, enabled)
    VALUES (NEW.id, 'bike', NEW.base_paise, NEW.per_km_paise, NEW.minimum_paise, NEW.active);
    RETURN NEW;
END;
$$;

CREATE TRIGGER areas_seed_bike_pricing
AFTER INSERT ON areas
FOR EACH ROW EXECUTE FUNCTION seed_area_bike_pricing();

ALTER TABLE drivers
    ADD COLUMN vehicle_category text NOT NULL DEFAULT 'bike'
    CHECK (vehicle_category IN ('bike', 'auto', 'mini', 'sedan', 'suv'));

ALTER TABLE quotes
    ADD COLUMN vehicle_category text NOT NULL DEFAULT 'bike'
    CHECK (vehicle_category IN ('bike', 'auto', 'mini', 'sedan', 'suv')),
    ADD COLUMN base_paise bigint NOT NULL DEFAULT 0 CHECK (base_paise >= 0),
    ADD COLUMN per_km_paise bigint NOT NULL DEFAULT 0 CHECK (per_km_paise >= 0),
    ADD COLUMN minimum_paise bigint NOT NULL DEFAULT 1 CHECK (minimum_paise > 0);

UPDATE quotes q
SET base_paise = a.base_paise, per_km_paise = a.per_km_paise, minimum_paise = a.minimum_paise
FROM areas a
WHERE q.area_id = a.id;

INSERT INTO schema_migrations(version) VALUES(3);
