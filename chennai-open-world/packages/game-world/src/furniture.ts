/**
 * Street furniture: where bus shelters, street-light poles and kerbs go in a chunk.
 *
 * Plain numbers only; the renderer draws them (`StreetFurniture` in game-engine) and the game
 * makes poles and shelter posts solid (`furnitureSolids`). Everything is worked out at run time
 * from data already in memory (road centre lines, mapped bus stops, the chunk's buildings), and
 * is the same every time a chunk loads. Nothing is stored in the world files.
 *
 * What is real and what is invented:
 * - Bus shelters stand at the **mapped** OSM bus stops (`highway=bus_stop`); the shelter itself,
 *   its size and its exact spot at the kerb are invented.
 * - Poles are **invented**: OSM does not map Chennai's street lights. They are spaced about every
 *   38 m along primary, secondary and tertiary roads, from the road's id and the distance along it.
 * - Kerbs are **invented**: a low edge along both sides of the main roads' carriageway.
 *
 * Sides: India drives on the left, so "left" below is the left of a road's drawn direction,
 * (dz, -dx) for a unit direction (dx, dz); a stop mapped beside the road keeps its mapped side.
 */
import { chunkKeyAt } from "./roadChunks";
import { closestOnSegment, nearestRoadPoint, pointInPolygon, roadSegmentsNear } from "./geometry";
import type { SolidBox } from "./solids";
import { MAIN_ROADS, type Bounds, type Building, type ChunkData, type NamedPoint, type Point, type Road, type WorldMap } from "./types";

export type FurnitureMap = Pick<WorldMap, "roads" | "busStops" | "bounds" | "chunkSize">;

/** Yaw follows the game's convention: 0 faces -Z (north), positive turns left. Each faces the road. */
export interface ShelterPlacement {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  /** The road whose kerb it stands at. */
  readonly roadId: number;
  /** Name of the mapped stop, when OSM has one. */
  readonly name?: string;
}

export interface PolePlacement {
  readonly x: number;
  readonly z: number;
  /** Faces the road: the lamp arm reaches over the carriageway. */
  readonly yaw: number;
  readonly roadId: number;
}

/** One unbroken stretch of kerb along one side of a road. */
export interface KerbRun {
  /** Edge against the carriageway, and the back edge, point for point. */
  readonly inner: readonly Point[];
  readonly outer: readonly Point[];
  /** Distance along the road at each point, metres (for the painted bands). */
  readonly along: readonly number[];
}

export interface ChunkFurniture {
  readonly shelters: readonly ShelterPlacement[];
  readonly poles: readonly PolePlacement[];
  readonly kerbs: readonly KerbRun[];
}

/** Sizes shared with the renderer (metres; estimated, not measured on real shelters or poles). */
export const SHELTER = { width: 4.2, depth: 1.6, height: 2.6, gap: 0.35 } as const;
export const POLE = { height: 9, half: 0.15, setback: 0.75, pitch: 38, arm: 1.9 } as const;
export const KERB = { height: 0.15, width: 0.25 } as const;

/** Nothing this close to a road's end (poles) or to a junction (poles and kerbs), metres. */
export const END_CLEAR = 10;
/** Stops further than this from any drivable road get no shelter. */
const STOP_REACH = 30;
/** Poles keep this far from a shelter's centre. */
const SHELTER_CLEAR = 4.5;

/** Stable pseudo-random number in [0, 1). */
function hash(id: number, salt: number): number {
  let t = (id ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
}

/** Exact key for a mapped node (roads share the same quantised coordinates where they meet). */
function nodeKey(p: Point): number {
  return (Math.round(p.x * 20) + 1_048_576) * 2_097_152 + (Math.round(p.z * 20) + 1_048_576);
}

interface Node {
  /** Road ends and interior passes that meet here (an interior point counts twice). */
  degree: number;
  /** Widest drivable road through it. */
  width: number;
}

/**
 * Junctions on the main roads: for every point of a main road, how many drivable road arms meet
 * there. 2 is a plain bend or one way continuing into the next; 3 or more is a junction.
 */
export function mainRoadNodes(roads: readonly Road[]): Map<number, Node> {
  const nodes = new Map<number, Node>();
  for (const road of roads) {
    if (!MAIN_ROADS.has(road.kind)) continue;
    for (const p of road.points) nodes.set(nodeKey(p), { degree: 0, width: 0 });
  }
  for (const road of roads) {
    if (road.kind === "footway") continue;
    const pts = road.points;
    pts.forEach((p, i) => {
      const node = nodes.get(nodeKey(p));
      if (!node) return;
      node.degree += i === 0 || i === pts.length - 1 ? 1 : 2;
      node.width = Math.max(node.width, road.width);
    });
  }
  return nodes;
}

/** Distance along a road to each of its points. */
export function cumulative(points: readonly Point[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
  return out;
}

/**
 * Stretches of a road kept clear of furniture, as [from, to] distances along it: round every
 * junction (wide enough for the widest road there), and, when `ends` is set, both ends.
 */
export function blockedStretches(road: Road, along: readonly number[], nodes: ReadonlyMap<number, Node>, ends: boolean): Array<[number, number]> {
  const total = along[along.length - 1] ?? 0;
  const out: Array<[number, number]> = [];
  if (ends) out.push([-1, END_CLEAR], [total - END_CLEAR, total + 1]);
  road.points.forEach((p, i) => {
    const node = nodes.get(nodeKey(p));
    if (!node || node.degree < 3) return;
    const clear = Math.max(END_CLEAR, node.width / 2 + 3);
    out.push([along[i]! - clear, along[i]! + clear]);
  });
  return out;
}

function blocked(d: number, stretches: ReadonlyArray<readonly [number, number]>): boolean {
  return stretches.some(([a, b]) => d >= a && d <= b);
}

/** Point, unit direction and segment index at distance `d` along a road. */
function at(points: readonly Point[], along: readonly number[], d: number): { x: number; z: number; dx: number; dz: number; i: number } {
  let i = 0;
  while (i < points.length - 2 && along[i + 1]! < d) i++;
  const a = points[i]!;
  const b = points[i + 1]!;
  const length = along[i + 1]! - along[i]! || 1;
  const t = Math.max(0, Math.min(1, (d - along[i]!) / length));
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: (b.x - a.x) / length, dz: (b.z - a.z) / length, i };
}

/** Yaw that faces along (vx, vz). */
function facing(vx: number, vz: number): number {
  return Math.atan2(-vx, -vz);
}

/**
 * A shelter for a mapped stop: at the kerb of the nearest drivable road, on the side the stop is
 * mapped on (the left of the road's direction when it is mapped on the centre line), facing the
 * road. Null when no drivable road is within reach.
 */
export function placeShelter(map: Pick<WorldMap, "roads">, stop: NamedPoint): ShelterPlacement | null {
  const hit = nearestRoadPoint(map, stop);
  if (!hit || hit.distance > STOP_REACH) return null;
  // Road direction (dx, dz) and its left (dz, -dx).
  const dx = -Math.sin(hit.heading);
  const dz = -Math.cos(hit.heading);
  const lx = dz;
  const lz = -dx;
  const mapped = (stop.x - hit.x) * lx + (stop.z - hit.z) * lz;
  const side = hit.distance >= 1 && mapped < 0 ? -1 : 1;
  const offset = hit.road.width / 2 + SHELTER.gap + SHELTER.depth / 2;
  return {
    x: hit.x + lx * side * offset,
    z: hit.z + lz * side * offset,
    yaw: facing(-lx * side, -lz * side),
    roadId: hit.road.id,
    ...(stop.name ? { name: stop.name } : {}),
  };
}

/** Whether a point is on the carriageway of a drivable road other than `except`. */
function onOtherRoad(roads: readonly Road[], p: Point, except: number, margin: number): boolean {
  let found = false;
  roadSegmentsNear(roads, p.x, p.z, 30, (road, i) => {
    if (road.id === except || road.kind === "footway") return false;
    const hit = closestOnSegment(p, road.points[i]!, road.points[i + 1]!);
    if (hit.d2 < (road.width / 2 + margin) ** 2) found = true;
    return found;
  });
  return found;
}

/** Whether a point is inside any of the buildings (bounding box first, so this stays cheap). */
function inBuilding(buildings: readonly Building[], boxes: readonly Bounds[], p: Point, margin: number): boolean {
  for (let k = 0; k < buildings.length; k++) {
    const b = boxes[k]!;
    if (p.x < b.minX - margin || p.x > b.maxX + margin || p.z < b.minZ - margin || p.z > b.maxZ + margin) continue;
    if (pointInPolygon(p.x, p.z, buildings[k]!.outline)) return true;
  }
  return false;
}

/**
 * Poles along one stretch of a main road (points `start`..`end`): every `POLE.pitch` metres from
 * a phase chosen by the road's id, so a road's poles line up across chunks. One-way roads (often
 * one half of a dual carriageway) keep to their left, outer edge; two-way primary roads alternate
 * sides; smaller ones keep to one side, chosen by id. `skip` rejects a spot.
 */
export function polesAlong(road: Road, along: readonly number[], start: number, end: number, stretches: ReadonlyArray<readonly [number, number]>, skip: (p: Point) => boolean): PolePlacement[] {
  const out: PolePlacement[] = [];
  const from = along[start]!;
  const to = along[end]!;
  const phase = hash(road.id, 7) * POLE.pitch;
  const oneSide = hash(road.id, 8) < 0.5 ? 1 : -1;
  const offset = road.width / 2 + POLE.setback;
  for (let k = Math.max(0, Math.ceil((from - phase) / POLE.pitch)); phase + k * POLE.pitch < to; k++) {
    const d = phase + k * POLE.pitch;
    if (d < from || blocked(d, stretches)) continue;
    const p = at(road.points, along, d);
    const side = road.oneway ? 1 : road.kind === "primary" ? (k % 2 === 0 ? 1 : -1) : oneSide;
    const lx = p.dz * side;
    const lz = -p.dx * side;
    const pole = { x: p.x + lx * offset, z: p.z + lz * offset, yaw: facing(-lx, -lz), roadId: road.id };
    if (!skip(pole)) out.push(pole);
  }
  return out;
}

/**
 * Kerbs along both sides of one stretch of a main road, broken round junctions. Points are
 * mitred at bends so the kerb follows the carriageway edge.
 */
export function kerbsAlong(road: Road, along: readonly number[], start: number, end: number, stretches: ReadonlyArray<readonly [number, number]>): KerbRun[] {
  const pts = road.points;
  const half = road.width / 2;
  const total = along[along.length - 1]!;
  // Open stretches inside [from, to]: cut out the blocked ones.
  let open: Array<[number, number]> = [[along[start]!, along[end]!]];
  for (const [a, b] of stretches) {
    open = open.flatMap(([s, e]): Array<[number, number]> => {
      if (b <= s || a >= e) return [[s, e]];
      const parts: Array<[number, number]> = [];
      if (a > s) parts.push([s, a]);
      if (b < e) parts.push([b, e]);
      return parts;
    });
  }
  /** Left normal at point i: the mitre of its two segments (clamped at sharp bends). */
  const normal = (i: number): { x: number; z: number } => {
    const seg = (j: number) => {
      const a = pts[j]!;
      const b = pts[j + 1]!;
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return { x: (b.z - a.z) / l, z: -(b.x - a.x) / l };
    };
    if (i === 0) return seg(0);
    if (i === pts.length - 1) return seg(pts.length - 2);
    const n0 = seg(i - 1);
    const n1 = seg(i);
    let x = n0.x + n1.x;
    let z = n0.z + n1.z;
    const l = Math.hypot(x, z);
    if (l < 1e-6) return n1;
    x /= l;
    z /= l;
    const scale = 1 / Math.max(0.5, x * n0.x + z * n0.z);
    return { x: x * scale, z: z * scale };
  };
  const runs: KerbRun[] = [];
  for (const [s, e] of open) {
    if (e - s < 1) continue;
    // Centre-line samples: the run's two ends and every road point between them.
    const samples: Array<{ x: number; z: number; nx: number; nz: number; d: number }> = [];
    const first = at(pts, along, s);
    samples.push({ x: first.x, z: first.z, nx: first.dz, nz: -first.dx, d: s });
    for (let i = start; i <= end; i++) {
      if (along[i]! <= s + 0.01 || along[i]! >= e - 0.01) continue;
      const n = normal(i);
      samples.push({ x: pts[i]!.x, z: pts[i]!.z, nx: n.x, nz: n.z, d: along[i]! });
    }
    const last = at(pts, along, Math.min(e, total));
    samples.push({ x: last.x, z: last.z, nx: last.dz, nz: -last.dx, d: e });
    for (const side of [1, -1]) {
      const inner: Point[] = [];
      const outer: Point[] = [];
      for (const q of samples) {
        inner.push({ x: q.x + q.nx * side * half, z: q.z + q.nz * side * half });
        outer.push({ x: q.x + q.nx * side * (half + KERB.width), z: q.z + q.nz * side * (half + KERB.width) });
      }
      runs.push({ inner, outer, along: samples.map((q) => q.d) });
    }
  }
  return runs;
}

/** Everything worked out once per map: junctions, distances, shelters by chunk. */
interface Context {
  readonly nodes: Map<number, Node>;
  readonly along: Map<Road, number[]>;
  /** Stretches of main roads by chunk key (the chunk holding each segment's midpoint). */
  readonly spans: Map<string, Array<{ road: Road; start: number; end: number }>>;
  readonly shelters: Map<string, ShelterPlacement[]>;
}

const contexts = new WeakMap<FurnitureMap, Context>();
const results = new WeakMap<ChunkData, ChunkFurniture>();

function context(map: FurnitureMap): Context {
  let ctx = contexts.get(map);
  if (ctx) return ctx;
  const key = (p: Point) => chunkKeyAt(map.bounds, map.chunkSize, p.x, p.z);
  const spans = new Map<string, Array<{ road: Road; start: number; end: number }>>();
  const along = new Map<Road, number[]>();
  for (const road of map.roads) {
    if (!MAIN_ROADS.has(road.kind) || road.points.length < 2) continue;
    along.set(road, cumulative(road.points));
    let runKey: string | null = null;
    let runStart = 0;
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i]!;
      const b = road.points[i + 1]!;
      const k = key({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
      if (k === runKey) continue;
      if (runKey !== null) pushTo(spans, runKey, { road, start: runStart, end: i });
      runKey = k;
      runStart = i;
    }
    if (runKey !== null) pushTo(spans, runKey, { road, start: runStart, end: road.points.length - 1 });
  }
  const shelters = new Map<string, ShelterPlacement[]>();
  const placed: ShelterPlacement[] = [];
  for (const stop of map.busStops ?? []) {
    const shelter = placeShelter(map, stop);
    if (!shelter) continue;
    // Stops mapped twice (or both platforms of one stop on a narrow road) get one shelter.
    if (placed.some((s) => Math.hypot(s.x - shelter.x, s.z - shelter.z) < SHELTER.width)) continue;
    // Not on another road's carriageway (a stop near a junction).
    if (onOtherRoad(map.roads, shelter, shelter.roadId, 0.5)) continue;
    placed.push(shelter);
    pushTo(shelters, key(shelter), shelter);
  }
  ctx = { nodes: mainRoadNodes(map.roads), along, spans, shelters };
  contexts.set(map, ctx);
  return ctx;
}

function pushTo<T>(map: Map<string, T[]>, key: string, item: T): void {
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
}

/** Corners of a shelter's footprint (front two, back two). */
function shelterCorners(s: ShelterPlacement): Point[] {
  const c = Math.cos(s.yaw);
  const n = Math.sin(s.yaw);
  const w = SHELTER.width / 2;
  const d = SHELTER.depth / 2;
  return [[-w, -d], [w, -d], [-w, d], [w, d]].map(([lx, lz]) => ({ x: s.x + lx! * c + lz! * n, z: s.z - lx! * n + lz! * c }));
}

/**
 * The street furniture of one chunk. Cached per chunk object, so the renderer and the solids
 * share one result.
 */
export function chunkFurniture(map: FurnitureMap, chunk: ChunkData): ChunkFurniture {
  const cached = results.get(chunk);
  if (cached) return cached;
  const ctx = context(map);
  const boxes = chunk.buildings.map((b) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of b.outline) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    return { minX, maxX, minZ, maxZ };
  });
  // A shelter whose footprint reaches into a building of this chunk is left out.
  const shelters = (ctx.shelters.get(chunk.key) ?? []).filter((s) => !shelterCorners(s).some((p) => inBuilding(chunk.buildings, boxes, p, 0)) && !inBuilding(chunk.buildings, boxes, s, 0));
  // Shelters here and in the neighbouring chunks, which poles keep clear of.
  const nearShelters: ShelterPlacement[] = [];
  for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) nearShelters.push(...(ctx.shelters.get(`${chunk.col + dc},${chunk.row + dr}`) ?? []));
  const poles: PolePlacement[] = [];
  const kerbs: KerbRun[] = [];
  for (const span of ctx.spans.get(chunk.key) ?? []) {
    const along = ctx.along.get(span.road)!;
    const skip = (p: Point) =>
      inBuilding(chunk.buildings, boxes, p, 0.3) ||
      nearShelters.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < SHELTER_CLEAR) ||
      onOtherRoad(map.roads, p, span.road.id, 0.6);
    poles.push(...polesAlong(span.road, along, span.start, span.end, blockedStretches(span.road, along, ctx.nodes, true), skip));
    kerbs.push(...kerbsAlong(span.road, along, span.start, span.end, blockedStretches(span.road, along, ctx.nodes, false)));
  }
  const out = { shelters, poles, kerbs };
  results.set(chunk, out);
  return out;
}

/**
 * What is solid: each pole, and each shelter's back panel and front posts (you can walk in under
 * the roof). Kerbs are not solid: the arcade vehicles (TD-8) could not climb them.
 */
export function furnitureSolids(f: ChunkFurniture): SolidBox[] {
  const out: SolidBox[] = [];
  for (const p of f.poles) out.push({ x: p.x, y: POLE.height / 2, z: p.z, hx: POLE.half + 0.02, hy: POLE.height / 2, hz: POLE.half + 0.02, yaw: p.yaw });
  for (const s of f.shelters) {
    const c = Math.cos(s.yaw);
    const n = Math.sin(s.yaw);
    const place = (lx: number, lz: number) => ({ x: s.x + lx * c + lz * n, z: s.z - lx * n + lz * c });
    const back = place(0, SHELTER.depth / 2 - 0.08);
    out.push({ ...back, y: 1.2, hx: SHELTER.width / 2, hy: 1.2, hz: 0.08, yaw: s.yaw });
    for (const lx of [-1, 1]) out.push({ ...place(lx * (SHELTER.width / 2 - 0.1), -SHELTER.depth / 2 + 0.1), y: 1.25, hx: 0.08, hy: 1.25, hz: 0.08, yaw: s.yaw });
  }
  return out;
}
