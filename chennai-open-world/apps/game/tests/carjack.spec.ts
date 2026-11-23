/**
 * Carjacking (TD-30): standing in front of a car, auto or motorbike in traffic stops it; HIJACK
 * then pulls the driver out (they run off on foot) and puts the player at the wheel of a drivable
 * vehicle of the same kind in its place. It is a crime (a star), and the vehicle drives.
 */
import { expect, test, type Page } from "@playwright/test";
import { GAME_WAIT, getOut, holdButton, ready, snapshot, tapButton, teleport, waitGameTime } from "./support";

interface Traffic {
  id: number;
  x: number;
  z: number;
  speed: number;
  kind: string;
  heading: number;
}
interface State {
  x: number;
  z: number;
  mode: string;
  traffic: Traffic[];
  vehicles: Array<{ id: string; kind: string; x: number; z: number }>;
  boarding: { phase: string } | null;
  carjack: { spares: Array<{ id: string; kind: string }>; pending: string | null; pulled: number; lastDriver: number | null; jackable: { id: number; kind: string } | null };
  police: { stars: number; lastCrime: string | null };
}
const state = (page: Page) => page.evaluate(() => (window as unknown as { __cow: { snapshot(): unknown } }).__cow.snapshot()) as Promise<State>;
const walkers = (page: Page) =>
  page.evaluate(() => (window as unknown as { __cow: { people(): { pedestrians: Array<{ x: number; z: number; speed: number; down: boolean }> } } }).__cow.people().pedestrians);

const TAKEABLE = ["car", "auto", "bike"];
const SPOKEN: Record<string, string> = { car: "Take car", auto: "Take auto", bike: "Take motorbike" };

/**
 * Step into the lane in front of a car, auto or motorbike in traffic (it brakes for a person
 * ahead) and wait, in game time, until HIJACK is offered for it. Tries the next vehicle if one
 * turns off before reaching the player. Returns the traffic vehicle as it stood when offered.
 */
async function stopOne(page: Page): Promise<Traffic> {
  const tried = new Set<number>();
  for (let attempt = 0; attempt < 8; attempt++) {
    const s = await state(page);
    const pick = s.traffic
      .filter((t) => TAKEABLE.includes(t.kind) && !tried.has(t.id))
      .sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
    if (!pick) {
      await waitGameTime(page, 2);
      continue;
    }
    tried.add(pick.id);
    // 12 m ahead in its lane, facing it: room for it to brake from cruising speed.
    const ahead = 12;
    await teleport(page, pick.x - Math.sin(pick.heading) * ahead, pick.z - Math.cos(pick.heading) * ahead, pick.heading + Math.PI);
    for (let i = 0; i < 16; i++) {
      await waitGameTime(page, 0.5);
      const now = await state(page);
      if (now.carjack.jackable?.id === pick.id) return now.traffic.find((t) => t.id === pick.id)!;
    }
  }
  throw new Error("No car, auto or motorbike in traffic stopped for the player");
}

test("standing in front of a car in traffic stops it; HIJACK pulls the driver out, a star, and it drives", async ({ page }) => {
  test.setTimeout(240_000);
  await ready(page);
  await waitGameTime(page, 1);
  const before = await state(page);
  expect(before.police.stars).toBe(0);
  const jacked = await stopOne(page);
  // Stopped (or crawling): fast vehicles are never offered.
  expect(jacked.speed).toBeLessThan(1.2);
  const button = page.getByRole("button", { name: SPOKEN[jacked.kind]!, exact: true });
  await expect(button).toBeVisible();
  await expect(button).toHaveText("HIJACK");
  await tapButton(page, SPOKEN[jacked.kind]!);

  // The traffic vehicle is gone from the traffic; a drivable one of its kind stands in its place.
  const taking = await state(page);
  expect(taking.traffic.find((t) => t.id === jacked.id && Math.hypot(t.x - jacked.x, t.z - jacked.z) < 5)).toBeUndefined();
  const spare = taking.vehicles.find((v) => v.id.startsWith("jacked-"));
  expect(spare?.kind).toBe(jacked.kind);
  expect(Math.hypot(spare!.x - jacked.x, spare!.z - jacked.z)).toBeLessThan(1);
  // A crime, reported at once.
  expect(taking.police.stars).toBeGreaterThanOrEqual(1);
  expect(taking.police.lastCrime).toBe("carjacking");

  // The sequence: walk to the door, (open it,) pull the driver out, sit.
  await expect.poll(async () => (await state(page)).carjack.pulled, { timeout: GAME_WAIT, intervals: [100] }).toBe(1);
  await expect.poll(async () => (await state(page)).mode, { timeout: GAME_WAIT, intervals: [100] }).toBe(jacked.kind);
  const seated = await state(page);
  expect(seated.carjack.pending).toBeNull();
  // Getting in did not count again as a plain theft.
  expect(seated.police.lastCrime).toBe("carjacking");
  // The driver is out on foot beside the vehicle, standing, and running off.
  const driver = seated.carjack.lastDriver;
  expect(driver).not.toBeNull();
  const out = (await walkers(page))[driver!]!;
  expect(out.down).toBe(false);
  expect(Math.hypot(out.x - spare!.x, out.z - spare!.z)).toBeLessThan(12);
  await waitGameTime(page, 1);
  const later = (await walkers(page))[driver!]!;
  expect(Math.hypot(later.x - spare!.x, later.z - spare!.z)).toBeGreaterThan(Math.hypot(out.x - spare!.x, out.z - spare!.z));

  // It drives.
  await holdButton(page, "Accelerate", 2500);
  const driven = await state(page);
  expect(Math.hypot(driven.x - seated.x, driven.z - seated.z)).toBeGreaterThan(3);

  // Left behind, it stays parked like any other vehicle (and taking it back is no new crime).
  await holdButton(page, "Brake", 2500);
  await getOut(page);
  const parked = (await state(page)).vehicles.find((v) => v.id === spare!.id)!;
  await waitGameTime(page, 2);
  const still = (await state(page)).vehicles.find((v) => v.id === spare!.id)!;
  expect(Math.hypot(still.x - parked.x, still.z - parked.z)).toBeLessThan(0.3);
  expect((await snapshot(page)).mode).toBe("foot");
});
