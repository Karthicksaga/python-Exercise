// Writes tests/fixtures/projection_reference.json from the Three.js game's own GeoProjection
// (chennai-open-world/packages/map-data/src/projection.ts), so the Python port is checked
// against the real thing. Run: node --experimental-transform-types scripts/projection-reference.mts
import { writeFileSync } from "node:fs";
import { ANNA_NAGAR_ORIGIN, GeoProjection } from "../../../../chennai-open-world/packages/map-data/src/projection.ts";

const p = new GeoProjection(ANNA_NAGAR_ORIGIN);
const places: Array<[string, number, number]> = [
  ["origin", 13.085, 80.2101],
  ["ring0-sw", 12.98, 80.195],
  ["ring0-ne", 13.095, 80.29],
  ["airport", 12.9941, 80.1709],
  ["chengalpattu", 12.6921, 79.9766],
  ["sriperumbudur", 12.9675, 79.9419],
  ["pulicat", 13.4167, 80.3167],
  ["border-coast", 13.5639, 80.2639],
  ["ennore", 13.2146, 80.3203],
  ["tambaram", 12.9249, 80.1],
  ["world-se", 12.68, 80.4],
  ["world-nw", 13.6, 79.95],
];
const points = places.map(([name, lat, lng]) => {
  const l = p.toLocal({ lat, lng });
  const back = p.toLatLng(l);
  return { name, lat, lng, x: l.x, z: l.z, backLat: back.lat, backLng: back.lng };
});
writeFileSync(new URL("../tests/fixtures/projection_reference.json", import.meta.url), JSON.stringify({ generatedBy: "scripts/projection-reference.mts", origin: ANNA_NAGAR_ORIGIN, points }, null, 1) + "\n");
console.log(`${points.length} reference points written`);
