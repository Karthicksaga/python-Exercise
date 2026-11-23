import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { Building, ChunkData } from "@cow/game-world";
import { ChunkView, type ChunkAssets } from "./ChunkView";

const block = (id: number, x: number): Building => ({
  id,
  kind: "apartments",
  height: 9.6,
  floors: 3,
  color: 0xffffff,
  outline: [
    { x, z: 0 },
    { x, z: -9 },
    { x: x + 12, z: -9 },
    { x: x + 12, z: 0 },
  ],
});

const chunk = (count: number): ChunkData => ({
  key: "0,0",
  col: 0,
  row: 0,
  buildings: Array.from({ length: count }, (_, i) => block(i + 1, i * 20)),
  trees: [{ x: 5, z: 5, scale: 1 }],
  areas: [],
} as unknown as ChunkData);

const triangles = (view: ChunkView) => {
  let n = 0;
  view.object.traverse((node) => {
    if (node instanceof THREE.Mesh && node.geometry.index) n += node.geometry.index.count / 3;
  });
  return n;
};

describe("a chunk built step by step", () => {
  // Plain stand-ins: the real assets draw their textures on a canvas, which unit tests lack. No
  // roads, areas or furniture are given, so the ground and furniture assets are never used.
  const material = () => new THREE.MeshStandardMaterial();
  const box = () => new THREE.BoxGeometry(1, 1, 1);
  const assets = {
    walls: material(),
    roofs: material(),
    kit: material(),
    trunk: box(),
    crown: box(),
    trunkMaterial: material(),
    crownMaterial: material(),
    tank: box(),
    tankMaterial: material(),
    palm: box(),
    palmMaterial: material(),
    ground: {},
    furniture: {},
  } as unknown as ChunkAssets;

  it("is not complete until its steps have run, and then matches one built at once", () => {
    const data = chunk(20);
    const whole = new ChunkView(data, assets);
    expect(whole.complete).toBe(true);
    const stepped = new ChunkView(data, assets, [], undefined, [], true);
    expect(stepped.complete).toBe(false);
    // A zero budget runs one step per call: 20 buildings take several calls, not one.
    let calls = 0;
    while (!stepped.advance(0)) calls++;
    expect(calls).toBeGreaterThan(3);
    expect(stepped.complete).toBe(true);
    expect(stepped.object.children.length).toBe(whole.object.children.length);
    expect(triangles(stepped)).toBe(triangles(whole));
  });

  it("works out its furniture and props only when it gets to them", () => {
    let asked = 0;
    const view = new ChunkView(chunk(2), assets, [], () => {
      asked++;
      return undefined;
    }, [], true);
    expect(asked).toBe(0);
    view.finish();
    expect(asked).toBe(1);
  });

  it("stops building once disposed part-way", () => {
    const view = new ChunkView(chunk(20), assets, [], undefined, [], true);
    view.advance(0);
    view.dispose();
    expect(view.advance(Infinity)).toBe(true);
  });
});
