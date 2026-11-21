/** Landmarks: Anna Nagar Tower is solid, its plinth can be walked up, and its name label shows. */
import { expect, test, type Page } from "@playwright/test";
import { holdStick, probe, ready, snapshot, teleport } from "./support";

interface LandmarkState {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  label: boolean;
}
const landmarks = (page: Page) =>
  page.evaluate(() => (window as unknown as { __cow: { snapshot(): { landmarks: LandmarkState[] } } }).__cow.snapshot().landmarks);
const tower = async (page: Page) => {
  const found = (await landmarks(page)).find((l) => l.id === "anna-nagar-tower");
  expect(found, "Anna Nagar Tower is on the map").toBeDefined();
  return found!;
};

test("Anna Nagar Tower stands in Tower Park and its base is solid", async ({ page }) => {
  await ready(page);
  const t = await tower(page);
  expect(t.radius).toBeGreaterThan(5);
  // South of the plinth, facing north at the tower: a ray 1 m up hits the ground-floor drum,
  // which is well inside the plinth's edge.
  const start = { x: t.x, z: t.z + t.radius + 15 };
  await teleport(page, start.x, start.z, 0);
  const hit = await probe(page, start.x, start.z, 0, -1, 80);
  expect(hit).not.toBeNull();
  expect(hit!).toBeGreaterThan(15);
  expect(hit!).toBeLessThan(t.radius + 15 - 2);
});

test("the player walks up the plinth steps and stops at the tower", async ({ page }) => {
  await ready(page);
  const t = await tower(page);
  await teleport(page, t.x, t.z + t.radius + 4, 0);
  await holdStick(page, 0, -80, 6000);
  const s = await snapshot(page);
  const fromCentre = Math.hypot(s.x - t.x, s.z - t.z);
  // On the plinth, against the drum: not through it.
  expect(fromCentre).toBeLessThan(t.radius - 1);
  expect(fromCentre).toBeGreaterThan(3);
  expect(s.y).toBeGreaterThan(0.3);
});

test("the tower's name label shows when it is near and on screen, and not otherwise", async ({ page }) => {
  await ready(page);
  const t = await tower(page);
  const label = page.getByTestId("landmark-label-anna-nagar-tower");

  // 150 m south, facing the tower.
  await teleport(page, t.x, t.z + 150, 0);
  await page.waitForTimeout(300);
  await expect(label).toBeVisible();
  await expect(label).toContainText("Anna Nagar Tower");
  await expect(label).toContainText("m");
  expect((await tower(page)).label).toBe(true);

  // Same place, facing away.
  await teleport(page, t.x, t.z + 150, Math.PI);
  await page.waitForTimeout(300);
  await expect(label).toBeHidden();

  // Far across the map on 4th Avenue (about 800 m away), facing it.
  const far = { x: -220.9, z: 260.4 };
  await teleport(page, far.x, far.z, Math.atan2(-(t.x - far.x), -(t.z - far.z)));
  await page.waitForTimeout(300);
  await expect(label).toBeHidden();
  expect((await tower(page)).label).toBe(false);
});
