import { describe, expect, it } from "vitest";
import { END_CLEAR, POLE, SHELTER, blockedStretches, chunkFurniture, cumulative, furnitureSolids, kerbsAlong, mainRoadNodes, placeShelter, polesAlong, type FurnitureMap } from "./furniture";
import type { Building, ChunkData, NamedPoint, Road } from "./types";

const line = (x0: number, x1: number, z: number, step: number) => {
  const pts = [];
  for (let x = x0; x <= x1; x += step) pts.push({ x, z });
  return pts;
};
/** An east-west primary road (two ways meeting end to end at x = 200) and a side street crossing it at x = 0. */
const primaryWest: Road = { id: 11, kind: "primary", width: 10, oneway: false, points: line(-400, 200, 0, 100) };
const primaryEast: Road = { id: 12, kind: "primary", width: 10, oneway: false, points: line(200, 400, 0, 100) };
const side: Road = { id: 13, kind: "residential", width: 6, oneway: false, points: [{ x: 0, z: -200 }, { x: 0, z: 0 }, { x: 0, z: 200 }] };
const tertiary: Road = { id: 14, kind: "tertiary", width: 7, oneway: true, points: [{ x: -400, z: -150 }, { x: 400, z: -150 }] };
const roads = [primaryWest, primaryEast, side, tertiary];
const bounds = { minX: -500, maxX: 500, minZ: -500, maxZ: 500 };
const stops: NamedPoint[] = [
  { x: 50, z: 7, name: "Example Stop" },
  { x: -120, z: 0.2 },
  { x: 0, z: 400 }, // far from any road: no shelter
];
const map: FurnitureMap = { roads, busStops: stops, bounds, chunkSize: 250 };
const chunk = (col: number, row: number, buildings: Building[] = []): ChunkData => ({ key: `${col},${row}`, col, row, buildings, trees: [], areas: [] });
const allChunks = () => [0, 1, 2, 3].flatMap((col) => [0, 1, 2, 3].map((row) => chunk(col, row)));

describe("placeShelter", () => {
  it("stands at the kerb on the side the stop is mapped, facing the road", () => {
    const s = placeShelter(map, stops[0]!)!;
    expect(s.roadId).toBe(11);
    expect(s.x).toBeCloseTo(50);
    expect(s.z).toBeCloseTo(10 / 2 + SHELTER.gap + SHELTER.depth / 2);
    // Facing north (-Z), towards the road.
    expect(Math.abs(s.yaw)).toBeCloseTo(0);
    expect(s.name).toBe("Example Stop");
  });
  it("goes on the left of the road's direction when the stop is mapped on the centre line", () => {
    const s = placeShelter(map, stops[1]!)!;
    // The road runs east, so its left is north (-Z); the shelter faces south, back to the road.
    expect(s.z).toBeLessThan(-5);
    expect(Math.abs(s.yaw)).toBeCloseTo(Math.PI);
  });
  it("skips stops far from any drivable road", () => {
    expect(placeShelter(map, stops[2]!)).toBeNull();
  });
});

describe("junctions", () => {
  it("counts the arms meeting at main-road points", () => {
    const nodes = mainRoadNodes(roads);
    const degree = (x: number, z: number) => [...nodes.entries()].find(([k]) => k === (Math.round(x * 20) + 1_048_576) * 2_097_152 + (Math.round(z * 20) + 1_048_576))?.[1].degree;
    expect(degree(0, 0)).toBe(4); // crossing
    expect(degree(200, 0)).toBe(2); // one way continuing into the next
    expect(degree(-400, 0)).toBe(1); // dead end
  });
  it("keeps junctions and, for poles, road ends clear", () => {
    const along = cumulative(primaryWest.points);
    const nodes = mainRoadNodes(roads);
    expect(blockedStretches(primaryWest, along, nodes, false)).toEqual([[400 - END_CLEAR, 400 + END_CLEAR]]);
    expect(blockedStretches(primaryWest, along, nodes, true)).toHaveLength(3);
  });
});

describe("poles", () => {
  const along = cumulative(primaryWest.points);
  const stretches = blockedStretches(primaryWest, along, mainRoadNodes(roads), true);
  const poles = polesAlong(primaryWest, along, 0, primaryWest.points.length - 1, stretches, () => false);
  it("are spaced evenly and alternate sides on a primary road, at the verge", () => {
    expect(poles.length).toBeGreaterThan(10);
    for (let i = 1; i < poles.length; i++) {
      const gap = poles[i]!.x - poles[i - 1]!.x;
      expect(gap % POLE.pitch).toBeCloseTo(0);
    }
    for (const p of poles) expect(Math.abs(p.z)).toBeCloseTo(5 + POLE.setback);
    expect(new Set(poles.map((p) => Math.sign(p.z))).size).toBe(2);
    // Each faces the road: its forward points back to the centre line.
    for (const p of poles) expect(Math.sign(-Math.cos(p.yaw))).toBe(-Math.sign(p.z));
  });
  it("keep clear of junctions and road ends", () => {
    for (const p of poles) {
      expect(Math.abs(p.x)).toBeGreaterThan(END_CLEAR);
      expect(p.x).toBeGreaterThan(-400 + END_CLEAR);
      expect(p.x).toBeLessThan(200 - END_CLEAR);
    }
  });
  it("keep one side of smaller roads", () => {
    const a = cumulative(tertiary.points);
    const ps = polesAlong(tertiary, a, 0, 1, [], () => false);
    expect(new Set(ps.map((p) => Math.sign(p.z + 150))).size).toBe(1);
  });
  it("are the same whichever chunks load, and each pole belongs to one chunk", () => {
    const first = allChunks().flatMap((c) => chunkFurniture(map, c).poles);
    const again = allChunks().flatMap((c) => chunkFurniture(map, c).poles);
    expect(again).toEqual(first);
    const keys = first.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(first.some((p) => p.roadId === tertiary.id)).toBe(true);
    // Residential roads get none.
    expect(first.some((p) => p.roadId === side.id)).toBe(false);
  });
  it("are not placed inside buildings or at bus shelters", () => {
    const free = chunkFurniture(map, chunk(2, 2)).poles;
    expect(free.length).toBeGreaterThan(0);
    // A building covering the whole south verge of this chunk.
    const block: Building = { id: 1, outline: [{ x: 0, z: 5.2 }, { x: 250, z: 5.2 }, { x: 250, z: 30 }, { x: 0, z: 30 }], height: 6, floors: 2, kind: "house", color: 0xffffff };
    const withBlock = chunkFurniture(map, chunk(2, 2, [block])).poles;
    expect(withBlock.some((p) => p.z > 0 && p.x > 0)).toBe(false);
    expect(withBlock.length).toBeLessThan(free.length);
    const shelter = chunkFurniture(map, chunk(2, 2)).shelters[0]!;
    for (const p of free) expect(Math.hypot(p.x - shelter.x, p.z - shelter.z)).toBeGreaterThan(4);
  });
});

describe("kerbs", () => {
  const nodes = mainRoadNodes(roads);
  it("run along both carriageway edges and break at the junction", () => {
    const along = cumulative(primaryWest.points);
    const runs = kerbsAlong(primaryWest, along, 0, primaryWest.points.length - 1, blockedStretches(primaryWest, along, nodes, false));
    // Two open stretches (either side of the crossing), two sides each.
    expect(runs).toHaveLength(4);
    for (const run of runs) {
      expect(run.inner).toHaveLength(run.outer.length);
      for (const p of run.inner) {
        expect(Math.abs(p.z)).toBeCloseTo(5);
        expect(Math.abs(p.x) >= END_CLEAR - 1e-6).toBe(true);
      }
      for (const p of run.outer) expect(Math.abs(p.z)).toBeGreaterThan(5);
    }
  });
  it("carry on where one way of a road continues into the next", () => {
    const east = allChunks().flatMap((c) => chunkFurniture(map, c).kerbs).filter((r) => r.inner.some((p) => Math.abs(p.z) < 6));
    const reaches = (x: number) => east.some((r) => r.inner.some((p) => Math.abs(p.x - x) < 1e-6));
    expect(reaches(200)).toBe(true);
    expect(reaches(400)).toBe(true);
  });
});

describe("furnitureSolids", () => {
  it("makes poles and shelter posts solid", () => {
    const f = chunkFurniture(map, chunk(2, 2));
    expect(f.shelters).toHaveLength(1);
    const boxes = furnitureSolids(f);
    expect(boxes).toHaveLength(f.poles.length + 3);
    // The shelter's back panel is behind its centre, away from the road.
    const back = boxes[f.poles.length]!;
    expect(back.z).toBeGreaterThan(f.shelters[0]!.z);
  });
});
