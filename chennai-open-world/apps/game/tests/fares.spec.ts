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
  await page.goto("/?quality=lite");
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

interface GoodsState {
  stage: string | null;
  action: "load" | "unload" | null;
  inHands: number;
  onVehicle: number;
  leaving: number;
  carry: string | null;
  kerb: { x: number; z: number } | null;
  door: number;
  cargo: string[];
  note: string | null;
  items: Array<{ kind: string; x: number; y: number; z: number; holder: string }>;
}
const goods = async (page: Page) => ((await snapshot(page)) as unknown as { goods: GoodsState | null }).goods;

test("courier: a clerk at the kerb hands the parcel over at the bike, it rides on the pillion, and someone takes it at the drop", async ({ page }) => {
  test.setTimeout(180_000);
  await ready(page);
  await page.getByTestId("jobs").click();
  await page.getByTestId("take-courier").click();
  await board(page, "bike-start");
  // From across the road: waiting at the kerb with the parcel held in both hands; nothing on the bike yet.
  const near = (await goods(page))!.kerb!;
  const at = (await state(page)).target!;
  await teleport(page, at.x + (at.x - near.x) * 3, at.z + (at.z - near.z) * 3);
  await expect.poll(async () => (await goods(page))?.stage, { timeout: GAME_WAIT }).toBe("waiting");
  const waiting = (await goods(page))!;
  expect(waiting).toMatchObject({ action: "load", carry: "box", inHands: 1, onVehicle: 0, cargo: [] });
  const pickup = (await state(page)).target!;
  await teleport(page, pickup.x, pickup.z);
  await expect.poll(async () => (await goods(page))?.stage, { timeout: GAME_WAIT }).toBe("walking");
  expect((await state(page)).jobStop).toBe(0);
  await expect(page.getByTestId("mission")).toContainText("The parcel being loaded");
  // Handed over: the job moves on, and the parcel is on the bike.
  await expect.poll(async () => (await state(page)).jobStop, { timeout: GAME_WAIT }).toBe(1);
  const riding = (await goods(page))!;
  expect(riding.cargo).toEqual(["parcel"]);
  expect(riding.onVehicle).toBe(1);
  expect(riding.items.find((i) => i.holder === "vehicle")).toBeDefined();
  // The clerk walks back to the pavement empty-handed.
  expect(riding.leaving).toBe(1);
  // At the drop someone walks up and takes it.
  const drop = (await state(page)).target!;
  await teleport(page, drop.x, drop.z);
  await expect.poll(async () => (await goods(page))?.stage, { timeout: GAME_WAIT }).toBe("handing");
  await expect.poll(async () => (await state(page)).job, { timeout: GAME_WAIT }).toBeNull();
  await expect(page.getByRole("dialog")).toContainText("Courier delivery complete");
  await expect(page.getByRole("dialog")).toContainText("Parcel undamaged: +25%");
});

interface StretcherState {
  stage: string | null;
  stretcher: { x: number; y: number; z: number } | null;
  paramedic: { x: number; z: number } | null;
  door: number;
  lying: boolean;
  leaving: boolean;
}
const stretcher = async (page: Page) => ((await snapshot(page)) as unknown as { stretcher: StretcherState }).stretcher;

test("ambulance: the patient lies on a stretcher with a paramedic, is wheeled in through the rear doors, and out at the hospital", async ({ page }) => {
  test.setTimeout(180_000);
  await ready(page);
  await page.getByTestId("jobs").click();
  await page.getByTestId("take-ambulance-run").click();
  await board(page, "ambulance");
  // From the far side of the road (people and stretchers are drawn only near the player).
  const near = (await state(page)).fare!.kerb;
  const at = (await state(page)).target!;
  await teleport(page, at.x + (at.x - near.x) * 3, at.z + (at.z - near.z) * 3);
  await expect.poll(async () => (await stretcher(page)).stage, { timeout: GAME_WAIT }).toBe("waiting");
  const waiting = await stretcher(page);
  expect(waiting.lying).toBe(true);
  expect(waiting.paramedic).not.toBeNull();
  const kerb = (await state(page)).fare!.kerb;
  expect(distance(waiting.stretcher!, kerb)).toBeLessThan(0.5);
  // Nobody walks in: the fare's own figures show no one.
  expect((await state(page)).fare!.waiting).toBe(0);
  const pickup = (await state(page)).target!;
  await teleport(page, pickup.x, pickup.z);
  await expect.poll(async () => (await stretcher(page)).stage, { timeout: GAME_WAIT }).toBe("entering");
  // The rear doors open for it, and it goes up onto the floor.
  await expect.poll(async () => (await stretcher(page)).door, { timeout: GAME_WAIT }).toBeGreaterThan(0.5);
  await expect.poll(async () => (await stretcher(page)).stretcher?.y ?? 0, { timeout: GAME_WAIT, intervals: [50] }).toBeGreaterThan(0.2);
  await expect.poll(async () => (await state(page)).jobStop, { timeout: GAME_WAIT }).toBe(1);
  // In, and the doors shut again.
  expect((await stretcher(page)).stretcher).toBeNull();
  await expect.poll(async () => (await stretcher(page)).door, { timeout: GAME_WAIT }).toBe(0);
  const hospital = (await state(page)).target!;
  await teleport(page, hospital.x, hospital.z);
  await expect.poll(async () => (await stretcher(page)).stage, { timeout: GAME_WAIT }).toBe("exiting");
  await expect.poll(async () => (await stretcher(page)).stage, { timeout: GAME_WAIT }).toBe("leaving");
  await expect(page.getByRole("dialog")).toContainText("Ambulance run complete", { timeout: GAME_WAIT });
});
