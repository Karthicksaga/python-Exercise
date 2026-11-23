/**
 * Crowds by place and hour (TD-31): the Marina in the evening is full of people on the sand and
 * the beach road, a quiet residential lane is nearly empty, and the beach empties at night; all
 * within the lite draw budget. Places come from the map (OSM beach outline, road classes, shops),
 * so the two spots are coordinates on the map, and the test checks the game classes them so.
 */
import { expect, test, type Page } from "@playwright/test";
import { ready, snapshot, teleport, waitGameTime } from "./support";

interface CrowdState {
  x: number;
  z: number;
  hour: number;
  drawCalls: number;
  triangles: number;
  pedestrians: number;
  crowd: { out: number; drawn: number; cap: number; within30: number; sitting: number; walking: number; onSand: number; byPlace: Record<string, number>; place: string | null };
}
interface People {
  pedestrians: Array<{ x: number; z: number; visible: boolean }>;
}
const state = async (page: Page) => (await snapshot(page)) as unknown as CrowdState;
const people = (page: Page) => page.evaluate(() => (window as unknown as { __cow: { people(): unknown } }).__cow.people()) as Promise<People>;

/** On the Marina's sand (OSM way 22902280), between the beach road and the water. */
const MARINA = { x: 7925, z: 3600 };
/** Raja Krishna Road, Alwarpet: a residential lane with no shops, stations or temples near. */
const LANE = { x: 4523, z: 4988 };

/** Open the game at an hour of the day (the clock is saved like a player's). */
async function openAt(page: Page, hour: number): Promise<void> {
  await page.goto("/?quality=lite&start=play");
  await page.evaluate((h) => {
    localStorage.clear();
    localStorage.setItem("cow-hour-v1", String(h));
  }, hour);
  await ready(page, true);
}

/** Stand at a spot and let the crowd come out (squares are made a few per frame, the figures baked once). */
async function visit(page: Page, at: { x: number; z: number }): Promise<{ s: CrowdState; walkers: number; total: number }> {
  await teleport(page, at.x, at.z);
  await waitGameTime(page, 3);
  await expect.poll(async () => (await state(page)).crowd.drawn, { timeout: 30_000, intervals: [250] }).toBe((await state(page)).crowd.out);
  const s = await state(page);
  // Animated walkers drawn within 70 m, plus the crowd (all within 70 m).
  const walkers = (await people(page)).pedestrians.filter((p) => p.visible && Math.hypot(p.x - s.x, p.z - s.z) < 70).length;
  return { s, walkers, total: walkers + s.crowd.out };
}

test.describe.configure({ timeout: 240_000 });

test("the Marina in the evening is crowded, a quiet lane is not, within the draw budget", async ({ page }) => {
  await openAt(page, 18.5);
  const beach = await visit(page, MARINA);
  console.log(`Marina 18:30: ${beach.total} people within 70 m (${beach.s.crowd.out} crowd: ${beach.s.crowd.sitting} sitting, ${beach.s.crowd.walking} walking, ${JSON.stringify(beach.s.crowd.byPlace)}; ${beach.walkers} animated walkers), ${beach.s.drawCalls} draw calls, ${beach.s.triangles} triangles`);
  expect(beach.s.crowd.place).toBe("sand");
  expect(beach.s.crowd.out).toBeGreaterThanOrEqual(40);
  expect(beach.s.crowd.out).toBeLessThanOrEqual(beach.s.crowd.cap);
  expect(beach.s.crowd.within30).toBeGreaterThanOrEqual(10);
  // Groups sit on the sand; everyone counted as on the beach is on sand, none in the sea.
  expect(beach.s.crowd.sitting).toBeGreaterThan(5);
  expect(beach.s.crowd.byPlace.beach ?? 0).toBeGreaterThan(20);
  expect(beach.s.crowd.onSand).toBe(beach.s.crowd.byPlace.beach);
  // The lite budget of the busiest scenes (gang district, station platform).
  expect(beach.s.drawCalls).toBeLessThan(300);
  expect(beach.s.triangles).toBeLessThan(300_000);

  const lane = await visit(page, LANE);
  console.log(`Raja Krishna Road 18:30: ${lane.total} people within 70 m (${lane.s.crowd.out} crowd; ${lane.walkers} animated walkers), ${lane.s.drawCalls} draw calls, ${lane.s.triangles} triangles`);
  expect(lane.s.crowd.place).toBe("lane");
  expect(lane.s.crowd.out).toBeLessThanOrEqual(8);
  expect(beach.total).toBeGreaterThan(lane.total * 4);
});

test("the beach empties at night", async ({ page }) => {
  await openAt(page, 3);
  const night = await visit(page, MARINA);
  console.log(`Marina 03:00: ${night.total} people within 70 m (${night.s.crowd.out} crowd; ${night.walkers} animated walkers)`);
  expect(night.s.hour).toBeLessThan(4);
  expect(night.s.crowd.out).toBeLessThanOrEqual(5);
});
