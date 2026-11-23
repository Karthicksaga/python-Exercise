/**
 * The Blender vehicles (`tools/blender/vehicles.py`, `auto_rickshaw.py`) as the game loads them:
 * real size round the physics body, on the ground, within the phone budget, wheels and doors where
 * the physics and riding poses expect them, and the cargo anchors.
 */
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { vehicleTemplate } from "./glbModels";
import { buildVehicleModel } from "./models";
import { VEHICLE_TYPES, groundBelow, type VehicleKind } from "./specs";
import { loadTestVehicleModels } from "./testModels";

const KINDS: readonly VehicleKind[] = ["car", "auto", "bike", "ambulance", "bus"];

/**
 * Triangles per vehicle, everything counted (body, every wheel, doors): detailed / traffic. The
 * auto's are the reviewed model's (TD-18 budget); the others were measured when they were made and
 * are held here so they don't creep (`docs/vehicles.md`).
 */
const BUDGET: Readonly<Record<VehicleKind, readonly [number, number]>> = {
  car: [11_000, 3_200],
  auto: [16_500, 12_500],
  bike: [8_000, 2_400],
  ambulance: [15_000, 4_000],
  bus: [13_000, 5_500],
};

/** Draw calls (meshes) per vehicle: one per material role, one per wheel, one for the doors. */
const DRAW_CALLS: Readonly<Record<VehicleKind, readonly [number, number]>> = {
  car: [12, 11],
  auto: [10, 10],
  bike: [9, 9],
  ambulance: [15, 13],
  bus: [13, 12],
};

function meshes(object: THREE.Object3D): THREE.Mesh[] {
  const list: THREE.Mesh[] = [];
  object.updateMatrixWorld(true);
  object.traverse((o) => {
    if (o instanceof THREE.Mesh) list.push(o);
  });
  return list;
}

const triangles = (object: THREE.Object3D) => meshes(object).reduce((sum, m) => sum + m.geometry.getAttribute("position").count / 3, 0);

/** Every vertex of the model's body and doors (not the wheels), in the chassis frame. */
function bodyPoints(object: THREE.Object3D): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (const mesh of meshes(object)) {
    if (mesh.name === "spin") continue;
    const p = mesh.geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld));
  }
  return points;
}

/** Distance from a point to the nearest triangle of the model's body and doors (not the wheels). */
function surfaceDistance(object: THREE.Object3D, at: THREE.Vector3): number {
  const tri = new THREE.Triangle();
  const closest = new THREE.Vector3();
  let best = Infinity;
  for (const mesh of meshes(object)) {
    if (mesh.name === "spin") continue;
    const p = mesh.geometry.getAttribute("position");
    for (let i = 0; i + 2 < p.count; i += 3) {
      tri.a.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
      tri.b.fromBufferAttribute(p, i + 1).applyMatrix4(mesh.matrixWorld);
      tri.c.fromBufferAttribute(p, i + 2).applyMatrix4(mesh.matrixWorld);
      tri.closestPointToPoint(at, closest);
      best = Math.min(best, closest.distanceTo(at));
    }
  }
  return best;
}

/** How far a ray from `from` along `direction` goes before it meets the model (Infinity if never). */
function rayDistance(object: THREE.Object3D, from: THREE.Vector3, direction: THREE.Vector3): number {
  object.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(from, direction.clone().normalize());
  const targets = meshes(object).filter((m) => m.name !== "spin");
  // Both faces count: a load rests on a floor, and is blocked by anything, from either side.
  const sides = targets.map((m) => (m.material as THREE.Material).side);
  for (const m of targets) (m.material as THREE.Material).side = THREE.DoubleSide;
  const hit = ray.intersectObjects(targets, false)[0];
  targets.forEach((m, i) => ((m.material as THREE.Material).side = sides[i]!));
  return hit ? hit.distance : Infinity;
}

/** A model with its wheels placed as parked traffic places them. */
function parked(kind: VehicleKind, detail: "near" | "far"): THREE.Group {
  const model = buildVehicleModel(kind, 0x8a2020, detail);
  VEHICLE_TYPES[kind].physics.wheels.forEach((w, i) => model.wheels[i]!.position.set(w.x, w.y - 0.3, w.z));
  return model.object;
}

describe("Blender vehicles", () => {
  beforeAll(loadTestVehicleModels);

  it.each(KINDS)("%s: both levels of detail are loaded", (kind) => {
    expect(vehicleTemplate(kind)).toBeDefined();
    expect(vehicleTemplate(`${kind}_lod1`)).toBeDefined();
  });

  it.each(KINDS)("%s: real size round the physics body, standing on the ground", (kind) => {
    const { physics } = VEHICLE_TYPES[kind];
    const half = physics.halfExtents;
    for (const detail of ["near", "far"] as const) {
      const object = parked(kind, detail);
      const points = bodyPoints(object);
      const box = new THREE.Box3().setFromPoints(points);
      // The lower half: the body and bumpers without mirrors, light bars and handlebars.
      const low = points.filter((p) => p.y < (box.min.y + box.max.y) / 2);
      const lowBox = new THREE.Box3().setFromPoints(low);
      const length = lowBox.max.z - lowBox.min.z;
      // Within 35 cm of the collider's length (bumpers and the bike's tyres stick out a little).
      expect(Math.abs(length - half.z * 2), `${kind} ${detail} length ${length}`).toBeLessThan(0.35);
      // As wide as the collider, give or take a door skin (the bike: its pegs and silencer inside the 0.64 m box).
      const width = Math.max(-lowBox.min.x, lowBox.max.x) * 2;
      if (kind === "bike") expect(width, `${kind} ${detail} width`).toBeLessThan(half.x * 2 + 0.02);
      else expect(Math.abs(width - half.x * 2), `${kind} ${detail} width ${width}`).toBeLessThan(0.12);
      // Nothing below the ground; wheels touch it.
      expect(box.min.y, `${kind} ${detail}`).toBeGreaterThan(groundBelow(kind) - 0.01);
      for (const [i, w] of physics.wheels.entries()) {
        const wheel = new THREE.Box3().setFromObject(object.children.filter((c) => c instanceof THREE.Group)[i]!);
        expect(wheel.min.y, `${kind} wheel ${i}`).toBeCloseTo(groundBelow(kind), 2);
        expect((wheel.max.y - wheel.min.y) / 2).toBeCloseTo(w.radius, 2);
      }
    }
  });

  it.each(KINDS)("%s: within the triangle and draw-call budget, detailed and traffic", (kind) => {
    for (const [i, detail] of (["near", "far"] as const).entries()) {
      const object = parked(kind, detail);
      expect(triangles(object), `${kind} ${detail} triangles`).toBeLessThanOrEqual(BUDGET[kind][i]!);
      expect(meshes(object).length, `${kind} ${detail} meshes`).toBeLessThanOrEqual(DRAW_CALLS[kind][i]!);
    }
  });

  it("traffic models have no moving doors; the detailed ones do", () => {
    for (const kind of ["car", "ambulance", "bus"] as const) {
      expect(buildVehicleModel(kind, 0, "near").door, kind).toBeDefined();
      expect(buildVehicleModel(kind, 0, "far").door, kind).toBeUndefined();
    }
  });

  it("mirrors the left wheels so every rim faces out", () => {
    const model = buildVehicleModel("car", 0x333333);
    VEHICLE_TYPES.car.physics.wheels.forEach((w, i) => {
      const spin = model.wheels[i]!.getObjectByName("spin")!;
      expect(spin.scale.x, `wheel ${i}`).toBe(w.x < 0 ? -1 : 1);
    });
  });

  it("shares geometry between vehicles of one colour", () => {
    const a = meshes(buildVehicleModel("car", 0x123456, "far").object);
    const b = meshes(buildVehicleModel("car", 0x123456, "far").object);
    expect(a[0]!.geometry).toBe(b[0]!.geometry);
  });

  it("motorbike: grips where the rider's hands go, pegs under the feet", () => {
    const object = parked("bike", "near");
    const { driver, pose } = VEHICLE_TYPES.bike;
    for (const side of [1, -1]) {
      // The palm's centre is on the grip's axis: within the grip's 17 mm radius of its rubber.
      const hand = new THREE.Vector3(driver.x + side * pose.hand.x, driver.y + pose.hand.y, driver.z + pose.hand.z);
      expect(surfaceDistance(object, hand), `grip ${side}`).toBeLessThan(0.025);
      // The footpeg the rider's ankle rests above (ridingPose.test.ts: pegs at y -0.265, z 0.12).
      expect(surfaceDistance(object, new THREE.Vector3(side * 0.24, -0.265, 0.12)), `peg ${side}`).toBeLessThan(0.02);
    }
  });

  it.each(["car", "ambulance", "bus"] as const)("%s: a steering wheel rim under the driver's hands", (kind) => {
    const object = parked(kind, "near");
    const { driver, pose } = VEHICLE_TYPES[kind];
    for (const side of [1, -1]) {
      const hand = new THREE.Vector3(driver.x + side * pose.hand.x, driver.y + pose.hand.y, driver.z + pose.hand.z);
      expect(surfaceDistance(object, hand), `${kind} hand ${side}`).toBeLessThan(0.03);
    }
  });

  it.each(KINDS)("%s: the cargo anchor is inside the body, on a surface", (kind) => {
    const { cargo, physics } = VEHICLE_TYPES[kind];
    const half = physics.halfExtents;
    expect(Math.abs(cargo.x)).toBeLessThan(half.x);
    expect(Math.abs(cargo.z)).toBeLessThan(half.z);
    // Something to rest on within 3 cm below the anchor; 25 cm of room above it for a parcel.
    const object = parked(kind, "near");
    const at = new THREE.Vector3(cargo.x, cargo.y + 0.02, cargo.z);
    expect(rayDistance(object, at, new THREE.Vector3(0, -1, 0)), `${kind} surface under the cargo`).toBeLessThan(0.05);
    expect(rayDistance(object, at, new THREE.Vector3(0, 1, 0)), `${kind} room above the cargo`).toBeGreaterThan(0.25);
  });

  it("ambulance: the stretcher space is empty, and the patient's door point leads into it", () => {
    const clear = VEHICLE_TYPES.ambulance.cargoClear!;
    const box = new THREE.Box3(new THREE.Vector3(clear.min.x, clear.min.y, clear.min.z), new THREE.Vector3(clear.max.x, clear.max.y, clear.max.z));
    const model = buildVehicleModel("ambulance", 0xffffff, "near");
    const inside = bodyPoints(model.object).filter((p) => box.containsPoint(p));
    expect(inside).toEqual([]);
    const patient = VEHICLE_TYPES.ambulance.passengers![0]!.inside;
    expect(box.containsPoint(new THREE.Vector3(patient.x, patient.y, patient.z))).toBe(true);
    expect(box.containsPoint(new THREE.Vector3(VEHICLE_TYPES.ambulance.cargo.x, VEHICLE_TYPES.ambulance.cargo.y + 0.03, VEHICLE_TYPES.ambulance.cargo.z))).toBe(true);
  });
});
