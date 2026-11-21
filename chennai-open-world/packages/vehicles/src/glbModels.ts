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
 * Blender files have the ground at y = 0, the front facing -Z, and wheels as separate nodes
 * (`wheel_front`, `wheel_rear_left`, `wheel_rear_right`) with their origins on the axle.
 */
import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type VehicleModelRole = "paint" | "trim" | "metal" | "glass" | "lamp" | "tail" | "plate";

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
/** Wheel nodes in the Blender exports. */
const WHEELS = new Set(["wheel_front", "wheel_rear_left", "wheel_rear_right"]);
/** Materials recoloured with the vehicle's livery colour. */
const LIVERY = new Set(["auto_paint"]);

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
}

const templates = new Map<string, VehicleTemplate>();

export function vehicleTemplate(name: string): VehicleTemplate | undefined {
  return templates.get(name);
}

/** Only position, normal and colour, non-indexed, so any parts can be merged. */
function plain(geometry: THREE.BufferGeometry, colour: THREE.Color): THREE.BufferGeometry {
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

function template(scene: THREE.Object3D, ground: number): VehicleTemplate {
  scene.updateMatrixWorld(true);
  const parts: Part[] = [];
  const wheelParts: THREE.BufferGeometry[] = [];
  let wheelRadius = 0;
  const wheelNode = scene.getObjectByName("wheel_front");
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const material = node.material as THREE.MeshStandardMaterial;
    // The wheel node this part belongs to (mesh names inside wheels repeat, so match exact node names).
    let owner: THREE.Object3D | null = node;
    while (owner && !WHEELS.has(owner.name)) owner = owner.parent;
    if (owner) {
      // One wheel is enough: all three are the same mesh.
      if (owner !== wheelNode) return;
      const local = owner.matrixWorld.clone().invert().multiply(node.matrixWorld);
      const g = plain(node.geometry, material.color).applyMatrix4(local);
      g.computeBoundingBox();
      wheelRadius = Math.max(wheelRadius, g.boundingBox!.max.y, -g.boundingBox!.min.y);
      wheelParts.push(g);
      return;
    }
    const name = material.name;
    const role = ROLES[name] ?? "trim";
    // To floats first: transforming quantised buffers in place would clamp them to [-1, 1].
    const geometry = plain(node.geometry, material.color).applyMatrix4(node.matrixWorld).translate(0, ground, 0);
    parts.push({ geometry, role, material: name, colour: material.color.clone() });
  });
  const wheel = mergeGeometries(wheelParts, false);
  if (!wheel) throw new Error("Vehicle model has no wheel_front node");
  const bodies = new Map<number, Array<{ role: VehicleModelRole; geometry: THREE.BufferGeometry }>>();
  const wheels = new Map<number, THREE.BufferGeometry>();
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
  };
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
