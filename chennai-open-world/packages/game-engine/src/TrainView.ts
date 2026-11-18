/**
 * Suburban trains as drawn: an original EMU-style coach built in code (body, window band,
 * doors, roof, underframe and bogies; the end coaches have a driving cab), in an invented
 * livery (cream with a teal band and a saffron line), not a real railway's. Every coach of
 * every train near the player is one instance of one of two meshes, so all trains together are
 * two draw calls, plus one for the turning wheelsets of the coaches close to the player. The
 * motor coaches (the middle ones) carry a pantograph up to the overhead wire.
 */
import * as THREE from "three";
import { MeshBuilder } from "./MeshBuilder";
import { RAIL_TOP, orientedBox } from "./RailView";

export const COACH_LENGTH = 20.5;
export const COACH_WIDTH = 3.2;
/** Top of the roof above the rails. */
export const COACH_HEIGHT = 3.9;
/** Most wheelsets drawn turning at once (four per coach: three trains near the player). */
const MAX_WHEELSETS = 48;

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
  // Underframe, and two bogies: side frames outside the wheels (the wheelsets are drawn turning,
  // `TrainView`), springs and a bolster under the body.
  orientedBox(b, 0, 0, 0, half - 0.6, w - 0.35, 0.75, 1.15, UNDER);
  for (const z of BOGIES) {
    for (const x of [-1.06, 1.06]) {
      orientedBox(b, x, z, 0, 1.45, 0.07, 0.32, 0.72, 0x1b1b1c);
      orientedBox(b, x, z, 0, 0.35, 0.09, 0.72, 0.8, 0x3a3a3c, "top-sides");
    }
    orientedBox(b, 0, z, 0, 0.3, 1.0, 0.62, 0.78, 0x1b1b1c);
  }
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
  if (!cab) pantograph(b, half - 4.5);
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

/** Bogie centres along a coach, and the axles either side of each (its own frame), metres. */
const BOGIES = [-COACH_LENGTH / 2 + 3, COACH_LENGTH / 2 - 3];
const AXLE_HALF = 1.1;
/** Wheel radius (a new EMU wheel is about 0.95 m across). */
export const WHEEL_RADIUS = 0.46;
/** Height of the pantograph's head above the rails, just touching the contact wire (`RailView`). */
export const PANTOGRAPH_TOP = 5.5;

/** A bar of square section `t` from p to q (pantograph arms). */
function bar(b: MeshBuilder, p: readonly [number, number, number], q: readonly [number, number, number], t: number, hex: number): void {
  const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  const along = d.clone().normalize();
  const side = new THREE.Vector3(1, 0, 0);
  if (Math.abs(along.dot(side)) > 0.9) side.set(0, 0, 1);
  const n1 = new THREE.Vector3().crossVectors(along, side).normalize().multiplyScalar(t / 2);
  const n2 = new THREE.Vector3().crossVectors(along, n1).normalize().multiplyScalar(t / 2);
  const c = new THREE.Color(hex);
  const corners = [n1.clone().add(n2), n1.clone().sub(n2), n1.clone().negate().sub(n2), n1.clone().negate().add(n2)];
  for (let k = 0; k < 4; k++) {
    const a = corners[k]!;
    const e = corners[(k + 1) % 4]!;
    const n = a.clone().add(e).normalize();
    const ids = [
      b.vertex(p[0] + a.x, p[1] + a.y, p[2] + a.z, n.x, n.y, n.z, 0.5, 0.5, c.r, c.g, c.b),
      b.vertex(p[0] + e.x, p[1] + e.y, p[2] + e.z, n.x, n.y, n.z, 0.5, 0.5, c.r, c.g, c.b),
      b.vertex(q[0] + e.x, q[1] + e.y, q[2] + e.z, n.x, n.y, n.z, 0.5, 0.5, c.r, c.g, c.b),
      b.vertex(q[0] + a.x, q[1] + a.y, q[2] + a.z, n.x, n.y, n.z, 0.5, 0.5, c.r, c.g, c.b),
    ];
    b.quad(ids[0]!, ids[1]!, ids[2]!, ids[3]!);
  }
}

/** A raised diamond-style pantograph on the roof at `z` (its own frame): base on insulators, two arms, the collector head. */
function pantograph(b: MeshBuilder, z: number): void {
  const roof = COACH_HEIGHT;
  const base = roof + 0.32;
  for (const x of [-0.55, 0.55]) for (const dz of [-0.6, 0.6]) orientedBox(b, x, z + dz, 0, 0.07, 0.07, roof - 0.02, base, 0x7b4a2c, "top-sides");
  orientedBox(b, 0, z, 0, 0.75, 0.62, base, base + 0.08, 0x3d4144);
  const knee = PANTOGRAPH_TOP - 0.62;
  const head = PANTOGRAPH_TOP - 0.06;
  for (const x of [-0.42, 0.42]) {
    bar(b, [x, base + 0.08, z - 0.7], [x * 0.7, knee, z + 0.55], 0.06, 0x8a8f93);
    bar(b, [x * 0.7, knee, z + 0.55], [x * 0.35, head, z - 0.1], 0.05, 0x8a8f93);
  }
  // Collector head: a bow across, with horns at its ends.
  orientedBox(b, 0, z - 0.1, 0, 0.08, 0.85, head, head + 0.06, 0x2b2b2b);
  for (const x of [-0.95, 0.95]) bar(b, [x * 0.9, head + 0.03, z - 0.1], [x * 1.08, head - 0.18, z - 0.1], 0.04, 0x2b2b2b);
}

/** A wheelset: axle and two wheels (each a 10-sided disc with a pale stripe, so its turning shows), around the X axis at the origin. */
function wheelsetGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const sides = 10;
  const r = WHEEL_RADIUS;
  const gauge = 1.676 / 2;
  const disc = (x0: number, x1: number, radius: number, hex: number) => {
    const c = new THREE.Color(hex);
    for (const [x, nx] of [[x0, -1], [x1, 1]] as const) {
      const centre = b.vertex(x, 0, 0, nx, 0, 0, 0.5, 0.5, c.r, c.g, c.b);
      const rim: number[] = [];
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        rim.push(b.vertex(x, Math.cos(a) * radius, Math.sin(a) * radius, nx, 0, 0, 0.5, 0.5, c.r, c.g, c.b));
      }
      for (let k = 0; k < sides; k++) {
        if (nx > 0) b.triangle(centre, rim[k]!, rim[(k + 1) % sides]!);
        else b.triangle(centre, rim[(k + 1) % sides]!, rim[k]!);
      }
    }
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2;
      const a1 = ((k + 1) / sides) * Math.PI * 2;
      const n0 = [Math.cos(a0), Math.sin(a0)] as const;
      const ids = [
        b.vertex(x0, n0[0] * radius, n0[1] * radius, 0, n0[0], n0[1], 0.5, 0.5, c.r * 0.8, c.g * 0.8, c.b * 0.8),
        b.vertex(x1, n0[0] * radius, n0[1] * radius, 0, n0[0], n0[1], 0.5, 0.5, c.r * 0.8, c.g * 0.8, c.b * 0.8),
        b.vertex(x1, Math.cos(a1) * radius, Math.sin(a1) * radius, 0, Math.cos(a1), Math.sin(a1), 0.5, 0.5, c.r * 0.8, c.g * 0.8, c.b * 0.8),
        b.vertex(x0, Math.cos(a1) * radius, Math.sin(a1) * radius, 0, Math.cos(a1), Math.sin(a1), 0.5, 0.5, c.r * 0.8, c.g * 0.8, c.b * 0.8),
      ];
      b.quad(ids[0]!, ids[1]!, ids[2]!, ids[3]!);
    }
  };
  for (const s of [-1, 1]) {
    disc(s > 0 ? gauge - 0.03 : -gauge - 0.11, s > 0 ? gauge + 0.11 : -gauge + 0.03, r, 0x3b3a38);
    // The stripe across the wheel's outer face.
    const x = s * (gauge + 0.115);
    orientedBox(b, x, 0, 0, r * 0.85, 0.008, -0.05, 0.05, 0xbdb7a8, "top-sides");
  }
  disc(-gauge, gauge, 0.09, 0x2a2a2a);
  const geometry = b.build();
  if (!geometry) throw new Error("Wheelset geometry is empty.");
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
  /** Metres the train has run (turns the wheels); without it the coach is drawn without turning wheelsets. */
  readonly roll?: number;
}

export class TrainView {
  readonly object = new THREE.Group();
  private readonly cabs: THREE.InstancedMesh;
  private readonly trailers: THREE.InstancedMesh;
  /** Turning wheelsets for the coaches close to the player (those placed with `roll`). */
  private readonly wheels: THREE.InstancedMesh;
  private readonly spin = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3(1, 0, 0);
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
    this.wheels = new THREE.InstancedMesh(wheelsetGeometry(), this.material, MAX_WHEELSETS);
    this.wheels.count = 0;
    this.wheels.frustumCulled = false;
    this.wheels.name = "wheelsets";
    this.object.add(this.wheels);
    this.object.name = "trains";
  }

  /** Wheelsets drawn now (for tests). */
  get wheelsets(): number {
    return this.wheels.count;
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
    // Wheelsets: four per coach placed with `roll`, turned by the distance run.
    let wheels = 0;
    for (const coach of coaches) {
      if (coach.roll === undefined) continue;
      const cos = Math.cos(coach.yaw);
      const sin = Math.sin(coach.yaw);
      this.rotation.setFromAxisAngle(this.up, coach.yaw);
      // Rolling towards the coach's front (-Z) turns the top of each wheel forwards. (A coach drawn
      // facing backwards, the trailing cab, is given a negative roll by the caller.)
      this.spin.setFromAxisAngle(this.axis, -coach.roll / WHEEL_RADIUS);
      const turn = this.rotation.clone().multiply(this.spin);
      for (const bogie of BOGIES) {
        for (const axle of [-AXLE_HALF, AXLE_HALF]) {
          if (wheels >= MAX_WHEELSETS) break;
          const z = bogie + axle;
          this.position.set(coach.x + z * sin, RAIL_TOP + WHEEL_RADIUS, coach.z + z * cos);
          this.matrix.compose(this.position, turn, this.scale);
          this.wheels.setMatrixAt(wheels++, this.matrix);
        }
      }
    }
    this.wheels.count = wheels;
    this.wheels.visible = wheels > 0;
    this.wheels.instanceMatrix.needsUpdate = true;
    this.cabs.count = cabs;
    this.trailers.count = trailers;
    this.cabs.instanceMatrix.needsUpdate = true;
    this.trailers.instanceMatrix.needsUpdate = true;
    this.cabs.visible = cabs > 0;
    this.trailers.visible = trailers > 0;
  }

  dispose(): void {
    this.wheels.geometry.dispose();
    this.cabs.geometry.dispose();
    this.trailers.geometry.dispose();
    this.material.dispose();
  }
}
