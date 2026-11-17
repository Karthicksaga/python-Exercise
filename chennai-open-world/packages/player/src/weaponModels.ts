/**
 * Low-poly weapons held in a figure's right hand: a pistol, a pump shotgun, a compact SMG and a
 * cricket bat. Each is a few boxes merged into one geometry with vertex colours, so a held weapon
 * is one draw call, and every figure shares the same geometry and the one material.
 *
 * Geometry space: the grip is at the origin, the barrel (or the bat's blade) points along +Z,
 * up is +Y. Sizes are estimates of the real objects, in metres.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type HeldWeapon = "pistol" | "shotgun" | "smg" | "bat";

const METAL = 0x1c1d21;
const DARK = 0x2c2d31;
const WOOD = 0x6b4426;
const WILLOW = 0xd9c08c;
const GRIP_TAPE = 0x8c1f1f;

/** [width, height, depth, x, y, z, colour] of one box. */
type Part = readonly [number, number, number, number, number, number, number];

const PARTS: Readonly<Record<HeldWeapon, readonly Part[]>> = {
  // A compact pistol: slide and grip.
  pistol: [
    [0.034, 0.045, 0.19, 0, 0.045, 0.06, METAL],
    [0.03, 0.1, 0.045, 0, -0.005, 0, DARK],
  ],
  // A pump shotgun: long barrel and tube magazine, wooden fore-end and stock.
  shotgun: [
    [0.03, 0.03, 0.62, 0, 0.055, 0.3, METAL],
    [0.026, 0.024, 0.48, 0, 0.022, 0.26, DARK],
    [0.045, 0.045, 0.16, 0, 0.022, 0.38, WOOD],
    [0.045, 0.07, 0.14, 0, 0.03, 0.02, METAL],
    [0.04, 0.09, 0.3, 0, -0.005, -0.17, WOOD],
  ],
  // A compact SMG: boxy body, short barrel, magazine in the grip.
  smg: [
    [0.045, 0.07, 0.26, 0, 0.05, 0.08, METAL],
    [0.02, 0.02, 0.09, 0, 0.065, 0.25, DARK],
    [0.03, 0.15, 0.04, 0, -0.04, 0.0, DARK],
  ],
  // A cricket bat: taped handle, then the flat willow blade.
  bat: [
    [0.034, 0.034, 0.3, 0, 0, 0.08, GRIP_TAPE],
    [0.1, 0.04, 0.56, 0, 0, 0.5, WILLOW],
  ],
};

let material: THREE.MeshStandardMaterial | null = null;
const geometries = new Map<HeldWeapon, THREE.BufferGeometry>();

/** The one material every held weapon uses (colours are in the vertices). */
export function weaponMaterial(): THREE.MeshStandardMaterial {
  material ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
  return material;
}

/** The shared geometry of a weapon (built on first use). */
export function weaponGeometry(weapon: HeldWeapon): THREE.BufferGeometry {
  let geometry = geometries.get(weapon);
  if (geometry) return geometry;
  const color = new THREE.Color();
  const boxes = PARTS[weapon].map(([w, h, d, x, y, z, hex]) => {
    const box = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    box.translate(x, y, z);
    color.setHex(hex);
    const count = box.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
    box.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    box.deleteAttribute("uv");
    return box;
  });
  geometry = mergeGeometries(boxes) ?? new THREE.BoxGeometry(0.03, 0.1, 0.2);
  for (const box of boxes) box.dispose();
  geometries.set(weapon, geometry);
  return geometry;
}

/** Triangles in a held weapon (for the draw-cost budget). */
export function weaponTriangles(weapon: HeldWeapon): number {
  return weaponGeometry(weapon).getAttribute("position").count / 3;
}
