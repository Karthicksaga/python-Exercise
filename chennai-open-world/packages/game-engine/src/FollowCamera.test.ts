import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PhysicsWorld } from "@cow/physics";
import { FollowCamera, type ChaseTarget } from "./FollowCamera";

const FEET = { x: 10, y: 0, z: -20 };
const DT = 1 / 60;

async function rig() {
  const physics = await PhysicsWorld.create();
  const body = physics.createCharacter({ radius: 0.3, height: 1.8, feet: { x: 0, y: -40, z: 0 } });
  const lens = new THREE.PerspectiveCamera(60, 1.6, 0.3, 500);
  const camera = new FollowCamera(lens, 0);
  /** The point the camera looks at, where its view ray reaches shoulder height. */
  const aim = () => {
    lens.updateMatrixWorld();
    const dir = lens.getWorldDirection(new THREE.Vector3());
    const t = (FEET.y + 1.5 - lens.position.y) / dir.y;
    return { x: lens.position.x + dir.x * t - FEET.x, z: lens.position.z + dir.z * t - FEET.z };
  };
  const frames = (seconds: number, chase: ChaseTarget | null) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      if (chase) camera.chase(chase, DT);
      camera.update(DT, FEET, physics, body);
    }
  };
  return { camera, lens, aim, frames };
}

/** Driving east at 20 m/s, nose pointing east. */
const EAST: ChaseTarget = { velocity: { x: 20, z: 0 }, heading: -Math.PI / 2, forwardSpeed: 20, topSpeed: 23 };

describe("FollowCamera", () => {
  it("on foot it looks at the shoulders with the normal field of view", async () => {
    const { lens, aim, frames } = await rig();
    frames(1, null);
    const a = aim();
    expect(Math.hypot(a.x, a.z)).toBeLessThan(1e-3);
    expect(lens.fov).toBe(60);
  });

  it("driving fast it swings behind, aims ahead in the direction of travel and widens a little", async () => {
    const { camera, lens, aim, frames } = await rig();
    frames(3, EAST);
    const a = aim();
    expect(a.x).toBeGreaterThan(4); // several metres ahead, eastwards
    expect(Math.abs(a.z)).toBeLessThan(0.5);
    expect(lens.position.x).toBeLessThan(FEET.x); // behind (west of) the vehicle
    expect(Math.abs(Math.atan2(Math.sin(camera.yaw - EAST.heading), Math.cos(camera.yaw - EAST.heading)))).toBeLessThan(0.05);
    expect(lens.fov).toBeGreaterThan(63);
    expect(lens.fov).toBeLessThan(68);
  });

  it("in a slide it follows where the vehicle goes, not where its nose points", async () => {
    const { camera, frames } = await rig();
    frames(3, { ...EAST, heading: -Math.PI / 2 - 0.4 });
    expect(Math.abs(camera.yaw - EAST.heading)).toBeLessThan(0.05);
  });

  it("a crash glides the view back instead of jerking it", async () => {
    const { aim, frames } = await rig();
    frames(3, EAST);
    const before = aim().x;
    const stopped: ChaseTarget = { ...EAST, velocity: { x: 0, z: 0 }, forwardSpeed: 0 };
    frames(DT, stopped);
    expect(aim().x).toBeGreaterThan(before * 0.9);
    frames(2, stopped);
    expect(aim().x).toBeLessThan(before * 0.05);
  });

  it("after the player drags the view, it neither swings back nor aims ahead for a moment", async () => {
    const { camera, aim, frames } = await rig();
    frames(3, EAST);
    camera.look(-200, 0);
    const yaw = camera.yaw;
    frames(1, EAST);
    expect(camera.yaw).toBe(yaw);
    expect(Math.abs(aim().x)).toBeLessThan(2);
  });
});
