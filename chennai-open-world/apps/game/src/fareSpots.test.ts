/**
 * Where passengers wait, on the real map (apps/game/public/world): every pick-up and drop of the
 * stages and jobs has a pavement spot beside its marker, off the carriageway and outside buildings.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chunkKeyAt, decodeChunk, decodeRoads, nearestRoadPoint, onOtherRoad, pointInPolygon, worldFromIndex, type ChunkData, type Point, type WorldIndexFile } from "@cow/game-world";
import type { Fare } from "@cow/missions";
import { buildContent } from "./content";
import { KERB_STEP, kerbSpot } from "./fareSpots";

const file = (name: string) => new URL(`../public/world/${name}`, import.meta.url);
const index = JSON.parse(readFileSync(file("index.json"), "utf8")) as WorldIndexFile & { readonly roadNames: readonly string[] };
const city = worldFromIndex(index, decodeRoads(readFileSync(file(index.roads)), index.roadNames));
const content = buildContent(city);
const sizes = new Map(index.chunks.map(([col, row, size]) => [`${col},${row}`, size]));
const chunks = new Map<string, ChunkData>();
const chunkAt = (p: Point): ChunkData => {
  const key = chunkKeyAt(city.bounds, city.chunkSize, p.x, p.z);
  let chunk = chunks.get(key);
  if (!chunk) {
    const [col, row] = key.split(",").map(Number) as [number, number];
    if (!sizes.get(key)) chunk = { key, col, row, buildings: [], trees: [], areas: [] };
    else {
      const bytes = readFileSync(file(`c/${col}_${row}.bin`));
      chunk = decodeChunk(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), city.bounds, city.chunkSize);
    }
    chunks.set(key, chunk);
  }
  return chunk;
};
const streets = { roads: city.roads.filter((r) => r.kind !== "footway") };

/** Every fare in the game with the marker it belongs to. */
const fares: Array<{ where: string; stop: Point & { radius: number }; fare: Fare }> = [
  ...content.missions.flatMap((m) => m.objectives.flatMap((o) => (o.type === "reach" && o.fare ? [{ where: `stage ${m.stage}: ${o.label}`, stop: o, fare: o.fare }] : []))),
  ...content.jobs.flatMap((j) => j.stops.flatMap((s) => (s.fare ? [{ where: `${j.id}: ${s.label}`, stop: s, fare: s.fare }] : []))),
];

describe("passengers' waiting spots", () => {
  it("are given for stage 3, the new stages, and every cab, ambulance and bus job", () => {
    const where = fares.map((f) => f.where);
    expect(where.filter((w) => w.startsWith("stage 3:"))).toHaveLength(2);
    expect(where.filter((w) => /^stage (16|18):/.test(w))).toHaveLength(4);
    for (const id of ["ambulance-run", "cab-ride", "bus-route", "hospital-transfer", "tower-park-visit", "evening-bus", "marina-evening", "egmore-transfer", "mount-road-bus"]) {
      const job = content.jobs.find((j) => j.id === id)!;
      expect(job.stops.every((s) => s.fare), id).toBe(true);
    }
    // Parcels and lunch boxes are not people.
    expect(content.jobs.find((j) => j.id === "courier")!.stops.some((s) => s.fare)).toBe(false);
  });

  it("stand on the pavement beside the marker: off the carriageway, outside buildings, close enough to walk", () => {
    for (const { where, stop, fare } of fares) {
      const kerb = fare.kerb;
      // Beside the stop's own road, and on no road's carriageway.
      const own = nearestRoadPoint(streets, stop)!.road;
      const road = nearestRoadPoint({ roads: streets.roads.filter((r) => r === own || (own.name !== undefined && r.name === own.name)) }, kerb)!;
      expect(road.distance, `${where}: off the carriageway`).toBeGreaterThan(own.width / 2 + 0.3);
      expect(onOtherRoad(streets.roads, kerb, own.id, 0.3), `${where}: on another road`).toBe(false);
      // Slid along the road at most 20 m to get clear of a junction.
      expect(Math.hypot(road.distance - (own.width / 2 + KERB_STEP), 0), `${where}: beside it`).toBeLessThan(1.5);
      // A short walk from where the vehicle stops (it can be anywhere in the marker).
      expect(Math.hypot(kerb.x - stop.x, kerb.z - stop.z), where).toBeLessThan(stop.radius + 22);
      const inside = chunkAt(kerb).buildings.some((b) => pointInPolygon(kerb.x, kerb.z, b.outline));
      expect(inside, `${where}: inside a building`).toBe(false);
    }
  });

  it("picks the side the real place is on", () => {
    // A stretch of 5th Avenue with nothing else on either side (the spawn itself is a junction).
    const clear = (p: Point) => {
      const hit = nearestRoadPoint(streets, p)!;
      const r = { x: Math.cos(hit.heading), z: -Math.sin(hit.heading) };
      const out = hit.road.width / 2 + 0.9;
      return [1, -1].every((s) => !onOtherRoad(streets.roads, { x: hit.x + r.x * out * s, z: hit.z + r.z * out * s }, hit.road.id, 0.5));
    };
    let probe: Point = { x: 40, z: 60 };
    for (let k = 0; k < 40 && !clear(probe); k++) probe = { x: 40 - k * 10, z: 60 };
    const stop = nearestRoadPoint(streets, probe)!;
    const right = { x: Math.cos(stop.heading), z: -Math.sin(stop.heading) };
    const onRight = kerbSpot(streets, stop, { x: stop.x + right.x * 30, z: stop.z + right.z * 30 });
    const onLeft = kerbSpot(streets, stop, { x: stop.x - right.x * 30, z: stop.z - right.z * 30 });
    expect((onRight.x - stop.x) * right.x + (onRight.z - stop.z) * right.z).toBeGreaterThan(0);
    expect((onLeft.x - stop.x) * right.x + (onLeft.z - stop.z) * right.z).toBeLessThan(0);
  });
});
