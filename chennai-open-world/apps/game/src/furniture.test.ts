/**
 * Street furniture on the real city (apps/game/public/world): shelters at the mapped bus stops,
 * poles and kerbs along the main roads, nothing inside a building.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chunkFurniture, chunkKeyAt, decodeChunk, decodeRoads, pointInPolygon, worldFromIndex, type ChunkData, type WorldIndexFile } from "@cow/game-world";

const file = (name: string) => new URL(`../public/world/${name}`, import.meta.url);
const index = JSON.parse(readFileSync(file("index.json"), "utf8")) as WorldIndexFile & { readonly roadNames: readonly string[] };
const city = worldFromIndex(index, decodeRoads(readFileSync(file(index.roads)), index.roadNames));
const sizes = new Map(index.chunks.map(([col, row, size]) => [`${col},${row}`, size]));
const load = (key: string): ChunkData => {
  const [col, row] = key.split(",").map(Number) as [number, number];
  if (!sizes.get(key)) return { key, col, row, buildings: [], trees: [], areas: [] };
  const bytes = readFileSync(file(`c/${col}_${row}.bin`));
  return decodeChunk(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), city.bounds, city.chunkSize);
};
/** The 3 x 3 chunks round a point: Anna Nagar spawn, T. Nagar, Anna Salai. */
const around = (x: number, z: number) => {
  const [c, r] = chunkKeyAt(city.bounds, city.chunkSize, x, z).split(",").map(Number) as [number, number];
  return [-1, 0, 1].flatMap((dc) => [-1, 0, 1].map((dr) => `${c + dc},${r + dr}`)).filter((k) => sizes.has(k)).map(load);
};
const places = [around(40, 60), around(3269, 4960), around(5033, 3180)];

describe("street furniture on the city map", () => {
  it("puts a shelter at nearly every mapped bus stop", () => {
    const stops = city.busStops?.length ?? 0;
    expect(stops).toBeGreaterThan(500);
    let shelters = 0;
    for (const [key] of sizes) {
      const [col, row] = key.split(",").map(Number) as [number, number];
      shelters += chunkFurniture(city, { key, col, row, buildings: [], trees: [], areas: [] }).shelters.length;
    }
    // A few stops are mapped twice, far from a road, or at a junction.
    expect(shelters).toBeGreaterThan(stops * 0.8);
    expect(shelters).toBeLessThanOrEqual(stops);
  });

  it("puts poles and kerbs along the main roads, never inside a building, at modest counts", () => {
    for (const chunks of places) {
      let poles = 0;
      let kerbs = 0;
      for (const chunk of chunks) {
        const f = chunkFurniture(city, chunk);
        poles += f.poles.length;
        kerbs += f.kerbs.length;
        for (const p of [...f.poles, ...f.shelters]) expect(chunk.buildings.some((b) => pointInPolygon(p.x, p.z, b.outline))).toBe(false);
        expect(f.poles.length).toBeLessThan(150);
      }
      expect(poles).toBeGreaterThan(10);
      expect(kerbs).toBeGreaterThan(10);
    }
  });
});
