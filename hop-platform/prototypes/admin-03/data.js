// Sample data for the admin concept 03 preview. Field names follow the live
// /api/operator and /api/admin responses so screens map 1:1 to real data.
// Money is integer paise, as on the server.
window.HOP_DATA = (() => {
  const now = Date.parse('2026-11-04T10:30:00+05:30');
  const ago = (min) => new Date(now - min * 60000).toISOString();
  const ahead = (days) => new Date(now + days * 86400000).toISOString();

  // Tamil Nadu districts from region_catalog (migration 035). city_* is the
  // proposed addition: city limits stored by fetch_districts.py, never fetched at runtime.
  const regions = [
    { id: 'tn-chennai', district: 'Chennai', min_lat: 12.95, max_lat: 13.24, min_lng: 80.15, max_lng: 80.33, city: [12.97, 13.20, 80.17, 80.31] },
    { id: 'tn-madurai', district: 'Madurai', min_lat: 9.55, max_lat: 10.30, min_lng: 77.55, max_lng: 78.45, city: [9.86, 9.99, 78.05, 78.19] },
    { id: 'tn-dindigul', district: 'Dindigul', min_lat: 10.05, max_lat: 10.75, min_lng: 77.25, max_lng: 78.30, city: [10.33, 10.40, 77.93, 78.01] },
    { id: 'tn-coimbatore', district: 'Coimbatore', min_lat: 10.20, max_lat: 11.40, min_lng: 76.65, max_lng: 77.35, city: [10.93, 11.08, 76.90, 77.05] },
    { id: 'tn-trichy', district: 'Tiruchirappalli', min_lat: 10.65, max_lat: 11.35, min_lng: 78.15, max_lng: 79.05, city: [10.73, 10.87, 78.63, 78.76] },
    { id: 'tn-salem', district: 'Salem', min_lat: 11.25, max_lat: 12.05, min_lng: 77.65, max_lng: 78.75, city: [11.60, 11.72, 78.08, 78.21] },
    { id: 'tn-tirunelveli', district: 'Tirunelveli', min_lat: 8.30, max_lat: 9.25, min_lng: 77.15, max_lng: 78.20, city: [8.67, 8.77, 77.65, 77.77] },
    { id: 'tn-erode', district: 'Erode', min_lat: 10.85, max_lat: 11.95, min_lng: 76.95, max_lng: 77.85, city: [11.30, 11.38, 77.67, 77.76] },
    { id: 'tn-vellore', district: 'Vellore', min_lat: 12.55, max_lat: 13.25, min_lng: 78.75, max_lng: 79.45, city: [12.88, 12.98, 79.08, 79.18] },
    { id: 'tn-thanjavur', district: 'Thanjavur', min_lat: 9.85, max_lat: 10.90, min_lng: 78.85, max_lng: 79.65, city: [10.74, 10.82, 79.10, 79.18] },
  ].map((r) => ({ ...r, state: 'Tamil Nadu', source: 'OpenStreetMap (ODbL), fetched Oct 2026' }));

  const areas = [
    { id: 'chennai', catalog_id: 'tn-chennai', name: 'Chennai', state: 'Tamil Nadu', min_lat: 12.95, max_lat: 13.24, min_lng: 80.15, max_lng: 80.33, base_paise: 2500, per_km_paise: 1200, minimum_paise: 3000, active: true, approval_reference: 'TN-TPT/2026/0412', surge_cap: 2.0, surge_auto: true },
    { id: 'madurai', catalog_id: 'tn-madurai', name: 'Madurai', state: 'Tamil Nadu', min_lat: 9.55, max_lat: 10.30, min_lng: 77.55, max_lng: 78.45, base_paise: 2000, per_km_paise: 1000, minimum_paise: 2500, active: true, approval_reference: 'TN-TPT/2026/0977', surge_cap: 1.5, surge_auto: false },
    { id: 'dindigul', catalog_id: 'tn-dindigul', name: 'Dindigul', state: 'Tamil Nadu', min_lat: 10.05, max_lat: 10.75, min_lng: 77.25, max_lng: 78.30, base_paise: 2000, per_km_paise: 1000, minimum_paise: 2500, active: false, approval_reference: '', surge_cap: 1.5, surge_auto: false },
    { id: 'coimbatore', catalog_id: 'tn-coimbatore', name: 'Coimbatore', state: 'Tamil Nadu', min_lat: 10.93, max_lat: 11.08, min_lng: 76.90, max_lng: 77.05, base_paise: 2500, per_km_paise: 1100, minimum_paise: 3000, active: false, approval_reference: '', surge_cap: 1.8, surge_auto: false },
  ];

  const cat = (area_id, category, base, perKm, min, enabled) => ({ area_id, category, base_paise: base, per_km_paise: perKm, minimum_paise: min, enabled, pricing_version: 3 });
  const pricing = [
    cat('chennai', 'auto', 3000, 1500, 4000, true), cat('chennai', 'mini', 5000, 1800, 8000, true),
    cat('chennai', 'sedan', 6000, 2100, 10000, true), cat('chennai', 'suv', 8000, 2600, 14000, true),
    cat('coimbatore', 'auto', 3000, 1400, 4000, false),
  ];

  const vehicles = [
    { category: 'bike', label: 'Bike', stop_fee_paise: 1000, hourly_paise: 0, included_km_per_hour: 10, extra_km_paise: 0, outstation_per_km_paise: 0, outstation_allowance_paise: 0 },
    { category: 'auto', label: 'Auto', stop_fee_paise: 1500, hourly_paise: 19900, included_km_per_hour: 10, extra_km_paise: 1400, outstation_per_km_paise: 0, outstation_allowance_paise: 0 },
    { category: 'mini', label: 'Mini', stop_fee_paise: 2000, hourly_paise: 29900, included_km_per_hour: 10, extra_km_paise: 1600, outstation_per_km_paise: 1100, outstation_allowance_paise: 30000 },
    { category: 'sedan', label: 'Sedan', stop_fee_paise: 2500, hourly_paise: 34900, included_km_per_hour: 10, extra_km_paise: 1800, outstation_per_km_paise: 1300, outstation_allowance_paise: 35000 },
    { category: 'suv', label: 'SUV', stop_fee_paise: 3000, hourly_paise: 44900, included_km_per_hour: 10, extra_km_paise: 2200, outstation_per_km_paise: 1700, outstation_allowance_paise: 40000 },
  ];

  const REQUIRED = ['identity', 'identity_back', 'license', 'license_back', 'rc', 'rc_back', 'insurance'];
  const docs = (overrides = {}) => [...REQUIRED, 'police'].map((kind) => ({
    kind, status: overrides[kind] ?? (kind === 'police' ? 'missing' : 'pending'), reason: '', versions: kind === 'license' ? 2 : 1,
  }));
  const applicants = [
    { id: 'c1', name: 'Arun Kumar', phone: '+91 98401 22871', vehicle_category: 'bike', vehicle_number: 'TN 59 BK 4410', area_id: 'madurai', submitted_at: ago(212), photo: true, gender: 'male', documents: docs({ police: 'pending' }), status: 'pending', claimed_by: null },
    { id: 'c2', name: 'Priya Selvam', phone: '+91 90031 55190', vehicle_category: 'auto', vehicle_number: 'TN 09 AX 2231', area_id: 'chennai', submitted_at: ago(165), photo: true, gender: 'female', documents: docs({ identity: 'accepted', identity_back: 'accepted' }), status: 'pending', claimed_by: null, pink_requested: true },
    { id: 'c3', name: 'Mohammed Irfan', phone: '+91 97910 08342', vehicle_category: 'sedan', vehicle_number: 'TN 22 CQ 9081', area_id: 'chennai', submitted_at: ago(96), photo: true, gender: 'male', documents: docs({ insurance: 'rejected' }), status: 'pending', claimed_by: 'Divya R.' },
    { id: 'c4', name: 'Lakshmi Narayanan', phone: '+91 94440 71236', vehicle_category: 'mini', vehicle_number: 'TN 10 BZ 7712', area_id: 'chennai', submitted_at: ago(54), photo: false, gender: 'male', documents: docs(), status: 'pending', claimed_by: null },
    { id: 'c5', name: 'Sathish Babu', phone: '+91 99620 33015', vehicle_category: 'bike', vehicle_number: 'TN 58 AB 1093', area_id: 'madurai', submitted_at: ago(31), photo: true, gender: 'male', documents: docs(), status: 'pending', claimed_by: null },
    { id: 'c6', name: 'Revathi Mani', phone: '+91 96000 48127', vehicle_category: 'auto', vehicle_number: 'TN 07 CA 5520', area_id: 'chennai', submitted_at: ago(12), photo: true, gender: 'female', documents: docs(), status: 'pending', claimed_by: null },
  ];
  applicants[2].documents.find((d) => d.kind === 'insurance').reason = 'expired';

  const expiring = [
    { id: 'e1', name: 'Karthik Raja', vehicle_number: 'TN 09 BB 1180', area: 'Chennai', document: 'insurance', expires: ahead(1) },
    { id: 'e2', name: 'Vignesh P.', vehicle_number: 'TN 59 AK 2310', area: 'Madurai', document: 'license', expires: ahead(6) },
    { id: 'e3', name: 'Anitha J.', vehicle_number: 'TN 22 BD 7781', area: 'Chennai', document: 'insurance', expires: ahead(7) },
    { id: 'e4', name: 'Ramesh K.', vehicle_number: 'TN 10 AZ 4402', area: 'Chennai', document: 'license', expires: ahead(23) },
  ];
  const vehicle_changes = [
    { id: 'v1', name: 'Senthil Kumar', current_category: 'auto', current_number: 'TN 09 AB 1133', vehicle_category: 'mini', vehicle_number: 'TN 09 CZ 8820', created_at: ago(300) },
  ];
  const area_changes = [
    { id: 'a1', name: 'Gokul Raj', current_area_name: 'Chennai', current_area_state: 'Tamil Nadu', requested_area_name: 'Madurai', requested_area_state: 'Tamil Nadu', created_at: ago(140) },
  ];

  // Live dispatch (Chennai). status: available | on_trip | offline
  let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const names = ['Ravi', 'Suresh', 'Ganesh', 'Murugan', 'Bala', 'Hari', 'Dinesh', 'Prakash', 'Kumar', 'Mani', 'Vijay', 'Ajith', 'Saravanan', 'Arjun', 'Naveen', 'Kavin', 'Siva', 'Ashok', 'Yusuf', 'Joseph'];
  const cats = ['bike', 'bike', 'bike', 'auto', 'auto', 'mini', 'sedan', 'suv'];
  const drivers = names.map((n, i) => ({
    user_id: 'd' + i, name: n, vehicle_category: cats[i % cats.length], vehicle_number: `TN ${String(1 + (i * 7) % 20).padStart(2, '0')} ${'ABCDEFGH'[i % 8]}${'KLMNPQRS'[(i * 3) % 8]} ${1000 + i * 373 % 9000}`,
    online: i % 6 !== 5, status: i % 6 === 5 ? 'offline' : i % 4 === 0 ? 'on_trip' : 'available',
    lat: 12.98 + rnd() * 0.22, lng: 80.17 + rnd() * 0.14, location_at: ago(Math.floor(rnd() * 4)),
  }));

  const ride = (id, status, rider, driver, cat, from, to, fare, pay, payStatus, min, p, d, refunded = 0) => ({
    id, status, rider, rider_name: rider, driver, driver_name: driver, vehicle_category: cat, pickup_label: from, dropoff_label: to,
    fare_paise: fare, discount_paise: 0, payable_paise: fare, refunded_paise: refunded, payment_method: pay, payment_status: payStatus, created_at: ago(min),
    pickup_lat: p[0], pickup_lng: p[1], dropoff_lat: d[0], dropoff_lng: d[1],
  });
  const rides = [
    ride('r-8f21c4a0', 'in_progress', 'Meena S.', 'Ravi', 'bike', 'T. Nagar', 'Chennai Central', 14200, 'upi', 'pending', 9, [13.04, 80.234], [13.083, 80.275]),
    ride('r-77ad91e2', 'accepted', 'Rahul V.', 'Ganesh', 'auto', 'Adyar', 'Besant Nagar', 9800, 'cash', 'pending', 4, [13.006, 80.257], [12.999, 80.271]),
    ride('r-3c0b5512', 'arrived', 'Fatima K.', 'Bala', 'sedan', 'Anna Nagar', 'Chennai Airport', 52400, 'upi', 'pending', 14, [13.085, 80.21], [12.99, 80.17]),
    ride('r-91e3aa07', 'requested', 'Deepak N.', '', 'mini', 'Velachery', 'OMR Thoraipakkam', 31800, 'wallet', 'pending', 1, [12.979, 80.218], [12.94, 80.233]),
    ride('r-5d2210fe', 'completed', 'Asha P.', 'Suresh', 'bike', 'Mylapore', 'Egmore', 11800, 'upi', 'paid', 52, [13.033, 80.268], [13.073, 80.26]),
    ride('r-c41f8a3b', 'completed', 'Kiran M.', 'Hari', 'auto', 'Guindy', 'Saidapet', 8600, 'cash', 'paid', 75, [13.007, 80.22], [13.022, 80.224], 2000),
    ride('r-0aa61c90', 'cancelled', 'Nithya R.', 'Dinesh', 'sedan', 'Nungambakkam', 'Porur', 38900, 'upi', 'void', 96, [13.06, 80.243], [13.035, 80.157]),
    ride('r-ee5b7231', 'completed', 'Sanjay T.', 'Prakash', 'suv', 'Tambaram', 'Chennai Airport', 64500, 'card', 'paid', 130, [12.925, 80.12], [12.99, 80.17]),
    ride('r-2b9cc4d8', 'completed', 'Divya L.', 'Kumar', 'mini', 'Kodambakkam', 'Vadapalani', 9900, 'wallet', 'paid', 180, [13.052, 80.225], [13.05, 80.212]),
    ride('r-6f7e0a11', 'cancelled', 'Arvind B.', '', 'auto', 'Perambur', 'Kilpauk', 10200, 'cash', 'void', 210, [13.115, 80.233], [13.083, 80.242]),
  ];

  const sos_events = [
    { id: 's1', ride_id: 'r-3c0b5512', rider_name: 'Fatima K.', rider_email: 'fatima.k@example.com', driver_name: 'Bala', vehicle_number: 'TN 05 DQ 2238', ride_status: 'arrived', pickup_label: 'Anna Nagar', dropoff_label: 'Chennai Airport', lat: 13.085, lng: 80.21, created_at: ago(3), incident_status: 'open', resolution: '' },
    { id: 's2', ride_id: 'r-5d2210fe', rider_name: 'Asha P.', rider_email: 'asha.p@example.com', driver_name: 'Suresh', vehicle_number: 'TN 02 BL 1119', ride_status: 'completed', pickup_label: 'Mylapore', dropoff_label: 'Egmore', lat: 13.05, lng: 80.264, created_at: ago(1440), incident_status: 'closed', resolution: 'Called rider; accidental press. Confirmed safe at destination.' },
  ];
  const incidents = [
    { id: 'i1', ride_id: 'r-c41f8a3b', status: 'open', message: 'Captain asked for extra cash above the fare shown in the app.', reporter: 'Kiran M.', created_at: ago(70), resolution: '' },
    { id: 'i2', ride_id: 'r-0aa61c90', status: 'reviewing', message: 'Captain cancelled after waiting 2 minutes and I was charged a cancellation fee.', reporter: 'Nithya R.', created_at: ago(90), resolution: 'Checking trip timeline with the captain.' },
  ];
  const lost_items = [
    { id: 'l1', ride_id: 'r-ee5b7231', description: 'Black laptop bag left on the back seat', status: 'open', rider_name: 'Sanjay T.', driver_name: 'Prakash', vehicle_number: 'TN 11 CK 4419', ride_date: ago(130), created_at: ago(100) },
    { id: 'l2', ride_id: 'r-2b9cc4d8', description: 'Blue umbrella', status: 'driver_contacted', rider_name: 'Divya L.', driver_name: 'Kumar', vehicle_number: 'TN 09 AH 7781', ride_date: ago(180), created_at: ago(160) },
    { id: 'l3', ride_id: 'r-5d2210fe', description: 'Spectacles in a brown case', status: 'returned', rider_name: 'Asha P.', driver_name: 'Suresh', vehicle_number: 'TN 02 BL 1119', ride_date: ago(52), created_at: ago(2000) },
  ];
  const driver_safety = [
    { driver_id: 'd0', name: 'Ravi', score: 96, label: 'Excellent', cancellations: 1, incidents: 0, rating_avg: 4.9, completed_trips: 412 },
    { driver_id: 'd2', name: 'Ganesh', score: 91, label: 'Good', cancellations: 3, incidents: 0, rating_avg: 4.8, completed_trips: 288 },
    { driver_id: 'd4', name: 'Bala', score: 84, label: 'Good', cancellations: 5, incidents: 1, rating_avg: 4.6, completed_trips: 190 },
    { driver_id: 'd6', name: 'Dinesh', score: 68, label: 'Watch', cancellations: 11, incidents: 1, rating_avg: 4.3, completed_trips: 97 },
    { driver_id: 'd7', name: 'Hari', score: 52, label: 'At risk', cancellations: 14, incidents: 2, rating_avg: 4.0, completed_trips: 64 },
  ];

  const finance = {
    totals: { driver_liability_paise: 18452000, promo_funded_paise: 1239000, refunded_paise: 482000, wallet_held_paise: 3317500 },
    payouts: [
      { id: 'p1', name: 'Ravi', amount_paise: 425000, upi_id: 'ravi.k@okaxis', status: 'requested', reference: '', requested_at: ago(180) },
      { id: 'p2', name: 'Ganesh', amount_paise: 318050, upi_id: 'ganesh88@ybl', status: 'requested', reference: '', requested_at: ago(95) },
      { id: 'p3', name: 'Murugan', amount_paise: 112000, upi_id: 'murugan.t@oksbi', status: 'requested', reference: '', requested_at: ago(20) },
      { id: 'p4', name: 'Bala', amount_paise: 287500, upi_id: 'bala.s@okhdfc', status: 'paid', reference: 'UPI 431902118827', requested_at: ago(1600) },
    ],
    refunds: [{ id: 'f1', rider: 'Kiran M.', amount_paise: 2000, reason: 'Overcharged in cash', created_at: ago(60) }],
    promos: [
      { code: 'HOPFIRST', description: 'First ride 50% off up to ₹75', kind: 'percent', value: 50, active: true, valid_to: ahead(40), redemptions: 1284, max_uses: 5000 },
      { code: 'MADURAI30', description: '₹30 off bike rides in Madurai', kind: 'flat', value: 3000, active: true, valid_to: ahead(12), redemptions: 211, max_uses: 1000 },
      { code: 'DIWALI25', description: '25% off, festival week', kind: 'percent', value: 25, active: false, valid_to: ahead(-3), redemptions: 3120, max_uses: null },
    ],
    peak_windows: [
      { id: 'w1', area: 'chennai', label: 'Morning office rush', days: [1, 2, 3, 4, 5], start_time: '08:00', end_time: '10:30', multiplier: 1.3 },
      { id: 'w2', area: 'chennai', label: 'Evening rush', days: [1, 2, 3, 4, 5], start_time: '17:30', end_time: '20:30', multiplier: 1.4 },
    ],
    surges: [{ id: 'u1', area: 'chennai', category: null, multiplier: 1.5, reason: 'Heavy rain, low supply', ends_at: ahead(0.04) }],
  };

  const analytics = {
    gmv_today_paise: 18624000, gmv_all_time_paise: 2948410000, commission_all_time_paise: 294841000,
    completed_rides: 1342, cancelled_rides: 96, total_rides: 1438, active_drivers: 186, total_drivers: 412, total_riders: 9840,
    volume: [['Thu', 1180, 1101], ['Fri', 1325, 1240], ['Sat', 1512, 1418], ['Sun', 1460, 1372], ['Mon', 1210, 1138], ['Tue', 1288, 1207], ['Wed', 1438, 1342]].map(([day, count, completed]) => ({ day, count, completed })),
    payments: [{ payment_method: 'upi', count: 792, total_paise: 10450000 }, { payment_method: 'cash', count: 381, total_paise: 4410000 }, { payment_method: 'wallet', count: 118, total_paise: 2380000 }, { payment_method: 'card', count: 51, total_paise: 1384000 }],
  };

  const events = [
    ['sos.raised', 3, 'Fatima K. · ride r-3c0b5512'], ['ride.cancelled_by_operator', 41, 'r-6f7e0a11 · rider no-show'], ['refund.created', 60, '₹20.00 · Kiran M.'],
    ['driver.document_rejected', 96, 'Mohammed Irfan · insurance · expired'], ['pricing.updated', 140, 'Chennai · sedan · v3'], ['area.updated', 200, 'Madurai · activated'],
    ['payout.paid', 1600, 'Bala · ₹2,875.00'], ['promo.created', 2200, 'MADURAI30'], ['driver.approved', 2600, 'Vignesh P.'], ['surge.started', 3000, 'Chennai · 1.5× · rain'],
  ].map(([action, min, detail], i) => ({ id: 100 - i, action, detail, actor: i % 3 ? 'Divya R.' : 'Karthick T.', created_at: ago(min) }));

  return { now, regions, areas, pricing, vehicles, applicants, expiring, vehicle_changes, area_changes, drivers, rides, sos_events, incidents, lost_items, driver_safety, finance, analytics, events, REQUIRED };
})();
