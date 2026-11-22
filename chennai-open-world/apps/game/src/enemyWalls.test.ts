/**
 * Enemies must not walk into buildings. Buildings are hollow triangle walls (`StaticGroup.addMesh`),
 * so a ray that starts inside one sees nothing: an enemy closer to a wall than where its look-ahead
 * ray started used to walk straight through and could then never be shot (every bullet stopped at
 * the wall). Seen in CI on stage 15: four turf enemies stayed on full health for 75 rounds.
 */
import { describe, expect, it } from "vitest";
import { Combat, type PlayerState } from "@cow/combat";
import { PhysicsWorld } from "@cow/physics";
import { combatWorld } from "./Fighters";

/** A closed 10 × 10 m building, 6 m tall, whose south wall is the plane z = -5 (x from -5 to 5). */
function building(physics: PhysicsWorld): void {
  const [x0, x1, z0, z1, y0, y1] = [-5, 5, -15, -5, 0, 6];
  const corners = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
  ];
  // Four walls, two triangles each (both windings, so either side is solid to a ray).
  const quads = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const indices: number[] = [];
  for (const [a, b, c, d] of quads) indices.push(a!, b!, c!, a!, c!, d!, a!, c!, b!, a!, d!, c!);
  physics.createStaticGroup().addMesh(new Float32Array(corners.flat()), new Uint32Array(indices));
}

describe("enemies and walls", async () => {
  const physics = await PhysicsWorld.create();
  building(physics);
  physics.step(1 / 60);

  it.each([0.15, 0.4, 0.55])("an enemy %s m outside a wall does not walk into the building chasing the player", (gap) => {
    const combat = new Combat(combatWorld(physics), () => 0.99);
    // A bat-carrying enemy (closes in to hit), just south of the wall; the player is inside the
    // building's footprint to the north, so the straight line runs through the wall.
    combat.spawnGroup("test", [{ x: 0, z: -5 + gap, armed: false, weapon: "bat" }]);
    const player: PlayerState = { x: 0, z: -12, heading: 0, inVehicle: false, speed: 0 };
    let deepest = Infinity;
    for (let i = 0; i < 600; i++) {
      combat.update(1 / 60, player);
      deepest = Math.min(deepest, combat.enemies[0]!.z);
    }
    // The body is 0.28 m from its centre to its front: the centre stays outside the wall.
    expect(deepest).toBeGreaterThan(-5);
  });

  it("an enemy in the open still closes in on the player", () => {
    const combat = new Combat(combatWorld(physics), () => 0.99);
    combat.spawnGroup("open", [{ x: 20, z: 10, armed: false, weapon: "bat" }]);
    const player: PlayerState = { x: 20, z: 0, heading: 0, inVehicle: false, speed: 0 };
    for (let i = 0; i < 300; i++) combat.update(1 / 60, player);
    expect(Math.hypot(combat.enemies[0]!.x - 20, combat.enemies[0]!.z)).toBeLessThan(2);
  });
});

describe("enemies spawned inside a building", async () => {
  // A small closed building, like the clock tower at the Royapettah junction: 2.6 m square.
  const physics = await PhysicsWorld.create();
  const [x0, x1, z0, z1, y0, y1] = [98.7, 101.3, 98.7, 101.3, 0, 8];
  const corners = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
  ];
  const indices: number[] = [];
  for (const [a, b, c, d] of [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) indices.push(a!, b!, c!, a!, c!, d!, a!, c!, b!, a!, d!, c!);
  physics.createStaticGroup().addMesh(new Float32Array(corners.flat()), new Uint32Array(indices));
  physics.step(1 / 60);

  it("are moved out to the street, where they can be reached and shot", () => {
    const combat = new Combat(combatWorld(physics), () => 0.5);
    combat.spawnGroup("turf", [{ x: 100, z: 100, armed: false, weapon: "bat" }]);
    const enemy = combat.enemies[0]!;
    const outside = enemy.x < x0 || enemy.x > x1 || enemy.z < z0 || enemy.z > z1;
    expect(outside).toBe(true);
    expect(Math.hypot(enemy.x - 100, enemy.z - 100)).toBeLessThanOrEqual(8);
    // From 6 m away, a straight line reaches them.
    expect(combatWorld(physics).lineOfSight(enemy.x + 6, enemy.z, enemy.x, enemy.z) || combatWorld(physics).lineOfSight(enemy.x - 6, enemy.z, enemy.x, enemy.z) || combatWorld(physics).lineOfSight(enemy.x, enemy.z + 6, enemy.x, enemy.z) || combatWorld(physics).lineOfSight(enemy.x, enemy.z - 6, enemy.x, enemy.z)).toBe(true);
  });

  it("stay where they were asked to stand when that spot is open, even right beside a wall", () => {
    const combat = new Combat(combatWorld(physics), () => 0.5);
    combat.spawnGroup("corner", [{ x: 100, z: 102, armed: true, weapon: "pistol" }]);
    expect(combat.enemies[0]).toMatchObject({ x: 100, z: 102 });
  });
});

