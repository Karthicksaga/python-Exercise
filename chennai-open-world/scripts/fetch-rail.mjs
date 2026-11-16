/**
 * Downloads the railway in the map's bounding box from the Overpass API:
 * `railway=rail` ways (suburban, main and MRTS lines, sidings), stations, halts and platforms,
 * level crossings, and the train route relations that use those ways (tags and members, no
 * geometry: the builder follows a suburban route's ways through the map).
 *
 *   node scripts/fetch-rail.mjs          writes assets/osm/rail/chennai-rail.osm.json
 *   npm run build:rail                   turns it into apps/game/public/world/rail.json
 *
 * The box is the city map's clip box (scripts/clip-city.py) plus about 500 m, so lines that run
 * off the map are cut a little outside it and the builder can tell which end leaves the map.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const box = "12.975,80.19,13.10,80.295";
const query = `[out:json][timeout:90];
(
  way["railway"="rail"](${box});
  way["railway"="light_rail"](${box});
  node["railway"~"^(station|halt)$"](${box});
  way["railway"="platform"](${box});
  way["public_transport"="platform"]["train"="yes"](${box});
  node["railway"="level_crossing"](${box});
)->.rail;
.rail out body;
way.rail;
>;
out skel qt;
way.rail;
rel(bw)["route"~"^(train|railway|light_rail)$"];
out body;`;

const hosts = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
let data;
for (const host of hosts) {
  try {
    const response = await fetch(host, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "osm-extract-script/1.0" },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!response.ok) throw new Error(`${host} answered ${response.status}`);
    data = await response.json();
    // Overpass reports timeouts and memory limits in "remark" with a 200 status and partial data.
    if (data.remark) throw new Error(`${host} returned partial data: ${data.remark}`);
    break;
  } catch (error) {
    console.warn(String(error));
    data = undefined;
  }
}
if (!data || !Array.isArray(data.elements) || data.elements.length === 0) throw new Error("No Overpass server returned the railway. Try again later.");
const target = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/osm/rail/chennai-rail.osm.json");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(data));
console.log(`Saved ${data.elements.length} elements (data ${data.osm3s?.timestamp_osm_base}). Update assets/osm/README.md with the new date, then run npm run build:rail.`);
