/** Chennai traffic (milestone J3): signals, the traffic mix, and density by time of day. */
import { expect, test, type Page } from "@playwright/test";
import { ready, snapshot, waitGameTime } from "./support";

interface TrafficState {
  traffic: Array<{ x: number; z: number; speed: number; kind: string }>;
  trafficWanted: number;
  signals: number;
  waitingAtSignals: number;
  pedestrians: number;
  hour: number;
}
const traffic = async (page: Page) => (await snapshot(page)) as unknown as TrafficState;

test("the main junctions have signals and the traffic is a mix of vehicles", async ({ page }) => {
  await ready(page);
  const s = await traffic(page);
  // Junctions where three or more roads meet and one is a main road (35 on the Anna Nagar extract).
  expect(s.signals).toBeGreaterThan(10);
  const kinds = new Set(s.traffic.map((t) => t.kind));
  expect(kinds.has("ambulance")).toBe(false);
  expect(kinds.size).toBeGreaterThanOrEqual(3);
});

test("traffic stops at the lights and moves on again", async ({ page }) => {
  await ready(page);
  // Someone in the pool is held at a red light (or queued behind one) within a couple of cycles.
  await expect.poll(async () => (await traffic(page)).waitingAtSignals, { timeout: 70_000, intervals: [500] }).toBeGreaterThan(0);
  // ...and the lights change: the same count does not stay stuck for a whole cycle.
  await expect.poll(async () => (await traffic(page)).traffic.filter((t) => t.speed > 2).length, { timeout: 40_000, intervals: [500] }).toBeGreaterThan(0);
});

test("late at night there is less traffic than in the evening rush", async ({ page }) => {
  await ready(page);
  const evening = await traffic(page);
  // A fresh game starts in the evening (17:45), a rush hour.
  expect(evening.hour).toBeGreaterThan(17);
  expect(evening.hour).toBeLessThan(20);
  await page.evaluate(() => localStorage.setItem("cow-hour-v1", "3"));
  await ready(page, true);
  // Game time, not wall clock: the density is worked out once a second of game time
  // (Population DENSITY_EVERY); 1.5 s of wall clock was barely one on a slow CI runner.
  await waitGameTime(page, 1.5);
  const night = await traffic(page);
  expect(night.hour).toBeLessThan(4);
  expect(night.trafficWanted).toBeLessThan(evening.trafficWanted);
  // On loading, the extra vehicles are put away at once.
  expect(night.traffic.length).toBe(night.trafficWanted);
  expect(night.pedestrians).toBeLessThan(evening.pedestrians);
});
