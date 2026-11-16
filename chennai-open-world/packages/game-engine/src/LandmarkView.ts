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
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { towerProfile, type Landmark, type TowerProfile } from "@cow/game-world";

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

export class LandmarkView {
  readonly object = new THREE.Group();
  private readonly placements: LandmarkPlacement[];
  private readonly scratch = new THREE.Vector3();

  constructor(private readonly landmarks: readonly Landmark[]) {
    this.object.name = "landmarks";
    for (const landmark of landmarks) {
      if (landmark.kind !== "tower") continue; // temples, beaches and districts are labels only for now
      const mesh = new THREE.Mesh(towerGeometry(towerProfile(landmark)), material());
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
