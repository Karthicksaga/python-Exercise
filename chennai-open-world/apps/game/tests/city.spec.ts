/** The whole city (J2): far landmarks are labelled, and the areas the player visits are kept. */
import { expect, test, type Page } from "@playwright/test";
import { ready, snapshot, teleport } from "./support";

interface CityState {
  district: string;
  visitedDistricts: string[];
  landmarks: Array<{ id: string; name: string; x: number; z: number; label: boolean }>;
}
const city = (page: Page) => page.evaluate(() => (window as unknown as { __cow: { snapshot(): CityState } }).__cow.snapshot());

for (const id of ["marina-beach", "kapaleeshwarar-temple", "t-nagar"]) {
  test(`the ${id} label shows from 150 m away when facing it`, async ({ page }) => {
    await ready(page);
    const landmark = (await city(page)).landmarks.find((l) => l.id === id);
    expect(landmark, `${id} is on the map`).toBeDefined();
    // 150 m south of it, facing north (yaw 0).
    await teleport(page, landmark!.x, landmark!.z + 150, 0);
    await page.waitForTimeout(400);
    await expect(page.getByTestId(`landmark-label-${id}`)).toBeVisible();
    await expect(page.getByTestId(`landmark-label-${id}`)).toContainText(landmark!.name);
    expect((await city(page)).landmarks.find((l) => l.id === id)!.label).toBe(true);
  });
}

test("visited areas are recorded and kept after a reload", async ({ page }) => {
  await ready(page);
  await page.waitForTimeout(800);
  const start = await city(page);
  expect(start.district).not.toBe("");
  expect(start.visitedDistricts).toEqual([start.district]);
  // Sir Thyagaraya Road, T. Nagar: about 6 km away, another named area.
  await teleport(page, 3269, 4960);
  await page.waitForTimeout(800);
  const there = await city(page);
  expect(there.district).not.toBe(start.district);
  expect(there.visitedDistricts).toEqual([start.district, there.district]);

  await ready(page, true);
  await page.waitForTimeout(800);
  expect((await city(page)).visitedDistricts.slice(0, 2)).toEqual([start.district, there.district]);
  expect((await snapshot(page)).x).toBeLessThan(1000); // back at the start in Anna Nagar
});
