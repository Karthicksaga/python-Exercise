/**
 * Cheap people for crowds (railway platforms): a few of the city's people (`HumanAssets`) each
 * baked into a few still poses, standing and several moments of the walk cycle, each simplified
 * to under a thousand triangles and drawn instanced, so a platform crowd of thirty-odd is a
 * couple of dozen draw calls at most and about 30k triangles, where an animated figure
 * (`HumanFigure`) costs two to eight draw calls and 10–15k triangles. Walkers flip through the
 * walk poses by the distance they walk (each person by their own stride), so their feet keep
 * pace with the ground.
 *
 * Colours come from each model's own textures, sampled per vertex once; on the RPM model the
 * shirt is also tinted per person (the vertices of the outfit's top carry a tint weight).
 */
import { MeshoptSimplifier } from "meshoptimizer";
import * as THREE from "three";
import type { HumanAssets, HumanFigure } from "./HumanFigure";
import { simplifiedIndex } from "./simplify";

/** Moments of the walk cycle baked (more is smoother, each is one more draw call when used). */
export const WALK_FRAMES = 6;
/** Shirt colours, as for the city's pedestrians (`Population`). */
const SHIRTS = [0xffffff, 0x9fb8e0, 0xe0c29f, 0xa9d6a9, 0xd9a0a0, 0xc9c9c9, 0xe6dd9a, 0xb7a3d6];
/** Share of each part's triangles kept (the whole figure ends up under about 1k). */
const KEEP = 0.04;

/** One person to draw: feet position, heading (the game's yaw, 0 faces -Z), walking or not. */
export interface CrowdPlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  /** Metres walked so far (picks the walk pose), or null when standing still. */
  readonly walked: number | null;
  /** Picks the person (one of the crowd's) and, on the RPM model, the shirt colour. */
  readonly look: number;
  /** The stall seller (a person of their own), not one of the crowd. */
  readonly seller?: boolean;
}

/** Who a crowd is made of: manifest ids (null: the player's model), and the stall seller. */
export interface CrowdCast {
  readonly people: readonly (string | null)[];
  readonly seller?: string | null;
}

/** One baked person: a mesh per pose, the shirt colour per instance, and their stride. */
interface Baked {
  readonly meshes: THREE.InstancedMesh[];
  readonly shirts: THREE.InstancedBufferAttribute[];
  readonly stride: number;
}

export class CrowdFigures {
  readonly object = new THREE.Group();
  /** The crowd's people, then the seller (when there is one). */
  private readonly baked: Baked[];
  private readonly sellerIndex: number;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly shirt = new THREE.Color();
  private drawnCount = 0;
  private readonly triangles: number[];

  private constructor(
    people: ReadonlyArray<{ geometries: THREE.BufferGeometry[]; stride: number }>,
    hasSeller: boolean,
    readonly capacity: number,
  ) {
    const material = crowdMaterial();
    this.baked = people.map(({ geometries, stride }, p) => {
      const meshes = geometries.map((geometry, i) => {
        const mesh = new THREE.InstancedMesh(geometry, material, capacity);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.name = `${i === 0 ? "crowd-standing" : `crowd-walk-${i}`}-${p}`;
        this.object.add(mesh);
        return mesh;
      });
      const shirts = meshes.map((mesh) => {
        const attribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
        mesh.geometry.setAttribute("crowdShirt", attribute);
        return attribute;
      });
      return { meshes, shirts, stride };
    });
    this.sellerIndex = hasSeller ? this.baked.length - 1 : -1;
    this.triangles = this.baked.map((b) => (b.meshes[0]!.geometry.index?.count ?? 0) / 3);
    this.object.name = "crowd";
  }

  /**
   * Bake the poses of each person of the cast (a fraction of a second each, once).
   * @param cast who (default: the player's model only)
   */
  static async create(humans: HumanAssets, capacity = 48, cast: CrowdCast = { people: [null] }): Promise<CrowdFigures> {
    await MeshoptSimplifier.ready;
    const who = [...(cast.people.length > 0 ? cast.people : [null]), ...(cast.seller !== undefined ? [cast.seller] : [])];
    const people = who.map((person) => bake(humans.create(undefined, true, person)));
    return new CrowdFigures(people, cast.seller !== undefined, capacity);
  }

  /** People drawn last frame (for tests). */
  get drawn(): number {
    return this.drawnCount;
  }

  /** Triangles in one figure, the most of any person baked (for budgets). */
  get trianglesEach(): number {
    return Math.max(...this.triangles);
  }

  /** How many different people the crowd is made of (the seller included). */
  get peopleCount(): number {
    return this.baked.length;
  }

  /** Draw these people this frame (beyond `capacity` per pose and person they are left out). */
  place(people: readonly CrowdPlacement[]): void {
    const crowd = this.sellerIndex >= 0 ? this.baked.length - 1 : this.baked.length;
    const counts = this.baked.map((b) => b.meshes.map(() => 0));
    for (const person of people) {
      const who = person.seller && this.sellerIndex >= 0 ? this.sellerIndex : ((person.look % crowd) + crowd) % crowd;
      const baked = this.baked[who]!;
      let pose = 0;
      if (person.walked !== null) {
        const phase = (((person.walked / baked.stride) % 1) + 1) % 1;
        pose = 1 + (Math.floor(phase * WALK_FRAMES) % WALK_FRAMES);
      }
      const index = counts[who]![pose]!;
      if (index >= this.capacity) continue;
      counts[who]![pose] = index + 1;
      this.position.set(person.x, person.y, person.z);
      this.rotation.setFromAxisAngle(this.up, person.yaw);
      this.matrix.compose(this.position, this.rotation, this.scale);
      baked.meshes[pose]!.setMatrixAt(index, this.matrix);
      this.shirt.setHex(SHIRTS[person.look % SHIRTS.length]!);
      baked.shirts[pose]!.setXYZ(index, this.shirt.r, this.shirt.g, this.shirt.b);
    }
    this.drawnCount = 0;
    this.baked.forEach((baked, p) => {
      baked.meshes.forEach((mesh, i) => {
        mesh.count = counts[p]![i]!;
        mesh.visible = mesh.count > 0;
        mesh.instanceMatrix.needsUpdate = true;
        baked.shirts[i]!.needsUpdate = true;
        this.drawnCount += mesh.count;
      });
    });
  }

  dispose(): void {
    for (const baked of this.baked) for (const mesh of baked.meshes) mesh.geometry.dispose();
    (this.baked[0]?.meshes[0]?.material as THREE.Material | undefined)?.dispose();
  }
}

/** One person's poses: standing, then the walk cycle; and the ground one walk cycle covers. */
function bake(figure: HumanFigure): { geometries: THREE.BufferGeometry[]; stride: number } {
  // The simplified triangles are chosen once, on the standing pose, and reused for every pose:
  // all poses share the model's vertices, so the walk frames match the standing figure.
  const parts = skinnedParts(figure);
  figure.holdPose("idle", 0.3);
  figure.object.updateMatrixWorld(true);
  const toRoot = figure.object.matrixWorld.clone().invert();
  const rest = parts.map((part) => bakePositions(part, toRoot));
  const kept = parts.map((part, i) => simplifiedIndex(part.geometry, rest[i]!, KEEP));
  const colours = parts.map((part) => vertexColours(part));
  const geometries = [mergeParts(parts, rest, kept, colours)];
  let cycle = 1;
  for (let k = 0; k < WALK_FRAMES; k++) {
    cycle = figure.holdPose("walk", k / WALK_FRAMES);
    figure.object.updateMatrixWorld(true);
    geometries.push(mergeParts(parts, parts.map((part) => bakePositions(part, toRoot)), kept, colours));
  }
  return { geometries, stride: cycle * figure.walkSpeed };
}

/** Vertex-coloured, with the shirt tint mixed in by each vertex's tint weight. */
function crowdMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float crowdTint;\nattribute vec3 crowdShirt;")
      .replace("#include <color_vertex>", "#include <color_vertex>\n\tvColor.xyz *= mix(vec3(1.0), crowdShirt, crowdTint);");
  };
  material.customProgramCacheKey = () => "crowd-figures";
  return material;
}

function skinnedParts(figure: HumanFigure): THREE.SkinnedMesh[] {
  const parts: THREE.SkinnedMesh[] = [];
  figure.object.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh && !/Eye|Teeth/.test(node.name) && node.userData.lod !== 1) parts.push(node);
  });
  return parts;
}

/** Vertex positions of a skinned part in its current pose, in the figure's frame (feet at the origin). */
function bakePositions(part: THREE.SkinnedMesh, toRoot: THREE.Matrix4): Float32Array {
  const position = part.geometry.getAttribute("position");
  const out = new Float32Array(position.count * 3);
  const toFigure = toRoot.clone().multiply(part.matrixWorld);
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    part.applyBoneTransform(i, v);
    v.applyMatrix4(toFigure);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  return out;
}

/** Each vertex's colour: the material's colour times its texture at the vertex (a small copy of the texture is read once). */
function vertexColours(part: THREE.SkinnedMesh): Float32Array {
  const material = part.material as THREE.MeshStandardMaterial;
  const count = part.geometry.getAttribute("position").count;
  const out = new Float32Array(count * 3);
  const base = material.color ?? new THREE.Color(1, 1, 1);
  const pixels = texturePixels(material.map);
  const uv = part.geometry.getAttribute("uv");
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    c.copy(base);
    if (pixels && uv) {
      const u = ((uv.getX(i) % 1) + 1) % 1;
      const v = ((uv.getY(i) % 1) + 1) % 1;
      // glTF texture coordinates run from the top of the image (flipY is off).
      const x = Math.min(pixels.size - 1, Math.floor(u * pixels.size));
      const y = Math.min(pixels.size - 1, Math.floor(v * pixels.size));
      const k = (y * pixels.size + x) * 4;
      const sampled = new THREE.Color().setRGB(pixels.data[k]! / 255, pixels.data[k + 1]! / 255, pixels.data[k + 2]! / 255, THREE.SRGBColorSpace);
      c.multiply(sampled);
    }
    out[i * 3] = c.r;
    out[i * 3 + 1] = c.g;
    out[i * 3 + 2] = c.b;
  }
  return out;
}

const textureCache = new Map<string, { data: Uint8ClampedArray; size: number } | null>();

function texturePixels(texture: THREE.Texture | null): { data: Uint8ClampedArray; size: number } | null {
  if (!texture || typeof document === "undefined") return null;
  const cached = textureCache.get(texture.uuid);
  if (cached !== undefined) return cached;
  let result: { data: Uint8ClampedArray; size: number } | null = null;
  try {
    const image = texture.image as CanvasImageSource | undefined;
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (image && g) {
      g.drawImage(image, 0, 0, size, size);
      result = { data: g.getImageData(0, 0, size, size).data, size };
    }
  } catch {
    result = null;
  }
  textureCache.set(texture.uuid, result);
  return result;
}

/** One pose's geometry: every part's kept triangles, with colour and shirt-tint weight per vertex. */
function mergeParts(parts: THREE.SkinnedMesh[], positions: Float32Array[], kept: Uint32Array[], colours: Float32Array[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const tint: number[] = [];
  const index: number[] = [];
  parts.forEach((part, p) => {
    const shirt = /Outfit_Top/.test(part.name) ? 1 : 0;
    const used = new Map<number, number>();
    for (const v of kept[p]!) {
      let to = used.get(v);
      if (to === undefined) {
        to = pos.length / 3;
        used.set(v, to);
        pos.push(positions[p]![v * 3]!, positions[p]![v * 3 + 1]!, positions[p]![v * 3 + 2]!);
        col.push(colours[p]![v * 3]!, colours[p]![v * 3 + 1]!, colours[p]![v * 3 + 2]!);
        tint.push(shirt);
      }
      index.push(to);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geometry.setAttribute("crowdTint", new THREE.Float32BufferAttribute(tint, 1));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
