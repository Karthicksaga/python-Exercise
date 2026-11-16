/** City jobs: the job board, the ambulance run end to end, reputation locks and the bus. */
import { expect, test, type Page } from "@playwright/test";
import { board, holdButton, ready, snapshot, tapButton, teleport } from "./support";

interface JobSnapshot {
  job: string | null;
  jobStop: number;
  reputation: number;
  gear: string;
  siren: boolean;
  held: boolean;
  money: number;
  target: { x: number; z: number } | null;
}
const jobState = (page: Page) => snapshot(page) as unknown as Promise<JobSnapshot>;

test("take the ambulance run, use the siren, and get paid", async ({ page }) => {
  await ready(page);
  await page.getByTestId("jobs").click();
  await expect(page.getByRole("dialog")).toContainText("Job board");
  await page.getByTestId("take-ambulance-run").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await jobState(page)).job).toBe("ambulance-run");
  await expect(page.getByTestId("mission")).toContainText("Get in the ambulance");

  await board(page, "ambulance");
  expect((await snapshot(page)).mode).toBe("ambulance");
  await tapButton(page, "Siren");
  expect((await jobState(page)).siren).toBe(true);
  await holdButton(page, "Accelerate", 1200);
  const moving = await jobState(page);
  expect(moving.gear).toMatch(/^[1-5]$/);
  await expect(page.getByTestId("gear")).toHaveText(/^[1-5]$/);

  // Drive straight to the patient: stop inside the marker and wait for them to be loaded.
  const pickup = moving.target!;
  await teleport(page, pickup.x, pickup.z);
  await expect.poll(async () => (await jobState(page)).jobStop, { timeout: 8000 }).toBe(1);
  const hospital = (await jobState(page)).target!;
  expect(Math.hypot(hospital.x - pickup.x, hospital.z - pickup.z)).toBeGreaterThan(50);
  await teleport(page, hospital.x, hospital.z);
  await expect(page.getByRole("dialog")).toContainText("Ambulance run complete", { timeout: 6000 });
  const done = await jobState(page);
  expect(done.job).toBeNull();
  expect(done.held).toBe(true);
  expect(done.money).toBeGreaterThan(600);
  expect(done.reputation).toBeGreaterThan(50);
  await page.getByRole("button", { name: "Continue" }).click();
  expect((await jobState(page)).held).toBe(false);
  // Reputation and money survive a reload.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  const reloaded = await jobState(page);
  expect(reloaded.reputation).toBe(done.reputation);
  expect(reloaded.money).toBe(done.money);
});

test("the bus route needs reputation; with it, the bus can be driven", async ({ page }) => {
  await ready(page);
  await page.getByTestId("jobs").click();
  await expect(page.getByTestId("take-bus-route")).toBeDisabled();
  await page.getByRole("button", { name: "Close" }).click();

  await page.evaluate(() => localStorage.setItem("cow-jobs-v1", JSON.stringify({ reputation: 60, done: 2, failed: 0, best: {} })));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await page.getByTestId("jobs").click();
  await page.getByTestId("take-bus-route").click();
  await board(page, "bus");
  expect((await snapshot(page)).mode).toBe("bus");
  await holdButton(page, "Accelerate", 2500);
  expect((await snapshot(page)).speed).toBeGreaterThan(3);
  await expect(page.getByTestId("mission")).toContainText("Bus stop 1 of 4");
});

test("quitting a job costs reputation and the game goes on", async ({ page }) => {
  await ready(page);
  await page.getByTestId("jobs").click();
  await page.getByTestId("take-cab-ride").click();
  await page.getByTestId("jobs").click();
  await page.getByRole("button", { name: "Quit job" }).click();
  await expect(page.getByRole("dialog")).toContainText("Job failed");
  await page.getByRole("button", { name: "Continue" }).click();
  const after = await jobState(page);
  expect(after.job).toBeNull();
  expect(after.reputation).toBe(45);
  // The stage is still there to play.
  expect((await snapshot(page)).mission).toBe("morning-walk");
});

test("the Marina evening drive is offered only in the evening, and pays for a drive off Anna Salai", async ({ page }) => {
  await ready(page);
  const reloadAt = async (hour: number) => {
    await page.evaluate((h) => localStorage.setItem("cow-hour-v1", String(h)), hour);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  };
  // In the morning the board says when it is offered.
  await reloadAt(9);
  await page.getByTestId("jobs").click();
  await expect(page.getByTestId("take-marina-evening")).toBeDisabled();
  await expect(page.getByRole("dialog")).toContainText("16:00–20:30");
  await page.getByRole("button", { name: "Close" }).click();

  await reloadAt(17);
  await page.getByTestId("jobs").click();
  await page.getByTestId("take-marina-evening").click();
  expect((await jobState(page)).job).toBe("marina-evening");
  // The hatchback parked in T. Nagar, next to the pick-up.
  await board(page, "car-tnagar");
  expect((await snapshot(page)).mode).toBe("car");
  const pickup = (await jobState(page)).target!;
  await teleport(page, pickup.x, pickup.z);
  await expect.poll(async () => (await jobState(page)).jobStop, { timeout: 10_000 }).toBe(1);
  const drop = (await jobState(page)).target!;
  expect(Math.hypot(drop.x - pickup.x, drop.z - pickup.z)).toBeGreaterThan(4000);
  await teleport(page, drop.x, drop.z);
  await expect(page.getByRole("dialog")).toContainText("Marina evening drive complete", { timeout: 8000 });
  await expect(page.getByRole("dialog")).toContainText("Kept off Anna Salai");
  const done = await jobState(page);
  expect(done.job).toBeNull();
  expect(done.money).toBeGreaterThan(1000);
});

test("the board offers every job, and each job's vehicle is parked somewhere", async ({ page }) => {
  await ready(page);
  await page.getByTestId("jobs").click();
  const ids = await page.locator('[data-testid^="take-"]').evaluateAll((buttons) => buttons.map((b) => (b as HTMLElement).dataset.testid!.slice(5)));
  expect(ids.length).toBeGreaterThanOrEqual(10);
  const vehicles = new Set((await snapshot(page)).vehicles.map((v) => v.kind));
  const needs: Record<string, string> = {
    "ambulance-run": "ambulance", "hospital-transfer": "ambulance", courier: "bike", "food-delivery": "bike", "medicine-run": "bike",
    "cab-ride": "car", "tower-park-visit": "car", "share-auto": "auto", "bus-route": "bus", "evening-bus": "bus",
    // City jobs added on purpose (T. Nagar to Marina, Egmore to Royapettah, Anna Salai bus).
    "marina-evening": "car", "egmore-transfer": "ambulance", "mount-road-bus": "bus",
  };
  for (const id of ids) expect(vehicles.has(needs[id] ?? "unknown"), `vehicle for ${id}`).toBe(true);
});
