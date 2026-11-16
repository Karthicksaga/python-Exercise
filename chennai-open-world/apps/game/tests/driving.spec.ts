/** Vehicles, missions and saved progress. */
import { expect, test } from "@playwright/test";
import { board, holdButton, holdStick, ready, snapshot, tapButton, teleport, waitGameTime, GAME_WAIT } from "./support";

test("get in the car, drive, brake, reverse and get out", async ({ page }) => {
  await ready(page);
  await board(page, "car-start");
  const start = await snapshot(page);
  expect(start.mode).toBe("car");
  await expect(page.getByTestId("speed")).toBeVisible();

  await holdButton(page, "Accelerate", 2500);
  const moving = await snapshot(page);
  expect(moving.speed).toBeGreaterThan(5);
  expect(Math.hypot(moving.x - start.x, moving.z - start.z)).toBeGreaterThan(6);

  // Getting out is refused while moving.
  await tapButton(page, "Get out");
  expect((await snapshot(page)).mode).toBe("car");

  await holdButton(page, "Brake", 2500);
  await expect.poll(async () => (await snapshot(page)).speed, { timeout: 20_000 }).toBeLessThan(1);
  await tapButton(page, "Get out");
  const out = await snapshot(page);
  expect(out.mode).toBe("foot");
  await expect(page.getByRole("button", { name: "Jump", exact: true })).toBeVisible();
  // The player stands beside the car, not inside it.
  const car = out.vehicles.find((v) => v.id === "car-start")!;
  const gap = Math.hypot(out.x - car.x, out.z - car.z);
  expect(gap).toBeGreaterThan(1.2);
  expect(gap).toBeLessThan(4);
});

test("the stick steers the car", async ({ page }) => {
  await ready(page);
  await board(page, "car-start");
  const start = await snapshot(page);
  // Hold right on the stick while accelerating.
  await Promise.all([holdStick(page, 80, 0, 2600), holdButton(page, "Accelerate", 2600)]);
  const end = await snapshot(page);
  const turned = Math.atan2(Math.sin(end.yaw - start.yaw), Math.cos(end.yaw - start.yaw));
  expect(turned).toBeLessThan(-0.25); // clockwise = right
});

test("the motorbike and the auto-rickshaw can be ridden", async ({ page }) => {
  await ready(page);
  for (const [id, mode] of [["bike-start", "bike"], ["auto-park", "auto"]] as const) {
    await board(page, id);
    const start = await snapshot(page);
    expect(start.mode).toBe(mode);
    await holdButton(page, "Accelerate", 2000);
    const moving = await snapshot(page);
    expect(moving.speed).toBeGreaterThan(3);
    await holdButton(page, "Brake", 2200);
    await expect.poll(async () => (await snapshot(page)).speed, { timeout: 20_000 }).toBeLessThan(1.5);
    await tapButton(page, "Get out");
    expect((await snapshot(page)).mode).toBe("foot");
  }
});

test("AI traffic keeps moving", async ({ page }) => {
  await ready(page);
  const before = (await snapshot(page)).traffic;
  await waitGameTime(page, 5);
  const after = (await snapshot(page)).traffic;
  const moved = after.filter((t, i) => Math.hypot(t.x - before[i]!.x, t.z - before[i]!.z) > 3).length;
  expect(moved).toBeGreaterThan(after.length / 2);
});

test("stage 1 completes on foot, pays its reward, and progress survives a restart", async ({ page }) => {
  await ready(page);
  const start = await snapshot(page);
  expect(start.mission).toBe("morning-walk");
  expect(start.money).toBe(0);
  await expect(page.getByTestId("mission")).toContainText("Walk to the marker");
  // Skip most of the walk, then finish it with the joystick.
  const target = start.target!;
  await teleport(page, target.x + 6, target.z, 0);
  expect((await snapshot(page)).mission).toBe("morning-walk");
  await holdStick(page, -80, 0, 1200); // camera faces north, so left is west, towards the marker
  await expect.poll(async () => (await snapshot(page)).money, { timeout: GAME_WAIT }).toBe(50);
  await expect(page.getByTestId("money")).toHaveText("₹50");
  await expect(page.getByRole("status")).toContainText("Stage 1 complete");
  const next = await snapshot(page);
  expect(next.mission).toBe("borrowed-wheels");
  expect(next.objective).toBe("Get in the hatchback");

  // Reopen the game: money and stage are restored.
  await ready(page, true);
  const restored = await snapshot(page);
  expect(restored.money).toBe(50);
  expect(restored.mission).toBe("borrowed-wheels");
});

test("stage 2 needs the car and a full stop at the destination", async ({ page }) => {
  await ready(page);
  // Complete stage 1 first.
  const first = (await snapshot(page)).target!;
  await teleport(page, first.x, first.z);
  await expect.poll(async () => (await snapshot(page)).mission, { timeout: GAME_WAIT }).toBe("borrowed-wheels");

  // The marker points at the car; getting in moves the objective on.
  await board(page, "car-start");
  await expect.poll(async () => (await snapshot(page)).objective).toBe("Drive to Anna Nagar Tower Park");
  const park = (await snapshot(page)).target!;
  await teleport(page, park.x, park.z);
  await expect.poll(async () => (await snapshot(page)).money, { timeout: GAME_WAIT }).toBe(200);
  expect((await snapshot(page)).mission).toBe("auto-shift");
});

test("new game clears progress", async ({ page }) => {
  await ready(page);
  const first = (await snapshot(page)).target!;
  await teleport(page, first.x, first.z);
  await expect.poll(async () => (await snapshot(page)).money, { timeout: GAME_WAIT }).toBe(50);
  await page.getByRole("button", { name: "Pause", exact: true }).tap();
  await page.getByRole("button", { name: "New game", exact: true }).tap();
  await expect.poll(async () => (await snapshot(page)).money).toBe(0);
  const fresh = await snapshot(page);
  expect(fresh.mission).toBe("morning-walk");
  expect(fresh.paused).toBe(false);
});
