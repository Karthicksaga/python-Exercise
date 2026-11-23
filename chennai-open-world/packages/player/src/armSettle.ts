/**
 * Arms that hang close to the body. The locomotion clips (Mixamo, recorded on a slim rig) hold
 * the upper arms 13-16° out from the body when standing and walking; on the broader MakeHuman
 * shoulders that reads as arms held away from the sides with bent elbows. After the clips are
 * applied, each upper arm is turned in towards the body in the figure's front plane, by an
 * amount per gait, never below a small gap; the forward and back swing is kept.
 */
import * as THREE from "three";

/** Degrees each upper arm is brought in, at full weight of each gait. Judged against the clips' measured angles. */
export const ARM_SETTLE = { idle: 9, walk: 8, run: 10 } as const;
/** Upper arms stay at least this far out from straight down (degrees), so hands clear the hips. */
export const ARM_MIN_OUT = 4;

const axis = new THREE.Vector3();
const forward = new THREE.Vector3();
const outward = new THREE.Vector3();
const shoulder = new THREE.Vector3();
const elbow = new THREE.Vector3();
const dir = new THREE.Vector3();
const turn = new THREE.Quaternion();
const parentTurn = new THREE.Quaternion();

/** How far (degrees) an upper arm stands out from straight down, in the figure's front plane. */
export function armOut(model: THREE.Object3D, side: "Left" | "Right"): number {
  const arm = model.getObjectByName(`${side}Arm`);
  const fore = model.getObjectByName(`${side}ForeArm`);
  if (!arm || !fore) return 0;
  model.updateMatrixWorld(true);
  arm.getWorldPosition(shoulder);
  fore.getWorldPosition(elbow);
  dir.subVectors(elbow, shoulder).normalize();
  // The model's own +X is its left (glTF figures face +Z).
  outward.set(side === "Left" ? 1 : -1, 0, 0).transformDirection(model.matrixWorld);
  const up = new THREE.Vector3(0, 1, 0);
  return THREE.MathUtils.radToDeg(Math.atan2(dir.dot(outward), -dir.dot(up)));
}

/**
 * Bring both upper arms in towards the body.
 * @param weights how much of each gait is playing (the clips' effective weights)
 */
export function settleArms(model: THREE.Object3D, weights: { idle: number; walk: number; run: number }): void {
  const want = ARM_SETTLE.idle * weights.idle + ARM_SETTLE.walk * weights.walk + ARM_SETTLE.run * weights.run;
  if (want <= 0) return;
  model.updateMatrixWorld(true);
  forward.set(0, 0, 1).transformDirection(model.matrixWorld);
  for (const side of ["Left", "Right"] as const) {
    const arm = model.getObjectByName(`${side}Arm`);
    if (!arm?.parent) continue;
    const by = Math.min(want, Math.max(0, armOut(model, side) - ARM_MIN_OUT));
    if (by <= 0) continue;
    // About the figure's forward axis: the left arm turns one way, the right the other.
    const angle = THREE.MathUtils.degToRad(by) * (side === "Left" ? -1 : 1);
    axis.copy(forward).applyQuaternion(arm.parent.getWorldQuaternion(parentTurn).invert());
    arm.quaternion.premultiply(turn.setFromAxisAngle(axis, angle));
  }
  model.updateMatrixWorld(true);
}
