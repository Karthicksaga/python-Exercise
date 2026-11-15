/** Downloads a fresh OpenStreetMap extract for the playable area from the Overpass API. */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const box = "13.0805,80.2056,13.0895,80.2146";
const query = `[out:json][timeout:50];(way["building"](${box});way["highway"](${box});way["leisure"](${box});way["landuse"](${box});way["natural"](${box});node["natural"="tree"](${box});node["amenity"](${box});node["shop"](${box}););out body;>;out skel qt;`;
const response = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "osm-extract-script/1.0" },
  body: `data=${encodeURIComponent(query)}`,
});
if (!response.ok) throw new Error(`Overpass API answered ${response.status}. Try again later.`);
const data = await response.json();
const target = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/osm/anna-nagar.osm.json");
writeFileSync(target, JSON.stringify(data));
console.log(`Saved ${data.elements.length} elements (data ${data.osm3s?.timestamp_osm_base}). Update assets/osm/README.md with the new date.`);
