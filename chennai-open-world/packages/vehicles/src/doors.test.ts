/** The driver's doors: separate from the merged body, one mesh each, swinging the right way. */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildVehicleModel } from "./models";
import { VEHICLE_TYPES } from "./specs";

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

describe("vehicle doors", () => {
  it("car: the right front door swings out about 65° on its front hinge", () => {
    const model = buildVehicleModel("car", 0xc0392b);
    expect(model.door).toBeDefined();
    const door = doorOf(model.object);
    const shut = bounds(door);
    // Shut: flush with the right side, between the hinge (z -0.55) and the seam (z 0.5).
    expect(shut.max.x).toBeLessThan(0.9);
    expect(shut.min.z).toBeGreaterThan(-0.56);
    expect(shut.max.z).toBeLessThan(0.51);
    model.door!(1);
    const open = bounds(door);
    // The rear edge has gone out about 1.05 m × sin 65° from the hinge, to the right (+X) and forwards.
    expect(open.max.x).toBeGreaterThan(0.845 + 1.0 * Math.sin(THREE.MathUtils.degToRad(60)));
    expect(open.max.x).toBeLessThan(0.845 + 1.1 * Math.sin(THREE.MathUtils.degToRad(70)) + 0.06);
    expect(open.max.z).toBeLessThan(0);
    // The hinge stays put.
    expect(open.min.z).toBeGreaterThan(-0.6);
    model.door!(0);
    expect(bounds(door).max.x).toBeCloseTo(shut.max.x, 5);
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

  it.each(["car", "ambulance", "bus"] as const)("%s: one door mesh, with almost no triangles", (kind) => {
    const model = buildVehicleModel(kind, 0x3366aa);
    const doors: THREE.Mesh[] = [];
    model.object.traverse((node) => {
      if (node instanceof THREE.Mesh && node.name === "door") doors.push(node);
    });
    expect(doors).toHaveLength(1);
    expect(triangles(doors[0]!)).toBeLessThanOrEqual(72);
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
