/**
 * Vehicle models made in Blender (`tools/blender/*.py`, optimised by `npm run optimize:assets`).
 * Loaded once with `loadVehicleModels`; until then (and in unit tests) the code-built models in
 * `models.ts` are used.
 *
 * Each model is turned into shared geometry for cheap copies: its parts are grouped into a few
 * roles (paint, trim, metal, glass, lamp, tail, plate) with each part's material colour baked
 * into the vertices, so a vehicle costs one draw call per role plus its wheels, and every copy of
 * a colour shares the same buffers. Phone-friendly MeshStandardMaterial replaces the clear coat
 * and transmission materials of the Blender export.
 *
 * Blender files have the ground at y = 0, the front facing -Z, wheels as separate nodes named
 * `wheel_*` with their origins on the axle (the auto's `wheel_front`, `wheel_rear_left`…; the
 * others' `wheel_fl`, `wheel_fr`…), and doors as separate nodes named `door_*` with their origins
 * on the hinge line in Blender (`tools/blender/vehicles.py`; the game gives the hinges itself).
 *
 * Materials of `tools/blender/vehicles.py` are named `v_<role>_<what>`; the auto's are listed in
 * `ROLES`. `decal` parts keep their UVs, into `vehicleDecalTexture()` (plates, lettering).
 */
import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type VehicleModelRole = "paint" | "trim" | "metal" | "glass" | "lamp" | "tail" | "plate" | "decal" | "board" | "beaconred" | "beaconblue";

const V_ROLES = new Set<string>(["paint", "trim", "metal", "glass", "lamp", "tail", "decal", "board", "beaconred", "beaconblue"]);

/** Which role each Blender material belongs to (by name; unknown materials count as trim). */
const ROLES: Readonly<Record<string, VehicleModelRole>> = {
  auto_paint: "paint",
  auto_band: "paint",
  auto_amber: "paint",
  auto_canopy: "trim",
  auto_vinyl: "trim",
  auto_black: "trim",
  auto_floor: "trim",
  auto_rubber: "trim",
  auto_chrome: "metal",
  auto_steel: "metal",
  auto_glass: "glass",
  auto_lamp: "lamp",
  auto_tail: "tail",
  auto_plate: "plate",
};
/** The role of a Blender material: the auto's by name, `v_<role>_…` by its second word; unknown ones are trim. */
function roleOf(name: string): VehicleModelRole {
  const known = ROLES[name];
  if (known) return known;
  const word = /^v_([a-z]+)/.exec(name)?.[1];
  return word && V_ROLES.has(word) ? (word as VehicleModelRole) : "trim";
}

/** Materials recoloured with the vehicle's livery colour. */
const LIVERY = new Set(["auto_paint", "v_paint_body"]);

/**
 * A door leaf from a Blender model, coloured in the vertices. Its hinge is not read from the file:
 * the optimiser moves node origins to the middle of their meshes (quantisation), so hinges are
 * given by the game (`DOOR_SWING` in `models.ts`, on the lines in `specs.ts`).
 */
export interface TemplateDoor {
  /** Node name, e.g. `door_fr`. */
  readonly name: string;
  /** The leaf's parts merged, in the chassis frame (shut); a fresh copy. */
  readonly geometry: THREE.BufferGeometry;
}

interface Part {
  readonly geometry: THREE.BufferGeometry;
  readonly role: VehicleModelRole;
  readonly material: string;
  readonly colour: THREE.Color;
}

export interface VehicleTemplate {
  /** Body parts in the model frame (ground at `ground`), by role, for one livery colour. */
  body(colour: number): ReadonlyArray<{ readonly role: VehicleModelRole; readonly geometry: THREE.BufferGeometry }>;
  /** One wheel centred on its axle, axis along X, vertex-coloured, scaled to `radius`. */
  wheel(radius: number): THREE.BufferGeometry;
  /** Door leaves for one livery colour, each a fresh geometry (a door mesh moves its own vertices). */
  doors(colour: number): TemplateDoor[];
  /** Triangles in the body (all roles), one wheel and all the doors. */
  readonly triangles: { readonly body: number; readonly wheel: number; readonly doors: number };
}

const templates = new Map<string, VehicleTemplate>();

export function vehicleTemplate(name: string): VehicleTemplate | undefined {
  return templates.get(name);
}

/** Only position, normal and colour (and UVs when asked), non-indexed, so any parts can be merged. */
function plain(geometry: THREE.BufferGeometry, colour: THREE.Color, uv = false): THREE.BufferGeometry {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const n = source.getAttribute("position").count;
  // Quantised attributes (meshopt) are read through getX/Y/Z into plain floats, so parts merge.
  const floats = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) out.set([attribute.getX(i), attribute.getY(i), attribute.getZ(i)], i * 3);
    return new THREE.BufferAttribute(out, 3);
  };
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", floats(source.getAttribute("position")));
  const normal = source.getAttribute("normal");
  if (normal) g.setAttribute("normal", floats(normal));
  else g.computeVertexNormals();
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) data.set([colour.r, colour.g, colour.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(data, 3));
  if (uv) {
    const from = source.getAttribute("uv");
    const out = new Float32Array(n * 2);
    if (from) for (let i = 0; i < n; i++) out.set([from.getX(i), from.getY(i)], i * 2);
    g.setAttribute("uv", new THREE.BufferAttribute(out, 2));
  }
  return g;
}

/** A copy of a part with every vertex in one colour (the geometry is shared otherwise). */
function recolour(geometry: THREE.BufferGeometry, colour: THREE.Color): THREE.BufferGeometry {
  const g = geometry.clone();
  const n = g.getAttribute("position").count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) data.set([colour.r, colour.g, colour.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(data, 3));
  return g;
}

const triangleCount = (g: THREE.BufferGeometry) => g.getAttribute("position").count / 3;

function template(scene: THREE.Object3D, ground: number): VehicleTemplate {
  scene.updateMatrixWorld(true);
  const parts: Part[] = [];
  const wheelParts: THREE.BufferGeometry[] = [];
  const doorParts = new Map<THREE.Object3D, Part[]>();
  let wheelRadius = 0;
  // One wheel is enough: they are all the same mesh (left ones are mirrored in the game).
  const wheelNode = scene.children.find((node) => node.name.startsWith("wheel"));
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const material = node.material as THREE.MeshStandardMaterial;
    // The top-level node this part belongs to (the body, a wheel or a door; the meshes inside
    // them are named after the first of their kind, so only the top level counts).
    let top: THREE.Object3D = node;
    while (top.parent && top.parent !== scene) top = top.parent;
    const owner = top.name.startsWith("wheel") || top.name.startsWith("door") ? top : null;
    if (owner?.name.startsWith("wheel")) {
      if (owner !== wheelNode) return;
      const local = owner.matrixWorld.clone().invert().multiply(node.matrixWorld);
      const g = plain(node.geometry, material.color).applyMatrix4(local);
      g.computeBoundingBox();
      wheelRadius = Math.max(wheelRadius, g.boundingBox!.max.y, -g.boundingBox!.min.y);
      wheelParts.push(g);
      return;
    }
    const name = material.name;
    const role = roleOf(name);
    // To floats first: transforming quantised buffers in place would clamp them to [-1, 1].
    const geometry = plain(node.geometry, material.color, role === "decal" && !owner).applyMatrix4(node.matrixWorld).translate(0, ground, 0);
    const part = { geometry, role, material: name, colour: material.color.clone() };
    if (owner) {
      const list = doorParts.get(owner) ?? [];
      list.push(part);
      doorParts.set(owner, list);
    } else parts.push(part);
  });
  const wheel = mergeGeometries(wheelParts, false);
  if (!wheel) throw new Error("Vehicle model has no wheel node");
  const bodies = new Map<number, Array<{ role: VehicleModelRole; geometry: THREE.BufferGeometry }>>();
  const wheels = new Map<number, THREE.BufferGeometry>();
  const doorSets = new Map<number, TemplateDoor[]>();
  const doorsFor = (colour: number): TemplateDoor[] => {
    let list = doorSets.get(colour);
    if (!list) {
      const livery = new THREE.Color(colour);
      list = [...doorParts].map(([node, ps]) => {
        // One vertex-coloured material for the whole door mesh: glass and trim become colours.
        const coloured = ps.map((p) => (LIVERY.has(p.material) ? recolour(p.geometry, livery) : p.geometry.clone()));
        const geometry = mergeGeometries(coloured, false);
        if (!geometry) throw new Error(`Door ${node.name} is empty`);
        for (const g of coloured) g.dispose();
        return { name: node.name, geometry };
      });
      doorSets.set(colour, list);
    }
    return list;
  };
  return {
    body(colour) {
      let body = bodies.get(colour);
      if (!body) {
        const livery = new THREE.Color(colour);
        const byRole = new Map<VehicleModelRole, THREE.BufferGeometry[]>();
        for (const p of parts) {
          const list = byRole.get(p.role) ?? [];
          list.push(LIVERY.has(p.material) ? recolour(p.geometry, livery) : p.geometry);
          byRole.set(p.role, list);
        }
        body = [...byRole].map(([role, list]) => ({ role, geometry: mergeGeometries(list, false)! }));
        bodies.set(colour, body);
      }
      return body;
    },
    wheel(radius) {
      let g = wheels.get(radius);
      if (!g) {
        const s = radius / (wheelRadius || radius);
        g = wheel.clone().scale(s, s, s);
        wheels.set(radius, g);
      }
      return g;
    },
    doors(colour) {
      return doorsFor(colour).map((d) => ({ name: d.name, geometry: d.geometry.clone() }));
    },
    triangles: {
      body: parts.reduce((sum, p) => sum + triangleCount(p.geometry), 0),
      wheel: triangleCount(wheel),
      doors: [...doorParts.values()].flat().reduce((sum, p) => sum + triangleCount(p.geometry), 0),
    },
  };
}

/**
 * Plates and lettering of the Blender vehicles (`v_decal` parts): a 512 × 256 atlas in four rows
 * of 64 px, matching `DECAL` in `tools/blender/vehicles.py`: a white private and a yellow
 * commercial plate (the number is not a real registration), "AMBULANCE", the same mirrored (it
 * reads right in a mirror ahead), and the bus's destination board. Browser only (null in Node).
 */
let decalTexture: THREE.Texture | null | undefined;
export function vehicleDecalTexture(): THREE.Texture | null {
  if (decalTexture !== undefined) return decalTexture;
  if (typeof document === "undefined") return (decalTexture = null);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  if (!g) return (decalTexture = null);
  g.textAlign = "center";
  g.textBaseline = "middle";
  const plate = (x: number, fill: string) => {
    g.fillStyle = fill;
    g.fillRect(x, 0, 256, 64);
    g.strokeStyle = "#111";
    g.lineWidth = 4;
    g.strokeRect(x + 4, 4, 248, 56);
    g.fillStyle = "#111";
    g.font = "700 34px monospace";
    g.fillText("TN 00 X 0000", x + 128, 34);
  };
  plate(0, "#f2f2ee");
  plate(256, "#f4c400");
  const word = (y: number, mirrored: boolean) => {
    g.save();
    g.fillStyle = "#f3f4f1";
    g.fillRect(0, y, 512, 64);
    if (mirrored) {
      g.translate(512, 0);
      g.scale(-1, 1);
    }
    g.fillStyle = "#c8202a";
    g.font = "900 48px sans-serif";
    g.fillText("AMBULANCE", 256, y + 34);
    g.restore();
  };
  word(64, false);
  word(128, true);
  g.fillStyle = "#111";
  g.fillRect(0, 192, 512, 64);
  g.fillStyle = "#ffb21a";
  g.font = "700 40px monospace";
  g.fillText("T. NAGAR", 256, 226);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // glTF UVs count from the top of the image down.
  texture.flipY = false;
  texture.anisotropy = 4;
  return (decalTexture = texture);
}

/**
 * Load the Blender vehicle models (data URLs or file URLs). Fetched, then parsed, so it works in
 * the WebView, the browser and Node. Rejects if a file is missing or broken.
 * @param ground where the ground is below the chassis centre, per model (ride height plus settled suspension)
 */
export async function loadVehicleModels(sources: Readonly<Record<string, { readonly url: string; readonly ground: number }>>): Promise<void> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(
    Object.entries(sources).map(async ([name, { url, ground }]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Vehicle model ${name} could not be read (${response.status})`);
      const gltf = await loader.parseAsync(await response.arrayBuffer(), "");
      templates.set(name, template(gltf.scene, ground));
    }),
  );
}
