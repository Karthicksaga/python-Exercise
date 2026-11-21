/**
 * The full-screen city map: tapping the minimap opens it centred on the player and holds the
 * game; pinch, drag, double-tap, the buttons, Back and the close button all work at phone size.
 */
import { expect, test, type Page } from "@playwright/test";
import { GAME_WAIT, ready, snapshot, teleport, waitGameTime } from "./support";

interface CityMapState {
  open: boolean;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  centre: { x: number; z: number };
  marker: { x: number; z: number; heading: number; screenX: number; screenY: number } | null;
  band: number;
  draws: number;
}

const mapState = (page: Page) => page.evaluate(() => (window as unknown as { __cow: { snapshot(): { cityMap: CityMapState } } }).__cow.snapshot().cityMap);

async function openMap(page: Page): Promise<CityMapState> {
  await page.getByTestId("minimap").tap();
  await expect.poll(async () => (await mapState(page)).open, { timeout: 10_000 }).toBe(true);
  await expect(page.getByTestId("citymap")).toBeVisible();
  return mapState(page);
}

/** Send touch pointer events to the map canvas: each step is a list of [pointerId, x, y]. */
async function touch(page: Page, type: "pointerdown" | "pointermove" | "pointerup", id: number, x: number, y: number): Promise<void> {
  await page.getByTestId("citymap-canvas").dispatchEvent(type, { pointerId: id, pointerType: "touch", isPrimary: id === 1, bubbles: true, clientX: x, clientY: y });
}

/** Screen point → world point for a map state (north up: screen y follows world z). */
function worldAt(state: CityMapState, viewport: { width: number; height: number }, x: number, y: number): { x: number; z: number } {
  return { x: state.centre.x + (x - viewport.width / 2) / state.zoom, z: state.centre.z + (y - viewport.height / 2) / state.zoom };
}

test("tapping the minimap opens the city map on the player and holds the game; X closes it and the game runs again", async ({ page }) => {
  await ready(page);
  await waitGameTime(page, 0.3);
  const before = await snapshot(page);
  const state = await openMap(page);
  const viewport = page.viewportSize()!;

  // Centred on the player, the marker on the player's position, in the middle of the screen.
  expect(state.centre.x).toBeCloseTo(before.x, 0);
  expect(state.centre.z).toBeCloseTo(before.z, 0);
  expect(state.marker!.x).toBeCloseTo(before.x, 0);
  expect(state.marker!.z).toBeCloseTo(before.z, 0);
  expect(state.marker!.screenX).toBeCloseTo(viewport.width / 2, 0);
  expect(state.marker!.screenY).toBeCloseTo(viewport.height / 2, 0);
  // The drawn marker (the arrow in its pulsing ring) is where the state says.
  await expect.poll(async () => {
    const box = await page.getByTestId("citymap-marker").locator("svg").boundingBox();
    return box ? Math.hypot(box.x + box.width / 2 - viewport.width / 2, box.y + box.height / 2 - viewport.height / 2) : 999;
  }).toBeLessThan(2);
  // Zoomed in on the player (about 2 km across), not the whole city.
  expect(state.zoom).toBeGreaterThan(state.minZoom * 5);

  // The game is held: no game time passes while the map is open.
  const held = await snapshot(page);
  expect((held as unknown as { held: boolean }).held).toBe(true);
  await page.waitForTimeout(1000);
  expect((await snapshot(page)).simTime).toBe(held.simTime);
  await expect(page.getByTestId("move-zone")).toBeHidden();

  await page.getByTestId("citymap-close").tap();
  await expect(page.getByTestId("citymap")).toBeHidden();
  expect((await mapState(page)).open).toBe(false);
  await waitGameTime(page, 0.3);
  const after = await snapshot(page);
  expect(after.simTime).toBeGreaterThan(held.simTime);
  expect(after.paused).toBe(false);
  await expect(page.getByTestId("move-zone")).toBeVisible();
});

test("pinch, drag and double-tap zoom and move the map; the buttons zoom; centre on me comes back", async ({ page }) => {
  await ready(page);
  const viewport = page.viewportSize()!;
  const start = await openMap(page);
  const player = { x: start.marker!.x, z: start.marker!.z };

  // Pinch apart: the fingers' distance doubles, so does the zoom; the point under their middle stays put.
  const under = worldAt(start, viewport, 450, 200);
  await touch(page, "pointerdown", 1, 400, 200);
  await touch(page, "pointerdown", 2, 500, 200);
  for (let i = 1; i <= 5; i++) {
    await touch(page, "pointermove", 1, 400 - 10 * i, 200);
    await touch(page, "pointermove", 2, 500 + 10 * i, 200);
  }
  await touch(page, "pointerup", 1, 350, 200);
  await touch(page, "pointerup", 2, 550, 200);
  const pinched = await mapState(page);
  expect(pinched.zoom / start.zoom).toBeCloseTo(2, 2);
  const still = worldAt(pinched, viewport, 450, 200);
  expect(still.x).toBeCloseTo(under.x, 1);
  expect(still.z).toBeCloseTo(under.z, 1);

  // Drag with one finger: the map follows it (200 px right, 50 px down moves the centre west and north).
  await touch(page, "pointerdown", 1, 300, 200);
  for (let i = 1; i <= 5; i++) await touch(page, "pointermove", 1, 300 + 40 * i, 200 + 10 * i);
  await touch(page, "pointerup", 1, 500, 250);
  const dragged = await mapState(page);
  expect(dragged.zoom).toBe(pinched.zoom);
  expect(dragged.centre.x).toBeCloseTo(pinched.centre.x - 200 / pinched.zoom, 1);
  expect(dragged.centre.z).toBeCloseTo(pinched.centre.z - 50 / pinched.zoom, 1);

  // Double-tap: zoom in twice as far, about the tapped point.
  const tapped = worldAt(dragged, viewport, 600, 150);
  for (let i = 0; i < 2; i++) {
    await touch(page, "pointerdown", 1, 600, 150);
    await touch(page, "pointerup", 1, 600, 150);
  }
  const doubled = await mapState(page);
  expect(doubled.zoom / dragged.zoom).toBeCloseTo(2, 3);
  const there = worldAt(doubled, viewport, 600, 150);
  expect(there.x).toBeCloseTo(tapped.x, 1);
  expect(there.z).toBeCloseTo(tapped.z, 1);

  // +/− buttons, as a fallback for pinching.
  await page.getByTestId("citymap-zoom-out").tap();
  expect((await mapState(page)).zoom).toBeCloseTo(doubled.zoom / 2, 6);
  await page.getByTestId("citymap-zoom-in").tap();
  expect((await mapState(page)).zoom).toBeCloseTo(doubled.zoom, 6);
  // Street level is the limit.
  for (let i = 0; i < 6; i++) await page.getByTestId("citymap-zoom-in").tap();
  const street = await mapState(page);
  expect(street.zoom).toBe(street.maxZoom);
  expect(street.band).toBe(4);

  // Centre on me: back over the player, the marker in the middle of the screen.
  await page.getByTestId("citymap-centre").tap();
  const centred = await mapState(page);
  expect(centred.centre.x).toBeCloseTo(player.x, 3);
  expect(centred.centre.z).toBeCloseTo(player.z, 3);
  expect(centred.marker!.screenX).toBeCloseTo(viewport.width / 2, 3);

  // Pinch right in (fingers together): out to the whole city, no further.
  await touch(page, "pointerdown", 1, 200, 200);
  await touch(page, "pointerdown", 2, 700, 200);
  await touch(page, "pointermove", 1, 449, 200);
  await touch(page, "pointermove", 2, 451, 200);
  await touch(page, "pointerup", 1, 449, 200);
  await touch(page, "pointerup", 2, 451, 200);
  const city = await mapState(page);
  expect(city.zoom).toBe(city.minZoom);
  expect(city.band).toBe(0);
  // The map redraws only after changes, not every frame: once the last change's redraw (on the
  // next animation frame) has happened, the count stays put.
  await page.waitForTimeout(300);
  const draws = (await mapState(page)).draws;
  expect(draws).toBeGreaterThan(start.draws);
  await page.waitForTimeout(600);
  expect((await mapState(page)).draws).toBe(draws);
});

test("after a teleport to T. Nagar the map opens there, the marker on the player", async ({ page }) => {
  await ready(page);
  await teleport(page, 3269, 4960, 1);
  await waitGameTime(page, 0.3);
  const at = await snapshot(page);
  expect(Math.hypot(at.x - 3269, at.z - 4960)).toBeLessThan(3);
  const state = await openMap(page);
  expect(state.marker!.x).toBeCloseTo(at.x, 0);
  expect(state.marker!.z).toBeCloseTo(at.z, 0);
  expect(state.centre.x).toBeCloseTo(at.x, 0);
  expect(state.centre.z).toBeCloseTo(at.z, 0);
  expect(state.marker!.heading).toBeCloseTo(at.yaw, 1);
  await expect(page.getByTestId("citymap")).toContainText("You are in");
});

test("Android Back closes the map (and pauses when it is closed); the shell is told the map is open", async ({ page }) => {
  // Stand in for the React Native shell, recording what the game sends it.
  await page.addInitScript(() => {
    const sent: string[] = [];
    (window as unknown as { __sent: string[] }).__sent = sent;
    (window as unknown as { ReactNativeWebView: { postMessage(data: string): void } }).ReactNativeWebView = { postMessage: (data) => sent.push(data) };
  });
  await ready(page);
  const back = () => page.evaluate(() => window.dispatchEvent(new CustomEvent("cow-shell", { detail: JSON.stringify({ type: "back" }) })));
  const sent = () => page.evaluate(() => (window as unknown as { __sent: string[] }).__sent.map((s) => JSON.parse(s) as { type: string; open?: boolean }));

  await openMap(page);
  expect((await sent()).filter((m) => m.type === "cityMap").at(-1)).toEqual({ type: "cityMap", open: true });
  await back();
  await expect(page.getByTestId("citymap")).toBeHidden();
  expect((await sent()).filter((m) => m.type === "cityMap").at(-1)).toEqual({ type: "cityMap", open: false });
  await waitGameTime(page, 0.2);
  expect((await snapshot(page)).paused).toBe(false);

  // With the map closed, Back pauses as before.
  await back();
  await expect.poll(async () => (await snapshot(page)).paused, { timeout: GAME_WAIT }).toBe(true);

  // A pause from the shell (the app going to the background) closes an open map.
  await page.getByRole("button", { name: "Resume" }).tap();
  await openMap(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("cow-shell", { detail: JSON.stringify({ type: "pause" }) })));
  await expect(page.getByTestId("citymap")).toBeHidden();
  expect((await snapshot(page)).paused).toBe(true);
  await page.getByRole("button", { name: "Resume" }).tap();
  await waitGameTime(page, 0.2);
});

/** The map's controls: on screen, at least 44 px, and none on top of another. */
async function checkLayout(page: Page): Promise<void> {
  await ready(page);
  await openMap(page);
  const viewport = page.viewportSize()!;
  const boxes: Array<[string, { x: number; y: number; width: number; height: number }]> = [];
  for (const id of ["citymap-close", "citymap-zoom-in", "citymap-zoom-out", "citymap-centre"]) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).not.toBeNull();
    expect(box!.width, `${id} width`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `${id} height`).toBeGreaterThanOrEqual(44);
    boxes.push([id, box!]);
  }
  for (const selector of [".cow-cm-head", ".cow-cm-north", ".cow-cm-scale", ".cow-cm-credit"]) {
    const box = await page.locator(selector).boundingBox();
    expect(box, selector).not.toBeNull();
    boxes.push([selector, box!]);
  }
  for (const [name, b] of boxes) {
    expect(b.x, `${name} inside the screen`).toBeGreaterThanOrEqual(0);
    expect(b.y, `${name} inside the screen`).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, `${name} inside the screen`).toBeLessThanOrEqual(viewport.width);
    expect(b.y + b.height, `${name} inside the screen`).toBeLessThanOrEqual(viewport.height);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let k = i + 1; k < boxes.length; k++) {
      const [na, a] = boxes[i]!;
      const [nb, b] = boxes[k]!;
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, `${na} overlaps ${nb}`).toBe(false);
    }
  }
  await expect(page.locator(".cow-cm-credit")).toContainText("OpenStreetMap contributors");
}

test("map controls fit at 915×412 without overlapping", async ({ page }) => {
  await checkLayout(page);
});

test.describe("on a smaller phone", () => {
  test.use({ viewport: { width: 740, height: 360 } });
  test("map controls fit at 740×360 without overlapping", async ({ page }) => {
    await checkLayout(page);
  });
});
