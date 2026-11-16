/**
 * Turns OpenStreetMap features into the game's world.
 *
 * What comes from OSM: where roads run and their class and name, building footprints, parks,
 * mapped trees and named places, bus stops and traffic signals, and where landmarks stand (or
 * the paths that let us derive it, see `landmarks.ts`). What is invented here, because OSM does
 * not have it for this area: road widths (by class), building heights and floor counts (by
 * footprint size and type), wall colours, extra trees along avenues and in parks, and landmark
 * heights and footprints. Everything is deterministic.
 */
import { pointKind, type LatLng, type OsmFeatures, type Tags } from "@cow/map-data";
import { findLandmarks, insideLandmark } from "./landmarks";
import { centroid, clipLine, closestOnSegment, insideBounds, pointInPolygon, signedArea } from "./geometry";
import type { Area, Bounds, Building, BuildingKind, ChunkData, NamedPoint, Poi, Point, Road, RoadKind, Tree, WorldMap } from "./types";

export interface BuildOptions {
  readonly name: string;
  readonly origin: LatLng;
  readonly bounds: Bounds;
  readonly chunkSize: number;
}

const ROAD_CLASS: Record<string, { kind: RoadKind; width: number }> = {
  primary: { kind: "secondary", width: 15 },
  secondary: { kind: "secondary", width: 14 },
  tertiary: { kind: "tertiary", width: 10 },
  residential: { kind: "residential", width: 7 },
  unclassified: { kind: "residential", width: 7 },
  living_street: { kind: "residential", width: 6 },
  service: { kind: "service", width: 4 },
  footway: { kind: "footway", width: 2 },
  path: { kind: "footway", width: 2 },
  pedestrian: { kind: "footway", width: 3 },
};

/** Painted-plaster colours common on Chennai streets. */
const WALL_COLORS = [0xf2e3c6, 0xe8c9a0, 0xcfe3d4, 0xf4d6cf, 0xd9e2f0, 0xf7edb5, 0xe3d5ee, 0xfbf3e4, 0xc9dccb, 0xead9c4, 0xdfe7d2, 0xf1ddb8];
const FLOOR_HEIGHT = 3.1;

/** Stable pseudo-random number in [0, 1) from an id, so each feature always looks the same. */
function hash(id: number, salt = 0): number {
  let t = (id ^ (salt * 0x9e3779b9)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
}

function toRoads(features: OsmFeatures, bounds: Bounds): Road[] {
  const roads: Road[] = [];
  for (const way of features.highways) {
    const klass = ROAD_CLASS[way.tags.highway ?? ""];
    if (!klass) continue;
    const lanes = Number(way.tags.lanes);
    const width = Number.isFinite(lanes) && lanes > 0 && klass.kind !== "footway" ? Math.max(klass.width, lanes * 3.4) : klass.width;
    clipLine(way.points, bounds).forEach((points, piece) => {
      roads.push({
        // Pieces of one way need distinct ids.
        id: way.id * 10 + piece,
        kind: klass.kind,
        ...(way.tags.name ? { name: way.tags.name } : {}),
        width,
        oneway: way.tags.oneway === "yes",
        points,
      });
    });
  }
  return roads;
}

function buildingKind(tags: Tags, area: number): BuildingKind {
  const value = tags.building;
  if (value === "apartments" || value === "residential") return "apartments";
  if (value === "commercial" || value === "retail" || value === "office" || tags.shop || tags.amenity) return "commercial";
  return area > 420 ? "apartments" : "house";
}

function toBuilding(id: number, tags: Tags, rawOutline: readonly Point[]): Building | null {
  const area = signedArea(rawOutline);
  if (Math.abs(area) < 12) return null; // sheds and mapping slivers
  // Normalise winding so walls always face outwards.
  const outline = area < 0 ? [...rawOutline].reverse() : [...rawOutline];
  const size = Math.abs(area);
  const kind = buildingKind(tags, size);
  const tagged = Number(tags["building:levels"]);
  const r = hash(id);
  let floors: number;
  if (Number.isFinite(tagged) && tagged > 0) floors = Math.min(20, Math.round(tagged));
  else if (kind === "apartments") floors = 3 + Math.floor(r * 3);
  else if (kind === "commercial") floors = 2 + Math.floor(r * 3);
  else floors = size < 70 ? 1 + Math.floor(r * 2) : 2 + Math.floor(r * 2);
  return {
    id,
    outline,
    floors,
    height: Math.round((floors * FLOOR_HEIGHT + 0.9) * 10) / 10,
    kind,
    color: WALL_COLORS[Math.floor(hash(id, 7) * WALL_COLORS.length)]!,
    ...(tags.name ? { name: tags.name } : {}),
  };
}

function toAreas(features: OsmFeatures, bounds: Bounds): Area[] {
  const areas: Area[] = [];
  for (const polygon of features.areas) {
    const { tags } = polygon;
    const park = tags.leisure === "park" || tags.leisure === "garden" || tags.leisure === "playground" || tags.landuse === "grass" || tags.landuse === "recreation_ground";
    const water = tags.natural === "water";
    if (!park && !water) continue;
    if (!insideBounds(centroid(polygon.outline), bounds)) continue;
    areas.push({ id: polygon.id, kind: water ? "water" : "park", ...(tags.name ? { name: tags.name } : {}), outline: polygon.outline });
  }
  return areas;
}

/** True when a point is on a carriageway or inside a building. */
function blocked(p: Point, roads: readonly Road[], buildings: readonly Building[], clearance: number): boolean {
  for (const road of roads) {
    const reach = (road.width / 2 + clearance) ** 2;
    for (let i = 0; i < road.points.length - 1; i++) {
      if (closestOnSegment(p, road.points[i]!, road.points[i + 1]!).d2 < reach) return true;
    }
  }
  return buildings.some((b) => pointInPolygon(p.x, p.z, b.outline));
}

function generateTrees(roads: readonly Road[], areas: readonly Area[], buildings: readonly Building[], bounds: Bounds): Tree[] {
  const trees: Tree[] = [];
  const add = (p: Point, seed: number) => {
    if (!insideBounds(p, bounds, 4) || blocked(p, roads, buildings, 0.8)) return;
    if (trees.some((t) => (t.x - p.x) ** 2 + (t.z - p.z) ** 2 < 36)) return;
    trees.push({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, scale: 0.8 + hash(seed, 3) * 0.5, source: "generated" });
  };

  // Avenue trees on both sides of the main roads.
  for (const road of roads) {
    if (road.kind !== "secondary" && road.kind !== "tertiary") continue;
    let carried = 0;
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i]!;
      const b = road.points[i + 1]!;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.01) continue;
      const ux = (b.x - a.x) / length;
      const uz = (b.z - a.z) / length;
      const offset = road.width / 2 + 2.2;
      for (let d = 18 - carried; d < length; d += 18) {
        for (const side of [-1, 1]) {
          add({ x: a.x + ux * d - uz * offset * side, z: a.z + uz * d + ux * offset * side }, road.id + Math.round(d) * 31 + side);
        }
      }
      carried = (carried + length) % 18;
    }
  }

  // Parks: roughly one tree per 110 m².
  for (const area of areas) {
    if (area.kind !== "park") continue;
    const xs = area.outline.map((p) => p.x);
    const zs = area.outline.map((p) => p.z);
    const minX = Math.min(...xs);
    const minZ = Math.min(...zs);
    const w = Math.max(...xs) - minX;
    const d = Math.max(...zs) - minZ;
    const tries = Math.min(260, Math.round(Math.abs(signedArea(area.outline)) / 110) * 2);
    for (let i = 0; i < tries; i++) {
      const p = { x: minX + hash(area.id, i * 2 + 1) * w, z: minZ + hash(area.id, i * 2 + 2) * d };
      if (pointInPolygon(p.x, p.z, area.outline)) add(p, area.id + i);
    }
  }
  return trees;
}

export function buildWorldMap(features: OsmFeatures, options: BuildOptions): WorldMap {
  const { bounds, chunkSize } = options;
  const roads = toRoads(features, bounds);
  const areas = toAreas(features, bounds);
  const landmarks = findLandmarks(features, bounds);

  const buildings: Building[] = [];
  for (const polygon of features.buildings) {
    const middle = centroid(polygon.outline);
    if (!insideBounds(middle, bounds, 2)) continue;
    // A landmark has its own model; a mapped outline under it would be a second building.
    if (insideLandmark(middle, landmarks)) continue;
    const building = toBuilding(polygon.id, polygon.tags, polygon.outline);
    if (building) buildings.push(building);
  }

  const trees: Tree[] = [];
  const pois: Poi[] = [];
  const busStops: NamedPoint[] = [];
  const signals: Point[] = [];
  for (const point of features.points) {
    if (!insideBounds(point, bounds, 4)) continue;
    const kind = pointKind(point.tags);
    if (kind === "bus_stop") busStops.push({ x: point.x, z: point.z, ...(point.tags.name ? { name: point.tags.name } : {}) });
    if (kind === "traffic_signals") signals.push({ x: point.x, z: point.z });
    // Mapped trees standing on a carriageway are median trees; medians aren't modelled yet, so
    // they are left out rather than planted in the traffic lane.
    if (point.tags.natural === "tree" && !blocked(point, roads, buildings, 0.5)) {
      trees.push({ x: point.x, z: point.z, scale: 0.9 + hash(point.id) * 0.4, source: "osm" });
    }
    const poi = point.tags.amenity ?? point.tags.shop;
    if (poi) pois.push({ kind: poi, ...(point.tags.name ? { name: point.tags.name } : {}), x: point.x, z: point.z });
  }
  trees.push(...generateTrees(roads, areas, buildings, bounds));
  // Nothing grows on a landmark's plinth, mapped or generated.
  const planted = trees.filter((tree) => !insideLandmark(tree, landmarks, 1.5));

  // Sort everything into the streaming grid by position.
  const chunks = new Map<string, { col: number; row: number; buildings: Building[]; trees: Tree[] }>();
  const chunkAt = (p: Point) => {
    const col = Math.floor((p.x - bounds.minX) / chunkSize);
    const row = Math.floor((p.z - bounds.minZ) / chunkSize);
    const key = `${col},${row}`;
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = { col, row, buildings: [], trees: [] };
      chunks.set(key, chunk);
    }
    return chunk;
  };
  for (const building of buildings) chunkAt(centroid(building.outline)).buildings.push(building);
  for (const tree of planted) chunkAt(tree).trees.push(tree);

  const chunkList: ChunkData[] = [...chunks.entries()].map(([key, c]) => ({ key, ...c })).sort((a, b) => a.row - b.row || a.col - b.col);

  return {
    name: options.name,
    origin: options.origin,
    attribution: "© OpenStreetMap contributors",
    dataDate: features.timestamp,
    bounds,
    chunkSize,
    roads,
    areas,
    pois,
    chunks: chunkList,
    landmarks,
    busStops,
    signals,
  };
}
