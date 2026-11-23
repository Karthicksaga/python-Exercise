import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ARM_MIN_OUT, armOut, settleArms } from "./armSettle";

/** A figure facing +Z with both upper arms 15° out from straight down (and a forearm each). */
function figure(out: number): THREE.Group {
  const model = new THREE.Group();
  const chest = new THREE.Bone();
  chest.position.y = 1.4;
  model.add(chest);
  for (const [side, sign] of [["Left", 1], ["Right", -1]] as const) {
    const arm = new THREE.Bone();
    arm.name = `${side}Arm`;
    arm.position.x = 0.2 * sign;
    // The bone's +Y runs down the arm; turned out by `out` degrees about the forward axis.
    arm.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI + THREE.MathUtils.degToRad(out) * sign);
    chest.add(arm);
    const fore = new THREE.Bone();
    fore.name = `${side}ForeArm`;
    fore.position.y = 0.3;
    arm.add(fore);
  }
  return model;
}

describe("arms hang close to the body", () => {
  it("measures how far each arm stands out", () => {
    const model = figure(15);
    expect(armOut(model, "Left")).toBeCloseTo(15, 0);
    expect(armOut(model, "Right")).toBeCloseTo(15, 0);
  });

  it("brings standing arms in, both sides alike, keeping a small gap", () => {
    const model = figure(14);
    settleArms(model, { idle: 1, walk: 0, run: 0 });
    for (const side of ["Left", "Right"] as const) {
      expect(armOut(model, side)).toBeLessThan(6);
      expect(armOut(model, side)).toBeGreaterThanOrEqual(ARM_MIN_OUT - 0.01);
    }
  });

  it("never pulls an arm across the body", () => {
    const model = figure(5);
    settleArms(model, { idle: 1, walk: 0, run: 0 });
    for (const side of ["Left", "Right"] as const) expect(armOut(model, side)).toBeGreaterThanOrEqual(ARM_MIN_OUT - 0.01);
  });

  it("does nothing while no gait is playing (riding, seated)", () => {
    const model = figure(14);
    settleArms(model, { idle: 0, walk: 0, run: 0 });
    expect(armOut(model, "Left")).toBeCloseTo(14, 0);
  });
});
