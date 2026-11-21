import { describe, expect, it } from "vitest";
import { Casualties, PEDESTRIAN_HIT, hitOutcome, hitPenalty, restingSpot, speedKept, throwDistance, vehicleTouches, type VehicleMotion } from "./PedestrianHits";

/** A hatchback-sized box facing north (-Z) at the origin, going `speed` m/s. */
const car = (speed: number, yaw = 0): VehicleMotion => ({ x: 0, z: 0, yaw, vx: -Math.sin(yaw) * speed, vz: -Math.cos(yaw) * speed, halfWidth: 0.85, halfLength: 2 });

describe("impact speed", () => {
  it("decides the outcome at the documented thresholds", () => {
    expect(hitOutcome(0)).toBeNull();
    expect(hitOutcome(PEDESTRIAN_HIT.minSpeed - 0.01)).toBeNull();
    expect(hitOutcome(PEDESTRIAN_HIT.minSpeed)).toBe("stumble");
    expect(hitOutcome(PEDESTRIAN_HIT.injuredFrom - 0.01)).toBe("stumble");
    expect(hitOutcome(PEDESTRIAN_HIT.injuredFrom)).toBe("injured");
    expect(hitOutcome(PEDESTRIAN_HIT.killedFrom - 0.01)).toBe("injured");
    expect(hitOutcome(PEDESTRIAN_HIT.killedFrom)).toBe("killed");
    expect(hitOutcome(-20)).toBe("killed"); // reversing into someone counts too
  });

  it("uses thresholds in a sensible order and range (about 7, 16 and 45 km/h)", () => {
    expect(PEDESTRIAN_HIT.minSpeed).toBeLessThan(PEDESTRIAN_HIT.injuredFrom);
    expect(PEDESTRIAN_HIT.injuredFrom).toBeLessThan(PEDESTRIAN_HIT.killedFrom);
    expect(PEDESTRIAN_HIT.killedFrom * 3.6).toBeCloseTo(45, 0);
  });
});

describe("penalties", () => {
  it("cost nothing for a stumble, a fine and reputation when injured, more when killed", () => {
    expect(hitPenalty("stumble")).toEqual({ fine: 0, reputation: 0 });
    const injured = hitPenalty("injured");
    const killed = hitPenalty("killed");
    expect(injured.fine).toBeGreaterThan(0);
    expect(injured.reputation).toBeGreaterThan(0);
    expect(killed.fine).toBeGreaterThan(injured.fine);
    expect(killed.reputation).toBeGreaterThan(injured.reputation);
    expect(killed).toEqual({ fine: 5000, reputation: 20 });
    expect(injured).toEqual({ fine: 1500, reputation: 8 });
  });
});

describe("the vehicle", () => {
  it("loses a little speed, more for a light vehicle", () => {
    const hatchback = speedKept(950);
    const bike = speedKept(190);
    expect(hatchback).toBeGreaterThan(0.9);
    expect(hatchback).toBeLessThan(1);
    expect(bike).toBeLessThan(hatchback);
    expect(bike).toBeGreaterThan(0.6);
  });

  it("touches someone in front, beside it or about to be reached, not someone clear of it", () => {
    const v = car(10);
    expect(vehicleTouches(v, 0, -2.2, 0)).toBe(true); // at the bumper
    expect(vehicleTouches(v, 1.1, 0, 0)).toBe(true); // at the side
    expect(vehicleTouches(v, 0, -2.6, 0)).toBe(false);
    expect(vehicleTouches(v, 0, -2.6, 1 / 30)).toBe(true); // reached within the lead time at 10 m/s
    expect(vehicleTouches(v, 1.4, -1, 1 / 30)).toBe(false); // passes beside
    // Turned to face east (yaw -90 degrees): the box is turned too.
    const east = car(10, -Math.PI / 2);
    expect(vehicleTouches(east, 2.2, 0, 0)).toBe(true);
    expect(vehicleTouches(east, 0, -2.2, 0)).toBe(false);
  });

  it("throws people further the faster it goes, up to a limit, and clear of its path", () => {
    expect(throwDistance("stumble", 3)).toBeLessThan(1);
    expect(throwDistance("injured", 6)).toBeLessThan(throwDistance("killed", 14));
    expect(throwDistance("killed", 30)).toBe(PEDESTRIAN_HIT.maxThrow);
    const v = car(14);
    // Hit just right of the middle of the bumper (+X is to the right of north).
    const rest = restingSpot(v, 0.3, -2.3, "killed");
    expect(rest.z).toBeLessThan(-2.3 - 4); // along the direction of travel (north)
    expect(rest.x).toBeGreaterThan(v.halfWidth + PEDESTRIAN_HIT.personRadius); // pushed to their side, out of the path
    expect(Math.hypot(rest.dx, rest.dz)).toBeCloseTo(1, 6);
    expect(rest.distance).toBeCloseTo(Math.hypot(rest.x - 0.3, rest.z + 2.3), 6);
    // And someone left of the middle goes left.
    expect(restingSpot(v, -0.3, -2.3, "injured").x).toBeLessThan(-v.halfWidth);
  });
});

describe("casualties", () => {
  const near = () => 5;
  const far = () => 100;
  const run = (c: Casualties, seconds: number, distance: (id: number) => number) => {
    const changes = [];
    for (let i = 0; i < Math.round(seconds * 60); i++) changes.push(...c.update(1 / 60, distance));
    return changes;
  };

  it("an injured person lies down, gets up after a few seconds, limps, then recovers", () => {
    const c = new Casualties();
    c.hit(3, "injured");
    expect(c.isDown(3)).toBe(true);
    expect(c.canHit(3)).toBe(false);
    expect(run(c, PEDESTRIAN_HIT.injuredDown - 0.1, near)).toEqual([]);
    expect(run(c, 0.2, near)).toEqual([{ id: 3, type: "getsUp" }]);
    expect(c.get(3)?.state).toBe("limping");
    expect(c.isDown(3)).toBe(false);
    expect(c.canHit(3)).toBe(true);
    expect(run(c, PEDESTRIAN_HIT.limpFor + 0.1, near)).toEqual([{ id: 3, type: "recovered" }]);
    expect(c.get(3)).toBeUndefined();
  });

  it("a person who was killed stays, then is removed once the player is away, or after the longest wait", () => {
    const c = new Casualties();
    c.hit(1, "killed");
    c.hit(2, "killed");
    expect(c.isDown(1)).toBe(true);
    // Even with the player far away, not before the minimum stay.
    expect(run(c, PEDESTRIAN_HIT.killedStay - 0.1, far)).toEqual([]);
    // Player nearby: still there.
    expect(run(c, 1, near)).toEqual([]);
    // Player leaves (only person 1 is now far): removed.
    expect(run(c, 0.1, (id) => (id === 1 ? far() : near()))).toEqual([{ id: 1, type: "remove" }]);
    expect(c.get(1)).toBeUndefined();
    // Person 2, with the player standing close all along, goes after the longest wait.
    const changes = run(c, PEDESTRIAN_HIT.killedMax - PEDESTRIAN_HIT.killedStay, near);
    expect(changes).toEqual([{ id: 2, type: "remove" }]);
    expect(c.list()).toEqual([]);
  });

  it("someone who stumbled can't be hit again for a moment, then is forgotten", () => {
    const c = new Casualties();
    c.hit(4, "stumble");
    expect(c.isDown(4)).toBe(false);
    expect(c.canHit(4)).toBe(false);
    expect(run(c, PEDESTRIAN_HIT.stumbleGrace + 0.05, near)).toEqual([]);
    expect(c.get(4)).toBeUndefined();
    expect(c.canHit(4)).toBe(true);
  });

  it("a new hit replaces the old one (a limping person hit again)", () => {
    const c = new Casualties();
    c.hit(5, "injured");
    run(c, PEDESTRIAN_HIT.injuredDown + 0.1, near);
    expect(c.get(5)?.state).toBe("limping");
    c.hit(5, "killed");
    expect(c.get(5)).toMatchObject({ state: "dead", time: 0 });
    c.clear();
    expect(c.list()).toEqual([]);
  });
});
