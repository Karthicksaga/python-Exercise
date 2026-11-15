/**
 * Meshes of one streamed chunk: every building merged into one mesh for walls and one for
 * roofs, and trees drawn with instancing. Disposing a view frees its GPU memory.
 */
import * as THREE from "three";
import type { Building, ChunkData } from "@cow/game-world";
import { MeshBuilder } from "./MeshBuilder";
import { FACADE_TILES, FACADE_TILE_COUNT } from "./textures";

const BAY = 3.2; // metres of wall per window bay
const GROUND_FLOOR = 3.3;
const PARAPET = 0.9;
/** Keep samples away from tile edges so neighbouring tiles don't bleed in at a distance. */
const INSET = 0.004;

/** Materials and geometries shared by every chunk; created once. */
export interface ChunkAssets {
  readonly walls: THREE.Material;
  readonly roofs: THREE.Material;
  readonly trunk: THREE.BufferGeometry;
  readonly crown: THREE.BufferGeometry;
  readonly trunkMaterial: THREE.Material;
  readonly crownMaterial: THREE.Material;
  readonly tank: THREE.BufferGeometry;
  readonly tankMaterial: THREE.Material;
}

/** Stable pseudo-random number in [0, 1) so a building looks the same every time it loads. */
function hash(id: number, salt: number): number {
  let t = (id ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
}

const scratch = new THREE.Color();

function addBuilding(walls: MeshBuilder, roofs: MeshBuilder, b: Building): void {
  scratch.setHex(b.color);
  const { r, g, b: blue } = scratch;
  const { outline, floors, height } = b;
  const upperTop = height - PARAPET;
  const upperFloors = floors - 1;

  for (let i = 0; i < outline.length; i++) {
    const p = outline[i]!;
    const q = outline[(i + 1) % outline.length]!;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) continue;
    // Outline is anticlockwise, so this is the outward normal.
    const nx = dz / length;
    const nz = -dx / length;
    // Slightly different brightness per wall gives the block some form in flat light.
    const shade = 0.92 + 0.08 * hash(b.id, i);
    const cr = r * shade;
    const cg = g * shade;
    const cb = blue * shade;

    const bays = Math.max(1, Math.round(length / BAY));
    for (let bay = 0; bay < bays; bay++) {
      const t0 = bay / bays;
      const t1 = (bay + 1) / bays;
      const x0 = p.x + dx * t0;
      const z0 = p.z + dz * t0;
      const x1 = p.x + dx * t1;
      const z1 = p.z + dz * t1;
      const pick = hash(b.id, i * 97 + bay);

      // Narrow leftovers of wall get plain plaster instead of a squeezed window.
      const plain = length / bays < 1.6;
      const band = (y0: number, y1: number, tile: number, v0: number, v1: number) => {
        const u0 = plain ? (tile + 0.03) / FACADE_TILE_COUNT : tile / FACADE_TILE_COUNT + INSET;
        const u1 = plain ? (tile + 0.06) / FACADE_TILE_COUNT : (tile + 1) / FACADE_TILE_COUNT - INSET;
        const a = walls.vertex(x0, y0, z0, nx, 0, nz, u0, v0, cr, cg, cb);
        const c = walls.vertex(x1, y0, z1, nx, 0, nz, u1, v0, cr, cg, cb);
        const d = walls.vertex(x1, y1, z1, nx, 0, nz, u1, v1, cr, cg, cb);
        const e = walls.vertex(x0, y1, z0, nx, 0, nz, u0, v1, cr, cg, cb);
        walls.quad(a, e, d, c);
      };

      const groundTop = upperFloors > 0 ? GROUND_FLOOR : upperTop;
      const groundTile = b.kind === "commercial" ? (pick < 0.75 ? FACADE_TILES.shop : FACADE_TILES.window) : pick < 0.3 ? FACADE_TILES.door : FACADE_TILES.window;
      band(0, groundTop, groundTile, 0, 1);
      if (upperFloors > 0) {
        const upperTile = hash(b.id, i * 131 + bay + 7) < (b.kind === "house" ? 0.25 : 0.45) ? FACADE_TILES.balcony : FACADE_TILES.window;
        band(GROUND_FLOOR, upperTop, upperTile, 0, upperFloors);
      }
    }

    // Parapet: plain plaster, sampled from a blank corner of the window tile.
    const u = (FACADE_TILES.window + 0.04) / FACADE_TILE_COUNT;
    const a = walls.vertex(p.x, upperTop, p.z, nx, 0, nz, u, 0.86, cr, cg, cb);
    const c = walls.vertex(q.x, upperTop, q.z, nx, 0, nz, u + 0.01, 0.86, cr, cg, cb);
    const d = walls.vertex(q.x, height, q.z, nx, 0, nz, u + 0.01, 0.9, cr, cg, cb);
    const e = walls.vertex(p.x, height, p.z, nx, 0, nz, u, 0.9, cr, cg, cb);
    walls.quad(a, e, d, c);
  }

  // Roof slab a little below the parapet top.
  const roofY = height - 0.35;
  const contour = outline.map((p) => new THREE.Vector2(p.x, p.z));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const base = roofs.vertexCount;
  const tone = 0.55 + hash(b.id, 3) * 0.2;
  for (const p of outline) roofs.vertex(p.x, roofY, p.z, 0, 1, 0, p.x / 6, p.z / 6, tone, tone * 0.98, tone * 0.95);
  for (const face of faces) {
    const [i0, i1, i2] = face as [number, number, number];
    const p0 = outline[i0]!;
    const p1 = outline[i1]!;
    const p2 = outline[i2]!;
    // Keep the triangle facing up whichever way the triangulator wound it.
    const up = (p1.z - p0.z) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.z - p0.z) > 0;
    if (up) roofs.triangle(base + i0, base + i1, base + i2);
    else roofs.triangle(base + i0, base + i2, base + i1);
  }
}

export function createChunkAssets(facade: THREE.Texture): ChunkAssets {
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 4, 6);
  trunk.translate(0, 2, 0);
  // Three overlapping blobs read as a leafy canopy from every side.
  const crown = new THREE.IcosahedronGeometry(2.3, 1);
  crown.scale(1, 0.75, 1);
  crown.translate(0, 5.1, 0);
  const tank = new THREE.CylinderGeometry(0.75, 0.75, 1.5, 10);
  tank.translate(0, 0.75, 0);
  return {
    walls: new THREE.MeshStandardMaterial({ map: facade, vertexColors: true, roughness: 0.93 }),
    roofs: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    trunk,
    crown,
    trunkMaterial: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.95 }),
    crownMaterial: new THREE.MeshStandardMaterial({ color: 0x3f8f4a, roughness: 0.95, flatShading: true }),
    tank,
    // The black rooftop water tanks seen on almost every Chennai house.
    tankMaterial: new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.6 }),
  };
}

export class ChunkView {
  readonly object = new THREE.Group();
  private readonly owned: THREE.BufferGeometry[] = [];

  constructor(chunk: ChunkData, assets: ChunkAssets) {
    this.object.name = `chunk:${chunk.key}`;
    const walls = new MeshBuilder();
    const roofs = new MeshBuilder();
    for (const building of chunk.buildings) addBuilding(walls, roofs, building);

    for (const [builder, material] of [[walls, assets.walls], [roofs, assets.roofs]] as const) {
      const geometry = builder.build();
      if (!geometry) continue;
      this.owned.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.object.add(mesh);
    }

    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);

    // Water tanks on most roofs, placed at the footprint's centre of mass.
    const tanked = chunk.buildings.filter((b) => hash(b.id, 21) < 0.7);
    if (tanked.length > 0) {
      const tanks = new THREE.InstancedMesh(assets.tank, assets.tankMaterial, tanked.length);
      tanked.forEach((b, i) => {
        let x = 0;
        let z = 0;
        for (const p of b.outline) {
          x += p.x;
          z += p.z;
        }
        matrix.makeTranslation(x / b.outline.length, b.height - 0.35, z / b.outline.length);
        tanks.setMatrixAt(i, matrix);
      });
      tanks.castShadow = true;
      tanks.computeBoundingSphere();
      this.object.add(tanks);
    }

    if (chunk.trees.length > 0) {
      const trunks = new THREE.InstancedMesh(assets.trunk, assets.trunkMaterial, chunk.trees.length);
      const crowns = new THREE.InstancedMesh(assets.crown, assets.crownMaterial, chunk.trees.length);
      const tint = new THREE.Color();
      chunk.trees.forEach((tree, i) => {
        rotation.setFromAxisAngle(up, (tree.x * 13.7 + tree.z * 7.3) % 6.28);
        matrix.compose(new THREE.Vector3(tree.x, 0, tree.z), rotation, new THREE.Vector3(tree.scale, tree.scale, tree.scale));
        trunks.setMatrixAt(i, matrix);
        crowns.setMatrixAt(i, matrix);
        // Slightly different greens so a row of trees isn't uniform.
        const v = 0.85 + (((tree.x * 3.1 + tree.z * 5.7) % 1) + 1) % 1 * 0.3;
        crowns.setColorAt(i, tint.setRGB(v, v, v * 0.9));
      });
      for (const mesh of [trunks, crowns]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        this.object.add(mesh);
      }
    }
  }

  /** Free this chunk's own GPU buffers. Shared assets stay. Remove `object` from the scene first. */
  dispose(): void {
    for (const geometry of this.owned) geometry.dispose();
    this.object.traverse((node) => {
      if (node instanceof THREE.InstancedMesh) node.dispose();
    });
  }
}
