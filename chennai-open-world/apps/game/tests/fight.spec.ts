/**
 * The combat redesign (22 Nov 2026): what a fight looks like and how it is played on a touch
 * screen (fight mode, DODGE and BLOCK, lock-on, health bars, hit markers), and pedestrians as
 * part of it (hurt by the player, knocked out or killed, the police told).
 */
import { expect, test, type Page } from "@playwright/test";
import { GAME_WAIT, ready, snapshot, teleport, waitGameTime } from "./support";

const FIRST_SIX = ["morning-walk", "borrowed-wheels", "auto-shift", "parcel-run", "cross-town", "bike-courier"];

type Fight = { combatMode: boolean; locked: number | null; blocking: boolean; dodging: boolean; lastSwing: string | null; playerMove: string | null; lastAssault: { id: number; outcome: string } | null; civiliansNear: Array<{ id: number; distance: number }> };
type View = { x: number; z: number; yaw: number; cameraYaw: number; health: number; police: { stars: number; points: number; lastCrime: string | null }; target: { x: number; z: number } | null; enemies: Array<{ x: number; z: number; health: number }>; fightView: Fight };
const view = async (page: Page) => (await snapshot(page)) as unknown as View;
const tap = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).dispatchEvent("pointerdown", { pointerId: 51, pointerType: "touch" });

/** Stage 7 (three thugs in the park) with the player beside them. */
async function parkFight(page: Page): Promise<void> {
  await page.goto("/?quality=lite&start=play");
  await page.evaluate((done) => localStorage.setItem("cow-progress-v1", JSON.stringify({ completed: done, money: 2800 })), FIRST_SIX);
  await ready(page, true);
  const start = await view(page);
  await teleport(page, start.target!.x, start.target!.z);
  await expect.poll(async () => (await view(page)).enemies.filter((e) => e.health > 0).length, { timeout: GAME_WAIT }).toBe(3);
}

test("in a fight: fists up, DODGE and BLOCK, a lock-on, and a health bar and hit marker when a punch lands", async ({ page }) => {
  await parkFight(page);
  // Outside a fight the button says JUMP and there is no BLOCK; beside the thugs it changes.
  const thug = (await view(page)).enemies.find((e) => e.health > 0)!;
  await teleport(page, thug.x, thug.z + 3, 0);
  await expect.poll(async () => (await view(page)).fightView.combatMode, { timeout: GAME_WAIT }).toBe(true);
  await expect(page.getByRole("button", { name: "Dodge", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Block", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jump", exact: true })).toHaveCount(0);
  await expect.poll(async () => (await view(page)).fightView.locked).not.toBeNull();
  await expect(page.getByTestId("lock-on")).toBeVisible();

  // Punch the nearest until one lands: the health bar shows, and the hit marker flashed.
  let landed = false;
  for (let round = 0; round < 20 && !landed; round++) {
    const s = await view(page);
    const near = s.enemies.filter((e) => e.health > 0).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0]!;
    await teleport(page, near.x, near.z + 1.1, 0);
    await tap(page, "Punch");
    await waitGameTime(page, 0.5);
    landed = (await view(page)).enemies.some((e) => e.health > 0 && e.health < 100);
  }
  expect(landed).toBe(true);
  // The hurt one's bar (an unhurt enemy's stays hidden).
  await expect(page.locator('[data-testid="enemy-health"]:visible')).not.toHaveCount(0);
  expect(["jab", "cross", "hook"]).toContain((await view(page)).fightView.lastSwing);
});

test("BLOCK holds a guard; DODGE carries the player clear", async ({ page }) => {
  await parkFight(page);
  const thug = (await view(page)).enemies.find((e) => e.health > 0)!;
  await teleport(page, thug.x, thug.z + 2.5, 0);
  await expect.poll(async () => (await view(page)).fightView.combatMode, { timeout: GAME_WAIT }).toBe(true);

  const block = page.getByRole("button", { name: "Block", exact: true });
  await block.dispatchEvent("pointerdown", { pointerId: 61, pointerType: "touch" });
  await expect.poll(async () => (await view(page)).fightView.blocking).toBe(true);
  await block.dispatchEvent("pointerup", { pointerId: 61, pointerType: "touch" });
  await expect.poll(async () => (await view(page)).fightView.blocking).toBe(false);

  const before = await view(page);
  await tap(page, "Dodge");
  await expect.poll(async () => (await view(page)).fightView.playerMove, { timeout: 10_000 }).toBe("dodge");
  await waitGameTime(page, 0.6);
  const after = await view(page);
  // No stick held: straight back from where the player faced, about the dodge's length.
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(1.5);
});

/** A pedestrian held standing 1.1 m in front of the camera (the test hook used for road accidents). */
async function pedestrianInFront(page: Page, metres = 1.1): Promise<void> {
  const ok = await page.evaluate((m) => {
    const cow = (window as unknown as { __cow: { snapshot(): { x: number; z: number; cameraYaw: number }; stagePedestrian(x: number, z: number, h: number): boolean } }).__cow;
    const s = cow.snapshot();
    return cow.stagePedestrian(s.x - Math.sin(s.cameraYaw) * m, s.z - Math.cos(s.cameraYaw) * m, s.cameraYaw + Math.PI);
  }, metres);
  expect(ok).toBe(true);
  await waitGameTime(page, 0.3);
}

test("a pedestrian punched twice is knocked out, and the police hear about it (no star for one scuffle)", async ({ page }) => {
  await ready(page);
  await pedestrianInFront(page);
  expect((await view(page)).fightView.civiliansNear.length).toBeGreaterThan(0);
  expect((await view(page)).police.stars).toBe(0);

  await tap(page, "Punch");
  await expect.poll(async () => (await view(page)).fightView.lastAssault?.outcome, { timeout: GAME_WAIT }).toBe("flinch");
  // A punch in the street turns on fight mode, and the police hear of it.
  expect((await view(page)).fightView.combatMode).toBe(true);
  await expect.poll(async () => (await view(page)).police.lastCrime, { timeout: GAME_WAIT }).toBe("pedestrianAssaulted");
  // Changed on purpose (TD-28): this used to draw a star at once, which players found too harsh.
  // One scuffle only adds heat; a few incidents in a short time make a star (Wanted.test.ts).
  expect((await view(page)).police.points).toBeGreaterThan(0);
  expect((await view(page)).police.stars).toBe(0);

  await waitGameTime(page, 0.6); // the punch's recovery
  await tap(page, "Punch");
  await expect.poll(async () => (await view(page)).fightView.lastAssault?.outcome, { timeout: GAME_WAIT }).toBe("injured");
  expect((await view(page)).police.lastCrime).toBe("pedestrianInjured");
  // A punch and a knock-out on one person: still no star (0.3 + 0.45 heat, a star at 1).
  expect((await view(page)).police.stars).toBe(0);
  // Down on the ground: no longer someone to hit.
  expect((await view(page)).fightView.civiliansNear).toHaveLength(0);
});

/**
 * One shot: hold FIRE until a round has left the pistol, then let go. FIRE is held and read each
 * physics step, so an instant tap can fall between two steps and fire nothing (seen on a slow CI
 * runner), and a hold for a fixed time can fire twice (the pistol fires every 0.32 s).
 */
async function fireOnce(page: Page): Promise<void> {
  const rounds = async () => ((await snapshot(page)) as unknown as { ammo: number }).ammo;
  const before = await rounds();
  const fire = page.getByRole("button", { name: "Fire", exact: true });
  await fire.dispatchEvent("pointerdown", { pointerId: 52, pointerType: "touch" });
  await expect.poll(rounds, { timeout: GAME_WAIT, intervals: [20] }).toBeLessThan(before);
  await fire.dispatchEvent("pointerup", { pointerId: 52, pointerType: "touch" });
}

test("a bullet hits a pedestrian standing in the line of fire; a second one kills", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as unknown as { __cow: { giveWeapon(id: string, n: number): void } }).__cow.giveWeapon("pistol", 10));
  await pedestrianInFront(page, 6);
  await fireOnce(page);
  await expect.poll(async () => (await view(page)).fightView.lastAssault?.outcome, { timeout: GAME_WAIT }).toBe("flinch");
  await waitGameTime(page, 0.5);
  await fireOnce(page);
  await expect.poll(async () => (await view(page)).fightView.lastAssault?.outcome, { timeout: GAME_WAIT }).toBe("killed");
  await expect.poll(async () => (await view(page)).police.stars, { timeout: GAME_WAIT }).toBeGreaterThanOrEqual(1);
});
