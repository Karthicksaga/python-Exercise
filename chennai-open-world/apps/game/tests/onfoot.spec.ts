/** The world and the player on foot, checked in a real browser engine with touch input. */
import { expect, test } from "@playwright/test";
import { dragLook, holdStick, probe, ready, snapshot, teleport } from "./support";

test("loads the real map around the player with traffic and pedestrians", async ({ page }) => {
  await ready(page);
  await page.waitForTimeout(800);
  const s = await snapshot(page);
  expect(s.chunksLoaded).toBeGreaterThan(3);
  expect(s.chunksLoaded).toBeLessThan(16); // streaming: not the whole map
  expect(s.triangles).toBeGreaterThan(50_000);
  expect(s.drawCalls).toBeLessThan(450);
  expect(s.grounded).toBe(true);
  expect(Math.abs(s.y)).toBeLessThan(0.1);
  expect(s.traffic.length).toBeGreaterThan(5);
  expect(s.pedestrians).toBeGreaterThan(4);
  await expect(page.getByText("© OpenStreetMap contributors")).toBeVisible();
  await expect(page.getByTestId("minimap")).toBeVisible();
});

test("streams chunks in and out as the player crosses the map", async ({ page }) => {
  await ready(page);
  const before = await snapshot(page);
  await teleport(page, 420, -430);
  await page.waitForTimeout(600);
  const after = await snapshot(page);
  // A corner of the map has fewer chunks in range than the middle.
  expect(after.chunksLoaded).toBeLessThan(before.chunksLoaded);
  expect(after.chunksLoaded).toBeGreaterThan(0);
  expect(after.grounded).toBe(true);
});

test("the joystick walks and runs relative to the camera, and stays on the ground", async ({ page }) => {
  await ready(page);
  const before = await snapshot(page);
  // Forward on the stick moves the way the camera faces.
  const forward = { x: -Math.sin(before.cameraYaw), z: -Math.cos(before.cameraYaw) };
  await holdStick(page, 0, -28, 1000);
  const walked = await snapshot(page);
  const walkDistance = (walked.x - before.x) * forward.x + (walked.z - before.z) * forward.z;
  expect(walkDistance).toBeGreaterThan(0.8);
  expect(walkDistance).toBeLessThan(3.2);

  await holdStick(page, 0, -80, 1500);
  const ran = await snapshot(page);
  const runDistance = (ran.x - walked.x) * forward.x + (ran.z - walked.z) * forward.z;
  expect(runDistance).toBeGreaterThan(walkDistance * 2.5);
  // Regression: the player used to sink slowly into an over-large ground slab.
  expect(Math.abs(ran.y)).toBeLessThan(0.08);
});

test("dragging the right side rotates the camera", async ({ page }) => {
  await ready(page);
  const before = await snapshot(page);
  await dragLook(page, -286, 40);
  const turned = await snapshot(page);
  expect(turned.cameraYaw - before.cameraYaw).toBeGreaterThan(1.4);
  expect(turned.cameraYaw - before.cameraYaw).toBeLessThan(1.75);
  expect(turned.cameraPitch).toBeGreaterThan(before.cameraPitch);
});

test("jump lifts the player and gravity brings them back", async ({ page }) => {
  await ready(page);
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Jump", exact: true }).dispatchEvent("pointerdown", { pointerId: 33, pointerType: "touch" });
  await expect.poll(async () => (await snapshot(page)).y, { timeout: 2000, intervals: [30] }).toBeGreaterThan(0.5);
  await expect.poll(async () => (await snapshot(page)).grounded, { timeout: 3000 }).toBe(true);
  expect(Math.abs((await snapshot(page)).y)).toBeLessThan(0.1);
});

test("real buildings are solid", async ({ page }) => {
  await ready(page);
  const s = await snapshot(page);
  // Find a wall: look east, west, south and north from the start for the nearest building.
  const directions = [
    { dx: 1, dz: 0, stick: [80, 0], yaw: 0 },
    { dx: -1, dz: 0, stick: [-80, 0], yaw: 0 },
  ] as const;
  let chosen: { dx: number; dz: number; stick: readonly [number, number]; distance: number } | undefined;
  for (const d of directions) {
    const distance = await probe(page, s.x, s.z, d.dx, d.dz, 60);
    if (distance !== null && distance > 3 && (!chosen || distance < chosen.distance)) chosen = { ...d, distance };
  }
  expect(chosen, "a building within 60 m east or west of the start").toBeDefined();
  // Face north so the stick's left/right is west/east, then run at the wall for longer than it takes to reach it.
  await teleport(page, s.x, s.z, 0);
  await holdStick(page, chosen!.stick[0], chosen!.stick[1], (chosen!.distance / 6) * 1000 + 2500);
  const end = await snapshot(page);
  const travelled = (end.x - s.x) * chosen!.dx;
  // Stopped at the wall: within a body's width of it, never through it.
  expect(travelled).toBeGreaterThan(chosen!.distance - 1.2);
  expect(travelled).toBeLessThan(chosen!.distance);
});

test("pause stops the game and resume continues it", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Pause", exact: true }).tap();
  await expect(page.getByRole("dialog")).toContainText("Paused");
  await expect(page.getByRole("dialog")).toContainText("OpenStreetMap");
  const paused = await snapshot(page);
  expect(paused.paused).toBe(true);
  await page.getByRole("button", { name: "Resume", exact: true }).tap();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await holdStick(page, 0, -80, 600);
  const after = await snapshot(page);
  expect(Math.hypot(after.x - paused.x, after.z - paused.z)).toBeGreaterThan(0.5);
});
