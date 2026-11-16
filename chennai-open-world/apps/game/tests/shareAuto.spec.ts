/** The share auto job: people waiting along 2nd Avenue get in when the auto stops beside them, get out where they asked, and pay. */
import { expect, test, type Page } from "@playwright/test";
import { board, ready, snapshot, teleport, waitGameTime } from "./support";

interface Point {
  x: number;
  z: number;
}
interface ShareState {
  job: string | null;
  money: number;
  reputation: number;
  held: boolean;
  mode: string;
  share: {
    aboard: number;
    fares: number;
    carried: number;
    left: number;
    progress: number;
    length: number;
    start: Point;
    end: Point;
    waiting: Array<{ id: number; x: number; z: number; stop: Point }>;
    riding: Array<{ id: number; drop: Point }>;
  } | null;
}
const state = (page: Page) => snapshot(page) as unknown as Promise<ShareState>;

test("share auto: a passenger waved down at the kerb gets in, gets out further on and pays", async ({ page }) => {
  await ready(page);
  await page.getByTestId("jobs").click();
  await expect(page.getByRole("dialog")).toContainText("Share auto");
  await page.getByTestId("take-share-auto").click();
  expect((await state(page)).job).toBe("share-auto");
  await expect(page.getByTestId("mission")).toContainText("Get in the auto-rickshaw");

  // The share auto waits at the start of the route; the clock starts there.
  await board(page, "auto-share");
  expect((await state(page)).mode).toBe("auto");
  await expect(page.getByTestId("mission")).toContainText("pull up beside them", { timeout: 10_000 });
  await expect(page.getByTestId("mission")).toContainText("0/4 aboard");
  const start = await state(page);
  const share = start.share!;
  expect(share.length).toBeGreaterThan(1500);
  expect(share.waiting.length).toBeGreaterThan(0);
  expect(share.waiting.length).toBeLessThanOrEqual(3);
  // East along the avenue.
  const yaw = Math.atan2(-(share.end.x - share.start.x), -(share.end.z - share.start.z));

  // Stopped, but not beside them: nobody gets in.
  const passenger = share.waiting[0]!;
  const before = { x: passenger.stop.x - 20, z: passenger.stop.z };
  await teleport(page, before.x, before.z, yaw);
  await waitGameTime(page, 2.5);
  expect((await state(page)).share!.aboard).toBe(0);

  // Pull up beside them and stop: they get in.
  await teleport(page, passenger.stop.x, passenger.stop.z, yaw);
  await expect.poll(async () => (await state(page)).share!.aboard, { timeout: 15_000 }).toBe(1);
  await expect(page.getByTestId("mission")).toContainText("1/4 aboard");
  const aboard = (await state(page)).share!;
  expect(aboard.waiting.some((p) => p.id === passenger.id)).toBe(false);
  const rider = aboard.riding.find((p) => p.id === passenger.id)!;
  expect(Math.hypot(rider.drop.x - passenger.stop.x, rider.drop.z - passenger.stop.z)).toBeGreaterThan(200);

  // Their stop, further along the route: they get out and pay a small fare.
  const money = (await state(page)).money;
  await teleport(page, rider.drop.x, rider.drop.z, yaw);
  await expect.poll(async () => (await state(page)).share!.carried, { timeout: 15_000 }).toBe(1);
  const dropped = await state(page);
  expect(dropped.share!.aboard).toBe(0);
  expect(dropped.share!.fares).toBeGreaterThanOrEqual(10);
  expect(dropped.share!.fares).toBeLessThan(30);
  expect(dropped.money).toBe(money + dropped.share!.fares);

  // The end of the route ends the shift: the result shows who was carried and the fares.
  await teleport(page, dropped.share!.end.x, dropped.share!.end.z, yaw);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Share auto shift over", { timeout: 15_000 });
  await expect(dialog).toContainText("1 passenger carried");
  await expect(dialog).toContainText(`₹${dropped.share!.fares} in fares`);
  await expect(dialog).toContainText("reputation");
  const done = await state(page);
  expect(done.job).toBeNull();
  expect(done.share).toBeNull();
  expect(done.held).toBe(true);
  // Paid once, as they got off; passing people by on the way (by teleport) costs a little reputation, never the game.
  expect(done.money).toBe(dropped.money);
  expect(done.reputation).toBeGreaterThanOrEqual(45);
  expect(done.reputation).toBeLessThanOrEqual(53);
  await page.getByRole("button", { name: "Continue" }).click();
  expect((await state(page)).held).toBe(false);
});
