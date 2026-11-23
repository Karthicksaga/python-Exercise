/**
 * Pavement props on the real city (apps/game/public/world): along the main roads, never inside a
 * building or on a carriageway, within the triangle budget of TD-18.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAIN_ROADS, chunkKeyAt, chunkProps, closestOnSegment, decodeChunk, decodeRoads, pointInPolygon, propCorners, roadSegmentsNear, worldFromIndex, type ChunkData, type WorldIndexFile } from "@cow/game-world";

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

/** Triangles of each model after `optimize:assets` (StreetProps.test.ts reads the same files). */
const TRIANGLES = { handcart: 644, crates: 204, barrel: 258, clayPots: 444 } as const;

describe("pavement props on the city map", () => {
  it("stand along main roads, outside buildings and off every carriageway", () => {
    for (const chunks of places) {
      for (const chunk of chunks) {
        for (const p of chunkProps(city, chunk)) {
          const road = city.roads.find((r) => r.id === p.roadId)!;
          expect(MAIN_ROADS.has(road.kind)).toBe(true);
          for (const c of [p, ...propCorners(p)]) {
            for (const b of chunk.buildings) expect(pointInPolygon(c.x, c.z, b.outline)).toBe(false);
            roadSegmentsNear(city.roads, c.x, c.z, 30, (r, i) => {
              if (r.kind === "footway") return;
              const hit = closestOnSegment(c, r.points[i]!, r.points[i + 1]!);
              expect(Math.sqrt(hit.d2)).toBeGreaterThan(r.width / 2);
            });
          }
        }
      }
    }
  });
  it("add a modest number of triangles round each place", () => {
    for (const chunks of places) {
      const props = chunks.flatMap((c) => [...chunkProps(city, c)]);
      const triangles = props.reduce((n, p) => n + TRIANGLES[p.kind], 0);
      expect(props.length).toBeGreaterThan(5);
      // 3 x 3 chunks; see docs/progress.md for the measured totals.
      console.log(`props ${props.length} triangles ${triangles} ${JSON.stringify(Object.fromEntries(Object.keys(TRIANGLES).map((k) => [k, props.filter((p) => p.kind === k).length])))}`);
      expect(triangles).toBeLessThan(40_000);
    }
  });
});
