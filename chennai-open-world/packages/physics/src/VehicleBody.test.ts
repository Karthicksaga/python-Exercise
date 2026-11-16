import { describe, expect, it } from "vitest";
import { PhysicsWorld } from "./PhysicsWorld";
import type { VehicleControls, VehicleSpec } from "./VehicleBody";

const CAR: VehicleSpec = {
  halfExtents: { x: 0.85, y: 0.45, z: 2 },
  mass: 900,
  wheels: [
    { x: -0.75, y: -0.2, z: -1.3, radius: 0.33, steers: true, driven: true },
    { x: 0.75, y: -0.2, z: -1.3, radius: 0.33, steers: true, driven: true },
    { x: -0.75, y: -0.2, z: 1.3, radius: 0.33, steers: false, driven: false },
    { x: 0.75, y: -0.2, z: 1.3, radius: 0.33, steers: false, driven: false },
  ],
  engineForce: 5200,
  maxSpeed: 22,
  maxSteer: 0.55,
  brakeForce: 90,
};

/** The test car with rear tyres that let go in fast, hard corners. */
const DRIFTER: VehicleSpec = { ...CAR, drift: 0.55 };

/** Two wheels in line and no `drift`, like the game's motorbike. */
const BIKE: VehicleSpec = {
  halfExtents: { x: 0.32, y: 0.36, z: 1.0 },
  mass: 190,
  wheels: [
    { x: 0, y: -0.02, z: -0.72, radius: 0.3, steers: true, driven: false },
    { x: 0, y: -0.02, z: 0.68, radius: 0.3, steers: false, driven: true },
  ],
  engineForce: 1500,
  maxSpeed: 26,
  maxSteer: 0.55,
  brakeForce: 28,
};

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * A vehicle on a large flat plane, with a recorder of what happens each step: the sideways
 * slide of the rear axle (radians), `drifting()`, and the biggest change of velocity in one
 * step (what `Vehicle` treats as a crash above 1.6 m/s).
 */
async function track(spec: VehicleSpec) {
  const physics = await PhysicsWorld.create();
  physics.createStaticGroup().addBox({ x: 0, y: -0.5, z: 0, hx: 800, hy: 0.5, hz: 800, yaw: 0 });
  const car = physics.createVehicle(spec, { x: 0, y: 0.9, z: 600 }, 0);
  const rearAxle = spec.wheels.filter((w) => !w.steers).reduce((sum, w, _, all) => sum + w.z / all.length, 0);
  const record = { slip: 0, drifting: 0, jolt: 0 };
  let last = car.planarVelocity();
  let lastYaw = car.yaw();
  const run = (controls: VehicleControls, seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      car.drive(controls, 1 / 60);
      physics.step(1 / 60);
      const v = car.planarVelocity();
      const yaw = car.yaw();
      const yawRate = wrap(yaw - lastYaw) * 60;
      const right = v.x * Math.cos(yaw) - v.z * Math.sin(yaw) + yawRate * rearAxle;
      record.slip = Math.max(record.slip, Math.abs(Math.atan2(right, Math.abs(car.forwardSpeed()))));
      record.drifting = Math.max(record.drifting, car.drifting());
      record.jolt = Math.max(record.jolt, Math.hypot(v.x - last.x, v.z - last.z));
      last = v;
      lastYaw = yaw;
    }
  };
  /** Forget the peaks so far (after the run-up). */
  const reset = () => Object.assign(record, { slip: 0, drifting: 0, jolt: 0 });
  /** Full throttle in a straight line until `share` of top speed. */
  const runUp = (share: number) => {
    for (let i = 0; i < 900 && car.forwardSpeed() < spec.maxSpeed * share; i++) run({ throttle: 1, steer: 0, brake: 0 }, 1 / 60);
    reset();
  };
  return { car, run, runUp, record, reset };
}

async function world() {
  const physics = await PhysicsWorld.create();
  const ground = physics.createStaticGroup();
  ground.addBox({ x: 0, y: -0.5, z: 0, hx: 120, hy: 0.5, hz: 120, yaw: 0 });
  const car = physics.createVehicle(CAR, { x: 0, y: 1, z: 0 }, 0);
  const run = (controls: VehicleControls, seconds: number) => {
    for (let i = 0; i < seconds * 60; i++) {
      car.drive(controls, 1 / 60);
      physics.step(1 / 60);
    }
  };
  return { car, run };
}

describe("VehicleBody", () => {
  it("settles on its wheels and stays put with no input", async () => {
    const { car, run } = await world();
    run({ throttle: 0, steer: 0, brake: 0 }, 2);
    const p = car.position();
    expect(p.y).toBeGreaterThan(0.5);
    expect(p.y).toBeLessThan(1.1);
    expect(Math.hypot(p.x, p.z)).toBeLessThan(0.2);
  });

  it("accelerates forwards (towards -Z) and respects its top speed", async () => {
    const { car, run } = await world();
    run({ throttle: 1, steer: 0, brake: 0 }, 3);
    expect(car.position().z).toBeLessThan(-10);
    expect(car.forwardSpeed()).toBeGreaterThan(8);
    run({ throttle: 1, steer: 0, brake: 0 }, 5);
    expect(car.forwardSpeed()).toBeLessThanOrEqual(CAR.maxSpeed + 0.5);
  });

  it("brakes to a stop and reverses", async () => {
    const { car, run } = await world();
    run({ throttle: 1, steer: 0, brake: 0 }, 2);
    run({ throttle: 0, steer: 0, brake: 1 }, 3);
    expect(Math.abs(car.forwardSpeed())).toBeLessThan(0.5);
    const z = car.position().z;
    run({ throttle: -1, steer: 0, brake: 0 }, 2);
    expect(car.position().z).toBeGreaterThan(z + 1);
    expect(car.forwardSpeed()).toBeLessThan(0);
  });

  it("steering right turns the heading clockwise and moves the car east", async () => {
    const { car, run } = await world();
    run({ throttle: 0.7, steer: 1, brake: 0 }, 2.5);
    expect(car.yaw()).toBeLessThan(-0.3);
    expect(car.position().x).toBeGreaterThan(1);
  });

  it("drifts at high speed on full lock: the tail steps out and the car turns faster than with full grip", async () => {
    const corner = async (spec: VehicleSpec) => {
      const t = await track(spec);
      t.runUp(0.9);
      const yaw = t.car.yaw();
      t.run({ throttle: 1, steer: 1, brake: 0 }, 1.1);
      return { ...t, turned: wrap(t.car.yaw() - yaw) };
    };
    const grip = await corner(CAR);
    const drift = await corner(DRIFTER);
    expect(grip.record.slip).toBeLessThan(0.1);
    expect(grip.car.drifting()).toBeLessThan(0.1);
    expect(drift.record.slip).toBeGreaterThan(0.25);
    expect(drift.record.drifting).toBeGreaterThan(0.8);
    expect(drift.turned).toBeLessThan(grip.turned - 0.15); // more clockwise rotation
    // Still believable: no spin. The slide stays under about 35 degrees.
    expect(drift.record.slip).toBeLessThan(0.62);
  });

  it("does not drift at low speed or with gentle steering", async () => {
    const slow = await track(DRIFTER);
    slow.runUp(0.4);
    slow.run({ throttle: 0.5, steer: 1, brake: 0 }, 2);
    expect(slow.record.drifting).toBeLessThan(0.05);
    expect(slow.record.slip).toBeLessThan(0.1);

    const gentle = await track(DRIFTER);
    gentle.runUp(0.9);
    gentle.run({ throttle: 1, steer: 0.45, brake: 0 }, 2);
    expect(gentle.record.drifting).toBeLessThan(0.05);
  });

  it("a countersteer catches the slide, and the car grips again once straight", async () => {
    const t = await track(DRIFTER);
    t.runUp(0.9);
    t.run({ throttle: 1, steer: 1, brake: 0 }, 1);
    expect(t.car.drifting()).toBeGreaterThan(0.8);
    t.run({ throttle: 1, steer: -1, brake: 0 }, 0.5);
    t.run({ throttle: 1, steer: 0, brake: 0 }, 0.5);
    expect(t.car.drifting()).toBeLessThan(0.1);
    // Caught, not spun: it kept most of its speed and now drives straight.
    expect(t.car.forwardSpeed()).toBeGreaterThan(CAR.maxSpeed * 0.5);
    const yaw = t.car.yaw();
    t.run({ throttle: 1, steer: 0, brake: 0 }, 1);
    expect(Math.abs(wrap(t.car.yaw() - yaw))).toBeLessThan(0.05);
  });

  it("a two-wheeler never drifts, even after a flick of full lock at top speed", async () => {
    const t = await track(BIKE);
    t.runUp(0.9);
    t.run({ throttle: 1, steer: 1, brake: 0 }, 1);
    t.run({ throttle: 1, steer: -1, brake: 0 }, 0.5);
    t.run({ throttle: 1, steer: 0, brake: 0 }, 0.3);
    expect(t.record.drifting).toBeLessThan(0.15);
    expect(t.record.slip).toBeLessThan(0.12);
    // Stick centred: it rides on in a straight line instead of yawing on by itself.
    const yaw = t.car.yaw();
    t.run({ throttle: 1, steer: 0, brake: 0 }, 1);
    expect(Math.abs(wrap(t.car.yaw() - yaw))).toBeLessThan(0.1);
  });

  it("drifting and hard braking never look like a crash (no big change of velocity in one step)", async () => {
    for (const spec of [DRIFTER, BIKE]) {
      const t = await track(spec);
      t.runUp(0.9);
      t.run({ throttle: 1, steer: 1, brake: 0 }, 1);
      t.run({ throttle: 0, steer: 1, brake: 1 }, 3);
      expect(Math.abs(t.car.forwardSpeed())).toBeLessThan(0.5);
      expect(t.record.jolt).toBeLessThan(0.8); // Vehicle counts 1.6 m/s as an impact
    }
  });
});
