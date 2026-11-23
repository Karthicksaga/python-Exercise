/**
 * Cutting a character's triangles down at load time with meshoptimizer's simplifier: for the
 * platform crowds' baked poses (`CrowdFigures`) and for the cheap distant model of a person whose
 * manifest entry has no LOD1 file (`HumanAssets`). Call after `await MeshoptSimplifier.ready`.
 */
import { MeshoptSimplifier } from "meshoptimizer";
import type * as THREE from "three";

/**
 * The geometry's triangles cut to about `keep` of them, on vertices welded by position first:
 * the model splits vertices at texture seams, which would otherwise stop the simplifier from
 * merging across them. The result indexes the original vertices (fine for figures seen at a
 * distance; a seam's texture can smear over a triangle or two).
 * @param positions the vertex positions to simplify against (rest pose or a baked pose), xyz
 */
export function simplifiedIndex(geometry: THREE.BufferGeometry, positions: Float32Array, keep: number): Uint32Array {
  const count = positions.length / 3;
  const source = geometry.index ? Array.from(geometry.index.array as ArrayLike<number>) : Array.from({ length: count }, (_, i) => i);
  const weld = new Map<string, number>();
  const remap = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const key = `${Math.round(positions[i * 3]! * 1e4)},${Math.round(positions[i * 3 + 1]! * 1e4)},${Math.round(positions[i * 3 + 2]! * 1e4)}`;
    let to = weld.get(key);
    if (to === undefined) weld.set(key, (to = i));
    remap[i] = to;
  }
  const welded = new Uint32Array(source.length);
  for (let i = 0; i < source.length; i++) welded[i] = remap[source[i]!]!;
  const target = Math.max(36, Math.floor((welded.length * keep) / 3) * 3);
  try {
    let [indices] = MeshoptSimplifier.simplify(welded, positions, 3, target, 0.3);
    // Clothes and hair are open shells whose edges the careful pass keeps; finish with the
    // sloppy pass (it ignores topology), fine for figures seen at a distance.
    if (indices.length > target * 1.5) [indices] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, target, 0.3);
    return indices.length >= 3 ? indices : welded;
  } catch (error) {
    // The careful pass refuses some parts (the skin mesh); the sloppy one still cuts them down.
    try {
      const [indices] = MeshoptSimplifier.simplifySloppy(welded, positions, 3, null, target, 0.3);
      return indices.length >= 3 ? indices : welded;
    } catch {
      console.warn("Figure part left unsimplified.", error);
      return welded;
    }
  }
}
