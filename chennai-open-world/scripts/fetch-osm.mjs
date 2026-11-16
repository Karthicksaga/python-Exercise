/** Downloads a fresh OpenStreetMap extract for the playable area from the Overpass API. */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const box = "13.0805,80.2056,13.0895,80.2146";
// Ways: buildings, roads, parks and land use, natural features, plus tower and place-of-worship
// outlines (landmarks). Nodes: mapped trees, amenities and shops, landmarks (man_made, tourism,
// historic, places of worship), place names (districts), bus stops and traffic signals.
const parts = [
  'way["building"]',
  'way["highway"]',
  'way["leisure"]',
  'way["landuse"]',
  'way["natural"]',
  'way["man_made"="tower"]',
  'way["amenity"="place_of_worship"]',
  'node["natural"="tree"]',
  'node["amenity"]',
  'node["shop"]',
  'node["man_made"]',
  'node["tourism"]',
  'node["historic"]',
  'node["place"]',
  'node["highway"="bus_stop"]',
  'node["highway"="traffic_signals"]',
];
const query = `[out:json][timeout:60];(${parts.map((p) => `${p}(${box});`).join("")});out body;>;out skel qt;`;
const response = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "osm-extract-script/1.0" },
  body: `data=${encodeURIComponent(query)}`,
});
if (!response.ok) throw new Error(`Overpass API answered ${response.status}. Try again later.`);
const data = await response.json();
// Overpass reports timeouts and memory limits in "remark" with a 200 status and partial data.
if (data.remark) throw new Error(`Overpass API returned partial data: ${data.remark}`);
if (!Array.isArray(data.elements) || data.elements.length === 0) throw new Error("Overpass API returned no elements.");
const target = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/osm/anna-nagar.osm.json");
writeFileSync(target, JSON.stringify(data));
console.log(`Saved ${data.elements.length} elements (data ${data.osm3s?.timestamp_osm_base}). Update assets/osm/README.md with the new date.`);
