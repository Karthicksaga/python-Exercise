/** Driving into a pedestrian: knocked down, injured or killed, with a fine and lost reputation. */
import { expect, test, type Page } from "@playwright/test";
import { board, probe, ready, snapshot, tapButton, teleport, waitGameTime } from "./support";

interface HitSnapshot {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  money: number;
  reputation: number;
  casualties: Array<{ x: number; z: number; state: string; speed: number }>;
  lastPedestrianHit: { outcome: string; speed: number; fine: number; reputation: number } | null;
}
const state = (page: Page) => snapshot(page) as unknown as Promise<HitSnapshot>;
const MONEY = 20_000;

/** Open the game with money in the bank (fines are never more than the player has). */
async function start(page: Page): Promise<void> {
  await page.goto("/?quality=lite");
  await page.evaluate((money) => {
    localStorage.clear();
    localStorage.setItem("cow-progress-v1", JSON.stringify({ completed: [], money }));
  }, MONEY);
  await ready(page, true);
}

/**
 * Point the car down the longest clear line near where it is parked (no straight is hard-coded).
 * Three parallel rays, down the middle and 1.1 m to each side, so a pole off the centre line
 * but within the car's width is not missed.
 */
async function lineUp(page: Page, needed: number): Promise<{ x: number; z: number }> {
  const at = await state(page);
  let best = { yaw: at.yaw, clear: 0 };
  for (let i = 0; i < 32; i++) {
    const yaw = (i / 32) * Math.PI * 2;
    const dx = -Math.sin(yaw);
    const dz = -Math.cos(yaw);
    let clear = 200;
    for (const side of [-1.1, 0, 1.1]) clear = Math.min(clear, (await probe(page, at.x - dz * side, at.z + dx * side, dx, dz, 200)) ?? 200);
    if (clear > best.clear) best = { yaw, clear };
  }
  expect(best.clear).toBeGreaterThan(needed);
  await teleport(page, at.x, at.z, best.yaw);
  return { x: at.x, z: at.z };
}

const accelerate = (page: Page, down: boolean) =>
  page.getByRole("button", { name: "Accelerate", exact: true }).dispatchEvent(down ? "pointerdown" : "pointerup", { pointerId: 31, pointerType: "touch" });

/**
 * Stand a pedestrian `ahead` metres in front of the vehicle, `aside` metres to its right of the
 * centre line (so it is struck off-centre), facing `turn` radians from across the road.
 */
async function placeAhead(page: Page, ahead: number, aside = 0, turn = 0): Promise<void> {
  const s = await state(page);
  const fx = -Math.sin(s.yaw);
  const fz = -Math.cos(s.yaw);
  // Right of facing (fx, fz) is (-fz, fx).
  const x = s.x + fx * ahead - fz * aside;
  const z = s.z + fz * ahead + fx * aside;
  // Facing across the road, as someone crossing would.
  const placed = await page.evaluate(
    ([px, pz, heading]) => (window as unknown as { __cow: { stagePedestrian(x: number, z: number, h: number): boolean } }).__cow.stagePedestrian(px!, pz!, heading!),
    [x, z, s.yaw + Math.PI / 2 + turn],
  );
  expect(placed).toBe(true);
}

/** Wait for the car to hit someone (a wall-clock limit only). */
async function waitForHit(page: Page): Promise<NonNullable<HitSnapshot["lastPedestrianHit"]>> {
  await expect.poll(async () => (await state(page)).lastPedestrianHit, { timeout: 30_000, intervals: [50] }).not.toBeNull();
  return (await state(page)).lastPedestrianHit!;
}

test.describe.configure({ timeout: 240_000 });

test("hitting a pedestrian at speed kills them: message, fine, reputation; they stay, then are removed", async ({ page }) => {
  await start(page);
  const before = await state(page);
  expect(before.money).toBe(MONEY);
  expect(before.reputation).toBe(50);
  await board(page, "car-start");
  const parked = await lineUp(page, 110);

  await accelerate(page, true);
  try {
    await expect.poll(async () => (await state(page)).speed, { timeout: 40_000, intervals: [100] }).toBeGreaterThan(15);
    await placeAhead(page, 16);
    const hit = await waitForHit(page);
    const after = await state(page);
    expect(hit.outcome).toBe("killed");
    expect(hit.speed).toBeGreaterThanOrEqual(12.5);
    // The car slows only a little: a 70 kg person against a 950 kg hatchback.
    expect(after.speed).toBeGreaterThan(hit.speed * 0.8);
  } finally {
    await accelerate(page, false);
  }
  await expect(page.locator(".cow-toast")).toContainText("You hit a pedestrian: killed");
  await expect(page.locator(".cow-toast")).toContainText("Fine ₹5,000");
  const fined = await state(page);
  expect(fined.lastPedestrianHit).toMatchObject({ fine: 5000, reputation: 20 });
  expect(fined.money).toBe(MONEY - 5000);
  expect(fined.reputation).toBe(30);
  expect(fined.casualties).toHaveLength(1);
  expect(fined.casualties[0]!.state).toBe("dead");

  // They do not get up.
  await page.getByRole("button", { name: "Brake", exact: true }).dispatchEvent("pointerdown", { pointerId: 32, pointerType: "touch" });
  await waitGameTime(page, 8);
  await page.getByRole("button", { name: "Brake", exact: true }).dispatchEvent("pointerup", { pointerId: 32, pointerType: "touch" });
  const later = await state(page);
  expect(later.casualties).toHaveLength(1);
  expect(later.casualties[0]).toMatchObject({ state: "dead", speed: 0 });
  // The penalty was saved: it survives a reload.
  const saved = await page.evaluate(() => [JSON.parse(localStorage.getItem("cow-progress-v1") ?? "{}").money, JSON.parse(localStorage.getItem("cow-jobs-v1") ?? "{}").reputation]);
  expect(saved).toEqual([MONEY - 5000, 30]);

  // Drive off (back to where the car was parked, over 35 m away): once their time is up they are removed.
  const spot = later.casualties[0]!;
  expect(Math.hypot(spot.x - parked.x, spot.z - parked.z)).toBeGreaterThan(35);
  await teleport(page, parked.x, parked.z, 0);
  await waitGameTime(page, 18);
  expect((await state(page)).casualties).toHaveLength(0);
});

test("hitting a pedestrian at medium speed injures them: they lie down, then get up and limp off", async ({ page }) => {
  await start(page);
  await board(page, "car-start");
  await lineUp(page, 80);

  await accelerate(page, true);
  try {
    await expect.poll(async () => (await state(page)).speed, { timeout: 40_000, intervals: [100] }).toBeGreaterThan(7);
  } finally {
    await accelerate(page, false);
  }
  await placeAhead(page, 9);
  const hit = await waitForHit(page);
  expect(hit.outcome).toBe("injured");
  expect(hit.speed).toBeGreaterThanOrEqual(4.5);
  expect(hit.speed).toBeLessThan(12.5);
  await expect(page.locator(".cow-toast")).toContainText("You hit a pedestrian: injured");
  const fined = await state(page);
  expect(fined.lastPedestrianHit).toMatchObject({ fine: 1500, reputation: 8 });
  expect(fined.money).toBe(MONEY - 1500);
  expect(fined.reputation).toBe(42);
  expect(fined.casualties.map((c) => c.state)).toEqual(["down"]);

  // A few seconds on the road, then up and limping away slowly.
  await waitGameTime(page, 3);
  expect((await state(page)).casualties.map((c) => c.state)).toEqual(["down"]);
  await waitGameTime(page, 3);
  const up = await state(page);
  expect(up.casualties.map((c) => c.state)).toEqual(["limping"]);
  let fastest = 0;
  for (let i = 0; i < 10; i++) {
    await waitGameTime(page, 0.3);
    fastest = Math.max(fastest, (await state(page)).casualties[0]?.speed ?? 0);
  }
  expect(fastest).toBeGreaterThan(0.1);
  expect(fastest).toBeLessThanOrEqual(0.61);
});

test("the auto-rickshaw and the motorbike hit people off-centre too, and the hit is counted at the speed they came in at", async ({ page }) => {
  await start(page);
  // Struck by a corner (auto) or the very edge (bike, 0.32 m half-width), the person turned at an angle.
  const cases = [
    { id: "auto-park", aside: 0.75, injuries: 1 },
    { id: "bike-start", aside: -0.45, injuries: 2 },
  ] as const;
  for (const { id, aside, injuries } of cases) {
    await board(page, id);
    await lineUp(page, 70);
    await accelerate(page, true);
    try {
      await expect.poll(async () => (await state(page)).speed, { timeout: 40_000, intervals: [100] }).toBeGreaterThan(7);
    } finally {
      await accelerate(page, false);
    }
    const before = await state(page);
    await placeAhead(page, 9, aside, 0.8);
    await expect.poll(async () => (await state(page)).casualties.length, { timeout: 30_000, intervals: [50] }).toBe(injuries);
    const after = await state(page);
    expect(after.lastPedestrianHit).toMatchObject({ outcome: "injured", fine: 1500, reputation: 8 });
    // Came in above 7 m/s and coasted at most a little: the hit is not read after the body stopped the vehicle.
    expect(after.lastPedestrianHit!.speed).toBeGreaterThan(5.5);
    expect(after.lastPedestrianHit!.speed).toBeLessThanOrEqual(before.speed + 0.5);
    expect(after.money).toBe(MONEY - 1500 * injuries);
    // Brake to a stop and get out for the next vehicle.
    await page.getByRole("button", { name: "Brake", exact: true }).dispatchEvent("pointerdown", { pointerId: 32, pointerType: "touch" });
    await expect.poll(async () => (await state(page)).speed, { timeout: 30_000, intervals: [100] }).toBeLessThan(1);
    await page.getByRole("button", { name: "Brake", exact: true }).dispatchEvent("pointerup", { pointerId: 32, pointerType: "touch" });
    await tapButton(page, "Get out");
  }
  expect((await state(page)).reputation).toBe(50 - 16);
});

test("hits still register at a low frame rate (CPU slowed six times)", async ({ page }) => {
  await start(page);
  await board(page, "car-start");
  await lineUp(page, 80);
  // Chromium's CPU throttling: the game draws a few frames a second and runs several physics steps per frame.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  try {
    await accelerate(page, true);
    try {
      await expect.poll(async () => (await state(page)).speed, { timeout: 120_000, intervals: [100] }).toBeGreaterThan(7);
    } finally {
      await accelerate(page, false);
    }
    const slow = (await snapshot(page)) as unknown as { fps: number };
    await placeAhead(page, 10, 0.5, 0.5);
    const hit = await waitForHit(page);
    expect(hit.outcome).toBe("injured");
    expect(hit.speed).toBeGreaterThan(5.5);
    expect((await state(page)).casualties.map((c) => c.state)).toEqual(["down"]);
    console.log(`frame rate while throttled: ${slow.fps.toFixed(1)} fps`);
    expect(slow.fps).toBeLessThan(30);
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }
});
