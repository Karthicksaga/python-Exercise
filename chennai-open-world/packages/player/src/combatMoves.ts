/**
 * Fighting moves and reactions as data (22 Nov 2026 combat redesign). The character has only
 * idle, walk and run clips, so moves are posed in code: keyframes of where each arm points, how
 * the spine bends and twists, the head, and the body's offset, blended over the walk cycle by
 * `HumanFigure`. Directions are model space, the figure facing +Z, +Y up, its right towards -X
 * (as `AIMING` in HumanFigure). Angles in radians, distances in metres. Judged by eye.
 */

export type ArmBone = "RightArm" | "RightForeArm" | "LeftArm" | "LeftForeArm";
export type Direction = readonly [number, number, number];

export interface MoveKey {
  /** Seconds from the start of the move. */
  readonly at: number;
  /** Where arm bones point; bones left out follow the walk cycle (or the stance). */
  readonly arms?: Partial<Record<ArmBone, Direction>>;
  /** Spine: bend forward (+) or back (-), twist to the left (+), lean to the left (+). */
  readonly spine?: { readonly bend?: number; readonly twist?: number; readonly lean?: number };
  /** Head: nod forward (+) or back (-). */
  readonly neck?: number;
  /**
   * Body offset along the ground: forward and to the right. (No "down": the rig has no knee bend,
   * so lowering the body would push the soles into the road, which the feet check forbids. A
   * crouch is a deeper bend of the spine and head instead.)
   */
  readonly root?: { readonly forward?: number; readonly right?: number };
}

export interface Move {
  /** Seconds the whole move takes, ending back in the walk cycle (or the stance). */
  readonly duration: number;
  readonly keys: readonly MoveKey[];
}

/** Moves played once. */
export type MoveId = "jab" | "cross" | "hook" | "bat" | "recoil" | "windup" | "flinch" | "stagger" | "dodge";
/** Poses held while the game says so. */
export type Stance = "guard" | "block" | "cower";

const GUARD: Partial<Record<ArmBone, Direction>> = {
  RightArm: [-0.35, -0.6, 0.7],
  RightForeArm: [0.3, 0.8, 0.55],
  LeftArm: [0.35, -0.6, 0.7],
  LeftForeArm: [-0.3, 0.8, 0.55],
};
const GUARD_RIGHT = { RightArm: GUARD.RightArm!, RightForeArm: GUARD.RightForeArm! };
const GUARD_LEFT = { LeftArm: GUARD.LeftArm!, LeftForeArm: GUARD.LeftForeArm! };

export const MOVES: Readonly<Record<MoveId, Move>> = {
  // Left jab: the lead hand straight out, the shoulders turning into it.
  jab: {
    duration: 0.3,
    keys: [
      { at: 0.07, arms: { LeftArm: [0.12, 0.12, 1], LeftForeArm: [0.08, 0.1, 1], ...GUARD_RIGHT }, spine: { twist: -0.25 }, root: { forward: 0.08 } },
      { at: 0.16, arms: GUARD, spine: { twist: -0.1 } },
    ],
  },
  // Right cross: the rear hand across, hips and shoulders turning through.
  cross: {
    duration: 0.32,
    keys: [
      { at: 0.08, arms: { RightArm: [-0.1, 0.12, 1], RightForeArm: [-0.05, 0.1, 1], ...GUARD_LEFT }, spine: { twist: 0.35, bend: 0.08 }, root: { forward: 0.12 } },
      { at: 0.18, arms: GUARD, spine: { twist: 0.1 } },
    ],
  },
  // Right hook, the combo's finisher: drawn back, then swung round at shoulder height.
  hook: {
    duration: 0.42,
    keys: [
      { at: 0.09, arms: { RightArm: [-0.8, -0.1, 0.3], RightForeArm: [0.2, 0.5, 0.85], ...GUARD_LEFT }, spine: { twist: -0.3 } },
      { at: 0.19, arms: { RightArm: [-0.45, 0.1, 0.9], RightForeArm: [0.85, 0.05, 0.5], ...GUARD_LEFT }, spine: { twist: 0.6, bend: 0.12 }, root: { forward: 0.15 } },
      { at: 0.3, arms: GUARD, spine: { twist: 0.2 } },
    ],
  },
  // The cricket bat: raised over the right shoulder, swung through across the body.
  bat: {
    duration: 0.55,
    keys: [
      { at: 0.12, arms: { RightArm: [-0.55, 0.55, -0.1], RightForeArm: [0.1, 0.95, -0.3], LeftArm: [-0.1, 0.4, 0.6], LeftForeArm: [-0.7, 0.6, 0.1] }, spine: { twist: -0.6, bend: -0.1 } },
      { at: 0.26, arms: { RightArm: [0.4, -0.05, 0.9], RightForeArm: [0.7, -0.1, 0.7], LeftArm: [0.5, -0.2, 0.8], LeftForeArm: [0.6, -0.1, 0.7] }, spine: { twist: 0.7, bend: 0.2 }, root: { forward: 0.2 } },
    ],
  },
  // A gun's kick: the aimed arm jumps up and settles.
  recoil: {
    duration: 0.16,
    keys: [{ at: 0.03, arms: { RightArm: [-0.1, 0.35, 0.95], RightForeArm: [-0.05, 0.45, 0.9] }, spine: { bend: -0.05 } }],
  },
  // An enemy drawing back to strike: the tell the player blocks or dodges on.
  windup: {
    duration: 0.45,
    keys: [
      { at: 0.15, arms: { RightArm: [-0.55, -0.2, -0.6], RightForeArm: [0.05, 0.8, 0.6], ...GUARD_LEFT }, spine: { twist: -0.45, bend: -0.1 } },
      { at: 0.4, arms: { RightArm: [-0.55, -0.15, -0.65], RightForeArm: [0.05, 0.85, 0.55], ...GUARD_LEFT }, spine: { twist: -0.5, bend: -0.12 } },
    ],
  },
  // A light hit: head and shoulders snap back.
  flinch: {
    duration: 0.32,
    keys: [{ at: 0.07, arms: { RightArm: [-0.4, -0.7, 0.4], LeftArm: [0.4, -0.7, 0.4] }, spine: { bend: -0.35 }, neck: -0.35, root: { forward: -0.08 } }],
  },
  // A heavy hit: thrown back a step, arms out for balance.
  stagger: {
    duration: 0.6,
    keys: [
      { at: 0.1, arms: { RightArm: [-0.7, -0.2, 0.2], LeftArm: [0.7, -0.2, 0.2] }, spine: { bend: -0.55, twist: 0.2 }, neck: -0.4, root: { forward: -0.35 } },
      { at: 0.35, arms: { RightArm: [-0.5, -0.5, 0.3], LeftArm: [0.5, -0.5, 0.3] }, spine: { bend: -0.2 }, root: { forward: -0.45 } },
    ],
  },
  // Ducking out of the way (the game moves the player; this is the body).
  dodge: {
    duration: 0.38,
    keys: [{ at: 0.08, arms: { RightArm: [-0.2, -0.6, 0.6], RightForeArm: [0.2, 0.8, 0.5], LeftArm: [0.2, -0.6, 0.6], LeftForeArm: [-0.2, 0.8, 0.5] }, spine: { bend: 0.65 }, neck: 0.25 }],
  },
};

export const STANCES: Readonly<Record<Stance, MoveKey>> = {
  // Fists up: an enemy brawler squaring up, or the player near a fight.
  guard: { at: 0, arms: GUARD, spine: { bend: 0.08 } },
  // Forearms crossed in front of the face.
  block: {
    at: 0,
    arms: { RightArm: [-0.25, -0.3, 0.9], RightForeArm: [0.45, 0.85, 0.25], LeftArm: [0.25, -0.3, 0.9], LeftForeArm: [-0.45, 0.85, 0.25] },
    spine: { bend: 0.18 },
    neck: 0.1,
  },
  // A frightened bystander: crouched, arms over the head.
  cower: {
    at: 0,
    arms: { RightArm: [-0.35, 0.75, 0.45], RightForeArm: [0.65, 0.35, 0.55], LeftArm: [0.35, 0.75, 0.45], LeftForeArm: [-0.65, 0.35, 0.55] },
    spine: { bend: 0.75 },
    neck: 0.45,
  },
};

/** Seconds a move takes to blend in from whatever the figure was doing. */
const FADE_IN = 0.06;

export interface MoveSample {
  /** The keys either side of this moment, and how far from `from` to `to` (0..1). */
  readonly from: MoveKey | null;
  readonly to: MoveKey;
  readonly blend: number;
  /** How much the move shows over the figure's own motion (0..1): in at the start, out at the end. */
  readonly weight: number;
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Where a move is `t` seconds in: between which two keys, and how strongly it shows. Null once
 * it has finished. Before the first key the figure eases from its own pose into that key; after
 * the last it eases back out by the end.
 */
export function sampleMove(move: Move, t: number): MoveSample | null {
  if (t < 0 || t >= move.duration) return null;
  const keys = move.keys;
  const last = keys[keys.length - 1]!;
  const weight = t < FADE_IN ? smooth(t / FADE_IN) : t > last.at ? 1 - smooth((t - last.at) / (move.duration - last.at)) : 1;
  if (t <= keys[0]!.at) return { from: null, to: keys[0]!, blend: smooth(t / keys[0]!.at), weight: t < FADE_IN ? weight : 1 };
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!;
    const b = keys[i]!;
    if (t <= b.at) return { from: a, to: b, blend: smooth((t - a.at) / (b.at - a.at)), weight };
  }
  return { from: null, to: last, blend: 1, weight };
}

/** Every distinct arm pose the moves and stances use, keyed so each is solved once per model. */
export function armPoses(): Map<string, Partial<Record<ArmBone, Direction>>> {
  const poses = new Map<string, Partial<Record<ArmBone, Direction>>>();
  const add = (arms: Partial<Record<ArmBone, Direction>> | undefined) => {
    if (arms) poses.set(poseKey(arms), arms);
  };
  for (const move of Object.values(MOVES)) for (const key of move.keys) add(key.arms);
  for (const stance of Object.values(STANCES)) add(stance.arms);
  return poses;
}

export function poseKey(arms: Partial<Record<ArmBone, Direction>>): string {
  return (["RightArm", "RightForeArm", "LeftArm", "LeftForeArm"] as const).map((b) => (arms[b] ? arms[b]!.join(",") : "-")).join("|");
}
