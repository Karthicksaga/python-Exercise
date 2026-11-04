// Live map realism: route choice, smooth top-down vehicles, route trimming and RideCheck.
// Uses OpenStreetMap (Google is blocked) with mocked backend responses, like maps.spec.mjs.
import { test, expect } from "@playwright/test";

const base = "http://127.0.0.1:5183";
const pickup = { lat: 13.0067, lng: 80.2206, label: "Adyar pickup" };
const dropoff = { lat: 12.994, lng: 80.17, label: "Airport destination" };
const fast = [pickup, { lat: 13.001, lng: 80.205 }, { lat: 12.998, lng: 80.19 }, dropoff];
const short = [pickup, { lat: 13.004, lng: 80.2 }, { lat: 12.996, lng: 80.185 }, dropoff];
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const config = {
  areas: [{ id: "chennai", name: "Chennai", min_lat: 12.8, max_lat: 13.2, min_lng: 80, max_lng: 80.4 }],
  vehicles: [{ area_id: "chennai", category: "auto", name: "Auto" }],
  development: true, routing_configured: true, phone_login: true,
};

async function setup(page, state = () => ({ rides: [], driver: [], offers: [] })) {
  await page.route("https://maps.googleapis.com/**", (r) => r.abort());
  await page.route("https://tile.openstreetmap.org/**", (r) => r.fulfill({ contentType: "image/png", body: pixel }));
  await page.route(/^http:\/\/127\.0\.0\.1:518[34]\/api\//, (r) => r.fulfill({ json: {} }));
  await page.route("**/api/config", (r) => r.fulfill({ json: config }));
  await page.route("**/api/me", (r) => r.fulfill({ json: { user: { id: "account" }, csrf: "csrf-test" } }));
  await page.route("**/api/state", (r) => r.fulfill({ json: state() }));
  await page.route("**/api/notifications/new", (r) => r.fulfill({ json: { notifications: [] } }));
  await page.route("**/api/places?*", (r) => r.fulfill({ json: [new URL(r.request().url()).searchParams.get("q").includes("Adyar") ? pickup : dropoff] }));
}

test("rider picks a route by chip or by tapping it on the map; the price follows the chosen route", async ({ page }) => {
  let alternativeCalls = 0;
  const quoted = [];
  await setup(page);
  await page.route("**/api/routes/alternatives", (r) => {
    alternativeCalls++;
    return r.fulfill({ json: { routes: [{ route: fast, meters: 9800, seconds: 1500 }, { route: short, meters: 8600, seconds: 1740 }] } });
  });
  await page.route("**/api/estimates", (r) => r.fulfill({ json: { options: [{ category: "auto", fare_paise: 23700 }] } }));
  // Any route but the first is priced by a real quote for that route.
  await page.route("**/api/quotes", (r) => {
    const body = r.request().postDataJSON();
    quoted.push(body.route_index);
    return r.fulfill({ json: { id: `q-${body.route_index}`, fare_paise: 21900, meters: 8600, seconds: 1740, route: short } });
  });
  await page.goto(base);
  await page.getByRole("button", { name: "Where are you going?" }).click();
  await page.getByRole("textbox", { name: "Pickup location", exact: true }).fill("Adyar");
  await page.locator("[data-live-place]").filter({ hasText: "Adyar pickup" }).click();
  await page.getByRole("textbox", { name: "Search destination" }).fill("Airport");
  await page.locator("[data-live-place]").filter({ hasText: "Airport destination" }).click();

  const chips = page.locator(".route-alt-chip");
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(0)).toContainText("Fastest");
  await expect(chips.nth(1)).toContainText("Shortest");
  await expect(page.locator('[data-vehicle="auto"] .vehicle-price')).toHaveText("₹237");
  // The other route is drawn in grey with a tappable label.
  await expect(page.locator(".hop-route-alternative")).toHaveCount(1);
  await expect(page.locator(".hop-route-tag")).toHaveText("Shortest · 29 min");

  await page.locator(".hop-route-tag").click();
  await expect(chips.nth(1)).toHaveAttribute("aria-checked", "true");
  await expect(page.locator('[data-vehicle="auto"] .vehicle-price')).toHaveText("₹219");
  expect(quoted).toContain(1);
  // The fastest route stays on the map in grey, ready to switch back.
  await expect(page.locator(".hop-route-alternative")).toHaveCount(1);
  await expect(page.locator(".hop-route-tag")).toHaveText("Fastest · 25 min");

  await chips.nth(0).click();
  await expect(chips.nth(0)).toHaveAttribute("aria-checked", "true");
  await expect(page.locator('[data-vehicle="auto"] .vehicle-price')).toHaveText("₹237");
  // Switching routes reuses the routes already fetched.
  expect(alternativeCalls).toBe(1);
});

const trip = (status) => ({
  id: "ride-live", version: 3, status, mine: true, driving: true,
  pickup_lat: pickup.lat, pickup_lng: pickup.lng, dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng,
  pickup_label: pickup.label, dropoff_label: dropoff.label, vehicle_category: "sedan", fare_paise: 23700,
  payment_method: "cash", route: fast,
});

test.describe("with motion allowed", () => {
  test.use({ reducedMotion: "no-preference" });
  test("live captain glides between GPS fixes, faces the road, and the route behind it disappears", async ({ page }) => {
    let fix = { lat: 13.0045, lng: 80.2149 }; // on the first leg of the route
    await setup(page, () => ({ rides: [trip("in_progress")], driver: [], offers: [] }));
    await page.route("**/api/rides/ride-live/position", (r) => r.fulfill({ json: { ...fix, at: new Date().toISOString(), stale: false, status: "in_progress" } }));
    await page.goto(base);
    const marker = page.locator('.leaflet-marker-icon[title="Live captain"]');
    await expect(marker).toHaveCount(1);
    // Top-down artwork, display-only.
    await expect(marker.locator("img")).toHaveAttribute("src", /^data:image\/svg\+xml/);
    await expect(marker.locator("img")).toHaveAttribute("draggable", "false");
    // Facing along the first road segment (roughly west-south-west), not north.
    const angle = async () => Number((await marker.locator(".hop-vehicle-marker").getAttribute("style")).match(/rotate\(([-\d.]+)deg\)/)[1]);
    await expect.poll(angle).toBeGreaterThan(240);
    expect(await angle()).toBeLessThan(260);
    // The route line starts at the captain: everything behind them is gone.
    const lineStart = () => page.evaluate(() => {
      const d = document.querySelector('.leaflet-overlay-pane path[stroke="#4b3fd1"]')?.getAttribute("d") ?? "";
      const [x, y] = d.replace(/^M/, "").split(/[ L]/).map(Number);
      const m = document.querySelector('.leaflet-marker-icon[title="Live captain"]').getBoundingClientRect();
      const pane = document.querySelector(".leaflet-overlay-pane svg").getBoundingClientRect();
      const box = document.querySelector(".leaflet-overlay-pane svg").viewBox.baseVal;
      return Math.hypot(pane.left + (x - box.x) - (m.left + m.width / 2), pane.top + (y - box.y) - (m.top + m.height / 2));
    });
    await expect.poll(lineStart).toBeLessThan(4);

    // Next fix further along: the marker moves through intermediate positions, not one jump.
    // Position inside the map pane, so camera moves don't count as vehicle moves.
    const paneX = () => page.evaluate(() => Number(document.querySelector('.leaflet-marker-icon[title="Live captain"]').style.transform.match(/translate3d\(([-\d.]+)px/)[1]));
    const positions = [];
    const before = await paneX();
    fix = { lat: 13.0036, lng: 80.212 }; // 290 m further along the same road
    for (let i = 0; i < 28; i++) {
      positions.push(await paneX());
      await page.waitForTimeout(150);
    }
    const distinct = new Set(positions.map((x) => Math.round(x)));
    expect(distinct.size).toBeGreaterThan(4);
    expect(Math.min(...positions)).toBeLessThan(before);
    // Once the glide ends, the line starts at the captain's new position.
    await expect.poll(lineStart, { timeout: 8000 }).toBeLessThan(4);
  });
});

test("with reduced motion, the live captain moves straight to each fix without animating", async ({ page }) => {
  let fix = { lat: 13.0045, lng: 80.2149 };
  await setup(page, () => ({ rides: [trip("in_progress")], driver: [], offers: [] }));
  await page.route("**/api/rides/ride-live/position", (r) => r.fulfill({ json: { ...fix, at: new Date().toISOString(), stale: false, status: "in_progress" } }));
  await page.goto(base);
  const paneX = () => page.evaluate(() => Number(document.querySelector('.leaflet-marker-icon[title="Live captain"]')?.style.transform.match(/translate3d\(([-\d.]+)px/)?.[1] ?? NaN));
  await expect.poll(paneX).not.toBeNaN();
  await page.waitForTimeout(2500); // the map frames the trip once when it first appears
  const start = await paneX();
  fix = { lat: 13.0036, lng: 80.212 };
  const seen = new Set();
  for (let i = 0; i < 24; i++) { seen.add(Math.round(await paneX())); await page.waitForTimeout(150); }
  expect([...seen].filter((x) => x !== Math.round(start)).length).toBe(1);
});

test("RideCheck checks in when the trip leaves the planned route, and I'm fine dismisses it", async ({ page }) => {
  await page.clock.install();
  let fix = { lat: 13.0045, lng: 80.2149 };
  await setup(page, () => ({ rides: [trip("in_progress")], driver: [], offers: [] }));
  // Stamp each fix with the page's (fake) clock, as a live server would with real time.
  await page.route("**/api/rides/ride-live/position", async (r) => r.fulfill({ json: { ...fix, at: await page.evaluate(() => new Date().toISOString()), stale: false, status: "in_progress" } }));
  await page.goto(base);
  await expect(page.locator('.leaflet-marker-icon[title="Live captain"]')).toHaveCount(1);
  await expect(page.locator(".hop-ridecheck")).toHaveCount(0);
  // About 1 km north of the planned road.
  fix = { lat: 13.0135, lng: 80.2149 };
  await page.clock.runFor(20_000);
  await expect(page.locator(".hop-ridecheck")).toHaveCount(0); // a short detour isn't flagged
  await page.clock.runFor(40_000);
  const card = page.getByRole("alertdialog", { name: /RideCheck/ });
  await expect(card).toContainText("left the planned route");
  await expect(card.getByRole("button", { name: "Get help" })).toHaveAttribute("data-modal", "sos");
  await expect(card.getByRole("button", { name: "Share trip" })).toHaveAttribute("data-modal", "share");
  await card.getByRole("button", { name: "I’m fine" }).click();
  await expect(page.locator(".hop-ridecheck")).toHaveCount(0);
  // Snoozed: it doesn't come straight back for the same detour.
  await page.clock.runFor(60_000);
  await expect(page.locator(".hop-ridecheck")).toHaveCount(0);
});
