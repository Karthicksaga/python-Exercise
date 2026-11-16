/**
 * Street props: the Blender models in `assets/models/props` (made by `tools/blender/street_props.py`,
 * optimised by `npm run optimize:assets`) placed in the streets.
 *
 * - Pavement props (handcarts, crates, barrels, clay pots) are placed by game-world
 *   (`chunkProps`), which also makes them solid.
 * - Fixtures on buildings (wall AC units, rooftop dish antennas) are decided here from the
 *   building and its facade plan (`buildingFixtures`), like the facade kit, because they must
 *   keep clear of the balconies and water tanks the renderer adds. They are out of reach, so
 *   they are not solid.
 *
 * Every model is baked once into one geometry with its material colours as vertex colours, and a
 * chunk's props are merged into **two meshes**, whatever the number of props: the pavement props,
 * which cast shadows, and the wall and roof fixtures, which don't (high up and small, their
 * shadows cost a second pass over their triangles for almost nothing on screen). The shutter's and the handcart's animation clips are not used
 * (the props stand still); the facade kit rolls its own shutters on the GPU.
 *
 * Street life (`streetLife.ts` in game-world) adds the realistic set: tea-stall counters, flower
 * stalls, fruit pushcarts, chair stacks and parked two-wheelers into the pavement mesh, and
 * awnings over shop fronts (`FacadeKit.shopAwnings`) and overhead cables into the fixtures mesh.
 * Props that are only out while a shop is open carry its hours in an `aHours` attribute; the
 * material's vertex shader folds them away outside those hours (one uniform, `STREET_HOUR`).
 * Bikes and chairs are recoloured per copy: their `paint` material is white in the model.
 */
import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { pointInPolygon, type Building, type LifeKind, type PropKind, type PropPlacement, type ShopHours } from "@cow/game-world";
import type { FacadePlan } from "./FacadeKit";
import { hash } from "./hash";
import type { Look } from "./lighting";
import { STREET_HOUR } from "./streetHour";

type BaseModel = PropKind | "acUnit" | "dish";
/** Models of the street-life set; optional, so the game still starts without them. */
export type ExtraModel = LifeKind | "awning";
export type PropModel = BaseModel | ExtraModel;

/** Model URLs (data URLs from `?inline` imports in the game, TD-3). */
export type PropSources = Readonly<Record<BaseModel, string>> & Readonly<Partial<Record<ExtraModel, string>>>;

/** One placed model: position of its base, yaw (0 keeps the model's own axes). */
export interface PropInstance {
  readonly model: PropModel;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  /** Stretch along the model's X (an awning across a shop front); 1 by default. */
  readonly sx?: number;
  /** 0 to 1: picks the paint colour of models with a `paint` material (bikes, chairs). */
  readonly tint?: number;
  /** Only shown between these hours (a stall out while its shop is open); always without. */
  readonly hours?: ShopHours;
}

/** A model baked for merging: positions, normals and colours, non-indexed. */
interface Baked {
  readonly position: Float32Array;
  readonly normal: Float32Array;
  readonly color: Float32Array;
  /** 1 for vertices of the `paint` material (recoloured per copy), else 0. */
  readonly paint: Uint8Array;
}

export interface PropAssets {
  readonly models: Readonly<Record<BaseModel, Baked>> & Readonly<Partial<Record<ExtraModel, Baked>>>;
  readonly material: THREE.MeshStandardMaterial;
  /** Shadow pass for props with hours: hidden props cast no shadow. */
  readonly depth: THREE.MeshDepthMaterial;
}

/**
 * Frame of each model after baking: every model's lowest point is at y = 0. Pavement props are
 * centred on their footprint and face -Z (towards the road). Wall fixtures keep their back at
 * z = 0 (against the wall or the roof's edge) and face +Z, out of it.
 */
const WALL_MOUNTED: ReadonlySet<PropModel> = new Set<PropModel>(["acUnit", "dish", "awning", "teaStall", "flowerStall"]);
/** Models that keep their own height above the wall's foot (the awning hangs 1.7 to 2.6 m up). */
const KEEP_HEIGHT: ReadonlySet<PropModel> = new Set<PropModel>(["awning"]);

/** Paint of parked two-wheelers and of moulded chairs (linear RGB), picked per copy by `tint`. */
const BIKE_PAINT: ReadonlyArray<readonly [number, number, number]> = [
  [0.02, 0.02, 0.02], [0.02, 0.02, 0.02], [0.45, 0.02, 0.02], [0.03, 0.08, 0.35], [0.35, 0.36, 0.38], [0.18, 0.01, 0.02], [0.7, 0.7, 0.7], [0.12, 0.12, 0.13],
];
const CHAIR_PAINT: ReadonlyArray<readonly [number, number, number]> = [[0.5, 0.02, 0.02], [0.5, 0.02, 0.02], [0.75, 0.75, 0.72], [0.03, 0.12, 0.42], [0.04, 0.25, 0.06]];

/** Bake a glTF scene: transforms applied, material colours into vertex colours, one array set. */
function bake(scene: THREE.Object3D, model: PropModel): { baked: Baked; box: THREE.Box3 } {
  scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const source = (node.geometry as THREE.BufferGeometry).index ? (node.geometry as THREE.BufferGeometry).toNonIndexed() : (node.geometry as THREE.BufferGeometry).clone();
    source.applyMatrix4(node.matrixWorld);
    if (!source.getAttribute("normal")) source.computeVertexNormals();
    const count = source.getAttribute("position").count;
    const color = new Float32Array(count * 3);
    const paint = new Uint8Array(count);
    const tint = new THREE.Color();
    // Groups map vertex ranges to materials when a mesh has several.
    const groups = source.groups.length > 0 ? source.groups : [{ start: 0, count, materialIndex: 0 }];
    for (const g of groups) {
      const material = materials[g.materialIndex ?? 0] as THREE.MeshStandardMaterial | undefined;
      tint.copy(material?.color ?? new THREE.Color(1, 1, 1));
      const painted = material?.name === "prop_paint" ? 1 : 0;
      for (let v = g.start; v < Math.min(count, g.start + g.count); v++) {
        tint.toArray(color, v * 3);
        paint[v] = painted;
      }
    }
    // Wear baked in Blender (COLOR_0: darker towards the ground) multiplies the paint.
    const wear = source.getAttribute("color");
    if (wear) for (let v = 0; v < count; v++) for (let k = 0; k < 3; k++) color[v * 3 + k] = color[v * 3 + k]! * wear.getComponent(v, k);
    // Quantised attributes (meshopt, KHR_mesh_quantization) are read through getX/Y/Z, which
    // undo the normalisation, into plain floats.
    const floats = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
      const out = new Float32Array(count * 3);
      for (let v = 0; v < count; v++) out.set([attribute.getX(v), attribute.getY(v), attribute.getZ(v)], v * 3);
      return new THREE.BufferAttribute(out, 3);
    };
    const part = new THREE.BufferGeometry();
    part.setAttribute("position", floats(source.getAttribute("position")));
    part.setAttribute("normal", floats(source.getAttribute("normal")));
    part.setAttribute("color", new THREE.BufferAttribute(color, 3));
    part.setAttribute("paint", new THREE.BufferAttribute(paint, 1));
    parts.push(part);
    source.dispose();
  });
  const total = parts.reduce((n, p) => n + p.getAttribute("position").count, 0);
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
  const paint = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    position.set(part.getAttribute("position").array as Float32Array, offset * 3);
    normal.set(part.getAttribute("normal").array as Float32Array, offset * 3);
    color.set(part.getAttribute("color").array as Float32Array, offset * 3);
    paint.set(part.getAttribute("paint").array as Uint8Array, offset);
    offset += part.getAttribute("position").count;
    part.dispose();
  }
  const box = new THREE.Box3();
  for (let i = 0; i < total; i++) box.expandByPoint(new THREE.Vector3(position[i * 3]!, position[i * 3 + 1]!, position[i * 3 + 2]!));
  // Every model stands on y = 0; pavement props are also centred on their footprint.
  const centre = !WALL_MOUNTED.has(model);
  const cx = centre ? (box.min.x + box.max.x) / 2 : 0;
  const cz = centre ? (box.min.z + box.max.z) / 2 : 0;
  const y0 = KEEP_HEIGHT.has(model) ? 0 : box.min.y;
  for (let i = 0; i < total; i++) {
    position[i * 3] = position[i * 3]! - cx;
    position[i * 3 + 1] = position[i * 3 + 1]! - y0;
    position[i * 3 + 2] = position[i * 3 + 2]! - cz;
  }
  box.translate(new THREE.Vector3(-cx, -y0, -cz));
  return { baked: { position, normal, color, paint }, box };
}

/** Load and bake every prop model once. Rejects if a model is missing or broken. */
export async function loadPropAssets(sources: PropSources): Promise<PropAssets & { readonly bounds: Readonly<Record<PropModel, THREE.Box3>> }> {
  // The optimised models use meshopt compression; the decoder embeds its WebAssembly (TD-16).
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const names = (Object.keys(sources) as PropModel[]).filter((name) => sources[name] !== undefined);
  // Fetched, then parsed: the same in the WebView, the browser and Node (unit tests).
  const scenes = await Promise.all(
    names.map(async (name) => {
      const response = await fetch(sources[name]!);
      if (!response.ok) throw new Error(`Prop model ${name} could not be read (${response.status})`);
      return loader.parseAsync(await response.arrayBuffer(), "");
    }),
  );
  const models = {} as Record<PropModel, Baked>;
  const bounds = {} as Record<PropModel, THREE.Box3>;
  names.forEach((name, i) => {
    const { baked, box } = bake(scenes[i]!.scene, name);
    models[name] = baked;
    bounds[name] = box;
  });
  const material = createPropMaterial();
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = hideOutsideHours;
  return { models, bounds, material, depth };
}

/** Vertex shader patch: a vertex whose `aHours` (opens, closes) excludes the game hour collapses to a point. */
function hideOutsideHours(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.uniforms.uStreetHour = STREET_HOUR;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nattribute vec2 aHours;\nuniform float uStreetHour;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nif (aHours.x != aHours.y && (uStreetHour < aHours.x || uStreetHour >= aHours.y)) transformed = vec3(0.0);");
}

export function createPropMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  material.onBeforeCompile = hideOutsideHours;
  return material;
}

/** Wet props look darker in the rain. */
export function applyPropLook(assets: PropAssets, look: Look): void {
  assets.material.color.setScalar(1 - 0.25 * look.rain);
}

/** Share of buildings (with no balconies) that get wall AC units, and of flat roofs with a dish. */
const AC_UNITS = 0.3;
const DISHES = 0.2;
const AC_ABOVE_FLOOR = 0.3;

export interface BuildingFrame {
  /** Height of the ground floor and of the wall top under the parapet (as `ChunkView` draws them). */
  readonly groundFloor: number;
  readonly upperTop: number;
  readonly bay: number;
  readonly tiled: boolean;
  /** Height of the flat roof slab. */
  readonly roofY: number;
}

/**
 * Wall AC units and rooftop dishes for one building (invented: which buildings, which walls and
 * every position). AC units go only on buildings without balconies (`plan.balconies`), on upper
 * floors of walls without shop fronts, between two window bays, so they never meet a balcony,
 * a shutter or a sign. A dish goes on a flat roof, near a corner, clear of the water tank in the
 * middle, and every dish points the same way (south), as satellite dishes in one city do.
 * `free` says whether a spot just outside a wall is open air (not inside a neighbouring building).
 */
export function buildingFixtures(b: Building, plan: FacadePlan, frame: BuildingFrame, free: (x: number, z: number) => boolean = () => true): PropInstance[] {
  const out: PropInstance[] = [];
  const { outline } = b;
  const upperFloors = b.floors - 1;
  if (upperFloors > 0 && !plan.balconies && hash(b.id, 301) < AC_UNITS) {
    const storey = (frame.upperTop - frame.groundFloor) / upperFloors;
    for (let i = 0; i < outline.length; i++) {
      if (plan.shopWalls.has(i)) continue;
      const p = outline[i]!;
      const q = outline[(i + 1) % outline.length]!;
      const length = Math.hypot(q.x - p.x, q.z - p.z);
      const bays = Math.max(1, Math.round(length / frame.bay));
      if (bays < 2 || length / bays < 1.6) continue;
      if (hash(b.id, 310 + i) >= 0.3) continue;
      // Between the two middle bays, on a floor chosen by the wall.
      const s = (Math.floor(bays / 2) / bays) * length;
      const floor = Math.floor(hash(b.id, 330 + i) * upperFloors);
      const ux = (q.x - p.x) / length;
      const uz = (q.z - p.z) / length;
      // Outline is anticlockwise: (uz, -ux) points out of the building.
      const nx = uz;
      const nz = -ux;
      const x = p.x + ux * s + nx * 0.6;
      const z = p.z + uz * s + nz * 0.6;
      if (!free(x, z)) continue;
      out.push({ model: "acUnit", x: p.x + ux * s + nx * 0.02, y: frame.groundFloor + floor * storey + AC_ABOVE_FLOOR, z: p.z + uz * s + nz * 0.02, yaw: Math.atan2(nx, nz) });
    }
  }
  if (!frame.tiled && outline.length >= 3 && hash(b.id, 302) < DISHES) {
    let cx = 0;
    let cz = 0;
    for (const p of outline) {
      cx += p.x;
      cz += p.z;
    }
    cx /= outline.length;
    cz /= outline.length;
    const corner = outline[Math.floor(hash(b.id, 303) * outline.length)]!;
    const d = Math.hypot(corner.x - cx, corner.z - cz);
    // 1.3 m in from the corner, and at least 2 m from the tank (radius 0.75 m) in the middle.
    if (d > 3.5) {
      const t = 1.3 / d;
      const x = corner.x + (cx - corner.x) * t;
      const z = corner.z + (cz - corner.z) * t;
      if (pointInPolygon(x, z, outline)) out.push({ model: "dish", x, y: frame.roofY, z, yaw: (hash(b.id, 304) - 0.5) * 0.4 });
    }
  }
  return out;
}

/** The pavement props as instances of their models. */
export function pavementInstances(props: readonly PropPlacement[]): PropInstance[] {
  return props.map((p) => ({ model: p.kind, x: p.x, y: 0, z: p.z, yaw: p.yaw }));
}

/** Extra triangles merged into a props mesh as they are (overhead cables), world space, non-indexed. */
export interface ExtraGeometry {
  readonly position: Float32Array;
  readonly normal: Float32Array;
  readonly color: Float32Array;
}

/**
 * One merged mesh for a chunk's props, or null when it has none. The caller owns the geometry.
 * Instances whose model is not loaded are left out.
 */
export function buildStreetProps(instances: readonly PropInstance[], assets: PropAssets, castShadow = true, extra?: ExtraGeometry): THREE.Mesh | null {
  const models = assets.models as Partial<Record<PropModel, Baked>>;
  const used = instances.filter((it) => models[it.model]);
  let total = extra ? extra.position.length : 0;
  for (const it of used) total += models[it.model]!.position.length;
  if (total === 0) return null;
  const position = new Float32Array(total);
  const normal = new Float32Array(total);
  const color = new Float32Array(total);
  const timed = used.some((it) => it.hours);
  const hours = timed ? new Float32Array((total / 3) * 2) : null;
  let o = 0;
  for (const it of used) {
    const m = models[it.model]!;
    const c = Math.cos(it.yaw);
    const s = Math.sin(it.yaw);
    const sx = it.sx ?? 1;
    for (let i = 0; i < m.position.length; i += 3) {
      const x = m.position[i]! * sx;
      const z = m.position[i + 2]!;
      // Rotation about +Y by yaw (three.js convention), then the placement.
      position[o + i] = it.x + x * c + z * s;
      position[o + i + 1] = it.y + m.position[i + 1]!;
      position[o + i + 2] = it.z - x * s + z * c;
      const nx = m.normal[i]!;
      const nz = m.normal[i + 2]!;
      normal[o + i] = nx * c + nz * s;
      normal[o + i + 1] = m.normal[i + 1]!;
      normal[o + i + 2] = -nx * s + nz * c;
    }
    color.set(m.color, o);
    if (it.tint !== undefined) {
      const palette = it.model === "chairStack" ? CHAIR_PAINT : BIKE_PAINT;
      const paint = palette[Math.floor(it.tint * palette.length) % palette.length]!;
      for (let v = 0; v < m.paint.length; v++) {
        if (!m.paint[v]) continue;
        for (let k = 0; k < 3; k++) color[o + v * 3 + k] = color[o + v * 3 + k]! * paint[k]!;
      }
    }
    if (hours && it.hours) {
      for (let v = 0; v < m.position.length / 3; v++) {
        hours[(o / 3 + v) * 2] = it.hours.opens;
        hours[(o / 3 + v) * 2 + 1] = it.hours.closes;
      }
    }
    o += m.position.length;
  }
  if (extra) {
    position.set(extra.position, o);
    normal.set(extra.normal, o);
    color.set(extra.color, o);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
  if (hours) geometry.setAttribute("aHours", new THREE.BufferAttribute(hours, 2));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, assets.material);
  mesh.name = "street-props";
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  if (hours) mesh.customDepthMaterial = assets.depth;
  return mesh;
}
