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

export interface NamedPoint extends Point {
  readonly name?: string;
}

export interface Poi extends Point {
  /** OSM amenity or shop value, e.g. "hospital", "bakery". */
  readonly kind: string;
  readonly name?: string;
}

export type LandmarkKind = "tower" | "temple" | "beach" | "district";

/**
 * A famous place that gets its own model or label. Landmarks are always loaded (they are seen
 * from far away) and nothing generated is placed inside their footprint.
 */
export interface Landmark extends Point {
  /** Stable id, e.g. "anna-nagar-tower". */
  readonly id: string;
  readonly kind: LandmarkKind;
  /** Name shown on the label and the minimap. */
  readonly name: string;
  /** Height of the structure in metres, for those that have one. */
  readonly height?: number;
  /** Number of storeys or viewing levels, for those that have them. */
  readonly levels?: number;
  /** Radius of the solid footprint in metres (towers and temples). */
  readonly radius?: number;
  /** Year it opened, when known. */
  readonly opened?: number;
  /** Where the position came from: an OSM element, or how it was derived. */
  readonly source: string;
  /** Fields that are estimated rather than taken from OpenStreetMap, e.g. ["height", "levels"]. */
  readonly estimated: readonly string[];
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
  /**
   * Landmarks found in the extract, always loaded. Always present in a built world file;
   * optional so hand-made test maps can leave it out.
   */
  readonly landmarks?: readonly Landmark[];
  /** Mapped bus stops (OSM highway=bus_stop), for jobs. Optional like `landmarks`. */
  readonly busStops?: readonly NamedPoint[];
  /** Mapped traffic signals (OSM highway=traffic_signals), for traffic. Optional like `landmarks`. */
  readonly signals?: readonly Point[];
}
