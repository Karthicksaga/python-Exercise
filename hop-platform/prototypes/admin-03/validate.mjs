// Run with the preview server on :5296 (see README):  node hop-platform/prototypes/admin-03/validate.mjs
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');

const out = fileURLToPath(new URL('./evidence/', import.meta.url)); mkdirSync(out, { recursive: true });
const URL_ = 'http://127.0.0.1:5296/';
const browser = await chromium.launch();
const results = [];
const combos = [['light', 390, 844], ['light', 768, 1024], ['light', 1280, 900], ['light', 1600, 1000], ['dark', 390, 844], ['dark', 1280, 900]];

for (const [theme, width, height] of combos) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' }), errors = [], api = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (/\/api\/|\/auth\//.test(r.url())) api.push(r.url()); });
  await page.goto(`${URL_}?theme=${theme}`); await page.evaluate(() => document.fonts.ready);
  const views = await page.evaluate(() => hopAdmin.views);
  for (const view of [...views, 'signin']) {
    await page.evaluate((v) => hopAdmin.go(v === 'signin' ? 'overview' : v), view);
    if (view === 'signin') await page.evaluate(() => document.querySelector('[data-act=signout]').click());
    const issues = await page.evaluate(() => {
      const issues = [], W = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > W + 1) issues.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${W})`);
      for (const el of document.querySelectorAll('button,input,select,textarea,a.btn')) {
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
        if (el.closest('.side') && getComputedStyle(document.querySelector('.side')).transform !== 'none') continue; // closed drawer
        if (el.closest('.table-wrap') || el.closest('.tabs')) continue; // scroll containers
        const name = el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30) || el.id || el.type;
        if (el.type !== 'checkbox' && (r.height < 31.5 || r.width < 31.5)) issues.push(`${name}: target ${Math.round(r.width)}×${Math.round(r.height)}`);
        if (r.right > W + 1 || r.left < -1) issues.push(`${name}: outside viewport`);
      }
      for (const w of document.querySelectorAll('.card, .drawer-body')) if (w.scrollWidth > w.clientWidth + 2 && !w.querySelector('.table-wrap')) issues.push(`card overflow in ${w.querySelector('h2,h3')?.textContent ?? 'card'}`);
      return [...new Set(issues)];
    });
    expect(issues, `${view} ${width}px ${theme}`).toEqual([]);
    await page.screenshot({ path: `${out}/${view}-${width}${theme === 'dark' ? '-dark' : ''}.png`, fullPage: true, animations: 'disabled' });
    results.push({ view, width, theme });
  }
  expect(errors).toEqual([]); expect(api).toEqual([]);
  await page.close();
}

// Connected interactions at desktop width
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }), errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${URL_}#zones`);
// Madurai starts as the whole district and overlaps Dindigul.
await expect(page.locator('.m-zone-overlap')).toHaveCount(1);
const before = await page.inputValue('#z-max_lat');
const handle = page.locator('[data-h=ne] .m-handle-hit');
const box = await handle.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 + 80, { steps: 6 }); await page.mouse.up();
expect(Number(await page.inputValue('#z-max_lat'))).toBeLessThan(Number(before));
await page.getByRole('button', { name: 'City limits' }).click();
await expect(page.locator('.m-zone-overlap')).toHaveCount(0);
expect(await page.inputValue('#z-max_lat')).toBe('9.99');
// Activation needs an approval reference.
await page.fill('#z-ref', '');
await page.getByRole('button', { name: 'Save and open bookings' }).click({ force: true });
await expect(page.getByText('Add the approval reference to open bookings')).toBeVisible();
await page.fill('#z-ref', 'TN-TPT/2026/0977');
await page.getByRole('button', { name: 'Save and open bookings' }).click();
await expect(page.locator('.toast').last()).toContainText('Madurai saved');
await page.screenshot({ path: `${out}/flow-zone-city.png`, animations: 'disabled' });

// New zone from a district starts at the city limits.
await page.getByRole('button', { name: 'New zone' }).click();
await page.selectOption('[data-act=zdistrict]', 'tn-trichy');
expect(await page.inputValue('#z-min_lat')).toBe('10.73');

// Captain review: approve is blocked until every document is accepted and a note is written.
await page.evaluate(() => hopAdmin.go('reviews'));
await page.getByRole('button', { name: 'Approve captain' }).click({ force: true });
await expect(page.locator('.toast').last()).toContainText('Before you can approve');
for (const b of await page.locator('.doc-actions .ok').all()) { if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click(); }
await page.fill('#rv-note', 'All documents verified.');
await page.getByRole('button', { name: 'Approve captain' }).click();
await expect(page.locator('.toast').last()).toContainText('Arun Kumar is approved');

// Refund validation and SOS resolve.
await page.evaluate(() => hopAdmin.go('rides'));
await page.locator('tr', { hasText: 'Asha P.' }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Refund' }).click();
await page.fill('#m-amt', '500');
await page.getByRole('dialog').getByRole('button', { name: 'Refund', exact: true }).click();
await expect(page.getByText('Enter between ₹1 and ₹118')).toBeVisible();
await page.keyboard.press('Escape');
await page.evaluate(() => hopAdmin.go('safety'));
await page.getByRole('button', { name: 'Resolve', exact: true }).click();
await page.fill('#m-reason', 'Called rider, confirmed safe.');
await page.getByRole('button', { name: 'Resolve SOS' }).click();
await expect(page.locator('.sos-pill')).toHaveCount(0);
expect(errors).toEqual([]);
await browser.close();

writeFileSync(`${out}/validation.json`, JSON.stringify({ checked: results.length, results, interactions: ['zone drag', 'city limits fit', 'activation needs reference', 'new zone from district', 'approval blockers', 'refund limit', 'SOS resolve'] }, null, 2));
console.log(`Passed ${results.length} screen/width/theme combinations and 7 connected flows.`);
