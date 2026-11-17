/** Rival gangs on their corners: calm until provoked, then they fight. */
import { expect, test, type Page } from "@playwright/test";
import { GAME_WAIT, ready, snapshot, teleport, waitGameTime } from "./support";

interface Member {
  x: number;
  z: number;
  health: number;
  group: string;
  calm: boolean;
  weapon: string;
}
interface State {
  x: number;
  z: number;
  health: number;
  enemies: Member[];
  crews: Array<{ id: string; gang: string; x: number; z: number; street: { x: number; z: number }; out: boolean }>;
  enemyWeapons: string[];
  drawCalls: number;
  triangles: number;
}
const state = async (page: Page) => (await snapshot(page)) as unknown as State;
const crewOf = async (page: Page, id: string) => (await state(page)).enemies.filter((e) => e.group === id && e.health > 0);
const facing = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

/** Stand in the street beside a crew's corner, facing it, and wait for the crew to come out. */
async function visit(page: Page, id: string): Promise<Member[]> {
  const crew = (await state(page)).crews.find((c) => c.id === id)!;
  await teleport(page, crew.street.x, crew.street.z, facing(crew.street, crew));
  await expect.poll(async () => (await crewOf(page, id)).length, { timeout: GAME_WAIT }).toBe(3);
  return crewOf(page, id);
}

test("a crew hangs about on its corner, carrying its weapons, and leaves an unarmed passer-by alone", async ({ page }) => {
  await ready(page);
  const s = await state(page);
  expect(s.crews).toHaveLength(6);
  expect(s.crews.every((c) => !c.out)).toBe(true); // none near the start
  const members = await visit(page, "gang:puli:0");
  expect(members.map((m) => m.weapon).sort()).toEqual(["bat", "fists", "pistol"]);
  expect(members.every((m) => m.calm)).toBe(true);
  // Only the crews near the player are out (at most two).
  expect((await state(page)).crews.filter((c) => c.out).length).toBeLessThanOrEqual(2);
  // The bat is carried in the hand.
  await expect.poll(async () => (await state(page)).enemyWeapons, { timeout: GAME_WAIT }).toContain("bat");
  await waitGameTime(page, 6);
  const later = await state(page);
  expect(later.enemies.filter((e) => e.group === "gang:puli:0").every((e) => e.calm)).toBe(true);
  expect(later.health).toBe(100);
});

test("a gang member turns hostile when attacked, and the whole crew with them", async ({ page }) => {
  await ready(page);
  const members = await visit(page, "gang:nandu:0");
  const target = members.find((m) => m.weapon === "fists")!;
  // Step up to them from the street side, face them and punch.
  const at = await state(page);
  const away = Math.hypot(at.x - target.x, at.z - target.z) || 1;
  const from = { x: target.x + ((at.x - target.x) / away) * 1.1, z: target.z + ((at.z - target.z) / away) * 1.1 };
  await teleport(page, from.x, from.z, facing(from, target));
  await page.getByRole("button", { name: "Punch", exact: true }).dispatchEvent("pointerdown", { pointerId: 51, pointerType: "touch" });
  await expect.poll(async () => (await crewOf(page, "gang:nandu:0")).every((m) => !m.calm), { timeout: GAME_WAIT }).toBe(true);
  expect((await crewOf(page, "gang:nandu:0")).find((m) => m.weapon === "fists")?.health ?? 0).toBeLessThan(100);
  // And they fight back.
  await expect.poll(async () => (await state(page)).health, { timeout: GAME_WAIT }).toBeLessThan(100);
});

test("standing armed on their corner draws a warning, then the crew turns", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as unknown as { __cow: { giveWeapon(id: string, n: number): void } }).__cow.giveWeapon("pistol", 24));
  const members = await visit(page, "gang:paambu:1");
  // Step off the street onto their corner, 3 m from the middle one (a wide road's centre is
  // further than the 7 m that makes them uneasy).
  const crew = (await state(page)).crews.find((c) => c.id === "gang:paambu:1")!;
  const away = Math.hypot(crew.street.x - crew.x, crew.street.z - crew.z) || 1;
  const stand = { x: crew.x + ((crew.street.x - crew.x) / away) * 3, z: crew.z + ((crew.street.z - crew.z) / away) * 3 };
  await teleport(page, stand.x, stand.z, facing(stand, crew));
  expect(members.every((m) => m.calm)).toBe(true);
  // After about 1.5 s of game time a warning; still calm.
  await waitGameTime(page, 2);
  expect((await crewOf(page, "gang:paambu:1")).every((m) => m.calm)).toBe(true);
  // After about 4 s the crew turns.
  await waitGameTime(page, 3);
  expect((await crewOf(page, "gang:paambu:1")).every((m) => !m.calm)).toBe(true);
});

test("a gang district stays within the draw budget at lite quality", async ({ page }) => {
  await ready(page);
  await visit(page, "gang:puli:0");
  await waitGameTime(page, 2);
  const s = await state(page);
  console.log(`gang district (Royapettah corner): ${s.drawCalls} draw calls, ${s.triangles} triangles`);
  expect(s.drawCalls).toBeLessThan(300);
  expect(s.triangles).toBeLessThan(300_000);
});
