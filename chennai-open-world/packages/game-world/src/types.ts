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

export type RoadKind = "primary" | "secondary" | "tertiary" | "residential" | "service" | "footway";

/** Arterial roads that get verges, avenue trees and lane markings. */
export const MAIN_ROADS: ReadonlySet<RoadKind> = new Set<RoadKind>(["primary", "secondary", "tertiary"]);

export interface Road {
  readonly id: number;
  readonly kind: RoadKind;
  readonly name?: string;
  /**
   * Carriageway width in metres: the OSM `width` tag when mapped, else the `lanes` tag times a
   * lane width, else estimated from the road class.
   */
  readonly width: number;
  /**
   * Traffic lanes in all: the OSM `lanes` tag when mapped, else estimated from the width.
   * Hand-made test maps may leave it out (see `laneCount`).
   */
  readonly lanes?: number;
  readonly oneway: boolean;
  readonly points: readonly Point[];
}

export type BuildingKind = "house" | "apartments" | "commercial";

export interface Building {
  readonly id: number;
  /** Footprint from OpenStreetMap, anticlockwise seen from above, last point not repeated. */
  readonly outline: readonly Point[];
  /**
   * Metres: the OSM `height` tag when mapped, else `building:levels` times a floor height, else
   * estimated (two floors, a little more for mapped apartments and commercial buildings).
   */
  readonly height: number;
  readonly floors: number;
  /** Where the height came from: OSM `height`, OSM `building:levels`, or an estimate. */
  readonly heightFrom?: "height" | "levels" | "estimated";
  readonly kind: BuildingKind;
  /** Wall colour as 0xRRGGBB (invented; OSM has no colours). */
  readonly color: number;
  readonly name?: string;
}

export type AreaKind = "park" | "water" | "beach";

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

/** A square of the streaming grid that has something in it; its contents are loaded on demand. */
export interface ChunkRef {
  readonly key: string;
  /** Grid column and row. */
  readonly col: number;
  readonly row: number;
}

/** One square of the streaming grid: the things loaded and unloaded as the player moves. */
export interface ChunkData extends ChunkRef {
  readonly buildings: readonly Building[];
  readonly trees: readonly Tree[];
  /** Parks, water and beaches cut to this square, so a big park is drawn by every square it covers. */
  readonly areas: readonly Area[];
}

/** A named district or neighbourhood (OSM `place` node), for "visited areas". */
export interface District extends Point {
  readonly name: string;
  /** OSM place value: suburb, neighbourhood, quarter, locality. */
  readonly kind: string;
}

/**
 * The sea, where the map has a coast: the coastline (land on its left, as in OSM) and the
 * water's outline, reaching well past the playable edge so the horizon is open water.
 */
export interface Sea {
  /** Coastline from one map edge to another (or the outline it was derived from). */
  readonly coast: readonly Point[];
  readonly outline: readonly Point[];
  /** Where the coastline came from: OSM ways, or how it was derived. */
  readonly source: string;
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
  /**
   * Road centre lines for the whole map: light, always in memory (AI, street names, minimap,
   * content). Their meshes are built per chunk.
   */
  readonly roads: readonly Road[];
  /** Areas that are always loaded. Streamed worlds keep their areas in the chunks instead. */
  readonly areas: readonly Area[];
  readonly pois: readonly Poi[];
  /** Squares of the streaming grid that have something in them. */
  readonly chunks: readonly ChunkRef[];
  /**
   * Landmarks found in the extract, always loaded. Always present in a built world file;
   * optional so hand-made test maps can leave it out.
   */
  readonly landmarks?: readonly Landmark[];
  /** Mapped bus stops (OSM highway=bus_stop), for jobs. Optional like `landmarks`. */
  readonly busStops?: readonly NamedPoint[];
  /** Mapped traffic signals (OSM highway=traffic_signals), for traffic. Optional like `landmarks`. */
  readonly signals?: readonly Point[];
  /** Named districts (OSM place nodes). Optional like `landmarks`. */
  readonly districts?: readonly District[];
  /** The sea, when the map reaches the coast. */
  readonly sea?: Sea;
}

/** A world straight from the builder, with every chunk's contents (the build step splits it into files). */
export interface BuiltWorld extends WorldMap {
  readonly chunks: readonly ChunkData[];
}
