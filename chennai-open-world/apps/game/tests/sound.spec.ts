/**
 * The sound design: every vehicle has its own engine and horn (checked by rendering them offline
 * and measuring them), and in the game the right voices play: footsteps on foot, the driven
 * vehicle's engine and horn, nearby traffic, the city's background; and SOUND turns it all off.
 */
import { expect, test, type Page } from "@playwright/test";
import { GAME_WAIT, board, getOut, holdButton, holdStick, ready, snapshot, tapButton, teleport } from "./support";

const RATE = 22050;
type Kind = "car" | "auto" | "bike" | "bus" | "ambulance";
const KINDS: Kind[] = ["car", "auto", "bike", "bus", "ambulance"];

/**
 * Firing frequency at idle from `ENGINES` in packages/audio/src/profiles.ts:
 * idle rpm / 60 × cylinders / 2 (all four-strokes).
 */
const IDLE_HZ: Record<Kind, number> = { car: 26.7, auto: 11.25, bike: 13.3, bus: 32.5, ambulance: 22.7 };
/** Horn notes from `HORNS` in the same file. */
const HORN_HZ: Record<Kind, number[]> = { car: [415, 523], auto: [680], bike: [560], bus: [233, 294, 349], ambulance: [392, 494] };

const render = (page: Page, what: "engine" | "horn", kind: Kind, options: { speed?: number; throttle?: number; seconds?: number } = {}) =>
  page.evaluate(([w, k, o]) => (window as unknown as { __cow: { renderSound(w: string, k: string, o: object): Promise<number[]> } }).__cow.renderSound(w, k, o), [what, kind, options] as const);

/** The strongest frequency between `lo` and `hi` Hz (a plain DFT scan). */
function peak(samples: number[], lo: number, hi: number, step: number): number {
  let best = 0;
  let at = lo;
  for (let f = lo; f <= hi; f += step) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * f) / RATE;
    for (let i = 0; i < samples.length; i++) {
      re += samples[i]! * Math.cos(w * i);
      im += samples[i]! * Math.sin(w * i);
    }
    const power = re * re + im * im;
    if (power > best) {
      best = power;
      at = f;
    }
  }
  return at;
}

const rms = (samples: number[]) => Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / Math.max(1, samples.length));
const near = (value: number, target: number, share: number) => Math.abs(value - target) <= target * share;
const audio = async (page: Page) => (await snapshot(page)).audio;

test("each vehicle's engine idles on its own note and revs up when driven", async ({ page }) => {
  await ready(page);
  const idle: Partial<Record<Kind, number>> = {};
  for (const kind of KINDS) {
    // Skip the first half second (the voice fades in).
    const still = (await render(page, "engine", kind, { seconds: 1.5 })).slice(RATE / 2);
    const driven = (await render(page, "engine", kind, { speed: 8, throttle: 1, seconds: 1.5 })).slice(RATE / 2);
    idle[kind] = peak(still, 5, 120, 0.5);
    expect(near(idle[kind]!, IDLE_HZ[kind], 0.08), `${kind} idles at ${idle[kind]} Hz, designed ${IDLE_HZ[kind]}`).toBe(true);
    expect(peak(driven, 5, 250, 0.5)).toBeGreaterThan(idle[kind]! * 2);
    expect(rms(still)).toBeGreaterThan(0.005);
  }
  // No two engines share a note.
  for (const a of KINDS) for (const b of KINDS) if (a < b) expect(Math.abs(idle[a]! - idle[b]!) / Math.max(idle[a]!, idle[b]!), `${a} vs ${b}`).toBeGreaterThan(0.1);
  // The bus is the loudest engine at idle; the small bike the quietest.
  const level = async (kind: Kind) => rms((await render(page, "engine", kind, { seconds: 1.5 })).slice(RATE / 2));
  expect(await level("bus")).toBeGreaterThan(await level("car"));
  expect(await level("bike")).toBeLessThan(await level("bus"));
});

test("each vehicle's horn is its own: notes, and the auto's double tap", async ({ page }) => {
  await ready(page);
  const peaks: number[] = [];
  for (const kind of KINDS) {
    const horn = await render(page, "horn", kind, { seconds: 1 });
    // Measure the held part of the note (after an air horn's scoop).
    const held = horn.slice(Math.round(RATE * 0.04), Math.round(RATE * 0.11));
    const strongest = peak(kind === "bus" ? horn.slice(Math.round(RATE * 0.2), Math.round(RATE * 0.4)) : held, 150, 1100, 1);
    const notes = HORN_HZ[kind];
    // The strongest partial is one of the designed notes or its octave (a sawtooth's second harmonic).
    expect(notes.some((hz) => near(strongest, hz, 0.03) || near(strongest, hz * 2, 0.03)), `${kind} horn peaks at ${strongest} Hz, notes ${notes}`).toBe(true);
    expect(rms(horn)).toBeGreaterThan(0.01);
    peaks.push(strongest);
  }
  expect(new Set(peaks).size).toBe(KINDS.length);
  // "pee-peep": the auto's horn is silent between its two taps.
  const auto = await render(page, "horn", "auto", { seconds: 0.5 });
  const tap = rms(auto.slice(Math.round(RATE * 0.02), Math.round(RATE * 0.1)));
  const gap = rms(auto.slice(Math.round(RATE * 0.135), Math.round(RATE * 0.18)));
  expect(gap).toBeLessThan(tap * 0.1);
  // The bus's air horn lasts longest.
  const length = async (kind: Kind) => {
    const samples = await render(page, "horn", kind, { seconds: 1.2 });
    let last = 0;
    for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]!) > 0.002) last = i;
    return last / RATE;
  };
  expect(await length("bus")).toBeGreaterThan(await length("car"));
});

test("in the game: footsteps, each vehicle's own engine and horn, traffic, the city; SOUND turns it off", async ({ page }) => {
  await ready(page);
  // Browsers start sound only after a real touch.
  await page.touchscreen.tap(700, 200);
  await expect.poll(async () => (await audio(page)).unlocked).toBe(true);

  // Footsteps at a walk.
  await holdStick(page, 0, -60, 1500);
  expect((await audio(page)).played.footstep ?? 0).toBeGreaterThanOrEqual(2);
  expect((await audio(page)).engine).toBeNull();

  const vehicles = (await snapshot(page)).vehicles;
  for (const kind of ["car", "auto"] as const) {
    const vehicle = vehicles.find((v) => v.kind === kind);
    expect(vehicle, `a parked ${kind}`).toBeTruthy();
    await board(page, vehicle!.id);
    await expect.poll(async () => (await audio(page)).engine?.kind, { timeout: GAME_WAIT }).toBe(kind);
    const idle = (await audio(page)).engine!.rpm;
    await holdButton(page, "Accelerate", 1200);
    expect((await audio(page)).engine!.rpm).toBeGreaterThan(idle);
    await tapButton(page, "Horn");
    await expect.poll(async () => (await audio(page)).played[`horn:${kind}`] ?? 0).toBe(1);
    // Stop before getting out (the door does not open on the move).
    await holdButton(page, "Brake", 2500);
    await getOut(page);
    await expect.poll(async () => (await audio(page)).engine).toBeNull();
  }

  // The nearest traffic is heard as its own kind of engine.
  const traffic = (await snapshot(page)).traffic[0];
  expect(traffic, "traffic on the streets").toBeTruthy();
  await teleport(page, traffic!.x + 4, traffic!.z + 4);
  await expect.poll(async () => (await audio(page)).traffic.length, { timeout: GAME_WAIT }).toBeGreaterThan(0);
  for (const voice of (await audio(page)).traffic) expect(["car", "auto", "bike", "bus", "ambulance"]).toContain(voice.kind);
  await expect.poll(async () => (await audio(page)).ambience, { timeout: GAME_WAIT }).toContain("city");

  // SOUND: Off in the pause menu, remembered.
  await page.locator(".cow-pause").tap();
  await page.getByRole("button", { name: "Sound: On", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Sound: Off", exact: true })).toBeVisible();
  expect((await audio(page)).muted).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("cow-sound-v1"))).toBe("off");
});

test("rain and night change the city's sound: rain on the roofs, crickets after dark", async ({ page }) => {
  await page.goto("/?quality=lite&start=play");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("cow-hour-v1", "23");
    localStorage.setItem("cow-weather-v1", "rain");
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await page.touchscreen.tap(700, 200);
  await expect.poll(async () => (await audio(page)).ambience, { timeout: GAME_WAIT }).toContain("rain");
  const night = await audio(page);
  expect(night.ambience).toContain("city");
  // Crickets are quiet under heavy rain but the bed still starts at night.
  await page.evaluate(() => localStorage.setItem("cow-weather-v1", "clear"));
  await page.locator(".cow-pause").tap();
  await page.getByRole("button", { name: "Weather: Rain", exact: true }).tap();
  await page.getByRole("button", { name: "Resume", exact: true }).tap();
  await expect.poll(async () => (await audio(page)).ambience, { timeout: GAME_WAIT }).toContain("crickets");
});
