/**
 * Reads an Overpass API JSON extract and returns its features in local metres.
 *
 * This module only translates OpenStreetMap into neutral geometry with the original tags.
 * Deciding what a feature looks like in the game (heights, colours, road widths) is the job of
 * `@cow/game-world`, so the two can change independently.
 */
import { GeoProjection, type LatLng, type LocalPoint } from "./projection";

interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}
interface OsmWay {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}
export interface OsmExtract {
  osm3s?: { timestamp_osm_base?: string };
  elements: Array<OsmNode | OsmWay | { type: string }>;
}

export type Tags = Readonly<Record<string, string>>;

export interface OsmLine {
  readonly id: number;
  readonly tags: Tags;
  readonly points: LocalPoint[];
}
export interface OsmPolygon {
  readonly id: number;
  readonly tags: Tags;
  /** Outline without a repeated last point. */
  readonly outline: LocalPoint[];
}
/**
 * A tagged node: a mapped tree, shop or amenity, a bus stop, a traffic signal, a tower, a
 * monument or a place of worship. The tags are kept as they are; `pointKind` sorts them.
 */
export interface OsmPoint extends LocalPoint {
  readonly id: number;
  readonly tags: Tags;
}

export type OsmPointKind = "tree" | "bus_stop" | "traffic_signals" | "place_of_worship" | "landmark" | "place" | "poi";

/** What a tagged node is, for the world builder; null for tags the game has no use for. */
export function pointKind(tags: Tags): OsmPointKind | null {
  if (tags.natural === "tree") return "tree";
  if (tags.highway === "bus_stop" || (tags.public_transport === "platform" && tags.bus === "yes")) return "bus_stop";
  if (tags.highway === "traffic_signals") return "traffic_signals";
  if (tags.amenity === "place_of_worship") return "place_of_worship";
  if (tags.man_made || tags.historic || tags.tourism) return "landmark";
  if (tags.place) return "place";
  if (tags.amenity || tags.shop) return "poi";
  return null;
}

export interface OsmFeatures {
  /** OSM data timestamp of the extract (ISO 8601), for attribution. */
  readonly timestamp: string;
  readonly highways: OsmLine[];
  readonly buildings: OsmPolygon[];
  /** Parks, water and other land areas, plus closed outlines of towers, monuments and places of worship that are not buildings. */
  readonly areas: OsmPolygon[];
  readonly points: OsmPoint[];
  /** Open `natural=coastline` ways (land on their left, as OSM defines it). */
  readonly coastlines?: OsmLine[];
}

const round = (value: number) => Math.round(value * 100) / 100;

export function parseOsm(extract: OsmExtract, origin: LatLng): OsmFeatures {
  if (!Array.isArray(extract.elements)) throw new Error("Not an Overpass JSON extract: no elements array.");
  const projection = new GeoProjection(origin);
  const nodes = new Map<number, LocalPoint>();
  const points: OsmPoint[] = [];

  for (const element of extract.elements) {
    if (element.type !== "node") continue;
    const node = element as OsmNode;
    const local = projection.toLocal({ lat: node.lat, lng: node.lon });
    const point = { x: round(local.x), z: round(local.z) };
    nodes.set(node.id, point);
    if (node.tags) points.push({ id: node.id, tags: node.tags, ...point });
  }

  const highways: OsmLine[] = [];
  const buildings: OsmPolygon[] = [];
  const areas: OsmPolygon[] = [];
  const coastlines: OsmLine[] = [];

  for (const element of extract.elements) {
    if (element.type !== "way") continue;
    const way = element as OsmWay;
    const tags = way.tags ?? {};
    const line: LocalPoint[] = [];
    for (const id of way.nodes) {
      const point = nodes.get(id);
      if (point) line.push(point);
    }
    if (line.length < 2) continue;

    if (tags.highway) {
      highways.push({ id: way.id, tags, points: line });
      continue;
    }
    const closed = way.nodes.length > 3 && way.nodes[0] === way.nodes[way.nodes.length - 1];
    if (tags.natural === "coastline" && !closed) {
      coastlines.push({ id: way.id, tags, points: line });
      continue;
    }
    if (!closed) continue;
    const outline = line.slice(0, -1);
    if (outline.length < 3) continue;
    if (tags.building) buildings.push({ id: way.id, tags, outline });
    else if (tags.leisure || tags.natural || tags.landuse || tags.man_made || tags.historic || tags.tourism || tags.amenity === "place_of_worship") {
      areas.push({ id: way.id, tags, outline });
    }
  }

  return { timestamp: extract.osm3s?.timestamp_osm_base ?? "unknown", highways, buildings, areas, points, coastlines };
}
