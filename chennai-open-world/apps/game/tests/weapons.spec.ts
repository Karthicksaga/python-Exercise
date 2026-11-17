/** Weapons: the weapon button, pickups in the world, switching, ammunition and saving. */
import { expect, test, type Page } from "@playwright/test";
import { GAME_WAIT, holdButton, ready, snapshot, tapButton, teleport, waitGameTime } from "./support";

interface Arms {
  x: number;
  z: number;
  weapon: string;
  weapons: string[];
  weaponAmmo: Record<string, number>;
  inHand: string | null;
  pickups: Array<{ id: string; weapon: string; x: number; z: number; available: boolean }>;
}
const arms = async (page: Page) => (await snapshot(page)) as unknown as Arms;

test("on foot the weapon button sits clear of every other control and the minimap", async ({ page }) => {
  await ready(page);
  const weapon = page.getByRole("button", { name: "Switch weapon", exact: true });
  await expect(weapon).toBeVisible();
  await expect(weapon).toContainText("PISTOL");
  const boxes: Array<[string, { x: number; y: number; width: number; height: number }]> = [];
  for (const name of ["Jump", "Fire", "Punch", "Switch weapon"]) {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(box, name).not.toBeNull();
    boxes.push([name, box!]);
  }
  boxes.push(["minimap", (await page.getByTestId("minimap").boundingBox())!]);
  const viewport = page.viewportSize()!;
  for (const [name, b] of boxes) {
    expect(b.x, `${name} inside the screen`).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, `${name} inside the screen`).toBeLessThanOrEqual(viewport.width);
    expect(b.y + b.height, `${name} inside the screen`).toBeLessThanOrEqual(viewport.height);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let k = i + 1; k < boxes.length; k++) {
      const [na, a] = boxes[i]!;
      const [nb, b] = boxes[k]!;
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, `${na} overlaps ${nb}`).toBe(false);
    }
  }
  // The joystick's half of the screen stays free of it.
  expect(boxes[3]![1].x).toBeGreaterThan(viewport.width * 0.45);
  // Hidden while driving (the gear selector is there then).
  const car = (await snapshot(page)).vehicles.find((v) => v.id === "car-start")!;
  await teleport(page, car.x + 2, car.z);
  await tapButton(page, "Get in");
  await expect(weapon).toBeHidden();
});

test("pick up a shotgun, switch to it, and each blast uses a round", async ({ page }) => {
  await ready(page);
  const start = await arms(page);
  expect(start.weapons).toEqual(["fists", "pistol"]);
  expect(start.inHand).toBeNull(); // an empty pistol isn't shown
  const pickup = start.pickups.find((p) => p.id === "shotgun-royapettah")!;
  expect(pickup.available).toBe(true);
  // Walk over it (teleport beside it, then step on it).
  await teleport(page, pickup.x + 0.5, pickup.z + 0.5);
  await expect.poll(async () => (await arms(page)).weapons, { timeout: GAME_WAIT }).toContain("shotgun");
  let s = await arms(page);
  expect(s.weapon).toBe("shotgun"); // a new gun goes into the hand
  expect(s.weaponAmmo.shotgun).toBe(10);
  expect(s.pickups.find((p) => p.id === pickup.id)!.available).toBe(false);
  await expect(page.getByRole("button", { name: "Switch weapon", exact: true })).toContainText("SHOTGUN");
  await expect.poll(async () => (await arms(page)).inHand, { timeout: GAME_WAIT }).toBe("shotgun");

  // The button cycles the guns owned: pistol, then back to the shotgun.
  await tapButton(page, "Switch weapon");
  expect((await arms(page)).weapon).toBe("pistol");
  await tapButton(page, "Switch weapon");
  expect((await arms(page)).weapon).toBe("shotgun");

  // Hold FIRE for 1.5 s of game time: the pump action allows one blast about every second.
  await waitGameTime(page, 0.4);
  await holdButton(page, "Fire", 1500);
  s = await arms(page);
  expect(s.weaponAmmo.shotgun).toBeLessThanOrEqual(9);
  expect(s.weaponAmmo.shotgun).toBeGreaterThanOrEqual(7);
});

test("the SMG empties far faster than the pistol over the same time", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as unknown as { __cow: { giveWeapon(id: string, n: number): void } }).__cow.giveWeapon("pistol", 50));
  await holdButton(page, "Fire", 1000);
  const pistolUsed = 50 - (await arms(page)).weaponAmmo.pistol!;
  await page.evaluate(() => (window as unknown as { __cow: { giveWeapon(id: string, n: number): void } }).__cow.giveWeapon("smg", 50));
  await waitGameTime(page, 0.3);
  await holdButton(page, "Fire", 1000, 32);
  const smgUsed = 50 - (await arms(page)).weaponAmmo.smg!;
  expect(pistolUsed).toBeGreaterThanOrEqual(2);
  expect(pistolUsed).toBeLessThanOrEqual(5);
  expect(smgUsed).toBeGreaterThan(pistolUsed * 2);
  expect((await arms(page)).inHand).toBe("smg");
});

test("a cricket bat lies near home; once picked up it is in hand, and weapons are saved", async ({ page }) => {
  await ready(page);
  const bat = (await arms(page)).pickups.find((p) => p.weapon === "bat")!;
  await teleport(page, bat.x, bat.z);
  await expect.poll(async () => (await arms(page)).weapons, { timeout: GAME_WAIT }).toContain("bat");
  await expect.poll(async () => (await arms(page)).inHand, { timeout: GAME_WAIT }).toBe("bat");
  await page.getByRole("button", { name: "Punch", exact: true }).dispatchEvent("pointerdown", { pointerId: 51, pointerType: "touch" });
  await waitGameTime(page, 0.2);
  // Saved: after a reload the bat is still owned.
  await page.evaluate(() => (window as unknown as { __cow: { setPaused(p: boolean): void } }).__cow.setPaused(true));
  await ready(page, true);
  expect((await arms(page)).weapons).toContain("bat");
});
