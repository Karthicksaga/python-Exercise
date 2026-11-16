/**
 * Street furniture meshes for one chunk: bus shelters and street-light poles (instanced, one
 * draw call each) and the main roads' kerbs (one merged mesh). Placement is decided in
 * game-world (`chunkFurniture`); this only draws it. Geometries and materials are shared by
 * every chunk and created once (`createFurnitureAssets`).
 *
 * Each model is one geometry with vertex colours, so a shelter or a pole with its lamp is a
 * single draw call. The lamp heads glow after dark through an emissive map that is white only
 * where the lamp is, so the glow follows `look.night` with the rest of the city's lights. After
 * dark each lamp also throws a soft pool of light on the road (additive, one more instanced draw
 * per chunk, hidden by day so it costs nothing then).
 */
import * as THREE from "three";
import { KERB, POLE, SHELTER, type ChunkFurniture } from "@cow/game-world";
import type { Look } from "./lighting";
import { MeshBuilder } from "./MeshBuilder";

export interface FurnitureAssets {
  readonly shelter: THREE.BufferGeometry;
  readonly pole: THREE.BufferGeometry;
  /** Light on the road under a pole's lamp, in the pole's frame. */
  readonly pool: THREE.BufferGeometry;
  readonly material: THREE.MeshStandardMaterial;
  readonly poolMaterial: THREE.MeshBasicMaterial;
  readonly kerb: THREE.MeshStandardMaterial;
}

/** U coordinates of the emissive map: dark everywhere except the lamp. */
const DARK_U = 0.25;
const LAMP_U = 0.75;

const color = new THREE.Color();

/**
 * A box from (x0, y0, z0) to (x1, y1, z1); the top face may be narrower (`taper` shrinks its
 * half-size in x and z), for a tapered pole.
 */
function box(b: MeshBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: number, u = DARK_U, taper = 0): void {
  color.setHex(hex);
  const { r, g, b: bl } = color;
  const top = (x: number, z: number): [number, number] => [x + (x < (x0 + x1) / 2 ? taper : -taper), z + (z < (z0 + z1) / 2 ? taper : -taper)];
  const corner = (x: number, y: number, z: number): [number, number, number] => {
    if (y !== y1 || taper === 0) return [x, y, z];
    const [tx, tz] = top(x, z);
    return [tx, y, tz];
  };
  const face = (pts: Array<[number, number, number]>, nx: number, ny: number, nz: number, shade: number) => {
    const ids = pts.map(([x, y, z]) => {
      const [cx, cy, cz] = corner(x, y, z);
      return b.vertex(cx, cy, cz, nx, ny, nz, u, 0.5, r * shade, g * shade, bl * shade);
    });
    b.quad(ids[0]!, ids[1]!, ids[2]!, ids[3]!);
  };
  face([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], 0, 1, 0, 1); // top
  face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0, -1, 0, 0.7); // bottom
  face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0, 0, 1, 0.92); // +z
  face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 0, 0, -1, 0.92); // -z
  face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 1, 0, 0, 0.85); // +x
  face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], -1, 0, 0, 0.85); // -x
}

/**
 * An original, simple bus shelter (invented design): four steel posts, a roof slab, a back
 * panel, a bench and a blank route board. Its open front faces -Z, towards the road.
 */
function shelterGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const w = SHELTER.width / 2;
  const d = SHELTER.depth / 2;
  const h = SHELTER.height;
  const steel = 0x8d9399;
  for (const x of [-w + 0.1, w - 0.1]) for (const z of [-d + 0.1, d - 0.1]) box(b, x - 0.05, 0, z - 0.05, x + 0.05, h - 0.1, z + 0.05, steel);
  box(b, -w - 0.15, h - 0.1, -d - 0.2, w + 0.15, h, d + 0.05, 0x2f5f86); // roof
  box(b, -w + 0.12, 0.35, d - 0.12, w - 0.12, h - 0.25, d - 0.07, 0xc6cbc6); // back panel
  box(b, -w + 0.4, 0.42, d - 0.55, w - 0.4, 0.48, d - 0.15, 0x6f757a); // bench seat
  for (const x of [-w + 0.6, w - 0.6]) box(b, x - 0.04, 0, d - 0.4, x + 0.04, 0.42, d - 0.3, 0x55595c);
  box(b, -0.8, h, -d - 0.17, 0.8, h + 0.38, -d - 0.12, 0x1f5aa6); // route board (no text)
  return b.build()!;
}

/**
 * A concrete street-light and electricity pole (invented design): a tapered square shaft, a
 * cross-arm for the wires, and a lamp on an arm reaching over the road (-Z).
 */
function poleGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const s = POLE.half;
  const top = POLE.height;
  box(b, -s, 0, -s, s, top, s, 0xa8a59b, DARK_U, s * 0.4);
  box(b, -0.7, top - 0.9, -0.06, 0.7, top - 0.78, 0.06, 0x8a877e); // cross-arm
  for (const x of [-0.6, 0, 0.6]) box(b, x - 0.04, top - 0.78, -0.04, x + 0.04, top - 0.62, 0.04, 0xd8d4c8); // insulators
  box(b, -0.04, top - 0.45, -POLE.arm, 0.04, top - 0.37, 0, 0x6c7074); // lamp arm
  box(b, -0.17, top - 0.56, -POLE.arm - 0.7, 0.17, top - 0.4, -POLE.arm + 0.1, 0x505458); // lamp housing
  box(b, -0.15, top - 0.6, -POLE.arm - 0.66, 0.15, top - 0.56, -POLE.arm + 0.06, 0xfff1d0, LAMP_U); // lamp glass
  return b.build()!;
}

/** A disc of warm light, bright in the middle and fading to nothing (black adds nothing). */
function poolGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const SIDES = 14;
  const RADIUS = 7;
  const cz = -POLE.arm - 1.2;
  const centre = b.vertex(0, 0.1, cz, 0, 1, 0, 0, 0, 1, 0.78, 0.48);
  const rim: number[] = [];
  for (let i = 0; i < SIDES; i++) {
    const angle = (i / SIDES) * Math.PI * 2;
    rim.push(b.vertex(Math.cos(angle) * RADIUS, 0.1, cz + Math.sin(angle) * RADIUS, 0, 1, 0, 0, 0, 0, 0, 0));
  }
  for (let i = 0; i < SIDES; i++) b.triangle(centre, rim[(i + 1) % SIDES]!, rim[i]!);
  return b.build()!;
}

/** Kerb paint: black and yellow bands, a metre each (a common Chennai finish; invented here). */
function kerbTexture(): THREE.Texture {
  const data = new Uint8Array(8 * 4);
  for (let i = 0; i < 8; i++) data.set(i < 4 ? [222, 186, 52, 255] : [38, 38, 36, 255], i * 4);
  const texture = new THREE.DataTexture(data, 8, 1);
  texture.wrapS = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createFurnitureAssets(): FurnitureAssets {
  const glow = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]), 2, 1);
  glow.magFilter = THREE.NearestFilter;
  glow.minFilter = THREE.NearestFilter;
  glow.needsUpdate = true;
  return {
    shelter: shelterGeometry(),
    pole: poleGeometry(),
    pool: poolGeometry(),
    poolMaterial: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0, visible: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }),
    material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, emissiveMap: glow, emissive: 0xffd49a, emissiveIntensity: 0 }),
    kerb: new THREE.MeshStandardMaterial({ map: kerbTexture(), roughness: 0.9 }),
  };
}

/** Lamps light up after dark; kerbs darken in the rain. */
export function applyFurnitureLook(assets: FurnitureAssets, look: Look): void {
  assets.material.emissiveIntensity = look.night * 2.5;
  assets.poolMaterial.opacity = look.night * 0.4;
  assets.poolMaterial.visible = look.night > 0.02;
  assets.kerb.color.setScalar(1 - 0.3 * look.rain);
}

/** Up to four meshes for a chunk's furniture, and the geometry it owns (the kerbs). */
export function buildStreetFurniture(f: ChunkFurniture, assets: FurnitureAssets): { meshes: THREE.Mesh[]; owned: THREE.BufferGeometry[] } {
  const meshes: THREE.Mesh[] = [];
  const owned: THREE.BufferGeometry[] = [];
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const at = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const instanced = (geometry: THREE.BufferGeometry, material: THREE.Material, items: ReadonlyArray<{ x: number; z: number; yaw: number }>, solid = true) => {
    if (items.length === 0) return;
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    items.forEach((p, i) => mesh.setMatrixAt(i, matrix.compose(at.set(p.x, 0, p.z), rotation.setFromAxisAngle(up, p.yaw), one)));
    mesh.castShadow = solid;
    mesh.receiveShadow = solid;
    if (!solid) mesh.renderOrder = 3;
    mesh.computeBoundingSphere();
    meshes.push(mesh);
  };
  instanced(assets.shelter, assets.material, f.shelters);
  instanced(assets.pole, assets.material, f.poles);
  instanced(assets.pool, assets.poolMaterial, f.poles, false);

  if (f.kerbs.length > 0) {
    const b = new MeshBuilder();
    const h = KERB.height;
    for (const run of f.kerbs) {
      const n = run.inner.length;
      for (let i = 0; i < n - 1; i++) {
        const a0 = run.inner[i]!;
        const a1 = run.inner[i + 1]!;
        const b0 = run.outer[i]!;
        const b1 = run.outer[i + 1]!;
        const u0 = run.along[i]! / 2;
        const u1 = run.along[i + 1]! / 2;
        // Facing the road: horizontal normal from the back edge towards the carriageway.
        const fx = a0.x - b0.x;
        const fz = a0.z - b0.z;
        const fl = Math.hypot(fx, fz) || 1;
        const nx = fx / fl;
        const nz = fz / fl;
        // x, y, z, u, v for the eight corners of this piece.
        const verts: Array<[number, number, number, number, number]> = [
          [a0.x, h, a0.z, u0, 0.5], [a1.x, h, a1.z, u1, 0.5], [b1.x, h, b1.z, u1, 0.5], [b0.x, h, b0.z, u0, 0.5],
          [a0.x, 0, a0.z, u0, 0.5], [a1.x, 0, a1.z, u1, 0.5], [b1.x, 0, b1.z, u1, 0.5], [b0.x, 0, b0.z, u0, 0.5],
        ];
        /** A face with the given outward normal, wound to face that way whichever side of the road the run is on. */
        const quad = (p: number, q: number, r: number, s: number, ox: number, oy: number, oz: number) => {
          const l = Math.hypot(ox, oy, oz) || 1;
          const [P, Q, S] = [verts[p]!, verts[q]!, verts[s]!];
          const cx = (Q[1] - P[1]) * (S[2] - P[2]) - (Q[2] - P[2]) * (S[1] - P[1]);
          const cy = (Q[2] - P[2]) * (S[0] - P[0]) - (Q[0] - P[0]) * (S[2] - P[2]);
          const cz = (Q[0] - P[0]) * (S[1] - P[1]) - (Q[1] - P[1]) * (S[0] - P[0]);
          const ids = [p, q, r, s].map((k) => b.vertex(verts[k]![0], verts[k]![1], verts[k]![2], ox / l, oy / l, oz / l, verts[k]![3], verts[k]![4]));
          // (q - p) x (s - p) is the front of quad p, q, r, s.
          if (cx * ox + cy * oy + cz * oz >= 0) b.quad(ids[0]!, ids[1]!, ids[2]!, ids[3]!);
          else b.quad(ids[0]!, ids[3]!, ids[2]!, ids[1]!);
        };
        const dx = a1.x - a0.x;
        const dz = a1.z - a0.z;
        quad(0, 1, 2, 3, 0, 1, 0); // top
        quad(4, 5, 1, 0, nx, 0, nz); // face to the road
        quad(7, 6, 2, 3, -nx, 0, -nz); // back
        if (i === 0) quad(4, 0, 3, 7, -dx, 0, -dz); // run's start
        if (i === n - 2) quad(5, 1, 2, 6, dx, 0, dz); // run's end
      }
    }
    const geometry = b.build();
    if (geometry) {
      owned.push(geometry);
      const mesh = new THREE.Mesh(geometry, assets.kerb);
      mesh.receiveShadow = true;
      meshes.push(mesh);
    }
  }
  return { meshes, owned };
}
