import { describe, expect, it } from "vitest";
import { CRASH_RULES, THROW_KEEP, THROW_SPREAD, judgeCrash, type CrashInput } from "./crash";
import { VEHICLE_TYPES } from "./specs";

const KMH = 1 / 3.6;
/** Straight north (-Z) at `kmh`, losing all of it in the crash step (a wall dead ahead). */
const wall = (kind: CrashInput["kind"], kmh: number, side: 1 | -1 = -1): CrashInput => ({ kind, impact: kmh * KMH, approach: { x: 0, z: -kmh * KMH }, side });

describe("crash rules", () => {
  it("a bump at town speed does nothing; a firm one only shakes the rider", () => {
    expect(judgeCrash(wall("bike", 12)).type).toBe("none");
    const shaken = judgeCrash(wall("bike", 30));
    expect(shaken.type).toBe("shaken");
    if (shaken.type === "shaken") expect(shaken.damage).toBeGreaterThan(0);
  });

  it("throws a motorbike rider off above 35 km/h, and an auto driver above 30", () => {
    expect(judgeCrash(wall("bike", 34)).type).toBe("shaken");
    expect(judgeCrash(wall("bike", 36)).type).toBe("thrown");
    expect(judgeCrash(wall("auto", 29)).type).toBe("shaken");
    expect(judgeCrash(wall("auto", 31)).type).toBe("thrown");
  });

  it("only the motorbike falls over", () => {
    const bike = judgeCrash(wall("bike", 50));
    const auto = judgeCrash(wall("auto", 45));
    expect(bike.type === "thrown" && bike.topples).toBe(true);
    expect(auto.type === "thrown" && auto.topples).toBe(false);
  });

  it("a car only crunches at moderate speed; near flat out the driver goes through the windscreen", () => {
    const crunch = judgeCrash(wall("car", 60));
    expect(crunch.type).toBe("shaken");
    const out = judgeCrash(wall("car", 78));
    expect(out.type).toBe("thrown");
    if (out.type === "thrown") expect(out.style).toBe("windscreen");
  });

  it("can throw out of every vehicle that can reach the speed, except the bus", () => {
    for (const type of Object.values(VEHICLE_TYPES)) {
      const rule = CRASH_RULES[type.kind];
      if (type.kind === "bus") expect(rule.throwFrom).toBeNull();
      else expect(rule.throwFrom!).toBeLessThan(type.physics.maxSpeed * 3.6);
    }
  });

  it("hurts more the harder the hit; a head-on at a closing speed far past the bike's top speed knocks out", () => {
    const damage = (kmh: number) => {
      const out = judgeCrash(wall("bike", kmh));
      return out.type === "none" ? 0 : out.damage;
    };
    expect(damage(40)).toBeLessThan(damage(60));
    expect(damage(60)).toBeLessThan(damage(90));
    // Flat out into a wall hurts badly but is survivable from full health.
    expect(damage(94)).toBeGreaterThan(50);
    expect(damage(94)).toBeLessThan(100);
    expect(damage(140)).toBe(100);
  });

  it("the body carries the vehicle's speed forwards, off to the chosen side, and up", () => {
    const left = judgeCrash(wall("bike", 60, -1));
    const right = judgeCrash(wall("bike", 60, 1));
    if (left.type !== "thrown" || right.type !== "thrown") throw new Error("expected a throw");
    const flat = Math.hypot(left.launch.x, left.launch.z);
    expect(flat).toBeCloseTo(60 * KMH * THROW_KEEP, 5);
    // Mostly forwards (north, -Z)...
    expect(-left.launch.z / flat).toBeCloseTo(Math.cos(THROW_SPREAD), 5);
    // ...and to the side asked for: west (-X) is left when facing north.
    expect(left.launch.x).toBeLessThan(0);
    expect(right.launch.x).toBeGreaterThan(0);
    expect(left.launch.y).toBeGreaterThan(2);
  });
});
