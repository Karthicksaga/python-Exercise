/**
 * Build step: the city OpenStreetMap extract -> the streamed world files (TD-16).
 *
 *   apps/game/public/world/index.json   always loaded: bounds, places, landmarks, sea, chunk table
 *   apps/game/public/world/roads.bin    every road's centre line (AI, street names, minimap)
 *   apps/game/public/world/c/C_R.bin    one per 250 m chunk: buildings, trees, areas
 *
 * Run with `npm run build:world` after changing the extract or the world rules. The extract is
 * git-ignored (58 MB); how to rebuild it is in assets/osm/README.md. The generated files are
 * committed, so the game builds without the extract.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ANNA_NAGAR_ORIGIN, GeoProjection, parseOsm, type OsmExtract } from "@cow/map-data";
import { buildWorldMap, chunkFile, encodeChunk, encodeRoads, roadSpansByChunk, worldIndex, type ChunkRef } from "@cow/game-world";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "assets/osm/city/chennai-city.osm.json");
const target = resolve(root, "apps/game/public/world");

if (!existsSync(source)) {
  console.error(`${source} is missing. Rebuild it with scripts/clip-city.py (see assets/osm/README.md).`);
  process.exit(1);
}

// The clip box of scripts/clip-city.py: Anna Nagar to T. Nagar, Anna Salai, Marina Beach and
// the start of ECR. The origin stays in Anna Nagar, so the player starts where they always did.
const projection = new GeoProjection(ANNA_NAGAR_ORIGIN);
const southWest = projection.toLocal({ lat: 12.98, lng: 80.195 });
const northEast = projection.toLocal({ lat: 13.095, lng: 80.29 });
// A little inside the box, where clipped roads and buildings are complete.
const bounds = {
  minX: Math.ceil(southWest.x) + 20,
  maxX: Math.floor(northEast.x) - 20,
  minZ: Math.ceil(northEast.z) + 20,
  maxZ: Math.floor(southWest.z) - 20,
};

const started = Date.now();
const extract = JSON.parse(readFileSync(source, "utf8")) as OsmExtract;
const features = parseOsm(extract, ANNA_NAGAR_ORIGIN);
const map = buildWorldMap(features, { name: "Chennai", origin: ANNA_NAGAR_ORIGIN, bounds, chunkSize: 250 });

rmSync(target, { recursive: true, force: true });
mkdirSync(resolve(target, "c"), { recursive: true });
const sizes = new Map<string, number>();
let chunkBytes = 0;
let largest = { key: "", bytes: 0 };
for (const chunk of map.chunks) {
  const bytes = encodeChunk(chunk, map.bounds, map.chunkSize);
  writeFileSync(resolve(target, chunkFile(chunk.col, chunk.row)), bytes);
  sizes.set(chunk.key, bytes.length);
  chunkBytes += bytes.length;
  if (bytes.length > largest.bytes) largest = { key: chunk.key, bytes: bytes.length };
}
// Squares with road surface but nothing else are listed with no file (size 0).
const refs: ChunkRef[] = [...map.chunks];
for (const key of roadSpansByChunk(map.roads, map.bounds, map.chunkSize).keys()) {
  if (sizes.has(key)) continue;
  const [col, row] = key.split(",").map(Number) as [number, number];
  refs.push({ key, col, row });
  sizes.set(key, 0);
}
refs.sort((a, b) => a.row - b.row || a.col - b.col);
const roads = encodeRoads(map.roads);
writeFileSync(resolve(target, "roads.bin"), roads.bytes);
const index = JSON.stringify(worldIndex({ ...map, chunks: refs }, sizes, "roads.bin", roads.names));
writeFileSync(resolve(target, "index.json"), index);

const buildings = map.chunks.reduce((n, c) => n + c.buildings.length, 0);
const trees = map.chunks.reduce((n, c) => n + c.trees.length, 0);
const fromOsm = map.chunks.reduce((n, c) => n + c.buildings.filter((b) => b.heightFrom !== "estimated").length, 0);
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
console.log(
  `World written in ${((Date.now() - started) / 1000).toFixed(1)} s: ${map.roads.length} road pieces, ${buildings} buildings ` +
    `(${fromOsm} with an OSM height or floor count, the rest estimated), ${map.areas.length} areas, ${trees} trees, ${map.pois.length} places, ` +
    `${map.busStops?.length ?? 0} bus stops, ${map.signals?.length ?? 0} signals, ${map.districts?.length ?? 0} districts, data ${map.dataDate}`,
);
console.log(
  `Files: index ${kb(index.length)}, roads ${kb(roads.bytes.length)}, ${map.chunks.length} chunk files ${kb(chunkBytes)} (+${refs.length - map.chunks.length} road-only squares) ` +
    `(largest ${largest.key} ${kb(largest.bytes)}), total ${((index.length + roads.bytes.length + chunkBytes) / 1048576).toFixed(1)} MB`,
);
for (const landmark of map.landmarks ?? []) {
  console.log(`Landmark ${landmark.name} at ${landmark.x}, ${landmark.z} (${landmark.source}; estimated: ${landmark.estimated.join(", ") || "nothing"})`);
}
console.log(`Sea: ${map.sea ? `${map.sea.coast.length} coast points (${map.sea.source})` : "none"}`);
console.log(`Bounds x ${bounds.minX}..${bounds.maxX}, z ${bounds.minZ}..${bounds.maxZ}`);
