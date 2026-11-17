/**
 * Suburban trains as drawn: an original EMU-style coach built in code (body, window band,
 * doors, roof, underframe and bogies; the end coaches have a driving cab), in an invented
 * livery (cream with a teal band and a saffron line), not a real railway's. Every coach of
 * every train near the player is one instance of one of two meshes, so all trains together are
 * two draw calls.
 */
import * as THREE from "three";
import { MeshBuilder } from "./MeshBuilder";
import { RAIL_TOP, orientedBox } from "./RailView";

export const COACH_LENGTH = 20.5;
export const COACH_WIDTH = 3.2;
/** Top of the roof above the rails. */
export const COACH_HEIGHT = 3.9;

const CREAM = 0xe9e1c8;
const TEAL = 0x1f6f78;
const SAFFRON = 0xe98a1f;
const GLASS = 0x26323b;
const DOOR = 0x9fa7a8;
const ROOF = 0x8b9094;
const UNDER = 0x2c2c2e;

/** One coach, centred on the origin, length along Z, facing -Z (yaw 0). Heights above the rails. */
export function coachGeometry(cab: boolean): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const half = COACH_LENGTH / 2;
  const w = COACH_WIDTH / 2;
  const nose = cab ? 1.2 : 0;
  // Underframe and two bogies with their wheels' bulk.
  orientedBox(b, 0, 0, 0, half - 0.6, w - 0.35, 0.55, 1.15, UNDER);
  for (const z of [-half + 3, half - 3]) orientedBox(b, 0, z, 0, 1.4, w - 0.25, 0.0, 0.85, 0x1b1b1c);
  // Body: lower teal band, saffron line, cream sides with the window band, roof.
  const bodyHalf = half - nose / 2;
  const bodyZ = nose / 2;
  orientedBox(b, 0, bodyZ, 0, bodyHalf, w, 1.15, 1.75, TEAL);
  orientedBox(b, 0, bodyZ, 0, bodyHalf, w + 0.005, 1.75, 1.85, SAFFRON, "top-sides");
  orientedBox(b, 0, bodyZ, 0, bodyHalf, w, 1.85, 3.55, CREAM);
  orientedBox(b, 0, bodyZ, 0, bodyHalf - 0.2, w - 0.15, 3.55, COACH_HEIGHT, ROOF);
  // Windows: dark glass strips on both sides between the doors; doors as recessed grey panels.
  const doors = [-half + 4.2, 0, half - 4.2];
  for (const side of [-1, 1]) {
    const x = side * (w + 0.01);
    for (const z of doors) orientedBox(b, x, z + bodyZ * 0.2, 0, 0.75, 0.012, 1.25, 3.3, DOOR, "top-sides");
    for (let k = 0; k < doors.length - 1; k++) {
      const z0 = doors[k]! + 1.0;
      const z1 = doors[k + 1]! - 1.0;
      orientedBox(b, x, (z0 + z1) / 2, 0, (z1 - z0) / 2, 0.012, 2.3, 3.05, GLASS, "top-sides");
    }
  }
  if (cab) {
    // Driving cab: a slightly lower, raked nose with a windscreen and lamps.
    orientedBox(b, 0, -half + nose / 2, 0, nose / 2, w - 0.1, 1.15, 3.35, CREAM);
    orientedBox(b, 0, -half + nose / 2 - 0.01, 0, nose / 2, w - 0.12, 1.15, 1.75, TEAL);
    orientedBox(b, 0, -half - 0.01, 0, 0.012, w - 0.4, 2.3, 3.1, GLASS, "top-sides");
    for (const x of [-1.05, 1.05]) orientedBox(b, x, -half - 0.02, 0, 0.012, 0.18, 1.45, 1.65, 0xfff4c2, "top-sides");
    orientedBox(b, 0, -half - 0.02, 0, 0.012, 0.6, 3.15, 3.3, 0x111111, "top-sides");
  }
  const geometry = b.build();
  if (!geometry) throw new Error("Coach geometry is empty.");
  return geometry;
}

/**
 * The doorways along one side of a coach, as distances along its length (its own frame: -Z is
 * its front), matching the door panels drawn by `coachGeometry`. Door sills are 1.25 m above
 * the rails; each doorway is 1.5 m wide.
 */
export function coachDoorways(cab: boolean): number[] {
  const half = COACH_LENGTH / 2;
  const shift = cab ? 0.6 * 0.2 : 0;
  return [-half + 4.2 + shift, shift, half - 4.2 + shift];
}
export const DOOR_SILL = 1.25;
const DOOR_TOP = 3.3;
const DOOR_HALF = 0.75;

/**
 * Sliding doors for the coach nearest the player: per doorway a dark opening and two leaves that
 * slide apart along the outside of the body. All of them are instances of one box: one draw call.
 */
export class TrainDoors {
  readonly mesh: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly size = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 }), 9);
    const leaf = new THREE.Color(DOOR);
    const dark = new THREE.Color(0x101214);
    for (let i = 0; i < 9; i++) this.mesh.setColorAt(i, i < 3 ? dark : leaf);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.name = "train-doors";
  }

  /**
   * Draw the doors on one side of a coach, `amount` open (0 shut, 1 open), or hide them (null).
   * @param side 1 for the coach's right (+X in its frame), -1 for its left
   */
  place(coach: CoachPose | null, side: 1 | -1, amount: number): void {
    if (!coach) {
      this.mesh.count = 0;
      return;
    }
    const w = COACH_WIDTH / 2;
    const height = DOOR_TOP - DOOR_SILL;
    const y = RAIL_TOP + DOOR_SILL + height / 2;
    const slide = Math.min(1, Math.max(0, amount)) * DOOR_HALF * 0.95;
    this.rotation.setFromAxisAngle(this.up, coach.yaw);
    const cos = Math.cos(coach.yaw);
    const sin = Math.sin(coach.yaw);
    const put = (index: number, x: number, z: number, sx: number, sz: number) => {
      this.position.set(coach.x + x * cos + z * sin, y, coach.z - x * sin + z * cos);
      this.matrix.compose(this.position, this.rotation, this.size.set(sx, height, sz));
      this.mesh.setMatrixAt(index, this.matrix);
    };
    coachDoorways(coach.cab).forEach((z, k) => {
      // The opening sits over the painted door panel; the leaves just outside it.
      put(k, side * (w + 0.02), z, 0.008, DOOR_HALF * 2);
      put(3 + k * 2, side * (w + 0.05), z - DOOR_HALF / 2 - slide, 0.04, DOOR_HALF);
      put(4 + k * 2, side * (w + 0.05), z + DOOR_HALF / 2 + slide, 0.04, DOOR_HALF);
    });
    this.mesh.count = 9;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Where to draw one coach: its centre on the track, the way it faces, and whether it is a cab. */
export interface CoachPose {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly cab: boolean;
}

export class TrainView {
  readonly object = new THREE.Group();
  private readonly cabs: THREE.InstancedMesh;
  private readonly trailers: THREE.InstancedMesh;
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 });
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(readonly maxCoaches = 32) {
    this.cabs = new THREE.InstancedMesh(coachGeometry(true), this.material, maxCoaches);
    this.trailers = new THREE.InstancedMesh(coachGeometry(false), this.material, maxCoaches);
    for (const mesh of [this.cabs, this.trailers]) {
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.object.add(mesh);
    }
    this.object.name = "trains";
  }

  /** Draw these coaches this frame (extra ones beyond `maxCoaches` are left out). */
  place(coaches: readonly CoachPose[]): void {
    let cabs = 0;
    let trailers = 0;
    for (const coach of coaches) {
      const mesh = coach.cab ? this.cabs : this.trailers;
      const index = coach.cab ? cabs : trailers;
      if (index >= this.maxCoaches) continue;
      this.position.set(coach.x, RAIL_TOP, coach.z);
      this.rotation.setFromAxisAngle(this.up, coach.yaw);
      this.matrix.compose(this.position, this.rotation, this.scale);
      mesh.setMatrixAt(index, this.matrix);
      if (coach.cab) cabs++;
      else trailers++;
    }
    this.cabs.count = cabs;
    this.trailers.count = trailers;
    this.cabs.instanceMatrix.needsUpdate = true;
    this.trailers.instanceMatrix.needsUpdate = true;
    this.cabs.visible = cabs > 0;
    this.trailers.visible = trailers > 0;
  }

  dispose(): void {
    this.cabs.geometry.dispose();
    this.trailers.geometry.dispose();
    this.material.dispose();
  }
}
