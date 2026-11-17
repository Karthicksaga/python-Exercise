/**
 * Seated poses for riding and driving, solved for each vehicle kind: the hips stay where they
 * are, the back leans, and two-bone IK bends the arms so the hands reach the grips (or a steering
 * wheel) and the legs so the feet reach the footboard, pegs or pedals.
 *
 * All of this works on the skeleton's rest pose, captured once per figure (`captureRig`), so the
 * walk cycle playing on the bones doesn't matter. Pure maths on Three.js vectors; no scene state.
 */
import * as THREE from "three";

export interface PosePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Where a seated person's hands and feet go, relative to the centre of their hip joints, in
 * metres, in the figure's frame: +X the figure's right, +Y up, -Z forwards (the game's frame for
 * something facing heading 0). Hands and feet are given for the right side; the left side is the
 * mirror image (x negated).
 */
export interface RidingPose {
  /** Torso tipped forwards from upright, radians (negative leans back). */
  readonly lean: number;
  /** Centre of the right palm (where it closes round a grip or the wheel rim). */
  readonly hand: PosePoint;
  /** Right ankle. The sole is about 10 cm below it. */
  readonly foot: PosePoint;
  /** How far the knees splay outwards (0 straight ahead, 1 about 45°); default 0.25. */
  readonly knees?: number;
}

/** Rest pose of one bone in the model's own space (unscaled, unturned). */
interface RestBone {
  readonly bone: THREE.Bone;
  readonly parent: THREE.Bone | null;
  /** World rotation of a parent that is not a bone (the armature), which never animates. */
  readonly staticParent: THREE.Quaternion;
  readonly position: THREE.Vector3;
  readonly rotation: THREE.Quaternion;
}

export interface Rig {
  readonly bones: readonly RestBone[];
  readonly byName: ReadonlyMap<string, RestBone>;
  readonly byBone: ReadonlyMap<THREE.Bone, RestBone>;
}

export interface SolvedPose {
  /** Local rotation for every bone. */
  readonly rotations: ReadonlyArray<{ readonly bone: THREE.Bone; readonly quaternion: THREE.Quaternion }>;
  /** Hips joint in model space (unscaled): the point the game places on the seat. */
  readonly hips: THREE.Vector3;
}

/** Capture the skeleton's rest pose. Call before the model is animated. */
export function captureRig(model: THREE.Object3D): Rig {
  model.updateMatrixWorld(true);
  const toModel = model.matrixWorld.clone().invert();
  const modelRotation = model.getWorldQuaternion(new THREE.Quaternion()).invert();
  const bones: RestBone[] = [];
  const byName = new Map<string, RestBone>();
  const byBone = new Map<THREE.Bone, RestBone>();
  model.traverse((node) => {
    if (!(node instanceof THREE.Bone)) return;
    const parent = node.parent instanceof THREE.Bone ? node.parent : null;
    const staticParent = node.parent && !parent ? modelRotation.clone().multiply(node.parent.getWorldQuaternion(new THREE.Quaternion())) : new THREE.Quaternion();
    const rest: RestBone = {
      bone: node,
      parent,
      staticParent,
      position: node.getWorldPosition(new THREE.Vector3()).applyMatrix4(toModel),
      rotation: modelRotation.clone().multiply(node.getWorldQuaternion(new THREE.Quaternion())),
    };
    bones.push(rest);
    byBone.set(node, rest);
    if (!byName.has(node.name)) byName.set(node.name, rest);
  });
  return { bones, byName, byBone };
}

/** Limb chains: upper bone, middle bone, end bone, and the side (+1 figure's left, -1 right). */
const CHAINS = [
  { upper: "LeftArm", middle: "LeftForeArm", end: "LeftHand", side: 1, arm: true },
  { upper: "RightArm", middle: "RightForeArm", end: "RightHand", side: -1, arm: true },
  { upper: "LeftUpLeg", middle: "LeftLeg", end: "LeftFoot", side: 1, arm: false },
  { upper: "RightUpLeg", middle: "RightLeg", end: "RightFoot", side: -1, arm: false },
] as const;

/** Palm centre: this share of the way from the wrist to the middle knuckle. */
const PALM = 0.6;

/** The palm centre of a posed hand, in model space. */
function palmOffset(rig: Rig, hand: string, posed: ReadonlyMap<THREE.Bone, THREE.Quaternion>): THREE.Vector3 {
  const wrist = rig.byName.get(hand);
  const knuckle = rig.byName.get(`${hand}Middle1`);
  if (!wrist || !knuckle) return new THREE.Vector3();
  const q = posed.get(wrist.bone) ?? wrist.rotation;
  // The rest offset expressed in the hand's own frame, turned by its posed rotation.
  return knuckle.position.clone().sub(wrist.position).applyQuaternion(wrist.rotation.clone().invert()).applyQuaternion(q).multiplyScalar(PALM);
}

/**
 * Model-space point of a pose target. The model faces +Z with +X on the figure's left, and the
 * game turns it half a turn, so game (x, y, z) is model (-x, y, -z), scaled.
 */
function toModel(hips: THREE.Vector3, point: PosePoint, side: number, scale: number): THREE.Vector3 {
  // `side` +1 is the figure's left, where game x is negative: mirror the right-side point.
  const x = side > 0 ? -point.x : point.x;
  return new THREE.Vector3(-x / scale, point.y / scale, -point.z / scale).add(hips);
}

/**
 * Elbow or knee position for a two-bone limb from `a` towards `target`, bending towards `pole`.
 */
function bend(a: THREE.Vector3, target: THREE.Vector3, upper: number, lower: number, pole: THREE.Vector3): THREE.Vector3 {
  const toTarget = target.clone().sub(a);
  const reach = Math.min(upper + lower - 1e-4, Math.max(Math.abs(upper - lower) + 1e-4, toTarget.length()));
  const dir = toTarget.normalize();
  const cos = Math.max(-1, Math.min(1, (upper * upper + reach * reach - lower * lower) / (2 * upper * reach)));
  const normal = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
  if (normal.lengthSq() < 1e-8) normal.set(0, 1, 0).sub(dir.clone().multiplyScalar(dir.y));
  normal.normalize();
  return a.clone().add(dir.multiplyScalar(cos * upper)).add(normal.multiplyScalar(Math.sqrt(1 - cos * cos) * upper));
}

/** A rotation that turns `world` so the bone's child points along `wanted`, with the least twist. */
function aim(rig: Rig, rest: RestBone, child: string, world: THREE.Quaternion, wanted: THREE.Vector3): THREE.Quaternion {
  const c = rig.byName.get(child);
  if (!c || wanted.lengthSq() < 1e-10) return world;
  const current = c.position.clone().sub(rest.position).applyQuaternion(rest.rotation.clone().invert()).applyQuaternion(world).normalize();
  return new THREE.Quaternion().setFromUnitVectors(current, wanted.clone().normalize()).multiply(world);
}

/** One pass of forward kinematics with IK on the limbs; `ends` are the targets for the end bones. */
function pass(rig: Rig, pose: RidingPose, ends: ReadonlyMap<string, THREE.Vector3>): { world: Map<THREE.Bone, THREE.Quaternion>; at: Map<THREE.Bone, THREE.Vector3> } {
  const world = new Map<THREE.Bone, THREE.Quaternion>();
  const at = new Map<THREE.Bone, THREE.Vector3>();
  const restOf = (name: string) => rig.byName.get(name);
  for (const rest of rig.bones) {
    const parent = rest.parent ? rig.byBone.get(rest.parent) : undefined;
    let position: THREE.Vector3;
    let q: THREE.Quaternion;
    if (parent) {
      const parentWorld = world.get(parent.bone)!;
      const toParentFrame = parent.rotation.clone().invert();
      position = rest.position.clone().sub(parent.position).applyQuaternion(toParentFrame).applyQuaternion(parentWorld).add(at.get(parent.bone)!);
      q = parentWorld.clone().multiply(toParentFrame).multiply(rest.rotation);
    } else {
      position = rest.position.clone();
      q = rest.rotation.clone();
    }
    const name = rest.bone.name;
    if (name === "Spine") q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pose.lean).multiply(q);
    // Look ahead, not at the tank.
    if (name === "Neck") q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pose.lean * 0.7).multiply(q);
    // Feet flat, pointing forwards, whatever the shin does.
    if (name === "LeftFoot" || name === "RightFoot") q = rest.rotation.clone();
    for (const chain of CHAINS) {
      const target = ends.get(chain.end);
      if (!target) continue;
      const upper = restOf(chain.upper);
      const middle = restOf(chain.middle);
      const end = restOf(chain.end);
      if (!upper || !middle || !end) continue;
      if (name === chain.upper) {
        const l1 = middle.position.distanceTo(upper.position);
        const l2 = end.position.distanceTo(middle.position);
        // Elbows drop down and out; knees come up and forwards, a little apart.
        const pole = chain.arm ? new THREE.Vector3(chain.side * 0.7, -1, -0.2) : new THREE.Vector3(chain.side * (pose.knees ?? 0.25), 0.35, 1);
        const joint = bend(position, target, l1, l2, pole);
        q = aim(rig, rest, chain.middle, q, joint.clone().sub(position));
      } else if (name === chain.middle) {
        q = aim(rig, rest, chain.end, q, target.clone().sub(position));
      } else if (name === chain.end && chain.arm) {
        // Fingers forwards, a little down and in, closing round the grip or the rim.
        q = aim(rig, rest, `${chain.end}Middle1`, q, new THREE.Vector3(-chain.side * 0.3, -0.45, 1));
      }
    }
    world.set(rest.bone, q);
    at.set(rest.bone, position);
  }
  return { world, at };
}

/**
 * Solve a riding pose for a figure drawn at `scale` (model units to metres).
 * Bones the pose doesn't move keep their rest rotation relative to their parent.
 */
export function solveRidingPose(rig: Rig, pose: RidingPose, scale: number): SolvedPose {
  const hipsBone = rig.byName.get("Hips");
  const hips = hipsBone ? hipsBone.position.clone() : new THREE.Vector3();
  const palms = new Map<string, THREE.Vector3>([
    ["LeftHand", toModel(hips, pose.hand, 1, scale)],
    ["RightHand", toModel(hips, pose.hand, -1, scale)],
  ]);
  const ends = new Map<string, THREE.Vector3>([
    ...palms,
    ["LeftFoot", toModel(hips, pose.foot, 1, scale)],
    ["RightFoot", toModel(hips, pose.foot, -1, scale)],
  ]);
  // The targets are for the palms; the IK moves the wrists. Move each wrist target back by the
  // palm's offset and solve again (it changes a little as the forearm turns).
  let solved = pass(rig, pose, ends);
  for (let i = 0; i < 3; i++) {
    for (const [hand, palm] of palms) ends.set(hand, palm.clone().sub(palmOffset(rig, hand, solved.world)));
    solved = pass(rig, pose, ends);
  }
  const rotations = rig.bones.map((rest) => {
    const parentWorld = rest.parent ? solved.world.get(rest.parent)! : rest.staticParent;
    return { bone: rest.bone, quaternion: parentWorld.clone().invert().multiply(solved.world.get(rest.bone)!) };
  });
  return { rotations, hips };
}

/** Model-space palm centre of a hand after the figure's bones were set and its matrices updated. */
export function palmPosition(rig: Rig, hand: "LeftHand" | "RightHand", target: THREE.Vector3): THREE.Vector3 {
  const wrist = rig.byName.get(hand);
  const knuckle = rig.byName.get(`${hand}Middle1`);
  if (!wrist || !knuckle) return target.set(0, 0, 0);
  const a = wrist.bone.getWorldPosition(new THREE.Vector3());
  const b = knuckle.bone.getWorldPosition(new THREE.Vector3());
  return target.copy(a).lerp(b, PALM);
}
