/**
 * Railway stations come alive: a waiting crowd on the platform, a departure board from the
 * timetable, a train that brakes smoothly to a stop and pulls away accelerating (with its horn),
 * people getting on and off. Times are game time (`waitGameTime`); the timetable is skipped
 * forward with the `railAdvance` test hook.
 */
import { expect, test, type Page } from "@playwright/test";
import { GAME_WAIT, snapshot, teleport, waitGameTime } from "./support";

interface StationState {
  station: string;
  platform: string;
  waiting: number;
  boarding: number;
  alighting: number;
  train: { id: string; onTrain: number; boarded: number; alighted: number; board: number; alight: number } | null;
  board: string[];
  drawn: number;
  announcements: number;
  horns: number;
  people: Array<{ x: number; y: number; z: number }>;
}
interface RailState {
  trains: Array<{ id: string; line: string; x: number; z: number; speed: number; stoppedAt: string | null }>;
  stops: Array<{ line: string; name: string; x: number; z: number; footX: number; footZ: number; nextTrain: number }>;
  station: StationState | null;
  wheelsets: number;
}
const state = async (page: Page) => (await snapshot(page)) as unknown as { simTime: number; drawCalls: number; triangles: number; rail: RailState };
const LINE = "beach-tambaram";

/** Start at `hour` (crowds follow the time of day), standing at the foot of a station's platform. */
async function atStation(page: Page, name: string, hour: number): Promise<RailState["stops"][number]> {
  await page.goto("/?quality=lite");
  await page.evaluate((h) => {
    localStorage.clear();
    localStorage.setItem("cow-hour-v1", String(h));
  }, hour);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  const stop = (await state(page)).rail.stops.find((s) => s.line === LINE && s.name === name);
  if (!stop) throw new Error(`No stop ${name}`);
  await teleport(page, stop.footX, stop.footZ);
  return stop;
}

/** The station near the player, once its crowd is drawn. */
async function crowdAt(page: Page, name: string): Promise<StationState> {
  await expect.poll(async () => {
    const s = (await state(page)).rail.station;
    return s && s.station === name && s.waiting > 0 && s.drawn > 0;
  }, { timeout: GAME_WAIT, intervals: [200] }).toBe(true);
  return (await state(page)).rail.station!;
}

/** Skip the timetable to `before` seconds before the next train on the line reaches `name`. */
async function skipTo(page: Page, name: string, before: number): Promise<void> {
  const wait = (await state(page)).rail.stops.find((s) => s.line === LINE && s.name === name)!.nextTrain;
  // A train standing there now: wait for the next one.
  const skip = wait < 1 ? 8 * 60 - 35 - before : wait - before;
  if (skip > 0) await page.evaluate((s) => window.__cow?.railAdvance(s), skip);
}

/** The line's train nearest a point. */
const nearestTrain = (rail: RailState, x: number, z: number) =>
  rail.trains.filter((t) => t.line === LINE).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];

test("Egmore: people wait on the platform and the departure board shows the next trains", async ({ page }) => {
  const stop = await atStation(page, "Chennai Egmore", 8.5);
  const station = await crowdAt(page, "Chennai Egmore");
  // Rush hour at the busiest station: a real crowd, within the cap.
  expect(station.waiting).toBeGreaterThanOrEqual(12);
  expect(station.waiting + station.boarding + station.alighting).toBeLessThanOrEqual(36);
  // The board: the station and the clock, then trains soonest first, in step with the timetable.
  expect(station.board[0]).toMatch(/^CHENNAI EGMORE {2}\d\d:\d\d$/);
  expect(station.board.length).toBeGreaterThanOrEqual(3);
  const rows = station.board.slice(1);
  expect(rows.some((r) => r.includes("TAMBARAM"))).toBe(true);
  expect(rows.some((r) => r.includes("CHENNAI BEACH"))).toBe(true);
  const next = (await state(page)).rail.stops.find((s) => s.line === LINE && s.name === "Chennai Egmore")!.nextTrain;
  const tambaram = rows.find((r) => r.startsWith("PF 1  TAMBARAM"))!;
  const minutes = Number(/(\d+) MIN$/.exec(tambaram)?.[1] ?? NaN);
  if (Number.isFinite(minutes)) expect(Math.abs(minutes - Math.ceil(next / 60))).toBeLessThanOrEqual(1);
  // Everyone stands on the island platform's deck: 0.9 m up, within its length and width.
  const ax = stop.x - stop.footX;
  const az = stop.z - stop.footZ;
  const length = Math.hypot(ax, az);
  for (const p of station.people) {
    expect(p.y).toBeCloseTo(0.9, 5);
    const dx = p.x - stop.x;
    const dz = p.z - stop.z;
    const along = (dx * ax + dz * az) / length;
    const across = (dx * az - dz * ax) / length;
    expect(Math.abs(along)).toBeLessThan(55);
    expect(Math.abs(across)).toBeLessThan(11.7 / 2);
  }
  // Under the station's budget at the lite quality the tests run.
  const s = await state(page);
  console.log(`Egmore platform foot: ${s.drawCalls} draw calls, ${s.triangles} triangles, ${station.drawn} people drawn`);
  expect(s.drawCalls).toBeLessThan(300);
  expect(s.triangles).toBeLessThan(300_000);
});

test("a train brakes smoothly to a stop at Egmore, people get off and on, and it pulls away accelerating", async ({ page }) => {
  test.setTimeout(300_000);
  const stop = await atStation(page, "Chennai Egmore", 18);
  await crowdAt(page, "Chennai Egmore");
  // Braking from line speed takes about 24 s: start a little before.
  await skipTo(page, "Chennai Egmore", 26);
  const speeds: number[] = [];
  let id = "";
  await expect
    .poll(async () => {
      const rail = (await state(page)).rail;
      const train = nearestTrain(rail, stop.x, stop.z);
      if (train && train.stoppedAt !== "Chennai Egmore") {
        speeds.push(train.speed);
        id = train.id;
      }
      return train?.stoppedAt === "Chennai Egmore";
    }, { timeout: 200_000, intervals: [1500] })
    .toBe(true);
  // Sampled over game time on the way in: the speed falls at every sample to (nearly) nothing.
  expect(speeds.length).toBeGreaterThanOrEqual(4);
  const braking = speeds.slice(speeds.findIndex((v) => v < 21.9));
  expect(braking.length).toBeGreaterThanOrEqual(3);
  for (let i = 1; i < braking.length; i++) expect(braking[i]!).toBeLessThan(braking[i - 1]!);
  expect(braking[braking.length - 1]!).toBeLessThan(4);
  const standing = nearestTrain((await state(page)).rail, stop.x, stop.z)!;
  expect(standing.id).toBe(id);
  expect(standing.speed).toBe(0);

  // Doors open: some of the crowd get on, others get off.
  await expect.poll(async () => (await state(page)).rail.station?.train?.id ?? null, { timeout: GAME_WAIT, intervals: [200] }).toBe(id);
  const before = (await state(page)).rail.station!;
  // The fewest people waiting on the platform while the train stands (newcomers keep arriving).
  let fewest = before.waiting;
  await expect
    .poll(async () => {
      const s = (await state(page)).rail.station;
      fewest = Math.min(fewest, s?.waiting ?? fewest);
      const t = s?.train;
      return t && t.board > 0 && t.boarded === t.board && t.alighted === t.alight;
    }, { timeout: 120_000, intervals: [300] })
    .toBe(true);
  const after = (await state(page)).rail.station!;
  const flow = after.train!;
  expect(flow.board).toBeGreaterThan(0);
  expect(flow.alight).toBeGreaterThan(0);
  // Fewer people waiting on the platform; more on the train (in the evening rush more get on than off).
  expect(fewest).toBeLessThan(before.waiting + before.boarding);
  expect(flow.board).toBeGreaterThan(flow.alight);
  expect(flow.onTrain).toBeGreaterThan(before.train!.onTrain - before.train!.boarded + before.train!.alighted);
  expect(flow.onTrain).toBe(before.train!.onTrain - before.train!.boarded + before.train!.alighted + flow.board - flow.alight);
  // The board says so.
  expect(after.board.some((r) => r.startsWith("PF 1  TAMBARAM  ON PLATFORM"))).toBe(true);
  // Wheels are drawn on the trains beside the player.
  expect((await state(page)).rail.wheelsets).toBeGreaterThan(0);

  // It leaves: skip most of the stop, then sample on game time as it pulls away.
  const horns = after.horns;
  await page.evaluate(() => window.__cow?.railAdvance(20));
  const away: number[] = [];
  await expect
    .poll(async () => {
      const train = (await state(page)).rail.trains.find((t) => t.id === id);
      if (train && train.stoppedAt === null) away.push(train.speed);
      return away.length;
    }, { timeout: 200_000, intervals: [1500] })
    .toBeGreaterThanOrEqual(4);
  for (let i = 1; i < away.length; i++) expect(away[i]!).toBeGreaterThan(away[i - 1]!);
  // The horn sounded as it pulled away (the platform the player is beside).
  expect((await state(page)).rail.station!.horns).toBeGreaterThan(horns);
});

test("a smaller station (Kodambakkam): a crowd on the side platform, on the deck, and a live board", async ({ page }) => {
  const stop = await atStation(page, "Kodambakkam", 12);
  const station = await crowdAt(page, "Kodambakkam");
  expect(station.waiting).toBeGreaterThan(0);
  expect(station.board[0]).toMatch(/^KODAMBAKKAM {2}\d\d:\d\d$/);
  expect(station.board.slice(1).every((r) => /^PF [12] {2}[A-Z ]+ {2}(\d+ MIN|DUE|ARRIVING|ON PLATFORM)$/.test(r))).toBe(true);
  const ax = stop.x - stop.footX;
  const az = stop.z - stop.footZ;
  const length = Math.hypot(ax, az);
  for (const p of station.people) {
    expect(p.y).toBeCloseTo(0.9, 5);
    const along = ((p.x - stop.x) * ax + (p.z - stop.z) * az) / length;
    const across = ((p.x - stop.x) * az - (p.z - stop.z) * ax) / length;
    expect(Math.abs(along)).toBeLessThan(55);
    // A 4 m side platform.
    expect(Math.abs(across)).toBeLessThan(2);
  }
  // A train coming: the chime is announced under a minute before it arrives.
  const announced = station.announcements;
  await skipTo(page, "Kodambakkam", 53);
  await waitGameTime(page, 5);
  await expect.poll(async () => (await state(page)).rail.station?.announcements ?? 0, { timeout: GAME_WAIT, intervals: [200] }).toBeGreaterThan(announced);
});
