import { describe, expect, it } from "vitest";
import { PhysicsWorld, type VehicleSpec } from "@cow/physics";
import { PLAYER_HEIGHT, PLAYER_RADIUS, PlayerController } from "./PlayerController";

const STILL = { moveX: 0, moveY: 0, jump: false, cameraYaw: 0 };
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

/** Flat ground, a wall across the way north (its face at z = -5), and a player standing at the origin. */
async function scene(feet = { x: 0, y: 1, z: 0 }) {
  const physics = await PhysicsWorld.create();
  const statics = physics.createStaticGroup();
  statics.addBox({ x: 0, y: -0.5, z: 0, hx: 60, hy: 0.5, hz: 60, yaw: 0 });
  statics.addBox({ x: 0, y: 3, z: -5.2, hx: 20, hy: 3, hz: 0.2, yaw: 0 });
  const body = physics.createCharacter({ radius: PLAYER_RADIUS, height: PLAYER_HEIGHT, feet });
  const player = new PlayerController(body);
  physics.step(1 / 60);
  /** Run until the throw is over (or `seconds`), recording the phases and the landing. */
  const run = (seconds: number) => {
    const phases: string[] = [];
    let landings = 0;
    let highest = -Infinity;
    for (let i = 0; i < seconds * 60; i++) {
      player.update(STILL, 1 / 60);
      physics.step(1 / 60);
      if (player.consumeLanding()) landings++;
      highest = Math.max(highest, player.position.y);
      const phase = player.knockdown ?? "on foot";
      if (phases[phases.length - 1] !== phase) phases.push(phase);
      if (phase === "on foot") break;
    }
    return { phases, landings, highest };
  };
  return { physics, player, body, run };
}

describe("thrown off a vehicle", () => {
  it("flies, lands once, scrapes to a stop, lies still, gets up and is in control again", async () => {
    const { player, run } = await scene();
    player.throwOff({ x: 8, y: 4, z: 0 }, 1, -Math.PI / 2);
    const out = run(8);
    expect(out.phases).toEqual(["flying", "sliding", "lying", "rising", "on foot"]);
    expect(out.landings).toBe(1);
    expect(out.highest).toBeGreaterThan(1.2);
    // Carried well along, and back on the ground.
    expect(player.position.x).toBeGreaterThan(4);
    expect(player.position.y).toBeLessThan(0.1);
    expect(player.grounded).toBe(true);
  });

  it("the stick does nothing until the player is up again", async () => {
    const { player, physics } = await scene();
    player.throwOff({ x: 0, y: 3, z: 0 }, 0.5, 0);
    for (let i = 0; i < 40; i++) {
      player.update({ ...STILL, moveY: 1 }, 1 / 60);
      physics.step(1 / 60);
    }
    expect(player.knockdown).not.toBeNull();
    expect(Math.abs(player.position.z)).toBeLessThan(0.05);
  });

  it("never passes through a wall: thrown straight at one, it stops at the wall's face, and a glancing throw slides along it", async () => {
    const head = await scene();
    head.player.throwOff({ x: 0, y: 3, z: -16 }, 0.3, 0);
    head.run(8);
    expect(head.player.position.z).toBeGreaterThan(-5 + PLAYER_RADIUS - 0.05);

    const glance = await scene();
    glance.player.throwOff({ x: -6, y: 3, z: -14 }, 0.3, 0);
    glance.run(8);
    expect(glance.player.position.z).toBeGreaterThan(-5 + PLAYER_RADIUS - 0.05);
    // Moved off to the side along the wall, not stuck where it hit.
    expect(glance.player.position.x).toBeLessThan(-2.5);
  });

  it("leaving from the seat it passes through its own vehicle without shoving it", async () => {
    const { physics, player, body, run } = await scene({ x: 0, y: 1.05, z: 0.2 });
    const bike = physics.createVehicle(BIKE, { x: 0, y: 0.62, z: 0 }, 0);
    for (let i = 0; i < 30; i++) physics.step(1 / 60);
    const before = bike.position();
    body.passThrough(bike);
    // Backwards over the bike's tail and down through it.
    player.throwOff({ x: 0, y: 1, z: 4 }, 0.3, 0);
    run(6);
    body.passThrough(null);
    const after = bike.position();
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.05);
    expect(player.position.z).toBeGreaterThan(1.3);
    expect(player.position.y).toBeLessThan(0.1);
  });

  it("a respawn ends a throw at once", async () => {
    const { player } = await scene();
    player.throwOff({ x: 5, y: 3, z: 0 }, 1, 0);
    player.respawn({ x: 0, y: 0.1, z: 0 }, 0);
    expect(player.knockdown).toBeNull();
  });
});
