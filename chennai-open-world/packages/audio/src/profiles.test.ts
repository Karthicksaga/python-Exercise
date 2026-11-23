import { describe, expect, it } from "vitest";
import { ENGINES, HORNS, VEHICLE_SOUND_KINDS, cityLevel, engineRpm, firingHz, honkChance, place, soundKind, stepInterval, wildlife } from "./profiles";

describe("engines", () => {
  it("each vehicle idles on its own note, from the auto's slow putt to the six-cylinder bus", () => {
    const idle = Object.fromEntries(VEHICLE_SOUND_KINDS.map((kind) => [kind, firingHz(ENGINES[kind], ENGINES[kind].idleRpm)]));
    expect(idle.car).toBeCloseTo(26.7, 1); // 800 rpm, four cylinders
    expect(idle.bus).toBeCloseTo(32.5, 1); // 650 rpm, six cylinders
    expect(idle.auto).toBeCloseTo(11.25, 1); // a single: individual putts you can count
    expect(idle.bike).toBeLessThan(15);
    // No two engines share a note within 10 % at idle or near the change point.
    for (const at of ["idleRpm", "shiftRpm"] as const) {
      const notes = VEHICLE_SOUND_KINDS.map((kind) => firingHz(ENGINES[kind], ENGINES[kind][at]));
      for (let i = 0; i < notes.length; i++) for (let j = i + 1; j < notes.length; j++) expect(Math.abs(notes[i]! - notes[j]!) / Math.max(notes[i]!, notes[j]!)).toBeGreaterThan(0.1);
    }
  });

  it("revs climb through each gear and drop at the change, never below idle", () => {
    for (const kind of VEHICLE_SOUND_KINDS) {
      const engine = ENGINES[kind];
      let previous = engineRpm(engine, 0.5, 1);
      let drops = 0;
      for (let speed = 0.6; speed <= engine.topSpeed; speed += 0.05) {
        const rpm = engineRpm(engine, speed, 1);
        expect(rpm).toBeGreaterThanOrEqual(engine.idleRpm * 0.94);
        if (rpm < previous - 50) drops++;
        previous = rpm;
      }
      expect(drops).toBe(engine.gears - 1);
    }
  });

  it("revs freely at a standstill with the accelerator down, and idles without it", () => {
    const car = ENGINES.car;
    expect(engineRpm(car, 0, 0)).toBe(car.idleRpm);
    expect(engineRpm(car, 0, 1)).toBeGreaterThan(car.idleRpm * 2);
    expect(engineRpm(car, 0, 1)).toBeLessThan(car.shiftRpm);
  });
});

describe("horns", () => {
  const lowest = (kind: keyof typeof HORNS) => Math.min(...HORNS[kind].notes.map((n) => n.hz));
  const length = (kind: keyof typeof HORNS) => Math.max(...HORNS[kind].notes.map((n) => n.at + n.length));

  it("no two vehicles share a horn", () => {
    const signature = (kind: keyof typeof HORNS) => HORNS[kind].notes.map((n) => `${n.hz}@${n.at}`).join(",");
    expect(new Set(VEHICLE_SOUND_KINDS.map(signature)).size).toBe(VEHICLE_SOUND_KINDS.length);
  });

  it("the bus's air horn is the lowest and longest; the auto's is the highest, tapped twice", () => {
    for (const kind of VEHICLE_SOUND_KINDS) {
      if (kind !== "bus") expect(lowest("bus")).toBeLessThan(lowest(kind));
      if (kind !== "bus") expect(length("bus")).toBeGreaterThan(length(kind));
      if (kind !== "auto") expect(lowest("auto")).toBeGreaterThan(lowest(kind));
    }
    expect(HORNS.auto.notes.filter((n) => n.at > 0)).toHaveLength(1);
    expect(HORNS.auto.buzz).toBeGreaterThan(0);
    expect(HORNS.bus.attack).toBeGreaterThan(HORNS.car.attack);
  });

  it("unknown traffic kinds sound like a car", () => {
    expect(soundKind("auto")).toBe("auto");
    expect(soundKind("lorry")).toBe("car");
  });
});

describe("placing sounds", () => {
  const facingNorth = { x: 0, z: 0, yaw: 0 }; // forward is -z

  it("is full close by, fades with distance and is silent past the edge", () => {
    expect(place(facingNorth, 0, -3).gain).toBeCloseTo(1, 5);
    const mid = place(facingNorth, 0, -30);
    expect(mid.gain).toBeGreaterThan(0.05);
    expect(mid.gain).toBeLessThan(0.3);
    expect(place(facingNorth, 0, -60).gain).toBe(0);
    expect(place(facingNorth, 0, -10).cutoff).toBeGreaterThan(mid.cutoff);
  });

  it("pans by bearing: east is on the right when facing north, and on the left facing south", () => {
    expect(place(facingNorth, 10, 0).pan).toBeGreaterThan(0.5);
    expect(place(facingNorth, -10, 0).pan).toBeLessThan(-0.5);
    expect(place({ x: 0, z: 0, yaw: Math.PI }, 10, 0).pan).toBeLessThan(-0.5);
    expect(Math.abs(place(facingNorth, 0, -10).pan)).toBeLessThan(0.01);
  });
});

describe("people and the city", () => {
  it("footsteps quicken from a walk to a run", () => {
    expect(stepInterval(1.4)).toBeGreaterThan(0.45);
    expect(stepInterval(1.4)).toBeLessThan(0.6);
    expect(stepInterval(5)).toBeLessThan(stepInterval(1.4));
    expect(stepInterval(5)).toBeGreaterThanOrEqual(0.28);
  });

  it("the city is loudest in the evening rush and quietest before dawn", () => {
    expect(cityLevel(19)).toBeGreaterThan(cityLevel(13));
    expect(cityLevel(13)).toBeGreaterThan(cityLevel(3));
    expect(cityLevel(3)).toBeLessThan(0.15);
  });

  it("the koel sings at dawn, crows by day, crickets at night", () => {
    expect(wildlife(6.3).koel).toBeGreaterThan(0.9);
    expect(wildlife(14).koel).toBeLessThan(0.01);
    expect(wildlife(10).crows).toBeGreaterThan(0.4);
    expect(wildlife(23).crows).toBe(0);
    expect(wildlife(23).crickets).toBe(1);
    expect(wildlife(12).crickets).toBeLessThan(0.01);
  });

  it("stopped traffic honks after a moment, far more in the rush than at 3 am", () => {
    expect(honkChance(19, 0.5)).toBe(0);
    expect(honkChance(19, 4)).toBeGreaterThan(honkChance(3, 4) * 2);
  });
});
