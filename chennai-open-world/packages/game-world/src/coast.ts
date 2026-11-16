/**
 * The sea: where the coast runs and the outline of the water east of it.
 *
 * From OSM `natural=coastline` ways when the extract has them. OSM draws coastlines with the
 * land on the left of the way's direction, so the water is on the right. The pieces are joined
 * end to end, the longest run is kept, its two ends are carried straight on past the edge of
 * the map, and the outline is closed round the side of a wide rectangle that lies on the water
 * side. When the extract has no coastline but has beaches, the coast is taken as a north-south
 * line along the east edge of the mapped beaches (an estimate, said so in `source`).
 */
import type { OsmFeatures } from "@cow/map-data";
import { boundsOf, pointInPolygon } from "./geometry";
import type { Area, Bounds, Point, Sea } from "./types";

/** How far past the playable edge the water reaches, metres: beyond any draw distance. */
export const SEA_REACH = 3000;

const key = (p: Point) => `${p.x},${p.z}`;

/** Join coastline pieces that share end points; the longest chain, in the ways' direction. */
export function joinCoastline(lines: ReadonlyArray<{ readonly id: number; readonly points: readonly Point[] }>): { points: Point[]; ids: number[] } | null {
  const byStart = new Map<string, number>();
  const ends = new Set<string>();
  lines.forEach((line, i) => {
    byStart.set(key(line.points[0]!), i);
    ends.add(key(line.points[line.points.length - 1]!));
  });
  let best: { points: Point[]; ids: number[]; length: number } | null = null;
  const used = new Set<number>();
  // Start from pieces nothing leads into, then from whatever is left (a closed loop).
  const order = lines.map((_, i) => i).sort((a, b) => Number(ends.has(key(lines[a]!.points[0]!))) - Number(ends.has(key(lines[b]!.points[0]!))));
  for (const first of order) {
    if (used.has(first)) continue;
    const points: Point[] = [];
    const ids: number[] = [];
    let at: number | undefined = first;
    while (at !== undefined && !used.has(at)) {
      used.add(at);
      const line: { readonly id: number; readonly points: readonly Point[] } = lines[at]!;
      points.push(...(points.length > 0 ? line.points.slice(1) : line.points));
      ids.push(line.id);
      at = byStart.get(key(line.points[line.points.length - 1]!));
    }
    let length = 0;
    for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z);
    if (!best || length > best.length) best = { points, ids, length };
  }
  return best && best.points.length >= 2 ? { points: best.points, ids: best.ids } : null;
}

/** Where a ray from `p` along (dx, dz) leaves the rectangle `r` (p inside or on it). */
function exitPoint(p: Point, dx: number, dz: number, r: Bounds): Point {
  let t = Infinity;
  if (dx > 1e-9) t = Math.min(t, (r.maxX - p.x) / dx);
  if (dx < -1e-9) t = Math.min(t, (r.minX - p.x) / dx);
  if (dz > 1e-9) t = Math.min(t, (r.maxZ - p.z) / dz);
  if (dz < -1e-9) t = Math.min(t, (r.minZ - p.z) / dz);
  return { x: Math.round((p.x + dx * t) * 100) / 100, z: Math.round((p.z + dz * t) * 100) / 100 };
}

/** Direction from `p` towards the first point at least `min` metres away along `points`. */
function heading(p: Point, points: readonly Point[], min = 40): { dx: number; dz: number } {
  let q = points[points.length - 1]!;
  for (const candidate of points) {
    if (Math.hypot(candidate.x - p.x, candidate.z - p.z) >= min) {
      q = candidate;
      break;
    }
  }
  const length = Math.hypot(q.x - p.x, q.z - p.z) || 1;
  return { dx: (q.x - p.x) / length, dz: (q.z - p.z) / length };
}

/** Position of a point on the rectangle's edge, 0..4 clockwise on a north-up map from the north-west corner. */
function perimeter(p: Point, r: Bounds): number {
  const w = r.maxX - r.minX;
  const d = r.maxZ - r.minZ;
  const eps = 0.01;
  if (Math.abs(p.z - r.minZ) < eps) return (p.x - r.minX) / w;
  if (Math.abs(p.x - r.maxX) < eps) return 1 + (p.z - r.minZ) / d;
  if (Math.abs(p.z - r.maxZ) < eps) return 2 + (r.maxX - p.x) / w;
  return 3 + (r.maxZ - p.z) / d;
}

const CORNERS = (r: Bounds): Point[] => [
  { x: r.maxX, z: r.minZ }, // t = 1
  { x: r.maxX, z: r.maxZ }, // t = 2
  { x: r.minX, z: r.maxZ }, // t = 3
  { x: r.minX, z: r.minZ }, // t = 0 / 4
];

/**
 * The water outline for a coast that crosses the rectangle `r` from edge to edge, the water
 * on its right. Null when the coast doesn't cut the rectangle in two.
 */
export function seaOutline(coast: readonly Point[], r: Bounds): Point[] | null {
  const start = coast[0]!;
  const end = coast[coast.length - 1]!;
  const t0 = perimeter(start, r);
  const t1 = perimeter(end, r);
  const corners = CORNERS(r);
  const walk = (forward: boolean): Point[] => {
    const out: Point[] = [];
    // Corner k sits at perimeter position k + 1 (mod 4).
    const positions = corners.map((c, k) => ({ c, t: (k + 1) % 4 }));
    const span = forward ? (t0 - t1 + 4) % 4 : (t1 - t0 + 4) % 4;
    const passed = positions
      .map(({ c, t }) => ({ c, s: forward ? (t - t1 + 4) % 4 : (t1 - t + 4) % 4 }))
      .filter(({ s }) => s > 0 && s < span)
      .sort((a, b) => a.s - b.s);
    for (const { c } of passed) out.push(c);
    return [...coast, ...out];
  };
  // The water is on the right of the coast: test a point just off its longest segment.
  let probe: Point | null = null;
  let longest = 0;
  for (let i = 0; i < coast.length - 1; i++) {
    const a = coast[i]!;
    const b = coast[i + 1]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length > longest) {
      longest = length;
      // Right of the direction (dx, dz) in this frame (+X east, +Z south) is (-dz, dx).
      probe = { x: (a.x + b.x) / 2 + (-(b.z - a.z) / length) * 2, z: (a.z + b.z) / 2 + ((b.x - a.x) / length) * 2 };
    }
  }
  if (!probe) return null;
  for (const forward of [true, false]) {
    const outline = walk(forward);
    if (pointInPolygon(probe.x, probe.z, outline)) return outline;
  }
  return null;
}

/** The sea for this extract, or null when the map has no coast. */
export function buildSea(features: OsmFeatures, areas: readonly Area[], bounds: Bounds): Sea | null {
  const wide: Bounds = { minX: bounds.minX - SEA_REACH, maxX: bounds.maxX + SEA_REACH, minZ: bounds.minZ - SEA_REACH, maxZ: bounds.maxZ + SEA_REACH };
  const chain = joinCoastline(features.coastlines ?? []);
  let coast: Point[];
  let source: string;
  if (chain) {
    const pts = chain.points;
    const back = heading(pts[0]!, pts);
    const on = heading(pts[pts.length - 1]!, [...pts].reverse());
    coast = [exitPoint(pts[0]!, -back.dx, -back.dz, wide), ...pts, exitPoint(pts[pts.length - 1]!, -on.dx, -on.dz, wide)];
    source = `OSM natural=coastline ways ${chain.ids.join(", ")}, carried straight on past the map edge`;
  } else {
    const beaches = areas.filter((a) => a.kind === "beach");
    if (beaches.length === 0) return null;
    const east = Math.max(...beaches.map((b) => boundsOf(b.outline).maxX));
    // Northwards along the beaches' east edge: the water is on the right (east).
    coast = [
      { x: east, z: wide.maxZ },
      { x: east, z: wide.minZ },
    ];
    source = "estimated: no coastline in the extract, so the east edge of the mapped beaches";
  }
  const outline = seaOutline(coast, wide);
  return outline ? { coast, outline, source } : null;
}

/** Distance from a point to the coast, metres (Infinity when there is no sea). */
export function distanceToCoast(sea: Sea | undefined, p: Point): number {
  if (!sea) return Infinity;
  let best = Infinity;
  const { coast } = sea;
  for (let i = 0; i < coast.length - 1; i++) {
    const a = coast[i]!;
    const b = coast[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)));
  }
  return best;
}
