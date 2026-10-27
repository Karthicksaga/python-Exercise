import { test, expect, type Page } from '@playwright/test';
const widths = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920];
const details = { id: 'ui-user', name: 'Responsive Test Rider With A Long Name', email: 'ui@example.invalid', phone: '9092112969', phone_verified: true, phone_login: true, has_photo: false, photo_approved: false, created_at: '2026-01-01T00:00:00Z', gender: '', birth_date: null, avatar_color: 'indigo', default_payment: 'cash', default_vehicle: '', company_name: '', business_gstin: '', cost_centre: '', work_email: '', deletion_requested_at: null };
const stats = { rides_taken: 0, rides_cancelled: 0, spent_paise: 0, meters: 0, rating_avg: null, rating_count: 0, wallet_paise: 0, reward_points: 0, drives_completed: 0, saved_places: 0 };
async function fixture(page: Page, captain: boolean) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const bodies: Record<string, unknown> = {
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
    };
    if (!(path in bodies)) return route.fulfill({ status: 404, json: { error: `Unmocked endpoint: ${path}` } });
    return route.fulfill({ json: bodies[path] });
  });
}

for (const width of [320,375,390,430,768,1024,1440]) for (const theme of ['light','dark']) {
 test(`safety ${width} ${theme}`, async ({page}) => {
  await page.setViewportSize({width,height:950});
  await page.addInitScript(t => localStorage.setItem('hop.theme',t),theme);
  await fixture(page,false);
  let prefs = { language: 'en', notifications_enabled: true, large_text: false, wheelchair_access: false };
  const writes: string[] = [];
  await page.route('**/api/companion',route => route.fulfill({json:{preferences:prefs,notifications:[],referral:[{code:'ABCDEFGH',points:100,referred:1,redeemed:false}],rewards:[],family:[],favorite_drivers:[],scheduled_rides:[],lost_items:[]}}));
  await page.route('**/api/preferences',route => { prefs=route.request().postDataJSON(); return route.fulfill({json:{ok:true}}); });
  for(const path of ['/api/referrals/redeem','/api/family/invite']) await page.route(`**${path}`,route => { writes.push(path); return route.fulfill({json:{ok:true}}); });
  await page.goto('http://127.0.0.1:5173');
  if(width>820) await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('button',{name:'Safety & more',exact:true}).click();
  else { await page.getByRole('button',{name:'Open app menu',exact:true}).click(); await page.getByRole('dialog').getByRole('button',{name:'Safety & more',exact:true}).click(); }
  const card=page.locator('.safety-dashboard');
  await expect(card.getByText("You're all caught up!")).toBeVisible();
  await expect(card.getByText('No favorite drivers yet')).toBeVisible();
  await expect(card.getByRole('heading',{name:'Scheduled rides',exact:true})).toBeVisible();
  await expect(card.getByRole('heading',{name:'Report a lost item',exact:true})).toBeVisible();
  await card.getByLabel('Wheelchair-accessible vehicle needed').click();
  await expect(card.getByLabel('Wheelchair-accessible vehicle needed')).toBeChecked();
  await card.getByLabel('Larger text',{exact:true}).click();
  await expect(card.getByLabel('Larger text',{exact:true})).toBeChecked();
  await card.getByLabel("Friend's referral code").fill('ABCDEFGH');
  await card.getByRole('button',{name:'Apply',exact:true}).click();
  await expect.poll(()=>writes.includes('/api/referrals/redeem')).toBe(true);
  await card.getByLabel('Family member email').fill('family@example.com');
  await card.getByRole('button',{name:'Invite',exact:true}).click();
  await expect.poll(()=>writes.includes('/api/family/invite')).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await card.screenshot({path:`/private/tmp/hop-safety-${width}-${theme}.png`});
 });
}
