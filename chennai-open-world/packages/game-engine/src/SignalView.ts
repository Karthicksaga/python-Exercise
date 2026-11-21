/**
 * Traffic signals and zebra crossings, drawn cheaply: one instanced mesh each for the poles,
 * the signal heads, the lamps, and the road paint (zebra stripes and stop lines). Lamp colours
 * are per-instance colours and are rewritten only when a light changes.
 *
 * Takes plain data, so it doesn't depend on where the signal logic lives.
 */
import * as THREE from "three";

/** One signal head, standing on the kerb at a stop line, facing the traffic it controls. */
export interface SignalHeadPlace {
  /** The stop line's point on the road's centre line. */
  readonly x: number;
  readonly z: number;
  /** Unit direction of the traffic it controls. */
  readonly dx: number;
  readonly dz: number;
  /** Width of the road, metres. */
  readonly width: number;
}

export interface ZebraPlace {
  readonly x: number;
  readonly z: number;
  /** Unit direction along the road. */
  readonly dx: number;
  readonly dz: number;
  /** Along the road, metres. */
  readonly depth: number;
  /** Across the road, metres. */
  readonly span: number;
}

/** 0 green, 1 amber, 2 red. */
export type LampState = 0 | 1 | 2;

const POLE_HEIGHT = 3.1;
const HEAD = { w: 0.34, h: 0.95, d: 0.24 } as const;
const LAMP_RADIUS = 0.11;
/** Paint sits just above the road surface and its centre-line dashes. */
const PAINT_Y = 0.085;
const STRIPE_WIDTH = 0.5;
const STRIPE_PITCH = 1;

// Lamp colours: lit and unlit, bottom (green) to top (red).
const LIT = [new THREE.Color(0x2bff6a), new THREE.Color(0xffb21a), new THREE.Color(0xff2a1a)];
const DIM = [new THREE.Color(0x0c2a14), new THREE.Color(0x2e230a), new THREE.Color(0x2e0d0a)];

export class SignalView {
  readonly object = new THREE.Group();
  private readonly lamps: THREE.InstancedMesh | null = null;
  private readonly shown: Int8Array;
  private readonly meshes: THREE.InstancedMesh[] = [];

  constructor(heads: readonly SignalHeadPlace[], zebras: readonly ZebraPlace[]) {
    this.object.name = "signals";
    this.shown = new Int8Array(heads.length).fill(-1);
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const at = new THREE.Vector3();

    if (heads.length > 0) {
      const metal = new THREE.MeshStandardMaterial({ color: 0x2c3034, roughness: 0.6, metalness: 0.5 });
      const housing = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.7 });
      // Unlit, so they glow at night and read from a distance.
      const glass = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, POLE_HEIGHT, 6).translate(0, POLE_HEIGHT / 2, 0), metal, heads.length);
      const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(HEAD.w, HEAD.h, HEAD.d), housing, heads.length);
      // Lamps face +Z, which each head's rotation turns towards its traffic.
      const lamps = new THREE.InstancedMesh(new THREE.CircleGeometry(LAMP_RADIUS, 10), glass, heads.length * 3);
      const headY = POLE_HEIGHT + HEAD.h / 2 - 0.1;
      const lampOffset = new THREE.Vector3();
      heads.forEach((head, i) => {
        // On the left kerb (India drives on the left), at the stop line.
        const side = head.width / 2 + 0.7;
        const px = head.x + head.dz * side;
        const pz = head.z - head.dx * side;
        // Face back down the road towards approaching drivers.
        rotation.setFromAxisAngle(up, Math.atan2(-head.dx, -head.dz));
        poles.setMatrixAt(i, matrix.compose(at.set(px, 0, pz), rotation, one));
        boxes.setMatrixAt(i, matrix.compose(at.set(px, headY, pz), rotation, one));
        for (let k = 0; k < 3; k++) {
          lampOffset.set(0, (k - 1) * 0.29, HEAD.d / 2 + 0.005).applyQuaternion(rotation);
          lamps.setMatrixAt(i * 3 + k, matrix.compose(at.set(px + lampOffset.x, headY + lampOffset.y, pz + lampOffset.z), rotation, one));
          lamps.setColorAt(i * 3 + k, DIM[k]!);
        }
      });
      for (const mesh of [poles, boxes, lamps]) {
        mesh.computeBoundingSphere();
        this.meshes.push(mesh);
        this.object.add(mesh);
      }
      poles.castShadow = true;
      this.lamps = lamps;
    }

    // Road paint: zebra stripes across each crossing, and a stop line over the incoming lane.
    const paint: Array<{ x: number; z: number; angle: number; across: number; along: number }> = [];
    for (const zebra of zebras) {
      const angle = Math.atan2(zebra.dx, zebra.dz);
      const count = Math.max(1, Math.floor((zebra.span - 0.6) / STRIPE_PITCH));
      for (let k = 0; k < count; k++) {
        const t = (k - (count - 1) / 2) * STRIPE_PITCH;
        paint.push({ x: zebra.x + zebra.dz * t, z: zebra.z - zebra.dx * t, angle, across: STRIPE_WIDTH, along: zebra.depth });
      }
    }
    for (const head of heads) {
      // Covers the left half of the road, where traffic comes in.
      const t = head.width / 4;
      paint.push({ x: head.x + head.dz * t, z: head.z - head.dx * t, angle: Math.atan2(head.dx, head.dz), across: head.width / 2 - 0.3, along: 0.35 });
    }
    if (paint.length > 0) {
      const material = new THREE.MeshStandardMaterial({ color: 0xeeede4, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material, paint.length);
      const scale = new THREE.Vector3();
      paint.forEach((p, i) => {
        rotation.setFromAxisAngle(up, p.angle);
        mesh.setMatrixAt(i, matrix.compose(at.set(p.x, PAINT_Y, p.z), rotation, scale.set(p.across, 1, p.along)));
      });
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.meshes.push(mesh);
      this.object.add(mesh);
    }
  }

  /** Number of signal heads drawn. */
  get headCount(): number {
    return this.shown.length;
  }

  /** Light the lamps. `state(i)` is what head `i` shows; only changed heads are rewritten. */
  update(state: (head: number) => LampState): void {
    const { lamps } = this;
    if (!lamps) return;
    let changed = false;
    for (let i = 0; i < this.shown.length; i++) {
      const s = state(i);
      if (s === this.shown[i]) continue;
      this.shown[i] = s;
      for (let k = 0; k < 3; k++) lamps.setColorAt(i * 3 + k, k === s ? LIT[k]! : DIM[k]!);
      changed = true;
    }
    if (changed && lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
    this.object.clear();
  }
}
