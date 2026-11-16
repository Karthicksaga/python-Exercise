/**
 * World streaming: keeps the chunks near a point loaded and frees the ones left behind.
 *
 * A chunk's contents come from a `ChunkSource` (a file fetched on demand, TD-16). Loading has
 * two halves: fetching and decoding run in the background, a few at a time, nearest first;
 * building meshes and solids happens in the frame, one chunk per update, so moving never causes
 * a long stall. Chunks that go out of range are freed (meshes, solids and GPU buffers) and a
 * fetch for a chunk no longer wanted is thrown away when it arrives.
 */
import type * as THREE from "three";
import { chunkFurniture, roadSpansByChunk, type ChunkData, type ChunkRef, type RoadSpan, type WorldMap } from "@cow/game-world";
import { ChunkView, applyChunkLook, type ChunkAssets } from "./ChunkView";
import type { Look } from "./lighting";

export interface ChunkHooks {
  /** Called after a chunk's meshes are in the scene (add its solids here). */
  loaded(chunk: ChunkData): void;
  /** Called before a chunk is dropped (remove its solids here). */
  unloaded(chunk: ChunkData): void;
}

/** Where chunk contents come from: the world's files, or memory for hand-made maps and tests. */
export interface ChunkSource {
  load(ref: ChunkRef): Promise<ChunkData>;
}

/** How many chunk files may be in flight at once. */
const IN_FLIGHT = 4;

type Slot =
  | { state: "loading" }
  | { state: "ready"; data: ChunkData }
  | { state: "shown"; data: ChunkData; view: ChunkView };

export class ChunkManager {
  private readonly slots = new Map<string, Slot>();
  private readonly refs = new Map<string, ChunkRef>();
  private readonly spans: Map<string, RoadSpan[]>;
  private inFlight = 0;
  private failures = 0;
  private focus = { x: 0, z: 0 };
  private waiters: Array<{ x: number; z: number; done: () => void }> = [];

  constructor(
    private readonly map: WorldMap,
    private readonly source: ChunkSource,
    private readonly scene: THREE.Object3D,
    private readonly assets: ChunkAssets,
    private readonly hooks: ChunkHooks,
    /** Chunks whose nearest edge is within this distance are loaded. */
    private readonly loadDistance = 260,
    /** Chunks further than this are freed. Larger than `loadDistance` to avoid thrashing. */
    private readonly unloadDistance = 340,
  ) {
    for (const ref of map.chunks) this.refs.set(ref.key, ref);
    // Road surface is drawn by the chunk its segments lie in.
    this.spans = roadSpansByChunk(map.roads, map.bounds, map.chunkSize);
  }

  /** Chunks with meshes in the scene. */
  get loadedCount(): number {
    let n = 0;
    for (const slot of this.slots.values()) if (slot.state === "shown") n++;
    return n;
  }

  /** Keys of the chunks with meshes in the scene, for tests and debugging. */
  loadedKeys(): string[] {
    return [...this.slots.entries()].filter(([, slot]) => slot.state === "shown").map(([key]) => key);
  }

  /** Chunk files that could not be read (a broken install; each is retried when next in range). */
  get failed(): number {
    return this.failures;
  }

  /** Loaded chunk data, for systems that read chunk contents (the minimap). */
  *loaded(): Generator<ChunkData> {
    for (const slot of this.slots.values()) if (slot.state === "shown") yield slot.data;
  }

  /** Time of day and weather for every chunk (shared materials, so loaded and future chunks alike). */
  applyLook(look: Look): void {
    applyChunkLook(this.assets, look);
  }

  /** Distance from a point to the nearest edge of a chunk (0 inside it). */
  private distance(ref: ChunkRef, x: number, z: number): number {
    const size = this.map.chunkSize;
    const minX = this.map.bounds.minX + ref.col * size;
    const minZ = this.map.bounds.minZ + ref.row * size;
    const dx = Math.max(minX - x, 0, x - (minX + size));
    const dz = Math.max(minZ - z, 0, z - (minZ + size));
    return Math.hypot(dx, dz);
  }

  /** Chunks in load range of a point, nearest first. */
  private wanted(x: number, z: number): ChunkRef[] {
    const { bounds, chunkSize } = this.map;
    const reach = this.loadDistance;
    const out: Array<{ ref: ChunkRef; d: number }> = [];
    for (let col = Math.floor((x - reach - bounds.minX) / chunkSize); col <= Math.floor((x + reach - bounds.minX) / chunkSize); col++) {
      for (let row = Math.floor((z - reach - bounds.minZ) / chunkSize); row <= Math.floor((z + reach - bounds.minZ) / chunkSize); row++) {
        const ref = this.refs.get(`${col},${row}`);
        if (!ref) continue;
        const d = this.distance(ref, x, z);
        if (d <= reach) out.push({ ref, d });
      }
    }
    return out.sort((a, b) => a.d - b.d).map((e) => e.ref);
  }

  /**
   * Call every frame with the player's position.
   * @param all build every chunk that has arrived now (first frame, teleport) instead of one
   */
  update(x: number, z: number, all = false): void {
    this.focus = { x, z };
    for (const [key, slot] of this.slots) {
      const ref = this.refs.get(key)!;
      if (this.distance(ref, x, z) <= this.unloadDistance) continue;
      if (slot.state === "shown") this.drop(key, slot);
      // A chunk still loading is forgotten; its data is ignored when it arrives.
      this.slots.delete(key);
    }
    const wanted = this.wanted(x, z);
    for (const ref of wanted) {
      if (this.inFlight >= IN_FLIGHT) break;
      if (!this.slots.has(ref.key)) this.fetch(ref);
    }
    let built = false;
    for (const ref of wanted) {
      const slot = this.slots.get(ref.key);
      if (slot?.state !== "ready") continue;
      this.show(ref.key, slot.data);
      built = true;
      if (!all) break;
    }
    if (!built || all) this.settle();
  }

  /** Resolves once every chunk in range of a point has its meshes (start-up, teleport). */
  whenLoaded(x: number, z: number): Promise<void> {
    return new Promise((done) => {
      this.waiters.push({ x, z, done });
      this.settle();
    });
  }

  private settle(): void {
    if (this.waiters.length === 0) return;
    this.waiters = this.waiters.filter((w) => {
      const complete = this.wanted(w.x, w.z).every((ref) => this.slots.get(ref.key)?.state === "shown");
      if (complete) w.done();
      return !complete;
    });
  }

  private fetch(ref: ChunkRef): void {
    const slot: Slot = { state: "loading" };
    this.slots.set(ref.key, slot);
    this.inFlight++;
    this.source.load(ref).then(
      (data) => {
        this.inFlight--;
        // Still wanted (not unloaded and reloaded meanwhile)?
        if (this.slots.get(ref.key) === slot) this.slots.set(ref.key, { state: "ready", data });
        this.update(this.focus.x, this.focus.z, this.waiters.length > 0);
      },
      () => {
        this.inFlight--;
        this.failures++;
        if (this.slots.get(ref.key) === slot) this.slots.delete(ref.key);
      },
    );
  }

  private show(key: string, data: ChunkData): void {
    const view = new ChunkView(data, this.assets, this.spans.get(key) ?? [], chunkFurniture(this.map, data));
    this.slots.set(key, { state: "shown", data, view });
    this.scene.add(view.object);
    this.hooks.loaded(data);
  }

  private drop(key: string, slot: Extract<Slot, { state: "shown" }>): void {
    this.hooks.unloaded(slot.data);
    this.scene.remove(slot.view.object);
    slot.view.dispose();
    this.slots.delete(key);
  }
}

/** A source for maps held in memory (tests, hand-made maps). */
export function memorySource(chunks: readonly ChunkData[]): ChunkSource {
  const byKey = new Map(chunks.map((c) => [c.key, c]));
  return {
    load: (ref) => {
      const data = byKey.get(ref.key);
      return data ? Promise.resolve(data) : Promise.reject(new Error(`No chunk ${ref.key}.`));
    },
  };
}
