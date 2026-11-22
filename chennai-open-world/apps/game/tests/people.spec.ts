/**
 * The city's people come from the people manifest (`@cow/player` `people.ts`): pedestrians are
 * several different people (never children: they can be run over), autos and cars are driven by
 * their roles' people, police officers are police people (or an adult man in a khaki stand-in),
 * and every figure stands on the ground: soles within a few centimetres of it while idle,
 * walking or running. Works with any manifest of the schema (the fixture or the real one).
 */
import { expect, test, type Page } from "@playwright/test";
import { ready, snapshot, waitGameTime } from "./support";

interface Entry {
  id: string;
  sex: "male" | "female";
  age: "child" | "teen" | "young" | "middle" | "elderly";
  roles: string[];
}
interface People {
  fixture: boolean | null;
  manifest: Entry[];
  loaded: string[];
  pedestrians: Array<{ person: string | null; x: number; z: number; speed: number; visible: boolean; detail: 0 | 1; down: boolean; feet: number | null }>;
  drivers: Array<{ kind: string; person: string | null; active: boolean }>;
  enemies: Array<{ group: string; person: string | null; wanted: string | null; speed: number; feet: number | null }>;
  player: { feet: number | null; speed: number; grounded: boolean };
}
const people = (page: Page) => page.evaluate(() => (window as unknown as { __cow: { people(): unknown } }).__cow.people()) as Promise<People>;
const minor = (e: Entry | undefined) => e !== undefined && (e.age === "child" || e.age === "teen");
/**
 * How far soles may be off the ground (metres). Standing and walking: always within this (the
 * clips turn the joints only, so the hips don't dip with a bent stance knee and the stance foot
 * can lift a little). Never sunk below it. Running has a moment with both feet in the air
 * (`FLIGHT` at most), but touches down within `FEET` each stride.
 */
const FEET = 0.05;
const FLIGHT = 0.15;

/** Samples of one figure in one gait: no sinking, touching the ground, and in the air only while running. */
function footProblems(samples: ReadonlyArray<{ who: string; feet: number }>): string[] {
  const groups = new Map<string, number[]>();
  for (const { who, feet } of samples) groups.set(who, [...(groups.get(who) ?? []), feet]);
  const problems: string[] = [];
  for (const [who, list] of groups) {
    const low = Math.min(...list);
    const high = Math.max(...list);
    const running = / running/.test(who);
    if (low < -FEET) problems.push(`${who}: sunk ${low.toFixed(3)} m`);
    if (running ? low > FEET || high > FLIGHT : high > FEET) problems.push(`${who}: off the ground ${low.toFixed(3)}..${high.toFixed(3)} m`);
  }
  return problems;
}

test("pedestrians are several different people, never children; drivers are cast by role", async ({ page }) => {
  await ready(page);
  await waitGameTime(page, 2);
  const p = await people(page);
  expect(p.manifest.length).toBeGreaterThan(1);
  const byId = new Map(p.manifest.map((e) => [e.id, e]));
  const walkers = p.pedestrians.map((w) => w.person);
  // Everyone is a manifest person (no copies of the player's model left on the street) ...
  expect(walkers.every((id) => id !== null && byId.has(id))).toBe(true);
  // ... several different ones, mixed (consecutive walkers get different people).
  const distinct = new Set(walkers);
  expect(distinct.size).toBeGreaterThanOrEqual(Math.min(4, p.manifest.filter((e) => e.roles.includes("pedestrian") && !minor(e)).length));
  // Nobody who can be run over is a child or a teenager.
  expect(walkers.some((id) => minor(byId.get(id!)))).toBe(false);

  const hasRole = (role: string) => p.manifest.some((e) => e.roles.includes(role) && !minor(e));
  for (const d of p.drivers) {
    const e = d.person ? byId.get(d.person) : undefined;
    expect(e, `${d.kind} driver`).toBeDefined();
    expect(minor(e)).toBe(false);
    if (d.kind === "auto") {
      // Auto drivers: "auto-driver" people, or an adult man standing in (in a khaki tint).
      if (hasRole("auto-driver")) expect(e!.roles).toContain("auto-driver");
      else expect(e!.sex).toBe("male");
    } else if (hasRole("cab-driver")) {
      expect(e!.roles).toContain("cab-driver");
    }
  }
  // The people the street needs are loaded at the start.
  expect(p.loaded.length).toBeGreaterThan(0);

  // Walkers far off show the cheap model (LOD1, beyond about 30 m), near ones the detailed one.
  const at = await snapshot(page);
  const now = await people(page);
  for (const w of now.pedestrians.filter((x) => x.visible)) {
    const d = Math.hypot(w.x - at.x, w.z - at.z);
    if (d < 26) expect(w.detail, `walker at ${d.toFixed(1)} m`).toBe(0);
    if (d > 36) expect(w.detail, `walker at ${d.toFixed(1)} m`).toBe(1);
  }
});

test("figures stand on the ground: walkers, someone standing, and the player idle, walking and running", async ({ page }) => {
  await ready(page);
  await waitGameTime(page, 2);
  const s = await snapshot(page);
  // Someone standing still near the player, and the walkers round them.
  const staged = await page.evaluate(([x, z]) => (window as unknown as { __cow: { stagePedestrian(x: number, z: number, h: number): boolean } }).__cow.stagePedestrian(x! + 3, z! - 4, 0), [s.x, s.z]);
  expect(staged).toBe(true);
  await waitGameTime(page, 1.5);
  const samples: Array<{ who: string; feet: number }> = [];
  for (let i = 0; i < 8; i++) {
    const p = await people(page);
    for (const [i, w] of p.pedestrians.entries()) if (w.feet !== null) samples.push({ who: `pedestrian ${i} (${w.person}) ${w.speed > 3.2 ? "running" : w.speed > 0.25 ? "walking" : "standing"}`, feet: w.feet });
    if (p.player.feet !== null) samples.push({ who: "player idle", feet: p.player.feet });
    await waitGameTime(page, 0.37);
  }
  // Walkers at walking pace were sampled, and someone standing.
  expect(samples.some((x) => /pedestrian .* standing/.test(x.who))).toBe(true);
  expect(samples.some((x) => /pedestrian .* walking/.test(x.who))).toBe(true);

  // The player walking, then running (touch stick held, sampled while moving).
  const zone = page.getByTestId("move-zone");
  const pointer = { pointerId: 11, pointerType: "touch", isPrimary: true, bubbles: true };
  for (const [push, label] of [[-30, "walking"], [-80, "running"]] as const) {
    await zone.dispatchEvent("pointerdown", { ...pointer, clientX: 150, clientY: 260 });
    await zone.dispatchEvent("pointermove", { ...pointer, clientX: 150, clientY: 260 + push });
    await waitGameTime(page, 1.2);
    for (let i = 0; i < 8; i++) {
      const p = await people(page);
      // Running: only well past the walk-to-run blend (a fifth of a second in which the two clips mix).
      if (p.player.feet !== null && p.player.grounded && p.player.speed > (label === "running" ? 4 : 0.5)) samples.push({ who: `player ${label}`, feet: p.player.feet });
      await waitGameTime(page, 0.13);
    }
    await zone.dispatchEvent("pointerup", { ...pointer, clientX: 150, clientY: 260 + push });
    await waitGameTime(page, 0.5);
  }
  expect(samples.some((x) => /player running/.test(x.who))).toBe(true);
  expect(samples.some((x) => /player walking/.test(x.who))).toBe(true);
  expect(footProblems(samples)).toEqual([]);
});

test("police officers are police people (or a grown man in a khaki stand-in), standing on the ground", async ({ page }) => {
  test.setTimeout(300_000);
  await ready(page);
  await waitGameTime(page, 1);
  await page.evaluate(() => (window as unknown as { __cow: { setWanted(n: number): void } }).__cow.setWanted(2));
  await expect.poll(async () => (await people(page)).enemies.filter((e) => e.group.startsWith("police")).length, { timeout: 240_000, intervals: [500] }).toBeGreaterThan(0);
  // Give a stand-in time to be swapped for the police person once loaded.
  await waitGameTime(page, 1);
  const p = await people(page);
  const byId = new Map(p.manifest.map((e) => [e.id, e]));
  const hasPolice = p.manifest.some((e) => e.roles.includes("police") || e.roles.includes("traffic-police"));
  for (const officer of p.enemies.filter((e) => e.group.startsWith("police"))) {
    const e = officer.person ? byId.get(officer.person) : undefined;
    expect(e).toBeDefined();
    expect(minor(e)).toBe(false);
    if (hasPolice) expect(e!.roles.some((r) => r === "police" || r === "traffic-police")).toBe(true);
    else expect(e!.sex).toBe("male");
  }
  // Their feet, as they walk or run up to the player and stand there.
  const samples: Array<{ who: string; feet: number }> = [];
  for (let i = 0; i < 12; i++) {
    for (const [k, o] of (await people(page)).enemies.entries()) if (o.feet !== null && o.group.startsWith("police")) samples.push({ who: `officer ${k} ${o.speed > 3.2 ? "running" : o.speed > 0.25 ? "walking" : "standing"}`, feet: o.feet });
    await waitGameTime(page, 0.21);
  }
  expect(samples.length).toBeGreaterThan(0);
  expect(footProblems(samples)).toEqual([]);
});
