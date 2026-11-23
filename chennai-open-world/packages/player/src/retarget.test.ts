import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { normalizeBoneNames, plainBoneName, retargetClips } from "./retarget";

/** Hips -> Spine -> Head, plus a left leg, with bone names made by `name`. */
function skeleton(name: (plain: string) => string): THREE.Group {
  const root = new THREE.Group();
  const bone = (plain: string, parent: THREE.Object3D, y: number) => {
    const b = new THREE.Bone();
    b.name = name(plain);
    b.position.set(0, y, 0);
    parent.add(b);
    return b;
  };
  const hips = bone("Hips", root, 1);
  const spine = bone("Spine", hips, 0.2);
  bone("Head", spine, 0.5);
  const upLeg = bone("LeftUpLeg", hips, 0);
  upLeg.position.set(0.1, -0.05, 0);
  const leg = bone("LeftLeg", upLeg, -0.45);
  bone("LeftFoot", leg, -0.45);
  return root;
}

describe("bone names", () => {
  it("strips every form of the Mixamo prefix", () => {
    expect(plainBoneName("mixamorig:Hips")).toBe("Hips");
    expect(plainBoneName("mixamorigLeftArm")).toBe("LeftArm");
    expect(plainBoneName("mixamorig_RightUpLeg")).toBe("RightUpLeg");
    expect(plainBoneName("Spine2")).toBe("Spine2");
    // Only a prefix followed by a bone name is a prefix.
    expect(plainBoneName("mixamorigs")).toBe("mixamorigs");
  });

  it("renames the bones of a loaded MPFB-style rig in place", () => {
    // GLTFLoader turns "mixamorig:Hips" into "mixamorigHips".
    const rig = skeleton((n) => `mixamorig${n}`);
    expect(normalizeBoneNames(rig)).toBe(6);
    expect(rig.getObjectByName("Hips")).toBeInstanceOf(THREE.Bone);
    expect(rig.getObjectByName("LeftFoot")).toBeInstanceOf(THREE.Bone);
    expect(normalizeBoneNames(rig)).toBe(0);
  });
});

describe("retargetClips", () => {
  it("drives a normalised MPFB rig from Mixamo-named clips", () => {
    // As GLTFLoader names them (three.js track names cannot hold a colon).
    const source = skeleton((n) => `mixamorig${n}`);
    const target = skeleton((n) => `mixamorig${n}`);
    normalizeBoneNames(target);
    const turned = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.6);
    const clip = new THREE.AnimationClip("walk", 1, [
      new THREE.QuaternionKeyframeTrack("mixamorigSpine.quaternion", [0, 1], [0, 0, 0, 1, ...turned.toArray()]),
    ]);
    const [out] = retargetClips(source, [clip], target);
    expect(out!.name).toBe("walk");
    const spine = out!.tracks.find((t) => t.name === "Spine.quaternion");
    expect(spine).toBeDefined();
    // Same rest pose on both: the last key is the source's rotation.
    const values = spine!.values;
    const last = new THREE.Quaternion().fromArray(Array.from(values.slice(values.length - 4)));
    expect(last.angleTo(turned)).toBeLessThan(0.01);
  });

  it("lowers the hips as the knee bends, so the foot stays on the ground", () => {
    const source = skeleton((n) => n);
    // A target twice the size, inside a scaled armature (as exporters do).
    const target = skeleton((n) => n);
    target.scale.setScalar(2);
    const armature = new THREE.Group();
    armature.add(target);
    armature.updateMatrixWorld(true);
    const foot = target.getObjectByName("LeftFoot")!;
    const restFoot = foot.getWorldPosition(new THREE.Vector3()).y;
    // Half way through, the thigh swings forward and the knee bends back: the foot comes up.
    const bend = (angle: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle).toArray();
    const clip = new THREE.AnimationClip("walk", 1, [
      new THREE.QuaternionKeyframeTrack("LeftUpLeg.quaternion", [0, 0.5, 1], [...bend(0), ...bend(-0.5), ...bend(0)]),
      new THREE.QuaternionKeyframeTrack("LeftLeg.quaternion", [0, 0.5, 1], [...bend(0), ...bend(1), ...bend(0)]),
    ]);
    const [out] = retargetClips(source, [clip], armature);
    expect(out!.tracks.some((t) => t.name === "Hips.position")).toBe(true);
    // Sampling put the target back in its rest pose.
    expect(foot.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(restFoot, 6);
    const mixer = new THREE.AnimationMixer(armature);
    mixer.clipAction(out!).play();
    for (const t of [0, 0.25, 0.5, 0.75]) {
      mixer.setTime(t);
      armature.updateMatrixWorld(true);
      expect(foot.getWorldPosition(new THREE.Vector3()).y, `at ${t} s`).toBeCloseTo(restFoot, 3);
    }
    // Hips lower half way through (the bent leg is shorter).
    mixer.setTime(0.5);
    expect(target.getObjectByName("Hips")!.position.y).toBeLessThan(0.99);
    // A clip that doesn't move the legs gets no hip track.
    const still = new THREE.AnimationClip("idle", 1, [new THREE.QuaternionKeyframeTrack("Spine.quaternion", [0, 1], [0, 0, 0, 1, ...bend(0.2)])]);
    expect(retargetClips(skeleton((n) => n), [still], skeleton((n) => n))[0]!.tracks.some((t) => t.name === "Hips.position")).toBe(false);
  });
});
