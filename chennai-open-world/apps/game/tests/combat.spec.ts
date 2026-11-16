/** Fighting, shooting, being knocked out, and the combat stages. */
import { expect, test, type Page } from "@playwright/test";
import { ready, snapshot, teleport } from "./support";

const FIRST_SIX = ["morning-walk", "borrowed-wheels", "auto-shift", "parcel-run", "cross-town", "bike-courier"];

/** Open the game with some stages already complete. */
async function startAt(page: Page, completed: string[], money: number): Promise<void> {
  await page.goto("/?quality=lite");
  await page.evaluate(([done, cash]) => localStorage.setItem("cow-progress-v1", JSON.stringify({ completed: done, money: cash })), [completed, money] as const);
  await ready(page, true);
}

interface Combatant {
  x: number;
  z: number;
  health: number;
  armed: boolean;
}
const standing = async (page: Page): Promise<Combatant[]> => {
  const s = (await snapshot(page)) as unknown as { enemies: Combatant[] };
  return s.enemies.filter((e) => e.health > 0);
};
const state = async (page: Page) => (await snapshot(page)) as unknown as { health: number; ammo: number; money: number; mission: string | null; objective: string | null; target: { x: number; z: number } | null; x: number; z: number; street: string };

const press = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).dispatchEvent("pointerdown", { pointerId: 51, pointerType: "touch" });
const release = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).dispatchEvent("pointerup", { pointerId: 51, pointerType: "touch" });

test("the health bar, fire and punch buttons and the street name are shown on foot", async ({ page }) => {
  await ready(page);
  await expect(page.getByTestId("health")).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByRole("button", { name: "Punch", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fire", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Horn", exact: true })).toBeHidden();
  // The start is on a named Anna Nagar street; the name comes from the map data.
  // Wall-clock limit only: the name is looked up twice a second of game time.
  await expect.poll(async () => (await state(page)).street, { timeout: 20_000 }).not.toBe("");
  // With no pistol rounds, firing does nothing.
  const before = await state(page);
  expect(before.ammo).toBe(0);
  await press(page, "Fire");
  await page.waitForTimeout(400);
  await release(page, "Fire");
  expect((await state(page)).ammo).toBe(0);
});

test("stage 7: thugs appear at the park, fight back, and are beaten with punches", async ({ page }) => {
  await startAt(page, FIRST_SIX, 2800);
  const start = await state(page);
  expect(start.mission).toBe("park-trouble");
  expect(await standing(page)).toHaveLength(0); // nobody until the objective begins

  await teleport(page, start.target!.x, start.target!.z);
  await expect.poll(async () => (await standing(page)).length, { timeout: 5000 }).toBe(3);
  expect((await state(page)).objective).toContain("Beat the three thugs");

  let lowest = 100;
  // Step up to whoever is nearest, face them (north) and punch, until the stage pays out.
  for (let round = 0; round < 60; round++) {
    const s = await state(page);
    lowest = Math.min(lowest, s.health);
    if (s.mission !== "park-trouble") break;
    const enemies = await standing(page);
    const nearest = enemies.sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
    if (nearest) await teleport(page, nearest.x, nearest.z + 1.1, 0);
    await press(page, "Punch");
    await page.waitForTimeout(300);
  }
  const end = await state(page);
  expect(end.mission).toBe("bike-thieves");
  expect(end.money).toBe(2800 + 600);
  expect(lowest).toBeLessThan(100); // they hit back
  await expect(page.getByRole("status")).toContainText("Stage 7 complete");
});

test("stage 8: the pistol is issued, uses ammunition and takes down armed enemies", async ({ page }) => {
  await startAt(page, [...FIRST_SIX, "park-trouble"], 3400);
  const start = await state(page);
  expect(start.mission).toBe("bike-thieves");
  await teleport(page, start.target!.x, start.target!.z);
  await expect.poll(async () => (await standing(page)).length, { timeout: 5000 }).toBe(3);
  const issued = (await state(page)).ammo;
  expect(issued).toBeGreaterThan(10);

  // Stand south of each enemy in turn, facing north, and hold FIRE.
  for (let round = 0; round < 50; round++) {
    const s = await state(page);
    if (s.objective !== "Take down the thieves" && s.objective !== "Find the thieves") break;
    if (s.objective === "Find the thieves") {
      await teleport(page, s.target!.x, s.target!.z); // knocked out and sent back: return
      continue;
    }
    const enemy = (await standing(page))[0];
    if (!enemy) continue;
    await teleport(page, enemy.x, enemy.z + 7, 0);
    await press(page, "Fire");
    await page.waitForTimeout(700);
    await release(page, "Fire");
  }
  const end = await state(page);
  expect(end.objective).toBe("Get on a motorbike");
  expect(end.ammo).toBeLessThan(issued);
});

test("being knocked out costs a hospital bill and restarts the stage", async ({ page }) => {
  await startAt(page, [...FIRST_SIX, "park-trouble", "bike-thieves"], 4300);
  const start = await state(page);
  expect(start.mission).toBe("godown-raid");
  const home = { x: start.x, z: start.z };
  await teleport(page, start.target!.x, start.target!.z);
  await expect.poll(async () => (await standing(page)).length, { timeout: 5000 }).toBe(4);
  // Stand among four armed guards and do nothing.
  const guard = (await standing(page))[0]!;
  await teleport(page, guard.x + 6, guard.z + 6);
  await expect(page.getByRole("status")).toContainText("Knocked out", { timeout: 60_000 });
  const end = await state(page);
  expect(end.money).toBe(4200);
  expect(end.health).toBe(100);
  expect(end.objective).toBe("Get to the godown");
  expect(Math.hypot(end.x - home.x, end.z - home.z)).toBeLessThan(3);
  expect(await standing(page)).toHaveLength(0);
});
