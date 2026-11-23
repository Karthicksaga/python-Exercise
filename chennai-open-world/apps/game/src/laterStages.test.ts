/**
 * Stages 16 to 21 on the real map: in the places the briefs name, each starting close to where the
 * one before ended (no long empty drives), with their vehicles parked at the start.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DistrictIndex, chunkKeyAt, decodeChunk, decodeRoads, nearestRoadPoint, pointInPolygon, worldFromIndex, type Point, type WorldIndexFile } from "@cow/game-world";
import type { Mission, Objective } from "@cow/missions";
import { buildContent } from "./content";
import { STATIONS } from "./laterStages";

const file = (name: string) => new URL(`../public/world/${name}`, import.meta.url);
const index = JSON.parse(readFileSync(file("index.json"), "utf8")) as WorldIndexFile & { readonly roadNames: readonly string[] };
const city = worldFromIndex(index, decodeRoads(readFileSync(file(index.roads)), index.roadNames));
const content = buildContent(city);
const rail = JSON.parse(readFileSync(file("rail.json"), "utf8")) as { stations: Array<{ name: string; x: number; z: number }> };
const districts = new DistrictIndex(city.districts ?? []);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const stage = (n: number): Mission => content.missions.find((m) => m.stage === n)!;
/** Where an objective is, or null for one with no place (get in, lose the police). */
const placeOf = (o: Objective): Point | null => (o.type === "reach" || o.type === "defeat" ? o : o.type === "chase" ? o.path[0]! : null);
const places = (m: Mission) => m.objectives.map(placeOf).filter((p): p is Point => p !== null);
const parked = (id: string) => content.parking.find((p) => p.id === id)!;

describe("stages 16 to 21", () => {
  it("follow stage 15 in order, each with a brief, money, and reputation where it fits", () => {
    const later = content.missions.slice(15);
    expect(later.map((m) => m.stage)).toEqual([16, 17, 18, 19, 20, 21]);
    for (const m of later) {
      expect(m.brief.length, m.id).toBeGreaterThan(80);
      expect(m.reward, m.id).toBeGreaterThan(1000);
    }
    expect(later.filter((m) => (m.reputation ?? 0) > 0).length).toBeGreaterThanOrEqual(4);
  });

  it("are set where the briefs say", () => {
    const at = (p: Point) => districts.at(p)?.name;
    expect(at(places(stage(16))[0]!)).toBe("Royapettah");
    expect(distance(places(stage(16))[1]!, city.landmarks!.find((l) => l.id === "kapaleeshwarar-temple")!)).toBeLessThan(300);
    expect(nearestRoadPoint(city, places(stage(17))[0]!)!.road.name).toBe("East Tank Square Street");
    expect(nearestRoadPoint(city, places(stage(18))[1]!)!.road.name).toBe("EVR Periyar Salai");
    expect(distance(places(stage(18))[1]!, STATIONS.park)).toBeLessThan(400);
    expect(distance(places(stage(20))[2]!, city.districts!.find((d) => d.name === "Chepauk")!)).toBeLessThan(700);
    expect(nearestRoadPoint(city, places(stage(21))[0]!)!.road.name).toBe("Kamarajar Salai");
  });

  it("start near where the stage before ended: no long empty drives", () => {
    const tower = places(stage(15)).at(-1)!;
    // From the turf war's clock tower, the auto is waiting a few steps away.
    expect(distance(parked("auto-royapettah"), tower)).toBeLessThan(120);
    for (let n = 16; n <= 21; n++) {
      const before = places(stage(n - 1)).at(-1)!;
      const first = places(stage(n))[0] ?? before;
      // Stage 16's first place is its pick-up, the others' their meeting point.
      expect(distance(before, first), `stage ${n}`).toBeLessThan(1500);
    }
    expect(distance(parked("car-mylapore"), places(stage(18))[0]!)).toBeLessThan(400);
    expect(distance(parked("bike-egmore"), STATIONS.egmore)).toBeLessThan(400);
  });

  it("use the new kinds of objective: passengers, losing the police, a train, a chase, a clock and a fight", () => {
    const all = content.missions.slice(15).flatMap((m) => m.objectives);
    expect(all.filter((o) => o.type === "reach" && o.fare).length).toBe(4);
    expect(all.find((o) => o.type === "evade")).toMatchObject({ stars: 2 });
    expect(all.some((o) => o.type === "reach" && o.byTrain)).toBe(true);
    const chase = all.find((o) => o.type === "chase");
    expect(chase?.type === "chase" && chase.path.length).toBeGreaterThan(2);
    expect(all.filter((o) => o.type === "reach" && o.timeLimit).length).toBeGreaterThanOrEqual(3);
    expect(all.some((o) => o.type === "defeat" && o.group === "brawl")).toBe(true);
    // The wedding party is three, the most the auto's back seat takes.
    const pickup = stage(16).objectives[1]!;
    expect(pickup.type === "reach" && pickup.fare?.board).toBe(3);
  });

  it("names stations exactly where the railway has them", () => {
    for (const station of Object.values(STATIONS)) {
      const found = rail.stations.find((s) => s.name === station.name)!;
      expect(distance(found, station), station.name).toBeLessThan(1);
    }
  });

  it("has a chase path along the road and a gang that stands outside buildings, unarmed but for bats", () => {
    const chase = stage(19).objectives.find((o) => o.type === "chase")!;
    if (chase.type !== "chase") throw new Error("no chase");
    let length = 0;
    for (let i = 1; i < chase.path.length; i++) length += distance(chase.path[i]!, chase.path[i - 1]!);
    expect(length).toBeGreaterThan(500);
    const brawl = content.enemies.brawl!;
    expect(brawl).toHaveLength(5);
    expect(brawl.every((e) => !e.armed)).toBe(true);
    for (const e of brawl) {
      const key = chunkKeyAt(city.bounds, city.chunkSize, e.x, e.z);
      const [col, row] = key.split(",").map(Number) as [number, number];
      const ref = index.chunks.find(([c, r]) => c === col && r === row);
      if (!ref) continue;
      const bytes = readFileSync(file(`c/${col}_${row}.bin`));
      const chunk = decodeChunk(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), city.bounds, city.chunkSize);
      expect(chunk.buildings.some((b) => pointInPolygon(e.x, e.z, b.outline))).toBe(false);
    }
  });
});
