/**
 * Landmark models, always loaded because they are seen from far away, and where their name
 * labels go on screen.
 *
 * Anna Nagar Tower is an original procedural model inspired by the real tower's general form:
 * a slender concrete tower on a stepped plinth, a ground-floor drum, a row of stacked circular
 * viewing levels with parapets and railings, and a canopy with a finial on top. Proportions come
 * from `towerProfile` (shared with the collision), so what you see is what you bump into. One
 * merged mesh per landmark with one shared vertex-coloured material; about 6k triangles.
 * Colours are invented (cream and white with a muted terracotta accent).
 *
 * Kapaleeshwarar Temple's gopuram is likewise original and procedural, built from
 * `gopuramProfile` (shared with the collision; every proportion estimated): a grey stone base
 * with the open passage running east-west, tapering tiers of painted stucco (a different
 * invented colour per tier) each with an overhanging ledge and a row of pilasters and niches,
 * a barrel-vaulted crown and a row of gold finials (kalasams). Broad faces look east and west.
 * Same merged-mesh, one-material scheme as the tower.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { gopuramProfile, towerProfile, type GopuramProfile, type Landmark, type TowerProfile } from "@cow/game-world";

const SEGMENTS = 24; // matches the collision prisms in `landmarkSolids`
const COLOR = {
  plinth: 0xd9d0bf,
  step: 0xcfc5b2,
  cream: 0xf0e7d2,
  white: 0xf8f5ec,
  accent: 0xa9654f,
  opening: 0x3b3a38,
  rail: 0x7d7a72,
} as const;

/** Invented gopuram colours: granite base, a stucco colour and a trim colour per tier, gold finials. */
const TEMPLE = {
  stone: 0x9a968c,
  stoneDark: 0x7d796f,
  stoneLight: 0xb2ada1,
  shadow: 0x2f2b27,
  ledge: 0xf3ead6,
  gold: 0xd9a531,
  vault: 0xc8553d,
  /** [body, pilasters] per tier, bottom first; repeats if there are more tiers. */
  tiers: [
    [0xe0b25a, 0xf4e3b8],
    [0x5f9fb8, 0xe9f0f0],
    [0xc96f5a, 0xf3d7bf],
    [0x7fae6e, 0xf0eccd],
    [0xd88fa0, 0xf6e6e0],
    [0x4f8f8a, 0xf2e2b0],
    [0xe7c27a, 0xc96f5a],
  ],
} as const;

/** Where a landmark's name goes on screen. Structurally matches `LandmarkLabelPlacement` in `@cow/ui`. */
export interface LandmarkPlacement {
  readonly id: string;
  /** Normalised device coordinates, -1..1, +y up. */
  x: number;
  y: number;
  /** Metres from the given point on the ground. */
  distance: number;
  /** In front of the camera and on screen. */
  inView: boolean;
}

let sharedMaterial: THREE.MeshStandardMaterial | null = null;
const material = () => (sharedMaterial ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }));

/** Collects tinted, placed primitives and merges them into one geometry. */
class Parts {
  private readonly list: THREE.BufferGeometry[] = [];
  private readonly tint = new THREE.Color();
  private readonly matrix = new THREE.Matrix4();
  private readonly turn = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly one = new THREE.Vector3(1, 1, 1);

  add(geometry: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, yaw = 0): void {
    this.turn.setFromAxisAngle(this.up, yaw);
    geometry.applyMatrix4(this.matrix.compose(new THREE.Vector3(x, y, z), this.turn, this.one));
    // Vertex colours are linear; `setHex` converts from sRGB.
    this.tint.setHex(color);
    const count = geometry.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([this.tint.r, this.tint.g, this.tint.b], i * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.list.push(geometry);
  }

  /** A cylinder (or frustum) standing on `bottom`. */
  drum(radius: number, bottom: number, top: number, color: number, open = false, topRadius = radius, sides = SEGMENTS): void {
    this.add(new THREE.CylinderGeometry(topRadius, radius, top - bottom, sides, 1, open), color, 0, (bottom + top) / 2, 0);
  }

  /** `count` copies of a primitive spaced evenly round a circle, each turned to face outwards. */
  around(count: number, radius: number, make: () => THREE.BufferGeometry, color: number, y: number, offset = 0): void {
    for (let i = 0; i < count; i++) {
      const angle = offset + (i / count) * Math.PI * 2;
      this.add(make(), color, Math.cos(angle) * radius, y, Math.sin(angle) * radius, Math.PI / 2 - angle);
    }
  }

  merge(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.list, false);
    for (const geometry of this.list) geometry.dispose();
    if (!merged) throw new Error("Landmark model has no parts.");
    merged.computeBoundingSphere();
    return merged;
  }
}

function towerGeometry(profile: TowerProfile): THREE.BufferGeometry {
  const parts = new Parts();
  const { steps, drum, shaft, levels, canopy, height } = profile;

  // Plinth: low steps all the way round, each one walkable.
  steps.forEach((step, i) => parts.drum(step.radius, 0, step.top, i % 2 ? COLOR.step : COLOR.plinth));
  const plinthTop = steps[steps.length - 1]!.top;

  // Ground-floor drum with four doorways and an accent band under its roof.
  parts.drum(drum.radius, plinthTop, drum.top, COLOR.cream);
  parts.drum(drum.radius + 0.18, drum.top - 0.55, drum.top, COLOR.accent, true);
  parts.add(new THREE.CylinderGeometry(drum.radius + 0.4, drum.radius + 0.4, 0.22, SEGMENTS), COLOR.white, 0, drum.top + 0.11, 0);
  parts.around(4, drum.radius - 0.08, () => new THREE.BoxGeometry(1.5, 2.6, 0.3), COLOR.opening, plinthTop + 1.3, Math.PI / 4);

  // The shaft, tapering slightly, with three tall stair windows.
  parts.drum(shaft.radius, drum.top, canopy.bottom, COLOR.cream, true, shaft.radius * 0.9);
  const shaftHeight = canopy.bottom - drum.top - 2;
  parts.around(3, shaft.radius * 0.93, () => new THREE.BoxGeometry(0.45, shaftHeight, 0.25), COLOR.opening, drum.top + 1 + shaftHeight / 2, Math.PI / 6);

  // Slender columns from the drum to the canopy, carrying the balconies.
  const columnRadius = (levels[levels.length - 1]?.radius ?? shaft.radius + 1) - 0.45;
  parts.around(6, columnRadius, () => new THREE.CylinderGeometry(0.2, 0.2, canopy.bottom - drum.top, 6, 1, true), COLOR.white, (drum.top + canopy.bottom) / 2);

  // Viewing levels: a slab with an accent edge, a low parapet, posts and a top rail.
  for (const level of levels) {
    const r = level.radius;
    parts.drum(r, level.y - 0.28, level.y, COLOR.white);
    parts.drum(r + 0.03, level.y - 0.2, level.y - 0.06, COLOR.accent, true);
    parts.drum(r - 0.06, level.y, level.y + 0.45, COLOR.cream, true);
    parts.around(12, r - 0.06, () => new THREE.BoxGeometry(0.07, 0.55, 0.07), COLOR.rail, level.y + 0.72);
    parts.drum(r - 0.05, level.y + 0.98, level.y + 1.06, COLOR.rail, true);
  }

  // Canopy: an eave, a shallow dome, a small lantern and a finial reaching the full height.
  parts.drum(canopy.radius, canopy.bottom, canopy.bottom + 0.4, COLOR.white);
  parts.drum(canopy.radius + 0.05, canopy.bottom + 0.4, canopy.bottom + 0.62, COLOR.accent, true);
  const dome = new THREE.SphereGeometry(canopy.radius, SEGMENTS, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, (canopy.top - canopy.bottom - 0.62) / canopy.radius, 1);
  parts.add(dome, COLOR.accent, 0, canopy.bottom + 0.62, 0);
  parts.drum(0.9, canopy.top - 0.2, canopy.top + 0.5, COLOR.cream, false, 0.9, 12);
  parts.add(new THREE.ConeGeometry(0.32, height - canopy.top - 0.5, 8), COLOR.white, 0, (canopy.top + 0.5 + height) / 2, 0);

  return parts.merge();
}

/**
 * A box tapering from half-sizes (hx0, hz0) at its bottom to (hx1, hz1) at its top, standing
 * on y = 0. Faces stay flat (the box keeps separate vertices per face).
 */
function taperedBox(hx0: number, hx1: number, hz0: number, hz1: number, height: number): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const position = box.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const t = position.getY(i) + 0.5;
    position.setXYZ(i, Math.sign(position.getX(i)) * (hx0 + (hx1 - hx0) * t), t * height, Math.sign(position.getZ(i)) * (hz0 + (hz1 - hz0) * t));
  }
  box.computeVertexNormals();
  return box;
}

/** Outline of one finial (kalasam): radius against height, for a finial 1 m tall. */
const KALASAM: readonly THREE.Vector2[] = ([
  [0, 0],
  [0.32, 0.04],
  [0.4, 0.22],
  [0.3, 0.42],
  [0.12, 0.52],
  [0.2, 0.62],
  [0.06, 0.86],
  [0, 1],
] as const).map(([r, y]) => new THREE.Vector2(r, y));

/** `count` positions spread evenly across -half..half, keeping `margin` clear at each end. */
const spread = (count: number, half: number, margin: number): number[] =>
  Array.from({ length: count }, (_, i) => (count === 1 ? 0 : -half + margin + ((2 * (half - margin)) / (count - 1)) * i));

/**
 * The gopuram model, centred on the origin. Its bounds are exactly the profile's base footprint
 * and full height, and the passage through the base is left open.
 */
export function gopuramGeometry(profile: GopuramProfile): THREE.BufferGeometry {
  const parts = new Parts();
  const { base, passage, tiers, vault, finials, height } = profile;
  const hx = base.hx0;
  const hz = base.hz0;
  const pier = (hz - passage.half) / 2;
  const plinth = Math.min(0.7, base.top * 0.1);
  const cornice = Math.min(0.6, base.top * 0.08);
  const wall = base.top - plinth - cornice;

  // Stone base: two piers either side of the passage (a plinth course, a slightly recessed wall
  // with pilasters on the broad faces, a cornice) and the lintel over the passage.
  for (const side of [-1, 1]) {
    const z = side * (passage.half + pier);
    parts.add(new THREE.BoxGeometry(2 * hx, plinth, 2 * pier), TEMPLE.stoneDark, 0, plinth / 2, z);
    parts.add(new THREE.BoxGeometry(2 * hx - 0.4, wall, 2 * pier - 0.2), TEMPLE.stone, 0, plinth + wall / 2, z - side * 0.1);
    for (const face of [-1, 1]) {
      for (const offset of spread(3, pier, 0.6)) parts.add(new THREE.BoxGeometry(0.2, wall, 0.55), TEMPLE.stoneLight, face * (hx - 0.1), plinth + wall / 2, z + offset);
    }
  }
  parts.add(new THREE.BoxGeometry(2 * hx - 0.4, base.top - cornice - passage.top, 2 * passage.half), TEMPLE.stone, 0, (passage.top + base.top - cornice) / 2, 0);
  parts.add(new THREE.BoxGeometry(2 * hx, cornice, 2 * hz), TEMPLE.stoneLight, 0, base.top - cornice / 2, 0);
  // A dark band over each mouth of the passage, so it reads as an opening from afar.
  for (const face of [-1, 1]) parts.add(new THREE.BoxGeometry(0.12, 0.35, 2 * passage.half + 0.5), TEMPLE.shadow, face * (hx - 0.15), passage.top + 0.18, 0);

  // Tiers: painted stucco, an overhanging ledge on top, and on every face a row of pilasters
  // with dark niches between them, at mid-height where the sloping wall is half-way in.
  tiers.forEach((tier, i) => {
    const [body, trim] = TEMPLE.tiers[i % TEMPLE.tiers.length]!;
    const rise = tier.top - tier.bottom;
    const ledge = Math.min(0.35, rise * 0.12);
    parts.add(taperedBox(tier.hx0, tier.hx1, tier.hz0, tier.hz1, rise - ledge), body, 0, tier.bottom, 0);
    parts.add(new THREE.BoxGeometry(2 * tier.hx1 + 0.3, ledge, 2 * tier.hz1 + 0.3), TEMPLE.ledge, 0, tier.top - ledge / 2, 0);
    const midX = (tier.hx0 + tier.hx1) / 2;
    const midZ = (tier.hz0 + tier.hz1) / 2;
    const y = tier.bottom + (rise - ledge) / 2;
    const tall = (rise - ledge) * 0.6;
    const zs = spread(Math.max(3, Math.round(midZ / 1.3)), midZ, 0.5);
    const xs = spread(Math.max(2, Math.round(midX / 1.6)), midX, 0.5);
    for (const face of [-1, 1]) {
      zs.forEach((z, k) => {
        parts.add(new THREE.BoxGeometry(0.3, tall, 0.35), trim, face * midX, y, z);
        const next = zs[k + 1];
        if (next !== undefined) parts.add(new THREE.BoxGeometry(0.12, tall * 0.7, (next - z) * 0.45), TEMPLE.shadow, face * (midX + 0.02), y, (z + next) / 2);
      });
      for (const x of xs) parts.add(new THREE.BoxGeometry(0.35, tall, 0.3), trim, x, y, face * midZ);
    }
  });

  // Crown: a barrel vault along z (a half-cylinder with closed ends) with gold finials on its crest.
  const crown = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false, Math.PI / 2, Math.PI);
  crown.rotateX(Math.PI / 2);
  crown.scale(vault.hx, vault.top - vault.bottom, 2 * vault.hz);
  parts.add(crown, TEMPLE.vault, 0, vault.bottom, 0);
  const sink = 0.05;
  const finialHeight = height - vault.top + sink;
  for (const z of spread(finials, vault.hz, Math.min(1, vault.hz * 0.25))) {
    const pot = new THREE.LatheGeometry([...KALASAM], 8);
    pot.scale(finialHeight * 0.75, finialHeight, finialHeight * 0.75);
    parts.add(pot, TEMPLE.gold, 0, vault.top - sink, z);
  }

  const merged = parts.merge();
  merged.computeBoundingBox();
  return merged;
}

export class LandmarkView {
  readonly object = new THREE.Group();
  private readonly placements: LandmarkPlacement[];
  private readonly scratch = new THREE.Vector3();

  constructor(private readonly landmarks: readonly Landmark[]) {
    this.object.name = "landmarks";
    for (const landmark of landmarks) {
      // Beaches and districts are labels only. A temple is modelled when it has a footprint,
      // as its collision in `landmarkSolids` is.
      const geometry =
        landmark.kind === "tower"
          ? towerGeometry(towerProfile(landmark))
          : landmark.kind === "temple" && landmark.radius !== undefined
            ? gopuramGeometry(gopuramProfile(landmark))
            : null;
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, material());
      mesh.name = landmark.id;
      mesh.position.set(landmark.x, 0, landmark.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.object.add(mesh);
    }
    this.placements = landmarks.map((l) => ({ id: l.id, x: 0, y: 0, distance: Infinity, inView: false }));
  }

  /**
   * Where each landmark's label goes for this camera. The anchor rides about 5° above the
   * horizon on the landmark's axis (the follow camera looks down, so higher would leave the
   * screen), up to just above the top of a tall landmark when it is far away.
   * Reuses one array; read it before the next call.
   */
  place(camera: THREE.Camera, from: { readonly x: number; readonly z: number }): readonly LandmarkPlacement[] {
    this.landmarks.forEach((landmark, i) => {
      const placement = this.placements[i]!;
      const distance = Math.hypot(landmark.x - from.x, landmark.z - from.z);
      const top = (landmark.height ?? 4) + 3;
      const p = this.scratch.set(landmark.x, Math.min(top, 2 + distance * 0.09), landmark.z).project(camera);
      placement.x = p.x;
      placement.y = p.y;
      placement.distance = distance;
      placement.inView = p.z > -1 && p.z < 1 && Math.abs(p.x) < 1.02 && Math.abs(p.y) < 1.02;
    });
    return this.placements;
  }

  dispose(): void {
    for (const child of this.object.children) if (child instanceof THREE.Mesh) child.geometry.dispose();
    this.object.clear();
  }
}
