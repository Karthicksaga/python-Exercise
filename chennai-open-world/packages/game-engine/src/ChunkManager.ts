/**
 * World streaming: keeps the chunks near a point loaded and frees the ones left behind.
 * Loading is spread over frames (one chunk per update) so walking never causes a long stall.
 */
import type * as THREE from "three";
import type { ChunkData, WorldMap } from "@cow/game-world";
import { ChunkView, applyChunkLook, type ChunkAssets } from "./ChunkView";
import type { Look } from "./lighting";

export interface ChunkHooks {
  /** Called after a chunk's meshes are in the scene (add its solids here). */
  loaded(chunk: ChunkData): void;
  /** Called before a chunk is dropped (remove its solids here). */
  unloaded(chunk: ChunkData): void;
}

export class ChunkManager {
  private readonly views = new Map<string, ChunkView>();

  constructor(
    private readonly map: WorldMap,
    private readonly scene: THREE.Object3D,
    private readonly assets: ChunkAssets,
    private readonly hooks: ChunkHooks,
    /** Chunks whose nearest edge is within this distance are loaded. */
    private readonly loadDistance = 260,
    /** Chunks further than this are freed. Larger than `loadDistance` to avoid thrashing. */
    private readonly unloadDistance = 340,
  ) {}

  get loadedCount(): number {
    return this.views.size;
  }

  /** Time of day and weather for every chunk (shared materials, so loaded and future chunks alike). */
  applyLook(look: Look): void {
    applyChunkLook(this.assets, look);
  }

  /** Distance from a point to the nearest edge of a chunk (0 inside it). */
  private distance(chunk: ChunkData, x: number, z: number): number {
    const size = this.map.chunkSize;
    const minX = this.map.bounds.minX + chunk.col * size;
    const minZ = this.map.bounds.minZ + chunk.row * size;
    const dx = Math.max(minX - x, 0, x - (minX + size));
    const dz = Math.max(minZ - z, 0, z - (minZ + size));
    return Math.hypot(dx, dz);
  }

  /**
   * Call every frame with the player's position.
   * @param all load everything in range now (first frame, respawn) instead of one chunk
   */
  update(x: number, z: number, all = false): void {
    for (const chunk of this.map.chunks) {
      const loaded = this.views.has(chunk.key);
      const d = this.distance(chunk, x, z);
      if (loaded && d > this.unloadDistance) {
        this.unload(chunk);
      } else if (!loaded && d <= this.loadDistance) {
        this.load(chunk);
        if (!all) return;
      }
    }
  }

  private load(chunk: ChunkData): void {
    const view = new ChunkView(chunk, this.assets);
    this.views.set(chunk.key, view);
    this.scene.add(view.object);
    this.hooks.loaded(chunk);
  }

  private unload(chunk: ChunkData): void {
    const view = this.views.get(chunk.key);
    if (!view) return;
    this.hooks.unloaded(chunk);
    this.scene.remove(view.object);
    view.dispose();
    this.views.delete(chunk.key);
  }
}
