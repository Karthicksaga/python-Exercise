/**
 * Chennai facade kit: concrete sunshades (chajjas) over windows, balconies with railings, and
 * ground-floor shop fronts with rolling shutters and painted signboards.
 *
 * Everything is decided at render time from the `Building` record and the roads of its chunk,
 * deterministically from the building id, so the world data is untouched and a building looks
 * the same every time it loads. Which buildings get which details, and every size, is invented
 * (estimated from typical Chennai streets), not mapped.
 *
 * Slabs (sunshades, balcony floors) are merged into the chunk's walls mesh; shutters, signs and
 * railings into one "kit" mesh per chunk with the kit atlas (one extra draw call).
 */
import * as THREE from "three";
import { MAIN_ROADS, type Building, type RoadSpan } from "@cow/game-world";
import { hash } from "./hash";
import { KIT_CELLS, kitTextures, kitUV, signRect, type KitRect } from "./kitAtlas";
import type { MeshBuilder } from "./MeshBuilder";
import { NARROW_SIGNS, WIDE_SIGNS } from "./shopSigns";

/** Share of buildings, by kind, whose windows have sunshades and whose balcony bays stick out. */
const CHAJJAS = { house: 0.5, apartments: 0.85, commercial: 0.35 } as const;
const BALCONIES = { house: 0.3, apartments: 0.7, commercial: 0 } as const;
/**
 * Share of buildings with shops on the ground floor. Commercial buildings get them on any road;
 * apartment blocks and houses of two floors or more only on a main road, where in Chennai
 * most ground floors are shops (OSM tags few of them as commercial: T. Nagar has 9 tagged in
 * 1,233 buildings round Sir Thyagaraya Road).
 */
const SHOPS = { house: 0.4, apartments: 0.5, commercial: 1 } as const;
/** How far a shop wall may stand back from the road's edge, metres. */
const SETBACK = 12;
/** A wall must face the road within this angle (cosine) to get shop fronts. */
const FACING = 0.6;
const MIN_SHOP_WALL = 2.5;
/** Shop fronts need this much ground-floor height (shutter plus sign). */
export const SHOP_HEIGHT = 3.2;

const SHUTTER_TOP = 2.45;
const SIGN_BOTTOM = 2.5;
const SIGN_TOP = 3.2;
const SIGN_DEPTH = 0.14;
/** Shutters stand a little proud of the wall so they never fight it for depth. */
const SHUTTER_OFFSET = 0.03;
const CHAJJA_DEPTH = 0.55;
const CHAJJA_THICK = 0.1;
const BALCONY_DEPTH = 0.85;
const BALCONY_THICK = 0.14;
const RAIL_HEIGHT = 0.95;

export interface FacadePlan {
  readonly chajjas: boolean;
  readonly balconies: boolean;
  /** Walls (edge i runs from outline[i] to outline[i + 1]) with shop fronts on the ground floor. */
  readonly shopWalls: ReadonlySet<number>;
}

/** Distance from (x, z) to segment a-b and the closest point on it. */
function closest(x: number, z: number, ax: number, az: number, bx: number, bz: number): [number, number, number] {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return [Math.hypot(cx - x, cz - z), cx, cz];
}

/**
 * Does the wall from p to q face a road close in front of it? `main` limits it to arterial
 * roads. Footways never count.
 */
export function wallFacesRoad(p: Building["outline"][number], q: Building["outline"][number], roads: readonly RoadSpan[], main: boolean): boolean {
  const length = Math.hypot(q.x - p.x, q.z - p.z);
  if (length < 0.05) return false;
  const nx = (q.z - p.z) / length;
  const nz = -(q.x - p.x) / length;
  const mx = (p.x + q.x) / 2;
  const mz = (p.z + q.z) / 2;
  for (const span of roads) {
    const { road } = span;
    if (road.kind === "footway" || (main && !MAIN_ROADS.has(road.kind))) continue;
    const reach = road.width / 2 + SETBACK;
    for (let k = span.start; k < span.end; k++) {
      const a = road.points[k]!;
      const b = road.points[k + 1]!;
      const [d, cx, cz] = closest(mx, mz, a.x, a.z, b.x, b.z);
      if (d < reach && d > 0.01 && ((cx - mx) * nx + (cz - mz) * nz) / d > FACING) return true;
    }
  }
  return false;
}

/** Which details a building gets. Pure and deterministic: the same building always gets the same plan. */
export function planFacade(b: Building, roads: readonly RoadSpan[]): FacadePlan {
  const shopWalls = new Set<number>();
  const groundHeight = b.floors > 1 ? 3.3 : b.height - 0.9;
  const shops = groundHeight >= SHOP_HEIGHT && (b.kind === "commercial" || b.floors >= 2) && hash(b.id, 301) < SHOPS[b.kind];
  if (shops) {
    const n = b.outline.length;
    for (let i = 0; i < n; i++) {
      const p = b.outline[i]!;
      const q = b.outline[(i + 1) % n]!;
      if (Math.hypot(q.x - p.x, q.z - p.z) < MIN_SHOP_WALL) continue;
      if (wallFacesRoad(p, q, roads, b.kind !== "commercial")) shopWalls.add(i);
    }
  }
  return {
    chajjas: hash(b.id, 302) < CHAJJAS[b.kind],
    balconies: b.floors >= 2 && hash(b.id, 303) < BALCONIES[b.kind],
    shopWalls,
  };
}

/** Shutter state of a shop: down, up with the lights on, or up and dim. */
export type ShutterState = "down" | "lit" | "dark";

export function shutterState(b: Building, wall: number, bay: number): ShutterState {
  const t = hash(b.id, 311 + wall * 211 + bay * 17);
  return t < 0.4 ? "down" : t < 0.78 ? "lit" : "dark";
}

/** A wall's shops: runs of one or two bays, each under one signboard. */
export interface Shop {
  readonly firstBay: number;
  readonly bays: 1 | 2;
  readonly sign: number;
  readonly state: ShutterState;
}

export function shopsOnWall(b: Building, wall: number, bays: number): Shop[] {
  const shops: Shop[] = [];
  for (let bay = 0; bay < bays; ) {
    const wide = bay + 1 < bays && hash(b.id, 321 + wall * 97 + bay) < 0.4;
    const list = wide ? WIDE_SIGNS : NARROW_SIGNS;
    const sign = list[Math.floor(hash(b.id, 331 + wall * 89 + bay) * list.length)]!;
    shops.push({ firstBay: bay, bays: wide ? 2 : 1, sign, state: shutterState(b, wall, bay) });
    bay += wide ? 2 : 1;
  }
  return shops;
}

/** A wall-aligned frame: start point, unit direction along the wall and outward normal. */
export interface WallFrame {
  readonly x: number;
  readonly z: number;
  readonly ux: number;
  readonly uz: number;
  readonly nx: number;
  readonly nz: number;
}

type Colour = readonly [number, number, number];
const WHITE: Colour = [1, 1, 1];

/**
 * An axis-aligned box in wall space: `s0..s1` along the wall, `y0..y1` up, `d0..d1` out from it.
 * Faces listed in `faces` only (the back against the wall is never drawn).
 */
function box(
  mesh: MeshBuilder,
  f: WallFrame,
  s0: number,
  s1: number,
  y0: number,
  y1: number,
  d0: number,
  d1: number,
  faces: { front?: KitUV; top?: KitUV; bottom?: KitUV; ends?: KitUV },
  colour: Colour,
): void {
  const at = (s: number, d: number): [number, number] => [f.x + f.ux * s + f.nx * d, f.z + f.uz * s + f.nz * d];
  const [r, g, b] = colour;
  type V3 = readonly [number, number, number];
  const quad = (corners: readonly [V3, V3, V3, V3], normal: V3, uv: KitUV) => {
    // Seen from outside, s runs right to left along a wall, so u is reversed to keep sign text
    // reading the right way round.
    const uvs: readonly (readonly [number, number])[] = [[uv.u1, uv.v0], [uv.u0, uv.v0], [uv.u0, uv.v1], [uv.u1, uv.v1]];
    const ids = corners.map(([x, y, z], k) => mesh.vertex(x, y, z, normal[0], normal[1], normal[2], uvs[k]![0], uvs[k]![1], r, g, b));
    // Wind the quad so it faces along its normal.
    const [p, q, s] = corners;
    const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]] as const;
    const e2 = [s[0] - p[0], s[1] - p[1], s[2] - p[2]] as const;
    const facing = (e1[1] * e2[2] - e1[2] * e2[1]) * normal[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * normal[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * normal[2];
    if (facing >= 0) mesh.quad(ids[0]!, ids[1]!, ids[2]!, ids[3]!);
    else mesh.quad(ids[0]!, ids[3]!, ids[2]!, ids[1]!);
  };
  const [ax, az] = at(s0, d1);
  const [bx, bz] = at(s1, d1);
  const [cx, cz] = at(s1, d0);
  const [dx, dz] = at(s0, d0);
  if (faces.front) quad([[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], [f.nx, 0, f.nz], faces.front);
  if (faces.top) quad([[ax, y1, az], [bx, y1, bz], [cx, y1, cz], [dx, y1, dz]], [0, 1, 0], faces.top);
  if (faces.bottom) quad([[dx, y0, dz], [cx, y0, cz], [bx, y0, bz], [ax, y0, az]], [0, -1, 0], faces.bottom);
  if (faces.ends) {
    quad([[dx, y0, dz], [ax, y0, az], [ax, y1, az], [dx, y1, dz]], [-f.ux, 0, -f.uz], faces.ends);
    quad([[bx, y0, bz], [cx, y0, cz], [cx, y1, cz], [bx, y1, bz]], [f.ux, 0, f.uz], faces.ends);
  }
}

export type KitUV = ReturnType<typeof kitUV>;
const uv = (rect: KitRect): KitUV => kitUV(rect);
const SHUTTER_UV = uv(KIT_CELLS.shutter);
const LIT_UV = uv(KIT_CELLS.litInterior);
const DARK_UV = uv(KIT_CELLS.darkInterior);
const RAIL_UV = uv(KIT_CELLS.railing);
const PLAIN_UV = uv(KIT_CELLS.plain);
/** Painted shutter colours (multiplied into the near-white shutter). */
const SHUTTERS: readonly Colour[] = [[0.78, 0.8, 0.82], [0.45, 0.62, 0.5], [0.42, 0.55, 0.72], [0.75, 0.68, 0.5], [0.6, 0.6, 0.62]];

/** Shutters and signboards along one ground-floor wall of `bays` equal bays, into the kit mesh. */
export function addShopFronts(kit: MeshBuilder, b: Building, wall: number, f: WallFrame, length: number, bays: number): void {
  const bayWidth = length / bays;
  const margin = Math.min(0.22, bayWidth * 0.08);
  for (const shop of shopsOnWall(b, wall, bays)) {
    const s0 = shop.firstBay * bayWidth;
    const s1 = s0 + shop.bays * bayWidth;
    for (let k = 0; k < shop.bays; k++) {
      const a = s0 + k * bayWidth + margin;
      const c = s0 + (k + 1) * bayWidth - margin;
      const face = shop.state === "down" ? SHUTTER_UV : shop.state === "lit" ? LIT_UV : DARK_UV;
      const tint = shop.state === "down" ? SHUTTERS[Math.floor(hash(b.id, 341 + wall * 31 + shop.firstBay) * SHUTTERS.length)]! : WHITE;
      box(kit, f, a, c, 0, SHUTTER_TOP, 0, SHUTTER_OFFSET, { front: face }, tint);
    }
    box(kit, f, s0 + 0.05, s1 - 0.05, SIGN_BOTTOM, SIGN_TOP, 0, SIGN_DEPTH, { front: uv(signRect(shop.sign)), top: PLAIN_UV, bottom: PLAIN_UV, ends: PLAIN_UV }, WHITE);
  }
}

/** Texture coordinates of plain plaster in the facade atlas, for slabs merged into the walls. */
export interface Plaster {
  readonly u: number;
  readonly v: number;
}

/** A concrete sunshade over the window of one bay of one storey (`y0` floor, `storey` height). */
export function addChajja(walls: MeshBuilder, f: WallFrame, bayWidth: number, y0: number, storey: number, plaster: Plaster, colour: Colour): void {
  const top = y0 + storey * 0.79;
  const half = bayWidth * 0.31;
  const mid = bayWidth / 2;
  const flat: KitUV = { u0: plaster.u, u1: plaster.u + 0.002, v0: plaster.v, v1: plaster.v + 0.02 };
  // No top face: from the street it is never seen, and it would be a third of the cost.
  box(walls, f, mid - half, mid + half, top - CHAJJA_THICK, top, 0, CHAJJA_DEPTH, { front: flat, bottom: flat }, colour);
}

/** A balcony floor slab (into the walls) and its railing (into the kit) at the foot of one bay of one storey. */
export function addBalcony(walls: MeshBuilder, kit: MeshBuilder, f: WallFrame, bayWidth: number, y0: number, plaster: Plaster, colour: Colour): void {
  const half = bayWidth * 0.36;
  const mid = bayWidth / 2;
  const flat: KitUV = { u0: plaster.u, u1: plaster.u + 0.002, v0: plaster.v, v1: plaster.v + 0.02 };
  const top = y0 + 0.04;
  box(walls, f, mid - half, mid + half, top - BALCONY_THICK, top, 0, BALCONY_DEPTH, { front: flat, top: flat, bottom: flat }, colour);
  // The railing: front and both ends, an open grille (alpha-tested) seen from either side.
  box(kit, f, mid - half, mid + half, top, top + RAIL_HEIGHT, 0, BALCONY_DEPTH - 0.02, { front: RAIL_UV, ends: RAIL_UV }, WHITE);
}

/** The kit's material: shared by every chunk. Its glow follows the night like the walls'. */
export function createKitMaterial(): THREE.MeshStandardMaterial {
  const { map, glow } = kitTextures();
  return new THREE.MeshStandardMaterial({
    map,
    emissiveMap: glow,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    vertexColors: true,
    roughness: 0.8,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
}
