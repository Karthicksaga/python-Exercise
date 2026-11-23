/**
 * Carjacking rules: which AI traffic vehicle the player on foot can take, and which of the game's
 * few spare drivable vehicles stands in for it. Pure numbers; the game swaps the traffic agent
 * for a drivable vehicle and pulls the driver out (`apps/game/src/Carjacker.ts`). Every number is
 * a game-design estimate chosen for play.
 */

export const CARJACK = {
  /** Traffic kinds that can be taken (buses and ambulances cannot). */
  kinds: ["car", "auto", "bike"] as readonly string[],
  /**
   * Only a vehicle going slower than this can be taken, m/s (a crawl: stopped at a light, in a
   * jam, or braking for the player standing in front of it). Faster ones must be stopped first.
   */
  maxSpeed: 1.2,
  /**
   * How far the player may stand from the vehicle's body, metres. A car that stops for the
   * player in front leaves its `gap` (1.8 m) plus the player's 0.5 m between them, so this
   * reaches from there.
   */
  reach: 2.6,
  /** Spare drivable vehicles kept for taken traffic, per kind (older ones are reused). */
  perKind: 2,
} as const;

/** A traffic vehicle as the rules see it. */
export interface JackCandidate {
  readonly id: number;
  readonly kind: string;
  readonly x: number;
  readonly z: number;
  /** Radians, 0 = towards -Z, positive turning left (as `Agent.heading`). */
  readonly heading: number;
  /** m/s. */
  readonly speed: number;
  readonly halfWidth: number;
  readonly halfLength: number;
}

/** Whether a traffic vehicle of this kind going at this speed can be taken. */
export function carjackable(kind: string, speed: number): boolean {
  return CARJACK.kinds.includes(kind) && Math.abs(speed) < CARJACK.maxSpeed;
}

/** Distance from a point to a vehicle's rectangular footprint (0 inside it), metres. */
export function distanceToFootprint(px: number, pz: number, v: Pick<JackCandidate, "x" | "z" | "heading" | "halfWidth" | "halfLength">): number {
  const rx = px - v.x;
  const rz = pz - v.z;
  // Forward is (-sin, -cos); right is (cos, -sin).
  const along = -(rx * Math.sin(v.heading) + rz * Math.cos(v.heading));
  const across = rx * Math.cos(v.heading) - rz * Math.sin(v.heading);
  const dz = Math.max(0, Math.abs(along) - v.halfLength);
  const dx = Math.max(0, Math.abs(across) - v.halfWidth);
  return Math.hypot(dx, dz);
}

/** The nearest traffic vehicle the player at `at` can take, or null. */
export function pickCarjack(at: { x: number; z: number }, vehicles: readonly JackCandidate[], reach: number = CARJACK.reach): JackCandidate | null {
  let best: JackCandidate | null = null;
  let bestDistance = reach;
  for (const v of vehicles) {
    if (!carjackable(v.kind, v.speed)) continue;
    const d = distanceToFootprint(at.x, at.z, v);
    if (d <= bestDistance) {
      best = v;
      bestDistance = d;
    }
  }
  return best;
}

/** One spare drivable vehicle kept for taken traffic. */
export interface JackSlot {
  readonly kind: string;
  readonly color: number;
  /** Not driven, not being got into: free to be moved and repainted. */
  readonly free: boolean;
  /** When it was last handed out (any increasing number). */
  readonly usedAt: number;
}

/**
 * Which spare vehicle stands in for a taken traffic vehicle: a free one of the same kind and
 * colour if there is one, else a new one while the kind has fewer than `perKind`, else the
 * free one of that kind handed out longest ago (moved and repainted). Returns the slot's index,
 * or "new". Keeps the extra vehicles (bodies, models, draw calls) to `perKind` per kind.
 */
export function chooseJackSlot(slots: readonly JackSlot[], kind: string, color: number, perKind: number = CARJACK.perKind): number | "new" {
  const same = slots.findIndex((s) => s.free && s.kind === kind && s.color === color);
  if (same >= 0) return same;
  const ofKind = slots.filter((s) => s.kind === kind).length;
  if (ofKind < perKind) return "new";
  let oldest = -1;
  slots.forEach((s, i) => {
    if (s.kind === kind && s.free && (oldest < 0 || s.usedAt < slots[oldest]!.usedAt)) oldest = i;
  });
  // None free (cannot happen with perKind >= 2: only one vehicle is driven at a time).
  return oldest >= 0 ? oldest : "new";
}
