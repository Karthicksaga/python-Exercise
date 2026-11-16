/**
 * What is solid in a chunk, as plain numbers: a triangle mesh of every building wall, and a
 * box per tree trunk. Kept separate from rendering so collision is decided by world data alone.
 */
import { gopuramProfile, towerProfile } from "./landmarks";
import type { Bounds, ChunkData, Landmark, Point, Sea } from "./types";

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

/** Sides of the polygon that stands in for a round landmark part. Matches the model's segments. */
const ROUND_SIDES = 24;

/**
 * Landmark collision, built once (landmarks are always loaded): for a tower, each plinth step
 * as a capped prism you can walk up, the ground-floor drum and the shaft. Landmarks without a
 * footprint (beaches, districts, temples not modelled yet) add nothing.
 */
export function landmarkSolids(landmarks: readonly Landmark[]): ChunkSolids {
  const vertices: number[] = [];
  const indices: number[] = [];
  /** A vertical prism from `bottom` to `top` with a flat lid, centred on x, z. */
  const prism = (x: number, z: number, radius: number, bottom: number, top: number) => {
    const ring = (y: number) => {
      const start = vertices.length / 3;
      for (let i = 0; i < ROUND_SIDES; i++) {
        const angle = (i / ROUND_SIDES) * Math.PI * 2;
        vertices.push(x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius);
      }
      return start;
    };
    const low = ring(bottom);
    const high = ring(top);
    const centre = vertices.length / 3;
    vertices.push(x, top, z);
    for (let i = 0; i < ROUND_SIDES; i++) {
      const j = (i + 1) % ROUND_SIDES;
      indices.push(low + i, high + i, low + j, low + j, high + i, high + j);
      indices.push(centre, high + j, high + i);
    }
  };
  const boxes: SolidBox[] = [];
  for (const landmark of landmarks) {
    if (landmark.kind === "temple" && landmark.radius !== undefined) {
      // The gopuram: two piers either side of the walk-through passage, the lintel, and the
      // tower above as one box about as big as its middle tiers (it keeps the camera outside).
      const g = gopuramProfile(landmark);
      const { base, passage } = g;
      const pier = (base.hz0 - passage.half) / 2;
      for (const side of [-1, 1]) boxes.push({ x: landmark.x, y: base.top / 2 - 0.5, z: landmark.z + side * (passage.half + pier), hx: base.hx0, hy: base.top / 2 + 0.5, hz: pier, yaw: 0 });
      boxes.push({ x: landmark.x, y: (passage.top + base.top) / 2, z: landmark.z, hx: base.hx0, hy: (base.top - passage.top) / 2, hz: passage.half + 0.01, yaw: 0 });
      const middle = g.tiers[Math.floor(g.tiers.length / 2)]!;
      boxes.push({ x: landmark.x, y: (base.top + g.vault.top) / 2, z: landmark.z, hx: middle.hx0, hy: (g.vault.top - base.top) / 2, hz: middle.hz0, yaw: 0 });
      continue;
    }
    if (landmark.kind !== "tower" || landmark.radius === undefined) continue;
    const profile = towerProfile(landmark);
    // Parts start below ground, like building walls, so nothing slips under them.
    for (const step of profile.steps) prism(landmark.x, landmark.z, step.radius, -1, step.top);
    prism(landmark.x, landmark.z, profile.drum.radius, -1, profile.drum.top);
    // The shaft as wide as the mid-height balconies, so the camera stays outside them.
    const balcony = profile.levels[Math.floor(profile.levels.length / 2)]?.radius ?? profile.shaft.radius;
    prism(landmark.x, landmark.z, balcony, profile.drum.top - 0.1, profile.canopy.top);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices), boxes };
}

/** How far into the water the invisible sea wall stands, metres: past the surf, so the beach is all walkable. */
const SURF = 6;

/**
 * An invisible wall along the coast, a few metres out to sea, so nobody walks or drives into
 * the water. Only the stretch inside (or near) the playable area.
 */
export function coastSolids(sea: Sea | undefined, bounds: Bounds): SolidBox[] {
  if (!sea) return [];
  const near = (p: Point) => p.x > bounds.minX - 50 && p.x < bounds.maxX + 50 && p.z > bounds.minZ - 50 && p.z < bounds.maxZ + 50;
  const out: SolidBox[] = [];
  const { coast } = sea;
  for (let i = 0; i < coast.length - 1; i++) {
    const a = coast[i]!;
    const b = coast[i + 1]!;
    if (!near(a) && !near(b)) continue;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 0.5) continue;
    const dx = (b.x - a.x) / length;
    const dz = (b.z - a.z) / length;
    // Water is on the right of the coast's direction: (-dz, dx) in this frame.
    const ox = -dz * (SURF + 1);
    const oz = dx * (SURF + 1);
    // Long segments (the ends carried past the map) are cut to the part near the map.
    const pieces = Math.max(1, Math.ceil(length / 200));
    for (let k = 0; k < pieces; k++) {
      const t0 = k / pieces;
      const t1 = (k + 1) / pieces;
      const p0 = { x: a.x + (b.x - a.x) * t0, z: a.z + (b.z - a.z) * t0 };
      const p1 = { x: a.x + (b.x - a.x) * t1, z: a.z + (b.z - a.z) * t1 };
      if (!near(p0) && !near(p1)) continue;
      const half = (length / pieces) / 2 + 0.6;
      out.push({ x: (p0.x + p1.x) / 2 + ox, y: 2, z: (p0.z + p1.z) / 2 + oz, hx: 1, hy: 2.5, hz: half, yaw: Math.atan2(-dx, -dz) });
    }
  }
  return out;
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
