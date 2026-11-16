/**
 * Street props on the pavement: vegetable handcarts, stacked crates, oil barrels and clay pots,
 * the clutter in front of Chennai shops. Plain numbers only; the renderer draws them
 * (`StreetProps` in game-engine, from the Blender props in `assets/models/props`) and the game
 * makes them solid (`propSolids`).
 *
 * Everything here is **invented**: OSM maps none of it. Props go along the main roads (where
 * most ground floors are shops, see `FacadeKit`), at the back of the pavement, from the road's
 * id and the distance along it, so a chunk looks the same every time it loads. Nothing is stored
 * in the world files.
 *
 * They keep clear of:
 * - the walking line of pedestrians (`width / 2 + 1.4` in `packages/ai/src/presets.ts`): a prop's
 *   front edge is `PROP_FRONT` outside the carriageway;
 * - junctions and road ends (`blockedStretches`), other roads' carriageways, buildings,
 *   street-light poles and bus shelters (`chunkFurniture`).
 */
import { blockedStretches, buildingBoxes, chunkFurniture, cumulative, inBuilding, mainRoadNodes, onOtherRoad, type FurnitureMap } from "./furniture";
import { chunkKeyAt } from "./roadChunks";
import type { SolidBox } from "./solids";
import { MAIN_ROADS, type ChunkData, type Point, type Road } from "./types";

export type PropKind = "handcart" | "crates" | "barrel" | "clayPots";

/**
 * Footprint of each prop in its own frame (metres; measured on the Blender models, `tools/blender/street_props.py`,
 * by `StreetProps.test.ts` in game-engine):
 * `hx` along the road, `hz` across it, `h` tall. The renderer checks its models against these.
 */
export const PROP_SIZE: Readonly<Record<PropKind, { readonly hx: number; readonly hz: number; readonly h: number }>> = {
  handcart: { hx: 0.8, hz: 0.58, h: 1.93 },
  crates: { hx: 0.47, hz: 0.24, h: 0.66 },
  barrel: { hx: 0.32, hz: 0.32, h: 0.8 },
  clayPots: { hx: 0.43, hz: 0.43, h: 0.46 },
};

/** Yaw follows the game's convention: 0 faces -Z (north), positive turns left. Each faces the road. */
export interface PropPlacement {
  readonly kind: PropKind;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly roadId: number;
}

/** Spacing of the spots where a group of props may stand, metres along the road. */
export const PROP_PITCH = 13;
/** Share of spots, on each side of the road, that get a group. */
export const PROP_CHANCE = 0.14;
/** Distance of a prop's front edge outside the carriageway's edge, metres (the back of the pavement). */
export const PROP_FRONT = 2.25;
/** Clearance from a street-light pole's centre and from a bus shelter's centre, metres. */
const POLE_CLEAR = 2;
const SHELTER_CLEAR = 4.5;

/** Groups of props, as they are seen in front of shops. Offsets run along the road, metres. */
const GROUPS: ReadonlyArray<{ readonly weight: number; readonly items: ReadonlyArray<{ kind: PropKind; along: number; out?: number }> }> = [
  { weight: 0.12, items: [{ kind: "handcart", along: 0 }] },
  { weight: 0.08, items: [{ kind: "handcart", along: 0 }, { kind: "crates", along: 1.45 }] },
  { weight: 0.35, items: [{ kind: "crates", along: 0 }, { kind: "crates", along: 1.05 }, { kind: "barrel", along: 1.95 }] },
  { weight: 0.2, items: [{ kind: "clayPots", along: 0 }, { kind: "clayPots", along: 1.05, out: 0.1 }] },
  { weight: 0.25, items: [{ kind: "barrel", along: 0 }, { kind: "barrel", along: 0.72 }] },
];

/** Stable pseudo-random number in [0, 1). */
function hash(id: number, salt: number): number {
  let t = (id ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x7feb352d);
  t = Math.imul(t ^ (t >>> 15), 0x846ca68b);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

function pickGroup(r: number): (typeof GROUPS)[number] {
  let acc = 0;
  for (const group of GROUPS) {
    acc += group.weight;
    if (r < acc) return group;
  }
  return GROUPS[GROUPS.length - 1]!;
}

/** Point and unit direction at distance `d` along a road. */
function at(points: readonly Point[], along: readonly number[], d: number): { x: number; z: number; dx: number; dz: number } {
  let i = 0;
  while (i < points.length - 2 && along[i + 1]! < d) i++;
  const a = points[i]!;
  const b = points[i + 1]!;
  const length = along[i + 1]! - along[i]! || 1;
  const t = Math.max(0, Math.min(1, (d - along[i]!) / length));
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: (b.x - a.x) / length, dz: (b.z - a.z) / length };
}

/** Corners of a prop's footprint. */
export function propCorners(p: PropPlacement): Point[] {
  const { hx, hz } = PROP_SIZE[p.kind];
  const c = Math.cos(p.yaw);
  const n = Math.sin(p.yaw);
  return [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]].map(([lx, lz]) => ({ x: p.x + lx! * c + lz! * n, z: p.z - lx! * n + lz! * c }));
}

/**
 * Candidate props along one road between distances `from` and `to` (before the checks against
 * buildings, poles and other roads). Spots are every `PROP_PITCH` metres from a phase set by the
 * road's id, so a road's props don't depend on how it is cut into chunks.
 */
export function propsAlong(road: Road, along: readonly number[], from: number, to: number, stretches: ReadonlyArray<readonly [number, number]>): PropPlacement[] {
  const out: PropPlacement[] = [];
  const phase = hash(road.id, 1) * PROP_PITCH;
  const offset = road.width / 2 + PROP_FRONT;
  const total = along[along.length - 1] ?? 0;
  for (let k = Math.max(0, Math.ceil((from - phase) / PROP_PITCH)); phase + k * PROP_PITCH < to; k++) {
    const d0 = phase + k * PROP_PITCH;
    if (d0 < from) continue;
    for (const side of [1, -1]) {
      const salt = k * 2 + (side > 0 ? 0 : 1);
      if (hash(road.id, 100 + salt) >= PROP_CHANCE) continue;
      const group = pickGroup(hash(road.id, 10_000 + salt));
      // Items are laid out along the road direction on the left (side 1) or right (side -1).
      const items = group.items.map((item) => ({ item, d: d0 + item.along * side }));
      if (items.some(({ d }) => d < 0 || d > total || stretches.some(([a, b]) => d >= a - 1.5 && d <= b + 1.5))) continue;
      const turn = (hash(road.id, 20_000 + salt) - 0.5) * 0.3;
      for (const { item, d } of items) {
        const p = at(road.points, along, d);
        const lx = p.dz * side;
        const lz = -p.dx * side;
        const out_ = offset + (item.out ?? 0) + PROP_SIZE[item.kind].hz;
        // Facing the road: yaw that turns local -Z towards (-lx, -lz), plus a slight skew.
        const yaw = Math.atan2(lx, lz) + turn;
        out.push({ kind: item.kind, x: p.x + lx * out_, z: p.z + lz * out_, yaw, roadId: road.id });
      }
    }
  }
  return out;
}

/** Main-road stretches by chunk (the chunk holding each segment's midpoint), worked out once per map. */
interface Context {
  readonly nodes: ReturnType<typeof mainRoadNodes>;
  readonly along: Map<Road, number[]>;
  readonly spans: Map<string, Array<{ road: Road; from: number; to: number }>>;
}

const contexts = new WeakMap<FurnitureMap, Context>();
const results = new WeakMap<ChunkData, readonly PropPlacement[]>();

function context(map: FurnitureMap): Context {
  let ctx = contexts.get(map);
  if (ctx) return ctx;
  const spans = new Map<string, Array<{ road: Road; from: number; to: number }>>();
  const along = new Map<Road, number[]>();
  for (const road of map.roads) {
    if (!MAIN_ROADS.has(road.kind) || road.points.length < 2) continue;
    const dist = cumulative(road.points);
    along.set(road, dist);
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i]!;
      const b = road.points[i + 1]!;
      const key = chunkKeyAt(map.bounds, map.chunkSize, (a.x + b.x) / 2, (a.z + b.z) / 2);
      const list = spans.get(key) ?? [];
      const last = list[list.length - 1];
      // Consecutive segments in one chunk make one stretch.
      if (last && last.road === road && last.to === dist[i]) last.to = dist[i + 1]!;
      else list.push({ road, from: dist[i]!, to: dist[i + 1]! });
      spans.set(key, list);
    }
  }
  ctx = { nodes: mainRoadNodes(map.roads), along, spans };
  contexts.set(map, ctx);
  return ctx;
}

/**
 * The pavement props of one chunk. Cached per chunk object, so the renderer and the solids share
 * one result.
 */
export function chunkProps(map: FurnitureMap, chunk: ChunkData): readonly PropPlacement[] {
  const cached = results.get(chunk);
  if (cached) return cached;
  const ctx = context(map);
  const furniture = chunkFurniture(map, chunk);
  const boxes = buildingBoxes(chunk.buildings);
  const out: PropPlacement[] = [];
  for (const span of ctx.spans.get(chunk.key) ?? []) {
    const along = ctx.along.get(span.road)!;
    const stretches = blockedStretches(span.road, along, ctx.nodes, true);
    for (const prop of propsAlong(span.road, along, span.from, span.to, stretches)) {
      const corners = propCorners(prop);
      if (inBuilding(chunk.buildings, boxes, prop, 0.3) || corners.some((c) => inBuilding(chunk.buildings, boxes, c, 0.2))) continue;
      if (onOtherRoad(map.roads, prop, prop.roadId, 1.5)) continue;
      if (furniture.poles.some((p) => Math.hypot(p.x - prop.x, p.z - prop.z) < POLE_CLEAR)) continue;
      if (furniture.shelters.some((s) => Math.hypot(s.x - prop.x, s.z - prop.z) < SHELTER_CLEAR)) continue;
      out.push(prop);
    }
  }
  results.set(chunk, out);
  return out;
}

/** One box per prop, as tall as the prop: you walk round a handcart, not through it. */
export function propSolids(props: readonly PropPlacement[]): SolidBox[] {
  return props.map((p) => {
    const { hx, hz, h } = PROP_SIZE[p.kind];
    return { x: p.x, y: h / 2, z: p.z, hx, hy: h / 2, hz, yaw: p.yaw };
  });
}
