/** Getting in and out as an animated sequence: walk to the door, open it, sit, shut it; and back. */
import { expect, test, type Page } from "@playwright/test";
import { GAME_WAIT, ready, snapshot, tapButton, teleport, type Snapshot } from "./support";

/** Snapshots taken until `done` says stop (or the wall-clock limit), for looking back at the sequence. */
async function watch(page: Page, done: (s: Snapshot) => boolean): Promise<Snapshot[]> {
  const seen: Snapshot[] = [];
  const end = Date.now() + GAME_WAIT;
  for (;;) {
    const s = await snapshot(page);
    seen.push(s);
    if (done(s)) return seen;
    if (Date.now() > end) throw new Error(`Timed out; last: ${JSON.stringify({ mode: s.mode, boarding: s.boarding })}`);
    await page.waitForTimeout(40);
  }
}

const doorOf = (s: Snapshot, id: string) => s.vehicles.find((v) => v.id === id)!.door;

test("the car: walk to the driver's door, it opens, sit, it shuts; then out the same way", async ({ page }) => {
  await ready(page);
  const car = (await snapshot(page)).vehicles.find((v) => v.id === "car-start")!;
  await teleport(page, car.x + 2, car.z);
  const ground = (await snapshot(page)).y;
  await tapButton(page, "Get in");

  // Partway: neither the foot nor the driving controls, and still on foot.
  const during = await snapshot(page);
  expect(during.boarding?.direction).toBe("in");
  expect(during.mode).toBe("foot");
  await expect(page.getByRole("button", { name: "Jump", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Accelerate", exact: true })).toBeHidden();

  const going = await watch(page, (s) => s.mode === "car" && s.boarding === null);
  const phases = [...new Set(going.map((s) => s.boarding?.phase).filter(Boolean))];
  // Approach may be over before the first look on a slow machine; the door steps are not.
  expect(phases).toEqual(expect.arrayContaining(["open", "sit", "close"]));
  expect(phases.indexOf("open")).toBeLessThan(phases.indexOf("sit"));
  expect(phases.indexOf("sit")).toBeLessThan(phases.indexOf("close"));
  expect(Math.max(...going.map((s) => doorOf(s, "car-start")))).toBeGreaterThan(0.8);
  // While the door was wide open the player was still on foot; seated with the door shut at the end.
  expect(going.filter((s) => doorOf(s, "car-start") > 0.8).every((s) => s.mode === "foot")).toBe(true);
  const seated = going[going.length - 1]!;
  expect(doorOf(seated, "car-start")).toBe(0);
  await expect(page.getByRole("button", { name: "Accelerate", exact: true })).toBeVisible();
  // The car never moved while the driver got in.
  const parked = seated.vehicles.find((v) => v.id === "car-start")!;
  expect(Math.hypot(parked.x - car.x, parked.z - car.z)).toBeLessThan(0.15);

  await tapButton(page, "Get out");
  const leaving = await watch(page, (s) => s.mode === "foot" && s.boarding === null);
  expect(Math.max(...leaving.map((s) => doorOf(s, "car-start")))).toBeGreaterThan(0.8);
  // Control comes back while the door is still swinging shut behind the player.
  expect(leaving.some((s) => s.mode === "foot" && s.boarding?.phase === "close")).toBe(true);
  const out = leaving[leaving.length - 1]!;
  expect(doorOf(out, "car-start")).toBe(0);
  await expect(page.getByRole("button", { name: "Jump", exact: true })).toBeVisible();
  // Standing beside the driver's (right-hand) door, on the ground.
  const at = out.vehicles.find((v) => v.id === "car-start")!;
  const vehicleYaw = seated.yaw;
  const dx = out.x - at.x;
  const dz = out.z - at.z;
  const right = dx * Math.cos(vehicleYaw) - dz * Math.sin(vehicleYaw);
  expect(right).toBeGreaterThan(1);
  expect(right).toBeLessThan(2);
  expect(Math.hypot(dx, dz)).toBeLessThan(2.5);
  expect(Math.abs(out.y - ground)).toBeLessThan(0.3);
});

test("the bus: through the kerb-side front door and along the floor to the driver's seat", async ({ page }) => {
  await ready(page);
  const bus = (await snapshot(page)).vehicles.find((v) => v.id === "bus")!;
  await teleport(page, bus.x + 2, bus.z);
  await expect(page.getByRole("button", { name: "Get in", exact: true })).toBeVisible();
  await tapButton(page, "Get in");
  const going = await watch(page, (s) => s.mode === "bus" && s.boarding === null);
  const phases = [...new Set(going.map((s) => s.boarding?.phase).filter(Boolean))];
  expect(phases).toEqual(expect.arrayContaining(["open", "climb", "sit", "close"]));
  expect(Math.max(...going.map((s) => doorOf(s, "bus")))).toBeGreaterThan(0.8);
  expect(doorOf(going[going.length - 1]!, "bus")).toBe(0);
});

test("the auto and the motorbike have no door: straight onto the seat", async ({ page }) => {
  await ready(page);
  for (const id of ["auto-park", "bike-start"]) {
    const vehicle = (await snapshot(page)).vehicles.find((v) => v.id === id)!;
    await teleport(page, vehicle.x + 2, vehicle.z);
    await expect(page.getByRole("button", { name: "Get in", exact: true })).toBeVisible();
    await tapButton(page, "Get in");
    const going = await watch(page, (s) => s.mode !== "foot" && s.boarding === null);
    expect(going.some((s) => s.boarding?.phase === "sit")).toBe(true);
    expect(going.every((s) => doorOf(s, id) === 0)).toBe(true);
    await tapButton(page, "Get out");
    await watch(page, (s) => s.mode === "foot" && s.boarding === null);
  }
});

test("a teleport part way through getting in stops it: on foot, the door shut", async ({ page }) => {
  await ready(page);
  const car = (await snapshot(page)).vehicles.find((v) => v.id === "car-start")!;
  await teleport(page, car.x + 2, car.z);
  await tapButton(page, "Get in");
  await watch(page, (s) => doorOf(s, "car-start") > 0.3);
  await teleport(page, car.x + 12, car.z + 12);
  const after = await snapshot(page);
  expect(after.mode).toBe("foot");
  expect(after.boarding).toBeNull();
  expect(doorOf(after, "car-start")).toBe(0);
  await expect(page.getByRole("button", { name: "Jump", exact: true })).toBeVisible();
});
