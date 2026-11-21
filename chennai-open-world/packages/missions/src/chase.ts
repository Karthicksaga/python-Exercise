/**
 * Rules for a chase objective: where the quarry is after travelling some distance along its
 * path, and how fast it goes. Pure logic.
 */

export interface PathPoint {
  readonly x: number;
  readonly z: number;
}

export interface QuarryPlace {
  readonly x: number;
  readonly z: number;
  /** Heading along the path: 0 = north (-Z), positive turning left, like the vehicles. */
  readonly heading: number;
}

/** Total length of a path, metres. */
export function pathLength(path: readonly PathPoint[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z);
  return total;
}

/** The point `distance` metres along a path (clamped to its ends), and the heading there. */
export function pointAlong(path: readonly PathPoint[], distance: number): QuarryPlace {
  const first = path[0] ?? { x: 0, z: 0 };
  let left = Math.max(0, distance);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const heading = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    if (left <= length || i === path.length - 1) {
      const t = length > 0 ? Math.min(1, left / length) : 1;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading };
    }
    left -= length;
  }
  return { x: first.x, z: first.z, heading: 0 };
}

/** Beyond this gap (metres) the quarry eases off, so a player who fell behind can catch up (estimate). */
export const CHASE_EASE_GAP = 60;
/** Speed while easing off, as a fraction of its own (estimate). */
export const CHASE_EASE = 0.55;
/** Closer than this the quarry puts on a burst... */
export const CHASE_BURST_GAP = 15;
/** ...of this fraction of its own speed (estimate). */
export const CHASE_BURST = 1.12;

/** The quarry's speed with the player `gap` metres away. */
export function quarrySpeed(speed: number, gap: number): number {
  if (gap > CHASE_EASE_GAP) return speed * CHASE_EASE;
  if (gap < CHASE_BURST_GAP) return speed * CHASE_BURST;
  return speed;
}
