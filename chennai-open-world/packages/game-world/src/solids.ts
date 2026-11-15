/**
 * What is solid in a chunk, as plain numbers: a triangle mesh of every building wall, and a
 * box per tree trunk. Kept separate from rendering so collision is decided by world data alone.
 */
import type { Bounds, ChunkData } from "./types";

export interface SolidBox {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly hx: number;
  readonly hy: number;
  readonly hz: number;
  readonly yaw: number;
}

export interface ChunkSolids {
  /** Wall triangles: xyz triples and triangle indices. Empty when the chunk has no buildings. */
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
  readonly boxes: SolidBox[];
}

export function chunkSolids(chunk: ChunkData): ChunkSolids {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const building of chunk.buildings) {
    const { outline, height } = building;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i]!;
      const b = outline[(i + 1) % outline.length]!;
      const base = vertices.length / 3;
      // Walls start below ground so nothing can slip under them.
      vertices.push(a.x, -1, a.z, b.x, -1, b.z, b.x, height, b.z, a.x, height, a.z);
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  const boxes = chunk.trees.map((tree) => ({ x: tree.x, y: 1.5, z: tree.z, hx: 0.28 * tree.scale, hy: 1.5, hz: 0.28 * tree.scale, yaw: 0 }));
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices), boxes };
}

/** Side of one ground tile. One slab for the whole map is too big for the solver's precision. */
const GROUND_TILE = 125;

/** Ground tiles and four invisible walls around the playable area. */
export function boundarySolids(bounds: Bounds): SolidBox[] {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const hw = (bounds.maxX - bounds.minX) / 2;
  const hd = (bounds.maxZ - bounds.minZ) / 2;
  const t = 1;
  const h = 6;
  const out: SolidBox[] = [];
  // The ground reaches a little past the walls so nothing can fall off the edge.
  for (let x = bounds.minX - GROUND_TILE; x < bounds.maxX + GROUND_TILE; x += GROUND_TILE) {
    for (let z = bounds.minZ - GROUND_TILE; z < bounds.maxZ + GROUND_TILE; z += GROUND_TILE) {
      out.push({ x: x + GROUND_TILE / 2, y: -0.5, z: z + GROUND_TILE / 2, hx: GROUND_TILE / 2, hy: 0.5, hz: GROUND_TILE / 2, yaw: 0 });
    }
  }
  out.push(
    { x: bounds.minX - t, y: h, z: cz, hx: t, hy: h, hz: hd + t * 2, yaw: 0 },
    { x: bounds.maxX + t, y: h, z: cz, hx: t, hy: h, hz: hd + t * 2, yaw: 0 },
    { x: cx, y: h, z: bounds.minZ - t, hx: hw + t * 2, hy: h, hz: t, yaw: 0 },
    { x: cx, y: h, z: bounds.maxZ + t, hx: hw + t * 2, hy: h, hz: t, yaw: 0 },
  );
  return out;
}
