/**
 * Enemies must not walk into buildings. Buildings are hollow triangle walls (`StaticGroup.addMesh`),
 * so a ray that starts inside one sees nothing: an enemy closer to a wall than where its look-ahead
 * ray started used to walk straight through and could then never be shot (every bullet stopped at
 * the wall). Seen in CI on stage 15: four turf enemies stayed on full health for 75 rounds.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Combat, type PlayerState } from "@cow/combat";
import { chunkKeyAt, chunkSolids, decodeChunk, decodeRoads, pointInPolygon, worldFromIndex, type WorldIndexFile } from "@cow/game-world";
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

/**
 * The real map at the Royapettah clock tower, where stage 15's turf war is fought: a 3.7 m square
 * building, 7.1 m tall, with the boss's group spawning beside its corners. A CI run ended with a
 * bat-carrying enemy inside it. Walking round the walls is not how: no charge gets in (below).
 * The fight had started before the building's chunk was loaded, and the enemy charged through
 * where it would stand; `Game` now holds enemies still until the streets round the player load.
 */
describe("enemies and the corners of a real building", async () => {
  const file = (name: string) => new URL(`../public/world/${name}`, import.meta.url);
  const index = JSON.parse(readFileSync(file("index.json"), "utf8")) as WorldIndexFile & { readonly roadNames: readonly string[] };
  const city = worldFromIndex(index, decodeRoads(readFileSync(file(index.roads)), index.roadNames));
  const tower = { x: 5954, z: 2998.3 };
  const [col, row] = chunkKeyAt(city.bounds, city.chunkSize, tower.x, tower.z).split(",").map(Number) as [number, number];
  const bytes = readFileSync(file(`c/${col}_${row}.bin`));
  const chunk = decodeChunk(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), city.bounds, city.chunkSize);
  const building = chunk.buildings.find((b) => pointInPolygon(tower.x, tower.z, b.outline))!;
  const physics = await PhysicsWorld.create();
  const solids = chunkSolids(chunk);
  physics.createStaticGroup().addMesh(solids.vertices, solids.indices);
  physics.step(1 / 60);

  it("is the small building at the tower", () => {
    expect(building.outline).toHaveLength(4);
    expect(building.height).toBeCloseTo(7.1, 1);
  });

  it("no charge, from beside any corner towards a player anywhere round it, ends up inside", () => {
    let charges = 0;
    for (const start of building.outline) {
      // Just outside the corner, on the line from the building's middle.
      const out = Math.hypot(start.x - tower.x, start.z - tower.z);
      const sx = tower.x + ((start.x - tower.x) / out) * (out + 0.6);
      const sz = tower.z + ((start.z - tower.z) / out) * (out + 0.6);
      for (let a = 0; a < 360; a += 10) {
        for (const r of [4, 6, 9]) {
          const player: PlayerState = { x: tower.x + Math.sin((a * Math.PI) / 180) * r, z: tower.z + Math.cos((a * Math.PI) / 180) * r, heading: 0, inVehicle: false, speed: 0 };
          const combat = new Combat(combatWorld(physics), () => 0.99);
          combat.spawnGroup("turf", [{ x: sx, z: sz, armed: false, weapon: "bat" }]);
          (combat.enemies[0] as { alerted: boolean }).alerted = true; // charging, whatever it can see
          for (let i = 0; i < 400; i++) {
            combat.update(1 / 60, player);
            const e = combat.enemies[0]!;
            expect(pointInPolygon(e.x, e.z, building.outline), `from ${sx.toFixed(1)},${sz.toFixed(1)} towards ${player.x.toFixed(1)},${player.z.toFixed(1)}, step ${i}`).toBe(false);
          }
          charges++;
        }
      }
    }
    expect(charges).toBe(4 * 36 * 3);
  });
});
