/**
 * Stages 11 to 15, the street war, each played through with the test hooks (teleport to skip
 * the long drives across town, as `combat.spec.ts` does for stages 7 and 8).
 */
import { expect, test, type Page } from "@playwright/test";
import { GAME_WAIT, board, holdButton, ready, snapshot, teleport, waitGameTime } from "./support";

const FIRST_TEN = ["morning-walk", "borrowed-wheels", "auto-shift", "parcel-run", "cross-town", "bike-courier", "park-trouble", "bike-thieves", "godown-raid", "roundtana-showdown"];
const LATER = ["courier-chase", "tea-shop", "drive-by", "snake-pit", "turf-war"];

interface State {
  x: number;
  z: number;
  mode: string;
  money: number;
  health: number;
  mission: string | null;
  objective: string | null;
  target: { x: number; z: number } | null;
  quarry: { x: number; z: number } | null;
  weapons: string[];
  weaponAmmo: Record<string, number>;
  enemies: Array<{ x: number; z: number; health: number; group: string; weapon: string }>;
}
const state = async (page: Page) => (await snapshot(page)) as unknown as State;
type Hooks = { __cow: { giveWeapon(id: string, n: number): void; setHealth(h: number): void } };
const give = (page: Page, id: string, ammo: number) => page.evaluate(([w, n]) => (window as unknown as Hooks).__cow.giveWeapon(w!, Number(n)), [id, String(ammo)]);
/** Keep the player standing: these tests check that the stages can be finished, not how hard they are. */
const heal = (page: Page) => page.evaluate(() => (window as unknown as Hooks).__cow.setHealth(100));

/** Open the game with the stages before `id` complete. */
async function startAt(page: Page, id: string, money: number): Promise<void> {
  const done = [...FIRST_TEN, ...LATER.slice(0, LATER.indexOf(id))];
  await page.goto("/?quality=lite");
  await page.evaluate(([list, cash]) => {
    localStorage.clear();
    localStorage.setItem("cow-progress-v1", JSON.stringify({ completed: JSON.parse(list as string), money: cash }));
  }, [JSON.stringify(done), money] as const);
  await ready(page, true);
  expect((await state(page)).mission).toBe(id);
}

async function goToTarget(page: Page): Promise<void> {
  const s = await state(page);
  await teleport(page, s.target!.x, s.target!.z);
}

/** Beat the stage's group: stand 7 m from each enemy in turn, facing it, and hold FIRE. */
async function shootItOut(page: Page, objective: string, group: string, restart: string): Promise<void> {
  for (let round = 0; round < 80; round++) {
    const s = await state(page);
    if (s.objective === restart) {
      // Knocked out between heals (eight armed enemies hit hard) and sent back: return.
      await goToTarget(page);
      continue;
    }
    if (s.objective !== objective) break;
    await heal(page);
    const enemy = s.enemies.filter((e) => e.group === group && e.health > 0)[0];
    if (!enemy) {
      await waitGameTime(page, 0.3);
      continue;
    }
    // From the side the player is on, so the shot isn't through a wall.
    const away = Math.hypot(s.x - enemy.x, s.z - enemy.z) || 1;
    const from = { x: enemy.x + ((s.x - enemy.x) / away) * 6, z: enemy.z + ((s.z - enemy.z) / away) * 6 };
    await teleport(page, from.x, from.z, Math.atan2(-(enemy.x - from.x), -(enemy.z - from.z)));
    await heal(page);
    // A line per few rounds, so a failure shows how the fight went.
    if (round % 5 === 0) console.log(`${group} round ${round}: health ${Math.round(s.health)}, standing ${s.enemies.filter((e) => e.group === group && e.health > 0).map((e) => `${e.weapon}:${e.health}`).join(" ")}`);
    await holdButton(page, "Fire", 500);
  }
}

test("stage 11: catch the gang courier on Peters Road and take the money to the tea shop", async ({ page }) => {
  test.setTimeout(180_000);
  await startAt(page, "courier-chase", 10_000);
  expect((await state(page)).objective).toBe("Go to Peters Road, Royapettah");
  await goToTarget(page);
  await expect.poll(async () => (await state(page)).objective, { timeout: GAME_WAIT }).toBe("Get in a car");
  await board(page, "car-royapettah");
  await expect.poll(async () => (await state(page)).objective, { timeout: GAME_WAIT }).toBe("Wait on Peters Road for the courier");
  await goToTarget(page);
  await expect.poll(async () => (await state(page)).objective, { timeout: GAME_WAIT }).toBe("Catch the courier: pull up beside him");
  // He rides off along the road.
  const first = (await state(page)).quarry!;
  await waitGameTime(page, 1.5);
  const moved = (await state(page)).quarry!;
  expect(Math.hypot(moved.x - first.x, moved.z - first.z)).toBeGreaterThan(5);
  // Draw up beside him.
  for (let i = 0; i < 20; i++) {
    const s = await state(page);
    if (!s.objective?.startsWith("Catch")) break;
    if (s.quarry) await teleport(page, s.quarry.x, s.quarry.z);
  }
  await expect.poll(async () => (await state(page)).objective, { timeout: GAME_WAIT }).toBe("Take the money back to the tea shop, Triplicane High Road");
  expect((await state(page)).quarry).toBeNull();
  await goToTarget(page);
  await expect.poll(async () => (await state(page)).mission, { timeout: GAME_WAIT }).toBe("tea-shop");
  expect((await state(page)).money).toBe(10_000 + 2200);
});

test("stage 12: the racket comes to the tea shop and is beaten; the shotgun is the reward", async ({ page }) => {
  test.setTimeout(240_000);
  await startAt(page, "tea-shop", 12_200);
  await goToTarget(page);
  await expect.poll(async () => (await state(page)).enemies.filter((e) => e.group === "racket").length, { timeout: GAME_WAIT }).toBe(4);
  expect((await state(page)).objective).toBe("Send the racket packing");
  await give(page, "pistol", 80);
  await shootItOut(page, "Send the racket packing", "racket", "Wait at the tea shop");
  await expect.poll(async () => (await state(page)).mission, { timeout: GAME_WAIT }).toBe("drive-by");
  const end = await state(page);
  expect(end.money).toBe(12_200 + 2500);
  expect(end.weapons).toContain("shotgun");
  expect(end.weaponAmmo.shotgun).toBeGreaterThanOrEqual(14);
  await expect(page.getByRole("status")).toContainText("Stage 12 complete");
});

test("stage 13: get on the bike with the crew shooting, and ride out to the beach road", async ({ page }) => {
  test.setTimeout(180_000);
  await startAt(page, "drive-by", 14_700);
  await goToTarget(page);
  await expect.poll(async () => (await state(page)).objective, { timeout: GAME_WAIT }).toBe("Get on the motorbike");
  await board(page, "bike-triplicane");
  await expect.poll(async () => (await state(page)).objective, { timeout: GAME_WAIT }).toBe("Ride to the beach road before they get you");
  // The ambush appears as you ride off: armed, in the gang's colours.
  await expect.poll(async () => (await state(page)).enemies.filter((e) => e.group === "driveby").length, { timeout: GAME_WAIT }).toBe(4);
  expect((await state(page)).enemies.some((e) => e.weapon === "smg")).toBe(true);
  await heal(page);
  await goToTarget(page);
  await expect.poll(async () => (await state(page)).mission, { timeout: GAME_WAIT }).toBe("snake-pit");
  const end = await state(page);
  expect(end.money).toBe(14_700 + 2000);
  expect(end.weapons).toContain("smg");
  expect(end.enemies.filter((e) => e.group === "driveby")).toHaveLength(0); // the ambush is gone
});

test("stage 14: clear out the hideout with the SMG", async ({ page }) => {
  test.setTimeout(300_000);
  await startAt(page, "snake-pit", 16_700);
  await give(page, "smg", 360);
  await goToTarget(page);
  await expect.poll(async () => (await state(page)).enemies.filter((e) => e.group === "hideout").length, { timeout: GAME_WAIT }).toBe(6);
  const before = (await state(page)).weaponAmmo.smg!;
  await shootItOut(page, "Clear out the hideout", "hideout", "Find the hideout, Egmore");
  await expect.poll(async () => (await state(page)).mission, { timeout: GAME_WAIT }).toBe("turf-war");
  const end = await state(page);
  expect(end.money).toBe(16_700 + 3500);
  expect(before - (end.weaponAmmo.smg ?? 0)).toBeGreaterThan(10);
});

test("stage 15: win the turf war at the clock tower, and the street war is over", async ({ page }) => {
  test.setTimeout(300_000);
  await startAt(page, "turf-war", 20_200);
  await give(page, "shotgun", 40);
  await give(page, "smg", 360);
  await goToTarget(page);
  await expect.poll(async () => (await state(page)).enemies.filter((e) => e.group === "turf").length, { timeout: GAME_WAIT }).toBe(8);
  await shootItOut(page, "Win the turf war", "turf", "Go to the clock tower, Royapettah");
  await expect.poll(async () => (await state(page)).mission, { timeout: GAME_WAIT }).toBeNull();
  expect((await state(page)).money).toBe(20_200 + 6000);
});
