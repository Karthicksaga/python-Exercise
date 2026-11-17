/**
 * Build step: the OSM railway extract -> apps/game/public/world/rail.json (committed, small).
 *
 *   npm run build:rail
 *
 * The extract is `assets/osm/rail/chennai-rail.osm.json`, from `scripts/clip-rail.py` (the same
 * openstreetmap.fr Tamil Nadu extract as the city) or `scripts/fetch-rail.mjs` (Overpass). The
 * map's bounds and origin are read from the world index, so the railway lines up with the city.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ANNA_NAGAR_ORIGIN } from "@cow/map-data";
import { buildRail, type RailExtract } from "@cow/rail";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const index = JSON.parse(readFileSync(resolve(root, "apps/game/public/world/index.json"), "utf8")) as { bounds: { minX: number; maxX: number; minZ: number; maxZ: number } };
const extract = JSON.parse(readFileSync(resolve(root, "assets/osm/rail/chennai-rail.osm.json"), "utf8")) as RailExtract;

const file = buildRail(extract, {
  origin: ANNA_NAGAR_ORIGIN,
  bounds: index.bounds,
  margin: 150,
  // The Beach–Tambaram suburban service, one route relation per direction (each on its own track).
  // Headways are estimated (the real service is every few minutes at the peak); the offsets keep
  // the two directions from meeting at the same stations at the same moment.
  lines: [
    { id: "beach-tambaram", relation: 1289050, name: "Chennai Beach – Tambaram", from: "Chennai Beach", to: "Tambaram", headwayMinutes: 8, offsetMinutes: 0 },
    { id: "tambaram-beach", relation: 20986091, name: "Tambaram – Chennai Beach", from: "Tambaram", to: "Chennai Beach", headwayMinutes: 8, offsetMinutes: 3 },
  ],
  // Common short names for stations whose OSM name is the long official one.
  names: {
    "Puratchi Thalaivar Dr. M. G. Ramachandran Central": ["Chennai Central", "சென்னை சென்ட்ரல்"],
    "Chennai Chetpet": ["Chetpet", "சேத்துப்பட்டு"],
    "Chennai Park": ["Park", "பூங்கா"],
    "Chennai Park Town": ["Park Town", "பூங்கா நகர்"],
    "Saint Thomas Mount": ["St. Thomas Mount", "பரங்கிமலை"],
  },
  // The MRTS runs on a viaduct and the Metro mostly underground or on viaducts; drawn at ground
  // level they would cut through streets, so only tracks at ground level (or short bridges over
  // roads and rivers, drawn flat) are kept.
  skipTrack: (tags) => /MRTS/i.test(tags.name ?? "") || tags.tunnel === "yes" || tags.bridge === "viaduct" || Number(tags.layer ?? 0) >= 2 || tags.railway !== "rail",
});

const target = resolve(root, "apps/game/public/world/rail.json");
const text = JSON.stringify(file);
writeFileSync(target, text);
console.log(`${file.tracks.length} tracks, ${file.lines.length} lines, ${file.stations.length} stations, ${(text.length / 1024).toFixed(0)} KB -> ${target}`);
for (const line of file.lines) {
  console.log(`  ${line.name}: from ${line.from.name}${line.from.beyond ? " (beyond the map)" : ""} to ${line.to.name}${line.to.beyond ? " (beyond the map)" : ""}`);
  for (const stop of line.stops) console.log(`    ${stop.s.toFixed(0).padStart(6)} m  ${stop.name} / ${stop.nameTa}  side ${stop.side}`);
}
