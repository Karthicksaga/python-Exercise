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
async function navigate(page: Page, label: string, width: number) {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  if (width > 820) await sidebar.getByRole('button', { name: label, exact: true }).click();
  else {
    await page.getByRole('button', { name: 'Open app menu', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  }
}
for (const captain of [false, true]) for (const theme of ['light', 'dark']) for (const width of widths) {
  test(`${captain ? 'captain' : 'rider'} ${theme} ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(theme => localStorage.setItem('hop.theme', theme), theme);
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 13.02, longitude: 80.18 });
    await fixture(page, captain);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${captain ? 5174 : 5173}`);
    await expect(page.locator('.page-title')).toBeVisible();
    const tabs = captain ? ['Drive', 'Earnings', 'Vehicle', 'My trips', 'Support', 'Profile'] : ['Book a ride', 'Your rides', 'Support', 'Profile', 'Wallet', 'Safety & more'];
    for (const label of tabs) {
      await navigate(page, label, width);
      if (label === 'Profile') {
        await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
        const palette = await page.locator('.swatches button').evaluateAll(buttons => new Set(buttons.map(button => getComputedStyle(button).backgroundColor)).size);
        expect(palette, 'Avatar color choices must retain their own colors').toBe(6);
      }
      await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', theme);
      if (label === 'Wallet') await expect(page.getByText('Promo codes', { exact: true })).toBeVisible();
      if (label === 'Safety & more') await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => [...document.querySelectorAll('main input, main select, main textarea, main .panel, main .ride-card, header')].filter(el => {
        const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
      }).map(el => `${el.tagName}.${el.className}`));
      expect(overflow, label).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label).toBe(true);
      const name = `${label.replaceAll(/[^a-z0-9]/gi, '-')}.png`;
      if (process.env.VISUAL_BASELINES) await expect(page).toHaveScreenshot(name, { fullPage: true, animations: 'disabled', maxDiffPixelRatio: .01 });
      else await page.screenshot({ path: testInfo.outputPath(name), fullPage: true, animations: 'disabled' });
    }
    expect(errors).toEqual([]);
  });
}

const longAddress = 'Chennai One phase two, Pallavaram - Thoraipakkam Road, Ward 189, Perungudi, A very long apartment address';
const trip = { id: 'ui-trip', status: 'completed', version: 1, pickup_label: longAddress, dropoff_label: longAddress, pickup_lat: 13.02, pickup_lng: 80.18, dropoff_lat: 13.04, dropoff_lng: 80.2, meters: 17000, seconds: 3600, fare_paise: 3000, vehicle_category: 'auto', mine: true, payment_method: 'cash', payment_status: 'driver_reported_received', driver_name: 'Test Captain', vehicle_number: 'TN22EB2250', rider_name: 'Test Rider', created_at: '2026-10-26T00:00:00Z', completed_at: '2026-10-26T01:00:00Z', expires_at: '2099-01-01T00:00:00Z', commission_paise: 0 };
for (const captain of [false, true]) for (const theme of ['light', 'dark']) for (const width of [320, 1024]) {
  for (const scenario of ['signed-out', 'history', ...(captain ? ['onboarding'] : ['live-trip'])]) {
    test(`state ${captain ? 'captain' : 'rider'} ${scenario} ${theme} ${width}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(theme => localStorage.setItem('hop.theme', theme), theme);
      await fixture(page, captain);
      if (scenario === 'signed-out') {
        await page.route('**/api/me', route => route.fulfill({ status: 401, json: { error: 'Sign in' } }));
      } else if (scenario === 'onboarding') {
        await page.route('**/api/state', route => route.fulfill({ json: { rides: [], driver: [], offers: [], incidents: [], saved_locations: [] } }));
        await page.route('**/api/drivers/onboarding', route => route.fulfill({ json: { draft: { step: 1 }, documents: [], has_photo: false, phone_verified: true } }));
      } else {
        await page.route('**/api/state', route => route.fulfill({ json: { rides: [{ ...trip, driving: captain, status: scenario === 'live-trip' ? 'accepted' : 'completed' }, ...(scenario === 'history' ? [{ ...trip, id: 'cancelled', status: 'cancelled', driving: captain }] : [])], driver: [], offers: [], incidents: [], saved_locations: [] } }));
      }
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${captain ? 5174 : 5173}`);
      if (scenario === 'signed-out') await expect(page.locator('input[type="tel"]')).toBeVisible();
      else {
        await expect(page.locator('.page-title')).toBeVisible();
        if (scenario === 'history') await navigate(page, captain ? 'My trips' : 'Your rides', width);
        if (scenario === 'onboarding') await expect(page.getByText('Vehicle & credentials', { exact: false }).first()).toBeVisible();
      }
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath('screen.png'), fullPage: true, animations: 'disabled' });
    });
  }
}
for (const theme of ['light', 'dark']) for (const width of [320, 768, 1024, 1920]) {
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
    await page.route('**/api/quotes', r => r.fulfill({ json: { id: 'quote-ui', meters: 2000, seconds: 600, fare_paise: 6000, vehicle_category: 'auto', vehicle_name: 'Auto-rickshaw', commission_paise: 0, route: [], expires_at: '2099-01-01T00:00:00Z', fare_breakdown: { base_paise: 3000, distance_paise: 3000, minimum_adjustment_paise: 0, platform_fee_paise: 0, total_paise: 6000 } } }));
    await page.goto('http://127.0.0.1:5173');
    await page.getByRole('button', { name: 'Test office', exact: false }).first().click();
    await page.getByRole('button', { name: 'See available rides', exact: true }).click();
    await expect(page.getByRole('radiogroup', { name: 'Choose your ride' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('choose.png'), fullPage: true });
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('.quote')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('confirm.png'), fullPage: true });
  });
}
