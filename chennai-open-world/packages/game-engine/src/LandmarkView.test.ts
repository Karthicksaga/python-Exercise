import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { gopuramProfile, type Landmark } from "@cow/game-world";
import { LandmarkView, gopuramGeometry } from "./LandmarkView";

const temple: Landmark = {
  id: "kapaleeshwarar-temple",
  kind: "temple",
  name: "Kapaleeshwarar Temple",
  x: 0,
  z: 0,
  height: 37,
  levels: 7,
  radius: 13,
  source: "test",
  estimated: ["height", "levels", "radius", "position"],
};

const triangles = (geometry: THREE.BufferGeometry) => (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;

describe("gopuramGeometry", () => {
  const profile = gopuramProfile(temple);
  const geometry = gopuramGeometry(profile);

  it("fills exactly the profile's footprint and height, broad faces east and west", () => {
    const box = geometry.boundingBox!;
    expect(box.min.x).toBeCloseTo(-profile.base.hx0, 5);
    expect(box.max.x).toBeCloseTo(profile.base.hx0, 5);
    expect(box.min.z).toBeCloseTo(-profile.base.hz0, 5);
    expect(box.max.z).toBeCloseTo(profile.base.hz0, 5);
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeCloseTo(profile.height, 5);
    // The broad faces (long side along z) look east and west (±x).
    expect(box.max.z - box.min.z).toBeGreaterThan(box.max.x - box.min.x);
  });

  it("stays within the triangle budget and is vertex-coloured", () => {
    expect(triangles(geometry)).toBeLessThanOrEqual(6000);
    expect(geometry.getAttribute("color").count).toBe(geometry.getAttribute("position").count);
  });

  it("leaves the passage through the base open east-west, and blocks it either side", () => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const ray = (z: number, y: number) => {
      const caster = new THREE.Raycaster(new THREE.Vector3(-30, y, z), new THREE.Vector3(1, 0, 0));
      return caster.intersectObject(mesh).length;
    };
    for (const y of [0.5, profile.passage.top / 2, profile.passage.top - 0.2]) {
      for (const z of [0, profile.passage.half - 0.2, -(profile.passage.half - 0.2)]) expect(ray(z, y)).toBe(0);
    }
    expect(ray(profile.passage.half + 1, 2)).toBeGreaterThan(0);
    expect(ray(0, (profile.passage.top + profile.base.top) / 2)).toBeGreaterThan(0);
  });
});

describe("LandmarkView", () => {
  it("models the tower and a temple with a footprint, each one mesh casting and receiving shadows", () => {
    const tower: Landmark = { id: "tower", kind: "tower", name: "Tower", x: 10, z: 20, height: 41, levels: 12, radius: 9.5, source: "test", estimated: [] };
    const beach: Landmark = { id: "beach", kind: "beach", name: "Beach", x: 0, z: 0, source: "test", estimated: [] };
    const view = new LandmarkView([tower, { ...temple, x: 6476, z: 5707 }, beach]);
    const meshes = view.object.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    expect(meshes.map((m) => m.name)).toEqual(["tower", "kapaleeshwarar-temple"]);
    expect(meshes[1]!.position.toArray()).toEqual([6476, 0, 5707]);
    for (const mesh of meshes) {
      expect(mesh.castShadow && mesh.receiveShadow).toBe(true);
      expect(mesh.material).toBe(meshes[0]!.material);
    }
    view.dispose();
  });
});
