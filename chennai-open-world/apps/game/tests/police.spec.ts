/** Police and the wanted level: crimes give stars, police cars come, the stars fade when lost, arrests. */
import { expect, test, type Page } from "@playwright/test";
import { GAME_WAIT, board, getOut, ready, snapshot, teleport, waitGameTime } from "./support";

interface PoliceState {
  stars: number;
  seen: boolean;
  unseenFor: number;
  /** `unit`: which car and which time it was sent out (a new value is a new unit). */
  cars: Array<{ x: number; z: number; speed: number; state: string; unit: string }>;
  officers: Array<{ x: number; z: number; health: number }>;
  lastBust: { fine: number; stars: number; x: number; z: number } | null;
  lastCrime: string | null;
}
interface State {
  simTime: number;
  x: number;
  z: number;
  money: number;
  ammo: number;
  mode: string;
  police: PoliceState;
  vehicles: Array<{ id: string; x: number; z: number }>;
}
const state = async (page: Page) => (await snapshot(page)) as unknown as State;

/** Game seconds before one star is lost unseen (`WANTED.loseAfter[1]` in @cow/combat). */
const LOSE_ONE_STAR = 30;
/** Most game seconds the wait can be held while the first car drives to the crime (`POLICE.responseMax` in Police.ts). */
const RESPONSE_MAX = 45;
/** Wall-clock bound for waits that the game measures in its own time (software rendering runs slowly). */
const SLOW = 150_000;
const MONEY = 5000;

/** Open the game with money for fines. */
async function start(page: Page): Promise<void> {
  await page.goto("/?quality=lite&start=play");
  await page.evaluate((money) => {
    localStorage.clear();
    localStorage.setItem("cow-progress-v1", JSON.stringify({ completed: [], money }));
  }, MONEY);
  await ready(page, true);
}

/** Give the player rounds and hold FIRE until a shot has gone off. */
async function fireOnce(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __cow: { giveAmmo(n: number): void } }).__cow.giveAmmo(6));
  const fire = page.getByRole("button", { name: "Fire", exact: true });
  await fire.dispatchEvent("pointerdown", { pointerId: 51, pointerType: "touch" });
  await expect.poll(async () => (await state(page)).ammo, { timeout: 20_000, intervals: [50] }).toBeLessThan(6);
  await fire.dispatchEvent("pointerup", { pointerId: 51, pointerType: "touch" });
}

const nearestCar = (s: State) => Math.min(Infinity, ...s.police.cars.map((c) => Math.hypot(c.x - s.x, c.z - s.z)));

test("firing the pistol in the street gives a star, and a police car comes", async ({ page }) => {
  test.setTimeout(240_000);
  await start(page);
  await expect(page.getByTestId("wanted")).toBeHidden();
  await fireOnce(page);
  const shot = await state(page);
  expect(shot.police.stars).toBe(1);
  expect(shot.police.lastCrime).toBe("gunfire");
  await expect(page.getByTestId("wanted")).toBeVisible();
  await expect(page.getByTestId("wanted")).toHaveAttribute("data-stars", "1");
  // A car is sent at once, from out of sight (never right next to the player)...
  await expect.poll(async () => (await state(page)).police.cars.length, { timeout: 20_000 }).toBe(1);
  expect(nearestCar(await state(page))).toBeGreaterThan(60);
  // ...and drives to the player along the roads, who it then sees (the stars flash).
  await expect.poll(async () => nearestCar(await state(page)), { timeout: SLOW, intervals: [250] }).toBeLessThan(25);
  const there = await state(page);
  expect(there.police.seen).toBe(true);
  expect(there.police.stars).toBe(1);
  await expect(page.getByTestId("wanted")).toHaveClass(/seen/);
});

test("losing the police: far away and out of sight, the star fades", async ({ page }) => {
  test.setTimeout(600_000);
  await start(page);
  await fireOnce(page);
  const shotAt = (await state(page)).simTime;
  await expect.poll(async () => (await state(page)).police.cars.length, { timeout: 20_000 }).toBe(1);
  // Jump across the city (beside a car parked for a T. Nagar job, kilometres away).
  const s = await state(page);
  const far = s.vehicles.find((v) => v.id === "car-tnagar")!;
  expect(Math.hypot(far.x - s.x, far.z - s.z)).toBeGreaterThan(1000);
  await teleport(page, far.x + 3, far.z);
  // The police search where the shot was fired; nobody sees the player, so the star is lost, but
  // not before its time: the wait starts once the first car has reached the spot (it can't fade
  // while they are still on their way), so at least the full wait after the shot.
  const unseen = (await state(page)).police.unseenFor;
  expect(unseen).toBeLessThan(LOSE_ONE_STAR - 6);
  await waitGameTime(page, LOSE_ONE_STAR - unseen - 4);
  expect((await state(page)).police.stars).toBe(1);
  // Lost at the latest once the response window and the full wait have passed (game time: on a
  // busy machine the game runs well behind the clock, so a wall-clock bound isn't the measure).
  while ((await state(page)).police.stars > 0 && (await state(page)).simTime - shotAt < RESPONSE_MAX + LOSE_ONE_STAR + 5) await waitGameTime(page, 1);
  expect((await state(page)).police.stars).toBe(0);
  await expect(page.getByTestId("wanted")).toBeHidden();
  // Not wanted: the search is called off and the car leaves.
  await expect.poll(async () => (await state(page)).police.cars.length, { timeout: GAME_WAIT }).toBe(0);
});

test("standing still next to an officer at one star gets the player busted", async ({ page }) => {
  test.setTimeout(300_000);
  await start(page);
  await fireOnce(page);
  const before = await state(page);
  // The car pulls up, officers get out and walk over; the player keeps still.
  await expect.poll(async () => (await state(page)).police.officers.length, { timeout: SLOW, intervals: [250] }).toBeGreaterThan(0);
  await expect.poll(async () => (await state(page)).police.lastBust, { timeout: SLOW, intervals: [250] }).not.toBeNull();
  await expect(page.locator(".cow-toast")).toContainText("Busted");
  const after = await state(page);
  expect(after.police.lastBust).toMatchObject({ fine: 500, stars: 1 });
  expect(after.money).toBe(MONEY - 500);
  expect(after.ammo).toBe(0); // weapons taken
  expect(after.police.stars).toBe(0);
  expect(after.police.cars).toHaveLength(0);
  expect(after.police.officers).toHaveLength(0);
  await expect(page.getByTestId("wanted")).toBeHidden();
  // Released outside a police station, away from where it happened.
  expect(Math.hypot(after.x - after.police.lastBust!.x, after.z - after.police.lastBust!.z)).toBeLessThan(2);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(100);
});

test("taking someone else's parked car gives a star, and at two stars the job board is closed", async ({ page }) => {
  await start(page);
  await board(page, "car-start"); // the player's own hatchback: no crime
  // Getting out is an animated sequence now (door, step out): wait for it in game time.
  await getOut(page);
  expect((await state(page)).police.stars).toBe(0);
  await board(page, "car-1"); // parked by someone else, for free roaming
  await expect.poll(async () => (await state(page)).police.stars).toBe(1);
  expect((await state(page)).police.lastCrime).toBe("vehicleTheft");
  // At one star work goes on; from two stars the board takes no new jobs.
  await page.getByTestId("jobs").click();
  await expect(page.getByRole("dialog")).toContainText("Job board");
  await page.getByRole("button", { name: "Close" }).click();
  await page.evaluate(() => (window as unknown as { __cow: { setWanted(n: number): void } }).__cow.setWanted(2));
  await page.getByTestId("jobs").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".cow-toast")).toContainText("Lose them first");
});

test("officers shot dead stay dead: their car is left where it stopped, and a new unit comes from out of sight", async ({ page }) => {
  test.setTimeout(480_000);
  await start(page);
  const heal = (p: Page) => p.evaluate(() => (window as unknown as { __cow: { setHealth(n: number): void } }).__cow.setHealth(100));
  // Every unit sent out, and how far from the player it was when first seen in the snapshot.
  const firstSeen = new Map<string, number>();
  const sample = async () => {
    const s = await state(page);
    for (const car of s.police.cars) if (!firstSeen.has(car.unit)) firstSeen.set(car.unit, Math.hypot(car.x - s.x, car.z - s.z));
    return s;
  };
  await fireOnce(page);
  // The first car pulls up and its two officers get out.
  await expect.poll(async () => (await sample()).police.officers.length, { timeout: SLOW, intervals: [250] }).toBe(2);
  const first = (await sample()).police.cars.find((c) => c.state === "parked")!;
  expect(first).toBeDefined();
  // Rounds for a shoot-out (`fireOnce` left only a few), and face the car so the lock-on picks the officers.
  await page.evaluate(() => (window as unknown as { __cow: { giveAmmo(n: number): void } }).__cow.giveAmmo(150));
  const facing = await state(page);
  await teleport(page, facing.x, facing.z, Math.atan2(-(first.x - facing.x), -(first.z - facing.z)));
  // Shoot both (the lock-on and the pistol's aim assistance pick them; the player is kept alive).
  const fire = page.getByRole("button", { name: "Fire", exact: true });
  await fire.dispatchEvent("pointerdown", { pointerId: 53, pointerType: "touch" });
  try {
    await expect.poll(async () => {
      await heal(page);
      const s = await sample();
      const crew = s.police.officers.filter((o) => Math.hypot(o.x - first.x, o.z - first.z) < 25);
      return crew.length > 0 && crew.every((o) => o.health <= 0);
    }, { timeout: SLOW, intervals: [100] }).toBe(true);
  } finally {
    await fire.dispatchEvent("pointerup", { pointerId: 53, pointerType: "touch" });
  }
  // The car stays where it stopped, empty: past the time a car takes to let officers out again
  // (6 s), nobody living is standing by it, and it is the same unit, not one sent again.
  for (let i = 0; i < 8; i++) {
    await waitGameTime(page, 1);
    await heal(page);
    const s = await sample();
    const car = s.police.cars.find((c) => c.unit === first.unit);
    expect(car?.state, "the empty car stays put").toBe("abandoned");
    expect(Math.hypot(car!.x - first.x, car!.z - first.z)).toBeLessThan(1);
    const standing = s.police.officers.filter((o) => o.health > 0 && Math.hypot(o.x - first.x, o.z - first.z) < 6);
    expect(standing, "no officer comes back out of the empty car").toHaveLength(0);
  }
  // The dead were taken away like other casualties (`Combat` removes the fallen after 5 s).
  expect((await sample()).police.officers.filter((o) => o.health <= 0 && Math.hypot(o.x - first.x, o.z - first.z) < 25)).toHaveLength(0);
  // Still wanted (three stars after killing an officer), so a new unit is sent, from out of sight.
  expect((await sample()).police.stars).toBeGreaterThanOrEqual(3);
  await expect.poll(async () => (await sample()).police.cars.filter((c) => c.unit !== first.unit && c.state !== "abandoned").length, { timeout: SLOW, intervals: [100] }).toBeGreaterThan(0);
  for (const [unit, distance] of firstSeen) if (unit !== first.unit) expect(distance, `unit ${unit} appeared in sight`).toBeGreaterThan(50);
});
