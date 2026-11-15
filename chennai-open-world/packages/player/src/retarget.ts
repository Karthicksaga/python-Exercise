/**
 * Animation retargeting: makes clips recorded on one skeleton drive another skeleton with the
 * same bone names but different rest orientations (e.g. Mixamo clips on another humanoid).
 *
 * Both skeletons must be loaded in their rest pose, facing the same way. For every frame, each
 * bone's rotation away from rest is measured in world space on the source and applied to the
 * target's rest orientation, then converted back to the target's local space. Only rotations
 * are transferred, so the target keeps its own proportions.
 *
 * Rest poses may differ (arms straight out on one rig, lowered on the other): for each limb
 * bone the target's rest orientation is first turned so the limb points the way the source's
 * does, which makes the two rest poses equivalent.
 */
import * as THREE from "three";

const SAMPLE_RATE = 30; // frames per second baked into the new clips

/** Strip the "mixamorig" prefix (with or without a colon) so names match plain bone names. */
const plainName = (name: string) => name.replace(/^mixamorig:?/, "");

/** Limb bones and the child that defines the direction each one points in. */
const LIMB_CHILD: Readonly<Record<string, string>> = {
  LeftShoulder: "LeftArm",
  LeftArm: "LeftForeArm",
  LeftForeArm: "LeftHand",
  RightShoulder: "RightArm",
  RightArm: "RightForeArm",
  RightForeArm: "RightHand",
  LeftUpLeg: "LeftLeg",
  LeftLeg: "LeftFoot",
  RightUpLeg: "RightLeg",
  RightLeg: "RightFoot",
};

/** World direction from a bone to the named bone below it, or null when either is missing. */
function limbDirection(bones: Map<string, THREE.Object3D>, name: string): THREE.Vector3 | null {
  const bone = bones.get(name);
  const child = bones.get(LIMB_CHILD[name] ?? "");
  if (!bone || !child) return null;
  const from = bone.getWorldPosition(new THREE.Vector3());
  const direction = child.getWorldPosition(new THREE.Vector3()).sub(from);
  return direction.lengthSq() < 1e-10 ? null : direction.normalize();
}

export function retargetClips(source: THREE.Object3D, clips: readonly THREE.AnimationClip[], target: THREE.Object3D): THREE.AnimationClip[] {
  source.updateMatrixWorld(true);
  target.updateMatrixWorld(true);

  const sourceBones = new Map<string, THREE.Object3D>();
  source.traverse((node) => {
    if (node.name) sourceBones.set(plainName(node.name), node);
  });

  // Target bones in parent-before-child order, with their rest orientations.
  interface Joint {
    readonly bone: THREE.Bone;
    readonly source: THREE.Object3D | undefined;
    readonly restWorld: THREE.Quaternion;
    readonly sourceRestInverse: THREE.Quaternion;
    readonly parent: Joint | undefined;
    /** Orientation of the bone's non-bone parent (the armature), which never animates. */
    readonly rootParentWorld: THREE.Quaternion;
    readonly world: THREE.Quaternion;
    readonly values: number[];
  }
  const joints: Joint[] = [];
  const byBone = new Map<THREE.Object3D, Joint>();
  const targetBones = new Map<string, THREE.Object3D>();
  target.traverse((node) => {
    if (node instanceof THREE.Bone) targetBones.set(node.name, node);
  });
  target.traverse((node) => {
    if (!(node instanceof THREE.Bone)) return;
    const src = sourceBones.get(node.name);
    const restWorld = node.getWorldQuaternion(new THREE.Quaternion());
    // Line the limb up with the source's rest direction (A-pose versus T-pose).
    const mine = limbDirection(targetBones, node.name);
    const theirs = limbDirection(sourceBones, node.name);
    if (mine && theirs) restWorld.premultiply(new THREE.Quaternion().setFromUnitVectors(mine, theirs));
    const joint: Joint = {
      bone: node,
      source: src,
      restWorld,
      sourceRestInverse: src ? src.getWorldQuaternion(new THREE.Quaternion()).invert() : new THREE.Quaternion(),
      parent: node.parent ? byBone.get(node.parent) : undefined,
      rootParentWorld: node.parent ? node.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion(),
      world: new THREE.Quaternion(),
      values: [],
    };
    joints.push(joint);
    byBone.set(node, joint);
  });
  if (!joints.some((j) => j.source)) throw new Error("Animation skeleton and character skeleton share no bone names.");

  const mixer = new THREE.AnimationMixer(source);
  const sourceWorld = new THREE.Quaternion();
  const parentInverse = new THREE.Quaternion();
  const local = new THREE.Quaternion();
  const out: THREE.AnimationClip[] = [];

  for (const clip of clips) {
    const frames = Math.max(2, Math.round(clip.duration * SAMPLE_RATE) + 1);
    const times: number[] = [];
    for (const joint of joints) joint.values.length = 0;
    const action = mixer.clipAction(clip);
    action.play();

    for (let frame = 0; frame < frames; frame++) {
      const time = (frame / (frames - 1)) * clip.duration;
      times.push(time);
      // Stop just short of the end so a looping clip doesn't wrap to its first frame.
      mixer.setTime(Math.min(time, clip.duration - 1e-4));
      source.updateMatrixWorld(true);

      for (const joint of joints) {
        const parentWorld = joint.parent ? joint.parent.world : joint.rootParentWorld;
        if (joint.source) {
          // World rotation away from rest on the source, applied to the target's rest pose.
          joint.source.getWorldQuaternion(sourceWorld);
          joint.world.copy(sourceWorld).multiply(joint.sourceRestInverse).multiply(joint.restWorld);
        } else {
          // No matching bone (fingers, eyes on some rigs): keep the rest pose under the parent.
          joint.world.copy(parentWorld).multiply(joint.bone.quaternion);
        }
        local.copy(parentInverse.copy(parentWorld).invert()).multiply(joint.world);
        joint.values.push(local.x, local.y, local.z, local.w);
      }
    }
    action.stop();
    mixer.uncacheClip(clip);

    const tracks = joints
      .filter((joint) => joint.source)
      .map((joint) => new THREE.QuaternionKeyframeTrack(`${joint.bone.name}.quaternion`, times, joint.values.slice()));
    out.push(new THREE.AnimationClip(clip.name, clip.duration, tracks));
  }
  return out;
}
