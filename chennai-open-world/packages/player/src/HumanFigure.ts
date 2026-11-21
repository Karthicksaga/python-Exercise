/**
 * An animated human: the player and every pedestrian are instances of this. The model and its
 * retargeted animations are loaded once (`HumanAssets`); each figure is a cheap copy that
 * shares geometry, textures and animation data.
 */
import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { PLAYER_HEIGHT } from "./PlayerController";
import { retargetClips } from "./retarget";
import { captureRig, solveRidingPose, type Rig, type RidingPose, type SolvedPose } from "./ridingPose";
import { weaponGeometry, weaponMaterial, type HeldWeapon } from "./weaponModels";

export interface HumanSources {
  /** URL of the character model (.glb). */
  readonly model: string;
  /** URL of a .glb holding `idle`, `walk` and `run` clips for a skeleton with the same bone names. */
  readonly animations: string;
}

/** Ground speed at which each clip's feet match the ground, in m/s. */
const WALK_CLIP_SPEED = 1.5;
const RUN_CLIP_SPEED = 4.6;
/** Above this speed the run clip takes over from the walk clip. */
const RUN_FROM = 3.2;

type Gait = "idle" | "walk" | "run";

/** Right arm straight out in front: aiming a pistol, or the end of a punch. */
const AIMING: Readonly<Record<string, readonly [number, number, number]>> = {
  RightArm: [-0.1, -0.06, 1],
  RightForeArm: [0.02, 0.02, 1],
};

/**
 * Waving down a ride: the right upper arm out and up, the forearm raised, swaying between the two
 * forearm directions (model space, the figure facing +Z). Judged by eye.
 */
const WAVE_OUT: Readonly<Record<string, readonly [number, number, number]>> = {
  RightArm: [-0.62, 0.72, 0.2],
  RightForeArm: [-0.45, 1, 0.15],
};
const WAVE_IN: Readonly<Record<string, readonly [number, number, number]>> = {
  RightArm: [-0.62, 0.72, 0.2],
  RightForeArm: [0.1, 1, 0.15],
};
/** Waves a second (estimated). */
const WAVE_RATE = 2.2;

/**
 * How each weapon sits in the right hand, set in the aiming pose (model space, the figure facing
 * +Z): the direction its barrel or blade points. Guns carry on the line of the arm; the bat is
 * raised, ready to swing. Estimates, judged by eye.
 */
const WEAPON_POINTS: Readonly<Record<HeldWeapon, readonly [number, number, number]>> = {
  pistol: [-0.1, -0.06, 1],
  smg: [-0.1, -0.04, 1],
  shotgun: [-0.08, -0.02, 1],
  bat: [-0.15, 0.85, 0.5],
};
/** From the wrist joint to the middle of the palm, metres (estimate). */
const PALM = 0.085;

/** The bone below each posed limb, which defines the way the limb points at rest. */
const LIMB_CHILD: Readonly<Record<string, string>> = {
  LeftArm: "LeftForeArm",
  RightArm: "RightForeArm",
  LeftForeArm: "LeftHand",
  RightForeArm: "RightHand",
};

/**
 * How far a figure part way into a seat (`HumanFigure.sitting`) has moved, from a linear 0 to 1:
 * eased, so sitting down starts and settles gently. Use it to move the figure's root too.
 */
export function sitWeight(amount: number): number {
  const x = Math.min(1, Math.max(0, amount));
  return x * x * (3 - 2 * x);
}

export class HumanAssets {
  private constructor(
    private readonly model: THREE.Object3D,
    private readonly clips: THREE.AnimationClip[],
    private readonly scale: number,
    private readonly lift: number,
  ) {}

  static async load(sources: HumanSources): Promise<HumanAssets> {
    // Models from `npm run optimize:assets` use meshopt geometry compression; the decoder embeds
    // its WebAssembly, so nothing extra is fetched (TD-3, TD-16).
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const [model, animations] = await Promise.all([loader.loadAsync(sources.model), loader.loadAsync(sources.animations)]);
    const scene = model.scene;
    // Both skeletons are compared in rest pose, before anything is scaled or turned.
    const clips = retargetClips(animations.scene, animations.animations, scene);

    // Facial blend shapes are never used; dropping them avoids their GPU textures.
    scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry.morphAttributes = {};
      node.morphTargetInfluences = [];
      node.morphTargetDictionary = {};
    });

    // Height is measured on the skeleton (top of head to toes): a mesh bounding box is thrown
    // off by hats, props and helper meshes.
    scene.updateMatrixWorld(true);
    const top = scene.getObjectByName("HeadTop_End");
    const toes = scene.getObjectByName("LeftToe_End") ?? scene.getObjectByName("LeftToeBase");
    const point = new THREE.Vector3();
    let low: number;
    let high: number;
    if (top && toes) {
      high = top.getWorldPosition(point).y;
      low = toes.getWorldPosition(point).y;
    } else {
      const box = new THREE.Box3().setFromObject(scene, true);
      high = box.max.y;
      low = box.min.y;
    }
    const scale = PLAYER_HEIGHT / Math.max(0.01, high - low);
    return new HumanAssets(scene, clips, scale, -low * scale);
  }

  /**
   * A new figure.
   * @param tint multiplies the clothing colour, so pedestrians don't all look identical
   * @param background a cheaper copy for pedestrians
   */
  create(tint?: number, background = false): HumanFigure {
    const copy = cloneSkinned(this.model);
    if (background) {
      // People in the crowd are seen from a distance: skip the tiny parts and let only the
      // body and clothes cast shadows.
      const small: THREE.Object3D[] = [];
      copy.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        if (/Eye|Teeth/.test(node.name)) small.push(node);
        else node.userData.noShadow = !/Outfit|Body/.test(node.name);
      });
      for (const node of small) node.removeFromParent();
    }
    if (tint !== undefined) {
      const color = new THREE.Color(tint);
      copy.traverse((node) => {
        if (!(node instanceof THREE.Mesh) || !/Outfit|Headwear|Mesh$/.test(node.name)) return;
        const material = (node.material as THREE.MeshStandardMaterial).clone();
        material.color.multiply(color);
        node.material = material;
      });
    }
    return new HumanFigure(copy, this.clips, this.scale, this.lift);
  }

  private readonly seatedTemplates = new Map<RidingPose, Map<number, THREE.Group>>();

  /**
   * A seated person as plain meshes (no skeleton): the riding pose baked once per pose and
   * clothing tint, then shared by every copy. For drivers and riders of AI traffic: much cheaper
   * than an animated figure, and a seated driver doesn't move. Root at the hip joints (like a
   * seated `HumanFigure`), facing like `create`.
   */
  seatedStatic(tint: number, pose: RidingPose): THREE.Group {
    let byTint = this.seatedTemplates.get(pose);
    if (!byTint) {
      byTint = new Map();
      this.seatedTemplates.set(pose, byTint);
    }
    let template = byTint.get(tint);
    if (!template) {
      const figure = this.create(tint, true);
      figure.setSeated(pose);
      figure.object.updateMatrixWorld(true);
      const toRoot = figure.object.matrixWorld.clone().invert();
      template = new THREE.Group();
      template.name = "seated-person";
      const v = new THREE.Vector3();
      const meshes: THREE.SkinnedMesh[] = [];
      figure.object.traverse((node) => {
        if (node instanceof THREE.SkinnedMesh) meshes.push(node);
      });
      for (const node of meshes) {
        const source = node.geometry;
        const position = source.getAttribute("position");
        const baked = new Float32Array(position.count * 3);
        const toFigure = toRoot.clone().multiply(node.matrixWorld);
        for (let i = 0; i < position.count; i++) {
          v.fromBufferAttribute(position, i);
          node.applyBoneTransform(i, v);
          v.applyMatrix4(toFigure);
          baked.set([v.x, v.y, v.z], i * 3);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(baked, 3));
        const uv = source.getAttribute("uv");
        if (uv) geometry.setAttribute("uv", uv);
        if (source.index) geometry.setIndex(source.index);
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, node.material);
        mesh.castShadow = false;
        template.add(mesh);
      }
      byTint.set(tint, template);
    }
    // Copies share geometry and materials with the template.
    return template.clone(true);
  }
}

export class HumanFigure {
  /** Root, positioned at the figure's feet by the game. */
  readonly object = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<Gait, THREE.AnimationAction>;
  private readonly rig: Rig;
  private readonly scale: number;
  private readonly model: THREE.Object3D;
  private readonly ridingPoses = new Map<RidingPose, SolvedPose>();
  private readonly aimPose: Array<{ bone: THREE.Bone; quaternion: THREE.Quaternion }>;
  /** The weapon in the right hand (a pistol unless told otherwise). */
  private readonly gun: THREE.Mesh;
  /** Where each weapon sits relative to the hand bone, or null when the model has no hand bone. */
  private readonly grips: Map<HeldWeapon, THREE.Matrix4> | null;
  private weapon: HeldWeapon | null = "pistol";
  /** Shown whenever standing (the player's weapon), not only while aiming. */
  private carried = false;
  private readonly standingLift: number;
  /** Every bone's local rotation at rest, to start each blended frame from (`sitting`). */
  private readonly restRotations: ReadonlyArray<{ readonly bone: THREE.Bone; readonly quaternion: THREE.Quaternion }>;
  private gait: Gait = "idle";
  private seated: RidingPose | null = null;
  private aiming = false;
  private down = false;
  /** Seconds left of a punch (arm thrown forwards). */
  private punching = 0;
  /** Waving an arm (someone waiting for a ride), and the wave's clock. */
  private waving = false;
  private waveClock = 0;
  /** The two ends of a wave, solved on this skeleton. */
  private readonly wavePoses: { out: Array<{ bone: THREE.Bone; quaternion: THREE.Quaternion }>; in: Array<{ bone: THREE.Bone; quaternion: THREE.Quaternion }> };

  /** @internal Use `HumanAssets.create`. */
  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[], scale: number, lift: number) {
    // Capture the rest pose (for riding poses) while the model is still unscaled and unturned.
    this.rig = captureRig(model);
    this.restRotations = this.rig.bones.map(({ bone }) => ({ bone, quaternion: bone.quaternion.clone() }));
    this.scale = scale;
    this.model = model;
    const aimBones = new Set(Object.keys(AIMING));
    this.aimPose = HumanFigure.solvePose(model, AIMING).filter((entry) => aimBones.has(entry.bone.name));
    // Like the aim, solved while the model is still in its own frame (unscaled, unturned).
    const waveBones = (pose: Array<{ bone: THREE.Bone; quaternion: THREE.Quaternion }>) => pose.filter((entry) => entry.bone.name in WAVE_OUT);
    this.wavePoses = { out: waveBones(HumanFigure.solvePose(model, WAVE_OUT)), in: waveBones(HumanFigure.solvePose(model, WAVE_IN)) };

    // The weapon is held in the right hand and moves with it; enemies show their pistol only
    // while aiming. Geometry and material are shared by every figure (`weaponModels.ts`).
    this.gun = new THREE.Mesh(weaponGeometry("pistol"), weaponMaterial());
    this.gun.name = "held-weapon";
    this.gun.visible = false;
    const hand = model.getObjectByName("RightHand");
    this.grips = hand ? HumanFigure.solveGrips(model, this.aimPose, hand, scale) : null;
    if (hand && this.grips) {
      hand.add(this.gun);
      this.placeGun("pistol");
    } else {
      // No hand bone: out in front of the right shoulder, as the pistol always was.
      // (Model space: +Z is forwards, -X is the figure's right.)
      this.gun.position.set(-0.2, 1.36, 0.62);
      model.add(this.gun);
    }

    model.scale.setScalar(scale);
    model.position.y = lift;
    this.standingLift = lift;
    // glTF characters face +Z; the game's heading 0 faces -Z.
    model.rotation.y = Math.PI;
    model.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.castShadow = node.userData.noShadow !== true;
      // A skinned mesh's bounds don't follow its bones; never cull a figure.
      node.frustumCulled = false;
    });
    this.object.add(model);
    // Too small to be worth a shadow pass of its own.
    this.gun.castShadow = false;

    this.mixer = new THREE.AnimationMixer(model);
    const action = (name: Gait) => {
      const clip = clips.find((c) => c.name === name);
      if (!clip) throw new Error(`Human animation "${name}" is missing.`);
      const a = this.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(name === "idle" ? 1 : 0);
      return a;
    };
    this.actions = { idle: action("idle"), walk: action("walk"), run: action("run") };
    // Start each figure at a different point of the cycle so a crowd isn't in step.
    this.mixer.setTime(Math.random() * 2);
  }

  /**
   * Each weapon's place relative to the hand bone: worked out once in the aiming pose (the arm
   * straight out), so that from then on the weapon follows the hand in every pose.
   */
  private static solveGrips(model: THREE.Object3D, aimPose: ReadonlyArray<{ bone: THREE.Bone; quaternion: THREE.Quaternion }>, hand: THREE.Object3D, scale: number): Map<HeldWeapon, THREE.Matrix4> {
    const saved = aimPose.map(({ bone }) => bone.quaternion.clone());
    for (const { bone, quaternion } of aimPose) bone.quaternion.copy(quaternion);
    model.updateMatrixWorld(true);
    const toModel = model.matrixWorld.clone().invert();
    const handInModel = toModel.clone().multiply(hand.matrixWorld);
    const fromHand = handInModel.clone().invert();
    const wrist = new THREE.Vector3().setFromMatrixPosition(handInModel);
    const elbow = new THREE.Vector3().setFromMatrixPosition(toModel.clone().multiply(hand.parent?.matrixWorld ?? hand.matrixWorld));
    const forearm = wrist.clone().sub(elbow).normalize();
    // Model units to metres: weapons are sized in metres, the model is scaled by `scale`.
    const palm = wrist.clone().addScaledVector(forearm, PALM / scale);
    const grips = new Map<HeldWeapon, THREE.Matrix4>();
    const forward = new THREE.Vector3(0, 0, 1);
    for (const [weapon, point] of Object.entries(WEAPON_POINTS) as Array<[HeldWeapon, readonly [number, number, number]]>) {
      const turn = new THREE.Quaternion().setFromUnitVectors(forward, new THREE.Vector3(...point).normalize());
      const inModel = new THREE.Matrix4().compose(palm, turn, new THREE.Vector3(1, 1, 1).divideScalar(scale));
      grips.set(weapon, fromHand.clone().multiply(inModel));
    }
    aimPose.forEach(({ bone }, i) => bone.quaternion.copy(saved[i]!));
    model.updateMatrixWorld(true);
    return grips;
  }

  private placeGun(weapon: HeldWeapon): void {
    const grip = this.grips?.get(weapon);
    if (grip) grip.decompose(this.gun.position, this.gun.quaternion, this.gun.scale);
  }

  /** Show the weapon when there is one and the figure is standing and aiming, carrying it, or swinging the bat. */
  private showGun(): void {
    const up = this.weapon !== null && !this.down && this.seated === null;
    this.gun.visible = up && (this.aiming || this.carried || (this.weapon === "bat" && this.punching > 0));
  }

  /**
   * The weapon in the right hand, or none.
   * @param carried shown whenever standing (the player), rather than only while aiming (enemies with guns)
   */
  setWeapon(weapon: HeldWeapon | null, carried = false): void {
    if (weapon !== this.weapon && weapon) {
      this.gun.geometry = weaponGeometry(weapon);
      this.placeGun(weapon);
    }
    this.weapon = weapon;
    this.carried = carried;
    this.showGun();
  }

  /** The weapon shown in the hand right now (for tests and debugging), or null. */
  get shownWeapon(): HeldWeapon | null {
    return this.gun.visible ? this.weapon : null;
  }

  /** Local rotations that make each limb point the way a pose asks (directions in model space). */
  private static solvePose(model: THREE.Object3D, pose: Readonly<Record<string, readonly [number, number, number]>>): Array<{ bone: THREE.Bone; quaternion: THREE.Quaternion }> {
    model.updateMatrixWorld(true);
    const out: Array<{ bone: THREE.Bone; quaternion: THREE.Quaternion }> = [];
    const posedWorld = new Map<THREE.Object3D, THREE.Quaternion>();
    const position = new THREE.Vector3();
    const childPosition = new THREE.Vector3();
    model.traverse((node) => {
      if (!(node instanceof THREE.Bone)) return;
      const restWorld = node.getWorldQuaternion(new THREE.Quaternion());
      const parentRest = node.parent ? node.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
      // Parents are visited first, so their posed orientation is already known.
      const parentPosed = (node.parent && posedWorld.get(node.parent)) ?? parentRest;
      const wanted = pose[node.name];
      const child = model.getObjectByName(LIMB_CHILD[node.name] ?? "");
      let world: THREE.Quaternion;
      if (wanted && child) {
        const rest = child.getWorldPosition(childPosition).sub(node.getWorldPosition(position)).normalize();
        const turn = new THREE.Quaternion().setFromUnitVectors(rest, new THREE.Vector3(...wanted).normalize());
        world = turn.multiply(restWorld);
      } else {
        // Unposed bones keep their rest rotation relative to their (possibly posed) parent.
        world = parentPosed.clone().multiply(parentRest.clone().invert().multiply(restWorld));
      }
      posedWorld.set(node, world);
      out.push({ bone: node, quaternion: parentPosed.clone().invert().multiply(world) });
    });
    return out;
  }

  set visible(value: boolean) {
    this.object.visible = value;
  }

  /** Clothing materials and their original colours, made on the first `setClothes`. */
  private clothes: Array<{ material: THREE.MeshStandardMaterial; base: THREE.Color }> | null = null;

  /** Change the clothes' colour: the original colour multiplied by `tint` (0xffffff restores it). */
  setClothes(tint: number): void {
    if (!this.clothes) {
      const clothes: Array<{ material: THREE.MeshStandardMaterial; base: THREE.Color }> = [];
      this.object.traverse((node) => {
        if (!(node instanceof THREE.Mesh) || !/Outfit|Headwear|Mesh$/.test(node.name) || !(node.material instanceof THREE.MeshStandardMaterial)) return;
        // Own copies, so other figures made from the same model keep their colours.
        const material = node.material.clone();
        node.material = material;
        clothes.push({ material, base: material.color.clone() });
      });
      this.clothes = clothes;
    }
    const color = new THREE.Color(tint);
    for (const { material, base } of this.clothes) material.color.copy(base).multiply(color);
  }

  /** The current clothing colour of the first clothing material, as a hex number (for tests). */
  get clothesColor(): number | null {
    return this.clothes?.[0]?.material.color.getHex() ?? null;
  }

  /**
   * Sit in a vehicle's riding pose (hands on the grips or wheel, feet on the footboard or
   * pedals), or stand up again with null. While seated the figure's root is the centre of its
   * hip joints, so the game places the root on the vehicle's seat point.
   */
  setSeated(pose: RidingPose | null): void {
    if (pose === this.seated) return;
    this.seated = pose;
    this.showGun();
    if (pose) {
      const solved = this.solved(pose);
      this.mixer.stopAllAction();
      for (const { bone, quaternion } of solved.rotations) bone.quaternion.copy(quaternion);
      // The model is turned half a turn and scaled: put its hip joints on the root.
      this.model.position.set(solved.hips.x * this.scale, -solved.hips.y * this.scale, solved.hips.z * this.scale);
    } else {
      this.model.position.set(0, this.standingLift, 0);
      this.gait = "idle";
      for (const [name, action] of Object.entries(this.actions)) {
        action.reset().play();
        action.setEffectiveWeight(name === "idle" ? 1 : 0);
      }
    }
  }

  /** A riding pose solved on this figure's skeleton (once per pose). */
  private solved(pose: RidingPose): SolvedPose {
    let solved = this.ridingPoses.get(pose);
    if (!solved) {
      solved = solveRidingPose(this.rig, pose, this.scale);
      this.ridingPoses.set(pose, solved);
    }
    return solved;
  }

  /**
   * Part way between standing (0) and seated in `pose` (1), for getting in and out of a vehicle.
   * The idle clip plays, then every bone turns towards its seated rotation by the eased amount
   * (`sitWeight`), and the model slides from standing on the root to having its hip joints on it.
   * The caller moves the root the same eased share of the way from the feet's spot to the seat's
   * hip point, so the hips travel in a straight line. At 1 this is `setSeated(pose)`.
   */
  sitting(pose: RidingPose, amount: number, dt: number): void {
    if (amount >= 1) {
      this.setSeated(pose);
      return;
    }
    // Coming out of the seated pose: start the idle clip again.
    if (this.seated) this.setSeated(null);
    const w = sitWeight(amount);
    // Start from rest each frame, so bones the clip doesn't move don't creep towards the pose.
    for (const { bone, quaternion } of this.restRotations) bone.quaternion.copy(quaternion);
    this.update(dt, 0, true);
    if (w <= 0) {
      this.model.position.set(0, this.standingLift, 0);
      return;
    }
    const solved = this.solved(pose);
    for (const { bone, quaternion } of solved.rotations) bone.quaternion.slerp(quaternion, w);
    const s = this.scale;
    this.model.position.set(solved.hips.x * s * w, this.standingLift + (-solved.hips.y * s - this.standingLift) * w, solved.hips.z * s * w);
  }

  /** Hold the pistol out (true) or put it away. */
  setAiming(aiming: boolean): void {
    this.aiming = aiming;
    this.showGun();
  }

  /** Wave the right arm overhead (waiting at the kerb for a ride), or stop. */
  setWaving(waving: boolean): void {
    this.waving = waving;
  }

  /** Throw the right arm forwards for a moment. */
  punch(): void {
    this.punching = 0.22;
  }

  /** Knocked out: lie on the ground and stop moving. */
  setDown(down: boolean): void {
    if (down === this.down) return;
    this.down = down;
    this.showGun();
    // Tip the whole figure onto its back.
    const model = this.object.children[0];
    if (model) {
      model.rotation.x = down ? -Math.PI / 2 : 0;
      model.position.z = down ? 0.9 : 0;
      model.position.y = down ? 0.16 : this.standingLift;
    }
  }

  /**
   * Hold one moment of a gait's cycle (`phase` 0 to 1), with no blending: for baking still
   * copies of the figure (`CrowdFigures`). Returns the cycle's length in seconds.
   */
  holdPose(gait: "idle" | "walk", phase: number): number {
    for (const name of ["idle", "walk", "run"] as const) {
      this.actions[name].setEffectiveWeight(name === gait ? 1 : 0);
      this.actions[name].timeScale = 1;
    }
    const duration = this.actions[gait].getClip().duration;
    this.mixer.setTime(Math.max(0, Math.min(0.999, phase)) * duration);
    return duration;
  }

  /** The walking pace the walk clip was made for, m/s (one cycle covers this times its length). */
  static readonly walkClipSpeed = WALK_CLIP_SPEED;

  /**
   * @param speed horizontal speed in m/s
   * @param grounded false while jumping or falling
   */
  update(dt: number, speed: number, grounded: boolean): void {
    if (this.seated || this.down) return;
    const next: Gait = speed < 0.25 ? "idle" : speed < RUN_FROM ? "walk" : "run";
    if (next !== this.gait) {
      // Blend rather than snap, so starting and stopping look natural.
      this.actions[next].reset().setEffectiveWeight(1);
      this.actions[this.gait].crossFadeTo(this.actions[next], 0.22, false);
      this.gait = next;
    }
    // Play the clip at the rate that keeps feet from sliding; slower in the air.
    const air = grounded ? 1 : 0.55;
    this.actions.walk.timeScale = Math.max(0.6, speed / WALK_CLIP_SPEED) * air;
    this.actions.run.timeScale = Math.max(0.7, speed / RUN_CLIP_SPEED) * air;
    this.mixer.update(dt);

    // Arm poses are laid over the walk cycle after it has been applied.
    this.punching = Math.max(0, this.punching - dt);
    this.showGun();
    if (this.aiming || this.punching > 0) {
      for (const { bone, quaternion } of this.aimPose) bone.quaternion.copy(quaternion);
    } else if (this.waving) {
      this.waveClock += dt;
      const t = 0.5 + 0.5 * Math.sin(this.waveClock * WAVE_RATE * Math.PI * 2);
      const { out, in: back } = this.wavePoses;
      out.forEach(({ bone, quaternion }, i) => bone.quaternion.copy(quaternion).slerp(back[i]!.quaternion, t));
    }
  }
}
