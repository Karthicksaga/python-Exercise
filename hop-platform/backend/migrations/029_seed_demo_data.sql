-- Seed default Bangalore service area, vehicle categories, and demo testing accounts

INSERT INTO areas(id, name, state, min_lat, max_lat, min_lng, max_lng, base_paise, per_km_paise, minimum_paise, active, approval_reference)
VALUES ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'Bengaluru Urban', 'Karnataka', 12.75, 13.25, 77.40, 77.85, 2500, 1200, 3000, true, 'GOVT-KA-2026-BLR')
ON CONFLICT (id) DO UPDATE SET active = true;

-- The areas_seed_bike_pricing trigger automatically seeds 'bike'. Ensure it is enabled:
UPDATE area_vehicle_pricing SET enabled = true WHERE area_id = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' AND category = 'bike';

-- Seed the remaining 4 vehicle categories
INSERT INTO area_vehicle_pricing(area_id, category, base_paise, per_km_paise, minimum_paise, enabled, stop_fee_paise, extra_km_paise)
VALUES
('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'auto', 3000, 1500, 3500, true, 500, 1500),
('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'mini', 5000, 1800, 6000, true, 800, 1800),
('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'sedan', 7000, 2200, 8000, true, 1000, 2200),
('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'suv', 9000, 2800, 10000, true, 1500, 2800)
ON CONFLICT (area_id, category) DO UPDATE SET enabled = true;

-- Seed default demo testing accounts
INSERT INTO accounts(id, issuer, subject, email, name, role)
VALUES
('b1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'demo', 'rider@hop.local', 'rider@hop.local', 'Demo Rider', 'rider'),
('c1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'demo', 'captain@hop.local', 'captain@hop.local', 'Demo Captain', 'rider'),
('d1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'demo', 'admin@hop.local', 'admin@hop.local', 'Demo Operator', 'operator')
ON CONFLICT (issuer, subject) DO UPDATE SET role = EXCLUDED.role;

-- Seed approved and online driver profile for Demo Captain
INSERT INTO drivers(user_id, area_id, status, vehicle_number, vehicle_category, upi_id, license_reference, insurance_reference, license_expires, insurance_expires, online, lat, lng, location_at)
VALUES
('c1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'approved', 'KA-01-HOP-2026', 'bike', 'captain@upi', 'DL-KA-2026-001', 'INS-KA-2026-001', (now() + interval '5 years')::date, (now() + interval '5 years')::date, true, 12.9352, 77.6245, now())
ON CONFLICT (user_id) DO UPDATE SET status = 'approved', online = true, location_at = now();

INSERT INTO schema_migrations(version) VALUES(29);
