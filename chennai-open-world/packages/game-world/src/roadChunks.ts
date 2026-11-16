/**
 * Roads cut into the streaming grid, so each chunk draws only the road surface inside it.
 *
 * Every segment of a road belongs to exactly one chunk: the one holding its midpoint. Runs of
 * consecutive segments in the same chunk become one span. The renderer draws a span's ribbon
 * and markings; the joints at the ends of neighbouring spans overlap exactly, so nothing shows.
 */
import type { Bounds, Road } from "./types";

export interface RoadSpan {
  readonly road: Road;
  /** First and last point of the run (inclusive), indices into `road.points`. */
  readonly start: number;
  readonly end: number;
  /** Distance along the road to `start`, metres (keeps lane dashes in step across chunks). */
  readonly offset: number;
  /** Length of the whole road, metres. */
  readonly total: number;
}

export function chunkKeyAt(bounds: Bounds, chunkSize: number, x: number, z: number): string {
  return `${Math.floor((x - bounds.minX) / chunkSize)},${Math.floor((z - bounds.minZ) / chunkSize)}`;
}

export function roadSpansByChunk(roads: readonly Road[], bounds: Bounds, chunkSize: number): Map<string, RoadSpan[]> {
  const out = new Map<string, RoadSpan[]>();
  const push = (key: string, span: RoadSpan) => {
    const list = out.get(key);
    if (list) list.push(span);
    else out.set(key, [span]);
  };
  for (const road of roads) {
    const pts = road.points;
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z);
    let runKey: string | null = null;
    let runStart = 0;
    let runOffset = 0;
    let travelled = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const key = chunkKeyAt(bounds, chunkSize, (a.x + b.x) / 2, (a.z + b.z) / 2);
      if (key !== runKey) {
        if (runKey !== null) push(runKey, { road, start: runStart, end: i, offset: runOffset, total });
        runKey = key;
        runStart = i;
        runOffset = travelled;
      }
      travelled += Math.hypot(b.x - a.x, b.z - a.z);
    }
    if (runKey !== null) push(runKey, { road, start: runStart, end: pts.length - 1, offset: runOffset, total });
  }
  return out;
}
