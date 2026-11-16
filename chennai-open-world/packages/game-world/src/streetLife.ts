/**
 * Street life: where kolams, shop goods, stalls, parked two-wheelers, AC units, dish antennas
 * and overhead cables go in a chunk, and when shops open and kolams are fresh.
 *
 * Plain numbers only; the renderer draws them (`StreetLife` in game-engine). Everything is
 * worked out at run time from data already in memory (the chunk's buildings, the road centre
 * lines, the street-light poles and the shop fronts the facade kit chose) and is the same every
 * time a chunk loads. Nothing is stored in the world files.
 *
 * All of it is **invented** (estimated from typical Chennai streets), none of it is mapped:
 * - Kolams: the rice-flour patterns drawn every morning at the threshold of a house. About 40 %
 *   of houses and apartment blocks get one, at the wall facing the nearest road; within 300 m of
 *   a temple (Mylapore round Kapaleeshwarar) most houses do, bigger and some in colour.
 * - Shops open in the morning and close at night; when depends on the kind of shop (tea stalls
 *   first, around 5:30; most shops 8:00 to 9:30) and is staggered per shop. One in ten stays
 *   shut all day.
 * - Goods (crates, drums, clay pots), tea-stall counters, flower stalls, chair stacks, fruit
 *   pushcarts and parked two-wheelers stand outside open shops, and are only there while the
 *   shop is open (the parked bikes of the people who live there stay all night).
 * - AC outdoor units on upper walls, dish antennas on flat roofs (turned towards the south-east,
 *   roughly where Indian DTH satellites sit seen from Chennai, at azimuth about 125 degrees; an
 *   estimate, not a survey), and cable bundles slung from pole to pole and pole to building.
 *
 * Nothing that stands on the ground is placed inside a building or on a drivable road's
 * carriageway (footways are pavements, where stalls stand in real life).
 */
import { pointInPolygon, roadSegmentsNear, closestOnSegment } from "./geometry";
import { POLE, type PolePlacement } from "./furniture";
import type { Building, ChunkData, Landmark, Point, Road, WorldMap } from "./types";

export type StreetLifeMap = Pick<WorldMap, "roads" | "landmarks">;

/** Kinds of shop, matching the facade kit's signboards. */
export type ShopKind = "grocery" | "eatery" | "textiles" | "pharmacy" | "tea" | "stores" | "flowers" | "footwear" | "mobile";

/** Opening hours of one shop, game hours (0 to 24). */
export interface ShopHours {
  readonly opens: number;
  readonly closes: number;
}

/** One shop on a ground-floor wall, as the facade kit lays it out. */
export interface ShopFront {
  readonly buildingId: number;
  readonly wall: number;
  readonly firstBay: number;
  /** Point on the wall line where the shop starts, unit direction along the wall, outward normal. */
  readonly x: number;
  readonly z: number;
  readonly ux: number;
  readonly uz: number;
  readonly nx: number;
  readonly nz: number;
  /** Width of the shop front along the wall, metres. */
  readonly width: number;
  readonly kind: ShopKind;
  /** Null for a shop that stays shut all day. */
  readonly hours: ShopHours | null;
}

export type PropKind =
  | "crates"
  | "barrel"
  | "clay_pots"
  | "ac_unit"
  | "dish_antenna"
  | "awning"
  | "tea_stall"
  | "flower_stall"
  | "pushcart"
  | "chair_stack"
  | "two_wheeler";

/**
 * One prop. The model's front (+Z in the model) is turned by `yaw` about +Y: yaw = atan2(fx, fz)
 * for a front facing (fx, fz). `y` lifts it (wall props, roof props).
 */
export interface PropPlacement {
  readonly kind: PropKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  /** Stretch along the model's X (an awning across a shop front); 1 by default. */
  readonly width?: number;
  /** 0 to 1: picks the paint colour of bikes and chairs. */
  readonly tint: number;
  /** Only shown between these hours; always shown when absent. */
  readonly hours?: ShopHours;
}

export interface KolamPlacement {
  readonly x: number;
  readonly z: number;
  /** Turn of the pattern square (same convention as props). */
  readonly yaw: number;
  /** Side of the square, metres. */
  readonly size: number;
  /** 0 to KOLAM_WHITE - 1: white patterns; KOLAM_WHITE and up: coloured festival ones. */
  readonly variant: number;
}

/** A bundle of `count` cables slung from a to b, sagging `sag` metres at the middle. */
export interface CableSpan {
  readonly ax: number;
  readonly ay: number;
  readonly az: number;
  readonly bx: number;
  readonly by: number;
  readonly bz: number;
  readonly sag: number;
  readonly count: number;
}

export interface StreetLife {
  readonly props: readonly PropPlacement[];
  readonly kolams: readonly KolamPlacement[];
  readonly cables: readonly CableSpan[];
}

/** Kolam pattern variants: six white ones and two coloured ones. */
export const KOLAM_WHITE = 6;
export const KOLAM_VARIANTS = 8;

/**
 * Ground footprints of the props (metres, estimated from the Blender models): half-sizes along
 * the model's X and Z and the centre's offset along Z. Wall-backed stalls start at the wall.
 */
export const PROP_FOOTPRINT: Readonly<Partial<Record<PropKind, { readonly hx: number; readonly hz: number; readonly cz: number }>>> = {
  crates: { hx: 0.5, hz: 0.24, cz: 0 },
  barrel: { hx: 0.33, hz: 0.33, cz: 0 },
  clay_pots: { hx: 0.45, hz: 0.45, cz: 0.05 },
  tea_stall: { hx: 1.42, hz: 0.38, cz: 0.38 },
  flower_stall: { hx: 0.72, hz: 0.42, cz: 0.42 },
  pushcart: { hx: 0.55, hz: 1.15, cz: 0 },
  chair_stack: { hx: 0.3, hz: 0.36, cz: 0 },
  two_wheeler: { hx: 0.38, hz: 1.0, cz: 0 },
};

/** Storeys as the chunk renderer draws them (ChunkView): ground floor, parapet, window bays. */
const GROUND_FLOOR = 3.3;
const PARAPET = 0.9;
const BAY = 3.2;
/** Height of the shops' shutters (FacadeKit); the awning hangs just below the signboard. */
const AWNING_DROP = -0.15;

/** Seen from Chennai the DTH satellites are to the south-east: azimuth about 125 degrees (estimated). */
const DISH_AZIMUTH = (125 * Math.PI) / 180;
/** Temple streets (bigger, coloured kolams, flower sellers) reach this far from a temple. */
const TEMPLE_REACH = 300;
const KOLAM_SHARE = 0.4;
const TEMPLE_KOLAM_SHARE = 0.85;
/** How long a shutter takes to roll up or down, game hours (3 game minutes: 3 s at the default clock). */
export const SHUTTER_ROLL = 0.05;

/** Per-chunk caps, so a dense bazaar cannot blow the triangle budget. */
export const STREET_LIFE_CAPS: Readonly<Record<PropKind, number>> = {
  crates: 14,
  barrel: 6,
  clay_pots: 6,
  ac_unit: 40,
  dish_antenna: 24,
  awning: 22,
  tea_stall: 4,
  flower_stall: 6,
  pushcart: 3,
  chair_stack: 4,
  two_wheeler: 24,
};
export const KOLAM_CAP = 60;
export const CABLE_CAP = 60;

/** Stable pseudo-random number in [0, 1). */
function hash(id: number, salt: number): number {
  let t = (id ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
}

/** Yaw that turns a model's front (+Z) to face along (fx, fz). */
export function yawFacing(fx: number, fz: number): number {
  return Math.atan2(fx, fz);
}

/**
 * When a shop opens and closes. Tea stalls open before dawn, flower sellers and eateries early,
 * most other shops between 8:00 and 9:30; nearly all close between 21:30 and 22:30. One in ten
 * stays shut all day (null). Deterministic from the shop's building, wall and first bay.
 */
export function shopHours(buildingId: number, wall: number, bay: number, kind: ShopKind): ShopHours | null {
  const id = buildingId * 131 + wall * 17 + bay;
  if (hash(id, 401) < 0.1) return null;
  const r = hash(id, 402);
  const s = hash(id, 403);
  switch (kind) {
    case "tea":
      return { opens: 5.25 + r * 0.75, closes: 22 + s * 1 };
    case "flowers":
      return { opens: 6 + r, closes: 21 + s * 0.75 };
    case "eatery":
      return { opens: 6.5 + r, closes: 22 + s * 0.5 };
    case "pharmacy":
      return { opens: 8 + r * 0.75, closes: 22 + s * 0.75 };
    default:
      return { opens: 8 + r * 1.5, closes: 21.5 + s };
  }
}

/** How far a shop's shutter is up at `hour`: 0 down, 1 fully up. Rolls over `SHUTTER_ROLL` hours. */
export function shutterOpenness(hours: ShopHours | null, hour: number): number {
  if (!hours) return 0;
  const up = Math.min(1, Math.max(0, (hour - hours.opens) / SHUTTER_ROLL));
  const down = Math.min(1, Math.max(0, (hour - hours.closes) / SHUTTER_ROLL));
  return up * (1 - down);
}

/** Whether a prop with these hours is out at `hour` (always, without hours). */
export function propShown(hours: ShopHours | undefined, hour: number): boolean {
  return !hours || (hour >= hours.opens && hour < hours.closes);
}

/**
 * How fresh the morning's kolams look, 0 (gone) to 1: drawn at dawn (5:00 to 7:00), crisp all
 * morning, scuffed by feet and traffic through the day, faint traces at night.
 */
export function kolamFreshness(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const night = 0.05;
  if (h < 5) return night;
  if (h < 7) {
    const t = (h - 5) / 2;
    return night + (1 - night) * t * t * (3 - 2 * t);
  }
  if (h < 10) return 1;
  if (h < 18) return 1 - 0.5 * ((h - 10) / 8);
  if (h < 21) return 0.5 - 0.3 * ((h - 18) / 3);
  return 0.2 - (0.2 - night) * ((h - 21) / 3);
}

interface Box {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

function boxOf(outline: readonly Point[]): Box {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of outline) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX, maxX, minZ, maxZ };
}

/** Footprint corners (and centre) of a ground prop in world space. */
export function footprintCorners(p: Pick<PropPlacement, "kind" | "x" | "z" | "yaw">): Point[] {
  const f = PROP_FOOTPRINT[p.kind];
  if (!f) return [{ x: p.x, z: p.z }];
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  // Model X is (cos, -sin) and model Z is (sin, cos) after the turn.
  const at = (lx: number, lz: number): Point => ({ x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c });
  return [at(0, f.cz), at(-f.hx, f.cz - f.hz), at(f.hx, f.cz - f.hz), at(f.hx, f.cz + f.hz), at(-f.hx, f.cz + f.hz)];
}

/** Checks shared by everything placed on the ground in one chunk. */
class Ground {
  private readonly boxes: Box[];
  private readonly taken: Array<{ x: number; z: number; r: number }> = [];

  constructor(
    private readonly roads: readonly Road[],
    private readonly buildings: readonly Building[],
    poles: readonly PolePlacement[],
  ) {
    this.boxes = buildings.map((b) => boxOf(b.outline));
    for (const p of poles) this.taken.push({ x: p.x, z: p.z, r: POLE.half + 0.25 });
  }

  inBuilding(p: Point, margin = 0): boolean {
    for (let k = 0; k < this.buildings.length; k++) {
      const b = this.boxes[k]!;
      if (p.x < b.minX - margin || p.x > b.maxX + margin || p.z < b.minZ - margin || p.z > b.maxZ + margin) continue;
      if (pointInPolygon(p.x, p.z, this.buildings[k]!.outline)) return true;
    }
    return false;
  }

  /** On a drivable road's carriageway, or within `margin` of its edge. */
  onRoad(p: Point, margin: number): boolean {
    let found = false;
    roadSegmentsNear(this.roads, p.x, p.z, 40, (road, i) => {
      if (road.kind === "footway") return false;
      const hit = closestOnSegment(p, road.points[i]!, road.points[i + 1]!);
      if (hit.d2 < (road.width / 2 + margin) ** 2) found = true;
      return found;
    });
    return found;
  }

  /** Whether points are all clear of buildings, roads and what is already placed (radius r round `centre`). */
  free(points: readonly Point[], centre: Point, r: number, roadMargin = 0.25): boolean {
    for (const t of this.taken) if (Math.hypot(t.x - centre.x, t.z - centre.z) < t.r + r) return false;
    for (const p of points) if (this.inBuilding(p) || this.onRoad(p, roadMargin)) return false;
    return true;
  }

  take(centre: Point, r: number): void {
    this.taken.push({ x: centre.x, z: centre.z, r });
  }
}

/** Nearest temple landmark within reach, or null. */
function nearTemple(landmarks: readonly Landmark[], p: Point): boolean {
  return landmarks.some((l) => l.kind === "temple" && Math.hypot(l.x - p.x, l.z - p.z) < TEMPLE_REACH);
}

interface Counts {
  props: PropPlacement[];
  count: Map<PropKind, number>;
}

function push(out: Counts, p: PropPlacement): boolean {
  const n = out.count.get(p.kind) ?? 0;
  if (n >= STREET_LIFE_CAPS[p.kind]) return false;
  out.count.set(p.kind, n + 1);
  out.props.push(p);
  return true;
}

/** A ground prop at (s along the wall from the shop's start, d out from the wall), if it fits. */
function groundProp(ground: Ground, out: Counts, shop: ShopFront, kind: PropKind, s: number, d: number, yaw: number, tint: number, hours: ShopHours | undefined): boolean {
  if ((out.count.get(kind) ?? 0) >= STREET_LIFE_CAPS[kind]) return false;
  const x = shop.x + shop.ux * s + shop.nx * d;
  const z = shop.z + shop.uz * s + shop.nz * d;
  const place: PropPlacement = { kind, x, y: 0, z, yaw, tint, ...(hours ? { hours } : {}) };
  const f = PROP_FOOTPRINT[kind]!;
  const corners = footprintCorners(place);
  const centre = corners[0]!;
  const r = Math.min(f.hx, f.hz) * 0.9;
  if (!ground.free(corners, centre, r)) return false;
  ground.take(centre, Math.hypot(f.hx, f.hz) * 0.85);
  return push(out, place);
}

function shopLife(ground: Ground, out: Counts, shop: ShopFront, temple: boolean): void {
  const hours = shop.hours;
  if (!hours) return;
  const id = shop.buildingId * 131 + shop.wall * 17 + shop.firstBay;
  const r = (salt: number) => hash(id, salt);
  const face = yawFacing(shop.nx, shop.nz);
  const mid = shop.width / 2;
  // Goods are carried out a little after the shutter goes up and in before it comes down.
  const goodsHours = { opens: hours.opens + 0.1, closes: hours.closes - 0.15 };
  let stall = false;
  if (shop.kind === "tea") stall = groundProp(ground, out, shop, "tea_stall", mid, 0.03, face, 0, goodsHours);
  else if (shop.kind === "flowers" || (temple && r(411) < 0.3)) stall = groundProp(ground, out, shop, "flower_stall", mid, 0.05, face, 0, goodsHours);

  // An awning over the shop front: fixed, so shown day and night.
  if (!stall && r(412) < 0.35 && (out.count.get("awning") ?? 0) < STREET_LIFE_CAPS.awning) {
    const front = { x: shop.x + shop.ux * mid + shop.nx * 1.0, z: shop.z + shop.uz * mid + shop.nz * 1.0 };
    if (!ground.onRoad(front, 0)) push(out, { kind: "awning", x: shop.x + shop.ux * mid, y: AWNING_DROP, z: shop.z + shop.uz * mid, yaw: face, width: Math.max(0.6, (shop.width - 0.2) / 2.4), tint: 0 });
  }

  // Goods beside the doorway: provisions in crates and drums, clay pots at general stores.
  const side = (k: number) => (k % 2 === 0 ? Math.min(0.6, shop.width * 0.2) : shop.width - Math.min(0.6, shop.width * 0.2));
  let slot = 0;
  const goods = (kind: PropKind, chance: number, salt: number) => {
    if (r(salt) >= chance || slot > 1) return;
    const along = side(slot + (r(salt + 1) < 0.5 ? 0 : 1));
    if (groundProp(ground, out, shop, kind, along, 0.4, face + (r(salt + 2) - 0.5) * 0.4, 0, goodsHours)) slot++;
  };
  if (shop.kind === "grocery") {
    goods("crates", 0.75, 421);
    goods("barrel", 0.4, 424);
    goods("clay_pots", 0.15, 427);
  } else if (shop.kind === "stores") {
    goods("crates", 0.4, 421);
    goods("clay_pots", 0.3, 427);
  } else if (shop.kind === "eatery" && r(431) < 0.5) {
    groundProp(ground, out, shop, "chair_stack", side(r(432) < 0.5 ? 0 : 1), 0.45, face + (r(433) - 0.5) * 0.5, r(434), goodsHours);
  }

  // A fruit and vegetable pushcart along the kerb in front of a few shops.
  if (!stall && r(441) < 0.08) {
    const cartHours = { opens: 7 + r(442), closes: 20.5 + r(443) };
    groundProp(ground, out, shop, "pushcart", mid, 1.7, yawFacing(shop.ux, shop.uz), 0, cartHours);
  }

  // Customers' two-wheelers parked nose-in or nose-out in front of the shop.
  if (r(451) < 0.6) {
    const bikes = 1 + Math.floor(r(452) * 3);
    for (let k = 0; k < bikes; k++) {
      const s = mid + (k - (bikes - 1) / 2) * 0.95 + (r(453 + k) - 0.5) * 0.2;
      if (s < 0.3 || s > shop.width - 0.3) continue;
      const nose = r(457 + k) < 0.6 ? 1 : -1;
      const yaw = yawFacing(-shop.nx * nose, -shop.nz * nose) + (r(461 + k) - 0.5) * 0.5;
      // The owner's bike stays all night; customers' come and go with the shop.
      const bikeHours = r(465 + k) < 0.3 ? undefined : { opens: hours.opens + 0.3, closes: hours.closes - 0.3 };
      if (!groundProp(ground, out, shop, "two_wheeler", s, 1.75, yaw, r(469 + k), bikeHours)) groundProp(ground, out, shop, "two_wheeler", s, 1.25, yaw, r(469 + k), bikeHours);
    }
  }
}

/** The wall of a building that faces its nearest drivable road (index and that road's distance), or null. */
export function frontWall(roads: readonly Road[], b: Building, reach = 25): { wall: number; distance: number } | null {
  const n = b.outline.length;
  let best: { wall: number; distance: number } | null = null;
  for (let i = 0; i < n; i++) {
    const p = b.outline[i]!;
    const q = b.outline[(i + 1) % n]!;
    const length = Math.hypot(q.x - p.x, q.z - p.z);
    if (length < 2) continue;
    const nx = (q.z - p.z) / length;
    const nz = -(q.x - p.x) / length;
    const m = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
    roadSegmentsNear(roads, m.x, m.z, reach, (road, k) => {
      if (road.kind === "footway") return false;
      const hit = closestOnSegment(m, road.points[k]!, road.points[k + 1]!);
      const d = Math.sqrt(hit.d2);
      if (d < 0.01 || d > reach) return false;
      if (((hit.x - m.x) * nx + (hit.z - m.z) * nz) / d < 0.7) return false;
      if (!best || d < best.distance) best = { wall: i, distance: d };
      return false;
    });
  }
  return best;
}

function kolamFor(ground: Ground, b: Building, roads: readonly Road[], shopWalls: ReadonlySet<number>, temple: boolean): KolamPlacement | null {
  if (b.kind === "commercial") return null;
  if (hash(b.id, 501) >= (temple ? TEMPLE_KOLAM_SHARE : KOLAM_SHARE)) return null;
  const front = frontWall(roads, b);
  if (!front || shopWalls.has(front.wall)) return null;
  const p = b.outline[front.wall]!;
  const q = b.outline[(front.wall + 1) % b.outline.length]!;
  const length = Math.hypot(q.x - p.x, q.z - p.z);
  const ux = (q.x - p.x) / length;
  const uz = (q.z - p.z) / length;
  const nx = uz;
  const nz = -ux;
  const coloured = temple && hash(b.id, 502) < 0.5;
  const size = temple ? 1.6 + hash(b.id, 503) * 0.8 : (b.kind === "apartments" ? 1.2 : 0.9) + hash(b.id, 503) * 0.5;
  if (length < size) return null;
  // The doorway: somewhere along the middle of the wall.
  const s = Math.max(size / 2, Math.min(length - size / 2, length * (0.3 + 0.4 * hash(b.id, 504))));
  const d = 0.3 + size / 2;
  const x = p.x + ux * s + nx * d;
  const z = p.z + uz * s + nz * d;
  const h = size / 2;
  const corners = [-1, 1].flatMap((a) => [-1, 1].map((c) => ({ x: x + ux * a * h + nx * c * h, z: z + uz * a * h + nz * c * h })));
  for (const c of corners) if (ground.inBuilding(c) || ground.onRoad(c, 0.1)) return null;
  const variant = coloured ? KOLAM_WHITE + Math.floor(hash(b.id, 505) * (KOLAM_VARIANTS - KOLAM_WHITE)) : Math.floor(hash(b.id, 505) * KOLAM_WHITE);
  return { x, z, yaw: yawFacing(nx, nz), size, variant };
}

/** Upper-floor walls get AC outdoor units at window-bay boundaries. */
function acUnits(out: Counts, b: Building): void {
  if (b.floors < 2) return;
  const share = b.kind === "house" ? 0.3 : 0.5;
  if (hash(b.id, 601) >= share) return;
  const n = b.outline.length;
  const upper = b.floors - 1;
  const storey = (b.height - PARAPET - GROUND_FLOOR) / upper;
  if (storey < 2.4) return;
  const units = 1 + Math.floor(hash(b.id, 602) * Math.min(4, upper + 1));
  for (let k = 0; k < units; k++) {
    const i = Math.floor(hash(b.id, 603 + k) * n);
    const p = b.outline[i]!;
    const q = b.outline[(i + 1) % n]!;
    const length = Math.hypot(q.x - p.x, q.z - p.z);
    if (length < 3) continue;
    const bays = Math.max(1, Math.round(length / BAY));
    const boundary = bays >= 2 ? 1 + Math.floor(hash(b.id, 611 + k) * (bays - 1)) : 0;
    const s = bays >= 2 ? (boundary * length) / bays : length * 0.2;
    const floor = Math.floor(hash(b.id, 619 + k) * upper);
    const ux = (q.x - p.x) / length;
    const uz = (q.z - p.z) / length;
    push(out, {
      kind: "ac_unit",
      x: p.x + ux * s + uz * 0.01,
      y: GROUND_FLOOR + floor * storey + 0.35,
      z: p.z + uz * s - ux * 0.01,
      yaw: yawFacing(uz, -ux),
      tint: 0,
    });
  }
}

/** Dish antennas on flat roofs, near the parapet, all looking south-east. */
function dishes(out: Counts, b: Building): void {
  const share = b.kind === "apartments" ? 0.6 : b.kind === "house" ? 0.4 : 0.2;
  if (hash(b.id, 701) >= share) return;
  const n = b.outline.length;
  let cx = 0;
  let cz = 0;
  for (const p of b.outline) {
    cx += p.x;
    cz += p.z;
  }
  cx /= n;
  cz /= n;
  const count = b.kind === "apartments" ? 1 + Math.floor(hash(b.id, 702) * 3) : 1;
  const az = Math.atan2(Math.sin(DISH_AZIMUTH), -Math.cos(DISH_AZIMUTH));
  for (let k = 0; k < count; k++) {
    const corner = b.outline[Math.floor(hash(b.id, 703 + k) * n)]!;
    const dx = cx - corner.x;
    const dz = cz - corner.z;
    const d = Math.hypot(dx, dz);
    if (d < 2) continue;
    const x = corner.x + (dx / d) * 1.1;
    const z = corner.z + (dz / d) * 1.1;
    if (!pointInPolygon(x, z, b.outline)) continue;
    // East is +X, north is -Z: azimuth a faces (sin a, -(cos a)) on the ground... as yaw: atan2(sin a, -cos a).
    push(out, { kind: "dish_antenna", x, y: b.height - 0.35, z, yaw: az + (hash(b.id, 707 + k) - 0.5) * 0.3, tint: 0 });
  }
}

/** Cables from each pole to the next pole of the same road, and to the nearest building corner. */
function cablesFor(poles: readonly PolePlacement[], buildings: readonly Building[]): CableSpan[] {
  const out: CableSpan[] = [];
  const top = POLE.height - 0.85;
  const sag = (length: number) => 0.25 + length * 0.025;
  for (let i = 0; i < poles.length && out.length < CABLE_CAP; i++) {
    const a = poles[i]!;
    // The next pole of the same road: nearest one within 48 m, each pair once.
    let next: PolePlacement | null = null;
    let gap = 48;
    for (let j = 0; j < poles.length; j++) {
      const b = poles[j]!;
      if (j === i || b.roadId !== a.roadId) continue;
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d < gap) {
        gap = d;
        next = b;
      }
    }
    if (next && (a.x < next.x || (a.x === next.x && a.z < next.z))) {
      out.push({ ax: a.x, ay: top, az: a.z, bx: next.x, by: top, bz: next.z, sag: sag(gap), count: 3 });
    }
    // A service line to the nearest building corner within 22 m (most poles feed a house).
    const id = Math.round(a.x * 10) * 73856093 ^ Math.round(a.z * 10) * 19349663;
    if (hash(id, 801) > 0.75) continue;
    let corner: { x: number; z: number; h: number } | null = null;
    let reach = 22;
    for (const b of buildings) {
      for (const p of b.outline) {
        const d = Math.hypot(p.x - a.x, p.z - a.z);
        if (d < reach && d > 3) {
          reach = d;
          corner = { x: p.x, z: p.z, h: b.height };
        }
      }
    }
    if (corner && out.length < CABLE_CAP) {
      const by = Math.min(corner.h - 0.4, 5 + hash(id, 802) * 1.5);
      out.push({ ax: a.x, ay: top - 0.4, az: a.z, bx: corner.x, by, bz: corner.z, sag: sag(reach), count: 1 + Math.floor(hash(id, 803) * 2) });
    }
  }
  return out;
}

/**
 * The street life of one chunk. `shops` are the facade kit's shop fronts of this chunk's
 * buildings, `poles` its street-light poles, `flatRoof` says which buildings have a flat terrace
 * (the renderer gives some houses tiled roofs).
 */
export function chunkStreetLife(map: StreetLifeMap, chunk: ChunkData, shops: readonly ShopFront[], poles: readonly PolePlacement[], flatRoof: (b: Building) => boolean): StreetLife {
  const ground = new Ground(map.roads, chunk.buildings, poles);
  const landmarks = map.landmarks ?? [];
  const out: Counts = { props: [], count: new Map() };
  const shopWalls = new Map<number, Set<number>>();
  for (const shop of shops) {
    const set = shopWalls.get(shop.buildingId) ?? new Set<number>();
    set.add(shop.wall);
    shopWalls.set(shop.buildingId, set);
  }
  // Stalls and goods first (they need the room by the shops), then kolams at house doors.
  for (const shop of shops) shopLife(ground, out, shop, nearTemple(landmarks, shop));
  const kolams: KolamPlacement[] = [];
  for (const b of chunk.buildings) {
    if (kolams.length >= KOLAM_CAP) break;
    const k = kolamFor(ground, b, map.roads, shopWalls.get(b.id) ?? new Set(), nearTemple(landmarks, b.outline[0]!));
    if (k) kolams.push(k);
  }
  for (const b of chunk.buildings) {
    acUnits(out, b);
    if (flatRoof(b)) dishes(out, b);
  }
  return { props: out.props, kolams, cables: cablesFor(poles, chunk.buildings) };
}
