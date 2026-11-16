/**
 * Vehicle bodies built in code: a profile is drawn from the side and extruded across the
 * vehicle's width, which gives rounded, car-like shapes without model files. Each model is
 * built around the chassis centre, facing -Z, and returns its wheels so they can spin and steer.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { autoPlateTexture, buildAutoParts, type AutoRole } from "./autoModel";
import type { VehicleKind } from "./specs";

export interface VehicleModel {
  readonly object: THREE.Group;
  /** One pivot per wheel, in the same order as the physics spec. */
  readonly wheels: THREE.Group[];
  /** Emergency lights that flash while the siren is on. */
  readonly beacons?: readonly THREE.MeshStandardMaterial[];
}

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
  // Door seams, handles and mirrors.
  for (const x of [-0.835, 0.835]) {
    object.add(box(0.012, 0.5, 0.02, dark, x, 0.02, -0.55), box(0.012, 0.5, 0.02, dark, x, 0.02, 0.5), box(0.012, 0.5, 0.02, dark, x, 0.02, 1.45));
    object.add(box(0.03, 0.035, 0.16, chrome(), x, 0.17, -0.15), box(0.03, 0.035, 0.16, chrome(), x, 0.17, 0.9));
    object.add(box(0.16, 0.1, 0.07, paint, x * 1.09, 0.4, -0.86));
  }
  // Grille and a strip of trim along the sill.
  object.add(box(1.0, 0.14, 0.03, dark, 0, -0.08, -2.0));
  for (const x of [-0.83, 0.83]) object.add(box(0.03, 0.08, 3.0, dark, x, -0.27, 0));
  // Wheel arches read as dark recesses.
  for (const x of [-0.8, 0.8]) for (const z of [-1.25, 1.25]) object.add(box(0.1, 0.34, 0.86, dark, x, -0.18, z));

  mergeParts(object, []);
  const wheels = [0, 1, 2, 3].map(() => wheel(0.32, 0.22));
  object.add(...wheels);
  return { object, wheels };
}

/**
 * The auto-rickshaw at real proportions (`autoModel.ts`). Its colours are in the vertices, so
 * every auto shares the same seven materials whatever its livery: about seven draw calls per auto
 * plus its wheels.
 */
function auto(color: number): VehicleModel {
  const object = new THREE.Group();
  const plate = autoPlateTexture();
  const byRole: Record<AutoRole, THREE.Material> = {
    paint: standard("auto-paint", { vertexColors: true, roughness: 0.35, metalness: 0.1 }),
    trim: standard("auto-trim", { vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),
    metal: standard("auto-metal", { vertexColors: true, roughness: 0.25, metalness: 0.9 }),
    glass: standard("auto-glass", { color: 0xbfd6dd, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    lamp: lampMaterial(),
    tail: tailMaterial(),
    plate: standard("auto-plate", plate ? { map: plate, roughness: 0.5 } : { color: 0xf4c400, roughness: 0.5 }),
  };
  const { parts, wheel: wheelGeometry } = buildAutoParts(color);
  for (const part of parts) {
    const mesh = new THREE.Mesh(part.geometry, byRole[part.role]);
    mesh.castShadow = part.role !== "glass";
    mesh.receiveShadow = true;
    object.add(mesh);
  }
  mergeParts(object, []);
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
      0.34,
      0.06,
      paint,
    ),
  );
  object.add(box(0.3, 0.09, 0.78, seat, 0, 0.2, 0.52)); // long seat for two
  object.add(box(0.26, 0.26, 0.4, frame, 0, -0.12, -0.08)); // engine block
  object.add(box(0.2, 0.06, 0.5, paint, 0, 0.12, 0.92)); // tail
  object.add(box(0.14, 0.07, 0.03, tailMaterial(), 0, 0.12, 1.18));
  // Front forks, handlebar, headlamp.
  for (const x of [-0.09, 0.09]) {
    const fork = box(0.04, 0.78, 0.04, steel, x, 0.06, -0.62);
    fork.rotation.x = -0.36;
    object.add(fork);
  }
  object.add(box(0.66, 0.035, 0.035, frame, 0, 0.5, -0.5));
  for (const x of [-0.33, 0.33]) object.add(box(0.1, 0.045, 0.045, seat, x, 0.5, -0.5));
  object.add(box(0.17, 0.17, 0.1, lampMaterial(), 0, 0.34, -0.66));
  // Exhaust, mudguards, footpegs.
  object.add(box(0.07, 0.07, 0.86, steel, 0.17, -0.2, 0.42));
  object.add(box(0.13, 0.03, 0.5, paint, 0, 0.0, -0.74), box(0.13, 0.03, 0.46, paint, 0, 0.02, 0.76));
  object.add(box(0.5, 0.03, 0.05, frame, 0, -0.28, 0.12));

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
    object.add(box(0.02, 0.48, 0.7, glass(), x, 0.7, -0.85)); // cab side windows
    object.add(box(0.02, 0.22, 3.4, red, x, 0.08, 0.75)); // stripe
    for (let i = 0; i < 6; i++) object.add(box(0.025, 0.14, 0.28, i % 2 ? yellow : red, x, -0.24, -0.15 + i * 0.56)); // checks
    object.add(box(0.012, 1.4, 0.02, dark, x, 0.3, -0.42)); // door seam
  }
  object.add(box(0.02, 1.3, 0.02, dark, 0, 0.35, 2.56)); // rear doors
  object.add(box(1.96, 0.22, 0.14, dark, 0, -0.5, -2.53), box(1.96, 0.22, 0.14, dark, 0, -0.5, 2.55));
  for (const x of [-0.68, 0.68]) object.add(box(0.36, 0.14, 0.05, lampMaterial(), x, 0.1, -2.5), box(0.2, 0.3, 0.05, tailMaterial(), x * 1.2, 0.3, 2.56));
  for (const x of [-0.9, 0.9]) for (const z of [-1.6, 1.55]) object.add(box(0.1, 0.36, 0.95, dark, x, -0.42, z));
  // Light bar: one red and one blue lamp each side of a dark base.
  const beaconRed = shared("beacon-red", () => new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 0.2 }));
  const beaconBlue = shared("beacon-blue", () => new THREE.MeshStandardMaterial({ color: 0x2a6bff, emissive: 0x1050ff, emissiveIntensity: 0.2 }));
  object.add(box(1.3, 0.08, 0.34, dark, 0, 1.16, -1.0));
  object.add(box(0.5, 0.14, 0.3, beaconRed, -0.36, 1.26, -1.0), box(0.5, 0.14, 0.3, beaconBlue, 0.36, 1.26, -1.0));

  mergeParts(object, []);
  const wheels = [0, 1, 2, 3].map(() => wheel(0.38, 0.26));
  object.add(...wheels);
  return { object, wheels, beacons: [beaconRed, beaconBlue] };
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
    object.add(box(0.02, 0.8, 8.9, glass(), x, 1.0, 0.25)); // window band
    object.add(box(0.025, 0.16, 9.8, cream, x, 0.42, 0)); // waist stripe
    for (let i = 0; i < 7; i++) object.add(box(0.03, 0.8, 0.08, paint, x, 1.0, -4.0 + i * 1.33)); // window pillars
  }
  object.add(box(0.03, 1.9, 1.1, glass(), -1.265, 0.35, -3.6)); // front door, kerb side
  object.add(box(0.03, 1.9, 1.1, glass(), -1.265, 0.35, 2.0)); // rear door
  object.add(box(2.3, 1.15, 0.03, glass(), 0, 0.85, -5.07)); // windscreen
  object.add(box(1.6, 0.24, 0.04, board, 0, 1.55, -5.08)); // destination board (no text)
  object.add(box(2.52, 0.28, 0.16, dark, 0, -0.62, -5.06), box(2.52, 0.28, 0.16, dark, 0, -0.62, 5.06));
  for (const x of [-0.95, 0.95]) object.add(box(0.3, 0.16, 0.05, lampMaterial(), x, -0.3, -5.07), box(0.24, 0.32, 0.05, tailMaterial(), x, -0.1, 5.07));
  for (const x of [-1.15, 1.15]) for (const z of [-3.3, 2.8]) object.add(box(0.14, 0.6, 1.3, dark, x, -0.55, z));

  mergeParts(object, []);
  const wheels = [0, 1, 2, 3].map(() => wheel(0.5, 0.32));
  object.add(...wheels);
  return { object, wheels };
}

export function buildVehicleModel(kind: VehicleKind, color: number): VehicleModel {
  switch (kind) {
    case "car":
      return car(color);
    case "bike":
      return bike(color);
    case "auto":
      return auto(color);
    case "ambulance":
      return ambulance();
    case "bus":
      return bus();
  }
}
