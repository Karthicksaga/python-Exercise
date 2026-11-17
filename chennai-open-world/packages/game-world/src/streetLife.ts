/**
 * Street life at the doors and shop fronts: kolams at house doorways, tea-stall counters, flower
 * stalls, fruit pushcarts, chair stacks and parked two-wheelers outside shops, and the cable
 * bundles slung between poles and buildings; plus when shops open and how fresh the kolams are.
 *
 * Plain numbers only; the renderer draws them (`StreetProps`, `StreetLife` in game-engine).
 * Everything is worked out at run time from data already in memory (the chunk's buildings, the
 * road centre lines, the street-light poles, the pavement props of `props.ts` and the shop fronts
 * the facade kit chose) and is the same every time a chunk loads. Nothing is stored in the world
 * files. The pavement clutter along main roads (crates, barrels, pots, handcarts) and the wall
 * AC units and roof dishes are placed elsewhere (`props.ts`, `StreetProps.buildingFixtures`).
 *
 * All of it is **invented** (estimated from typical Chennai streets), none of it is mapped:
 * - Kolams: the rice-flour patterns drawn every morning at the threshold of a house. About 40 %
 *   of houses and apartment blocks get one, at the wall facing the nearest road; within 300 m of
 *   a temple (Mylapore round Kapaleeshwarar) most houses do, bigger and half of them in colour.
 * - Shops open in the morning and close at night; when depends on the kind of shop (tea stalls
 *   first, around 5:30; most shops 8:00 to 9:30) and is staggered per shop. One in ten stays
 *   shut all day.
 * - Stalls, chairs, carts and customers' bikes are only out while their shop is open (about a
 *   third of the bikes, the residents', stay all night).
 *
 * Nothing that stands on the ground is placed inside a building, on a drivable road's
 * carriageway (footways are pavements, where stalls stand in real life), or on another prop.
 */
import { closestOnSegment, pointInPolygon, roadSegmentsNear } from "./geometry";
import { POLE, buildingBoxes, inBuilding, type PolePlacement } from "./furniture";
import type { Bounds, Building, ChunkData, Landmark, Point, Road, WorldMap } from "./types";

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

export type LifeKind = "teaStall" | "flowerStall" | "pushcart" | "chairStack" | "twoWheeler";

/**
 * One street-life prop. The model's front (+Z in the model, towards the street for the stalls)
 * is turned by `yaw` about +Y: yaw = atan2(fx, fz) for a front facing (fx, fz).
 */
export interface LifePlacement {
  readonly kind: LifeKind;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  /** 0 to 1: picks the paint colour of bikes and chairs. */
  readonly tint: number;
  /** Only out between these hours; always out when absent. */
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
  readonly props: readonly LifePlacement[];
  readonly kolams: readonly KolamPlacement[];
  readonly cables: readonly CableSpan[];
}

/** Kolam pattern variants: six white ones and two coloured ones. */
export const KOLAM_WHITE = 6;
export const KOLAM_VARIANTS = 8;

/**
 * Ground footprints (metres, from the Blender models in `tools/blender/street_props.py`): half
 * sizes along the model's X and Z, and the footprint centre's offset along Z. Stalls are
 * wall-backed: their back edge is at z = 0 and they stand out towards +Z.
 */
export const LIFE_FOOTPRINT: Readonly<Record<LifeKind, { readonly hx: number; readonly hz: number; readonly cz: number }>> = {
  teaStall: { hx: 1.42, hz: 0.4, cz: 0.4 },
  flowerStall: { hx: 0.72, hz: 0.42, cz: 0.42 },
  pushcart: { hx: 0.55, hz: 1.15, cz: 0 },
  chairStack: { hx: 0.3, hz: 0.36, cz: 0 },
  twoWheeler: { hx: 0.38, hz: 1.0, cz: 0 },
};

/** Temple streets (bigger, coloured kolams, flower sellers) reach this far from a temple. */
const TEMPLE_REACH = 300;
const KOLAM_SHARE = 0.4;
const TEMPLE_KOLAM_SHARE = 0.85;
/** How long a shutter takes to roll up or down, game hours (3 game minutes: 3 s at the default clock). */
export const SHUTTER_ROLL = 0.05;

/** Per-chunk caps, so a dense bazaar cannot blow the triangle budget. */
export const LIFE_CAPS: Readonly<Record<LifeKind, number>> = {
  teaStall: 4,
  flowerStall: 6,
  pushcart: 3,
  chairStack: 4,
  twoWheeler: 12,
};
export const KOLAM_CAP = 60;
export const CABLE_CAP = 50;

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
      return { opens: 5.25 + r * 0.75, closes: 22 + s * 0.75 };
    case "flowers":
      return { opens: 6 + r, closes: 21 + s * 0.75 };
    case "eatery":
      return { opens: 6.5 + r, closes: 22 + s * 0.5 };
    case "pharmacy":
      return { opens: 8 + r * 0.75, closes: 22 + s * 0.5 };
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

/** Footprint corners (and first, its centre) of a ground prop in world space. */
export function lifeCorners(p: Pick<LifePlacement, "kind" | "x" | "z" | "yaw">): Point[] {
  const f = LIFE_FOOTPRINT[p.kind];
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  // After the turn, model X is (cos, -sin) and model Z is (sin, cos).
  const at = (lx: number, lz: number): Point => ({ x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c });
  return [at(0, f.cz), at(-f.hx, f.cz - f.hz), at(f.hx, f.cz - f.hz), at(f.hx, f.cz + f.hz), at(-f.hx, f.cz + f.hz)];
}

/** Whether a point is on a drivable road's carriageway, or within `margin` of its edge. */
export function onCarriageway(roads: readonly Road[], p: Point, margin: number): boolean {
  let found = false;
  roadSegmentsNear(roads, p.x, p.z, 40, (road, i) => {
    if (road.kind === "footway") return false;
    const hit = closestOnSegment(p, road.points[i]!, road.points[i + 1]!);
    if (hit.d2 < (road.width / 2 + margin) ** 2) found = true;
    return found;
  });
  return found;
}

/** Checks shared by everything placed on the ground in one chunk. */
class Ground {
  private readonly boxes: Bounds[];
  private readonly taken: Array<{ x: number; z: number; r: number }> = [];

  constructor(
    private readonly roads: readonly Road[],
    private readonly buildings: readonly Building[],
    obstacles: ReadonlyArray<Point & { readonly r: number }>,
  ) {
    this.boxes = buildingBoxes(buildings);
    for (const o of obstacles) this.taken.push({ x: o.x, z: o.z, r: o.r });
  }

  blocked(p: Point, roadMargin: number): boolean {
    return inBuilding(this.buildings, this.boxes, p, 0) || onCarriageway(this.roads, p, roadMargin);
  }

  /** Whether points are clear of buildings and roads, and a circle round `centre` of what is already placed. */
  free(points: readonly Point[], centre: Point, r: number): boolean {
    for (const t of this.taken) if (Math.hypot(t.x - centre.x, t.z - centre.z) < t.r + r) return false;
    return !points.some((p) => this.blocked(p, 0.25));
  }

  take(centre: Point, r: number): void {
    this.taken.push({ x: centre.x, z: centre.z, r });
  }
}

function nearTemple(landmarks: readonly Landmark[], p: Point): boolean {
  return landmarks.some((l) => l.kind === "temple" && Math.hypot(l.x - p.x, l.z - p.z) < TEMPLE_REACH);
}

class Placed {
  readonly props: LifePlacement[] = [];
  private readonly count = new Map<LifeKind, number>();

  full(kind: LifeKind): boolean {
    return (this.count.get(kind) ?? 0) >= LIFE_CAPS[kind];
  }

  add(p: LifePlacement): void {
    this.count.set(p.kind, (this.count.get(p.kind) ?? 0) + 1);
    this.props.push(p);
  }
}

/** A ground prop at (s along the wall from the shop's start, d out from the wall), if it fits. */
function place(ground: Ground, out: Placed, shop: ShopFront, kind: LifeKind, s: number, d: number, yaw: number, tint: number, hours: ShopHours | undefined): boolean {
  if (out.full(kind)) return false;
  const p: LifePlacement = { kind, x: shop.x + shop.ux * s + shop.nx * d, z: shop.z + shop.uz * s + shop.nz * d, yaw, tint, ...(hours ? { hours } : {}) };
  const f = LIFE_FOOTPRINT[kind];
  const corners = lifeCorners(p);
  const centre = corners[0]!;
  if (!ground.free(corners, centre, Math.min(f.hx, f.hz) * 0.9)) return false;
  ground.take(centre, Math.hypot(f.hx, f.hz) * 0.85);
  out.add(p);
  return true;
}

function shopLife(ground: Ground, out: Placed, shop: ShopFront, temple: boolean): void {
  const hours = shop.hours;
  if (!hours) return;
  const id = shop.buildingId * 131 + shop.wall * 17 + shop.firstBay;
  const r = (salt: number) => hash(id, salt);
  const face = yawFacing(shop.nx, shop.nz);
  const mid = shop.width / 2;
  // Stalls are set out a little after the shutter goes up and taken in before it comes down.
  const out_ = { opens: hours.opens + 0.1, closes: hours.closes - 0.15 };
  let stall = false;
  if (shop.kind === "tea") stall = place(ground, out, shop, "teaStall", mid, 0.03, face, 0, out_);
  else if (shop.kind === "flowers" || (temple && r(411) < 0.3)) stall = place(ground, out, shop, "flowerStall", mid, 0.05, face, 0, out_);
  if (shop.kind === "eatery" && r(431) < 0.5) {
    const s = r(432) < 0.5 ? Math.min(0.5, shop.width * 0.2) : shop.width - Math.min(0.5, shop.width * 0.2);
    place(ground, out, shop, "chairStack", s, 0.45, face + (r(433) - 0.5) * 0.5, r(434), out_);
  }
  // A fruit and vegetable pushcart along the front of a few shops.
  if (!stall && r(441) < 0.08) place(ground, out, shop, "pushcart", mid, 1.6, yawFacing(shop.ux, shop.uz), 0, { opens: 7 + r(442), closes: 20.5 + r(443) });
  // Two-wheelers parked nose-in or nose-out in front of the shop.
  if (r(451) >= 0.45) return;
  const bikes = 1 + Math.floor(r(452) * 2);
  for (let k = 0; k < bikes; k++) {
    const s = mid + (k - (bikes - 1) / 2) * 0.95 + (r(453 + k) - 0.5) * 0.2;
    if (s < 0.3 || s > shop.width - 0.3) continue;
    const nose = r(457 + k) < 0.6 ? 1 : -1;
    const yaw = yawFacing(-shop.nx * nose, -shop.nz * nose) + (r(461 + k) - 0.5) * 0.5;
    // A resident's bike stays all night; customers' come and go with the shop.
    const bikeHours = r(465 + k) < 0.3 ? undefined : { opens: hours.opens + 0.3, closes: hours.closes - 0.3 };
    if (!place(ground, out, shop, "twoWheeler", s, 1.75, yaw, r(469 + k), bikeHours)) place(ground, out, shop, "twoWheeler", s, 1.3, yaw, r(469 + k), bikeHours);
  }
}

/** The wall of a building facing its nearest drivable road (index and that road's distance), or null. */
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
  for (const a of [-1, 1]) for (const c of [-1, 1]) if (ground.blocked({ x: x + ux * a * h + nx * c * h, z: z + uz * a * h + nz * c * h }, 0.1)) return null;
  const variant = coloured ? KOLAM_WHITE + Math.floor(hash(b.id, 505) * (KOLAM_VARIANTS - KOLAM_WHITE)) : Math.floor(hash(b.id, 505) * KOLAM_WHITE);
  return { x, z, yaw: yawFacing(nx, nz), size, variant };
}

/**
 * Cables: two lines from each pole to the next pole of the same road (within 48 m), and on
 * about three poles in four a service drop of one or two lines to the nearest building corner
 * within 22 m (pole tops estimated at the cross-arm, houses fed at 5 to 6.5 m).
 */
export function cablesFor(poles: readonly PolePlacement[], buildings: readonly Building[]): CableSpan[] {
  const out: CableSpan[] = [];
  const top = POLE.height - 0.85;
  const sag = (length: number) => 0.25 + length * 0.025;
  for (let i = 0; i < poles.length && out.length < CABLE_CAP; i++) {
    const a = poles[i]!;
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
    // Each pair once: from the pole further west (or north) to its neighbour.
    if (next && (a.x < next.x || (a.x === next.x && a.z < next.z))) out.push({ ax: a.x, ay: top, az: a.z, bx: next.x, by: top, bz: next.z, sag: sag(gap), count: 2 });
    const id = (Math.round(a.x * 10) * 73856093) ^ (Math.round(a.z * 10) * 19349663);
    if (hash(id, 801) > 0.75 || out.length >= CABLE_CAP) continue;
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
    if (corner) out.push({ ax: a.x, ay: top - 0.4, az: a.z, bx: corner.x, by: Math.min(corner.h - 0.4, 5 + hash(id, 802) * 1.5), bz: corner.z, sag: sag(reach), count: 1 + Math.floor(hash(id, 803) * 2) });
  }
  return out;
}

/**
 * The street life of one chunk. `shops` are the facade kit's shop fronts of this chunk's
 * buildings, `poles` its street-light poles, and `obstacles` what already stands on the ground
 * (the pavement props of `chunkProps`, with a clearance radius each).
 */
export function chunkStreetLife(
  map: StreetLifeMap,
  chunk: ChunkData,
  shops: readonly ShopFront[],
  poles: readonly PolePlacement[],
  obstacles: ReadonlyArray<Point & { readonly r: number }> = [],
): StreetLife {
  const ground = new Ground(map.roads, chunk.buildings, [...poles.map((p) => ({ x: p.x, z: p.z, r: POLE.half + 0.25 })), ...obstacles]);
  const landmarks = map.landmarks ?? [];
  const out = new Placed();
  const shopWalls = new Map<number, Set<number>>();
  for (const shop of shops) {
    const set = shopWalls.get(shop.buildingId) ?? new Set<number>();
    set.add(shop.wall);
    shopWalls.set(shop.buildingId, set);
  }
  for (const shop of shops) shopLife(ground, out, shop, nearTemple(landmarks, shop));
  const kolams: KolamPlacement[] = [];
  for (const b of chunk.buildings) {
    if (kolams.length >= KOLAM_CAP) break;
    const k = kolamFor(ground, b, map.roads, shopWalls.get(b.id) ?? new Set(), nearTemple(landmarks, b.outline[0]!));
    if (k) kolams.push(k);
  }
  return { props: out.props, kolams, cables: cablesFor(poles, chunk.buildings) };
}

/** Whether a point is inside one of the buildings (for tests). */
export function insideAny(buildings: readonly Building[], p: Point): boolean {
  return buildings.some((b) => pointInPolygon(p.x, p.z, b.outline));
}
