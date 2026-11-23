/**
 * The people manifest and their model files. The cast's models are files next to the page (served
 * from the APK's assets like the world files, TD-16), each fetched only when someone first needs
 * that person (`HumanAssets.look`); the player's model is `?inline` in the script (TD-3).
 *
 * `assets/models/people/people.json` is the real manifest, written by the assets pipeline
 * (`docs/characters.md`). A `people.fixture.json` beside it is used only when there is no real
 * manifest. Any manifest of the same schema works.
 */
import { parsePeopleManifest, type PeopleSources } from "@cow/player";

const manifests = import.meta.glob<unknown>("../../../assets/models/people/people*.json", { eager: true, import: "default" });
// The cast's models are separate files beside the page, fetched when someone first needs that
// person: inlined as base64 they made the one script 16 MB, which a phone must read, parse and
// hold in memory before the loading screen can even start (23 Nov 2026, TD-25). The player's own
// model stays inline: the game cannot start without it.
const castModels = import.meta.glob<string>("../../../assets/optimized/people/**/*.glb", { query: "?url", import: "default" });
const playerModels = import.meta.glob<string>("../../../assets/optimized/player.glb", { query: "?inline", import: "default" });
const models = { ...castModels, ...playerModels };

const OPTIMIZED = "/assets/optimized/";

/** The manifest in use and its files keyed as the manifest names them (`people/x.glb`), or undefined when there is none. */
export function peopleSources(): PeopleSources | undefined {
  const pick = (name: string) => Object.entries(manifests).find(([path]) => path.endsWith(`/${name}`))?.[1];
  const json = pick("people.json") ?? pick("people.fixture.json");
  if (json === undefined) return undefined;
  const { manifest, problems } = parsePeopleManifest(json);
  if (problems.length > 0) console.warn(`People manifest: ${problems.join("; ")}`);
  const files: Record<string, () => Promise<string>> = {};
  for (const [path, load] of Object.entries(models)) {
    const at = path.indexOf(OPTIMIZED);
    if (at >= 0) files[path.slice(at + OPTIMIZED.length)] = load;
  }
  const missing = manifest.people.filter((p) => !files[p.file]).map((p) => p.file);
  if (missing.length > 0) console.warn(`People manifest: no optimised model for ${missing.join(", ")} (run npm run optimize:assets).`);
  return { manifest: { ...manifest, people: manifest.people.filter((p) => files[p.file]) }, files };
}
