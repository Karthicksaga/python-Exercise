/**
 * Stages 11 to 15, the street war, each played through with the test hooks (teleport to skip
 * the long drives across town, as `combat.spec.ts` does for stages 7 and 8).
 */
import { expect, test, type Page } from "@playwright/test";
import { GAME_WAIT, board, holdButton, probe, ready, snapshot, teleport, waitGameTime } from "./support";

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
  await page.goto("/?quality=lite&start=play");
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

/** Beat the stage's group: stand 6 m from each enemy in turn, facing it, and hold FIRE. */
async function shootItOut(page: Page, objective: string, group: string, restart: string): Promise<void> {
  // Rounds spent on each enemy without hurting them, by where they stand (see below).
  const tries = new Map<string, { health: number; attempt: number }>();
  for (let round = 0; round < 80; round++) {
    const s = await state(page);
    if (s.objective === restart) {
      // Knocked out between heals (eight armed enemies hit hard) and sent back: return.
      await goToTarget(page);
      continue;
    }
    if (s.objective !== objective) break;
    await heal(page);
    // The first standing enemy, unless six rounds at them have hurt nobody: then the next one a
    // round can reach (an enemy who wandered somewhere unreachable used to hold the test for
    // the rest of its rounds while the others stood untouched, stage 15 in CI). They are
    // tried again once the others are down.
    const crew = s.enemies.filter((e) => e.group === group && e.health > 0);
    const stuck = (e: (typeof crew)[number]) => (tries.get(`${e.weapon}@${Math.round(e.x)},${Math.round(e.z)}`)?.attempt ?? 0) >= 6;
    const enemy = crew.find((e) => !stuck(e)) ?? crew[0];
    if (!enemy) {
      await waitGameTime(page, 0.3);
      continue;
    }
    // Stand 6 m off where a shot can reach the enemy. Spots checked both ways come first: clear
    // outward from just past the enemy's own collision box (0.28 m half-width, 0.4 m to a
    // corner), and from the spot inward the first thing met is a person. Then spots clear outward
    // from 0.7 m (the old check, which misses a pole or wall right at the enemy's shoulder).
    // If a round from one spot did not hurt this enemy, the next round tries the next spot: the
    // helper used to return to the same useless spot for 70+ rounds (stages 12 and 14 in CI).
    const key = `${enemy.weapon}@${Math.round(enemy.x)},${Math.round(enemy.z)}`;
    const before = tries.get(key);
    const attempt = before && before.health <= enemy.health ? before.attempt + 1 : 0;
    tries.set(key, { health: enemy.health, attempt });
    const standing = s.enemies.filter((e) => e.health > 0);
    const meetsSomeone = (x: number, z: number) => standing.some((e) => Math.hypot(e.x - x, e.z - z) <= 0.45);
    const toward = Math.atan2(s.x - enemy.x, s.z - enemy.z);
    const verified: Array<{ x: number; z: number }> = [];
    const open: Array<{ x: number; z: number }> = [];
    for (let k = 0; k < 16; k++) {
      const a = toward + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      const spot = { x: enemy.x + dx * 6, z: enemy.z + dz * 6 };
      const out = await probe(page, enemy.x + dx * 0.45, enemy.z + dz * 0.45, dx, dz, 5.55);
      const outClear = out === null || meetsSomeone(enemy.x + dx * (0.45 + out), enemy.z + dz * (0.45 + out));
      const back = outClear ? await probe(page, spot.x, spot.z, -dx, -dz, 6) : null;
      if (outClear && back !== null && meetsSomeone(enemy.x + dx * (6 - back), enemy.z + dz * (6 - back))) verified.push(spot);
      else if ((await probe(page, enemy.x + dx * 0.7, enemy.z + dz * 0.7, dx, dz, 6)) === null) open.push(spot);
    }
    const spots = [...verified, ...open];
    const from = spots.length > 0 ? spots[attempt % spots.length]! : { x: enemy.x + Math.sin(toward) * 6, z: enemy.z + Math.cos(toward) * 6 };
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
  // Given, not put in the hand, so none has been fired yet.
  expect(end.weaponAmmo.shotgun).toBe(14);
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

test("stage 15: win the turf war at the clock tower, and the street war is over (stage 16 is next)", async ({ page }) => {
  test.setTimeout(300_000);
  await startAt(page, "turf-war", 20_200);
  await give(page, "shotgun", 40);
  await give(page, "smg", 360);
  await goToTarget(page);
  await expect.poll(async () => (await state(page)).enemies.filter((e) => e.group === "turf").length, { timeout: GAME_WAIT }).toBe(8);
  await shootItOut(page, "Win the turf war", "turf", "Go to the clock tower, Royapettah");
  await expect.poll(async () => (await state(page)).mission, { timeout: GAME_WAIT }).toBe("wedding-party"); // stage 16 (laterStages.ts) now follows the street war
  expect((await state(page)).money).toBe(20_200 + 6000);
});
