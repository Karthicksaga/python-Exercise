/**
 * Rival gangs: crews that hang around on corners of their turf and leave the player alone until
 * provoked. These are the rules for when a calm crew turns on the player, and which crews are
 * on the street at once. Pure logic; `Combat` applies the hostility rules to its enemies and the
 * game uses `crewsToField` to keep the number of figures (and draw calls) small.
 *
 * All distances and times are game-design estimates.
 */

export const GANG_RULES = {
  /** A gunshot this close to a calm gang member (metres) turns the crew hostile. */
  gunshotAlarm: 22,
  /** Standing this close to a gang member with a weapon in hand... */
  lingerRange: 7,
  /** ...for this many seconds turns the crew hostile. */
  lingerTime: 4,
  /** Unease fades this many times slower than it builds, once the player steps back. */
  lingerCoolRate: 0.5,
  /** At this unease (seconds) the crew calls out a warning first. */
  warnAt: 1.5,
  /** Crews within this distance of the player are put on the street... */
  fieldRange: 110,
  /** ...and taken off it beyond this distance (further, so they don't flicker at the edge). */
  leaveRange: 160,
  /** At most this many crews on the street at once (each is three or four figures). */
  maxCrews: 2,
  /** A beaten crew's corner stays empty for this many game seconds. */
  regroupTime: 180,
} as const;

/**
 * One step of a calm gang member's unease about an armed player nearby.
 * @returns the new unease (seconds), and whether the crew now turns hostile
 */
export function lingerStep(unease: number, distance: number, armed: boolean, dt: number): { unease: number; provoked: boolean } {
  if (armed && distance <= GANG_RULES.lingerRange) {
    const next = unease + dt;
    return { unease: next, provoked: next >= GANG_RULES.lingerTime };
  }
  return { unease: Math.max(0, unease - dt * GANG_RULES.lingerCoolRate), provoked: false };
}

/** True when a gunshot fired at (sx, sz) is close enough to alarm someone standing at (x, z). */
export function hearsGunshot(x: number, z: number, sx: number, sz: number): boolean {
  return Math.hypot(x - sx, z - sz) <= GANG_RULES.gunshotAlarm;
}

export interface CrewPlace {
  readonly id: string;
  readonly x: number;
  readonly z: number;
}

/**
 * Which crews should be on the street: those already out stay until the player is past
 * `leaveRange`; others come out within `fieldRange`, nearest first, up to `maxCrews`; crews
 * still regrouping after a beating stay off.
 * @param out crews currently on the street
 * @param regrouping crews beaten recently
 */
export function crewsToField(crews: readonly CrewPlace[], x: number, z: number, out: ReadonlySet<string>, regrouping: ReadonlySet<string>, max: number = GANG_RULES.maxCrews): string[] {
  const distance = (c: CrewPlace) => Math.hypot(c.x - x, c.z - z);
  const keep = crews.filter((c) => out.has(c.id) && !regrouping.has(c.id) && distance(c) <= GANG_RULES.leaveRange).sort((a, b) => distance(a) - distance(b));
  const chosen = keep.slice(0, max).map((c) => c.id);
  const fresh = crews.filter((c) => !out.has(c.id) && !regrouping.has(c.id) && distance(c) <= GANG_RULES.fieldRange).sort((a, b) => distance(a) - distance(b));
  for (const c of fresh) {
    if (chosen.length >= max) break;
    chosen.push(c.id);
  }
  return chosen;
}
