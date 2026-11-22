/**
 * Passengers at pick-ups and drops: someone waits at the kerb and waves, walks over once the
 * vehicle has stopped and gets in (sitting in the auto; through the opening rear door of a car),
 * and at the drop gets out and walks off before the stop counts. Bus stops: some off, some on.
 */
import { expect, test, type Page } from "@playwright/test";
import { GAME_WAIT, board, ready, snapshot, teleport, waitGameTime } from "./support";

interface Fare {
  waiting: number;
  waving: number;
  walking: number;
  seated: number;
  leaving: number;
  door: number;
  aboard: number;
  kerb: { x: number; z: number };
  stages: string[];
  note: string | null;
  people: Array<{ x: number; z: number; stage: string }>;
}
interface State {
  x: number;
  z: number;
  mode: string;
  money: number;
  mission: string | null;
  objective: string | null;
  target: { x: number; z: number } | null;
  job: string | null;
  jobStop: number;
  fare: Fare | null;
}
const state = async (page: Page) => (await snapshot(page)) as unknown as State;
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** Open the game with stages 1 and 2 done: stage 3, the auto fare, is next. */
async function atStage3(page: Page): Promise<void> {
  await page.goto("/?quality=lite&start=play");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("cow-progress-v1", JSON.stringify({ completed: ["morning-walk", "borrowed-wheels"], money: 200 }));
  });
  await ready(page, true);
  expect((await state(page)).mission).toBe("auto-shift");
}

test("stage 3: the passenger waits at the kerb, waves, walks to the auto, sits in it, and gets out at the drop", async ({ page }) => {
  test.setTimeout(180_000);
  await atStage3(page);
  await board(page, "auto-park");
  await expect.poll(async () => (await state(page)).objective, { timeout: GAME_WAIT }).toBe("Pick up the passenger");
  const pickup = (await state(page)).target!;
  // From down the road the passenger is drawn, waiting and not yet waving.
  const far = await state(page);
  expect(far.fare!.stages).toEqual(["waiting"]);
  const kerb = far.fare!.kerb;
  expect(distance(kerb, pickup)).toBeGreaterThan(2);
  await teleport(page, pickup.x + (pickup.x - kerb.x) * 8, pickup.z + (pickup.z - kerb.z) * 8);
  await waitGameTime(page, 0.3);
  const approaching = await state(page);
  expect(approaching.fare!.waiting).toBe(1);
  // Pulled up: they wave, then walk over, and the objective waits for them.
  await teleport(page, pickup.x, pickup.z);
  await expect.poll(async () => (await state(page)).fare?.stages[0], { timeout: GAME_WAIT }).toBe("walking");
  const walking = await state(page);
  expect(walking.objective).toBe("Pick up the passenger");
  expect(walking.fare!.note).toBe("Passenger getting in");
  await expect(page.getByTestId("mission")).toContainText("Passenger getting in");
  // Then in: the drop's objective starts and they sit on the back bench.
  await expect.poll(async () => (await state(page)).objective, { timeout: GAME_WAIT }).toBe("Drop the passenger");
  const riding = await state(page);
  expect(riding.fare!.aboard).toBe(1);
  expect(riding.fare!.seated).toBe(1);
  expect(riding.money).toBe(200);
  // At the drop: out, a walk onto the pavement, and only then paid.
  const drop = riding.target!;
  await teleport(page, drop.x, drop.z);
  await expect.poll(async () => (await state(page)).fare?.stages[0] ?? "done", { timeout: GAME_WAIT }).toBe("leaving");
  const leaving = await state(page);
  expect(leaving.fare!.seated).toBe(0);
  expect(leaving.fare!.leaving).toBe(1);
  expect(leaving.money).toBe(200);
  await expect.poll(async () => (await state(page)).money, { timeout: GAME_WAIT }).toBe(500);
  expect((await state(page)).mission).toBe("parcel-run");
});

test("cab ride: the passenger opens the car's kerb-side rear door, gets in out of sight, and the job moves on", async ({ page }) => {
  test.setTimeout(150_000);
  await ready(page);
  await page.getByTestId("jobs").click();
  await page.getByTestId("take-cab-ride").click();
  await board(page, "car-start");
  const pickup = (await state(page)).target!;
  await teleport(page, pickup.x, pickup.z);
  await expect.poll(async () => (await state(page)).fare?.stages[0], { timeout: GAME_WAIT }).toBe("entering");
  // The rear door swings open for them.
  await expect.poll(async () => (await state(page)).fare?.door ?? 0, { timeout: GAME_WAIT }).toBeGreaterThan(0.5);
  await expect.poll(async () => (await state(page)).jobStop, { timeout: GAME_WAIT }).toBe(1);
  const inside = await state(page);
  expect(inside.fare!.aboard).toBe(1);
  // Closed car: nobody drawn on a seat, and the door shuts again.
  expect(inside.fare!.seated).toBe(0);
  await expect.poll(async () => (await state(page)).fare?.door ?? 1, { timeout: GAME_WAIT }).toBe(0);
});

test("bus route: three get on at the first stop; at the second some get off before others get on", async ({ page }) => {
  test.setTimeout(180_000);
  await ready(page);
  await page.evaluate(() => localStorage.setItem("cow-jobs-v1", JSON.stringify({ reputation: 60, done: 2, failed: 0, best: {} })));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await page.getByTestId("jobs").click();
  await page.getByTestId("take-bus-route").click();
  await board(page, "bus");
  const first = await state(page);
  expect(first.fare!.stages).toEqual(["waiting", "waiting", "waiting"]);
  await teleport(page, first.target!.x, first.target!.z);
  await expect.poll(async () => (await state(page)).fare?.walking ?? 0, { timeout: GAME_WAIT }).toBeGreaterThan(0);
  // People on screen stand off the carriageway until they step to the door.
  await expect.poll(async () => (await state(page)).jobStop, { timeout: GAME_WAIT }).toBe(1);
  const second = await state(page);
  expect(second.fare!.aboard).toBe(3);
  expect(second.fare!.stages.filter((s) => s === "riding").length).toBeGreaterThan(0);
  expect(second.fare!.stages.filter((s) => s === "waiting").length).toBeGreaterThan(0);
  await teleport(page, second.target!.x, second.target!.z);
  await expect.poll(async () => (await state(page)).fare?.leaving ?? 0, { timeout: GAME_WAIT }).toBeGreaterThan(0);
  await expect.poll(async () => (await state(page)).jobStop, { timeout: GAME_WAIT }).toBe(2);
  const third = await state(page);
  expect(third.fare!.aboard).toBeGreaterThan(0);
  expect(third.fare!.aboard).not.toBe(3 + 1);
});
