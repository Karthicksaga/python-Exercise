/**
 * Timing of a blow, and the knock-back it gives. A punch or a bat swing is drawn as a wind-up,
 * the strike and a recovery (`HumanFigure.strike`); the rules let the damage land at the strike,
 * not when the button is pressed, so what is seen and what happens agree. Pure logic.
 */
import type { CombatWorld } from "./Combat";
import type { WeaponId } from "./Weapons";

export type StrikeKind = "punch" | "bat";

export interface StrikeTiming {
  /** Seconds from the start of the swing to the blow landing (arm fully out, bat across the front). */
  readonly windup: number;
  /** Seconds from the blow back to standing normally. */
  readonly recover: number;
}

/**
 * Judged by eye at the phone's frame rate: a jab is quick, a bat is drawn back first. Both fit
 * inside the weapon's interval (fists 0.45 s, bat 0.7 s), so the rate of blows is unchanged.
 */
export const STRIKES: Readonly<Record<StrikeKind, StrikeTiming>> = {
  punch: { windup: 0.12, recover: 0.26 },
  bat: { windup: 0.22, recover: 0.38 },
};

/** The blow a melee weapon throws: the bat swings, anything else (fists, a gun held up close) punches. */
export const strikeKind = (weapon: WeaponId): StrikeKind => (weapon === "bat" ? "bat" : "punch");

/** How far a blow pushes someone back, metres (estimates: a step back, not a flight). */
export const KNOCK_BACK: Readonly<Record<StrikeKind | "shot", number>> = { punch: 0.4, bat: 0.65, shot: 0.12 };
/** Seconds the knock-back step takes; the person does nothing else meanwhile. */
export const STAGGER_TIME = 0.22;
/** A person's half-width plus a margin: how close to a wall a knock-back may take their centre. */
const BODY_CLEARANCE = 0.4;

/**
 * How far someone at (x, z) can be pushed along the unit direction (dx, dz), up to `distance`,
 * without their body entering a building, tree or vehicle (`CombatWorld.solidDistance`).
 */
export function knockBackRoom(world: Pick<CombatWorld, "solidDistance">, x: number, z: number, dx: number, dz: number, distance: number): number {
  if (distance <= 0) return 0;
  const solid = world.solidDistance(x, z, dx, dz, distance + BODY_CLEARANCE);
  return solid === null ? distance : Math.max(0, Math.min(distance, solid - BODY_CLEARANCE));
}

/**
 * The player's swing between pressing HIT and the blow landing: `begin` starts it, `step`
 * says when it lands (once). Only one swing at a time.
 */
export class SwingClock {
  private left = 0;
  private swinging: StrikeKind | null = null;

  /** The swing under way, or null. */
  get kind(): StrikeKind | null {
    return this.swinging;
  }

  /** Start a swing; false (and nothing changes) while one is already winding up. */
  begin(kind: StrikeKind): boolean {
    if (this.swinging) return false;
    this.swinging = kind;
    this.left = STRIKES[kind].windup;
    return true;
  }

  /** Advance; returns the kind of blow on the step it lands, else null. */
  step(dt: number): StrikeKind | null {
    if (!this.swinging) return null;
    this.left -= dt;
    if (this.left > 1e-9) return null;
    const landed = this.swinging;
    this.swinging = null;
    return landed;
  }

  /** Drop a swing that has not landed (getting into a vehicle, knocked out). */
  cancel(): void {
    this.swinging = null;
  }
}
