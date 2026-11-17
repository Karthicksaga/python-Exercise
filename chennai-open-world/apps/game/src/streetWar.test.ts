/**
 * The street war built from the real world files: gangs hold the districts they are meant to,
 * crews stand at the roadside, and every step of stages 11 to 15 can be done.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DistrictIndex, decodeRoads, nearestRoadPoint, worldFromIndex, type Point, type WorldIndexFile } from "@cow/game-world";
import { WEAPONS, type WeaponId } from "@cow/combat";
import { pathLength } from "@cow/missions";
import { buildContent } from "./content";
import { GANGS, buildStreetWar } from "./streetWar";

const file = (name: string) => new URL(`../public/world/${name}`, import.meta.url);
const index = JSON.parse(readFileSync(file("index.json"), "utf8")) as WorldIndexFile & { readonly roadNames: readonly string[] };
const city = worldFromIndex(index, decodeRoads(readFileSync(file(index.roads)), index.roadNames));
const war = buildStreetWar(city);
const content = buildContent(city);
const districts = new DistrictIndex(city.districts ?? []);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const centre = (name: string) => city.districts!.find((d) => d.name === name)!;

describe("rival gangs", () => {
  it("are three invented gangs with their own colours, each in a district on the map", () => {
    expect(GANGS.map((g) => g.name)).toEqual(["Manjal Puli", "Neela Nandu", "Pachai Paambu"]);
    expect(new Set(GANGS.map((g) => g.colour)).size).toBe(3);
    for (const g of GANGS) expect(city.districts?.some((d) => d.name === g.district), g.district).toBe(true);
  });

  it("put two crews of three on corners inside their own turf, at the roadside", () => {
    for (const g of GANGS) {
      const crews = war.crews.filter((c) => c.gang === g.id);
      expect(crews).toHaveLength(2);
      for (const crew of crews) {
        expect(crew.id).toMatch(new RegExp(`^gang:${g.id}:`));
        expect(crew.members).toHaveLength(3);
        // Inside the turf: within 500 m of the district point.
        expect(distance(crew, centre(g.district)), crew.id).toBeLessThan(500);
        for (const m of crew.members) {
          expect(m.calm).toBe(true);
          expect(m.tint).toBe(g.colour);
          // Beside a street: on the pavement, not in the middle of the carriageway.
          const road = nearestRoadPoint(city, m)!;
          expect(road.distance, `${crew.id} member`).toBeGreaterThan(road.road.width / 2 - 0.5);
          // ...and within a pavement's depth of it (8 m: the nearest street can be a lane beside the corner).
          expect(road.distance, `${crew.id} member`).toBeLessThan(Math.max(8, road.road.width / 2 + 4));
        }
        // One with a pistol, one with a bat, one with bare fists.
        expect(crew.members.map((m) => m.weapon).sort()).toEqual(["bat", "fists", "pistol"]);
        expect(crew.members.find((m) => m.weapon === "pistol")!.armed).toBe(true);
      }
    }
    // Corners far apart, so at most two crews (six figures) are ever near the player together.
    for (const a of war.crews) for (const b of war.crews) if (a !== b) expect(distance(a, b)).toBeGreaterThan(100);
  });

  it("are far from the Anna Nagar home square, where the first ten stages are played", () => {
    for (const crew of war.crews) expect(distance(crew, content.spawn)).toBeGreaterThan(3000);
  });
});

describe("stages 11 to 15", () => {
  const stages = content.missions.slice(10);

  it("follow stage 10 in order, each with a brief and a reward in money", () => {
    expect(stages.map((m) => [m.stage, m.id])).toEqual([
      [11, "courier-chase"],
      [12, "tea-shop"],
      [13, "drive-by"],
      [14, "snake-pit"],
      [15, "turf-war"],
    ]);
    for (const m of stages) {
      expect(m.brief.length).toBeGreaterThan(40);
      expect(m.reward).toBeGreaterThan(1500);
    }
  });

  it("hand over real weapons as rewards", () => {
    const given = stages.flatMap((m) => m.weapons ?? []);
    expect(given.length).toBeGreaterThanOrEqual(3);
    for (const w of given) {
      expect(w.id in WEAPONS).toBe(true);
      expect(WEAPONS[w.id as WeaponId].kind).toBe("gun");
      expect(w.ammo).toBeGreaterThan(0);
    }
  });

  it("have an enemy group for every fight and ambush, in the gangs' colours", () => {
    const colours = new Set(GANGS.map((g) => g.colour));
    for (const m of stages) {
      for (const o of m.objectives) {
        const group = o.type === "defeat" ? o.group : o.type === "reach" ? o.hostiles : undefined;
        if (!group) continue;
        const spots = content.enemies[group];
        expect(spots?.length, group).toBeGreaterThanOrEqual(4);
        for (const s of spots!) {
          expect(colours.has(s.tint!)).toBe(true);
          expect(s.calm).toBeUndefined(); // stage enemies attack at once
          // Within the objective's area or close to it.
          expect(distance(s, o.type === "defeat" ? o : { x: s.x, z: s.z })).toBeLessThan(30);
        }
      }
    }
    // The hideout and the turf war use the new weapons against the player.
    const weapons = (group: string) => new Set(content.enemies[group]!.map((s) => s.weapon));
    expect(weapons("hideout").has("shotgun") && weapons("hideout").has("smg")).toBe(true);
    expect(content.enemies.turf!.some((s) => (s.health ?? 0) > 200)).toBe(true); // the boss
  });

  it("are played in the districts the briefs name", () => {
    const placeOf = (id: string, i: number) => {
      const o = content.missions.find((m) => m.id === id)!.objectives[i]!;
      if (o.type === "enter") throw new Error("no place");
      return districts.at(o.type === "chase" ? o.path[0]! : o)?.name;
    };
    expect(placeOf("courier-chase", 0)).toBe("Royapettah");
    expect(placeOf("tea-shop", 0)).toBe("Triplicane");
    expect(placeOf("drive-by", 0)).toBe("Triplicane");
    expect(placeOf("snake-pit", 0)).toBe("Egmore");
    expect(placeOf("turf-war", 0)).toBe("Royapettah");
  });

  it("the courier's route is one continuous road, long enough to chase on, away from where the player waits", () => {
    const stage = content.missions.find((m) => m.id === "courier-chase")!;
    const chase = stage.objectives.find((o) => o.type === "chase");
    if (chase?.type !== "chase") throw new Error("no chase");
    expect(pathLength(chase.path)).toBeGreaterThan(800);
    for (let i = 1; i < chase.path.length; i++) expect(distance(chase.path[i]!, chase.path[i - 1]!)).toBeLessThan(250);
    for (const p of chase.path) expect(nearestRoadPoint(city, p)!.distance).toBeLessThan(1);
    // The route does not double back on itself at the start.
    const [a, b, c] = chase.path;
    expect((b!.x - a!.x) * (c!.x - b!.x) + (b!.z - a!.z) * (c!.z - b!.z)).toBeGreaterThan(0);
    const wait = stage.objectives[2]!;
    if (wait.type !== "reach") throw new Error("no wait");
    expect(distance(wait, chase.path[0]!)).toBeGreaterThan(30);
    expect(distance(wait, chase.path.at(-1)!)).toBeGreaterThan(distance(chase.path[0]!, chase.path.at(-1)!));
    // A car is parked nearby for players who arrive on foot.
    const car = content.parking.find((p) => p.id === "car-royapettah")!;
    expect(distance(car, wait)).toBeLessThan(250);
  });

  it("the drive-by escape has a motorbike where it starts and a reachable time limit", () => {
    const stage = content.missions.find((m) => m.id === "drive-by")!;
    const [start, , ride] = stage.objectives;
    if (start?.type !== "reach" || ride?.type !== "reach") throw new Error("bad stage");
    const bike = content.parking.find((p) => p.id === "bike-triplicane")!;
    expect(bike.kind).toBe("bike");
    expect(distance(bike, start)).toBeLessThan(start.radius);
    expect(ride.mode).toBe("bike");
    expect(ride.hostiles).toBe("driveby");
    // At a modest 8 m/s along roads half as long again as the straight line, with time to spare.
    expect(ride.timeLimit!).toBeGreaterThan((distance(start, ride) * 1.5) / 8);
    expect(distance(start, ride)).toBeGreaterThan(300);
  });
});

describe("weapons in the world", () => {
  it("lie by the roadside: a bat near home, guns and rounds in the gang districts", () => {
    const byWeapon = (w: WeaponId) => war.pickups.filter((p) => p.weapon === w);
    expect(byWeapon("bat")).toHaveLength(1);
    expect(distance(byWeapon("bat")[0]!, content.spawn)).toBeLessThan(600);
    expect(byWeapon("shotgun").length).toBeGreaterThanOrEqual(1);
    expect(byWeapon("smg").length).toBeGreaterThanOrEqual(1);
    for (const p of war.pickups) {
      const road = nearestRoadPoint(city, p)!;
      expect(road.distance, p.id).toBeLessThan(road.road.width / 2 + 3);
      if (WEAPONS[p.weapon].kind === "gun") expect(p.ammo).toBeGreaterThan(0);
    }
    expect(new Set(war.pickups.map((p) => p.id)).size).toBe(war.pickups.length);
  });
});
