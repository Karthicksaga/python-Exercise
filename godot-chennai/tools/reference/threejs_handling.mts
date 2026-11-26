/**
 * Measures the Three.js game's vehicle handling (Rapier raycast vehicle, `VehicleBody.ts`) on a
 * flat plane, so the Godot vehicles can be tested against the same numbers (decision G-71).
 * Read-only use of `chennai-open-world/`: nothing there is changed.
 *
 *   cd chennai-open-world && npx tsx ../godot-chennai/tools/reference/threejs_handling.mts \
 *     > ../godot-chennai/tests/data/threejs_handling.json
 */
import { PhysicsWorld } from "../../../chennai-open-world/packages/physics/src/PhysicsWorld";
import type { VehicleControls, VehicleSpec } from "../../../chennai-open-world/packages/physics/src/VehicleBody";
import { VEHICLE_TYPES } from "../../../chennai-open-world/packages/vehicles/src/specs";

const DT = 1 / 60;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

async function rig(spec: VehicleSpec, rideHeight: number) {
  const physics = await PhysicsWorld.create();
  physics.createStaticGroup().addBox({ x: 0, y: -0.5, z: 0, hx: 1500, hy: 0.5, hz: 1500, yaw: 0 });
  const car = physics.createVehicle(spec, { x: 0, y: rideHeight + 0.1, z: 1200 }, 0);
  const rearAxle = spec.wheels.filter((w) => !w.steers).reduce((s, w, _, all) => s + w.z / all.length, 0);
  const peak = { slip: 0, drifting: 0, jolt: 0 };
  /** Heading change summed step by step (not wrapped), radians. */
  let turned = 0;
  let t = 0;
  let last = car.planarVelocity();
  let lastYaw = car.yaw();
  const step = (c: VehicleControls) => {
    car.drive(c, DT);
    physics.step(DT);
    t += DT;
    const v = car.planarVelocity();
    const yaw = car.yaw();
    const right = v.x * Math.cos(yaw) - v.z * Math.sin(yaw) + wrap(yaw - lastYaw) * 60 * rearAxle;
    peak.slip = Math.max(peak.slip, Math.abs(Math.atan2(right, Math.abs(car.forwardSpeed()))));
    peak.drifting = Math.max(peak.drifting, car.drifting());
    peak.jolt = Math.max(peak.jolt, Math.hypot(v.x - last.x, v.z - last.z));
    turned += wrap(yaw - lastYaw);
    last = v;
    lastYaw = yaw;
  };
  const run = (c: VehicleControls, seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) step(c);
  };
  const reset = () => Object.assign(peak, { slip: 0, drifting: 0, jolt: 0 });
  const runUp = (speed: number) => {
    for (let i = 0; i < 3000 && car.forwardSpeed() < speed; i++) step({ throttle: 1, steer: 0, brake: 0 });
    reset();
  };
  return { car, run, step, runUp, peak, reset, time: () => t, turned: () => turned };
}

const out: Record<string, unknown> = {};
for (const [kind, type] of Object.entries(VEHICLE_TYPES)) {
  const spec = type.physics;
  const r: Record<string, unknown> = { maxSpeed: spec.maxSpeed };
  {
    const a = await rig(spec, type.rideHeight);
    a.run({ throttle: 0, steer: 0, brake: 0 }, 2);
    r.restY = a.car.position().y;
    const samples: Record<string, number> = {};
    const z0 = a.car.position().z;
    let t50 = -1;
    let t90 = -1;
    for (let i = 1; i <= 20 * 60; i++) {
      a.step({ throttle: 1, steer: 0, brake: 0 });
      const s = a.car.forwardSpeed();
      if (t50 < 0 && s >= spec.maxSpeed * 0.5) t50 = i / 60;
      if (t90 < 0 && s >= spec.maxSpeed * 0.9) t90 = i / 60;
      if ([60, 120, 180, 240, 360, 480, 600].includes(i)) samples[String(i / 60)] = s;
      if (i === 180) r.distance3s = z0 - a.car.position().z;
    }
    r.speedAt = samples;
    r.topSpeed = a.car.forwardSpeed();
    r.t50 = t50;
    r.t90 = t90;
    r.joltDriving = a.peak.jolt;
    // Brake from 80% of top speed.
    const b = await rig(spec, type.rideHeight);
    b.run({ throttle: 0, steer: 0, brake: 0 }, 1);
    b.runUp(spec.maxSpeed * 0.8);
    const from = b.car.forwardSpeed();
    const bz = b.car.position().z;
    let bt = 0;
    while (b.car.forwardSpeed() > 0.3 && bt < 30) {
      b.step({ throttle: 0, steer: 0, brake: 1 });
      bt += DT;
    }
    r.brake = { from, time: bt, distance: bz - b.car.position().z, jolt: b.peak.jolt };
    // Coasting for 3 s from 80%.
    const c = await rig(spec, type.rideHeight);
    c.run({ throttle: 0, steer: 0, brake: 0 }, 1);
    c.runUp(spec.maxSpeed * 0.8);
    const cf = c.car.forwardSpeed();
    c.run({ throttle: 0, steer: 0, brake: 0 }, 3);
    r.coast3s = { from: cf, to: c.car.forwardSpeed() };
    // Reverse for 5 s.
    const d = await rig(spec, type.rideHeight);
    d.run({ throttle: 0, steer: 0, brake: 0 }, 1);
    d.run({ throttle: -1, steer: 0, brake: 0 }, 5);
    r.reverse5s = d.car.forwardSpeed();
    // Turn from rest: throttle 0.7, full right, 2.5 s.
    const e = await rig(spec, type.rideHeight);
    e.run({ throttle: 0, steer: 0, brake: 0 }, 1);
    const y0 = e.turned();
    e.run({ throttle: 0.7, steer: 1, brake: 0 }, 2.5);
    r.turn = { yaw: e.turned() - y0, speed: e.car.forwardSpeed(), x: e.car.position().x, drifting: e.peak.drifting };
    // Fast full lock: run up to 90 %, full lock and throttle 1.1 s, then straight.
    const f = await rig(spec, type.rideHeight);
    f.run({ throttle: 0, steer: 0, brake: 0 }, 1);
    f.runUp(spec.maxSpeed * 0.9);
    const fy = f.turned();
    f.run({ throttle: 1, steer: 1, brake: 0 }, 1.1);
    const lock = { yaw: f.turned() - fy, slip: f.peak.slip, drifting: f.peak.drifting, speed: f.car.forwardSpeed(), jolt: f.peak.jolt };
    let rt = 0;
    while (f.car.drifting() >= 0.1 && rt < 5) {
      f.step({ throttle: 1, steer: 0, brake: 0 });
      rt += DT;
    }
    r.fastLock = { ...lock, regripTime: rt };
    // Slow full lock: 40 %, throttle 0.5, 2 s.
    const g = await rig(spec, type.rideHeight);
    g.run({ throttle: 0, steer: 0, brake: 0 }, 1);
    g.runUp(spec.maxSpeed * 0.4);
    g.run({ throttle: 0.5, steer: 1, brake: 0 }, 2);
    r.slowLock = { drifting: g.peak.drifting, slip: g.peak.slip };
  }
  out[kind] = r;
}
console.log(JSON.stringify({ source: "chennai-open-world VehicleBody.ts (Rapier), flat plane, 60 Hz", vehicles: out }, null, 1));
