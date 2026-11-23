/**
 * The goods handed over on jobs and stages (`@cow/missions` `goods.ts`), and the ambulance's
 * stretcher trolley, built in code: a taped cardboard parcel with a blank address label, an
 * insulated delivery bag in an invented teal with a reflective band, a three-tier steel tiffin
 * carrier, a white medicine box with a green cross, a tied cloth sack of cash, and a harmonium
 * in a wooden case. All original and unbranded. Sizes are estimates of the real things.
 *
 * Each model is one or two meshes (a vertex-coloured matte part and a metal part) of a few
 * dozen to a couple of hundred triangles; geometry and the two materials are made once and
 * shared by every copy. Origins are at the bottom centre; +Z is the front, -Z the back.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { GoodsKind } from "@cow/missions";
import type { CarryKind } from "@cow/player";

interface Part {
  readonly geometry: THREE.BufferGeometry;
  readonly color: number;
  readonly metal?: boolean;
}

/** Height of each item, metres, for stacking them on a seat or in someone's arms. */
export const GOODS_HEIGHT: Readonly<Record<GoodsKind, number>> = {
  parcel: 0.28,
  "food-bag": 0.36,
  tiffin: 0.3,
  medicine: 0.18,
  "cash-bag": 0.34,
  harmonium: 0.27,
};

/** How each item is held: boxes in both hands, things with a handle in one. */
export const GOODS_CARRY: Readonly<Record<GoodsKind, CarryKind>> = {
  parcel: "box",
  "food-bag": "bag",
  tiffin: "bag",
  medicine: "box",
  "cash-bag": "bag",
  harmonium: "box",
};

/** A box `w` wide, `h` high and `d` deep, its bottom centre at (x, y, z). */
function block(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
}

function cylinder(r: number, h: number, segments: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r, r, h, segments, 1).translate(x, y + h / 2, z);
}

function parts(kind: GoodsKind | "stretcher"): Part[] {
  switch (kind) {
    case "parcel": {
      const card = 0xb98a58;
      const tape = 0xcdb184;
      return [
        { geometry: block(0.42, 0.28, 0.32), color: card },
        // Tape along the top and down both ends, and a blank white label.
        { geometry: block(0.43, 0.006, 0.06, 0, 0.28), color: tape },
        { geometry: block(0.006, 0.26, 0.06, 0.212, 0.01), color: tape },
        { geometry: block(0.006, 0.26, 0.06, -0.212, 0.01), color: tape },
        { geometry: block(0.13, 0.004, 0.09, -0.1, 0.281, 0.09), color: 0xf2f0ea },
        { geometry: block(0.08, 0.002, 0.012, -0.11, 0.285, 0.1), color: 0x3a3a3a },
        { geometry: block(0.06, 0.002, 0.012, -0.12, 0.285, 0.075), color: 0x3a3a3a },
      ];
    }
    case "food-bag": {
      const teal = 0x2c8a7c;
      return [
        { geometry: block(0.4, 0.34, 0.36), color: teal },
        // The lid, a darker zip seam round it, a reflective band and two carry straps over the top.
        { geometry: block(0.41, 0.03, 0.37, 0, 0.3), color: 0x1f5f56 },
        { geometry: block(0.405, 0.035, 0.365, 0, 0.12), color: 0xc9ccc8 },
        { geometry: block(0.03, 0.12, 0.02, -0.08, 0.34, 0), color: 0x1b1d1f },
        { geometry: block(0.03, 0.12, 0.02, 0.08, 0.34, 0), color: 0x1b1d1f },
        { geometry: block(0.19, 0.025, 0.02, 0, 0.44, 0), color: 0x1b1d1f },
      ];
    }
    case "tiffin": {
      const steel = 0xc9ced2;
      const tiers = [0, 1, 2].map((i) => ({ geometry: cylinder(0.075, 0.07, 14, 0, i * 0.075), color: steel, metal: true }));
      return [
        ...tiers,
        { geometry: cylinder(0.065, 0.02, 14, 0, 0.225), color: steel, metal: true },
        // Two side clamps and the carry handle across the top.
        { geometry: block(0.012, 0.27, 0.02, 0.082, 0.01), color: 0x9aa0a5, metal: true },
        { geometry: block(0.012, 0.27, 0.02, -0.082, 0.01), color: 0x9aa0a5, metal: true },
        { geometry: block(0.176, 0.014, 0.022, 0, 0.27), color: 0x9aa0a5, metal: true },
      ];
    }
    case "medicine": {
      const green = 0x2f9a4c;
      return [
        { geometry: block(0.3, 0.18, 0.22), color: 0xf1f2ef },
        { geometry: block(0.1, 0.03, 0.004, 0, 0.075, 0.111), color: green },
        { geometry: block(0.03, 0.1, 0.004, 0, 0.04, 0.111), color: green },
        { geometry: block(0.1, 0.004, 0.03, 0, 0.18, 0), color: green },
        { geometry: block(0.03, 0.004, 0.1, 0, 0.18, 0), color: green },
      ];
    }
    case "cash-bag": {
      const cloth = 0xa48d60;
      const sack = new THREE.SphereGeometry(0.15, 10, 8).scale(1, 0.95, 0.85).translate(0, 0.145, 0);
      return [
        { geometry: sack, color: cloth },
        // The gathered neck, tied with cord.
        { geometry: new THREE.CylinderGeometry(0.035, 0.07, 0.07, 8).translate(0, 0.3, 0), color: 0x96805a },
        { geometry: cylinder(0.04, 0.02, 8, 0, 0.285), color: 0x5b4127 },
      ];
    }
    case "harmonium": {
      const wood = 0x6e3f22;
      return [
        { geometry: block(0.58, 0.2, 0.32), color: wood },
        // White and black keys at the front of the top, the folded bellows behind, a brass handle.
        { geometry: block(0.48, 0.02, 0.09, 0, 0.2, 0.1), color: 0xf1ede2 },
        ...[-0.19, -0.13, -0.04, 0.02, 0.08, 0.17].map((x) => ({ geometry: block(0.022, 0.012, 0.05, x, 0.22, 0.08), color: 0x141414 })),
        { geometry: block(0.56, 0.05, 0.16, 0, 0.2, -0.07), color: 0x4a1f1c },
        { geometry: block(0.14, 0.02, 0.02, 0, 0.25, -0.07), color: 0xb89a4a, metal: true },
      ];
    }
    case "stretcher": {
      // A wheeled trolley: mattress on a steel frame about 0.75 m up, folding legs, four castors,
      // side rails and a push bar at the head (+Z). About 2 m long.
      const steel = 0xb8bec4;
      const legs = [-0.7, 0.7].flatMap((z) => [-0.22, 0.22].map((x) => ({ geometry: block(0.03, 0.6, 0.03, x, 0.08, z), color: steel, metal: true })));
      const castors = [-0.8, 0.8].flatMap((z) => [-0.24, 0.24].map((x) => ({ geometry: new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8).rotateZ(Math.PI / 2).translate(x, 0.05, z), color: 0x1d1f22 })));
      return [
        ...legs,
        ...castors,
        { geometry: block(0.52, 0.03, 1.75, 0, 0.08), color: steel, metal: true },
        { geometry: block(0.56, 0.04, 1.9, 0, 0.66), color: steel, metal: true },
        { geometry: block(0.54, 0.09, 1.85, 0, 0.7), color: 0x7fa9c4 },
        { geometry: block(0.4, 0.06, 0.3, 0, 0.79, 0.7), color: 0xf2f3f1 },
        { geometry: block(0.02, 0.12, 1.3, 0.28, 0.75), color: steel, metal: true },
        { geometry: block(0.02, 0.12, 1.3, -0.28, 0.75), color: steel, metal: true },
        { geometry: block(0.03, 0.3, 0.03, 0.24, 0.7, 0.98), color: steel, metal: true },
        { geometry: block(0.03, 0.3, 0.03, -0.24, 0.7, 0.98), color: steel, metal: true },
        { geometry: block(0.5, 0.03, 0.03, 0, 0.99, 0.98), color: steel, metal: true },
      ];
    }
  }
}

let matte: THREE.MeshStandardMaterial | null = null;
let metal: THREE.MeshStandardMaterial | null = null;
const geometries = new Map<string, { matte: THREE.BufferGeometry | null; metal: THREE.BufferGeometry | null }>();

function colored(geometry: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute("uv");
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.getAttribute("position").count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

function built(kind: GoodsKind | "stretcher") {
  let entry = geometries.get(kind);
  if (!entry) {
    const all = parts(kind);
    const merge = (list: Part[]) => (list.length ? mergeGeometries(list.map((p) => colored(p.geometry, p.color)), false) : null);
    entry = { matte: merge(all.filter((p) => !p.metal)), metal: merge(all.filter((p) => p.metal)) };
    geometries.set(kind, entry);
  }
  return entry;
}

/** A copy of an item (or the stretcher trolley), sharing geometry and materials with every other copy. */
export function makeGoods(kind: GoodsKind | "stretcher"): THREE.Group {
  matte ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  metal ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.75 });
  const { matte: m, metal: s } = built(kind);
  const group = new THREE.Group();
  group.name = `goods-${kind}`;
  for (const [geometry, material] of [[m, matte], [s, metal]] as const) {
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = kind === "stretcher";
    group.add(mesh);
  }
  return group;
}

/** Triangles of one copy, for the budget test. */
export function goodsTriangles(kind: GoodsKind | "stretcher"): number {
  const { matte: m, metal: s } = built(kind);
  return [m, s].reduce((n, g) => n + (g ? g.getAttribute("position").count / 3 : 0), 0);
}
