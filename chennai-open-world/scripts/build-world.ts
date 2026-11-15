/**
 * Build step: OpenStreetMap extract -> the game's world file.
 * Run with `npm run build:world` after changing the extract or the world rules.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ANNA_NAGAR_ORIGIN, GeoProjection, parseOsm, type OsmExtract } from "@cow/map-data";
import { buildWorldMap } from "@cow/game-world";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "assets/osm/anna-nagar.osm.json");
const target = resolve(root, "apps/game/src/generated/anna-nagar.json");

// The extract's bounding box, as documented in assets/osm/README.md.
const projection = new GeoProjection(ANNA_NAGAR_ORIGIN);
const southWest = projection.toLocal({ lat: 13.0805, lng: 80.2056 });
const northEast = projection.toLocal({ lat: 13.0895, lng: 80.2146 });
const bounds = {
  minX: Math.ceil(southWest.x),
  maxX: Math.floor(northEast.x),
  minZ: Math.ceil(northEast.z),
  maxZ: Math.floor(southWest.z),
};

const extract = JSON.parse(readFileSync(source, "utf8")) as OsmExtract;
const features = parseOsm(extract, ANNA_NAGAR_ORIGIN);
const map = buildWorldMap(features, { name: "Anna Nagar", origin: ANNA_NAGAR_ORIGIN, bounds, chunkSize: 250 });

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(map));
const buildings = map.chunks.reduce((n, c) => n + c.buildings.length, 0);
const trees = map.chunks.reduce((n, c) => n + c.trees.length, 0);
console.log(
  `World written: ${map.roads.length} road pieces, ${buildings} buildings, ${map.areas.length} areas, ${trees} trees, ` +
    `${map.pois.length} places, ${map.chunks.length} chunks, data ${map.dataDate}`,
);
console.log(`Bounds x ${bounds.minX}..${bounds.maxX}, z ${bounds.minZ}..${bounds.maxZ}`);
