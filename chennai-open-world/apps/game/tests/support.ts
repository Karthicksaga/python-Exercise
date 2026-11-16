/** Shared helpers for the browser tests: read the game's state and drive the touch controls. */
import { expect, type Page } from "@playwright/test";

export interface Snapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  cameraYaw: number;
  cameraPitch: number;
  grounded: boolean;
  speed: number;
  paused: boolean;
  drawCalls: number;
  triangles: number;
  mode: "foot" | "car" | "auto" | "bike";
  money: number;
  mission: string | null;
  objective: string | null;
  target: { x: number; z: number } | null;
  chunksLoaded: number;
  chunkKeys: string[];
  street: string;
  vehicles: Array<{ id: string; kind: string; x: number; z: number }>;
  traffic: Array<{ x: number; z: number; speed: number }>;
  pedestrians: number;
}

interface DebugHandle {
  snapshot(): Snapshot;
  teleport(x: number, z: number, yaw?: number): Promise<void>;
  probe(x: number, z: number, dx: number, dz: number, max: number): number | null;
}
const handle = () => (window as unknown as { __cow: DebugHandle }).__cow;

export const snapshot = (page: Page) => page.evaluate(() => (window as unknown as { __cow: DebugHandle }).__cow.snapshot());

export async function teleport(page: Page, x: number, z: number, yaw = 0): Promise<void> {
  await page.evaluate(([px, pz, pyaw]) => (window as unknown as { __cow: DebugHandle }).__cow.teleport(px!, pz!, pyaw), [x, z, yaw]);
  await page.waitForTimeout(250);
}

export const probe = (page: Page, x: number, z: number, dx: number, dz: number, max: number) =>
  page.evaluate(([px, pz, pdx, pdz, pmax]) => (window as unknown as { __cow: DebugHandle }).__cow.probe(px!, pz!, pdx!, pdz!, pmax!), [x, z, dx, dz, max]);

/** Open the game with a clean save and wait until it is playable. Fails on any page error. */
export async function ready(page: Page, keepSave = false): Promise<void> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?quality=lite");
  if (!keepSave) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  }
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  expect(errors).toEqual([]);
}

/** Hold the joystick at an offset from where the finger first touched, for `ms`. */
export async function holdStick(page: Page, dx: number, dy: number, ms: number): Promise<void> {
  const zone = page.getByTestId("move-zone");
  const start = { x: 150, y: 260 };
  const pointer = { pointerId: 11, pointerType: "touch", isPrimary: true, bubbles: true };
  await zone.dispatchEvent("pointerdown", { ...pointer, clientX: start.x, clientY: start.y });
  await zone.dispatchEvent("pointermove", { ...pointer, clientX: start.x + dx, clientY: start.y + dy });
  await page.waitForTimeout(ms);
  await zone.dispatchEvent("pointerup", { ...pointer, clientX: start.x + dx, clientY: start.y + dy });
}

export async function dragLook(page: Page, dx: number, dy: number): Promise<void> {
  const zone = page.getByTestId("look-zone");
  const pointer = { pointerId: 22, pointerType: "touch", isPrimary: true, bubbles: true };
  await zone.dispatchEvent("pointerdown", { ...pointer, clientX: 600, clientY: 200 });
  for (let i = 1; i <= 5; i++) {
    await zone.dispatchEvent("pointermove", { ...pointer, clientX: 600 + (dx * i) / 5, clientY: 200 + (dy * i) / 5 });
  }
  await zone.dispatchEvent("pointerup", { ...pointer, clientX: 600 + dx, clientY: 200 + dy });
  await page.waitForTimeout(150);
}

/** Press and hold an on-screen button for `ms`. */
export async function holdButton(page: Page, name: string, ms: number, pointerId = 31): Promise<void> {
  const button = page.getByRole("button", { name, exact: true });
  await button.dispatchEvent("pointerdown", { pointerId, pointerType: "touch" });
  await page.waitForTimeout(ms);
  await button.dispatchEvent("pointerup", { pointerId, pointerType: "touch" });
}

/** Tap a button that may relabel or hide itself when pressed (the get in / get out button). */
export async function tapButton(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name, exact: true }).dispatchEvent("pointerdown", { pointerId: 41, pointerType: "touch" });
  await page.waitForTimeout(120);
}

/** Stand next to a parked vehicle and get in. */
export async function board(page: Page, id: string): Promise<void> {
  const vehicle = (await snapshot(page)).vehicles.find((v) => v.id === id);
  if (!vehicle) throw new Error(`No vehicle ${id}`);
  await teleport(page, vehicle.x + 2, vehicle.z);
  await expect(page.getByRole("button", { name: "Get in", exact: true })).toBeVisible();
  await tapButton(page, "Get in");
  await expect(page.getByRole("button", { name: "Accelerate", exact: true })).toBeVisible();
}

export { handle };
