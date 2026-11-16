/**
 * A track centre line with arc length: where a train is at a distance along it, and where a
 * point lies relative to it. Coordinates are the world's local metres (+X east, +Z south).
 */

export interface Point2 {
  readonly x: number;
  readonly z: number;
}

/** A place on the line: position, the way it runs (yaw, as the game uses it) and the distance along it. */
export interface PathPose extends Point2 {
  /** Yaw facing the direction of travel: 0 faces north (-Z), positive turns left (west). */
  readonly yaw: number;
  readonly s: number;
}

export interface PathProjection {
  /** Distance along the line of the nearest point. */
  readonly s: number;
  /** Signed distance to the side: positive on the left of the direction of travel. */
  readonly lateral: number;
  /** Straight distance to the line. */
  readonly distance: number;
}

/** Yaw that faces along (dx, dz). */
export function yawOf(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

export class RailPath {
  readonly points: readonly Point2[];
  /** Distance along the line of each point. */
  private readonly lengths: number[];

  constructor(points: readonly Point2[]) {
    if (points.length < 2) throw new Error("A rail path needs at least two points.");
    this.points = points;
    this.lengths = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      this.lengths.push(this.lengths[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
    }
  }

  /** From a flat [x0, z0, x1, z1, ...] list (the rail file's form). */
  static fromFlat(flat: readonly number[]): RailPath {
    const points: Point2[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) points.push({ x: flat[i]!, z: flat[i + 1]! });
    return new RailPath(points);
  }

  get length(): number {
    return this.lengths[this.lengths.length - 1]!;
  }

  /** Index of the segment that holds distance `s` (clamped to the line). */
  private segment(s: number): number {
    let lo = 0;
    let hi = this.lengths.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lengths[mid]! <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Where the line is at distance `s`, clamped to its ends. */
  at(s: number): PathPose {
    const clamped = Math.max(0, Math.min(this.length, s));
    const i = this.segment(clamped);
    const a = this.points[i]!;
    const b = this.points[i + 1]!;
    const span = this.lengths[i + 1]! - this.lengths[i]!;
    const t = span > 0 ? (clamped - this.lengths[i]!) / span : 0;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: yawOf(b.x - a.x, b.z - a.z), s: clamped };
  }

  /** A point `lateral` metres to the left (negative: right) of the line at distance `s`. */
  beside(s: number, lateral: number): Point2 {
    const pose = this.at(s);
    // Left of the direction of travel (-sin yaw, -cos yaw) is (-cos yaw, sin yaw).
    return { x: pose.x - Math.cos(pose.yaw) * lateral, z: pose.z + Math.sin(pose.yaw) * lateral };
  }

  /** The nearest point of the line to `p`. */
  project(p: Point2): PathProjection {
    let best: PathProjection = { s: 0, lateral: 0, distance: Infinity };
    for (let i = 0; i + 1 < this.points.length; i++) {
      const a = this.points[i]!;
      const b = this.points[i + 1]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const span2 = dx * dx + dz * dz;
      const t = span2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / span2)) : 0;
      const fx = a.x + dx * t;
      const fz = a.z + dz * t;
      const distance = Math.hypot(p.x - fx, p.z - fz);
      if (distance < best.distance) {
        const span = Math.sqrt(span2) || 1;
        // Left of (dx, dz) is (dz, -dx).
        const lateral = ((p.x - fx) * dz + (p.z - fz) * -dx) / span;
        best = { s: this.lengths[i]! + Math.sqrt(span2) * t, lateral, distance };
      }
    }
    return best;
  }
}
