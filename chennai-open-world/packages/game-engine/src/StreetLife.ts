/**
 * Drawing street life (`chunkStreetLife` in game-world): the morning's kolams as one merged mesh
 * of ground decals per chunk, the overhead cables as thin tubes merged into the chunk's fixtures
 * mesh, and the stalls, carts, chairs and bikes as instances for the pavement props mesh
 * (`StreetProps`).
 *
 * Kolams fade with the hour through their shared material's opacity (`kolamFreshness`): set when
 * the look changes, nothing per decal or per frame. The atlas is `kolamAtlas.ts`.
 */
import * as THREE from "three";
import { kolamFreshness, type CableSpan, type KolamPlacement, type StreetLife } from "@cow/game-world";
import { kolamAtlas, kolamUV } from "./kolamAtlas";
import type { Look } from "./lighting";
import type { ExtraGeometry, PropInstance } from "./StreetProps";

/** Kolams lie just above the verge and park layers (`LAYER_Y` in GroundMeshes). */
const KOLAM_Y = 0.045;
/** Cable tubes: radius and segments per span (sides are three, the cheapest closed tube). */
const CABLE_RADIUS = 0.016;
const CABLE_SEGMENTS = 10;
/** Weathered black insulation, a little lighter than black so it reads against a dark sky. */
const CABLE_COLOUR = [0.035, 0.035, 0.035] as const;

export interface KolamAssets {
  readonly material: THREE.MeshStandardMaterial;
}

export function createKolamAssets(): KolamAssets {
  return {
    material: new THREE.MeshStandardMaterial({
      map: kolamAtlas(),
      transparent: true,
      depthWrite: false,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    }),
  };
}

/** Fresh at dawn, scuffed by evening, faint at night; drawn not at all when gone. */
export function applyKolamLook(assets: KolamAssets, look: Look): void {
  const fresh = kolamFreshness(look.hour) * (1 - 0.6 * look.rain);
  assets.material.opacity = fresh;
  assets.material.visible = fresh > 0.03;
}

/** One mesh with every kolam of a chunk, or null. The caller owns the geometry. */
export function buildKolams(kolams: readonly KolamPlacement[], assets: KolamAssets): THREE.Mesh | null {
  if (kolams.length === 0) return null;
  const position = new Float32Array(kolams.length * 4 * 3);
  const normal = new Float32Array(kolams.length * 4 * 3);
  const uv = new Float32Array(kolams.length * 4 * 2);
  const index: number[] = [];
  kolams.forEach((k, n) => {
    const [u0, v0, u1, v1] = kolamUV(k.variant);
    const h = k.size / 2;
    const c = Math.cos(k.yaw);
    const s = Math.sin(k.yaw);
    const corners: ReadonlyArray<readonly [number, number, number, number]> = [
      [-h, -h, u0, v0],
      [h, -h, u1, v0],
      [h, h, u1, v1],
      [-h, h, u0, v1],
    ];
    corners.forEach(([lx, lz, u, v], i) => {
      const o = n * 4 + i;
      position.set([k.x + lx * c + lz * s, KOLAM_Y, k.z - lx * s + lz * c], o * 3);
      normal.set([0, 1, 0], o * 3);
      uv.set([u, v], o * 2);
    });
    const b = n * 4;
    // Wound to face up (+Y) whichever way the square is turned.
    index.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, assets.material);
  mesh.name = "kolams";
  mesh.receiveShadow = true;
  // After the ground and the road paint.
  mesh.renderOrder = 2;
  return mesh;
}

/** Cable tubes for a chunk, as plain triangles for the fixtures mesh (`buildStreetProps`). */
export function cableGeometry(cables: readonly CableSpan[]): ExtraGeometry | undefined {
  const lines: Array<{ a: THREE.Vector3; b: THREE.Vector3; sag: number }> = [];
  for (const c of cables) {
    const dx = c.bx - c.ax;
    const dz = c.bz - c.az;
    const l = Math.hypot(dx, dz) || 1;
    // Side by side across the span, a few centimetres apart, each sagging a little differently.
    for (let k = 0; k < c.count; k++) {
      const off = (k - (c.count - 1) / 2) * 0.22;
      const ox = (-dz / l) * off;
      const oz = (dx / l) * off;
      lines.push({ a: new THREE.Vector3(c.ax + ox, c.ay, c.az + oz), b: new THREE.Vector3(c.bx + ox, c.by, c.bz + oz), sag: c.sag * (1 + 0.12 * k) });
    }
  }
  if (lines.length === 0) return undefined;
  const triangles = lines.length * CABLE_SEGMENTS * 3 * 2;
  const position = new Float32Array(triangles * 9);
  const normal = new Float32Array(triangles * 9);
  const color = new Float32Array(triangles * 9);
  let o = 0;
  const point = (line: (typeof lines)[number], t: number) => new THREE.Vector3().lerpVectors(line.a, line.b, t).setY(line.a.y + (line.b.y - line.a.y) * t - 4 * line.sag * t * (1 - t));
  const up = new THREE.Vector3(0, 1, 0);
  const vertex = (p: THREE.Vector3, n: THREE.Vector3) => {
    position.set([p.x, p.y, p.z], o);
    normal.set([n.x, n.y, n.z], o);
    color.set(CABLE_COLOUR, o);
    o += 3;
  };
  for (const line of lines) {
    const dir = new THREE.Vector3().subVectors(line.b, line.a).normalize();
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    const lift = new THREE.Vector3().crossVectors(side, dir).normalize();
    // Three directions round the tube.
    const ring = [0, 1, 2].map((k) => {
      const a = (k / 3) * Math.PI * 2;
      return new THREE.Vector3().addScaledVector(lift, Math.cos(a)).addScaledVector(side, Math.sin(a));
    });
    for (let i = 0; i < CABLE_SEGMENTS; i++) {
      const p0 = point(line, i / CABLE_SEGMENTS);
      const p1 = point(line, (i + 1) / CABLE_SEGMENTS);
      for (let k = 0; k < 3; k++) {
        const r0 = ring[k]!;
        const r1 = ring[(k + 1) % 3]!;
        const n = new THREE.Vector3().addVectors(r0, r1).normalize();
        const a = p0.clone().addScaledVector(r0, CABLE_RADIUS);
        const b = p0.clone().addScaledVector(r1, CABLE_RADIUS);
        const c = p1.clone().addScaledVector(r1, CABLE_RADIUS);
        const d = p1.clone().addScaledVector(r0, CABLE_RADIUS);
        // Outward winding: (b - a) x (d - a) along n.
        const front = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(d, a)).dot(n) >= 0;
        for (const v of front ? [a, b, c, a, c, d] : [a, d, c, a, c, b]) vertex(v, n);
      }
    }
  }
  return { position, normal, color };
}

/** Stalls, carts, chairs and bikes as instances of their Blender models. */
export function lifeInstances(life: StreetLife): PropInstance[] {
  return life.props.map((p) => ({ model: p.kind, x: p.x, y: 0, z: p.z, yaw: p.yaw, tint: p.tint, ...(p.hours ? { hours: p.hours } : {}) }));
}
