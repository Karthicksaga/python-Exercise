// Compact redesign (Nov 2026): slide to accept / complete, the header online switch, the early-finish
// question and the cash change helper.
import { test, expect } from "@playwright/test";

const ride = {
  id: "slide-ride",
  version: 3,
  pickup_lat: 13.0067,
  pickup_lng: 80.2206,
  dropoff_lat: 12.99,
  dropoff_lng: 80.17,
  pickup_label: "Adyar",
  dropoff_label: "Airport",
  vehicle_category: "auto",
  payment_method: "cash",
  fare_paise: 26800,
  payable_paise: 26800,
};

async function setup(page, state) {
  await page.route("https://**", (r) => r.abort());
  await page.route(/^http:\/\/127\.0\.0\.1:518[34]\/api\//, (r) => r.fulfill({ json: {} }));
  await page.route("**/api/me", (r) => r.fulfill({ json: { user: { id: "captain" }, csrf: "csrf" } }));
  await page.route("**/api/config", (r) => r.fulfill({ json: { areas: [], vehicles: [], development: true } }));
  await page.route("**/api/state", (r) => r.fulfill({ json: state() }));
}

async function slide(page, name) {
  const knob = page.getByRole("button", { name, exact: true });
  const track = page.locator(".hop-slide").filter({ has: knob });
  const k = await knob.boundingBox(), t = await track.boundingBox();
  await page.mouse.move(k.x + k.width / 2, k.y + k.height / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + t.width - 8, k.y + k.height / 2, { steps: 12 });
  await page.mouse.up();
}

test("captain accepts by sliding; a plain tap does nothing", async ({ page }) => {
  const actions = [];
  await setup(page, () => ({ rides: [], offers: [{ ...ride, status: "requested" }], driver: [{ online: true, status: "approved" }] }));
  await page.route("**/api/rides/slide-ride/actions", (r) => {
    actions.push(r.request().postDataJSON());
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("http://127.0.0.1:5184");
  const knob = page.getByRole("button", { name: "Accept ride", exact: true });
  await expect(knob).toBeVisible();
  await expect(page.locator(".hop-slide-text")).toHaveText("Slide to accept");
  await knob.click();
  await page.waitForTimeout(400);
  expect(actions).toEqual([]);
  await slide(page, "Accept ride");
  await expect.poll(() => actions.length).toBe(1);
  expect(actions[0]).toMatchObject({ action: "accept", version: 3 });
});

test("completing far from the drop-off asks first and sends confirm only after yes", async ({ page }) => {
  const actions = [];
  let asked = "";
  await setup(page, () => ({ rides: [{ ...ride, status: "in_progress", driving: true, mine: false }], offers: [], driver: [{ online: true, status: "approved" }] }));
  await page.route("**/api/rides/slide-ride/actions", (r) => {
    const body = r.request().postDataJSON();
    actions.push(body);
    if (!body.confirm)
      return r.fulfill({ status: 409, json: { error: "Early finish: you are about 3.0 km from the destination. The fare becomes ₹25 for the distance covered unless the rider approves the full fare." } });
    return r.fulfill({ json: { ok: true } });
  });
  page.on("dialog", (dialog) => {
    asked = dialog.message();
    void dialog.accept();
  });
  await page.goto("http://127.0.0.1:5184");
  await expect(page.locator(".hop-slide-text")).toHaveText("Slide to complete trip");
  await slide(page, "Complete trip");
  await expect.poll(() => actions.length).toBe(2);
  expect(asked).toContain("Early finish");
  expect(actions[0]).toMatchObject({ action: "complete" });
  expect(actions[0].confirm).toBeUndefined();
  expect(actions[1]).toMatchObject({ action: "complete", confirm: true });
});

test("an approved captain's online control is a header switch", async ({ page }) => {
  await setup(page, () => ({ rides: [], offers: [], driver: [{ online: true, status: "approved" }] }));
  await page.goto("http://127.0.0.1:5184");
  const toggle = page.locator('.app-head [data-action="online"]');
  await expect(toggle).toHaveText("Online");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".action-bar [data-action='online']")).toHaveCount(0);
});

test("captain cash screen shows the change to give back", async ({ page }) => {
  await setup(page, () => ({ rides: [{ ...ride, status: "completed", driving: true, mine: true, payment_status: "unconfirmed" }], offers: [], driver: [{ status: "approved" }] }));
  await page.goto("http://127.0.0.1:5184");
  await page.getByRole("button", { name: "Trips", exact: true }).click();
  await page.getByRole("tab", { name: "Past", exact: true }).click();
  await page.getByRole("button", { name: "Receipt", exact: true }).click();
  await expect(page.locator(".cash-change-result")).toHaveText("Tap what the rider gave");
  await page.getByRole("radio", { name: "₹500" }).click();
  await expect(page.locator(".cash-change-result")).toContainText("Give back");
  await expect(page.locator(".cash-change-result")).toContainText("232.00");
  await page.getByRole("radio", { name: "Exact" }).click();
  await expect(page.locator(".cash-change-result")).toContainText("No change");
});

test("rider swipes across Activity tabs: Ongoing → Upcoming → Past and back", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, () => ({ rides: [{ ...ride, status: "completed", mine: true, payment_status: "paid_online", created_at: new Date().toISOString() }], offers: [], driver: [] }));
  await page.goto("http://127.0.0.1:5183");
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const tab = (name) => page.getByRole("tab", { name, exact: true });
  await expect(tab("Ongoing")).toHaveAttribute("aria-selected", "true");
  const swipe = async (from, to) => {
    await page.mouse.move(from, 500);
    await page.mouse.down();
    await page.mouse.move(to, 505, { steps: 6 });
    await page.mouse.up();
  };
  await swipe(330, 60);
  await expect(tab("Upcoming")).toHaveAttribute("aria-selected", "true");
  await swipe(330, 60);
  await expect(tab("Past")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".activity-card")).toHaveCount(1);
  await swipe(330, 60); // already on the last tab: stays
  await expect(tab("Past")).toHaveAttribute("aria-selected", "true");
  await swipe(60, 330);
  await expect(tab("Upcoming")).toHaveAttribute("aria-selected", "true");
});

// ── Phase 1 of the approved prototype ──
import { setupMockBackend } from "./support/mockBackend.mjs";

test("rider at pickup sees the shared free-wait clock and can light up the pickup beacon", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const arrived = { ...ride, status: "arrived", mine: true, driver_name: "Murugan S", vehicle_number: "TN 59 AB 4821", pickup_code: "431602", arrived_at: new Date(Date.now() - 60000).toISOString() };
  await setup(page, () => ({ rides: [arrived], offers: [], driver: [] }));
  await page.goto("http://127.0.0.1:5183");
  await expect(page.locator(".live-trip-sheet .hop-wait strong")).toContainText("Free wait 1:");
  await expect(page.locator(".live-trip-sheet .hop-wait small")).toContainText("Murugan sees the same clock");
  await page.locator(".hop-beacon-row").click();
  await expect(page.locator(".hop-beacon")).toContainText("Murugan is looking for a");
  await page.locator(".hop-beacon").click();
  await expect(page.locator(".hop-beacon")).toHaveCount(0);
});

test("captain at pickup sees the same clock and which colour to look for; a tap on a slide does nothing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const actions = [];
  const arrived = { ...ride, status: "arrived", driving: true, mine: false, passenger_name: "Deepa R", arrived_at: new Date(Date.now() - 200000).toISOString() };
  await setup(page, () => ({ rides: [arrived], offers: [], driver: [{ online: true, status: "approved" }] }));
  await page.route("**/api/rides/slide-ride/actions", (r) => { actions.push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true } }); });
  await page.goto("http://127.0.0.1:5184");
  await expect(page.locator(".hop-wait strong")).toContainText("Waiting 0:");
  await expect(page.locator(".hop-beacon-hint")).toContainText("Look for a");
  await expect(page.locator(".hop-beacon-hint")).toContainText("Deepa");
  await page.getByRole("button", { name: "Verify & start ride" }).click();
  await page.waitForTimeout(300);
  expect(actions).toEqual([]);
});

test("on the trip there is no Message button for the captain", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, () => ({ rides: [{ ...ride, status: "in_progress", driving: true, mine: false }], offers: [], driver: [{ online: true, status: "approved" }] }));
  await page.goto("http://127.0.0.1:5184");
  await expect(page.locator(".hop-slide-text")).toHaveText("Slide to complete trip");
  await expect(page.locator('.circle-actions [data-go="chat"]')).toBeHidden();
});

test("payment page tells the fare story, including an early finish", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const done = { ...ride, status: "completed", driving: true, mine: true, payment_status: "unconfirmed", fare_paise: 2500, payable_paise: 2500, quoted_fare_paise: 7700, adjusted_from_paise: 7700, covered_meters: 3100, meters: 7800, wait_charge_paise: 0 };
  await setup(page, () => ({ rides: [done], offers: [], driver: [{ status: "approved" }] }));
  await page.goto("http://127.0.0.1:5184");
  await page.getByRole("button", { name: "Trips", exact: true }).click();
  await page.getByRole("tab", { name: "Past", exact: true }).click();
  await page.getByRole("button", { name: "Receipt", exact: true }).click();
  const story = page.locator(".hop-fare-story");
  await expect(story).toContainText("Fare locked at booking");
  await expect(story).toContainText("Trip ended after 3.1 km");
  await expect(story).toContainText("−₹52");
  await expect(story).toContainText("₹25");
});

test("one photo sheet for both apps, and sub-page main actions are docked full width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupMockBackend(page, { role: "rider" });
  await page.goto("http://127.0.0.1:5183");
  await expect(page.locator("#hop-launch")).toHaveCount(0, { timeout: 15000 });
  await page.evaluate(() => window.prototypeBridge.go("personal"));
  await page.getByRole("button", { name: "Change photo" }).click();
  const sheet = page.getByRole("dialog", { name: "Profile photo" });
  await expect(sheet.getByRole("button", { name: "Take a photo" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Choose from gallery" })).toBeVisible();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".hop-photo-sheet")).toHaveCount(0);
  await page.evaluate(() => window.prototypeBridge.go("family"));
  const invite = page.locator('.action-bar [data-modal="family-invite"]');
  await expect(invite).toBeVisible();
  const bar = await page.locator(".action-bar").boundingBox(), b = await invite.boundingBox();
  expect(Math.abs(b.width - bar.width)).toBeLessThan(1);
});

// ── Phases 2 and 3 of the approved prototype ──
test("captain sees the rider's notes on the request", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, () => ({ rides: [], offers: [{ ...ride, status: "requested", rider_notes: ["quiet", "luggage"] }], driver: [{ online: true, status: "approved" }] }));
  await page.goto("http://127.0.0.1:5184");
  await expect(page.locator(".driver-sheet .hop-notes-card")).toContainText("Quiet ride · Luggage");
});

test("after 4 hours online the captain is offered a chai break, which pauses requests", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const posts = [];
  let driver = { online: true, status: "approved", online_since: new Date(Date.now() - 4.5 * 3600e3).toISOString() };
  await setup(page, () => ({ rides: [], offers: [], driver: [driver] }));
  await page.route("**/api/drivers/break", (r) => {
    const body = r.request().postDataJSON();
    posts.push(body);
    driver = { ...driver, break_until: body.minutes ? new Date(Date.now() + body.minutes * 60e3).toISOString() : null };
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("http://127.0.0.1:5184");
  const card = page.locator(".hop-break");
  await expect(card).toContainText("4 h 30 min on the road");
  await card.getByRole("button", { name: "15 min break" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ minutes: 15 });
  await expect(card).toContainText("On a chai break");
  await card.getByRole("button", { name: "End break" }).click();
  await expect.poll(() => posts.at(-1)).toEqual({ minutes: 0 });
});

test("rider on a trip can turn on the arrival alert; test mode says texts are only logged", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const posts = [];
  let trip = { ...ride, status: "in_progress", mine: true, driver_name: "Murugan S", vehicle_number: "TN 59 AB 4821" };
  await setup(page, () => ({ rides: [trip], offers: [], driver: [] }));
  await page.route("**/api/config", (r) => r.fulfill({ json: { areas: [], vehicles: [], development: true, sms_test_mode: true } }));
  await page.route("**/api/rides/slide-ride/alerts", (r) => {
    const body = r.request().postDataJSON();
    posts.push(body);
    trip = { ...trip, ...body };
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("http://127.0.0.1:5183");
  const alerts = page.locator(".live-trip-sheet .hop-alerts");
  await expect(alerts).toContainText("Test mode: texts are logged, not sent.");
  await alerts.locator('[data-hop-alert="arrival_alert"]').check();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ arrival_alert: true });
});

test("a low rating asks what went wrong and sends the picks as the comment; arrival text result is shown", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const rated = [];
  const done = { ...ride, status: "completed", mine: true, driver_name: "Murugan S", payment_status: "paid_online", payment_method: "online", arrival_alert: true, arrival_alert_status: "test", created_at: new Date().toISOString() };
  await setup(page, () => ({ rides: [done], offers: [], driver: [] }));
  await page.route("**/api/rides/slide-ride/rating", (r) => { rated.push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true } }); });
  await page.goto("http://127.0.0.1:5183");
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.getByRole("tab", { name: "Past", exact: true }).click();
  await page.getByRole("button", { name: "Receipt", exact: true }).click();
  await expect(page.locator(".hop-arrival-test")).toContainText("arrival text was logged");
  await page.getByRole("button", { name: "2 stars" }).click();
  const why = page.locator(".hop-low-rating");
  await expect(why).toContainText("What went wrong?");
  await why.locator("[data-live-reason]").first().click();
  const reason = await why.locator("[data-live-reason]").first().textContent();
  await page.getByRole("button", { name: "Send 2-star rating" }).click();
  await expect.poll(() => rated.length).toBe(1);
  expect(rated[0]).toEqual({ score: 2, comment: reason });
});

test("captain sets a Home by time from Driver tools", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const posts = [];
  await setup(page, () => ({ rides: [], offers: [], driver: [{ online: true, status: "approved", home_lat: 13.05, home_lng: 80.25 }] }));
  await page.route("**/api/drivers/home-by", (r) => { posts.push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true } }); });
  await page.goto("http://127.0.0.1:5184");
  await expect(page.locator("#app[data-ready=true]")).toBeVisible();
  await page.evaluate(() => window.prototypeBridge.go("tools"));
  const row = page.locator(".hop-home-by");
  await expect(row).toContainText("Home by");
  await row.locator("#account-home-by").fill("20:30");
  await row.getByRole("button", { name: "Turn on" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ at: "20:30", lat: 13.05, lng: 80.25 });
});
