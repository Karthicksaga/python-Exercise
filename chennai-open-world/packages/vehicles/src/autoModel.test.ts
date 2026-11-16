import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AUTO_SIZE, bandColour, buildAutoParts } from "./autoModel";
import { buildVehicleModel } from "./models";
import { VEHICLE_TYPES } from "./specs";

const box = (geometries: readonly THREE.BufferGeometry[]) => {
  const b = new THREE.Box3();
  for (const g of geometries) {
    g.computeBoundingBox();
    b.union(g.boundingBox!);
  }
  return b;
};
const triangles = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute("position").count) / 3;

describe("auto-rickshaw model", () => {
  const { parts, wheel } = buildAutoParts(0xf2b705);
  const body = box(parts.map((p) => p.geometry));

  it("is built to real proportions, facing -Z, standing on the ground", () => {
    // Body 2.63 m; bumpers, lamps and plates add a few centimetres at each end.
    expect(body.max.z - body.min.z).toBeGreaterThan(AUTO_SIZE.length - 0.02);
    expect(body.max.z - body.min.z).toBeLessThan(AUTO_SIZE.length + 0.1);
    expect(body.max.x - body.min.x).toBeLessThanOrEqual(AUTO_SIZE.width + 0.32); // mirrors stick out about 15 cm each side
    expect(body.max.x - body.min.x).toBeGreaterThan(AUTO_SIZE.width - 0.1);
    // Ground is ride height plus settled suspension below the chassis centre (TrafficCar, specs).
    const spec = VEHICLE_TYPES.auto.physics.wheels[0]!;
    const ground = spec.y - 0.3 - spec.radius;
    expect(body.max.y - ground).toBeCloseTo(AUTO_SIZE.height, 1);
    expect(body.min.y).toBeGreaterThanOrEqual(ground - 0.01);
    // Headlamps are at the front, which is -Z.
    const lamps = box(parts.filter((p) => p.role === "lamp").map((p) => p.geometry));
    expect(lamps.max.z).toBeLessThan(body.min.z + 0.1);
  });

  it("matches the physics wheels: one in front on the centre line, two behind", () => {
    const wheels = VEHICLE_TYPES.auto.physics.wheels;
    expect(wheels[0]!.x).toBe(0);
    expect(wheels[0]!.z).toBeCloseTo(-1.0);
    expect(wheels[1]!.z).toBeCloseTo(0.8);
    expect(wheels[0]!.radius).toBe(AUTO_SIZE.wheelRadius);
    wheel.computeBoundingBox();
    const w = wheel.boundingBox!;
    expect(w.max.y).toBeCloseTo(AUTO_SIZE.wheelRadius, 2);
    // Axle along X: narrow across, round in Y and Z.
    expect(w.max.x - w.min.x).toBeLessThan(0.2);
    expect(w.max.z).toBeCloseTo(AUTO_SIZE.wheelRadius, 2);
  });

  it("stays within its draw-call and triangle budget", () => {
    const model = buildVehicleModel("auto", 0xf2b705);
    const meshes: THREE.Mesh[] = [];
    model.object.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    // Seven materials for the body, three wheels.
    expect(meshes.length).toBeLessThanOrEqual(10);
    const total = meshes.reduce((n, m) => n + triangles(m.geometry), 0);
    expect(total).toBeLessThan(9000);
    expect(model.wheels).toHaveLength(3);
  });

  it("paints battery autos green with a yellow band, others with a green band", () => {
    expect(bandColour(0x0f5132)).toBe(0xf2c200);
    expect(bandColour(0xf2b705)).toBe(0x1f7a3a);
    expect(bandColour(0xe0559a)).toBe(0x1f7a3a);
  });
});
