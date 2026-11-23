/**
 * Crashes (TD-29): a motorbike driven into a wall at speed throws its rider off; the rider
 * tumbles, lands, is hurt, gets up and is on foot, clear of the bike, on the ground, on the
 * near side of the wall. A slow bump does not.
 */
import { expect, test, type Page } from "@playwright/test";
import { GAME_WAIT, board, probe, ready, snapshot, teleport, waitGameTime } from "./support";

interface CrashState {
  x: number;
  y: number;
  z: number;
  speed: number;
  mode: string;
  health: number;
  grounded: boolean;
  simTime: number;
  camera: { x: number; y: number; z: number; distance: number };
  vehicles: Array<{ id: string; x: number; z: number; tipped: number }>;
  crash: { knockdown: string | null; last: { type: string; impactKmh: number; damage: number; vehicle: string } | null };
}
const state = (page: Page) => snapshot(page) as unknown as Promise<CrashState>;
const playerFeet = (page: Page) => page.evaluate(() => (window as unknown as { __cow: { people(): { player: { feet: number | null } } } }).__cow.people().player.feet);

/**
 * Turn the bike where it stands towards a wall between `near` and `far` metres away with nothing
 * else in the way (the map is real streets, so no wall is hard-coded). Returns the direction and
 * the distance to the wall.
 */
async function faceWall(page: Page, near: number, far: number): Promise<{ dx: number; dz: number; distance: number; x: number; z: number }> {
  const start = await state(page);
  let best: { yaw: number; distance: number } | null = null;
  for (let i = 0; i < 48; i++) {
    const yaw = (i / 48) * Math.PI * 2;
    const hit = await probe(page, start.x, start.z, -Math.sin(yaw), -Math.cos(yaw), far);
    if (hit === null || hit < near) continue;
    // Prefer the nearest suitable wall: less room for traffic to wander into the run.
    if (!best || hit < best.distance) best = { yaw, distance: hit };
  }
  if (!best) throw new Error(`no wall ${near}-${far} m from the bike`);
  await teleport(page, start.x, start.z, best.yaw);
  return { dx: -Math.sin(best.yaw), dz: -Math.cos(best.yaw), distance: best.distance, x: start.x, z: start.z };
}

const accelerator = (page: Page) => page.getByRole("button", { name: "Accelerate", exact: true });

test("a motorbike into a wall at speed throws the rider off: hurt, clear of the bike, back on their feet", async ({ page }) => {
  await ready(page);
  await board(page, "bike-start");
  const wall = await faceWall(page, 30, 90);
  const ground = (await state(page)).y;

  const gas = accelerator(page);
  await gas.dispatchEvent("pointerdown", { pointerId: 31, pointerType: "touch" });
  let top = 0;
  let thrownAt: CrashState | null = null;
  try {
    // Full throttle until the crash (a wall-clock limit only).
    await expect
      .poll(
        async () => {
          const s = await state(page);
          if (s.mode === "bike") top = Math.max(top, s.speed);
          if (s.crash.knockdown !== null && !thrownAt) thrownAt = s;
          return s.crash.knockdown !== null || s.mode === "foot";
        },
        { timeout: GAME_WAIT, intervals: [50] },
      )
      .toBe(true);
  } finally {
    await gas.dispatchEvent("pointerup", { pointerId: 31, pointerType: "touch" });
  }
  const crash = (await state(page)).crash.last;
  expect(crash?.type, `top speed ${(top * 3.6).toFixed(0)} km/h, crash ${JSON.stringify(crash)}`).toBe("thrown");
  expect(crash!.impactKmh).toBeGreaterThan(35);
  expect((await state(page)).mode).toBe("foot");

  // The tumble: the camera stays on the flying body, the bike goes over.
  let farthestCamera = 0;
  let tipped = 0;
  const phases: string[] = [];
  await expect
    .poll(
      async () => {
        const s = await state(page);
        const k = s.crash.knockdown ?? "up";
        if (phases[phases.length - 1] !== k) phases.push(k);
        farthestCamera = Math.max(farthestCamera, Math.hypot(s.camera.x - s.x, s.camera.z - s.z));
        tipped = Math.max(tipped, s.vehicles.find((v) => v.id === "bike-start")?.tipped ?? 0);
        return s.crash.knockdown;
      },
      { timeout: GAME_WAIT, intervals: [50] },
    )
    .toBeNull();
  expect(phases[phases.length - 1]).toBe("up");
  expect(phases).toContain("lying");
  expect(farthestCamera).toBeLessThan(10);
  expect(tipped).toBeGreaterThan(0.9);

  // Settle (idle), then check where and how the player is.
  await waitGameTime(page, 0.6);
  const end = await state(page);
  const bike = end.vehicles.find((v) => v.id === "bike-start")!;
  expect(end.mode).toBe("foot");
  expect(end.health).toBeLessThan(100);
  expect(end.health).toBeGreaterThan(0);
  expect(Math.hypot(end.x - bike.x, end.z - bike.z), "the rider ends up clear of the bike").toBeGreaterThan(1.5);
  // On the ground (the same street level the run started from), standing on it...
  expect(Math.abs(end.y - ground)).toBeLessThan(0.4);
  expect(end.grounded).toBe(true);
  const feet = await playerFeet(page);
  expect(feet).not.toBeNull();
  expect(Math.abs(feet!)).toBeLessThan(0.05);
  // ...and on the near side of the wall, not through it.
  const along = (end.x - wall.x) * wall.dx + (end.z - wall.z) * wall.dz;
  expect(along).toBeLessThan(wall.distance);
  // And in control again: the stick walks.
  await expect(page.getByRole("button", { name: "Jump", exact: true })).toBeVisible();
});

test("a slow bump into a wall does not throw the rider", async ({ page }) => {
  await ready(page);
  await board(page, "bike-start");
  await faceWall(page, 6, 16);
  const before = await state(page);
  const gas = accelerator(page);
  await gas.dispatchEvent("pointerdown", { pointerId: 31, pointerType: "touch" });
  try {
    await expect.poll(async () => (await state(page)).speed, { timeout: 30_000, intervals: [50] }).toBeGreaterThan(2.5);
  } finally {
    await gas.dispatchEvent("pointerup", { pointerId: 31, pointerType: "touch" });
  }
  // Roll on into the wall and stop.
  await waitGameTime(page, 1);
  await expect.poll(async () => (await state(page)).speed, { timeout: GAME_WAIT, intervals: [100] }).toBeLessThan(0.3);
  await waitGameTime(page, 0.5);
  const end = await state(page);
  expect(end.mode).toBe("bike");
  expect(end.crash.knockdown).toBeNull();
  expect(end.crash.last?.type ?? "none").not.toBe("thrown");
  expect(end.health).toBe(before.health);
  // It did reach the wall (moved most of the way there).
  expect(Math.hypot(end.x - before.x, end.z - before.z)).toBeGreaterThan(3);
});
