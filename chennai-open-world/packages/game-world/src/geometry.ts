/** Small 2D geometry helpers on the ground plane (x, z). */
import type { Bounds, Point, Road, WorldMap } from "./types";

/** Signed area: positive when the outline runs anticlockwise seen from above (+X right, +Z down the screen means clockwise on a north-up map; we only use the sign consistently). */
export function signedArea(outline: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

export function centroid(outline: readonly Point[]): Point {
  let x = 0;
  let z = 0;
  for (const p of outline) {
    x += p.x;
    z += p.z;
  }
  return { x: x / outline.length, z: z / outline.length };
}

export function pointInPolygon(x: number, z: number, outline: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i]!;
    const b = outline[j]!;
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

export function insideBounds(p: Point, bounds: Bounds, margin = 0): boolean {
  return p.x >= bounds.minX + margin && p.x <= bounds.maxX - margin && p.z >= bounds.minZ + margin && p.z <= bounds.maxZ - margin;
}

/** Closest point on segment a-b to p, and the squared distance to it. */
export function closestOnSegment(p: Point, a: Point, b: Point): { x: number; z: number; d2: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length2 = dx * dx + dz * dz;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length2));
  const x = a.x + dx * t;
  const z = a.z + dz * t;
  return { x, z, d2: (p.x - x) ** 2 + (p.z - z) ** 2 };
}

export interface RoadHit {
  readonly road: Road;
  readonly x: number;
  readonly z: number;
  readonly distance: number;
  /** Direction of the road at that point, radians (0 = towards -Z / north). */
  readonly heading: number;
}

interface Segment {
  readonly road: Road;
  readonly i: number;
}
/** Road segments by grid cell, built the first time a road list is searched. */
const segmentGrids = new WeakMap<readonly Road[], SpatialGrid<Segment>>();
const SEGMENT_CELL = 64;

function segmentGrid(roads: readonly Road[]): SpatialGrid<Segment> {
  let grid = segmentGrids.get(roads);
  if (!grid) {
    grid = new SpatialGrid<Segment>(SEGMENT_CELL);
    for (const road of roads) {
      for (let i = 0; i < road.points.length - 1; i++) grid.add({ road, i }, boundsOf([road.points[i]!, road.points[i + 1]!]));
    }
    segmentGrids.set(roads, grid);
  }
  return grid;
}

/**
 * Visit the road segments (road and index of the segment's first point) in the grid cells within
 * `radius` of a point. A segment may be visited more than once; stops early when `visit` returns true.
 */
export function roadSegmentsNear(roads: readonly Road[], x: number, z: number, radius: number, visit: (road: Road, i: number) => boolean | void): void {
  segmentGrid(roads).near(x, z, radius, (s) => visit(s.road, s.i));
}

/** Nearest point on a road centreline, optionally only on roads a vehicle can use. */
export function nearestRoadPoint(map: Pick<WorldMap, "roads">, p: Point, drivableOnly = true): RoadHit | null {
  const consider = (best: RoadHit | null, road: Road, i: number): RoadHit | null => {
    if (drivableOnly && road.kind === "footway") return best;
    const a = road.points[i]!;
    const b = road.points[i + 1]!;
    const hit = closestOnSegment(p, a, b);
    if (!best || hit.d2 < best.distance ** 2) {
      return { road, x: hit.x, z: hit.z, distance: Math.sqrt(hit.d2), heading: Math.atan2(-(b.x - a.x), -(b.z - a.z)) };
    }
    return best;
  };
  // Search a growing neighbourhood first: a hit within the searched radius is the nearest.
  const grid = segmentGrid(map.roads);
  for (const radius of [40, 160, 640]) {
    let best: RoadHit | null = null;
    grid.near(p.x, p.z, radius, (s) => {
      best = consider(best, s.road, s.i);
    });
    const found = best as RoadHit | null;
    if (found && found.distance <= radius) return found;
  }
  let best: RoadHit | null = null;
  for (const road of map.roads) for (let i = 0; i < road.points.length - 1; i++) best = consider(best, road, i);
  return best;
}

/**
 * Cut a polyline to the parts inside a rectangle. A road that leaves and re-enters the map
 * becomes several pieces.
 */
export function clipLine(points: readonly Point[], bounds: Bounds): Point[][] {
  const pieces: Point[][] = [];
  let current: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const clipped = clipSegment(points[i]!, points[i + 1]!, bounds);
    if (!clipped) {
      if (current.length > 1) pieces.push(current);
      current = [];
      continue;
    }
    const [a, b, cutEnd] = clipped;
    if (current.length === 0) current.push(a);
    else {
      const last = current[current.length - 1]!;
      if (last.x !== a.x || last.z !== a.z) {
        if (current.length > 1) pieces.push(current);
        current = [a];
      }
    }
    current.push(b);
    if (cutEnd) {
      if (current.length > 1) pieces.push(current);
      current = [];
    }
  }
  if (current.length > 1) pieces.push(current);
  return pieces;
}

/** Liang-Barsky clipping. Returns the kept part and whether its end was cut. */
function clipSegment(a: Point, b: Point, r: Bounds): [Point, Point, boolean] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const edges: Array<[number, number]> = [
    [-dx, a.x - r.minX],
    [dx, r.maxX - a.x],
    [-dz, a.z - r.minZ],
    [dz, r.maxZ - a.z],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  const at = (t: number): Point => ({ x: Math.round((a.x + dx * t) * 100) / 100, z: Math.round((a.z + dz * t) * 100) / 100 });
  return [t0 > 0 ? at(t0) : a, t1 < 1 ? at(t1) : b, t1 < 1];
}

/** Lanes on a road: the mapped count, else about one per 3.5 m of carriageway. */
export function laneCount(road: Pick<Road, "lanes" | "width" | "kind" | "oneway">): number {
  if (road.lanes !== undefined && road.lanes > 0) return road.lanes;
  if (road.kind === "footway") return 1;
  return Math.max(road.oneway ? 1 : 2, Math.min(8, Math.round(road.width / 3.5)));
}

/**
 * Cut a polygon to a rectangle (Sutherland-Hodgman). Works for concave outlines too; a concave
 * outline cut into two parts comes back as one outline joined along the rectangle's edge, which
 * triangulates to the same area. Returns an empty array when nothing is inside.
 */
export function clipPolygon(outline: readonly Point[], r: Bounds): Point[] {
  type Edge = { inside: (p: Point) => boolean; cut: (a: Point, b: Point) => Point };
  const at = (a: Point, b: Point, t: number): Point => ({ x: Math.round((a.x + (b.x - a.x) * t) * 100) / 100, z: Math.round((a.z + (b.z - a.z) * t) * 100) / 100 });
  const edges: Edge[] = [
    { inside: (p) => p.x >= r.minX, cut: (a, b) => at(a, b, (r.minX - a.x) / (b.x - a.x)) },
    { inside: (p) => p.x <= r.maxX, cut: (a, b) => at(a, b, (r.maxX - a.x) / (b.x - a.x)) },
    { inside: (p) => p.z >= r.minZ, cut: (a, b) => at(a, b, (r.minZ - a.z) / (b.z - a.z)) },
    { inside: (p) => p.z <= r.maxZ, cut: (a, b) => at(a, b, (r.maxZ - a.z) / (b.z - a.z)) },
  ];
  let out: Point[] = [...outline];
  for (const edge of edges) {
    if (out.length === 0) break;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i]!;
      const previous = input[(i + input.length - 1) % input.length]!;
      const inNow = edge.inside(current);
      if (inNow) {
        if (!edge.inside(previous)) out.push(edge.cut(previous, current));
        out.push(current);
      } else if (edge.inside(previous)) out.push(edge.cut(previous, current));
    }
  }
  // Drop repeated points the cuts can leave.
  const clean = out.filter((p, i) => {
    const q = out[(i + out.length - 1) % out.length]!;
    return out.length === 1 || p.x !== q.x || p.z !== q.z;
  });
  return clean.length >= 3 && Math.abs(signedArea(clean)) > 0.5 ? clean : [];
}

/** Bounding box of an outline or line. */
export function boundsOf(points: readonly Point[]): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * A uniform grid of buckets on the ground plane, so "what is near this point" looks at a few
 * cells instead of the whole city.
 */
export class SpatialGrid<T> {
  private readonly cells = new Map<number, T[]>();

  constructor(readonly cell: number) {}

  private key(cx: number, cz: number): number {
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  /** Put an item in every cell its box touches. */
  add(item: T, box: Bounds): void {
    const c = this.cell;
    for (let cx = Math.floor(box.minX / c); cx <= Math.floor(box.maxX / c); cx++) {
      for (let cz = Math.floor(box.minZ / c); cz <= Math.floor(box.maxZ / c); cz++) {
        const k = this.key(cx, cz);
        const list = this.cells.get(k);
        if (list) list.push(item);
        else this.cells.set(k, [item]);
      }
    }
  }

  addPoint(item: T, x: number, z: number): void {
    this.add(item, { minX: x, maxX: x, minZ: z, maxZ: z });
  }

  /**
   * Call `visit` for the items in the cells within `radius` of a point (an item in several
   * cells is visited once per cell). Stops early when `visit` returns true; returns whether it did.
   */
  near(x: number, z: number, radius: number, visit: (item: T) => boolean | void): boolean {
    const c = this.cell;
    for (let cx = Math.floor((x - radius) / c); cx <= Math.floor((x + radius) / c); cx++) {
      for (let cz = Math.floor((z - radius) / c); cz <= Math.floor((z + radius) / c); cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (!list) continue;
        for (const item of list) if (visit(item) === true) return true;
      }
    }
    return false;
  }
}
