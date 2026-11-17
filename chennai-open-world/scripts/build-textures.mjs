/**
 * Photographed surface textures: Poly Haven (CC0) scans -> game-ready WebP in assets/textures/.
 *
 *   https://dl.polyhaven.org/.../<id>_diff_1k.jpg, <id>_nor_gl_1k.jpg
 *     -> assets/textures/<surface>-albedo.webp, <surface>-normal.webp   (512 px, embedded, TD-3)
 *     -> assets/textures/sources.json                                    (ids, URLs, licence, SHA-256)
 *
 * Every source is CC0 1.0 (public domain); no attribution is required, but it is recorded in
 * sources.json and assets/README.md anyway. Most are Amal Kumar's scans from Kerala, so the
 * plaster, pavers, laterite and Mangalore tiles are South Indian surfaces.
 *
 * Steps per map: download the 1k JPEG (cached), shrink to SIZE px with the edges wrapped so the
 * result still tiles, adjust colour (below), encode WebP. Colour adjustments:
 *  - `neutral`: scale each channel so its mean is the given grey. Walls are tinted by vertex
 *    colour (each building's own paint), so the plaster must carry the photo's detail but not
 *    its colour.
 *  - `modulate`: sharp brightness/saturation, to move a scan towards Chennai's look (the
 *    laterite is drier and dustier in the city than in the scan; the roof tiles older, the
 *    asphalt darker than the sun-bleached scan).
 *  - `flatten`: remove that share (0-1) of the scan's large blotches (divide by a wrapped
 *    blur), keeping the grain. Big flat areas repeat the photo every few metres, and blotches
 *    are what makes the repeat show as a grid from a distance. `flattenRadius` (px, default
 *    51) sets how large a blotch is.
 * Roughness maps are not shipped: each material keeps one roughness (and the rain look changes
 * it), which saves a texture per surface on phones.
 *
 * Run with `npm run build:textures` (needs the network the first time; downloads are cached in
 * the OS temp folder, or `--cache <dir>`). Commit the output.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "assets/textures");
const cacheFlag = process.argv.indexOf("--cache");
const cache = cacheFlag > 0 ? resolve(process.argv[cacheFlag + 1]) : join(tmpdir(), "cow-texture-sources");
const SIZE = 512;
const LICENCE = "CC0 1.0 Universal (public domain dedication)";

/**
 * One entry per game surface. `metres` is the real width the scan covers (Poly Haven's
 * `dimensions`), for setting the repeat in the game. `normal: false` ships the albedo only.
 */
const SURFACES = [
  { surface: "asphalt", id: "asphalt_04", author: "Sergej Majboroda (photography), Jenelle van Heerden (processing)", metres: 4, what: "Worn, sun-bleached grey asphalt with faint patches (roads)", modulate: { brightness: 0.72, saturation: 0.8 }, flatten: 0.25 },
  { surface: "paving", id: "concrete_pavers", author: "Amal Kumar", metres: 1.92, what: "Grey I-shaped interlocking cement pavers (footpaths and verges)", modulate: { brightness: 1.25, saturation: 0.9 } },
  { surface: "earth", id: "red_laterite_soil_stones", author: "Amal Kumar", metres: 2, what: "Red laterite soil with stones (bare ground)", modulate: { brightness: 2, saturation: 0.55, hue: 18 }, flatten: 0.6, normal: false },
  { surface: "sand", id: "sand_01", author: "Rob Tuytel", metres: 1.5, what: "Pale fine sand (Marina beach, sand areas)", modulate: { brightness: 1.15, saturation: 0.85 }, flatten: 0.8, flattenRadius: 12, normal: false },
  { surface: "grass", id: "sparse_grass", author: "Amal Kumar", metres: 2, what: "Sparse grass on soil (parks)", normal: false },
  { surface: "plaster", id: "painted_plaster_wall", author: "Amal Kumar", metres: 2, what: "Painted plaster wall (building walls, drawn into the facade atlas)", neutral: 0.9, normal: false },
  { surface: "roof", id: "clay_roof_tiles_02", author: "Amal Kumar", metres: 2.5, what: "Mangalore-pattern clay roof tiles (pitched roofs)", modulate: { brightness: 0.9, saturation: 0.78 } },
];

const url = (id, map) => `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${id}/${id}_${map}_1k.jpg`;

async function download(id, map) {
  const file = join(cache, `${id}_${map}_1k.jpg`);
  if (!existsSync(file)) {
    const response = await fetch(url(id, map));
    if (!response.ok) throw new Error(`${url(id, map)}: ${response.status}`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  const bytes = readFileSync(file);
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/** Shrink a tileable image to SIZE px, wrapping its edges so the result still tiles. */
async function shrink(bytes) {
  const meta = await sharp(bytes).metadata();
  const pad = Math.round((meta.width / SIZE) * 8);
  const padded = await sharp(bytes).extend({ top: pad, bottom: pad, left: pad, right: pad, extendWith: "repeat" }).toBuffer();
  const border = Math.round((pad * SIZE) / meta.width);
  return sharp(padded)
    .resize(SIZE + 2 * border, SIZE + 2 * border, { kernel: "lanczos3" })
    .extract({ left: border, top: border, width: SIZE, height: SIZE })
    .removeAlpha()
    .toBuffer();
}

/** Divide out `strength` of the low-frequency variation of a SIZE px RGB image (wrapped). */
async function flatten(image, strength, radius = SIZE / 10) {
  const { data } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  const wide = await sharp(image).extend({ top: SIZE, bottom: SIZE, left: SIZE, right: SIZE, extendWith: "repeat" }).blur(radius).toBuffer();
  const blur = await sharp(wide).extract({ left: SIZE, top: SIZE, width: SIZE, height: SIZE }).raw().toBuffer();
  const mean = [0, 1, 2].map((c) => {
    let sum = 0;
    for (let i = c; i < data.length; i += 3) sum += data[i];
    return sum / (data.length / 3);
  });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) out[i] = Math.min(255, Math.round(data[i] * (mean[i % 3] / Math.max(1, blur[i])) ** strength));
  return sharp(out, { raw: { width: SIZE, height: SIZE, channels: 3 } }).png().toBuffer();
}

async function albedo(entry, bytes) {
  let image = sharp(await shrink(bytes));
  if (entry.flatten) image = sharp(await flatten(await image.png().toBuffer(), entry.flatten, entry.flattenRadius));
  if (entry.modulate) image = sharp(await image.modulate(entry.modulate).toBuffer());
  if (entry.neutral !== undefined) {
    const { channels } = await image.stats();
    const target = entry.neutral * 255;
    image = image.linear(channels.slice(0, 3).map((c) => target / c.mean), [0, 0, 0]);
  }
  return image.webp({ quality: 82, effort: 6 }).toBuffer();
}

async function normal(bytes) {
  return sharp(await shrink(bytes)).webp({ quality: 80, effort: 6 }).toBuffer();
}

mkdirSync(cache, { recursive: true });
mkdirSync(out, { recursive: true });
const record = [];
let total = 0;
for (const entry of SURFACES) {
  const maps = [["diff", "albedo"], ...(entry.normal === false ? [] : [["nor_gl", "normal"]])];
  const files = [];
  for (const [map, kind] of maps) {
    const source = await download(entry.id, map);
    const data = kind === "albedo" ? await albedo(entry, source.bytes) : await normal(source.bytes);
    const name = `${entry.surface}-${kind}.webp`;
    writeFileSync(join(out, name), data);
    total += data.length;
    files.push({ file: name, source: url(entry.id, map), sourceSha256: source.sha256, bytes: data.length });
    console.log(`${name.padEnd(22)} ${(data.length / 1024).toFixed(1).padStart(6)} KB  <- ${entry.id} ${map}`);
  }
  record.push({
    surface: entry.surface,
    what: entry.what,
    polyHavenId: entry.id,
    page: `https://polyhaven.com/a/${entry.id}`,
    author: entry.author,
    licence: LICENCE,
    metres: entry.metres,
    size: SIZE,
    processing: { neutral: entry.neutral ?? null, modulate: entry.modulate ?? null, flatten: entry.flatten ?? null, flattenRadius: entry.flattenRadius ?? null },
    files,
  });
}
writeFileSync(join(out, "sources.json"), JSON.stringify(record, null, 2) + "\n");
console.log(`total ${(total / 1024).toFixed(0)} KB in ${record.reduce((n, r) => n + r.files.length, 0)} files`);
