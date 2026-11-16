/**
 * The auto-rickshaw body, built in code at real Chennai proportions (prototype reviewed as
 * `prototypes/auto-rickshaw.html`): 2.63 m long, 1.30 m wide, 1.71 m tall, a rounded nose with
 * twin headlamps, a raked windscreen, a black fabric canopy on steel hoops, open sides with a
 * grab rail, a driver's saddle and handlebar, a three-seat bench over the engine, and number
 * plates. The design is original: no maker's badge, grille or body lines are copied.
 *
 * Parts are built in a side-view frame (x forward, y up from the ground, z across) and baked into
 * the model's frame (facing -Z, chassis centre at the origin). They are grouped by role, so the
 * caller can merge each role into one mesh: a parked or traffic auto costs one draw call per role
 * plus its three wheels.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/** Which material a part uses. Vertex-coloured roles carry each part's colour in the geometry. */
export type AutoRole = "paint" | "trim" | "metal" | "glass" | "lamp" | "tail" | "plate";

export interface AutoParts {
  readonly parts: ReadonlyArray<{ readonly role: AutoRole; readonly geometry: THREE.BufferGeometry }>;
  /** Tyre, rim and hub of one wheel (axis along X, centred), vertex-coloured. */
  readonly wheel: THREE.BufferGeometry;
}

/** Dimensions in metres (typical Chennai three-wheeler; the model is built to them). */
export const AUTO_SIZE = { length: 2.63, width: 1.3, height: 1.71, wheelRadius: 0.24 } as const;

/** Model frame: the ground sits this far below the chassis centre (ride height plus settled suspension). */
const GROUND = -0.68;
/** Front axle in the side-view frame (x forward); the rear axle is at REAR_AXLE. Match `specs.ts`. */
const FRONT_AXLE = 1.0;
const REAR_AXLE = -0.8;

/** Colours (sRGB hex). Only `paint` and `band` change with the livery. */
const BLACK = 0x18191b;
const CANOPY = 0x1d1e20;
const SEAT = 0x242527;
const FLOOR = 0x2c2d2e;
const RUBBER = 0x161616;
const CHROME = 0xe6e8ea;
const STEEL = 0x8c9094;
const AMBER = 0xf08a00;

/** The band round the waist: green on a yellow auto, yellow on a green battery auto (TN rules). */
export function bandColour(paint: number): number {
  const c = new THREE.Color(paint);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return hsl.h > 0.2 && hsl.h < 0.5 ? 0xf2c200 : 0x1f7a3a;
}

function colour(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(hex);
  const n = g.getAttribute("position").count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) data.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(data, 3));
  return g;
}

/** Side profile in the XY plane, extruded across Z and centred. Points: [x, y] or a curve [cx, cy, x, y]. */
function profile(points: ReadonlyArray<readonly number[]>, depth: number, bevel: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(points[0]![0]!, points[0]![1]!);
  for (const p of points.slice(1)) {
    if (p.length === 4) s.quadraticCurveTo(p[0]!, p[1]!, p[2]!, p[3]!);
    else s.lineTo(p[0]!, p[1]!);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** A cylinder from a to b. */
function tube(a: readonly [number, number, number], b: readonly [number, number, number], radius: number, sides = 6): THREE.BufferGeometry {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(radius, radius, from.distanceTo(to), sides, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()));
  const mid = from.add(to).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);

/** Plate texture (yellow commercial plate; the number is not a real registration). Browser only. */
let plateTexture: THREE.Texture | null | undefined;
export function autoPlateTexture(): THREE.Texture | null {
  if (plateTexture !== undefined) return plateTexture;
  if (typeof document === "undefined") return (plateTexture = null);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 56;
  const g = canvas.getContext("2d");
  if (!g) return (plateTexture = null);
  g.fillStyle = "#f4c400";
  g.fillRect(0, 0, 256, 56);
  g.strokeStyle = "#111";
  g.lineWidth = 4;
  g.strokeRect(3, 3, 250, 50);
  g.fillStyle = "#111";
  g.font = "700 34px monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("TN 00 X 0000", 128, 30);
  plateTexture = new THREE.CanvasTexture(canvas);
  plateTexture.colorSpace = THREE.SRGBColorSpace;
  return plateTexture;
}

/** Build every part of an auto with the given paint colour. */
export function buildAutoParts(paint: number): AutoParts {
  const band = bandColour(paint);
  const parts: Array<{ role: AutoRole; geometry: THREE.BufferGeometry }> = [];
  const push = (role: AutoRole, geometry: THREE.BufferGeometry, hex?: number) => parts.push({ role, geometry: hex === undefined ? geometry : colour(geometry, hex) });
  const W = 1.24;

  // Nose and cowl: a rounded front shell.
  push("paint", profile([[0.74, 0.34], [1.04, 0.36, 1.18, 0.52], [1.27, 0.66, 1.26, 0.86], [1.25, 0.98, 1.12, 1.03], [0.96, 1.06], [0.84, 1.0, 0.8, 0.9], [0.74, 0.34]], W - 0.2, 0.035), paint);
  // Side skins with the passenger opening, the waist band and the engine vents.
  for (const side of [1, -1]) {
    push("paint", at(profile([[-1.31, 0.34], [-1.31, 1.02], [-1.3, 1.12, -1.18, 1.13], [-0.74, 1.12], [-0.6, 1.1, -0.6, 0.92], [-0.58, 0.68], [0.5, 0.66], [0.7, 0.66, 0.78, 0.86], [0.8, 0.98], [0.86, 0.36], [0.74, 0.34]], 0.03, 0.01), 0, 0, side * (W / 2)), paint);
    push("paint", at(new THREE.BoxGeometry(1.36, 0.075, 0.012), 0.08, 0.5, side * (W / 2 + 0.022)), band);
    push("paint", at(new THREE.BoxGeometry(0.56, 0.075, 0.012), -1.0, 0.5, side * (W / 2 + 0.022)), band);
    for (let i = 0; i < 5; i++) push("trim", at(new THREE.BoxGeometry(0.16, 0.018, 0.01), -1.08 + i * 0.03, 0.74 - i * 0.035, side * (W / 2 + 0.028)), BLACK);
  }
  // Rear tub over the engine, floor and bench base.
  push("paint", profile([[-1.32, 0.33], [-1.32, 1.0], [-1.31, 1.12, -1.18, 1.12], [-0.62, 1.12], [-0.6, 0.62], [-0.6, 0.33]], W - 0.1, 0.04), paint);
  push("trim", at(new THREE.BoxGeometry(1.36, 0.04, W - 0.04), 0.08, 0.36, 0), FLOOR);
  push("trim", at(new THREE.BoxGeometry(0.5, 0.36, W - 0.12), -0.82, 0.53, 0), FLOOR);

  // Windscreen, raked back, in a black frame.
  const rake = new THREE.Matrix4().makeRotationZ(0.32).premultiply(new THREE.Matrix4().makeTranslation(0.93, 1.06, 0));
  const screenH = 0.56;
  push("glass", new THREE.PlaneGeometry(W - 0.08, screenH).rotateY(Math.PI / 2).translate(0, screenH / 2, 0).applyMatrix4(rake));
  for (const z of [-1, 1]) push("trim", new THREE.BoxGeometry(0.04, screenH + 0.02, 0.04).translate(0, screenH / 2, z * (W / 2 - 0.04)).applyMatrix4(rake), BLACK);
  push("trim", new THREE.BoxGeometry(0.04, 0.04, W - 0.04).translate(0, screenH, 0).applyMatrix4(rake), BLACK);
  push("trim", new THREE.BoxGeometry(0.05, 0.05, W - 0.04).applyMatrix4(rake), BLACK);

  // Canopy: a fabric arch with a back panel (small rear window) and a roll at the front edge.
  {
    const hw = 0.665;
    const base = 1.22;
    const top = 1.71;
    const r = 0.22;
    const t = 0.025;
    const arch = new THREE.Shape();
    arch.moveTo(-hw, base);
    arch.lineTo(-hw, top - r);
    arch.quadraticCurveTo(-hw, top, -hw + r, top);
    arch.lineTo(hw - r, top);
    arch.quadraticCurveTo(hw, top, hw, top - r);
    arch.lineTo(hw, base);
    arch.lineTo(hw - t, base);
    arch.lineTo(hw - t, top - r);
    arch.quadraticCurveTo(hw - t, top - t, hw - r, top - t);
    arch.lineTo(-hw + r, top - t);
    arch.quadraticCurveTo(-hw + t, top - t, -hw + t, top - r);
    arch.lineTo(-hw + t, base);
    arch.closePath();
    push("trim", new THREE.ExtrudeGeometry(arch, { depth: 2.16, bevelEnabled: false, curveSegments: 6 }).rotateY(Math.PI / 2).translate(-1.3, 0, 0), CANOPY);
    const back = new THREE.Shape();
    back.moveTo(-hw, 1.08);
    back.lineTo(-hw, top - r);
    back.quadraticCurveTo(-hw, top, -hw + r, top);
    back.lineTo(hw - r, top);
    back.quadraticCurveTo(hw, top, hw, top - r);
    back.lineTo(hw, 1.08);
    back.closePath();
    const win = new THREE.Path();
    win.moveTo(-0.32, 1.34);
    win.lineTo(0.32, 1.34);
    win.lineTo(0.32, 1.55);
    win.lineTo(-0.32, 1.55);
    win.closePath();
    back.holes.push(win);
    // Both faces, so the back panel is seen from inside and out.
    const panel = new THREE.ShapeGeometry(back, 6).rotateY(Math.PI / 2);
    push("trim", panel.clone().translate(-1.305, 0, 0), CANOPY);
    push("trim", panel.rotateY(Math.PI).translate(-1.305, 0, 0), CANOPY);
    push("glass", new THREE.PlaneGeometry(0.64, 0.21).rotateY(Math.PI / 2).translate(-1.3, 1.445, 0));
    push("trim", new THREE.CylinderGeometry(0.035, 0.035, 1.26, 8).rotateX(Math.PI / 2).translate(0.86, 1.69, 0), CANOPY);
  }
  // Hoops, pillars and grab rails.
  for (const z of [1, -1]) {
    push("trim", tube([0.28, 0.72, z * 0.6], [0.26, 1.66, z * 0.64], 0.018), BLACK);
    push("trim", tube([-1.24, 1.1, z * 0.61], [-1.24, 1.66, z * 0.64], 0.018), BLACK);
    push("metal", tube([-0.58, 1.13, z * 0.63], [0.28, 1.13, z * 0.63], 0.014), CHROME);
  }

  // Seats.
  push("trim", at(new RoundedBoxGeometry(0.42, 0.1, 0.5, 2, 0.04), 0.46, 0.86, 0), SEAT);
  push("trim", new RoundedBoxGeometry(0.12, 0.42, 0.36, 2, 0.04).rotateZ(0.12).translate(0.32, 1.08, 0), SEAT);
  push("trim", at(new RoundedBoxGeometry(0.5, 0.11, W - 0.1, 2, 0.04), -0.82, 0.74, 0), SEAT);
  push("trim", new RoundedBoxGeometry(0.12, 0.44, W - 0.1, 2, 0.04).rotateZ(-0.15).translate(-1.12, 1.0, 0), SEAT);

  // Handlebar with grips, steering column, mirrors and the meter.
  push("metal", new THREE.CylinderGeometry(0.014, 0.014, 0.66, 6).rotateX(Math.PI / 2).translate(0.78, 1.15, 0), CHROME);
  push("trim", tube([0.86, 0.95, 0], [0.78, 1.15, 0], 0.026), BLACK);
  push("trim", new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12).rotateZ(1.25).translate(0.86, 1.13, 0), BLACK);
  for (const z of [1, -1]) {
    push("trim", new THREE.CylinderGeometry(0.02, 0.02, 0.11, 8).rotateX(Math.PI / 2).translate(0.78, 1.15, z * 0.36), RUBBER);
    push("metal", tube([0.94, 1.08, z * 0.62], [0.98, 1.24, z * 0.72], 0.008, 4), CHROME);
    push("trim", new THREE.CylinderGeometry(0.06, 0.06, 0.015, 12).rotateZ(Math.PI / 2).translate(0.98, 1.27, z * 0.74), BLACK);
  }

  // Front fascia: twin headlamps in chrome bezels, indicators, intake; tail lamps at the back.
  for (const z of [1, -1]) {
    push("metal", new THREE.TorusGeometry(0.078, 0.014, 6, 16).rotateY(Math.PI / 2).translate(1.305, 0.8, z * 0.29), CHROME);
    push("lamp", new THREE.SphereGeometry(0.075, 14, 6, 0, Math.PI).rotateY(Math.PI / 2).scale(0.35, 1, 1).translate(1.298, 0.8, z * 0.29));
    push("paint", at(new RoundedBoxGeometry(0.03, 0.05, 0.09, 1, 0.012), 1.285, 0.94, z * 0.44), AMBER);
    push("tail", at(new RoundedBoxGeometry(0.05, 0.06, 0.08, 1, 0.015), -1.36, 0.7, z * 0.48));
    push("paint", at(new RoundedBoxGeometry(0.03, 0.04, 0.06, 1, 0.01), -1.35, 0.8, z * 0.48), AMBER);
  }
  push("trim", at(new RoundedBoxGeometry(0.03, 0.07, 0.34, 2, 0.02), 1.275, 0.62, 0), BLACK);
  for (let i = 0; i < 4; i++) push("metal", at(new THREE.BoxGeometry(0.01, 0.008, 0.3), 1.292, 0.6 + i * 0.016, 0), STEEL);
  // Number plates, bumpers.
  push("plate", new THREE.PlaneGeometry(0.36, 0.08).rotateY(Math.PI / 2).rotateZ(0.75).translate(1.19, 0.47, 0));
  push("plate", new THREE.PlaneGeometry(0.4, 0.09).rotateY(-Math.PI / 2).translate(-1.385, 0.52, 0));
  push("trim", at(new THREE.BoxGeometry(0.04, 0.05, 1.12), -1.37, 0.36, 0), BLACK);
  push("metal", at(new THREE.BoxGeometry(0.05, 0.05, 1.0), 1.24, 0.36, 0), STEEL);

  // Front fork and mudguard; rear mudguards over the axle.
  for (const z of [1, -1]) push("metal", tube([FRONT_AXLE, 0.24, z * 0.07], [0.9, 0.62, z * 0.07], 0.022), STEEL);
  push("paint", new THREE.CylinderGeometry(0.28, 0.28, 0.16, 14, 1, true, -0.2, Math.PI * 0.95).rotateX(Math.PI / 2).rotateZ(Math.PI / 2 + 0.1).translate(FRONT_AXLE, 0.25, 0), paint);
  for (const z of [1, -1]) push("trim", new THREE.CylinderGeometry(0.28, 0.28, 0.17, 14, 1, true, 0.25, Math.PI * 0.85).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(REAR_AXLE, 0.25, z * 0.6), BLACK);

  // Bake every part from the side-view frame into the model frame: x forward becomes -Z,
  // z across becomes X, and the ground drops to GROUND.
  const bake = new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0, GROUND, 0));
  for (const p of parts) p.geometry.applyMatrix4(bake);
  return { parts, wheel: autoWheel() };
}

let wheelGeometry: THREE.BufferGeometry | undefined;

/** Tyre (torus), steel rim and chrome hub, axis along X. Shared by every auto. */
function autoWheel(): THREE.BufferGeometry {
  if (wheelGeometry) return wheelGeometry;
  const r = AUTO_SIZE.wheelRadius;
  const tyre = colour(new THREE.TorusGeometry(r - 0.055, 0.055, 8, 20).scale(1, 1, 1.2).rotateY(Math.PI / 2), RUBBER);
  const rim = colour(new THREE.CylinderGeometry(0.125, 0.125, 0.1, 14).rotateZ(Math.PI / 2), STEEL);
  const hub = colour(new THREE.CylinderGeometry(0.05, 0.05, 0.13, 8).rotateZ(Math.PI / 2), CHROME);
  const parts = [tyre, rim, hub].map((g) => {
    g.deleteAttribute("uv");
    return g;
  });
  const positions: number[] = [];
  const normals: number[] = [];
  const colours: number[] = [];
  for (const g of parts) {
    positions.push(...(g.getAttribute("position").array as Float32Array));
    normals.push(...(g.getAttribute("normal").array as Float32Array));
    colours.push(...(g.getAttribute("color").array as Float32Array));
  }
  wheelGeometry = new THREE.BufferGeometry();
  wheelGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  wheelGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  wheelGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  return wheelGeometry;
}
