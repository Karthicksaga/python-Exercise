/** Police and the wanted level: crimes give stars, police cars come, the stars fade when lost, arrests. */
import { expect, test, type Page } from "@playwright/test";
import { board, ready, snapshot, teleport, waitGameTime } from "./support";

interface PoliceState {
  stars: number;
  seen: boolean;
  unseenFor: number;
  cars: Array<{ x: number; z: number; speed: number; state: string }>;
  officers: Array<{ x: number; z: number; health: number }>;
  lastBust: { fine: number; stars: number; x: number; z: number } | null;
  lastCrime: string | null;
}
interface State {
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
/** Wall-clock bound for waits that the game measures in its own time (software rendering runs slowly). */
const SLOW = 150_000;
const MONEY = 5000;

/** Open the game with money for fines. */
async function start(page: Page): Promise<void> {
  await page.goto("/?quality=lite");
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
  test.setTimeout(300_000);
  await start(page);
  await fireOnce(page);
  await expect.poll(async () => (await state(page)).police.cars.length, { timeout: 20_000 }).toBe(1);
  // Jump across the city (beside a car parked for a T. Nagar job, kilometres away).
  const s = await state(page);
  const far = s.vehicles.find((v) => v.id === "car-tnagar")!;
  expect(Math.hypot(far.x - s.x, far.z - s.z)).toBeGreaterThan(1000);
  await teleport(page, far.x + 3, far.z);
  // The police search where the shot was fired; nobody sees the player, so the star is lost,
  // but not before its time (counted from the shot, the last time the police knew where they were).
  const unseen = (await state(page)).police.unseenFor;
  expect(unseen).toBeLessThan(LOSE_ONE_STAR - 6);
  await waitGameTime(page, LOSE_ONE_STAR - unseen - 4);
  expect((await state(page)).police.stars).toBe(1);
  await expect.poll(async () => (await state(page)).police.stars, { timeout: SLOW, intervals: [250] }).toBe(0);
  await expect(page.getByTestId("wanted")).toBeHidden();
  // Not wanted: the search is called off and the car leaves.
  await expect.poll(async () => (await state(page)).police.cars.length, { timeout: 30_000 }).toBe(0);
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
  await page.getByRole("button", { name: "Get out", exact: true }).dispatchEvent("pointerdown", { pointerId: 41, pointerType: "touch" });
  await expect.poll(async () => (await state(page)).mode).toBe("foot");
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
