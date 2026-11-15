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
});
