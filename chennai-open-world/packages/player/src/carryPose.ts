/**
 * Carrying poses: someone holding a box in both hands, a bag or tiffin carrier in one, or pushing
 * a stretcher trolley. Directions each arm bone points in, in model space (the figure facing +Z,
 * its right towards -X), solved on each skeleton like the wave (`HumanFigure.setCarry`). Kept in
 * their own table so they stay apart from the rest and fight poses. Estimates, judged by eye.
 */
export type CarryKind =
  /** Both hands under a box held in front of the waist. */
  | "box"
  /** One hand (the right) holding a bag or carrier by its handle, the arm hanging a little forwards. */
  | "bag"
  /** Both hands forwards on a trolley's push bar at about hip height. */
  | "push";

export const CARRY_POSES: Readonly<Record<CarryKind, Readonly<Record<string, readonly [number, number, number]>>>> = {
  box: {
    RightArm: [-0.12, -0.8, 0.45],
    RightForeArm: [0.28, 0.12, 1],
    LeftArm: [0.12, -0.8, 0.45],
    LeftForeArm: [-0.28, 0.12, 1],
  },
  bag: {
    RightArm: [-0.2, -1, 0.12],
    RightForeArm: [-0.08, -1, 0.3],
  },
  push: {
    RightArm: [-0.08, -0.6, 0.75],
    RightForeArm: [0.05, -0.2, 1],
    LeftArm: [0.08, -0.6, 0.75],
    LeftForeArm: [-0.05, -0.2, 1],
  },
};

export const CARRY_KINDS = Object.keys(CARRY_POSES) as CarryKind[];
