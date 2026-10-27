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
const longAddress = 'Chennai One phase two, Pallavaram - Thoraipakkam Road, Ward 189, Perungudi, A very long apartment address';
for (const theme of ['light', 'dark']) for (const width of [320, 768, 1440]) {
  test(`booking steps ${theme} ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(theme => localStorage.setItem('hop.theme', theme), theme);
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 13.02, longitude: 80.18 });
    await fixture(page, false);
    const vehicle = { area_id: 'chennai', category: 'auto', name: 'Auto-rickshaw', base_paise: 3000, per_km_paise: 1500, minimum_paise: 3000, pricing_version: 1, stop_fee_paise: 500, hourly_paise: null, included_km_per_hour: 0, extra_km_paise: 1500, outstation_per_km_paise: null, outstation_allowance_paise: 0 };
    await page.route('**/api/config', r => r.fulfill({ json: { areas: [{ id: 'chennai', name: 'Chennai', min_lat: 12.8, max_lat: 13.2, min_lng: 80, max_lng: 80.4 }], vehicles: [vehicle], development: true, phone_login: true } }));
    await page.route('**/api/state', r => r.fulfill({ json: { rides: [], driver: [], offers: [], incidents: [], saved_locations: [{ id: 'work', label: 'Test office', place_label: longAddress, kind: 'work', lat: 13.04, lng: 80.2 }] } }));
    await page.route('**/api/reverse**', r => r.fulfill({ json: { lat: 13.02, lng: 80.18, label: longAddress } }));
    await page.route('**/api/estimates', r => r.fulfill({ json: { meters: 2000, seconds: 600, route: [], options: [{ category: 'auto', fare_paise: 6000 }] } }));
    await page.route('**/api/quotes', async r => r.fulfill({ json: { id: 'quote-ui', meters: 2000, seconds: 600, fare_paise: 6000, vehicle_category: 'auto', vehicle_name: 'Auto-rickshaw', commission_paise: 0, route: [], expires_at: await page.evaluate(() => new Date(Date.now()+60000).toISOString()), shared_fare_paise: 4800, fare_breakdown: { base_paise: 3000, distance_paise: 3000, minimum_adjustment_paise: 0, platform_fee_paise: 0, total_paise: 6000 } } }));
    const requests: Record<string,unknown>[] = [];
    let failBooking = true;
    await page.route('**/api/rides',route => {
      requests.push(route.request().postDataJSON());
      return route.fulfill(failBooking ? {status:503,json:{error:'Booking temporarily unavailable'}} : {json:{ok:true}});
    });
    await page.goto('http://127.0.0.1:5173');
    await page.getByRole('button', { name: 'Test office', exact: false }).first().click();
    await page.getByRole('button', { name: 'Choose a ride', exact: true }).click();
    await expect(page.getByRole('radiogroup', { name: 'Choose your ride' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('choose.png'), fullPage: true });
    await page.getByRole('button', { name: '← Back', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Choose a ride', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Choose a ride', exact: true }).click();
    await expect(page.getByRole('radio', {name: /Auto-rickshaw/})).toHaveAttribute('aria-checked','true');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('.quote')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('confirm.png'), fullPage: true });
    const request = page.getByRole('button',{name:'Request Auto-rickshaw',exact:true});
    await page.locator('.booking-advanced summary').click();
    const sharing = page.getByRole('switch', {name: /Share this ride and save/});
    await sharing.check();
    await expect(page.locator('.quote .fare')).toContainText('48');
    await expect(page.getByLabel(/Your fare offer/)).toHaveCount(0);
    await sharing.uncheck();
    const offer = page.getByLabel(/Your fare offer/);
    await offer.fill('1');
    await expect(request).toBeDisabled();
    await offer.fill('50');
    await request.click();
    await expect.poll(()=>requests.length).toBe(1);
    expect(requests[0].offer_paise).toBe(5000);
    await expect(page.getByText('Booking temporarily unavailable',{exact:true})).toBeVisible();
    await page.clock.install();
    await page.clock.fastForward(65000);
    await expect(request).toBeDisabled();
    await expect(page.locator('.booking-validity')).toContainText('Quote expired');
    await page.getByRole('button',{name:'Refresh quote',exact:true}).click();
    await expect(request).toBeEnabled();
    // Retry preserves the existing idempotent booking payload.
    failBooking = false;
    await request.click();
    await expect.poll(()=>requests.length).toBe(2);
    await expect(page.getByRole('button',{name:'Choose a ride',exact:true})).toBeVisible();

  });
}
