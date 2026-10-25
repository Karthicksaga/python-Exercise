-- LOCAL DEVELOPMENT ONLY. Seeds service areas, vehicle pricing and online demo drivers
-- so the rider booking flow works like a real ride-hailing app.
-- Re-runnable: psql -U hop -d <db> -f infra/dev_seed.sql  (re-run to refresh driver locations)

INSERT INTO areas (name, state, min_lat, max_lat, min_lng, max_lng, base_paise, per_km_paise, minimum_paise, active, approval_reference)
SELECT v.name, v.state, v.a, v.b, v.c, v.d, 2000, 800, 3000, true, 'DEV-SEED-001'
FROM (VALUES
  ('Bengaluru', 'Karnataka',   12.80, 13.20, 77.40, 77.85),
  ('Chennai',   'Tamil Nadu',  12.85, 13.25, 80.10, 80.35),
  ('Mumbai',    'Maharashtra', 18.85, 19.35, 72.75, 73.05),
  ('Delhi NCR', 'Delhi',       28.35, 28.90, 76.85, 77.50),
  ('Hyderabad', 'Telangana',   17.20, 17.65, 78.25, 78.65),
  ('Pune',      'Maharashtra', 18.40, 18.65, 73.70, 74.00),
  ('Kolkata',   'West Bengal', 22.45, 22.70, 88.20, 88.50)
) AS v(name, state, a, b, c, d)
WHERE NOT EXISTS (SELECT 1 FROM areas x WHERE x.name = v.name);

UPDATE areas SET active = true WHERE approval_reference = 'DEV-SEED-001';

INSERT INTO area_vehicle_pricing (area_id, category, base_paise, per_km_paise, minimum_paise, enabled)
SELECT a.id, c.category, c.base, c.per_km, c.minimum, true
FROM areas a
CROSS JOIN (VALUES
  ('bike',  1500,  600,  2500),
  ('auto',  2500,  1100, 4000),
  ('mini',  4000,  1400, 6000),
  ('sedan', 5000,  1700, 8000),
  ('suv',   7000,  2200, 12000)
) AS c(category, base, per_km, minimum)
WHERE a.approval_reference = 'DEV-SEED-001'
ON CONFLICT (area_id, category) DO UPDATE
SET base_paise = EXCLUDED.base_paise, per_km_paise = EXCLUDED.per_km_paise,
    minimum_paise = EXCLUDED.minimum_paise, enabled = true;

-- Demo drivers around central Bengaluru (MG Road / Indiranagar / Koramangala / Whitefield)
INSERT INTO accounts (issuer, subject, email, name, role)
SELECT 'dev-seed', 'demo-driver-' || n, 'demo-driver-' || n || '@example.invalid', d.name, 'rider'
FROM (VALUES
  (1,'Ravi Kumar'),(2,'Suresh Babu'),(3,'Imran Khan'),(4,'Arjun Reddy'),(5,'Manoj Singh'),
  (6,'Prakash Nair'),(7,'Vikram Rao'),(8,'Anil Gowda'),(9,'Dinesh Kumar'),(10,'Karthik S')
) AS d(n, name)
ON CONFLICT (issuer, subject) DO NOTHING;

INSERT INTO drivers (user_id, area_id, status, vehicle_number, vehicle_category, license_reference, insurance_reference,
                     license_expires, insurance_expires, online, lat, lng, accuracy, location_at)
SELECT acc.id, (SELECT id FROM areas WHERE name = 'Bengaluru'), 'approved',
       'KA01AB' || (1000 + d.n), d.cat, 'DL-DEV-' || d.n, 'INS-DEV-' || d.n,
       current_date + 365, current_date + 365, true, d.lat, d.lng, 10, now()
FROM (VALUES
  (1,'bike',  12.9759, 77.6060), (2,'bike',  12.9716, 77.6412), (3,'auto',  12.9352, 77.6245),
  (4,'auto',  12.9784, 77.6408), (5,'mini',  12.9698, 77.5970), (6,'mini',  12.9279, 77.6271),
  (7,'sedan', 12.9611, 77.6387), (8,'sedan', 12.9988, 77.5921), (9,'suv',   12.9500, 77.5800),
  (10,'bike', 12.9857, 77.6057)
) AS d(n, cat, lat, lng)
JOIN accounts acc ON acc.issuer = 'dev-seed' AND acc.subject = 'demo-driver-' || d.n
ON CONFLICT (user_id) DO UPDATE
SET online = true, status = 'approved', lat = EXCLUDED.lat, lng = EXCLUDED.lng, location_at = now(), updated_at = now();

-- Demo drivers around Chennai (T. Nagar / Adyar / Guindy / Velachery / Anna Nagar)
INSERT INTO accounts (issuer, subject, email, name, role)
SELECT 'dev-seed', 'demo-driver-' || n, 'demo-driver-' || n || '@example.invalid', d.name, 'rider'
FROM (VALUES
  (11,'Murugan S'),(12,'Senthil Kumar'),(13,'Bala Krishnan'),(14,'Ganesh R'),(15,'Selvam P'),(16,'Rajesh M')
) AS d(n, name)
ON CONFLICT (issuer, subject) DO NOTHING;

INSERT INTO drivers (user_id, area_id, status, vehicle_number, vehicle_category, license_reference, insurance_reference,
                     license_expires, insurance_expires, online, lat, lng, accuracy, location_at)
SELECT acc.id, (SELECT id FROM areas WHERE name = 'Chennai'), 'approved',
       'TN09AB' || (1000 + d.n), d.cat, 'DL-DEV-' || d.n, 'INS-DEV-' || d.n,
       current_date + 365, current_date + 365, true, d.lat, d.lng, 10, now()
FROM (VALUES
  (11,'bike', 13.0418, 80.2341), (12,'auto', 13.0012, 80.2565), (13,'auto', 13.0067, 80.2206),
  (14,'mini', 12.9815, 80.2180), (15,'sedan',13.0850, 80.2101), (16,'suv',  13.0200, 80.1815)
) AS d(n, cat, lat, lng)
JOIN accounts acc ON acc.issuer = 'dev-seed' AND acc.subject = 'demo-driver-' || d.n
ON CONFLICT (user_id) DO UPDATE
SET online = true, status = 'approved', lat = EXCLUDED.lat, lng = EXCLUDED.lng, location_at = now(), updated_at = now();

-- Promote the e2e operator account so the Operator tab is available
UPDATE accounts SET role = 'operator' WHERE email LIKE 'e2e-operator-%@example.invalid';
