/**
 * Bakes the Three.js game's content tables (21 stages, the city jobs, enemy groups, parking,
 * gangs, crews, weapon pickups, life places and stories) into one JSON file the Godot rules load
 * (`src/missions/content/content.json`, decision G-41).
 *
 * The content is placed on the real map by `chennai-open-world/apps/game/src/content.ts`
 * (snapped to roads, kerbs and mapped places), so it is built here with that same code against
 * the same world files: the numbers are identical, not re-derived. Re-run it when the world data
 * or the content changes:
 *
 *   cd chennai-open-world && npm ci   # once
 *   node_modules/.bin/tsx ../godot-chennai/tools/rules/export_content.ts [chennai-open-world dir] [out file]
 *
 * Read-only on `chennai-open-world/`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeRoads, worldFromIndex, type WorldIndexFile } from "../../../chennai-open-world/packages/game-world/src/index";
import { buildContent } from "../../../chennai-open-world/apps/game/src/content";
import { buildPlaces } from "../../../chennai-open-world/apps/game/src/places";

const root = resolve(process.argv[2] ?? resolve(__dirname, "../../../chennai-open-world"));
const out = resolve(process.argv[3] ?? resolve(__dirname, "../../src/missions/content/content.json"));
const world = (name: string) => resolve(root, "apps/game/public/world", name);
const index = JSON.parse(readFileSync(world("index.json"), "utf8")) as WorldIndexFile & { readonly roadNames: readonly string[] };
const city = worldFromIndex(index, decodeRoads(readFileSync(world(index.roads)), index.roadNames));
const content = buildContent(city);
// The life places (home, hospital, gym, mall, cinema) and their short stories (`places.ts`),
// placed on the same map against the same parking (missions agent, G-131).
const life = buildPlaces(city, content);
const baked = {
  format: "chennai-rules-content",
  version: 1,
  source: "chennai-open-world/apps/game/src/content.ts (buildContent) on apps/game/public/world",
  ...content,
  places: life.places,
  stories: life.stories,
};
writeFileSync(out, JSON.stringify(baked, null, 1) + "\n");
console.log(`${out}: ${content.missions.length} stages, ${content.jobs.length} jobs, ${Object.keys(content.enemies).length} enemy groups, ${content.parking.length} parking spots, ${content.crews.length} crews, ${content.pickups.length} pickups, ${life.places.length} places, ${life.stories.length} stories`);
