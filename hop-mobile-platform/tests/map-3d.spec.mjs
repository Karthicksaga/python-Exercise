// MapLibre map (Nov 2026): 3D view, driving view, Hop layers (service area, demand glow),
// landmark badges, one-way arrows and "near …" on the pickup pin.
import { test, expect } from "@playwright/test";

const route = [{ lat: 13.0822, lng: 80.2755 }, { lat: 13.0785, lng: 80.27 }, { lat: 13.07, lng: 80.26 }, { lat: 13.0569, lng: 80.2425 }];
const ride = { id: "m3d", version: 3, status: "in_progress", driving: true, mine: false, pickup_lat: 13.0822, pickup_lng: 80.2755, dropoff_lat: 13.0569, dropoff_lng: 80.2425, pickup_label: "Central", dropoff_label: "Nungambakkam", vehicle_category: "auto", payment_method: "cash", fare_paise: 12000, route };
const area = { id: "c", name: "Chennai", min_lat: 12.9, max_lat: 13.2, min_lng: 80.1, max_lng: 80.33 };

async function setup(page, { state, port = 5184, routes }) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://**", (r) => r.abort());
  await page.route(/googleapis|gstatic/, (r) => r.abort());
  await page.route(/^http:\/\/127\.0\.0\.1:518[34]\/api\//, (r) => r.fulfill({ json: {} }));
  await page.route("**/api/me", (r) => r.fulfill({ json: { user: { id: "u" }, csrf: "csrf" } }));
  await page.route("**/api/config", (r) => r.fulfill({ json: { areas: [area], vehicles: [], development: true } }));
  await page.route("**/api/state", (r) => r.fulfill({ json: state() }));
  await page.route("**/api/rides/m3d/position", (r) => r.fulfill({ json: { lat: 13.0785, lng: 80.27, heading: 225, at: new Date().toISOString(), stale: false, status: "in_progress" } }));
  await routes?.();
  await page.goto(`http://127.0.0.1:${port}`);
  await expect(page.locator("#app[data-ready=true]")).toBeVisible();
  await expect(page.locator(".hop-map-canvas.hop-maplibre")).toHaveCount(1, { timeout: 20000 });
}
const debug = (page, fn) => page.evaluate(fn);

test("the 3D button tilts the map and flattens it again", async ({ page }) => {
  await setup(page, { state: () => ({ rides: [], offers: [], driver: [] }), port: 5183 });
  const button = page.getByRole("button", { name: "3D view" });
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  expect(await debug(page, () => document.querySelector(".hop-map-canvas").hopDebug.pitch())).toBeGreaterThan(40);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  expect(await debug(page, () => document.querySelector(".hop-map-canvas").hopDebug.pitch())).toBe(0);
});

test("on a trip, 3D is the driving view: following, tilted and heading-up", async ({ page }) => {
  await setup(page, { state: () => ({ rides: [ride], offers: [], driver: [{ online: true, status: "approved" }] }) });
  await expect(page.locator('.hop-map-marker[title="Live captain"]')).toHaveCount(1);
  await page.getByRole("button", { name: "3D view" }).click();
  await expect(page.getByRole("button", { name: "Follow me" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => debug(page, () => document.querySelector(".hop-map-canvas").hopDebug.nav().nav)).toBe(true);
  await expect.poll(() => debug(page, () => document.querySelector(".hop-map-canvas").hopDebug.pitch())).toBeGreaterThan(50);
  // Heading-up: the map turns to the captain's direction (south-west, about 225°).
  await expect.poll(async () => {
    const bearing = await debug(page, () => document.querySelector(".hop-map-canvas").hopDebug.bearing());
    return Math.abs(((bearing + 360) % 360) - 225);
  }).toBeLessThan(20);
  // The vehicle lies flat on the road; pins stand upright.
  await expect(page.locator('.hop-map-marker[title="Live captain"]')).toHaveClass(/maplibregl-marker/);
});

test("outside the service area is shaded, and an online captain sees the demand glow", async ({ page }) => {
  let demandCalls = 0;
  // Added after setup's catch-all, so it answers first.
  const routes = () => page.route("**/api/drivers/demand", (r) => {
    demandCalls++;
    return r.fulfill({ json: { cells: [{ lat: 13.05, lng: 80.25, requests: 6, drivers: 1 }, { lat: 13.06, lng: 80.24, requests: 2, drivers: 0 }], window_minutes: 45 } });
  });
  await setup(page, { state: () => ({ rides: [], offers: [], driver: [{ online: true, status: "approved" }] }), routes });
  // One shaded mask with a hole per zone, plus the zone's dashed edge.
  await expect.poll(() => debug(page, () => document.querySelector(".hop-map-canvas").hopDebug.overlay("hop-area"))).toBe(2);
  await expect.poll(() => demandCalls, { timeout: 20000 }).toBeGreaterThan(0);
  await expect.poll(() => debug(page, () => document.querySelector(".hop-map-canvas").hopDebug.overlay("hop-demand"))).toBe(2);
});

test("map style: 3D buildings, landmark badges and one-way arrows; the pickup pin can say what it's near", async ({ page }) => {
  await page.goto("http://127.0.0.1:5183");
  const root = new URL("../shared/maps/", import.meta.url).pathname;
  const out = await page.evaluate(async (root) => {
    const { hopVectorStyle } = await import(`/@fs${root}vectorStyle.ts`);
    const { pinHtml } = await import(`/@fs${root}pins.ts`);
    const { drawIcon, ICONS } = await import(`/@fs${root}mapIcons.ts`);
    const style = hopVectorStyle("browse", false);
    const layer = (id) => style.layers.find((l) => l.id === id);
    return {
      building: layer("building-3d")?.type,
      landmarks: JSON.stringify(layer("landmarks")?.layout?.["icon-image"]),
      oneway: layer("oneway-arrows")?.layout?.["icon-image"],
      icons: Object.keys(ICONS).every((id) => drawIcon(id)?.width > 0),
      pin: pinHtml("pickup", "Captain 3 min", { editable: false, waiting: true, near: "Indian Oil bunk" }),
    };
  }, root);
  expect(out.building).toBe("fill-extrusion");
  for (const icon of ["hop-lm-worship", "hop-lm-fuel", "hop-lm-bus", "hop-lm-metro", "hop-lm-hospital", "hop-lm-mall"]) expect(out.landmarks).toContain(icon);
  expect(out.oneway).toBe("hop-oneway");
  expect(out.icons).toBe(true);
  expect(out.pin).toContain("near Indian Oil bunk");
  expect(out.pin).toContain("Captain 3 min");
});
