// Local deterministic API for Android UI smoke tests; never a production server.
const http = require('node:http');
const details = { id: 'ui-user', name: 'Responsive Test Rider With A Long Name', email: 'ui@example.invalid', phone: '9092112969', phone_verified: true, phone_login: true, has_photo: false, photo_approved: false, created_at: '2026-01-01T00:00:00Z', gender: '', birth_date: null, avatar_color: 'indigo', default_payment: 'cash', default_vehicle: '', company_name: '', business_gstin: '', cost_centre: '', work_email: '', deletion_requested_at: null };
const stats = { rides_taken: 0, rides_cancelled: 0, spent_paise: 0, meters: 0, rating_avg: null, rating_count: 0, wallet_paise: 0, reward_points: 0, drives_completed: 0, saved_places: 0 };

http.createServer((req,res)=>{const captain=req.headers['x-hop-app']==='captain';const bodies={
      '/api/config': { areas: [{ id: 'chennai', name: 'Chennai', min_lat: 12.8, max_lat: 13.2, min_lng: 80, max_lng: 80.4 }], vehicles: [], development: true, phone_login: true },
      '/api/me': { user: { id: 'ui-user', name: details.name, email: details.email, role: 'rider' }, csrf: 'ui-test' },
      '/api/state': { rides: [], driver: captain ? [{ user_id: 'ui-user', area_id: 'chennai', status: 'approved', online: false, vehicle_category: 'auto', vehicle_number: 'TN22EB2250', pickup_radius_meters: 3000, minimum_fare_paise: 0, upi_id: '', review_note: '', location_at: '', license_expires: '2028-01-01', insurance_expires: '2028-01-01' }] : [], offers: [], incidents: [], saved_locations: [] },
      '/api/profile': { details: [details], stats: [stats], contacts: [] },
      '/api/drivers/insights': { totals: [], days: [], areas: [], methods: [], types: [], peak_hours: [], trips: [] },
      '/api/nearby': { nearby: [], drivers: [] },
      '/api/wallet': { balance_paise: 0, entries: [], gateway: false, dev_topup: true },
      '/api/promos': { promos: [] },
      '/api/notifications/new': { notifications: [], now: '2026-10-26T00:00:00Z' },
      '/api/companion': { preferences: { language: 'en', notifications_enabled: true }, notifications: [], referral: [], rewards: [], family: [], favorite_drivers: [], scheduled_rides: [], lost_items: [] },
      '/api/drivers/earnings': { summary: { today_fare_paise: 0, today_completed_trips: 0 }, rides: [] },
      '/api/drivers/wallet': { balance_paise: 0, upi_id: '', min_payout_paise: 10000, ledger: [], payouts: [], daily: [], safety: { score: 100, label: 'Good', cancellations: 0, incidents: 0, rating_avg: 0, ratings: 0, completed_trips: 0 } },
    };const path=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(bodies[path]||{}));}).listen(8080,'127.0.0.1');
