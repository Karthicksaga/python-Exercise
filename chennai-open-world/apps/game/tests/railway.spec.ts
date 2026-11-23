/** The suburban railway: board a timetabled train, ride one stop, step off; fares; the map's edge. */
import { expect, test, type Page } from "@playwright/test";
import { GAME_WAIT, ready, snapshot, tapButton, teleport, waitGameTime } from "./support";

interface RailState {
  clock: number;
  riding: string | null;
  train: string | null;
  destination: string | null;
  nextStop: string | null;
  fares: number;
  trains: Array<{ id: string; line: string; x: number; z: number; speed: number; stoppedAt: string | null }>;
  stops: Array<{ line: string; name: string; x: number; z: number; footX: number; footZ: number; nextTrain: number }>;
  drawnCells: number;
  drawnCoaches: number;
  doors: number;
  walking: "board" | "alight" | null;
}
interface RailSnapshot {
  x: number;
  y: number;
  z: number;
  money: number;
  mode: string;
  grounded: boolean;
  rail: RailState;
}
const state = (page: Page) => snapshot(page) as unknown as Promise<RailSnapshot>;
const LINE = "beach-tambaram";

async function startWith(page: Page, money: number): Promise<void> {
  await page.goto("/?quality=lite&start=play");
  await page.evaluate((cash) => localStorage.setItem("cow-progress-v1", JSON.stringify({ completed: [], money: cash })), money);
  await ready(page, true);
}

const stopOf = async (page: Page, name: string) => {
  const stop = (await state(page)).rail.stops.find((s) => s.line === LINE && s.name === name);
  if (!stop) throw new Error(`No stop ${name}`);
  return stop;
};

/** Skip the timetable to a few seconds before the next train reaches `name` (test hook), then wait on game time for it to stand there. */
async function trainAt(page: Page, name: string): Promise<void> {
  const wait = (await stopOf(page, name)).nextTrain;
  if (wait > 4) await page.evaluate((s) => window.__cow?.railAdvance(s), wait - 4);
  await expect
    .poll(async () => (await state(page)).rail.trains.some((t) => t.line === LINE && t.stoppedAt === name), { timeout: 120_000, intervals: [200] })
    .toBe(true);
}

/** Wait (game time) until the train being ridden stands at `name`. */
async function rideTo(page: Page, name: string): Promise<void> {
  const wait = (await stopOf(page, name)).nextTrain;
  if (wait > 4) await page.evaluate((s) => window.__cow?.railAdvance(s), wait - 4);
  await expect
    .poll(async () => {
      const rail = (await state(page)).rail;
      return rail.trains.find((t) => t.id === rail.train)?.stoppedAt ?? null;
    }, { timeout: 120_000, intervals: [200] })
    .toBe(name);
}

test("board a train at Egmore, ride to Chetpet and step off onto the platform", async ({ page }) => {
  await startWith(page, 100);
  const egmore = await stopOf(page, "Chennai Egmore");
  await teleport(page, egmore.footX, egmore.footZ);
  await expect(page.getByTestId("ride")).toContainText("Chennai Egmore station");

  await trainAt(page, "Chennai Egmore");
  // The train is drawn and solid: its coaches stand beside the platform.
  const standing = await state(page);
  expect(standing.rail.drawnCoaches).toBeGreaterThanOrEqual(4);
  expect(standing.rail.drawnCells).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Board the train", exact: true })).toBeVisible();
  await tapButton(page, "Board the train");

  const aboard = await state(page);
  expect(aboard.rail.riding).toBe(LINE);
  expect(aboard.rail.destination).toBe("Tambaram");
  expect(aboard.rail.nextStop).toBe("Chetpet");
  expect(aboard.money).toBe(95);
  expect(aboard.rail.fares).toBe(5);
  await expect(page.getByTestId("ride")).toContainText("Train to Tambaram");
  // Stepping off is offered only at a station; the train still stands at Egmore for a while.
  await expect(page.getByRole("button", { name: "Step off the train", exact: true })).toBeVisible();

  // The train leaves: skip most of the stop, then watch it pull away on game time.
  await page.evaluate(() => window.__cow?.railAdvance(28));
  await waitGameTime(page, 6);
  const moving = await state(page);
  expect(Math.hypot(moving.x - aboard.x, moving.z - aboard.z)).toBeGreaterThan(3);
  await expect(page.getByTestId("ride")).toContainText("Next: Chetpet");
  await expect(page.getByRole("button", { name: "Step off the train", exact: true })).toBeHidden();

  await rideTo(page, "Chetpet");
  await expect(page.getByTestId("ride")).toContainText("Chetpet");
  await tapButton(page, "Step off the train");
  const off = await state(page);
  const chetpet = await stopOf(page, "Chetpet");
  expect(off.rail.riding).toBeNull();
  expect(off.mode).toBe("foot");
  // On the Chetpet platform: within its length of the centre, at platform height (0.9 m).
  expect(Math.hypot(off.x - chetpet.x, off.z - chetpet.z)).toBeLessThan(56);
  expect(off.y).toBeGreaterThan(0.7);
  await waitGameTime(page, 1);
  const settled = await state(page);
  expect(settled.y).toBeGreaterThan(0.7);
  expect(settled.grounded).toBe(true);
  expect(settled.money).toBe(95);
});

test("a ride towards Tambaram ends at St. Thomas Mount, the last station on the map", async ({ page }) => {
  await startWith(page, 100);
  const guindy = await stopOf(page, "Guindy");
  await teleport(page, guindy.footX, guindy.footZ);
  await trainAt(page, "Guindy");
  await tapButton(page, "Board the train");
  expect((await state(page)).rail.nextStop).toBe("St. Thomas Mount");
  await page.evaluate(() => window.__cow?.railAdvance(28));
  const mount = await stopOf(page, "St. Thomas Mount");
  const wait = mount.nextTrain;
  if (wait > 4) await page.evaluate((s) => window.__cow?.railAdvance(s), wait - 4);
  // On arrival the ride ends by itself, with the reason on screen.
  await expect.poll(async () => (await state(page)).rail.riding, { timeout: 120_000, intervals: [200] }).toBeNull();
  await expect(page.getByRole("status").filter({ hasText: "continues to Tambaram beyond the map" })).toBeVisible();
  const off = await state(page);
  expect(Math.hypot(off.x - mount.x, off.z - mount.z)).toBeLessThan(56);
  expect(off.y).toBeGreaterThan(0.7);
});

test("no money, no ticket", async ({ page }) => {
  await startWith(page, 0);
  const egmore = await stopOf(page, "Chennai Egmore");
  await teleport(page, egmore.footX, egmore.footZ);
  await trainAt(page, "Chennai Egmore");
  await tapButton(page, "Board the train");
  await expect(page.getByRole("status").filter({ hasText: "A ticket costs ₹5" })).toBeVisible();
  expect((await state(page)).rail.riding).toBeNull();
});

test("sliding doors open at the stop, the player walks through them, and they shut before the train leaves", async ({ page }) => {
  await startWith(page, 100);
  const egmore = await stopOf(page, "Chennai Egmore");
  await teleport(page, egmore.footX, egmore.footZ);
  await trainAt(page, "Chennai Egmore");
  // Shortly after the train stops its doors (on the coach nearest the player) slide open.
  await expect.poll(async () => (await state(page)).rail.doors, { timeout: GAME_WAIT, intervals: [100] }).toBeGreaterThan(0.8);
  const before = await state(page);
  await tapButton(page, "Board the train");
  // A short walk through the doorway (not a jump into the train): the player is still near where they stood.
  const walking = await state(page);
  expect(walking.rail.riding).toBe(LINE);
  expect(walking.rail.walking).toBe("board");
  expect(Math.hypot(walking.x - before.x, walking.z - before.z)).toBeLessThan(8);
  await expect.poll(async () => (await state(page)).rail.walking, { timeout: GAME_WAIT, intervals: [100] }).toBeNull();
  expect((await state(page)).rail.riding).toBe(LINE);

  // Just before it leaves the doors are shut; the train pulls away with them shut.
  await page.evaluate(() => window.__cow?.railAdvance(28.9));
  await expect.poll(async () => (await state(page)).rail.doors, { timeout: GAME_WAIT, intervals: [100] }).toBeLessThan(0.05);

  // Step off at Chetpet: out through a doorway onto the platform, then control is back.
  await rideTo(page, "Chetpet");
  await expect.poll(async () => (await state(page)).rail.doors, { timeout: GAME_WAIT, intervals: [100] }).toBeGreaterThan(0.8);
  await tapButton(page, "Step off the train");
  const stepping = await state(page);
  expect(stepping.rail.riding).toBeNull();
  expect(stepping.rail.walking).toBe("alight");
  await expect.poll(async () => (await state(page)).rail.walking, { timeout: GAME_WAIT, intervals: [100] }).toBeNull();
  await waitGameTime(page, 0.5);
  const off = await state(page);
  expect(off.grounded).toBe(true);
  expect(off.y).toBeGreaterThan(0.7);
  await expect(page.getByRole("button", { name: "Jump", exact: true })).toBeVisible();
});
