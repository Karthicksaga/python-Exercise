-- Seed Chennai Metro service area and vehicle pricing categories

INSERT INTO areas(id, name, state, min_lat, max_lat, min_lng, max_lng, base_paise, per_km_paise, minimum_paise, active, approval_reference)
VALUES ('e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b', 'Chennai Metro', 'Tamil Nadu', 12.85, 13.25, 79.95, 80.35, 2500, 1200, 3000, true, 'GOVT-TN-2026-CHN')
ON CONFLICT (id) DO UPDATE SET active = true;

-- The trigger areas_seed_bike_pricing automatically seeds 'bike'. Ensure it is enabled:
UPDATE area_vehicle_pricing SET enabled = true WHERE area_id = 'e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b' AND category = 'bike';

-- Seed the remaining 4 vehicle categories for Chennai
INSERT INTO area_vehicle_pricing(area_id, category, base_paise, per_km_paise, minimum_paise, enabled, stop_fee_paise, extra_km_paise)
VALUES
('e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b', 'auto', 3000, 1500, 3500, true, 500, 1500),
('e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b', 'mini', 5000, 1800, 6000, true, 800, 1800),
('e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b', 'sedan', 7000, 2200, 8000, true, 1000, 2200),
('e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b', 'suv', 9000, 2800, 10000, true, 1500, 2800)
ON CONFLICT (area_id, category) DO UPDATE SET enabled = true;

-- Seed an approved Demo Captain in Chennai (near T. Nagar / Marina Beach)
INSERT INTO accounts(id, issuer, subject, email, name, role)
VALUES
('f1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b', 'demo', 'captain.chennai@hop.local', 'captain.chennai@hop.local', 'Chennai Captain', 'rider')
ON CONFLICT (issuer, subject) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO drivers(user_id, area_id, status, vehicle_number, vehicle_category, upi_id, license_reference, insurance_reference, license_expires, insurance_expires, online, lat, lng, location_at)
VALUES
('f1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b', 'e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b', 'approved', 'TN-01-HOP-2026', 'bike', 'captain.chennai@upi', 'DL-TN-2026-001', 'INS-TN-2026-001', (now() + interval '5 years')::date, (now() + interval '5 years')::date, true, 13.0418, 80.2341, now())
ON CONFLICT (user_id) DO UPDATE SET status = 'approved', online = true, location_at = now();

INSERT INTO schema_migrations(version) VALUES(30);
