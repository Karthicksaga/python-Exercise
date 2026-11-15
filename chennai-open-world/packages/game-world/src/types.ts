/**
 * Rendering-agnostic description of the game world.
 *
 * Plain data only: the renderer turns it into meshes and the physics package into solids.
 * All positions are metres in the local frame of `@cow/map-data` (+X east, -Z north).
 */
import type { LatLng } from "@cow/map-data";

export interface Point {
  readonly x: number;
  readonly z: number;
}

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export type RoadKind = "secondary" | "tertiary" | "residential" | "service" | "footway";

export interface Road {
  readonly id: number;
  readonly kind: RoadKind;
  readonly name?: string;
  /** Carriageway width in metres. Estimated from the road class; OSM rarely records it. */
  readonly width: number;
  readonly oneway: boolean;
  readonly points: readonly Point[];
}

export type BuildingKind = "house" | "apartments" | "commercial";

export interface Building {
  readonly id: number;
  /** Footprint from OpenStreetMap, anticlockwise seen from above, last point not repeated. */
  readonly outline: readonly Point[];
  /** Estimated: the extract has no heights or floor counts. */
  readonly height: number;
  readonly floors: number;
  readonly kind: BuildingKind;
  /** Wall colour as 0xRRGGBB (invented; OSM has no colours). */
  readonly color: number;
  readonly name?: string;
}

export type AreaKind = "park" | "water";

export interface Area {
  readonly id: number;
  readonly kind: AreaKind;
  readonly name?: string;
  readonly outline: readonly Point[];
}

export interface Tree extends Point {
  /** Size multiplier around 1. */
  readonly scale: number;
  /** "osm" trees are mapped; "generated" ones are added along avenues and in parks for looks. */
  readonly source: "osm" | "generated";
}

export interface Poi extends Point {
  /** OSM amenity or shop value, e.g. "hospital", "bakery". */
  readonly kind: string;
  readonly name?: string;
}

/** One square of the streaming grid: the things loaded and unloaded as the player moves. */
export interface ChunkData {
  readonly key: string;
  /** Grid column and row. */
  readonly col: number;
  readonly row: number;
  readonly buildings: readonly Building[];
  readonly trees: readonly Tree[];
}

export interface WorldMap {
  readonly name: string;
  /** Real-world position of local 0,0. */
  readonly origin: LatLng;
  /** Credit that must be shown wherever the map is used. */
  readonly attribution: string;
  /** OSM data timestamp of the extract. */
  readonly dataDate: string;
  /** Playable area. */
  readonly bounds: Bounds;
  /** Side of a streaming chunk in metres. */
  readonly chunkSize: number;
  /** Roads and areas are light and always loaded. */
  readonly roads: readonly Road[];
  readonly areas: readonly Area[];
  readonly pois: readonly Poi[];
  readonly chunks: readonly ChunkData[];
}
