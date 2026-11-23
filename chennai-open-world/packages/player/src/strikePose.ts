/**
 * How a punch, a bat swing and a flinch look over time: the arm poses they pass through, the
 * turn of the upper body, and how far the hand closes into a fist. `HumanFigure` lays them over
 * the walk cycle. Pure timing and data; the timings themselves come from the combat rules
 * (`@cow/combat` `STRIKES`), so the blow is drawn landing when its damage does.
 */

export type StrikeMove = "punch" | "bat";

/** A pose a blow passes through; "clip" is whatever the walk or idle clip is doing. */
export type StrikeKey = "clip" | "chamber" | "jab" | "batBack" | "batHit" | "batFollow";

type Direction = readonly [number, number, number];

/**
 * Where each arm segment points in each pose (model space, the figure facing +Z, +X its left,
 * -X its right). Judged by eye on the MPFB people at the phone's camera distance.
 */
export const STRIKE_POSES: Readonly<Record<Exclude<StrikeKey, "clip">, Readonly<Record<string, Direction>>>> = {
  // Drawn back: right elbow behind the body, fist by the chest; the left fist up guarding the face.
  chamber: {
    RightArm: [-0.3, -0.8, -0.45],
    RightForeArm: [-0.05, 0.45, 0.9],
    LeftArm: [0.3, -0.85, 0.3],
    LeftForeArm: [-0.3, 0.7, 0.65],
  },
  // The jab: the right arm straight out at shoulder height (aimed a little right, as the
  // shoulders turn left into it), the left still guarding.
  jab: {
    RightArm: [-0.22, 0.02, 1],
    RightForeArm: [-0.2, 0.04, 1],
    LeftArm: [0.3, -0.85, 0.3],
    LeftForeArm: [-0.3, 0.7, 0.65],
  },
  // Bat drawn back over the right shoulder.
  batBack: {
    RightArm: [-0.75, 0.15, -0.55],
    RightForeArm: [-0.25, 0.9, -0.2],
    LeftArm: [0.1, -0.7, 0.7],
    LeftForeArm: [-0.55, -0.1, 0.8],
  },
  // The bat comes round in front at waist to chest height.
  batHit: {
    RightArm: [-0.35, -0.3, 0.9],
    RightForeArm: [0.1, -0.15, 1],
    LeftArm: [0.2, -0.8, 0.5],
    LeftForeArm: [-0.2, -0.3, 0.95],
  },
  // Follow-through across the body to the left.
  batFollow: {
    RightArm: [0.35, -0.35, 0.85],
    RightForeArm: [0.9, -0.1, 0.4],
    LeftArm: [0.35, -0.85, 0.2],
    LeftForeArm: [0.3, -0.6, 0.75],
  },
};

/** Turn of the upper body about the vertical, radians (positive brings the right shoulder forwards). */
export const STRIKE_TWIST: Readonly<Record<StrikeKey, number>> = { clip: 0, chamber: -0.25, jab: 0.35, batBack: -0.6, batHit: 0.25, batFollow: 0.65 };

interface Key {
  readonly key: StrikeKey;
  /** Seconds from the start: a share of the wind-up, or of the recovery after it. */
  readonly at: (windup: number, recover: number) => number;
}
const KEYS: Readonly<Record<StrikeMove, readonly Key[]>> = {
  punch: [
    { key: "clip", at: () => 0 },
    { key: "chamber", at: (w) => w * 0.5 },
    { key: "jab", at: (w) => w },
    { key: "jab", at: (w, r) => w + r * 0.3 },
    { key: "clip", at: (w, r) => w + r },
  ],
  bat: [
    { key: "clip", at: () => 0 },
    { key: "batBack", at: (w) => w * 0.6 },
    { key: "batHit", at: (w) => w },
    { key: "batFollow", at: (w, r) => w + r * 0.4 },
    { key: "clip", at: (w, r) => w + r },
  ],
};

const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * The two poses a blow is between at time `t` (seconds since it started) and how far from the
 * first to the second (0 to 1), or null once it is over. Each stretch is eased, except the
 * blow itself (drawn back to the hit), which speeds up into the strike.
 */
export function strikeFrame(move: StrikeMove, t: number, windup: number, recover: number): { from: StrikeKey; to: StrikeKey; amount: number } | null {
  const keys = KEYS[move];
  if (t < 0 || t >= keys[keys.length - 1]!.at(windup, recover)) return null;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!;
    const b = keys[i]!;
    const start = a.at(windup, recover);
    const end = b.at(windup, recover);
    if (t >= end) continue;
    const x = end > start ? (t - start) / (end - start) : 1;
    const strike = end === windup;
    return { from: a.key, to: b.key, amount: strike ? x * x : smooth(x) };
  }
  return null;
}

/** How far the striking hand is closed (0 relaxed, 1 a fist): closes during the wind-up, opens over the end of the recovery. */
export function fistAmount(t: number, windup: number, recover: number): number {
  if (t < 0 || t >= windup + recover) return 0;
  if (t < windup * 0.5) return smooth(t / (windup * 0.5));
  const opening = windup + recover * 0.6;
  if (t <= opening) return 1;
  return 1 - smooth((t - opening) / (windup + recover - opening));
}

/** Seconds a flinch lasts. */
export const FLINCH_TIME = 0.4;
/** How far a flinch has the upper body bent away (0 to 1): snaps back fast, then recovers. */
export function flinchAmount(t: number): number {
  if (t < 0 || t >= FLINCH_TIME) return 0;
  const rise = 0.06;
  if (t < rise) return smooth(t / rise);
  return 1 - smooth((t - rise) / (FLINCH_TIME - rise));
}
