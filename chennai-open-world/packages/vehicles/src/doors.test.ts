/** Doors, the driver's and the passengers': separate from the merged body, one mesh per vehicle, swinging the right way. */
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { buildVehicleModel } from "./models";
import { VEHICLE_TYPES } from "./specs";
import { loadTestVehicleModels } from "./testModels";

function doorOf(object: THREE.Object3D): THREE.Mesh {
  const door = object.getObjectByName("door");
  if (!(door instanceof THREE.Mesh)) throw new Error("no door mesh");
  return door;
}

function bounds(mesh: THREE.Mesh): THREE.Box3 {
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox!.clone();
}

const triangles = (mesh: THREE.Mesh) => mesh.geometry.getAttribute("position").count / 3;

/** Bounds of the door mesh's vertices that pass `keep` (one door of several in the mesh). */
function boundsWhere(mesh: THREE.Mesh, keep: (x: number, z: number, y: number) => boolean): THREE.Box3 {
  const position = mesh.geometry.getAttribute("position");
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    if (keep(v.x, v.z, v.y)) box.expandByPoint(v);
  }
  return box;
}

describe("vehicle doors", () => {
  // The doors of the Blender models, as the game draws them (the player's and parked vehicles).
  beforeAll(loadTestVehicleModels);

  it("car: the right front door swings out about 65° on its front hinge", () => {
    const model = buildVehicleModel("car", 0xc0392b);
    expect(model.door).toBeDefined();
    const mesh = doorOf(model.object);
    // The mesh also holds the two rear passenger doors (z 0.5 to 1.45 when shut): look at the front right one.
    const front = (x: number, z: number) => x > 0 && z < 0.502;
    const shut = boundsWhere(mesh, front);
    // Shut: flush with the right side, between the hinge (z -0.55) and the seam (z 0.5).
    expect(shut.max.x).toBeLessThan(0.9);
    expect(shut.min.z).toBeGreaterThan(-0.56);
    expect(shut.max.z).toBeLessThan(0.51);
    model.door!(1);
    const open = boundsWhere(mesh, front);
    // The rear edge has gone out about 1.05 m × sin 65° from the hinge, to the right (+X) and forwards.
    expect(open.max.x).toBeGreaterThan(0.845 + 1.0 * Math.sin(THREE.MathUtils.degToRad(60)));
    expect(open.max.x).toBeLessThan(0.845 + 1.1 * Math.sin(THREE.MathUtils.degToRad(70)) + 0.06);
    // The panel below the window has swung forwards of the seam. (The window frame leans in with
    // the glasshouse, so its top swings round a little further back: judge the panel below it.)
    expect(boundsWhere(mesh, (x, z, y) => front(x, z) && y < 0.2).max.z).toBeLessThan(0);
    // The hinge stays put.
    expect(open.min.z).toBeGreaterThan(-0.6);
    model.door!(0);
    expect(boundsWhere(mesh, front).max.x).toBeCloseTo(shut.max.x, 5);
  });

  it("car: the rear passenger doors open on their own, each to its own side", () => {
    const model = buildVehicleModel("car", 0xc0392b);
    const mesh = doorOf(model.object);
    const rear = (side: number) => (x: number, z: number) => x * side > 0 && z > 0.502;
    const shutLeft = boundsWhere(mesh, rear(-1));
    expect(shutLeft.min.x).toBeGreaterThan(-0.9);
    expect(shutLeft.min.z).toBeGreaterThan(0.49);
    expect(shutLeft.max.z).toBeLessThan(1.46);
    model.door!(1, 1);
    // The left rear door swings out to the left; the driver's and the right rear stay shut.
    expect(boundsWhere(mesh, rear(-1)).min.x).toBeLessThan(-0.845 - 0.8);
    expect(bounds(mesh).max.x).toBeLessThan(0.9);
    model.door!(1, 2);
    expect(boundsWhere(mesh, rear(1)).max.x).toBeGreaterThan(0.845 + 0.8);
    model.door!(0, 1);
    expect(boundsWhere(mesh, rear(-1)).min.x).toBeCloseTo(shutLeft.min.x, 5);
  });

  it("ambulance: the two rear doors open outwards for the patient", () => {
    const model = buildVehicleModel("ambulance", 0);
    const mesh = doorOf(model.object);
    const back = (_x: number, z: number) => z > 2;
    expect(boundsWhere(mesh, back).max.z).toBeLessThan(2.62);
    model.door!(1, 1);
    const open = boundsWhere(mesh, back);
    // Swung right round: out past the back and beyond the sides.
    expect(open.max.z).toBeGreaterThan(3.1);
    expect(open.max.x).toBeGreaterThan(0.9);
    expect(open.min.x).toBeLessThan(-0.9);
  });

  it("every vehicle that carries fares has a passenger door outside its body", () => {
    for (const kind of ["car", "auto", "ambulance", "bus"] as const) {
      const doors = VEHICLE_TYPES[kind].passengers ?? [];
      expect(doors.length, kind).toBeGreaterThan(0);
      const half = VEHICLE_TYPES[kind].physics.halfExtents;
      for (const door of doors) {
        expect(Math.abs(door.point.x) > half.x || Math.abs(door.point.z) > half.z, kind).toBe(true);
        if (door.leaf !== undefined) expect(buildVehicleModel(kind, 0).door, kind).toBeDefined();
      }
    }
    expect(VEHICLE_TYPES.bike.passengers).toBeUndefined();
  });

  it("ambulance: the right cab door swings out", () => {
    const model = buildVehicleModel("ambulance", 0);
    const door = doorOf(model.object);
    const shut = bounds(door);
    expect(shut.max.x).toBeLessThan(1.06);
    model.door!(1);
    expect(bounds(door).max.x).toBeGreaterThan(1.6);
  });

  it("bus: the kerb-side front door folds open in two leaves, both outwards", () => {
    const model = buildVehicleModel("bus", 0);
    const door = doorOf(model.object);
    const shut = bounds(door);
    // Shut: across the 1.1 m opening on the left side (x -1.25), z -4.15 to -3.05.
    expect(shut.min.x).toBeGreaterThan(-1.32);
    expect(shut.min.z).toBeGreaterThan(-4.16);
    expect(shut.max.z).toBeLessThan(-3.04);
    model.door!(1);
    // Open: the leaves stick out to the left (-X) and the middle of the opening is clear.
    const position = door.geometry.getAttribute("position");
    let left = 0;
    let inMiddle = 0;
    for (let i = 0; i < position.count; i++) {
      left = Math.min(left, position.getX(i));
      if (Math.abs(position.getZ(i) + 3.6) < 0.35) inMiddle++;
    }
    expect(left).toBeLessThan(-1.7);
    expect(inMiddle).toBe(0);
  });

  // One mesh (one draw call) for all of a vehicle's doors: the car's holds three doors since the
  // passengers' rear doors were added, the ambulance's its cab door and two rear doors. Raised
  // (from 180, 120, 72) with the Blender models: a door is now the body's own curved panel with
  // its window, an inside card and a handle (measured 613, 1111 and 144); still one draw call.
  const DOOR_TRIANGLES = { car: 700, ambulance: 1200, bus: 160 } as const;
  it.each(["car", "ambulance", "bus"] as const)("%s: one door mesh, with almost no triangles", (kind) => {
    const model = buildVehicleModel(kind, 0x3366aa);
    const doors: THREE.Mesh[] = [];
    model.object.traverse((node) => {
      if (node instanceof THREE.Mesh && node.name === "door") doors.push(node);
    });
    expect(doors).toHaveLength(1);
    expect(triangles(doors[0]!)).toBeLessThanOrEqual(DOOR_TRIANGLES[kind]);
    expect(VEHICLE_TYPES[kind].entry.door).not.toBe("none");
  });

  it("shares one door material per colour", () => {
    const a = doorOf(buildVehicleModel("car", 0x123456).object);
    const b = doorOf(buildVehicleModel("car", 0x123456).object);
    const c = doorOf(buildVehicleModel("car", 0x654321).object);
    expect(a.material).toBe(b.material);
    expect(a.material).not.toBe(c.material);
  });

  it.each(["auto", "bike"] as const)("%s: no door", (kind) => {
    const model = buildVehicleModel(kind, 0xf5c400);
    expect(model.door).toBeUndefined();
    expect(model.object.getObjectByName("door")).toBeUndefined();
  });
});
