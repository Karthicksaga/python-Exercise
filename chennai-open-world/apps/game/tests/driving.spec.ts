/** Vehicles, missions and saved progress. */
import { expect, test } from "@playwright/test";
import { board, getOut, holdButton, holdStick, ready, snapshot, tapButton, teleport, waitGameTime, GAME_WAIT, type Snapshot } from "./support";

test("get in the car, drive, brake and get out", async ({ page }) => {
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
  expect((await snapshot(page)).boarding).toBeNull();

  await holdButton(page, "Brake", 2500);
  await expect.poll(async () => (await snapshot(page)).speed, { timeout: 20_000 }).toBeLessThan(1);
  await getOut(page);
  const out = await snapshot(page);
  expect(out.mode).toBe("foot");
  await expect(page.getByRole("button", { name: "Jump", exact: true })).toBeVisible();
  // The player stands beside the car, not inside it.
  const car = out.vehicles.find((v) => v.id === "car-start")!;
  const gap = Math.hypot(out.x - car.x, out.z - car.z);
  expect(gap).toBeGreaterThan(1.2);
  expect(gap).toBeLessThan(4);
});

/** Metres moved along the vehicle's heading between two snapshots (negative = backwards). */
const along = (from: Snapshot, to: Snapshot) => (to.x - from.x) * -Math.sin(from.yaw) + (to.z - from.z) * -Math.cos(from.yaw);

test("the gear selector: R reverses with GAS, P holds the car, D drives forwards", async ({ page }) => {
  await ready(page);
  await board(page, "car-start");
  await expect(page.getByTestId("gear-selector")).toBeVisible();
  // Getting in selects D.
  expect((await snapshot(page)).gear).toBe("D");
  await expect(page.getByRole("button", { name: "Drive", exact: true })).toHaveAttribute("aria-pressed", "true");

  // R, then GAS: the car goes backwards.
  await tapButton(page, "Reverse");
  expect((await snapshot(page)).gear).toBe("R");
  const start = await snapshot(page);
  await holdButton(page, "Accelerate", 1500);
  const reversed = await snapshot(page);
  expect(reversed.gear).toBe("R");
  expect(along(start, reversed)).toBeLessThan(-1.5);
  await holdButton(page, "Brake", 1500);
  await expect.poll(async () => (await snapshot(page)).speed, { timeout: GAME_WAIT }).toBeLessThan(0.5);

  // P: GAS does nothing, and the car stays put.
  await tapButton(page, "Park");
  const parked = await snapshot(page);
  expect(parked.gear).toBe("P");
  await expect(page.getByRole("button", { name: "Park", exact: true })).toHaveAttribute("aria-pressed", "true");
  await holdButton(page, "Accelerate", 1500);
  const held = await snapshot(page);
  expect(Math.hypot(held.x - parked.x, held.z - parked.z)).toBeLessThan(0.2);
  expect(held.speed).toBeLessThan(0.3);

  // D, then GAS: forwards again.
  await tapButton(page, "Drive");
  const drive = await snapshot(page);
  expect(drive.gear).toBe("D");
  await holdButton(page, "Accelerate", 1500);
  const ahead = await snapshot(page);
  expect(along(drive, ahead)).toBeGreaterThan(2);
  expect(ahead.gear).toMatch(/^D\d$/);
});

test("asking for R while moving brakes to a stop first, then reverses", async ({ page }) => {
  await ready(page);
  await board(page, "car-start");
  await holdButton(page, "Accelerate", 2000);
  expect((await snapshot(page)).speed).toBeGreaterThan(5);
  await tapButton(page, "Reverse");
  // Not engaged yet: the gearbox brakes (N on the HUD) and R blinks on the selector.
  expect((await snapshot(page)).gear).toBe("N");
  await expect(page.getByRole("button", { name: "Reverse", exact: true })).toHaveClass(/\bwait\b/);
  await expect.poll(async () => (await snapshot(page)).gear, { timeout: GAME_WAIT }).toBe("R");
  // Holding BRAKE once stopped does not reverse any more; GAS in R does.
  const stopped = await snapshot(page);
  expect(stopped.speed).toBeLessThan(1);
  await holdButton(page, "Brake", 800);
  expect(along(stopped, await snapshot(page))).toBeGreaterThan(-0.3);
  const before = await snapshot(page);
  await holdButton(page, "Accelerate", 1200);
  expect(along(before, await snapshot(page))).toBeLessThan(-0.8);
});

test("in P the car can be left and stays where it was parked", async ({ page }) => {
  await ready(page);
  await board(page, "car-start");
  await tapButton(page, "Park");
  await getOut(page);
  const out = await snapshot(page);
  expect(out.mode).toBe("foot");
  await expect(page.getByTestId("gear-selector")).toBeHidden();
  const car = out.vehicles.find((v) => v.id === "car-start")!;
  await waitGameTime(page, 1);
  const later = (await snapshot(page)).vehicles.find((v) => v.id === "car-start")!;
  expect(Math.hypot(later.x - car.x, later.z - car.z)).toBeLessThan(0.05);
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
    await getOut(page);
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
  // The completion message is shown for a few seconds of wall clock, and the stage may finish
  // part-way through the walk below (held in game time): watch for it from before the walk.
  const completed = expect(page.getByRole("status")).toContainText("Stage 1 complete", { timeout: GAME_WAIT });
  await holdStick(page, -80, 0, 1200); // camera faces north, so left is west, towards the marker
  await expect.poll(async () => (await snapshot(page)).money, { timeout: GAME_WAIT }).toBe(50);
  await expect(page.getByTestId("money")).toHaveText("₹50");
  await completed;
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

test("driving controls are all reachable at phone size: none overlaps another or sits under the minimap", async ({ page }) => {
  await ready(page);
  await board(page, "ambulance");
  // The siren is how the ambulance jobs clear traffic, so it must be tappable, not just present.
  await expect(page.getByRole("button", { name: "Siren", exact: true })).toBeVisible();
  const boxes: Array<[string, { x: number; y: number; width: number; height: number }]> = [];
  for (const name of ["Accelerate", "Brake", "Siren", "Get out"]) {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(box, name).not.toBeNull();
    boxes.push([name, box!]);
  }
  const gears = await page.getByTestId("gear-selector").boundingBox();
  const minimap = await page.getByTestId("minimap").boundingBox();
  expect(gears).not.toBeNull();
  expect(minimap).not.toBeNull();
  boxes.push(["gears", gears!], ["minimap", minimap!]);
  const viewport = page.viewportSize()!;
  for (const [name, b] of boxes) {
    expect(b.x, `${name} inside the screen`).toBeGreaterThanOrEqual(0);
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
});
