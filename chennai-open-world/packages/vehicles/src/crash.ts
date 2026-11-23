/**
 * What a hard impact does to the driver (TD-29). Pure rules; the game applies them.
 *
 * "Impact" is the change of the vehicle's velocity in one physics step, the number
 * `Vehicle.consumeImpact` reports (driving never changes it by more than 1.6 m/s a step, so
 * anything above is a collision). Driven straight into a wall, a vehicle loses all its speed in
 * one step, so the impact is the speed it hit at; a glancing blow loses only part of it, and a
 * hit on a car going the same way only the difference.
 *
 * The thresholds are judgement, not measurement: riders of open vehicles (the motorbike, the
 * auto-rickshaw) come off in a crash a car's driver walks away from; a car's driver goes through
 * the windscreen only near the car's top speed (no seat belts in this game); nobody is thrown
 * out of the bus.
 */
import type { VehicleKind } from "./specs";

export interface CrashRule {
  /** Impact (km/h) from which the driver feels it: hurt and shaken, but still in the seat. */
  readonly hurtFrom: number;
  /** Health lost per km/h of impact above `hurtFrom`, while still seated. */
  readonly seatedDamage: number;
  /** Impact (km/h) from which the driver is thrown off or out; null: never. */
  readonly throwFrom: number | null;
  /** Health lost when thrown at exactly `throwFrom`, and per km/h above it. */
  readonly throwDamage: { readonly base: number; readonly perKmh: number };
  /** Thrown off the seat ("off") or out through the windscreen ("windscreen"). */
  readonly throwStyle: "off" | "windscreen";
  /** The vehicle falls on its side when its rider comes off (two-wheelers). */
  readonly topples: boolean;
}

/** Health is 0 to 100 (`PLAYER_MAX_HEALTH` in `@cow/combat`); a crash that takes it all knocks the player out. */
export const CRASH_RULES: Readonly<Record<VehicleKind, CrashRule>> = {
  // At the bike's top speed (94 km/h) into a wall: 65 health. Head on into oncoming traffic
  // (two speeds add up) can knock a rider out: 100 at about 133 km/h.
  bike: { hurtFrom: 18, seatedDamage: 0.4, throwFrom: 35, throwDamage: { base: 12, perKmh: 0.9 }, throwStyle: "off", topples: true },
  // Open sides, a small, tippy body and a top speed of 50 km/h: off a little earlier than the bike.
  auto: { hurtFrom: 18, seatedDamage: 0.4, throwFrom: 30, throwDamage: { base: 12, perKmh: 0.9 }, throwStyle: "off", topples: false },
  // The hatchback tops out at 83 km/h: only a near flat-out hit throws its driver out.
  car: { hurtFrom: 25, seatedDamage: 0.35, throwFrom: 70, throwDamage: { base: 35, perKmh: 1.2 }, throwStyle: "windscreen", topples: false },
  ambulance: { hurtFrom: 25, seatedDamage: 0.35, throwFrom: 75, throwDamage: { base: 35, perKmh: 1.2 }, throwStyle: "windscreen", topples: false },
  // A high cab and a long, heavy body: the driver is shaken, never thrown.
  bus: { hurtFrom: 30, seatedDamage: 0.25, throwFrom: null, throwDamage: { base: 0, perKmh: 0 }, throwStyle: "windscreen", topples: false },
};

/** Share of the vehicle's speed before the crash the thrown body keeps. */
export const THROW_KEEP = 0.8;
/** The body leaves at this angle off the line of travel, to the side, so a wall dead ahead sends it sliding along it (radians). */
export const THROW_SPREAD = 0.45;
/** Upward speed when thrown (m/s): a hop off the seat, more over a windscreen and at higher speed. */
const THROW_UP = { off: 3.2, windscreen: 4.2, perKmh: 0.03, max: 6.5 };

/** Lying still after a throw: seconds, plus per point of health lost, at most. */
const LIE = { base: 0.8, perDamage: 0.015, max: 2.4 };

export type CrashOutcome =
  | { readonly type: "none" }
  | { readonly type: "shaken"; readonly impactKmh: number; readonly damage: number }
  | {
      readonly type: "thrown";
      readonly impactKmh: number;
      readonly damage: number;
      readonly style: "off" | "windscreen";
      readonly topples: boolean;
      /** Seconds lying still once stopped, before getting up: longer after a worse hit. */
      readonly lieFor: number;
      /** The body's velocity as it leaves the vehicle, m/s (y up). */
      readonly launch: { readonly x: number; readonly y: number; readonly z: number };
    };

export interface CrashInput {
  readonly kind: VehicleKind;
  /** Change of velocity in the crash step, m/s (`Vehicle.consumeImpact`). */
  readonly impact: number;
  /** Velocity over the ground before the crash, m/s (`Vehicle.approachVelocity`). */
  readonly approach: { readonly x: number; readonly z: number };
  /** Which side the body goes: 1 right of the line of travel, -1 left (the steering, else the kerb side). */
  readonly side: 1 | -1;
}

/** Decide what a crash does to the driver. */
export function judgeCrash(input: CrashInput): CrashOutcome {
  const rule = CRASH_RULES[input.kind];
  const kmh = input.impact * 3.6;
  if (rule.throwFrom !== null && kmh >= rule.throwFrom) {
    const damage = Math.min(100, rule.throwDamage.base + rule.throwDamage.perKmh * (kmh - rule.throwFrom));
    const { x, z } = input.approach;
    const speed = Math.hypot(x, z) * THROW_KEEP;
    // Heading of travel (0 = -Z, positive turning left); "right" turns the heading clockwise.
    const travel = Math.atan2(-x, -z) - input.side * THROW_SPREAD;
    const up = Math.min(THROW_UP.max, THROW_UP[rule.throwStyle] + THROW_UP.perKmh * kmh);
    return {
      type: "thrown",
      impactKmh: kmh,
      damage,
      style: rule.throwStyle,
      topples: rule.topples,
      lieFor: Math.min(LIE.max, LIE.base + LIE.perDamage * damage),
      launch: { x: -Math.sin(travel) * speed, y: up, z: -Math.cos(travel) * speed },
    };
  }
  if (kmh >= rule.hurtFrom) return { type: "shaken", impactKmh: kmh, damage: rule.seatedDamage * (kmh - rule.hurtFrom) };
  return { type: "none" };
}
