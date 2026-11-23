/**
 * Asset optimisation step (toolchain audit, Phase 1): source GLBs -> game-ready GLBs.
 *
 *   assets/models/*.glb, assets/animations/*.glb  (sources, as exported from Blender or Mixamo)
 *     -> assets/optimized/<same name>.glb          (what the game embeds, TD-3)
 *   assets/models/props/*.glb (made by tools/blender/street_props.py) -> assets/optimized/props/
 *   assets/models/people/*.glb (made by tools/blender/characters.py) -> assets/optimized/people/
 *     (people.json, the cast list, is copied as it is; `*_lod1.glb` get 128 px textures)
 *
 * For every file: drop unused data (dedup, prune), drop facial blend shapes (the game never
 * uses them, `HumanAssets` threw them away at load), weld vertices, resample animation keys,
 * resize textures to at most MAX_TEXTURE px and re-encode them as WebP, quantise geometry and
 * compress it with EXT_meshopt_compression (the game's GLTFLoader has the MeshoptDecoder; its
 * WebAssembly is embedded in the decoder, so it also works from the APK).
 *
 * KTX2 textures would cut GPU memory further but need the KTX-Software `ktx` CLI and the Basis
 * transcoder in the game (fetched with `fetch`, see TD-16); that is a later step.
 *
 * Run with `npm run optimize:assets` after adding or changing a model. Prints sizes before and after.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "assets/optimized");
const MAX_TEXTURE = 512;
/** The player is seen close up: its textures keep up to 1024 px. */
const LARGE_TEXTURE = { "player.glb": 1024 };
/** Distant pedestrians (LOD1, `*_lod1.glb`) are a few dozen pixels tall: 128 px is plenty. */
const textureSize = (name) => LARGE_TEXTURE[name] ?? (name.endsWith("_lod1.glb") ? 128 : MAX_TEXTURE);

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

/** Remove morph targets (blend shapes): facial expressions the game never plays. */
function dropMorphTargets() {
  return (document) => {
    for (const mesh of document.getRoot().listMeshes()) {
      mesh.setWeights([]);
      for (const primitive of mesh.listPrimitives()) for (const target of primitive.listTargets()) primitive.removeTarget(target);
    }
  };
}

// Each source folder maps to a folder under assets/optimized (props keep their own folder).
const folders = [
  ["assets/models", ""],
  ["assets/animations", ""],
  ["assets/models/props", "props"],
  ["assets/models/vehicles", "vehicles"],
  ["assets/models/people", "people"],
];
const sources = folders.flatMap(([dir, sub]) =>
  readdirSync(resolve(root, dir))
    .filter((name) => name.endsWith(".glb"))
    .map((name) => ({ path: resolve(root, dir, name), sub })),
);

mkdirSync(out, { recursive: true });
let before = 0;
let after = 0;
for (const { path: source, sub } of sources) {
  const document = await io.read(source);
  await document.transform(
    dropMorphTargets(),
    dedup(),
    // Keep leaf nodes: bone ends (HeadTop_End, toe ends) measure the figure and anchor retargeting.
    prune({ keepLeaves: true }),
    weld(),
    resample(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: Array(2).fill(textureSize(basename(source))), quality: 82 }),
    // People: "high" (stronger quantisation and filters) roughly halves their geometry; checked in game.
    meshopt({ encoder: MeshoptEncoder, level: sub === "people" ? "high" : "medium" }),
  );
  document.createExtension(EXTMeshoptCompression).setRequired(true);
  mkdirSync(join(out, sub), { recursive: true });
  const target = join(out, sub, basename(source));
  await io.write(target, document);
  const a = statSync(source).size;
  const b = statSync(target).size;
  before += a;
  after += b;
  console.log(`${basename(source)}: ${(a / 1024).toFixed(0)} KB -> ${(b / 1024).toFixed(0)} KB`);
}
console.log(`Total: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB in ${out}`);
const cast = resolve(root, "assets/models/people/people.json");
if (existsSync(cast)) copyFileSync(cast, join(out, "people", "people.json"));
