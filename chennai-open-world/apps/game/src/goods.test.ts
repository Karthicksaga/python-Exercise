/**
 * Job goods and the stretcher: tiny models within budget, each vehicle's cargo places inside its
 * body, and the carrying poses on the real character model (hands where the goods go).
 */
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import type { GoodsKind } from "@cow/missions";
import { HumanFigure, normalizeBoneNames, PLAYER_HEIGHT } from "@cow/player";
import { VEHICLE_TYPES, type VehicleKind } from "@cow/vehicles";
import { CARGO, carryFor } from "./GoodsFigures";
import { GOODS_HEIGHT, goodsTriangles, makeGoods } from "./goodsModels";

const KINDS: GoodsKind[] = ["parcel", "food-bag", "tiffin", "medicine", "cash-bag", "harmonium"];

describe("goods models", () => {
  it("are a few hundred triangles at most, in one or two meshes sharing two materials", () => {
    const materials = new Set<THREE.Material>();
    for (const kind of [...KINDS, "stretcher"] as const) {
      expect(goodsTriangles(kind), kind).toBeLessThan(kind === "stretcher" ? 500 : 300);
      const model = makeGoods(kind);
      expect(model.children.length, kind).toBeLessThanOrEqual(2);
      for (const mesh of model.children as THREE.Mesh[]) materials.add(mesh.material as THREE.Material);
    }
    expect(materials.size).toBe(2);
    // Copies share geometry.
    expect((makeGoods("parcel").children[0] as THREE.Mesh).geometry).toBe((makeGoods("parcel").children[0] as THREE.Mesh).geometry);
  });

  it("stand on their origin and are as tall as the stacking table says", () => {
    for (const kind of KINDS) {
      const box = new THREE.Box3().setFromObject(makeGoods(kind));
      expect(box.min.y, kind).toBeCloseTo(0, 1);
      // Handles and straps may rise a little above the body.
      expect(box.max.y, kind).toBeGreaterThan(GOODS_HEIGHT[kind] - 0.02);
      expect(box.max.y, kind).toBeLessThan(GOODS_HEIGHT[kind] + 0.13);
    }
    // The stretcher: mattress about 0.8 m up, about 2 m long.
    const trolley = new THREE.Box3().setFromObject(makeGoods("stretcher"));
    expect(trolley.max.z - trolley.min.z).toBeGreaterThan(1.8);
    expect(trolley.max.z - trolley.min.z).toBeLessThan(2.2);
  });

  it("are held with both hands (boxes, or several things) or one (a bag, a tiffin carrier)", () => {
    expect(carryFor(["parcel"])).toBe("box");
    expect(carryFor(["tiffin"])).toBe("bag");
    expect(carryFor(["cash-bag"])).toBe("bag");
    expect(carryFor(["tiffin", "tiffin"])).toBe("box");
  });

  it("ride inside each vehicle's body, and the person handing them over stands outside it", () => {
    for (const kind of Object.keys(CARGO) as VehicleKind[]) {
      const half = VEHICLE_TYPES[kind].physics.halfExtents;
      const place = CARGO[kind];
      for (const slot of place.slots) {
        expect(Math.abs(slot.x), kind).toBeLessThan(half.x);
        expect(Math.abs(slot.z), kind).toBeLessThan(half.z + 0.25);
        // Not under the road: the floor or seat is above the wheels' bottom.
        expect(slot.y, kind).toBeGreaterThan(-VEHICLE_TYPES[kind].rideHeight);
      }
      expect(Math.abs(place.stand.x) > half.x || Math.abs(place.stand.z) > half.z, kind).toBe(true);
      if (place.leaf !== undefined) expect(VEHICLE_TYPES[kind].passengers?.some((d) => d.leaf === place.leaf), kind).toBe(true);
    }
  });
});

/** The optimised player character, without its textures (as `ridingPose.test.ts` loads it). */
async function figure(): Promise<HumanFigure> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const doc = await io.read(fileURLToPath(new URL("../../../assets/optimized/player.glb", import.meta.url)));
  for (const texture of doc.getRoot().listTextures()) texture.dispose();
  for (const extension of doc.getRoot().listExtensionsUsed()) extension.dispose();
  const glb = await io.writeBinary(doc);
  const buffer = new ArrayBuffer(glb.byteLength);
  new Uint8Array(buffer).set(glb);
  const model = (await new GLTFLoader().parseAsync(buffer, "")).scene;
  normalizeBoneNames(model);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const scale = PLAYER_HEIGHT / (box.max.y - box.min.y);
  const clips = ["idle", "walk", "run"].map((name) => new THREE.AnimationClip(name, 1, []));
  return new HumanFigure(model, clips, scale, -box.min.y * scale);
}

describe("carrying poses on the character", () => {
  const hand = (f: HumanFigure, side: "Left" | "Right") => {
    f.object.updateMatrixWorld(true);
    return f.object.getObjectByName(`${side}Hand`)!.getWorldPosition(new THREE.Vector3());
  };

  it("box: both hands in front of the waist, about a box's width apart; push: further forwards; bag: right hand low at the side", async () => {
    const f = await figure();
    // The figure faces -Z (heading 0).
    f.setCarry("box");
    f.update(0.016, 0, true);
    const [l, r] = [hand(f, "Left"), hand(f, "Right")];
    for (const h of [l, r]) {
      expect(h.z, "in front").toBeLessThan(-0.2);
      expect(h.y, "about waist height").toBeGreaterThan(0.8);
      expect(h.y).toBeLessThan(1.25);
    }
    expect(l.distanceTo(r)).toBeGreaterThan(0.15);
    expect(l.distanceTo(r)).toBeLessThan(0.55);
    f.setCarry("push");
    f.update(0.016, 0, true);
    expect(hand(f, "Right").z).toBeLessThan(-0.35);
    f.setCarry("bag");
    f.update(0.016, 0, true);
    const bag = hand(f, "Right");
    expect(bag.y).toBeLessThan(0.95);
    expect(bag.y).toBeGreaterThan(0.5);
    expect(f.carry).toBe("bag");
    f.setCarry(null);
    expect(f.carry).toBeNull();
  });
});
