/**
 * Vehicle bodies built in code: a profile is drawn from the side and extruded across the
 * vehicle's width, which gives rounded, car-like shapes without model files. Each model is
 * built around the chassis centre, facing -Z, and returns its wheels so they can spin and steer.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { VehicleKind } from "./specs";

export interface VehicleModel {
  readonly object: THREE.Group;
  /** One pivot per wheel, in the same order as the physics spec. */
  readonly wheels: THREE.Group[];
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

function auto(): VehicleModel {
  const object = new THREE.Group();
  const yellow = standard("auto-yellow", { color: 0xf5c400, roughness: 0.45, metalness: 0.15 });
  const black = standard("auto-black", { color: 0x1a1a1c, roughness: 0.75 });
  const seat = standard("auto-seat", { color: 0x5b2f22, roughness: 0.9 });

  // Body tub: rounded nose rising to the windscreen, flat floor, upright back.
  object.add(
    extruded(
      [
        [-1.35, -0.32], [-1.42, -0.05], [-1.2, 0.28], [-0.72, 0.36], [-0.7, 0.05], [1.2, 0.05], [1.3, 0.5], [1.3, -0.32],
      ],
      1.3,
      0.06,
      yellow,
    ),
  );
  // Soft-top hood on a frame.
  object.add(
    extruded(
      [
        [-0.78, 1.16], [-0.6, 1.26], [1.22, 1.26], [1.34, 1.1], [1.34, 0.5], [1.24, 0.5], [1.24, 1.14], [-0.74, 1.14],
      ],
      1.34,
      0.03,
      black,
    ),
  );
  for (const x of [-0.6, 0.6]) object.add(box(0.05, 0.84, 0.05, black, x, 0.75, -0.76)); // windscreen posts
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 0.7), standard("auto-screen", { color: 0xa9cbdc, roughness: 0.1, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
  screen.position.set(0, 0.78, -0.77);
  object.add(screen);
  object.add(box(0.5, 0.1, 0.42, seat, 0, 0.18, -0.35)); // driver's seat
  object.add(box(1.16, 0.12, 0.5, seat, 0, 0.2, 0.72), box(1.16, 0.5, 0.1, seat, 0, 0.48, 1.0)); // passenger bench
  object.add(box(0.5, 0.05, 0.05, black, 0, 0.6, -0.62)); // handlebar
  object.add(box(0.22, 0.16, 0.05, lampMaterial(), 0, 0.1, -1.42));
  // Meter-style green stripe: an original livery, not any operator's.
  object.add(box(1.32, 0.07, 1.9, standard("auto-stripe", { color: 0x1f7a4d, roughness: 0.5 }), 0, -0.02, 0.2));

  mergeParts(object, []);
  const wheels = [0, 1, 2].map(() => wheel(0.24, 0.14));
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

export function buildVehicleModel(kind: VehicleKind, color: number): VehicleModel {
  if (kind === "car") return car(color);
  return kind === "bike" ? bike(color) : auto();
}
