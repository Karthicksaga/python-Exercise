import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { loadVehicleModels, vehicleTemplate } from "./glbModels";
import { buildVehicleModel } from "./models";
import { VEHICLE_TYPES } from "./specs";

const url = `data:model/gltf-binary;base64,${readFileSync(fileURLToPath(new URL("../../../assets/optimized/vehicles/auto_rickshaw_lod1.glb", import.meta.url))).toString("base64")}`;

describe("Blender auto-rickshaw", async () => {
  await loadVehicleModels({ auto: { url, ground: -0.68 } });
  const template = vehicleTemplate("auto")!;

  it("loads the optimised model into a few merged parts", () => {
    const body = template.body(0xf5c400);
    expect(body.length).toBeGreaterThanOrEqual(5);
    expect(body.length).toBeLessThanOrEqual(7);
    // Same colour, same buffers: copies share their geometry.
    expect(template.body(0xf5c400)[0]!.geometry).toBe(body[0]!.geometry);
  });

  it("stands on the game's ground, facing -Z, at real size", () => {
    const box = new THREE.Box3();
    for (const p of template.body(0xf5c400)) {
      p.geometry.computeBoundingBox();
      box.union(p.geometry.boundingBox!);
    }
    // The lowest parts are the fork ends and exhaust at axle height; the wheels touch the ground.
    expect(box.min.y).toBeGreaterThan(-0.68);
    expect(box.min.y).toBeLessThan(-0.4);
    expect(box.max.y + 0.68).toBeCloseTo(1.71, 1);
    expect(box.max.z - box.min.z).toBeGreaterThan(2.6);
    expect(box.max.z - box.min.z).toBeLessThan(2.85);
  });

  it("has one wheel geometry centred on the axle, scaled to the physics radius", () => {
    const radius = VEHICLE_TYPES.auto.physics.wheels[0]!.radius;
    const wheel = template.wheel(radius);
    wheel.computeBoundingBox();
    expect(wheel.boundingBox!.max.y).toBeCloseTo(radius, 2);
    expect(wheel.boundingBox!.min.y).toBeCloseTo(-radius, 2);
    expect(wheel.boundingBox!.max.x - wheel.boundingBox!.min.x).toBeLessThan(0.2);
  });

  it("builds autos from it: about ten draw calls each", () => {
    const model = buildVehicleModel("auto", 0xf5c400);
    let meshes = 0;
    model.object.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes++;
    });
    expect(meshes).toBeLessThanOrEqual(10);
    expect(model.wheels).toHaveLength(3);
  });
});
