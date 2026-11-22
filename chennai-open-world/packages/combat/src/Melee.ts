/**
 * The fighting system's numbers and the small rules that shape how fights feel (22 Nov 2026
 * redesign): the punch combo, how hard a hit knocks someone, blocking and dodging, the target the
 * player locks on to, how a hit affects a pedestrian, and how enemies share the attacking.
 * Game-design estimates; pure functions, unit-tested.
 */
import type { WeaponId } from "./Weapons";

/** A person on the street the player can attack (not an enemy): a pedestrian. */
export interface Civilian {
  readonly id: number;
  readonly x: number;
  readonly z: number;
}

/** The three punches of the fist combo, in order. */
export type ComboMove = "jab" | "cross" | "hook";

export const COMBAT_FEEL = {
  /** A punch within this many seconds of the last continues the combo. */
  comboWindow: 0.7,
  /** Damage multiplier for each punch of the combo. The hook is the finisher. */
  combo: { jab: 1, cross: 1, hook: 1.4 } as Readonly<Record<ComboMove, number>>,
  /** A light hit: seconds the person is stunned, and metres they are pushed back. */
  light: { stun: 0.35, knock: 0.25 },
  /** A heavy hit (the hook, a bat, a close shotgun blast). */
  heavy: { stun: 0.9, knock: 1.3 },
  /** Damage from one hit at or above which it counts as heavy. */
  heavyFrom: 45,
  /** Melee damage taken while blocking, as a share. Bullets are not blocked. */
  blockShare: 0.2,
  /** Seconds a dodge makes the player untouchable, and before the next dodge. */
  dodgeFor: 0.35,
  dodgeEvery: 0.8,
  /** Metres a dodge carries the player. */
  dodgeDistance: 2.6,
  /** Seconds an enemy winds up before a punch or swing lands (time to block or dodge). */
  windup: 0.4,
  /** Melee enemies attacking at once; the rest circle, waiting their turn. */
  attackers: 2,
  /** Radius, metres, at which waiting enemies circle the player, and their pace, m/s. */
  circleAt: 3.6,
  circleSpeed: 1.5,
  /** Gunmen back away from a player closer than this, metres, and strafe between shots at this pace. */
  gunmanSpace: 4.5,
  strafeSpeed: 1.6,
  /** Below this share of health an ordinary enemy backs off for `retreatFor` seconds, once. */
  retreatBelow: 0.3,
  retreatFor: 3,
  /** Lock-on: farthest target, metres; how far round from the facing direction, radians; and how far a locked target may go before the lock drops. */
  lockRange: 12,
  lockArc: 1.9,
  lockKeep: 15,
  /** A pedestrian's health. */
  civilianHealth: 60,
} as const;

/** Which punch a swing is, given the last one and the seconds since it. */
export function nextComboMove(last: ComboMove | null, sinceLast: number): ComboMove {
  if (last === null || sinceLast > COMBAT_FEEL.comboWindow) return "jab";
  return last === "jab" ? "cross" : last === "cross" ? "hook" : "jab";
}

/** How a hit of this much damage moves someone: stun seconds, knock-back metres, and whether it is heavy. */
export function hitReaction(damage: number, move?: ComboMove | "bat"): { stun: number; knock: number; heavy: boolean } {
  const heavy = move === "hook" || move === "bat" || damage >= COMBAT_FEEL.heavyFrom;
  const feel = heavy ? COMBAT_FEEL.heavy : COMBAT_FEEL.light;
  return { stun: feel.stun, knock: feel.knock, heavy };
}

/** What happens to a pedestrian hit for `damage` by `weapon` with `health` left. */
export type CivilianOutcome = "flinch" | "stumble" | "injured" | "killed";

/**
 * A pedestrian hit: their health after it, and what it does to them. Fists and the bat knock
 * someone out (injured: they lie down, then get up and limp away); a gun can kill.
 */
export function attackOutcome(health: number, damage: number, weapon: WeaponId): { health: number; outcome: CivilianOutcome } {
  const left = Math.max(0, health - damage);
  if (left > 0) return { health: left, outcome: hitReaction(damage, weapon === "bat" ? "bat" : undefined).heavy ? "stumble" : "flinch" };
  const melee = weapon === "fists" || weapon === "bat";
  return { health: 0, outcome: melee ? "injured" : "killed" };
}

const angleBetween = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export interface LockCandidate {
  readonly id: number;
  readonly x: number;
  readonly z: number;
}

/**
 * The enemy the player's attacks turn to: the current one while it is still close and in sight,
 * otherwise the best in front (near and close to the facing direction), or none.
 */
export function chooseLock(
  player: { readonly x: number; readonly z: number; readonly heading: number },
  candidates: readonly LockCandidate[],
  current: number | null,
  sees: (c: LockCandidate) => boolean,
): number | null {
  const kept = current === null ? undefined : candidates.find((c) => c.id === current);
  if (kept && Math.hypot(kept.x - player.x, kept.z - player.z) <= COMBAT_FEEL.lockKeep && sees(kept)) return kept.id;
  let best: number | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const distance = Math.hypot(c.x - player.x, c.z - player.z);
    if (distance > COMBAT_FEEL.lockRange || distance < 0.2) continue;
    const off = angleBetween(Math.atan2(-(c.x - player.x), -(c.z - player.z)), player.heading);
    if (off > COMBAT_FEEL.lockArc) continue;
    // A metre counts as much as a quarter-turn's worth of turning (about 0.4 rad).
    const score = distance + off * 2.5;
    if (score < bestScore && sees(c)) {
      best = c.id;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Which melee enemies may attack now: those already attacking, then the nearest, up to
 * `COMBAT_FEEL.attackers`. The others circle and wait.
 */
export function chooseAttackers(fighters: ReadonlyArray<{ readonly id: number; readonly distance: number }>, current: ReadonlySet<number>): Set<number> {
  const chosen = new Set<number>();
  const byDistance = [...fighters].sort((a, b) => a.distance - b.distance);
  for (const f of byDistance) if (current.has(f.id) && f.distance < 8 && chosen.size < COMBAT_FEEL.attackers) chosen.add(f.id);
  for (const f of byDistance) if (chosen.size < COMBAT_FEEL.attackers) chosen.add(f.id);
  return chosen;
}
