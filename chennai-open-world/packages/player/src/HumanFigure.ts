/**
 * An animated human: the player and every other person are instances of this. Each character
 * model (the player's, and the people of the manifest, `people.ts`) is loaded once, the first
 * time someone needs it, and its animations are retargeted once per skeleton (`HumanAssets`);
 * each figure is a cheap copy that shares geometry, textures and animation data. Figures carry
 * a cheaper model (LOD1) for when they are seen from afar (`HumanFigure.setDetail`).
 */
import { MeshoptSimplifier } from "meshoptimizer";
import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { castPool, fitHeight, pickPerson, strideScale, uniformFor, type Cast, type CastOptions, type PeopleManifest, type Person } from "./people";
import { PLAYER_HEIGHT } from "./PlayerController";
import { normalizeBoneNames, retargetClips } from "./retarget";
import { captureRig, solveRidingPose, type Rig, type RidingPose, type SolvedPose } from "./ridingPose";
import { simplifiedIndex } from "./simplify";
import { weaponGeometry, weaponMaterial, type HeldWeapon } from "./weaponModels";

/** The people the game can cast (`people.ts`), and their model files. */
export interface PeopleSources {
  readonly manifest: PeopleManifest;
  /**
   * Every model file the manifest names (`people/x.glb`, relative to `assets/optimized/`), as a
   * function that gives its URL when the person is first needed.
   */
  readonly files: Readonly<Record<string, () => Promise<string>>>;
}

export interface HumanSources {
  /** URL of the player's model (.glb). */
  readonly model: string;
  /** URL of a .glb holding `idle`, `walk` and `run` clips for a skeleton with the same bone names. */
  readonly animations: string;
  /** Everyone else: without them every person is a copy of the player's model. */
  readonly people?: PeopleSources;
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

/** A clothing mesh: tinted by `create` and `setClothes` (the RPM model's `Outfit_*`/`Headwear` meshes, or an MPFB model's `Outfit` material). */
function isClothing(node: THREE.Mesh): boolean {
  const material = node.material as THREE.Material;
  return /Outfit|Headwear|Mesh$/.test(node.name) || /Outfit/.test(material.name ?? "");
}

/** Share of a part's triangles kept in a LOD1 made at load time (when the manifest has no LOD1 file). */
const LOD1_KEEP = 0.35;

/** One mesh of a character's cheap (LOD1) model, ready to be bound to any copy's skeleton by bone name. */
interface LodPart {
  readonly name: string;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
  readonly bones: readonly string[];
  readonly boneInverses: readonly THREE.Matrix4[];
  readonly bindMatrix: THREE.Matrix4;
  /** Name of the node it hangs from in the character's scene, and its transform there. */
  readonly parent: string;
  readonly matrix: THREE.Matrix4;
}

/** One loaded character: its scene (rest pose), retargeted clips, fit to the ground and LOD1. */
interface Character {
  /** The manifest id, or null for the player's model. */
  readonly id: string | null;
  readonly model: THREE.Object3D;
  readonly clips: THREE.AnimationClip[];
  readonly scale: number;
  /** Height of the feet above the model's origin once scaled, metres. */
  readonly lift: number;
  /** Stride length relative to the player's (`strideScale`). */
  readonly stride: number;
  /** Hip joint height above the soles, metres. */
  readonly hip: number;
  readonly lod1: readonly LodPart[] | null;
  readonly triangles: readonly [number, number];
}

/**
 * Lowest and highest point of a character in rest pose (`low`, `high`, the height it is scaled
 * by), and the lowest point of its meshes (`sole`, what stands on the ground), in model units.
 */
function measure(scene: THREE.Object3D): { low: number; high: number; sole: number } {
  // Height is measured on the skeleton (top of head to toes) when the rig has end bones: a
  // mesh bounding box is thrown off by hats, props and helper meshes. Rigs without them
  // (MPFB's) are measured on their skinned meshes (soles to the top of the hair). The feet are
  // put on the ground by the soles either way: the toe joint is a few centimetres above them.
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene, true);
  const top = scene.getObjectByName("HeadTop_End");
  const toes = scene.getObjectByName("LeftToe_End") ?? scene.getObjectByName("LeftToeBase");
  const point = new THREE.Vector3();
  if (top && toes) return { high: top.getWorldPosition(point).y, low: toes.getWorldPosition(point).y, sole: box.min.y };
  return { high: box.max.y, low: box.min.y, sole: box.min.y };
}

/**
 * A copy of an outfit material dyed `color`: each texel's brightness times the colour, so
 * every garment takes the colour whatever it was (a gang's colours, a stand-in's khaki) while
 * folds, patterns and the dark of hair and shoes stay. One shader variant for all dyes.
 */
function dyed(material: THREE.MeshStandardMaterial, color: THREE.Color): THREE.MeshStandardMaterial {
  const out = material.clone();
  const dye = color.clone();
  out.onBeforeCompile = (shader) => {
    shader.uniforms.dyeColor = { value: dye };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 dyeColor;")
      .replace("#include <map_fragment>", "#include <map_fragment>\n\tdiffuseColor.rgb = dyeColor * min(1.0, sqrt(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))) * 1.15);");
  };
  out.customProgramCacheKey = () => "cow-dye";
  return out;
}

/**
 * A key that is the same for skeletons the clips retarget identically: bone names, rest
 * rotations and the direction of each bone from its parent (retargeting reads only those).
 */
function skeletonKey(scene: THREE.Object3D): string {
  const parts: string[] = [];
  const r = (v: number) => v.toFixed(2);
  scene.traverse((node) => {
    if (!(node instanceof THREE.Bone)) return;
    const q = node.quaternion;
    const d = node.position.clone().normalize();
    parts.push(`${node.name}:${r(q.x)},${r(q.y)},${r(q.z)},${r(q.w)}:${r(d.x)},${r(d.y)},${r(d.z)}`);
  });
  const armature = scene.getObjectByProperty("type", "Bone")?.parent;
  if (armature) parts.push(armature.quaternion.toArray().map((v) => r(v as number)).join(","));
  return parts.join("|");
}

const trianglesOf = (geometry: THREE.BufferGeometry) => (geometry.index ? geometry.index.count : geometry.getAttribute("position").count) / 3;

function skinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh) out.push(node);
  });
  return out;
}

function lodPart(mesh: THREE.SkinnedMesh, geometry: THREE.BufferGeometry): LodPart {
  mesh.updateMatrix();
  return {
    name: mesh.name,
    geometry,
    material: mesh.material as THREE.Material,
    bones: mesh.skeleton.bones.map((b) => b.name),
    boneInverses: mesh.skeleton.boneInverses,
    bindMatrix: mesh.bindMatrix,
    parent: mesh.parent?.name ?? "",
    matrix: mesh.matrix.clone(),
  };
}

/** A LOD1 made from the detailed model: same vertices and skinning, about a third of the triangles; eyes and teeth left out. */
function simplifiedLod(scene: THREE.Object3D): LodPart[] {
  return skinnedMeshes(scene)
    .filter((mesh) => !/Eye|Teeth/.test(mesh.name))
    .map((mesh) => {
      const source = mesh.geometry;
      const positions = Float32Array.from({ length: source.getAttribute("position").count * 3 }, (_, i) => source.getAttribute("position").getComponent(Math.floor(i / 3), i % 3));
      const geometry = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
      geometry.setIndex(new THREE.BufferAttribute(simplifiedIndex(source, positions, LOD1_KEEP), 1));
      geometry.boundingSphere = source.boundingSphere;
      return lodPart(mesh, geometry);
    });
}

/** Bind a character's LOD1 parts to a copy's skeleton (by bone name). Hidden until `setDetail(1)`. Empty when a bone is missing. */
function attachLod(copy: THREE.Object3D, parts: readonly LodPart[]): THREE.SkinnedMesh[] {
  const bones = new Map<string, THREE.Bone>();
  copy.traverse((node) => {
    if (node instanceof THREE.Bone) bones.set(node.name, node);
  });
  const meshes: THREE.SkinnedMesh[] = [];
  for (const part of parts) {
    const list = part.bones.map((name) => bones.get(name));
    if (list.some((b) => !b)) return [];
    const mesh = new THREE.SkinnedMesh(part.geometry, part.material);
    mesh.name = part.name;
    part.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    (copy.getObjectByName(part.parent) ?? copy).add(mesh);
    mesh.bind(new THREE.Skeleton(list as THREE.Bone[], part.boneInverses.map((m) => m.clone())), part.bindMatrix.clone());
    mesh.userData.lod = 1;
    mesh.visible = false;
    meshes.push(mesh);
  }
  return meshes;
}

/** Bones whose vertices are the feet (the soles are the lowest of them). */
const FOOT_BONES = /^(Left|Right)(Foot|ToeBase|Toe_End)$/;

/**
 * Refine the hips' height in each clip (`retargetClips` keeps the lowest foot joint at its rest
 * height) so the lowest foot vertex stays on the ground: a pointed toe or a rolling heel takes
 * the sole a few centimetres below its joints. Measured on this model's own feet, every key.
 */
function plantSoles(scene: THREE.Object3D, clips: readonly THREE.AnimationClip[]): void {
  const hips = scene.getObjectByName("Hips");
  if (!hips?.parent) return;
  // A sample of the vertices bound mostly to a foot bone.
  const feet: Array<{ mesh: THREE.SkinnedMesh; index: number }> = [];
  for (const mesh of skinnedMeshes(scene)) {
    const index = mesh.geometry.getAttribute("skinIndex");
    const weight = mesh.geometry.getAttribute("skinWeight");
    if (!index || !weight) continue;
    for (let i = 0; i < index.count; i++) {
      let best = 0;
      for (let k = 1; k < 4; k++) if (weight.getComponent(i, k) > weight.getComponent(i, best)) best = k;
      const bone = mesh.skeleton.bones[index.getComponent(i, best)];
      if (bone && FOOT_BONES.test(bone.name)) feet.push({ mesh, index: i });
    }
  }
  if (feet.length === 0) return;
  const v = new THREE.Vector3();
  const heightOf = (foot: { mesh: THREE.SkinnedMesh; index: number }) => {
    foot.mesh.getVertexPosition(foot.index, v);
    foot.mesh.localToWorld(v);
    return v.y;
  };
  // Every vertex of the sole, not a thinned sample: on a detailed model a sample of every Nth
  // vertex skipped the toe tip, and the running player's sole sank up to 7 cm. The sole is the
  // feet's lower part in rest pose (heel to toe, up to the instep), which is where the lowest
  // point can be in any pose of a walk or a run.
  scene.updateMatrixWorld(true);
  const restHeights = feet.map(heightOf);
  const floor = Math.min(...restHeights);
  const top = Math.max(...restHeights);
  const sole = feet.filter((_, i) => restHeights[i]! < floor + (top - floor) * 0.45);
  const lowest = () => {
    scene.updateMatrixWorld(true);
    let low = Infinity;
    for (const foot of sole) low = Math.min(low, heightOf(foot));
    return low;
  };
  const bones: THREE.Bone[] = [];
  scene.traverse((node) => {
    if (node instanceof THREE.Bone) bones.push(node);
  });
  const rest = bones.map((b) => ({ q: b.quaternion.clone(), p: b.position.clone() }));
  const restLow = lowest();
  const up = new THREE.Vector3(0, 1, 0).applyMatrix3(new THREE.Matrix3().setFromMatrix4(hips.parent.matrixWorld).invert());
  const mixer = new THREE.AnimationMixer(scene);
  for (const clip of clips) {
    const track = clip.tracks.find((t) => t.name === `${hips.name}.position`);
    if (!track) continue;
    const action = mixer.clipAction(clip);
    action.play();
    // Planted at every key of every bone, not only the hips' own keys: between two hip keys a
    // leg's keys can swing the sole lower than either end.
    const times = [...new Set(clip.tracks.flatMap((t) => Array.from(t.times)))].sort((a, b) => a - b);
    const hipAt = (time: number): [number, number, number] => {
      const t = track.times;
      const at = (k: number): [number, number, number] => [track.values[k * 3]!, track.values[k * 3 + 1]!, track.values[k * 3 + 2]!];
      if (time <= t[0]!) return at(0);
      for (let k = 1; k < t.length; k++) {
        if (time <= t[k]!) {
          const f = (time - t[k - 1]!) / (t[k]! - t[k - 1]! || 1);
          const a = at(k - 1);
          const b = at(k);
          return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
        }
      }
      return at(t.length - 1);
    };
    const values = new Float32Array(times.length * 3);
    times.forEach((time, k) => {
      const at = Math.min(time, clip.duration - 1e-4);
      mixer.setTime(at);
      const dy = restLow - lowest();
      const hip = hipAt(at);
      values[k * 3] = hip[0]! + up.x * dy;
      values[k * 3 + 1] = hip[1]! + up.y * dy;
      values[k * 3 + 2] = hip[2]! + up.z * dy;
    });
    action.stop();
    mixer.uncacheClip(clip);
    const planted = new THREE.VectorKeyframeTrack(track.name, times, values);
    clip.tracks[clip.tracks.indexOf(track)] = planted;
  }
  bones.forEach((b, i) => {
    b.quaternion.copy(rest[i]!.q);
    b.position.copy(rest[i]!.p);
  });
  scene.updateMatrixWorld(true);
}

/** Who plays a part: a manifest person (by id), or null for the player's model; and a clothing tint (a uniform), if any. */
export interface PersonLook {
  readonly person: string | null;
  readonly tint: number | undefined;
}

export class HumanAssets {
  /** Loaded people by manifest id, and the loads under way. */
  private readonly loaded = new Map<string, Character>();
  private readonly loading = new Map<string, Promise<Character | null>>();
  /** Retargeted clips per skeleton (`skeletonKey`): people built on the same rig share them. */
  private readonly clipCache = new Map<string, THREE.AnimationClip[]>();
  private readonly byId: ReadonlyMap<string, Person>;

  private constructor(
    private readonly loader: GLTFLoader,
    private readonly animations: GLTF,
    private readonly people: PeopleSources | null,
    private player: Character,
  ) {
    this.byId = new Map((people?.manifest.people ?? []).map((p) => [p.id, p]));
  }

  static async load(sources: HumanSources): Promise<HumanAssets> {
    // Models from `npm run optimize:assets` use meshopt geometry compression; the decoder embeds
    // its WebAssembly, so nothing extra is fetched (TD-3, TD-16).
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const [model, animations] = await Promise.all([loader.loadAsync(sources.model), loader.loadAsync(sources.animations), MeshoptSimplifier.ready]);
    const assets = new HumanAssets(loader, animations, sources.people ?? null, null as unknown as Character);
    assets.player = assets.prepareCharacter(null, model.scene, null, null);
    return assets;
  }

  /** The people manifest in use, or null when there is none (everyone is the player's model). */
  get manifest(): PeopleManifest | null {
    return this.people?.manifest ?? null;
  }

  /** Ids of the people loaded so far (tests and debugging). */
  loadedPeople(): string[] {
    return [...this.loaded.keys()];
  }

  /** Triangles of a character's detailed and cheap models (null: the player's). */
  triangles(person: string | null): readonly [number, number] {
    return ((person && this.loaded.get(person)) || this.player).triangles;
  }

  /**
   * Load everyone who can play these casts, for places that can wait for them (the start, a
   * crowd being baked). Elsewhere `look` loads people the first time they are wanted.
   */
  async prepare(casts: readonly Cast[]): Promise<void> {
    if (!this.people) return;
    const people = this.people.manifest.people;
    const ids = new Set(casts.flatMap((cast) => [...castPool(people, cast), ...castPool(people, cast, { withAdult: true })].map((p) => p.id)));
    await Promise.all([...ids].map((id) => this.person(id)));
  }

  /**
   * Who plays the `index`-th person of a cast (consecutive indices give different people). The
   * person is loaded the first time they are wanted; until then a loaded person of the same cast
   * stands in (or the player's model when none is). Uniforms tint stand-ins only (`uniformFor`).
   */
  look(cast: Cast, index: number, options: CastOptions = {}): PersonLook & { readonly wanted: string | null } {
    const pool = this.people ? castPool(this.people.manifest.people, cast, options) : [];
    const wanted = pickPerson(pool, index);
    if (!wanted) return { person: null, tint: uniformFor(null, cast), wanted: null };
    if (this.loaded.has(wanted.id)) return { person: wanted.id, tint: uniformFor(wanted, cast), wanted: wanted.id };
    void this.person(wanted.id);
    const stand = pickPerson(
      pool.filter((p) => this.loaded.has(p.id)),
      index,
    );
    return { person: stand?.id ?? null, tint: uniformFor(stand, cast), wanted: wanted.id };
  }

  /** True once this person's models are loaded (always true for null, the player's model). */
  isLoaded(person: string | null): boolean {
    return person === null || this.loaded.has(person);
  }

  /** Load one person (once); null when the manifest has no such person or the file fails. */
  private person(id: string): Promise<Character | null> {
    let pending = this.loading.get(id);
    if (!pending) {
      pending = this.loadPerson(id).catch((error: unknown) => {
        console.warn(`Person ${id} could not be loaded; another stands in.`, error);
        return null;
      });
      this.loading.set(id, pending);
    }
    return pending;
  }

  private async loadPerson(id: string): Promise<Character | null> {
    const entry = this.byId.get(id);
    const files = this.people?.files;
    if (!entry || !files) return null;
    const file = files[entry.file];
    if (!file) throw new Error(`no file ${entry.file}`);
    const lodFile = entry.lod1 ? files[entry.lod1] : undefined;
    const [gltf, lod] = await Promise.all([this.loader.loadAsync(await file()), lodFile ? this.loader.loadAsync(await lodFile()) : Promise.resolve(null)]);
    const character = this.prepareCharacter(id, gltf.scene, entry.heightM, lod?.scene ?? null);
    this.loaded.set(id, character);
    return character;
  }

  /** Bone names, blend shapes, clips (shared per skeleton), height and ground fit, stride and LOD1 for a loaded model. */
  private prepareCharacter(id: string | null, scene: THREE.Object3D, heightM: number | null, lodScene: THREE.Object3D | null): Character {
    // `mixamorig:Hips`, `mixamorigHips` and `Hips` all become `Hips` (poses look bones up by name).
    normalizeBoneNames(scene);
    // Facial blend shapes are never used; dropping them avoids their GPU textures.
    const strip = (root: THREE.Object3D) =>
      root.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        node.geometry.morphAttributes = {};
        node.morphTargetInfluences = [];
        node.morphTargetDictionary = {};
      });
    strip(scene);
    // Both skeletons are compared in rest pose, before anything is scaled or turned; each new
    // skeleton gets a fresh copy of the clip skeleton, as sampling leaves it posed.
    const key = skeletonKey(scene);
    let clips = this.clipCache.get(key);
    if (!clips) {
      clips = retargetClips(cloneSkinned(this.animations.scene), this.animations.animations, scene);
      plantSoles(scene, clips);
      this.clipCache.set(key, clips);
    }
    const measured = measure(scene);
    const size = measured.high - measured.low;
    // The player is PLAYER_HEIGHT tall. People are drawn at their manifest height; without one,
    // at their own size when it is a person's height in metres (MPFB exports metres).
    const own = size > 0.8 && size < 2.2 ? 1 : PLAYER_HEIGHT / Math.max(0.01, size);
    const { scale, lift } = id === null ? fitHeight(measured, PLAYER_HEIGHT, 1, measured.sole) : fitHeight(measured, heightM, own, measured.sole);
    const hips = scene.getObjectByName("Hips");
    const hip = hips ? (hips.getWorldPosition(new THREE.Vector3()).y - measured.low) * scale : 0.53 * size * scale;
    let lod1: LodPart[] | null = null;
    if (lodScene) {
      normalizeBoneNames(lodScene);
      strip(lodScene);
      lod1 = skinnedMeshes(lodScene).map((mesh) => lodPart(mesh, mesh.geometry));
    } else {
      lod1 = simplifiedLod(scene);
    }
    const detailed = skinnedMeshes(scene).reduce((sum, mesh) => sum + trianglesOf(mesh.geometry), 0);
    const cheap = lod1.reduce((sum, part) => sum + trianglesOf(part.geometry), 0);
    // The player is the reference: its stride is 1 (`strideScale`).
    const stride = id === null ? 1 : strideScale(hip, this.player.hip);
    return { id, model: scene, clips, scale, lift, stride, hip, lod1: lod1.length > 0 ? lod1 : null, triangles: [detailed, cheap] };
  }

  /**
   * A new figure.
   * @param tint multiplies the clothing colour (`isClothing`: the RPM outfit meshes, or the `Outfit` material)
   * @param background a cheaper copy for pedestrians
   * @param person who (a manifest id from `look`); null or not yet loaded: the player's model
   */
  create(tint?: number, background = false, person: string | null = null): HumanFigure {
    const loaded = person ? this.loaded.get(person) : undefined;
    if (person && !loaded) void this.person(person);
    const character = loaded ?? this.player;
    const copy = cloneSkinned(character.model);
    for (const mesh of skinnedMeshes(copy)) mesh.userData.lod = 0;
    if (character.lod1) attachLod(copy, character.lod1);
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
      // One tinted copy per material, shared by the detailed and the cheap model.
      const tinted = new Map<THREE.Material, THREE.MeshStandardMaterial>();
      copy.traverse((node) => {
        if (!(node instanceof THREE.Mesh) || !isClothing(node)) return;
        const material = node.material as THREE.MeshStandardMaterial;
        let own = tinted.get(material);
        if (!own) {
          // The player's model has white-ish garments of its own (multiplying works); a
          // manifest person's outfit is one atlas of coloured garments, so it is dyed instead.
          own = character.id === null ? material.clone() : dyed(material, color);
          if (character.id === null) own.color.multiply(color);
          tinted.set(material, own);
        }
        node.material = own;
      });
    }
    return new HumanFigure(copy, character.clips, character.scale, character.lift, { stride: character.stride, person: character.id });
  }

  private readonly seatedTemplates = new Map<string, THREE.Group>();
  private readonly poseIds = new Map<RidingPose, number>();

  /**
   * A seated person as plain meshes (no skeleton): the riding pose baked once per pose, person
   * and clothing tint, then shared by every copy. For drivers and riders of AI traffic: much
   * cheaper than an animated figure, and a seated driver doesn't move. Baked from the person's
   * cheap model (LOD1) when there is one: they sit inside a vehicle and are seen small. Root at
   * the hip joints (like a seated `HumanFigure`), facing like `create`.
   */
  seatedStatic(tint: number | undefined, pose: RidingPose, person: string | null = null): THREE.Group {
    let poseId = this.poseIds.get(pose);
    if (poseId === undefined) {
      poseId = this.poseIds.size;
      this.poseIds.set(pose, poseId);
    }
    const who = person && this.loaded.has(person) ? person : null;
    if (person && !who) void this.person(person);
    const key = `${poseId}:${who ?? "player"}:${tint ?? "-"}`;
    let template = this.seatedTemplates.get(key);
    if (!template) {
      const figure = this.create(tint, true, who);
      figure.setSeated(pose);
      figure.object.updateMatrixWorld(true);
      const toRoot = figure.object.matrixWorld.clone().invert();
      template = new THREE.Group();
      template.name = "seated-person";
      const v = new THREE.Vector3();
      const all = skinnedMeshes(figure.object);
      const level = all.some((m) => m.userData.lod === 1) ? 1 : 0;
      for (const node of all.filter((m) => (m.userData.lod ?? 0) === level)) {
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
      this.seatedTemplates.set(key, template);
    }
    // Copies share geometry and materials with the template.
    return template.clone(true);
  }
}

export class HumanFigure {
  /** Root, positioned at the figure's feet by the game. */
  readonly object = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  /**
   * Keep the soles from sinking below the ground in every pose, not only during blends (set for
   * the player, seen up close). Each clip is planted at load (`plantSoles`), but a blend between two clips (starting,
   * stopping, a bump) is not: for its 0.22 s a sole sank up to 8 cm. After the clips are applied,
   * the hips are raised by however far the lowest sole vertex is below the ground.
   */
  plantsFeet = false;
  /** Seconds left of the blend between two gaits: every detailed figure is planted while it lasts. */
  private blending = 0;
  private readonly soleVertices: Array<Array<{ mesh: THREE.SkinnedMesh; index: number }> | null> = [null, null];
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

  /** The manifest person this figure is (`HumanAssets.look`), or null for the player's model. */
  readonly person: string | null;
  /** Stride length relative to the player's: the clips play faster for shorter legs. */
  private readonly stride: number;
  /** The detailed (0) and cheap (1) meshes, and whether each casts a shadow when shown. */
  private readonly levels: ReadonlyArray<ReadonlyArray<{ readonly mesh: THREE.Mesh; readonly shadow: boolean }>>;
  private level: 0 | 1 = 0;

  /** The hips and their rest position: the clips raise and lower them, seated poses start from rest. */
  private readonly hipsRest: { readonly bone: THREE.Object3D; readonly position: THREE.Vector3 } | null;

  /** @internal Use `HumanAssets.create`. */
  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[], scale: number, lift: number, options: { stride?: number; person?: string | null } = {}) {
    this.stride = options.stride ?? 1;
    this.person = options.person ?? null;
    // Capture the rest pose (for riding poses) while the model is still unscaled and unturned.
    this.rig = captureRig(model);
    this.restRotations = this.rig.bones.map(({ bone }) => ({ bone, quaternion: bone.quaternion.clone() }));
    const hips = model.getObjectByName("Hips");
    this.hipsRest = hips ? { bone: hips, position: hips.position.clone() } : null;
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
    const levels: Array<Array<{ mesh: THREE.Mesh; shadow: boolean }>> = [[], []];
    model.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.castShadow = node.userData.noShadow !== true && node.userData.lod !== 1;
      // A skinned mesh's bounds don't follow its bones; never cull a figure.
      node.frustumCulled = false;
      if (node instanceof THREE.SkinnedMesh) levels[node.userData.lod === 1 ? 1 : 0]!.push({ mesh: node, shadow: node.castShadow });
    });
    this.levels = levels;
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
      // Own copies, so other figures made from the same model keep their colours; one per
      // material, shared by the detailed and the cheap model.
      const own = new Map<THREE.Material, THREE.MeshStandardMaterial>();
      this.object.traverse((node) => {
        if (!(node instanceof THREE.Mesh) || !isClothing(node) || !(node.material instanceof THREE.MeshStandardMaterial)) return;
        let material = own.get(node.material);
        if (!material) {
          material = node.material.clone();
          own.set(node.material, material);
          clothes.push({ material, base: material.color.clone() });
        }
        node.material = material;
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
      this.hipsRest?.bone.position.copy(this.hipsRest.position);
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

  /** This figure's walking pace for one cycle of the walk clip, m/s (the clip speed scaled by its stride). */
  get walkSpeed(): number {
    return WALK_CLIP_SPEED * this.stride;
  }

  /** The model shown: 0 detailed, 1 the cheap distant one. */
  get detail(): 0 | 1 {
    return this.level;
  }

  /** True when the figure has a cheap model to switch to. */
  get hasLod(): boolean {
    return (this.levels[1]?.length ?? 0) > 0;
  }

  /**
   * Show the detailed (0) or the cheap (1) model (`detailFor` picks by distance). Without a
   * cheap model the detailed one stays. Far figures cast no shadow either way.
   */
  setDetail(level: 0 | 1): void {
    if (level === this.level) return;
    this.level = level;
    const cheap = level === 1 && this.hasLod;
    for (const { mesh, shadow } of this.levels[0]!) {
      mesh.visible = !cheap;
      mesh.castShadow = shadow && level === 0;
    }
    for (const { mesh } of this.levels[1]!) mesh.visible = cheap;
  }

  /**
   * Height of the figure's lowest vertex above its root, metres, in the current pose (the soles:
   * about 0 when standing or walking on the ground). For tests; it reads every vertex.
   */
  /** The vertices of the soles of the model shown: foot vertices in the lower part of the foot (bind pose). */
  private soles(): Array<{ mesh: THREE.SkinnedMesh; index: number }> {
    const level = this.level === 1 && this.hasLod ? 1 : 0;
    const known = this.soleVertices[level];
    if (known) return known;
    const feet: Array<{ mesh: THREE.SkinnedMesh; index: number; y: number }> = [];
    for (const { mesh } of this.levels[level]!) {
      if (!(mesh instanceof THREE.SkinnedMesh)) continue;
      const index = mesh.geometry.getAttribute("skinIndex");
      const weight = mesh.geometry.getAttribute("skinWeight");
      const position = mesh.geometry.getAttribute("position");
      if (!index || !weight || !position) continue;
      for (let i = 0; i < index.count; i++) {
        let best = 0;
        for (let k = 1; k < 4; k++) if (weight.getComponent(i, k) > weight.getComponent(i, best)) best = k;
        const bone = mesh.skeleton.bones[index.getComponent(i, best)];
        if (bone && FOOT_BONES.test(bone.name)) feet.push({ mesh, index: i, y: position.getY(i) });
      }
    }
    const floor = Math.min(...feet.map((f) => f.y));
    const top = Math.max(...feet.map((f) => f.y));
    const sole = feet.filter((f) => f.y < floor + (top - floor) * 0.45).map(({ mesh, index }) => ({ mesh, index }));
    this.soleVertices[level] = sole;
    return sole;
  }

  private keepSolesUp(): void {
    const hips = this.hipsRest?.bone;
    if (!hips?.parent) return;
    this.object.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    let low = Infinity;
    for (const { mesh, index } of this.soles()) {
      mesh.getVertexPosition(index, v);
      mesh.localToWorld(v);
      if (v.y < low) low = v.y;
    }
    const sink = this.object.getWorldPosition(v).y - low;
    if (!(sink > 0.002)) return;
    // The same world-space lift, expressed in the hips' parent space (scaled, turned).
    const at = hips.getWorldPosition(new THREE.Vector3());
    const from = hips.parent.worldToLocal(at.clone());
    const to = hips.parent.worldToLocal(at.add(new THREE.Vector3(0, sink, 0)));
    hips.position.add(to.sub(from));
  }

  feetHeight(): number {
    this.object.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    let low = Infinity;
    for (const { mesh } of this.levels[this.level === 1 && this.hasLod ? 1 : 0]!) {
      if (!(mesh instanceof THREE.SkinnedMesh)) continue;
      const count = mesh.geometry.getAttribute("position").count;
      for (let i = 0; i < count; i += 2) {
        mesh.getVertexPosition(i, v);
        mesh.localToWorld(v);
        if (v.y < low) low = v.y;
      }
    }
    return low - this.object.getWorldPosition(v).y;
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
      this.blending = 0.25;
    }
    // Play the clip at the rate that keeps feet from sliding; slower in the air.
    const air = grounded ? 1 : 0.55;
    this.actions.walk.timeScale = Math.max(0.6, speed / (WALK_CLIP_SPEED * this.stride)) * air;
    this.actions.run.timeScale = Math.max(0.7, speed / (RUN_CLIP_SPEED * this.stride)) * air;
    this.mixer.update(dt);

    // Each clip is planted at load; a blend of two is not (a sole sank up to 8 cm). The player is
    // always planted; everyone else only during a blend, which is brief.
    this.blending = Math.max(0, this.blending - dt);
    if (this.plantsFeet || this.blending > 0) this.keepSolesUp();
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
