import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PROP_SIZE, pointInPolygon, type Building, type PropKind } from "@cow/game-world";
import { buildStreetProps, buildingFixtures, loadPropAssets, type PropSources } from "./StreetProps";

const file = (name: string) => `data:model/gltf-binary;base64,${readFileSync(fileURLToPath(new URL(`../../../assets/optimized/props/${name}.glb`, import.meta.url))).toString("base64")}`;
const sources: PropSources = {
  handcart: file("handcart"),
  crates: file("crates"),
  barrel: file("barrel"),
  clayPots: file("clay_pots"),
  acUnit: file("ac_unit"),
  dish: file("dish_antenna"),
};

describe("loadPropAssets", async () => {
  const assets = await loadPropAssets(sources);

  it("bakes pavement props centred on the footprint game-world uses for their solids", () => {
    for (const kind of Object.keys(PROP_SIZE) as PropKind[]) {
      const box = assets.bounds[kind];
      const size = PROP_SIZE[kind];
      expect(box.min.y, kind).toBeCloseTo(0, 5);
      expect(box.max.y, kind).toBeLessThanOrEqual(size.h + 0.02);
      expect(box.max.y, kind).toBeGreaterThan(size.h - 0.1);
      expect(box.max.x, kind).toBeCloseTo(size.hx, 1);
      expect(-box.min.x, kind).toBeCloseTo(size.hx, 1);
      expect(box.max.z, kind).toBeCloseTo(size.hz, 1);
      expect(-box.min.z, kind).toBeCloseTo(size.hz, 1);
    }
  });
  it("keeps wall fixtures' backs at z = 0, sticking out along +Z", () => {
    for (const model of ["acUnit", "dish"] as const) {
      const box = assets.bounds[model];
      expect(box.min.z, model).toBeGreaterThan(-0.06);
      expect(box.max.z, model).toBeGreaterThan(0.3);
    }
  });
  it("takes colours from the materials, not one flat colour", () => {
    const colours = new Set<string>();
    const c = assets.models.handcart.color;
    for (let i = 0; i < c.length; i += 3) colours.add(`${c[i]!.toFixed(2)},${c[i + 1]!.toFixed(2)},${c[i + 2]!.toFixed(2)}`);
    expect(colours.size).toBeGreaterThanOrEqual(5);
  });
  it("merges a chunk's props into one mesh, turned and placed", () => {
    const mesh = buildStreetProps([{ model: "barrel", x: 10, y: 0, z: 5, yaw: 0 }, { model: "handcart", x: -4, y: 0, z: 2, yaw: Math.PI / 2 }], assets)!;
    const count = mesh.geometry.getAttribute("position").count;
    expect(count).toBe((assets.models.barrel.position.length + assets.models.handcart.position.length) / 3);
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    // The handcart, turned a quarter, runs along Z.
    expect(box.min.z).toBeCloseTo(2 - PROP_SIZE.handcart.hx, 1);
    expect(box.max.x).toBeCloseTo(10 + PROP_SIZE.barrel.hx, 1);
    expect(buildStreetProps([], assets)).toBeNull();
  });
});

describe("buildingFixtures", () => {
  /** A 12 m × 9 m block, wound like OSM outlines in the world data (outward normal (dz, -dx)). */
  const block = (id: number, floors = 3): Building => ({ id, kind: "apartments", height: floors * 3.2, floors, color: 0xffffff, outline: [{ x: 0, z: 0 }, { x: 0, z: -9 }, { x: 12, z: -9 }, { x: 12, z: 0 }] });
  const frame = (b: Building) => ({ groundFloor: 3.3, upperTop: b.height - 0.9, bay: 3.2, tiled: false, roofY: b.height - 0.35 });
  const noBalconies = { chajjas: true, balconies: false, shopWalls: new Set<number>() };
  const many = Array.from({ length: 200 }, (_, i) => block(1000 + i));

  it("hangs AC units on outside walls of upper floors, facing out", () => {
    const acs = many.flatMap((b) => buildingFixtures(b, noBalconies, frame(b))).filter((f) => f.model === "acUnit");
    expect(acs.length).toBeGreaterThan(20);
    for (const ac of acs) {
      expect(ac.y).toBeGreaterThan(3.3);
      // Facing out: a point 1 m in front is outside the block.
      const fx = ac.x + Math.sin(ac.yaw);
      const fz = ac.z + Math.cos(ac.yaw);
      expect(pointInPolygon(fx, fz, many[0]!.outline)).toBe(false);
      // On a wall: on the outline's edge.
      const onEdge = Math.abs(ac.z) < 0.05 || Math.abs(ac.z + 9) < 0.05 || Math.abs(ac.x) < 0.05 || Math.abs(ac.x - 12) < 0.05;
      expect(onEdge).toBe(true);
    }
  });
  it("puts no AC units on buildings with balconies, on shop walls or against a neighbour", () => {
    const withBalconies = { ...noBalconies, balconies: true };
    expect(many.flatMap((b) => buildingFixtures(b, withBalconies, frame(b))).some((f) => f.model === "acUnit")).toBe(false);
    const shops = { ...noBalconies, shopWalls: new Set([0, 1, 2, 3]) };
    expect(many.flatMap((b) => buildingFixtures(b, shops, frame(b))).some((f) => f.model === "acUnit")).toBe(false);
    expect(many.flatMap((b) => buildingFixtures(b, noBalconies, frame(b), () => false)).some((f) => f.model === "acUnit")).toBe(false);
  });
  it("puts dishes on flat roofs only, inside the outline and clear of the water tank", () => {
    const dishes = many.flatMap((b) => buildingFixtures(b, noBalconies, frame(b))).filter((f) => f.model === "dish");
    expect(dishes.length).toBeGreaterThan(20);
    for (const d of dishes) {
      expect(d.y).toBeCloseTo(many[0]!.height - 0.35);
      expect(pointInPolygon(d.x, d.z, many[0]!.outline)).toBe(true);
      expect(Math.hypot(d.x - 6, d.z + 4.5)).toBeGreaterThan(2);
    }
    expect(many.flatMap((b) => buildingFixtures(b, noBalconies, { ...frame(b), tiled: true })).some((f) => f.model === "dish")).toBe(false);
  });
  it("adds no AC units to a one-floor house", () => {
    const low = many.map((b) => ({ ...b, floors: 1, height: 3.6 }));
    expect(low.flatMap((b) => buildingFixtures(b, noBalconies, frame(b))).some((f) => f.model === "acUnit")).toBe(false);
  });
});
