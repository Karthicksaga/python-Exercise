import { describe, expect, it } from "vitest";
import { APPROACH_LIMIT, BOARD_WALK_SPEED, Boarding, DOOR_CLOSE_TIME, DOOR_OPEN_TIME, PULL_TIME, SIT_TIME, SWING_TIME, alongPath, approachPath, ease, pathLength, type BoardingEvent } from "./Boarding";
import { VEHICLE_TYPES, type VehicleKind } from "./specs";

/** Run a sequence to its end in steps of `dt`, recording each phase seen, the door and every event. */
function run(boarding: Boarding, dt = 1 / 60) {
  const phases: string[] = [];
  const events: Array<{ t: number; event: BoardingEvent }> = [];
  const doors: number[] = [];
  let t = 0;
  for (let i = 0; i < 2000 && !boarding.done; i++) {
    if (phases[phases.length - 1] !== boarding.phase) phases.push(boarding.phase);
    doors.push(boarding.door);
    t += dt;
    for (const event of boarding.step(dt)) events.push({ t, event });
  }
  return { phases, events, doors, t };
}

describe("Boarding: getting in", () => {
  const car = VEHICLE_TYPES.car.entry;

  it("walks, opens the door, sits and closes it, with the timings asked for", () => {
    const boarding = new Boarding("in", car, 2.1);
    expect(boarding.durationOf("approach")).toBeCloseTo(2.1 / BOARD_WALK_SPEED, 5);
    expect(boarding.durationOf("open")).toBe(DOOR_OPEN_TIME);
    expect(boarding.durationOf("sit")).toBe(SIT_TIME);
    expect(boarding.durationOf("close")).toBe(DOOR_CLOSE_TIME);
    const { phases, events, t } = run(boarding);
    expect(phases).toEqual(["approach", "open", "sit", "close"]);
    expect(events.map((e) => e.event)).toEqual(["doorOpening", "seated", "shut", "done"]);
    expect(t).toBeCloseTo(boarding.duration, 1);
    // The slam comes at the very end, after the seat.
    expect(events.find((e) => e.event === "shut")!.t).toBeGreaterThan(events.find((e) => e.event === "seated")!.t + DOOR_CLOSE_TIME - 0.05);
  });

  it("taking a vehicle from its driver: the door opens, the driver is pulled out, then the player sits", () => {
    const boarding = new Boarding("in", car, 1.4, 0, true);
    expect(boarding.durationOf("pull")).toBe(PULL_TIME);
    const { phases, events, doors } = run(boarding);
    expect(phases).toEqual(["approach", "open", "pull", "sit", "close"]);
    expect(events.map((e) => e.event)).toEqual(["doorOpening", "pulled", "seated", "shut", "done"]);
    // The door stays wide open while the driver is dragged out.
    expect(Math.max(...doors)).toBe(1);
    // Doorless vehicles (motorbike, auto) go straight from the walk to the pull.
    const bike = run(new Boarding("in", VEHICLE_TYPES.bike.entry, 1.4, 0, true));
    expect(bike.phases).toEqual(["approach", "pull", "sit"]);
    expect(bike.events.map((e) => e.event)).toEqual(["pulled", "seated", "done"]);
  });

  it("hurries a long walk: never more than the limit", () => {
    expect(new Boarding("in", car, 30).durationOf("approach")).toBe(APPROACH_LIMIT);
    // Standing at the door already: no walk at all.
    const there = new Boarding("in", car, 0);
    expect(there.phase).toBe("open");
    expect(run(there).events[0]!.event).toBe("doorOpening");
  });

  it("moves the door smoothly from shut to open and back", () => {
    const boarding = new Boarding("in", car, 1);
    const { doors } = run(boarding, 1 / 120);
    expect(Math.max(...doors)).toBe(1);
    expect(doors[0]).toBe(0);
    for (let i = 1; i < doors.length; i++) expect(Math.abs(doors[i]! - doors[i - 1]!)).toBeLessThan(0.06);
    expect(boarding.door).toBe(0);
  });

  it("reports progress, the walk and the seat blend", () => {
    const boarding = new Boarding("in", car, 1.4);
    expect(boarding.progress).toBe(0);
    expect(boarding.walk).toBe(0);
    boarding.step(0.5);
    expect(boarding.walk).toBeCloseTo(0.5, 5);
    expect(boarding.seated).toBe(0);
    boarding.step(0.5 + DOOR_OPEN_TIME + SIT_TIME / 2);
    expect(boarding.phase).toBe("sit");
    expect(boarding.seated).toBeCloseTo(0.5, 5);
    expect(boarding.door).toBe(1);
    expect(boarding.progress).toBeGreaterThan(0.5);
    boarding.step(10);
    expect(boarding.done).toBe(true);
    expect(boarding.progress).toBe(1);
    expect(boarding.seated).toBe(1);
  });

  it.each([["auto", SIT_TIME], ["bike", SWING_TIME]] as const)("%s: no door, straight onto the seat", (kind, sit) => {
    const boarding = new Boarding("in", VEHICLE_TYPES[kind].entry, 1);
    const { phases, events, doors } = run(boarding);
    expect(phases).toEqual(["approach", "sit"]);
    expect(boarding.durationOf("sit")).toBe(sit);
    expect(events.map((e) => e.event)).toEqual(["seated", "done"]);
    expect(Math.max(...doors)).toBe(0);
  });

  it("bus: up the step and along the floor between the door and the seat", () => {
    const boarding = new Boarding("in", VEHICLE_TYPES.bus.entry, 1, 1.4);
    expect(run(boarding).phases).toEqual(["approach", "open", "climb", "sit", "close"]);
  });
});

describe("Boarding: getting out", () => {
  it("opens, stands up, gives control back, then shuts the door behind", () => {
    const boarding = new Boarding("out", VEHICLE_TYPES.car.entry);
    expect(boarding.seated).toBe(1);
    expect(boarding.free).toBe(false);
    const { phases, events } = run(boarding);
    expect(phases).toEqual(["open", "stand", "close"]);
    expect(events.map((e) => e.event)).toEqual(["doorOpening", "free", "shut", "done"]);
    expect(boarding.seated).toBe(0);
    expect(boarding.free).toBe(true);
  });

  it("bus: stands, walks back to the door, then is free", () => {
    const boarding = new Boarding("out", VEHICLE_TYPES.bus.entry, 0, 1.4);
    const seen: Array<[string, number]> = [];
    while (!boarding.done) {
      seen.push([boarding.phase, boarding.aisle]);
      boarding.step(0.05);
    }
    expect([...new Set(seen.map(([p]) => p))]).toEqual(["open", "stand", "out", "close"]);
    // The aisle runs back from the seat end (1) to the door (0).
    const out = seen.filter(([p]) => p === "out").map(([, a]) => a);
    expect(out[0]).toBeGreaterThan(out[out.length - 1]!);
  });

  it("motorbike: just stands up", () => {
    const boarding = new Boarding("out", VEHICLE_TYPES.bike.entry);
    const { phases, events } = run(boarding);
    expect(phases).toEqual(["stand"]);
    expect(events.map((e) => e.event)).toEqual(["free", "done"]);
  });
});

describe("approachPath", () => {
  /** True if a segment comes within `clear` metres of the body's box. */
  const touches = (path: ReturnType<typeof approachPath>, half: { x: number; z: number }, clear: number) => {
    for (let i = 1; i < path.length; i++) {
      for (let k = 0; k <= 50; k++) {
        const t = k / 50;
        const x = path[i - 1]!.x + (path[i]!.x - path[i - 1]!.x) * t;
        const z = path[i - 1]!.z + (path[i]!.z - path[i - 1]!.z) * t;
        if (Math.abs(x) < half.x + clear && Math.abs(z) < half.z + clear) return true;
      }
    }
    return false;
  };

  it.each(Object.keys(VEHICLE_TYPES) as VehicleKind[])("%s: goes round the body from every side, never through it", (kind) => {
    const type = VEHICLE_TYPES[kind];
    const half = type.physics.halfExtents;
    for (let a = 0; a < 16; a++) {
      const angle = (a / 16) * Math.PI * 2;
      const r = Math.max(half.x, half.z) + 1.2;
      const from = { x: Math.cos(angle) * Math.max(r * 0.6, half.x + 0.9), z: Math.sin(angle) * r };
      const path = approachPath(from, type.entry, half);
      expect(path[0]).toEqual(from);
      expect(path[path.length - 1]).toEqual(type.entry.point);
      // The entry point itself is beside the door, so only the legs before the last are checked tightly.
      expect(touches(path.slice(0, -1), half, 0.3), `${kind} from ${from.x.toFixed(1)}, ${from.z.toFixed(1)}`).toBe(false);
    }
  });

  it("is a straight line from the door's side", () => {
    const path = approachPath({ x: 2.5, z: 1 }, VEHICLE_TYPES.car.entry, VEHICLE_TYPES.car.physics.halfExtents);
    expect(path).toHaveLength(2);
  });

  it("measures and walks a path", () => {
    const path = [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: -4 }];
    expect(pathLength(path)).toBe(7);
    const mid = alongPath(path, 5 / 7);
    expect(mid.x).toBeCloseTo(3);
    expect(mid.z).toBeCloseTo(-2);
    // Walking towards -Z faces heading 0; towards +X faces -π/2.
    expect(mid.heading).toBeCloseTo(0);
    expect(alongPath(path, 0.1).heading).toBeCloseTo(-Math.PI / 2);
  });
});

describe("entry data", () => {
  it.each(Object.keys(VEHICLE_TYPES) as VehicleKind[])("%s: the entry point is outside the body on its side, the seat inside", (kind) => {
    const { entry, physics, driver } = VEHICLE_TYPES[kind];
    expect(entry.point.x * entry.side).toBeGreaterThan(physics.halfExtents.x);
    expect(Math.abs(entry.point.z)).toBeLessThan(physics.halfExtents.z);
    expect(Math.abs(driver.x)).toBeLessThan(physics.halfExtents.x);
  });

  it("puts car and ambulance drivers in on the right and the bus driver through the kerb-side door", () => {
    expect(VEHICLE_TYPES.car.entry.side).toBe(1);
    expect(VEHICLE_TYPES.ambulance.entry.side).toBe(1);
    expect(VEHICLE_TYPES.bus.entry.side).toBe(-1);
    expect(VEHICLE_TYPES.bus.entry.door).toBe("folding");
    expect(VEHICLE_TYPES.auto.entry.door).toBe("none");
  });

  it("eases from 0 to 1", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBe(0.5);
    expect(ease(2)).toBe(1);
  });
});
