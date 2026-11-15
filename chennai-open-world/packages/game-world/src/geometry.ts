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

/** Nearest point on a road centreline, optionally only on roads a vehicle can use. */
export function nearestRoadPoint(map: WorldMap, p: Point, drivableOnly = true): RoadHit | null {
  let best: RoadHit | null = null;
  for (const road of map.roads) {
    if (drivableOnly && road.kind === "footway") continue;
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i]!;
      const b = road.points[i + 1]!;
      const hit = closestOnSegment(p, a, b);
      if (!best || hit.d2 < best.distance ** 2) {
        best = { road, x: hit.x, z: hit.z, distance: Math.sqrt(hit.d2), heading: Math.atan2(-(b.x - a.x), -(b.z - a.z)) };
      }
    }
  }
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
