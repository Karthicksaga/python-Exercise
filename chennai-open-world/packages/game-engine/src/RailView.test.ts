import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { RailFile } from "@cow/rail";
import { RailView } from "./RailView";
import { TrainView, coachGeometry } from "./TrainView";

const triangles = (object: THREE.Object3D) => {
  let n = 0;
  object.traverse((o) => {
    if (o instanceof THREE.Mesh) n += (o.geometry.index?.count ?? 0) / 3;
  });
  return n;
};
const meshes = (object: THREE.Object3D) => {
  let n = 0;
  object.traverse((o) => {
    if (o instanceof THREE.Mesh) n++;
  });
  return n;
};

// Two parallel tracks 2 km long, running south, and one station with a side platform.
const file: RailFile = {
  attribution: "© OpenStreetMap contributors",
  tracks: [
    { id: 1, kind: "main", points: [0, 0, 0, 2000] },
    { id: 2, kind: "service", points: [6, 0, 6, 2000] },
  ],
  lines: [
    {
      id: "down",
      name: "Down",
      points: [0, 0, 0, 2000],
      stops: [{ id: "s", name: "Station", nameTa: "நிலையம்", s: 1000, side: -1, width: 4 }],
      from: { name: "A", beyond: true },
      to: { name: "B", beyond: true },
      headwayMinutes: 8,
      offsetMinutes: 0,
    },
  ],
  stations: [{ id: "s", name: "Station", nameTa: "நிலையம்", x: -8, z: 1000 }],
};

describe("RailView", () => {
  it("draws only the cells near the player, one mesh each, and frees them behind", () => {
    const view = new RailView(file, { drawDistance: 400, detailDistance: 200, tamil: false });
    for (let i = 0; i < 10; i++) view.update(0, 1000, 10);
    expect(view.drawnCells).toBeGreaterThan(0);
    expect(view.drawnCells).toBeLessThanOrEqual(5);
    // One merged mesh per cell (boards need the DOM's canvas, not here).
    expect(meshes(view.object)).toBe(view.drawnCells);
    for (let i = 0; i < 10; i++) view.update(5000, 5000, 10);
    expect(view.drawnCells).toBe(0);
    expect(meshes(view.object)).toBe(0);
  });

  it("builds a whole station (shelter, FOB, booking office, furniture) for a few thousand triangles", () => {
    const near = new RailView(file, { drawDistance: 400, detailDistance: 200, tamil: false });
    const bare = new RailView({ ...file, lines: [{ ...file.lines[0]!, stops: [] }] }, { drawDistance: 400, detailDistance: 200, tamil: false });
    for (let i = 0; i < 10; i++) {
      near.update(0, 1000, 10);
      bare.update(0, 1000, 10);
    }
    const station = triangles(near.object) - triangles(bare.object);
    console.log(`station kit, detailed: ${station} triangles`);
    expect(station).toBeGreaterThan(1500);
    expect(station).toBeLessThan(9000);
    expect(near.platforms).toHaveLength(1);
  });

  it("keeps the triangle count of a station's surroundings modest", () => {
    const view = new RailView(file, { drawDistance: 400, detailDistance: 200, tamil: false });
    for (let i = 0; i < 10; i++) view.update(0, 1000, 10);
    // About 800 m of two tracks with sleepers near, plus a platform: well under the 300k budget.
    expect(triangles(view.object)).toBeLessThan(30_000);
  });
});

describe("TrainView", () => {
  it("draws every coach as an instance of two meshes", () => {
    const trains = new TrainView(16);
    trains.place([
      { x: 0, z: 0, yaw: 0, cab: true },
      { x: 0, z: 21, yaw: 0, cab: false },
      { x: 0, z: 42, yaw: 0, cab: false },
      { x: 0, z: 63, yaw: Math.PI, cab: true },
    ]);
    const [cabs, trailers] = trains.object.children as [THREE.InstancedMesh, THREE.InstancedMesh];
    expect(cabs.count).toBe(2);
    expect(trailers.count).toBe(2);
    trains.place([]);
    expect(cabs.visible).toBe(false);
  });

  it("is a light model", () => {
    const cab = coachGeometry(true);
    expect((cab.index?.count ?? 0) / 3).toBeLessThan(1000);
    cab.computeBoundingBox();
    const size = cab.boundingBox!.getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(20);
    expect(size.x).toBeLessThan(3.4);
  });
});
