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

/**
 * Sitting pose, as the direction each limb points in the figure's own space
 * (+X = the figure's left, +Y = up, +Z = forwards). Thighs forward, shins down, arms reaching
 * ahead to a handlebar.
 */
const SEATED: Readonly<Record<string, readonly [number, number, number]>> = {
  LeftUpLeg: [0.18, -0.2, 1],
  RightUpLeg: [-0.18, -0.2, 1],
  LeftLeg: [0, -1, -0.12],
  RightLeg: [0, -1, -0.12],
  LeftArm: [0.28, -0.55, 0.8],
  RightArm: [-0.28, -0.55, 0.8],
  LeftForeArm: [-0.1, -0.12, 1],
  RightForeArm: [0.1, -0.12, 1],
};
/** Right arm straight out in front: aiming a pistol, or the end of a punch. */
const AIMING: Readonly<Record<string, readonly [number, number, number]>> = {
  RightArm: [-0.1, -0.06, 1],
  RightForeArm: [0.02, 0.02, 1],
};

/** The bone below each posed limb, which defines the way the limb points at rest. */
const LIMB_CHILD: Readonly<Record<string, string>> = {
  LeftUpLeg: "LeftLeg",
  RightUpLeg: "RightLeg",
  LeftLeg: "LeftFoot",
  RightLeg: "RightFoot",
  LeftArm: "LeftForeArm",
  RightArm: "RightForeArm",
  LeftForeArm: "LeftHand",
  RightForeArm: "RightHand",
};

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

  private readonly seatedTemplates = new Map<number, THREE.Group>();

  /**
   * A seated person as plain meshes (no skeleton): the sitting pose baked once per clothing
   * tint, then shared by every copy. For drivers and riders of AI traffic: much cheaper than an
   * animated figure, and a seated driver doesn't move. Root at the feet, facing like `create`.
   */
  seatedStatic(tint: number): THREE.Group {
    let template = this.seatedTemplates.get(tint);
    if (!template) {
      const figure = this.create(tint, true);
      figure.setSeated(true);
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
      this.seatedTemplates.set(tint, template);
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
  private readonly seatedPose: Array<{ bone: THREE.Bone; quaternion: THREE.Quaternion }>;
  private readonly aimPose: Array<{ bone: THREE.Bone; quaternion: THREE.Quaternion }>;
  private readonly gun: THREE.Mesh;
  private readonly standingLift: number;
  private gait: Gait = "idle";
  private seated = false;
  private aiming = false;
  private down = false;
  /** Seconds left of a punch (arm thrown forwards). */
  private punching = 0;

  /** @internal Use `HumanAssets.create`. */
  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[], scale: number, lift: number) {
    // Work out the sitting pose while the model is still unscaled and unturned.
    this.seatedPose = HumanFigure.solvePose(model, SEATED);
    const aimBones = new Set(Object.keys(AIMING));
    this.aimPose = HumanFigure.solvePose(model, AIMING).filter((entry) => aimBones.has(entry.bone.name));

    // A simple pistol held out in front of the right shoulder, shown only while aiming.
    // (Model space: +Z is forwards, -X is the figure's right.)
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.11, 0.2), new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.5, metalness: 0.6 }));
    this.gun.position.set(-0.2, 1.36, 0.62);
    this.gun.visible = false;
    model.add(this.gun);

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

  /** Sit (riding a bike or driving an auto) or stand up again. */
  setSeated(seated: boolean): void {
    if (seated === this.seated) return;
    this.seated = seated;
    if (seated) {
      this.mixer.stopAllAction();
      for (const { bone, quaternion } of this.seatedPose) bone.quaternion.copy(quaternion);
    } else {
      this.gait = "idle";
      for (const [name, action] of Object.entries(this.actions)) {
        action.reset().play();
        action.setEffectiveWeight(name === "idle" ? 1 : 0);
      }
    }
  }

  /** Hold the pistol out (true) or put it away. */
  setAiming(aiming: boolean): void {
    this.aiming = aiming;
    this.gun.visible = aiming && !this.down;
  }

  /** Throw the right arm forwards for a moment. */
  punch(): void {
    this.punching = 0.22;
  }

  /** Knocked out: lie on the ground and stop moving. */
  setDown(down: boolean): void {
    if (down === this.down) return;
    this.down = down;
    this.gun.visible = this.aiming && !down;
    // Tip the whole figure onto its back.
    const model = this.object.children[0];
    if (model) {
      model.rotation.x = down ? -Math.PI / 2 : 0;
      model.position.z = down ? 0.9 : 0;
      model.position.y = down ? 0.16 : this.standingLift;
    }
  }

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
    if (this.aiming || this.punching > 0) {
      for (const { bone, quaternion } of this.aimPose) bone.quaternion.copy(quaternion);
    }
  }
}
