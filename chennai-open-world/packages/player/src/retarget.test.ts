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
});
