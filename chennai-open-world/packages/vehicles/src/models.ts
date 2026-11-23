/**
 * Vehicle bodies. Each model is built around the chassis centre, facing -Z, and returns its wheels
 * so they can spin and steer, and its doors.
 *
 * Every kind has a model made in Blender (`tools/blender/vehicles.py`, `auto_rickshaw.py`), in two
 * levels of detail: "near" for the player's, parked and drivable vehicles, "far" (LOD1) for the
 * AI's traffic and police cars (`TrafficCar`). They are used once `loadVehicleModels` has run.
 * Before that, and in unit tests that don't load them, the older code-built bodies below stand in:
 * a profile drawn from the side and extruded across the vehicle's width.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { AUTO_SIZE, autoPlateTexture, buildAutoParts, type AutoRole } from "./autoModel";
import { vehicleDecalTexture, vehicleTemplate, type VehicleModelRole, type VehicleTemplate } from "./glbModels";
import { VEHICLE_TYPES, type VehicleKind } from "./specs";

/** "near": the detailed model (the player's, parked vehicles); "far": the light one (traffic). */
export type VehicleDetail = "near" | "far";

export interface VehicleModel {
  readonly object: THREE.Group;
  /** One pivot per wheel, in the same order as the physics spec. */
  readonly wheels: THREE.Group[];
  /** Emergency lights that flash while the siren is on. */
  readonly beacons?: readonly THREE.MeshStandardMaterial[];
  /**
   * Open a door: 0 shut, 1 fully open. `leaf` 0 (the default) is the driver's door; higher ones
   * are passengers' doors (`VehicleType.passengers`). Absent on vehicles without doors.
   */
  readonly door?: (amount: number, leaf?: number) => void;
}

/** One door leaf: its parts (built around the hinge, the leaf running along z), and how it swings. */
interface Leaf {
  /** Parts around the hinge; without `color`, a part keeps the colours in its vertices. */
  readonly parts: ReadonlyArray<{ readonly geometry: THREE.BufferGeometry; readonly color?: number }>;
  /** Hinge line, in the chassis frame. */
  readonly hinge: { readonly x: number; readonly z: number };
  /** Angle when fully open, radians; the sign picks the way it swings (positive turns +z towards +x). */
  readonly open: number;
  /** Which door this leaf belongs to (leaves of one door swing together); 0, the driver's, when absent. */
  readonly group?: number;
}

/**
 * Door leaves as one mesh (one draw call however many leaves: the bus has two). Its colours are
 * in the vertices, so one material per paint colour serves every door of that colour. Opening
 * turns the leaves' vertices about their hinges on the CPU: a few hundred numbers, and only
 * while a door is moving.
 */
class DoorMesh {
  readonly mesh: THREE.Mesh;
  private readonly base: Float32Array;
  private readonly baseNormals: Float32Array;
  /** Which leaf each vertex belongs to. */
  private readonly owner: Uint8Array;
  /** How open each door (leaf group) is. */
  private readonly amounts: number[] = [];

  constructor(
    private readonly leaves: readonly Leaf[],
    material: THREE.Material,
  ) {
    const geometries: THREE.BufferGeometry[] = [];
    const owners: number[] = [];
    let reach = 0;
    leaves.forEach((leaf, i) => {
      for (const part of leaf.parts) {
        part.geometry.computeBoundingBox();
        const bounds = part.geometry.boundingBox!;
        reach = Math.max(reach, Math.abs(bounds.max.z), Math.abs(bounds.min.z));
        const flat = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
        const geometry = part.color === undefined ? flat : tinted(flat, part.color);
        geometry.deleteAttribute("uv");
        geometries.push(geometry);
        for (let k = 0; k < geometry.getAttribute("position").count; k++) owners.push(i);
      }
    });
    const geometry = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    for (const leaf of leaves) for (const part of leaf.parts) part.geometry.dispose();
    if (!geometry) throw new Error("Door geometry is empty.");
    this.base = Float32Array.from(geometry.getAttribute("position").array);
    this.baseNormals = Float32Array.from(geometry.getAttribute("normal").array);
    this.owner = Uint8Array.from(owners);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.name = "door";
    this.update();
    // Bounds big enough for the leaves at any angle, so an open door is never culled.
    geometry.computeBoundingSphere();
    if (geometry.boundingSphere) geometry.boundingSphere.radius += reach;
  }

  set(amount: number, group = 0): void {
    const a = Math.min(1, Math.max(0, amount));
    if (Math.abs(a - (this.amounts[group] ?? 0)) < 1e-4) return;
    this.amounts[group] = a;
    this.update();
  }

  private update(): void {
    const geometry = this.mesh.geometry;
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const normal = geometry.getAttribute("normal") as THREE.BufferAttribute;
    const p = position.array as Float32Array;
    const n = normal.array as Float32Array;
    const turns = this.leaves.map((leaf) => {
      const a = this.amounts[leaf.group ?? 0] ?? 0;
      return { cos: Math.cos(leaf.open * a), sin: Math.sin(leaf.open * a), hinge: leaf.hinge };
    });
    for (let v = 0; v < this.owner.length; v++) {
      const turn = turns[this.owner[v]!]!;
      const i = v * 3;
      const x = this.base[i]!;
      const z = this.base[i + 2]!;
      p[i] = turn.hinge.x + x * turn.cos + z * turn.sin;
      p[i + 1] = this.base[i + 1]!;
      p[i + 2] = turn.hinge.z - x * turn.sin + z * turn.cos;
      const nx = this.baseNormals[i]!;
      const nz = this.baseNormals[i + 2]!;
      n[i] = nx * turn.cos + nz * turn.sin;
      n[i + 1] = this.baseNormals[i + 1]!;
      n[i + 2] = -nx * turn.sin + nz * turn.cos;
    }
    position.needsUpdate = true;
    normal.needsUpdate = true;
  }
}

/** A box for a door part, given by its extent (from, to) on each axis around the hinge. */
function slab(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** A door's material: colours come from the vertices; one per paint colour, shared. */
const doorMaterial = (key: string) => standard(`door:${key}`, { vertexColors: true, roughness: 0.32, metalness: 0.45 });

/** Colours of `glass()`, the dark trim and chrome, for door parts coloured in the vertices. */
const GLASS_COLOR = 0x31485a;
const TRIM_COLOR = 0x202226;
const CHROME_COLOR = 0xc9ccd1;

/**
 * Materials are shared by every vehicle (one instance per look), so vehicles of the same
 * colour batch well and nothing is duplicated on the GPU.
 */
const materials = new Map<string, THREE.MeshStandardMaterial>();
function shared(key: string, make: () => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  let material = materials.get(key);
  if (!material) {
    material = make();
    materials.set(key, material);
  }
  return material;
}
const standard = (key: string, parameters: THREE.MeshStandardMaterialParameters) => shared(key, () => new THREE.MeshStandardMaterial(parameters));
const glass = () => standard("glass", { color: 0x31485a, roughness: 0.05, metalness: 0.85 });
const chrome = () => standard("chrome", { color: 0xc9ccd1, roughness: 0.25, metalness: 0.9 });
const lampMaterial = () => standard("lamp", { color: 0xfff6d5, emissive: 0xfff0b0, emissiveIntensity: 0.5 });
const tailMaterial = () => standard("tail", { color: 0xb01212, emissive: 0x900000, emissiveIntensity: 0.6 });
const paintMaterial = (color: number) => standard(`paint:${color}`, { color, roughness: 0.32, metalness: 0.45 });

/** Lamp glow by day, and how much brighter it gets after dark (see `setVehicleNightLights`). */
const LAMP_GLOW: Readonly<Record<string, readonly [number, number]>> = { lamp: [0.5, 2.6], tail: [0.6, 1.9], "bus-board": [0.6, 1.0] };

/**
 * Brighten head and tail lamps (and the bus destination board) after dark: 0 by day, 1 at
 * night. The materials are shared, so one call covers every vehicle; call it again when the
 * level changes.
 */
export function setVehicleNightLights(level: number): void {
  const night = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0));
  for (const [key, [day, extra]] of Object.entries(LAMP_GLOW)) {
    const material = materials.get(key);
    if (material) material.emissiveIntensity = day + extra * night;
  }
}

/**
 * Collapse a model's fixed parts into one mesh per material. A car goes from about forty
 * draw calls to six. Wheels are left alone because they move.
 */
function mergeParts(object: THREE.Group, wheels: readonly THREE.Object3D[]): void {
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const merged: THREE.Mesh[] = [];
  for (const child of [...object.children]) {
    if (!(child instanceof THREE.Mesh) || wheels.includes(child) || Array.isArray(child.material)) continue;
    child.updateMatrix();
    // Mixed indexed and non-indexed geometry cannot be merged, so make everything non-indexed.
    const geometry = (child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone()).applyMatrix4(child.matrix);
    const list = byMaterial.get(child.material);
    if (list) list.push(geometry);
    else byMaterial.set(child.material, [geometry]);
    object.remove(child);
    child.geometry.dispose();
  }
  for (const [material, geometries] of byMaterial) {
    const geometry = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    merged.push(mesh);
  }
  object.add(...merged);
}

/**
 * Extrude a side profile across the vehicle. Points are [z, y] with -z at the front.
 * The result is centred on x.
 */
function extruded(profile: ReadonlyArray<readonly [number, number]>, width: number, bevel: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  profile.forEach(([z, y], i) => (i === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4 });
  // The shape lies in XY and extrudes along Z; turn it so the profile's "z" runs along world Z.
  geometry.translate(0, 0, -(width - bevel * 2) / 2);
  geometry.rotateY(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** Paint every vertex of a geometry one colour. */
function tinted(geometry: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const wheelGeometries = new Map<string, THREE.BufferGeometry>();

/** Tyre and rim as one mesh, coloured per vertex. Geometry is shared by wheels of the same size. */
function wheel(radius: number, width: number): THREE.Group {
  const key = `${radius}:${width}`;
  let geometry = wheelGeometries.get(key);
  if (!geometry) {
    const tyre = tinted(new THREE.CylinderGeometry(radius, radius, width, 16).rotateZ(Math.PI / 2).toNonIndexed(), 0x17181b);
    const rim = tinted(new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, width + 0.02, 8).rotateZ(Math.PI / 2).toNonIndexed(), 0xb9bcc2);
    geometry = mergeGeometries([tyre, rim], false) ?? tyre;
    wheelGeometries.set(key, geometry);
  }
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, standard("wheel", { vertexColors: true, roughness: 0.7, metalness: 0.2 }));
  mesh.castShadow = true;
  // The spinning part is a child, so steering (on the pivot) and rolling don't interfere.
  mesh.name = "spin";
  pivot.add(mesh);
  return pivot;
}

function car(color: number): VehicleModel {
  const object = new THREE.Group();
  const paint = paintMaterial(color);
  const dark = standard("trim", { color: 0x202226, roughness: 0.7 });

  // Lower body: bonnet, doors and boot in one piece. y is relative to the chassis centre.
  object.add(
    extruded(
      [
        [-1.95, -0.3], [-2.0, -0.05], [-1.9, 0.18], [-1.2, 0.3], [1.55, 0.34], [1.95, 0.22], [2.0, -0.05], [1.95, -0.3],
      ],
      1.66,
      0.07,
      paint,
    ),
  );
  // Cabin: windscreen raked back, roof, sloping hatch. Dark glass with painted pillars and roof.
  object.add(
    extruded(
      [
        [-1.05, 0.3], [-0.42, 0.82], [0.95, 0.84], [1.6, 0.34],
      ],
      1.5,
      0.06,
      glass(),
    ),
  );
  object.add(box(1.46, 0.07, 1.42, paint, 0, 0.87, 0.27)); // roof panel
  for (const x of [-0.74, 0.74]) object.add(box(0.06, 0.52, 0.09, paint, x, 0.58, 0.28)); // door pillars
  // Bumpers, lights and number plates.
  object.add(box(1.7, 0.2, 0.14, dark, 0, -0.26, -1.98), box(1.7, 0.2, 0.14, dark, 0, -0.26, 1.98));
  const lamp = lampMaterial();
  const tail = tailMaterial();
  for (const x of [-0.6, 0.6]) {
    object.add(box(0.34, 0.12, 0.05, lamp, x, 0.08, -2.0), box(0.3, 0.12, 0.05, tail, x, 0.14, 2.0));
  }
  const plate = standard("plate", { color: 0xf4f4ee, roughness: 0.6 });
  object.add(box(0.46, 0.13, 0.02, plate, 0, -0.1, -2.02), box(0.46, 0.13, 0.02, plate, 0, -0.08, 2.02));
  // Door seams, handles and mirrors. The driver's (right front) door is a separate part below.
  for (const x of [-0.835, 0.835]) {
    object.add(box(0.012, 0.5, 0.02, dark, x, 0.02, -0.55), box(0.012, 0.5, 0.02, dark, x, 0.02, 0.5), box(0.012, 0.5, 0.02, dark, x, 0.02, 1.45));
    if (x < 0) object.add(box(0.03, 0.035, 0.16, chrome(), x, 0.17, -0.15));
    object.add(box(0.03, 0.035, 0.16, chrome(), x, 0.17, 0.9));
    object.add(box(0.16, 0.1, 0.07, paint, x * 1.09, 0.4, -0.86));
  }
  // The driver's doorway: dark panels just outside the body and the side glass, hidden by the
  // shut door, so an open door shows an opening instead of paint (there is no modelled cabin).
  object.add(box(0.008, 0.58, 1.03, dark, 0.836, 0.015, -0.03), box(0.006, 0.46, 0.68, dark, 0.755, 0.56, -0.07));
  // The same behind the two rear doors, for passengers.
  for (const x of [-1, 1]) object.add(box(0.008, 0.58, 0.9, dark, 0.836 * x, 0.015, 0.97), box(0.006, 0.4, 0.42, dark, 0.755 * x, 0.54, 0.76));
  // Grille and a strip of trim along the sill.
  object.add(box(1.0, 0.14, 0.03, dark, 0, -0.08, -2.0));
  for (const x of [-0.83, 0.83]) object.add(box(0.03, 0.08, 3.0, dark, x, -0.27, 0));
  // Wheel arches read as dark recesses.
  for (const x of [-0.8, 0.8]) for (const z of [-1.25, 1.25]) object.add(box(0.1, 0.34, 0.86, dark, x, -0.18, z));

  mergeParts(object, []);
  const wheels = [0, 1, 2, 3].map(() => wheel(0.32, 0.22));
  object.add(...wheels);
  // Driver's door, hinged at its front edge (z -0.55), swinging out about 65°. Around the hinge:
  // the panel runs back 1.05 m to the seam at z 0.5; the window sits 9 cm in, over the side glass.
  const door = new DoorMesh(
    [
      {
        hinge: { x: 0.845, z: -0.55 },
        open: THREE.MathUtils.degToRad(65),
        parts: [
          { geometry: slab(0, 0.03, -0.28, 0.31, 0.005, 1.045), color },
          { geometry: slab(-0.085, -0.065, 0.31, 0.79, 0.15, 0.83), color: GLASS_COLOR },
          { geometry: slab(-0.085, -0.06, 0.31, 0.34, 0.12, 0.86), color },
          { geometry: slab(0.03, 0.05, 0.155, 0.19, 0.32, 0.48), color: CHROME_COLOR },
        ],
      },
      // Rear doors for passengers, hinged at their front edge (z 0.5) and running back to the
      // seam at z 1.45, cut round the rear wheel arch; left (group 1) and right (group 2).
      ...([-1, 1] as const).map((side) => {
        const out = (a: number, b: number) => (side > 0 ? [a, b] : [-b, -a]) as [number, number];
        return {
          hinge: { x: 0.845 * side, z: 0.5 },
          open: THREE.MathUtils.degToRad(65) * side,
          group: side < 0 ? 1 : 2,
          parts: [
            { geometry: slab(...out(0, 0.03), -0.01, 0.31, 0.005, 0.94), color },
            { geometry: slab(...out(0, 0.03), -0.28, -0.01, 0.005, 0.3), color },
            { geometry: slab(...out(-0.085, -0.065), 0.31, 0.75, 0.05, 0.45), color: GLASS_COLOR },
            { geometry: slab(...out(-0.085, -0.06), 0.31, 0.34, 0.02, 0.5), color },
            { geometry: slab(...out(0.03, 0.05), 0.155, 0.19, 0.3, 0.46), color: CHROME_COLOR },
          ],
        };
      }),
    ],
    doorMaterial(String(color)),
  );
  object.add(door.mesh);
  return { object, wheels, door: (amount, leaf) => door.set(amount, leaf) };
}

/**
 * The auto-rickshaw at real proportions (`autoModel.ts`). Its colours are in the vertices, so
 * every auto shares the same seven materials whatever its livery: about seven draw calls per auto
 * plus its wheels.
 */
function auto(color: number, detail: VehicleDetail): VehicleModel {
  const object = new THREE.Group();
  const plate = autoPlateTexture();
  const blender = pickTemplate("auto", detail);
  const byRole: Record<AutoRole, THREE.Material> = {
    paint: standard("auto-paint", { vertexColors: true, roughness: 0.35, metalness: 0.1 }),
    trim: standard("auto-trim", { vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),
    metal: standard("auto-metal", { vertexColors: true, roughness: 0.25, metalness: 0.9 }),
    glass: standard("auto-glass", { color: 0xbfd6dd, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    lamp: lampMaterial(),
    tail: tailMaterial(),
    plate: standard("auto-plate", plate ? { map: plate, roughness: 0.5 } : { color: 0xf4c400, roughness: 0.5 }),
  };
  // The Blender model when it has been loaded (`loadVehicleModels`), else the code-built one.
  const { parts, wheel: wheelGeometry } = blender
    ? { parts: blender.body(color), wheel: blender.wheel(AUTO_SIZE.wheelRadius) }
    : buildAutoParts(color);
  for (const part of parts) {
    const mesh = new THREE.Mesh(part.geometry, byRole[part.role as AutoRole] ?? roleMaterial(part.role));
    mesh.castShadow = part.role !== "glass";
    mesh.receiveShadow = true;
    object.add(mesh);
  }
  // Blender parts are already merged per role and shared between autos of one colour.
  if (!blender) mergeParts(object, []);
  const wheelMaterial = standard("auto-wheel", { vertexColors: true, roughness: 0.75, metalness: 0.3 });
  const wheels = [0, 1, 2].map(() => {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(wheelGeometry, wheelMaterial);
    mesh.castShadow = true;
    // The spinning part is a child, so steering (on the pivot) and rolling don't interfere.
    mesh.name = "spin";
    pivot.add(mesh);
    return pivot;
  });
  object.add(...wheels);
  return { object, wheels };
}

function bike(color: number): VehicleModel {
  const object = new THREE.Group();
  const paint = paintMaterial(color);
  const frame = standard("bike-frame", { color: 0x1b1c1f, roughness: 0.6, metalness: 0.4 });
  const seat = standard("bike-seat", { color: 0x23201e, roughness: 0.9 });
  const steel = chrome();

  // Fuel tank and side panels from one rounded profile.
  object.add(
    extruded(
      [
        [-0.5, 0.12], [-0.42, 0.34], [-0.05, 0.38], [0.18, 0.2], [0.2, 0.02], [-0.4, 0.0],
      ],
      0.28,
      0.06,
      paint,
    ),
  );
  object.add(box(0.3, 0.09, 0.78, seat, 0, 0.2, 0.52)); // long seat for two
  object.add(box(0.26, 0.26, 0.4, frame, 0, -0.12, -0.08)); // engine block
  object.add(box(0.2, 0.06, 0.5, paint, 0, 0.12, 0.92)); // tail
  object.add(box(0.14, 0.07, 0.03, tailMaterial(), 0, 0.12, 1.18));
  // Front forks raked back from the axle to the steering head, handlebar on top, headlamp.
  for (const x of [-0.09, 0.09]) {
    const fork = box(0.04, 0.78, 0.04, steel, x, 0.06, -0.583);
    fork.rotation.x = 0.36;
    object.add(fork);
  }
  // Grips at (±0.33, 0.52, -0.42): the rider's hands (`VEHICLE_TYPES.bike.pose`).
  object.add(box(0.06, 0.1, 0.06, frame, 0, 0.47, -0.43)); // stem
  object.add(box(0.66, 0.035, 0.035, frame, 0, 0.52, -0.42));
  for (const x of [-0.33, 0.33]) object.add(box(0.1, 0.045, 0.045, seat, x, 0.52, -0.42));
  object.add(box(0.17, 0.17, 0.1, lampMaterial(), 0, 0.38, -0.56));
  // Exhaust, mudguards, footpegs.
  object.add(box(0.07, 0.07, 0.86, steel, 0.17, -0.2, 0.42));
  object.add(box(0.13, 0.03, 0.5, paint, 0, 0.0, -0.74), box(0.13, 0.03, 0.46, paint, 0, 0.02, 0.76));
  object.add(box(0.5, 0.03, 0.05, frame, 0, -0.28, 0.12)); // footpegs, ±0.24 m

  mergeParts(object, []);
  const wheels = [0, 1].map(() => wheel(0.3, 0.1));
  object.add(...wheels);
  return { object, wheels };
}

/** A white van with an original red-and-yellow livery and a roof light bar. */
function ambulance(): VehicleModel {
  const object = new THREE.Group();
  const white = standard("amb-white", { color: 0xf3f4f1, roughness: 0.35, metalness: 0.2 });
  const red = standard("amb-red", { color: 0xc8202a, roughness: 0.45 });
  const yellow = standard("amb-yellow", { color: 0xf2c230, roughness: 0.5 });
  const dark = standard("trim", { color: 0x202226, roughness: 0.7 });

  object.add(
    extruded(
      [
        [-2.5, -0.55], [-2.56, -0.1], [-2.38, 0.26], [-1.72, 0.42], [-1.32, 1.08], [2.5, 1.12], [2.55, -0.55],
      ],
      1.94,
      0.07,
      white,
    ),
  );
  object.add(extruded([[-1.74, 0.44], [-1.36, 1.02], [-1.2, 1.02], [-1.2, 0.44]], 1.98, 0.02, glass())); // windscreen
  for (const x of [-0.995, 0.995]) {
    // The right (driver's) cab window and the front of its stripe are on the door, below.
    if (x < 0) object.add(box(0.02, 0.48, 0.7, glass(), x, 0.7, -0.85)); // cab side windows
    if (x < 0) object.add(box(0.02, 0.22, 3.4, red, x, 0.08, 0.75)); // stripe
    else object.add(box(0.02, 0.22, 2.87, red, x, 0.08, 1.015));
    for (let i = 0; i < 6; i++) object.add(box(0.025, 0.14, 0.28, i % 2 ? yellow : red, x, -0.24, -0.15 + i * 0.56)); // checks
    object.add(box(0.012, 1.4, 0.02, dark, x, 0.3, -0.42)); // door seam
  }
  object.add(box(1.96, 0.22, 0.14, dark, 0, -0.5, -2.53), box(1.96, 0.22, 0.14, dark, 0, -0.5, 2.55));
  for (const x of [-0.68, 0.68]) object.add(box(0.36, 0.14, 0.05, lampMaterial(), x, 0.1, -2.5), box(0.2, 0.3, 0.05, tailMaterial(), x * 1.2, 0.3, 2.56));
  for (const x of [-0.9, 0.9]) for (const z of [-1.6, 1.55]) object.add(box(0.1, 0.36, 0.95, dark, x, -0.42, z));
  // Light bar: one red and one blue lamp each side of a dark base.
  const beaconRed = shared("beacon-red", () => new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 0.2 }));
  const beaconBlue = shared("beacon-blue", () => new THREE.MeshStandardMaterial({ color: 0x2a6bff, emissive: 0x1050ff, emissiveIntensity: 0.2 }));
  object.add(box(1.3, 0.08, 0.34, dark, 0, 1.16, -1.0));
  object.add(box(0.5, 0.14, 0.3, beaconRed, -0.36, 1.26, -1.0), box(0.5, 0.14, 0.3, beaconBlue, 0.36, 1.26, -1.0));
  // The driver's doorway (dark, behind the cab door): see `car`.
  object.add(box(0.008, 1.18, 0.78, dark, 0.976, 0.4, -0.82));
  // The rear doorway, behind the two rear doors (dark: there is no modelled interior).
  object.add(box(1.36, 1.3, 0.008, dark, 0, 0.33, 2.553));

  mergeParts(object, []);
  const wheels = [0, 1, 2, 3].map(() => wheel(0.38, 0.26));
  object.add(...wheels);
  // Cab door on the right, above the front wheel arch, hinged at its front edge behind the
  // windscreen (z -1.22) and running back to the seam (z -0.42); swings out about 65°.
  const door = new DoorMesh(
    [
      {
        hinge: { x: 0.985, z: -1.22 },
        open: THREE.MathUtils.degToRad(65),
        parts: [
          { geometry: slab(0, 0.03, -0.2, 1.0, 0.005, 0.795), color: 0xf3f4f1 },
          { geometry: slab(0.03, 0.045, 0.46, 0.94, 0.04, 0.72), color: GLASS_COLOR },
          { geometry: slab(0.03, 0.045, -0.03, 0.19, 0.27, 0.795), color: 0xc8202a },
          { geometry: slab(0.03, 0.05, 0.3, 0.34, 0.6, 0.74), color: TRIM_COLOR },
        ],
      },
      // Two rear doors for the patient (group 1), hinged at the body's sides inside the tail
      // lamps and swinging out about 110°, round towards the sides. Each is 0.7 m wide.
      ...([-1, 1] as const).map((side) => ({
        hinge: { x: 0.7 * side, z: 2.56 },
        open: THREE.MathUtils.degToRad(110) * side,
        group: 1,
        parts: [
          { geometry: slab(side > 0 ? -0.7 : 0, side > 0 ? 0 : 0.7, -0.37, 1.0, 0, 0.03), color: 0xf3f4f1 },
          { geometry: slab(side > 0 ? -0.6 : 0.1, side > 0 ? -0.1 : 0.6, 0.45, 0.9, 0.03, 0.04), color: GLASS_COLOR },
          { geometry: slab(side > 0 ? -0.7 : 0, side > 0 ? 0 : 0.7, -0.03, 0.19, 0.03, 0.045), color: 0xc8202a },
        ],
      })),
    ],
    doorMaterial("ambulance"),
  );
  object.add(door.mesh);
  return { object, wheels, beacons: [beaconRed, beaconBlue], door: (amount, leaf) => door.set(amount, leaf) };
}

/** A short city bus in an original teal-and-cream livery, doors on the kerb (left) side. */
function bus(): VehicleModel {
  const object = new THREE.Group();
  const paint = standard("bus-teal", { color: 0x1f6f78, roughness: 0.45, metalness: 0.2 });
  const cream = standard("bus-cream", { color: 0xf1e6c8, roughness: 0.55 });
  const dark = standard("trim", { color: 0x202226, roughness: 0.7 });
  const board = standard("bus-board", { color: 0xffb21a, emissive: 0xff9a00, emissiveIntensity: 0.6 });

  object.add(extruded([[-5.0, -0.7], [-5.06, 1.5], [-4.9, 1.74], [4.92, 1.74], [5.05, 1.5], [5.0, -0.7]], 2.5, 0.08, paint));
  object.add(box(2.42, 0.06, 9.6, cream, 0, 1.78, 0)); // roof
  for (const x of [-1.262, 1.262]) {
    // On the kerb side the band, stripe and first pillar leave the front door's opening clear (z -4.15 to -3.05).
    if (x > 0) {
      object.add(box(0.02, 0.8, 8.9, glass(), x, 1.0, 0.25)); // window band
      object.add(box(0.025, 0.16, 9.8, cream, x, 0.42, 0)); // waist stripe
    } else {
      object.add(box(0.02, 0.8, 7.75, glass(), x, 1.0, 0.825));
      object.add(box(0.025, 0.16, 7.95, cream, x, 0.42, 0.925), box(0.025, 0.16, 0.75, cream, x, 0.42, -4.525));
    }
    for (let i = x > 0 ? 0 : 1; i < 7; i++) object.add(box(0.03, 0.8, 0.08, paint, x, 1.0, -4.0 + i * 1.33)); // window pillars
  }
  // Front door, kerb side: a dark doorway behind two folding leaves (below).
  object.add(box(0.01, 1.9, 1.1, dark, -1.256, 0.35, -3.6));
  object.add(box(0.03, 1.9, 1.1, glass(), -1.265, 0.35, 2.0)); // rear door
  object.add(box(2.3, 1.15, 0.03, glass(), 0, 0.85, -5.07)); // windscreen
  object.add(box(1.6, 0.24, 0.04, board, 0, 1.55, -5.08)); // destination board (no text)
  object.add(box(2.52, 0.28, 0.16, dark, 0, -0.62, -5.06), box(2.52, 0.28, 0.16, dark, 0, -0.62, 5.06));
  for (const x of [-0.95, 0.95]) object.add(box(0.3, 0.16, 0.05, lampMaterial(), x, -0.3, -5.07), box(0.24, 0.32, 0.05, tailMaterial(), x, -0.1, 5.07));
  for (const x of [-1.15, 1.15]) for (const z of [-3.3, 2.8]) object.add(box(0.14, 0.6, 1.3, dark, x, -0.55, z));

  mergeParts(object, []);
  const wheels = [0, 1, 2, 3].map(() => wheel(0.5, 0.32));
  object.add(...wheels);
  // Two glazed leaves, each hinged at its outer edge, folding outwards about 80° to leave the
  // 1.1 m opening clear (one mesh for both).
  const leaf = (direction: 1 | -1) => [
    { geometry: slab(-0.035, 0, -0.6, 1.3, 0, direction * 0.545), color: GLASS_COLOR },
    { geometry: slab(-0.045, -0.035, -0.6, 1.3, direction * 0.5, direction * 0.545), color: TRIM_COLOR },
    { geometry: slab(-0.045, -0.035, 0.3, 0.38, 0, direction * 0.545), color: TRIM_COLOR },
  ];
  const door = new DoorMesh(
    [
      { hinge: { x: -1.266, z: -4.15 }, open: -THREE.MathUtils.degToRad(80), parts: leaf(1) },
      { hinge: { x: -1.266, z: -3.05 }, open: THREE.MathUtils.degToRad(80), parts: leaf(-1) },
    ],
    doorMaterial("bus"),
  );
  object.add(door.mesh);
  return { object, wheels, door: (amount, leaf) => door.set(amount, leaf) };
}

/** The Blender model of a kind at a level of detail, or the other level if only that one is loaded. */
function pickTemplate(kind: VehicleKind, detail: VehicleDetail): VehicleTemplate | undefined {
  const near = vehicleTemplate(kind);
  const far = vehicleTemplate(`${kind}_lod1`);
  return detail === "near" ? (near ?? far) : (far ?? near);
}

/** The livery of the bus and the ambulance is their own, whatever colour they are given. */
const OWN_LIVERY: Partial<Record<VehicleKind, number>> = { bus: 0x2a8790, ambulance: 0xf3f4f1 };

/**
 * How each door of a Blender model swings (`door_*` nodes): its hinge line in the chassis frame
 * (the same lines as `specs.ts` and `tools/blender/vehicles.py`), how far it opens in degrees
 * (positive turns +z towards +x), and its group (leaves of one group swing together; 0 is the
 * driver's door).
 */
const DOOR_SWING: Partial<Record<VehicleKind, Readonly<Record<string, { readonly hinge: { readonly x: number; readonly z: number }; readonly group: number; readonly open: number }>>>> = {
  // Driver's door (right front, hinged at z -0.55) and the two rear doors (hinged at z 0.5), about 65°.
  car: {
    door_fr: { hinge: { x: 0.845, z: -0.55 }, group: 0, open: 65 },
    door_rl: { hinge: { x: -0.845, z: 0.5 }, group: 1, open: -65 },
    door_rr: { hinge: { x: 0.845, z: 0.5 }, group: 2, open: 65 },
  },
  // Cab door on the right behind the windscreen; the two rear doors open together, right round to the sides.
  ambulance: {
    door_cab: { hinge: { x: 0.985, z: -1.22 }, group: 0, open: 65 },
    door_back_l: { hinge: { x: -0.7, z: 2.56 }, group: 1, open: -110 },
    door_back_r: { hinge: { x: 0.7, z: 2.56 }, group: 1, open: 110 },
  },
  // The kerb-side front door folds in two leaves, each hinged at its outer edge, both outwards.
  bus: {
    door_front_a: { hinge: { x: -1.266, z: -4.15 }, group: 0, open: -80 },
    door_front_b: { hinge: { x: -1.266, z: -3.05 }, group: 0, open: 80 },
  },
};

/** The material of each role of a Blender model; shared by every vehicle. */
function roleMaterial(role: VehicleModelRole): THREE.Material {
  switch (role) {
    case "paint":
      return standard("veh-paint", { vertexColors: true, roughness: 0.3, metalness: 0.35 });
    case "metal":
      return standard("veh-metal", { vertexColors: true, roughness: 0.22, metalness: 0.9 });
    case "glass":
      return standard("veh-glass", { color: 0x1f2a32, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false });
    case "lamp":
      return lampMaterial();
    case "tail":
      return tailMaterial();
    case "decal": {
      const map = vehicleDecalTexture();
      return standard("veh-decal", map ? { map, roughness: 0.5 } : { color: 0xeeeeea, roughness: 0.5 });
    }
    case "board":
      return standard("bus-board", { color: 0xffb21a, emissive: 0xff9a00, emissiveIntensity: 0.6 });
    case "beaconred":
      return shared("beacon-red", () => new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 0.2 }));
    case "beaconblue":
      return shared("beacon-blue", () => new THREE.MeshStandardMaterial({ color: 0x2a6bff, emissive: 0x1050ff, emissiveIntensity: 0.2 }));
    default:
      return standard("veh-trim", { vertexColors: true, roughness: 0.8 });
  }
}

/**
 * A vehicle from its Blender model: one mesh per material role (colours in the vertices, so every
 * vehicle of a colour shares its buffers), one per wheel (left wheels mirrored, so the rim faces
 * out), and its doors as one `DoorMesh` (the detailed model only: traffic never opens a door).
 */
function blenderVehicle(kind: VehicleKind, color: number, template: VehicleTemplate): VehicleModel {
  const object = new THREE.Group();
  const livery = OWN_LIVERY[kind] ?? color;
  const beacons: THREE.MeshStandardMaterial[] = [];
  for (const part of template.body(livery)) {
    const material = roleMaterial(part.role);
    const mesh = new THREE.Mesh(part.geometry, material);
    mesh.castShadow = part.role !== "glass" && part.role !== "decal";
    mesh.receiveShadow = true;
    object.add(mesh);
    // Red first, then blue: `Vehicle` flashes them in turn.
    if (part.role === "beaconred") beacons.unshift(material as THREE.MeshStandardMaterial);
    if (part.role === "beaconblue") beacons.push(material as THREE.MeshStandardMaterial);
  }
  const wheelMaterial = standard("veh-wheel", { vertexColors: true, roughness: 0.6, metalness: 0.4 });
  const wheels = VEHICLE_TYPES[kind].physics.wheels.map((spec) => {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(template.wheel(spec.radius), wheelMaterial);
    mesh.castShadow = true;
    // The spinning part is a child, so steering (on the pivot) and rolling don't interfere.
    mesh.name = "spin";
    if (spec.x < 0) mesh.scale.x = -1;
    pivot.add(mesh);
    return pivot;
  });
  object.add(...wheels);
  const swing = DOOR_SWING[kind] ?? {};
  const leaves: Leaf[] = template
    .doors(livery)
    .filter((d) => swing[d.name])
    .map((d) => {
      const { hinge, open, group } = swing[d.name]!;
      return { hinge, open: THREE.MathUtils.degToRad(open), group, parts: [{ geometry: d.geometry.translate(-hinge.x, 0, -hinge.z) }] };
    });
  const model: { object: THREE.Group; wheels: THREE.Group[]; beacons?: THREE.MeshStandardMaterial[]; door?: (amount: number, leaf?: number) => void } = { object, wheels };
  if (beacons.length > 0) model.beacons = beacons;
  if (leaves.length > 0) {
    const door = new DoorMesh(leaves, doorMaterial(`glb:${kind}:${livery}`));
    object.add(door.mesh);
    model.door = (amount, leaf) => door.set(amount, leaf);
  }
  return model;
}

/**
 * A vehicle's model: the Blender one when loaded (`detail` picks the level), else the code-built
 * stand-in.
 */
export function buildVehicleModel(kind: VehicleKind, color: number, detail: VehicleDetail = "near"): VehicleModel {
  if (kind !== "auto") {
    const template = pickTemplate(kind, detail);
    if (template) return blenderVehicle(kind, color, template);
  }
  switch (kind) {
    case "car":
      return car(color);
    case "bike":
      return bike(color);
    case "auto":
      return auto(color, detail);
    case "ambulance":
      return ambulance();
    case "bus":
      return bus();
  }
}
