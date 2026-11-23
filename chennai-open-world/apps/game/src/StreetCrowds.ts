/**
 * The crowds round the player (TD-31): people standing, sitting and strolling wherever the place
 * and the hour call for them (`@cow/ai` `PlaceMap`, `CrowdField`), drawn as baked, instanced
 * figures (`CrowdFigures`): a few draw calls for the whole crowd, about 0.7k triangles a person,
 * within a hard cap. They are scenery: they step out of the player's way (and their vehicle's)
 * but are not bodies and take no part in fights.
 */
import type * as THREE from "three";
import { CrowdField, PlaceMap, type CrowdGround, type CrowdOptions, type CrowdPerson, type PlaceKind } from "@cow/ai";
import { SpatialGrid, boundsOf, nearestRoadPoint, pointInPolygon, type Building, type ChunkData, type Point, type WorldMap } from "@cow/game-world";
import type { CrowdFigures, CrowdPlacement } from "@cow/player";

/** Room kept from a building's walls, metres. */
const WALL_CLEAR = 0.7;

/**
 * Buildings from the streamed chunks (`ChunkManager.chunkAt`): a square of crowd is made once
 * its chunk is loaded, and nobody is put inside (or against) a building.
 */
export function chunkGround(chunkAt: (x: number, z: number) => ChunkData | null | undefined): CrowdGround {
  const grids = new WeakMap<ChunkData, SpatialGrid<{ outline: Building["outline"]; box: ReturnType<typeof boundsOf> }>>();
  const gridOf = (chunk: ChunkData) => {
    let grid = grids.get(chunk);
    if (!grid) {
      grid = new SpatialGrid(32);
      for (const b of chunk.buildings) {
        const box = boundsOf(b.outline);
        grid.add({ outline: b.outline, box }, box);
      }
      grids.set(chunk, grid);
    }
    return grid;
  };
  return {
    ready: (x, z) => chunkAt(x, z) !== undefined,
    solid: (x, z) => {
      let inside = false;
      // A building near a chunk edge can reach into the next chunk: look at both sides.
      for (const [dx, dz] of [[0, 0], [WALL_CLEAR, 0], [-WALL_CLEAR, 0], [0, WALL_CLEAR], [0, -WALL_CLEAR]] as const) {
        const chunk = chunkAt(x + dx, z + dz);
        if (!chunk) continue;
        gridOf(chunk).near(x, z, WALL_CLEAR, (b) => {
          if (x < b.box.minX - WALL_CLEAR || x > b.box.maxX + WALL_CLEAR || z < b.box.minZ - WALL_CLEAR || z > b.box.maxZ + WALL_CLEAR) return false;
          inside = [[0, 0], [WALL_CLEAR, 0], [-WALL_CLEAR, 0], [0, WALL_CLEAR], [0, -WALL_CLEAR]].some(([ox, oz]) => pointInPolygon(x + ox!, z + oz!, b.outline));
          return inside;
        });
        if (inside) return true;
      }
      return false;
    },
  };
}

/** Something moving through the crowd. */
export interface CrowdObstacle {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export class StreetCrowds {
  readonly places: PlaceMap;
  private readonly field: CrowdField;
  private figures: CrowdFigures | null = null;
  private bake: (() => Promise<CrowdFigures>) | null;
  private people: readonly CrowdPerson[] = [];
  private shown = false;
  private readonly placements: CrowdPlacement[] = [];

  constructor(private readonly map: WorldMap, stations: readonly Point[], private readonly scene: THREE.Object3D, bake: () => Promise<CrowdFigures>, ground: CrowdGround | null = null, options: Partial<CrowdOptions> = {}) {
    this.places = new PlaceMap({ roads: map.roads, areas: map.areas, pois: map.pois, stations, ...(map.landmarks ? { landmarks: map.landmarks } : {}), ...(map.sea ? { sea: map.sea } : {}) });
    this.field = new CrowdField(this.places, map.roads, options, ground);
    this.bake = bake;
  }

  /** The most people drawn at once. */
  get cap(): number {
    return this.field.options.cap;
  }

  /**
   * Once per drawn frame: who is out round the player now, and draw them.
   * @param time game seconds (strollers follow it)
   * @param visible false while the player is indoors or on a train: nobody drawn
   */
  frame(at: Point, hour: number, time: number, avoid: readonly CrowdObstacle[], visible = true): void {
    this.people = visible ? this.field.near(at, hour, time, avoid) : [];
    if (this.people.length > 0 && this.bake) {
      const bake = this.bake;
      this.bake = null;
      void bake()
        .then((figures) => {
          this.figures = figures;
          this.scene.add(figures.object);
        })
        .catch((error: unknown) => console.warn("Street crowds unavailable.", error));
    }
    if (!this.figures) return;
    if (this.people.length === 0 && !this.shown) return;
    this.placements.length = 0;
    for (const p of this.people) this.placements.push({ x: p.x, y: 0, z: p.z, yaw: p.yaw, walked: p.walked, look: p.look, sitting: p.sitting });
    this.figures.place(this.placements);
    this.shown = this.people.length > 0;
  }

  /** Tests and debugging: who is out round the player, by kind of place, and the kind underfoot. */
  snapshot(at: Point): { out: number; drawn: number; cap: number; within30: number; sitting: number; walking: number; onSand: number; byPlace: Partial<Record<PlaceKind, number>>; place: PlaceKind | "sand" | null } {
    const byPlace: Partial<Record<PlaceKind, number>> = {};
    let within30 = 0;
    let sitting = 0;
    let walking = 0;
    let onSand = 0;
    for (const p of this.people) {
      byPlace[p.kind] = (byPlace[p.kind] ?? 0) + 1;
      if (Math.hypot(p.x - at.x, p.z - at.z) < 30) within30++;
      if (p.sitting) sitting++;
      if (p.walked !== null) walking++;
      if (p.kind === "beach" && this.places.onSand(p.x, p.z)) onSand++;
    }
    let place: PlaceKind | "sand" | null = null;
    if (this.places.onSand(at.x, at.z)) place = "sand";
    else {
      const road = nearestRoadPoint(this.map, at, false);
      if (road && road.distance < road.road.width / 2 + 8) place = this.places.kindAt(road.road, road.x, road.z);
    }
    return { out: this.people.length, drawn: this.figures?.drawn ?? 0, cap: this.cap, within30, sitting, walking, onSand, byPlace, place };
  }

  /** Where each person is (tests: on the sand, not in the sea, off the carriageways). */
  positions(): Array<{ x: number; z: number; kind: PlaceKind; sitting: boolean }> {
    return this.people.map((p) => ({ x: p.x, z: p.z, kind: p.kind, sitting: p.sitting }));
  }
}
