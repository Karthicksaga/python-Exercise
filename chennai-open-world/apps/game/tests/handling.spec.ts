/** Driving feel (J5): drift at speed, no drift when slow, gears climb, the chase camera trails. */
import { expect, test, type Page } from "@playwright/test";
import { board, holdButton, holdStick, probe, ready, snapshot, teleport } from "./support";

interface HandlingSnapshot {
  x: number;
  z: number;
  yaw: number;
  cameraYaw: number;
  speed: number;
  gear: string;
  drift: number;
  mode: string;
}
const state = (page: Page) => snapshot(page) as unknown as Promise<HandlingSnapshot>;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Point the car down the longest clear line near where it is parked (the map is real streets,
 * so no straight is hard-coded), with room to reach drifting speed.
 */
async function lineUp(page: Page, needed: number): Promise<void> {
  const start = await state(page);
  let best = { yaw: start.yaw, clear: 0 };
  for (let i = 0; i < 32; i++) {
    const yaw = (i / 32) * Math.PI * 2;
    const hit = await probe(page, start.x, start.z, -Math.sin(yaw), -Math.cos(yaw), 200);
    const clear = hit ?? 200;
    if (clear > best.clear) best = { yaw, clear };
  }
  expect(best.clear).toBeGreaterThan(needed);
  await teleport(page, start.x, start.z, best.yaw);
}

/** Hold the throttle until the car is going at least `speed` m/s. */
async function speedUp(page: Page, speed: number): Promise<void> {
  const button = page.getByRole("button", { name: "Accelerate", exact: true });
  await button.dispatchEvent("pointerdown", { pointerId: 31, pointerType: "touch" });
  try {
    await expect.poll(async () => (await state(page)).speed, { timeout: 9000, intervals: [100] }).toBeGreaterThan(speed);
  } finally {
    await button.dispatchEvent("pointerup", { pointerId: 31, pointerType: "touch" });
  }
}

/** Largest `drift` seen while `action` runs. */
async function peakDrift(page: Page, action: Promise<unknown>): Promise<number> {
  let peak = 0;
  let done = false;
  const watching = (async () => {
    while (!done) {
      peak = Math.max(peak, (await state(page)).drift);
      await page.waitForTimeout(50);
    }
  })();
  await action;
  done = true;
  await watching;
  return peak;
}

test("the hatchback drifts on full lock at speed, then grips again", async ({ page }) => {
  await ready(page);
  await board(page, "car-start");
  await lineUp(page, 110);
  // About 82% of its top speed: drift eases in from 52-72% of top speed, so 65% only gives
  // a slight slip. The brief asks for drift at high speed.
  await speedUp(page, 19);

  const peak = await peakDrift(page, Promise.all([holdStick(page, 80, 0, 1400), holdButton(page, "Accelerate", 1400)]));
  expect(peak).toBeGreaterThan(0.3);
  // Stick released: the slide ends within a second.
  await expect.poll(async () => (await state(page)).drift, { timeout: 1500 }).toBeLessThan(0.1);
});

test("no drift when turning slowly", async ({ page }) => {
  await ready(page);
  await board(page, "car-start");
  const peak = await peakDrift(page, Promise.all([holdStick(page, 80, 0, 2600), holdButton(page, "Accelerate", 2600)]));
  expect(peak).toBeLessThan(0.15);
});

test("gears climb while accelerating and the chase camera settles behind the direction of travel", async ({ page }) => {
  await ready(page);
  await board(page, "car-start");
  await lineUp(page, 60);
  const seen = new Set<string>();
  const accelerating = holdButton(page, "Accelerate", 3500);
  for (let i = 0; i < 30; i++) {
    seen.add((await state(page)).gear);
    await page.waitForTimeout(100);
  }
  await accelerating;
  expect(seen.has("1")).toBe(true);
  expect(seen.has("2")).toBe(true);
  const s = await state(page);
  expect(s.speed).toBeGreaterThan(8);
  expect(Math.abs(wrap(s.cameraYaw - s.yaw))).toBeLessThan(0.2);
});
