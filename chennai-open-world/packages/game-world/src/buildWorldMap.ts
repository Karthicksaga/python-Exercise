/**
 * Turns OpenStreetMap features into the game's world.
 *
 * What comes from OSM: where roads run and their class, name and one-way rule (and their width
 * and lane count where mapped), building footprints (and heights or floor counts where mapped),
 * parks, water, beaches and the coastline, mapped trees and named places, bus stops and traffic
 * signals, and where landmarks stand (or the paths that let us derive it, see `landmarks.ts`).
 * What is invented here, because OSM does not have it for most of the city: road widths and
 * lane counts by class, building heights where neither `height` nor `building:levels` is mapped
 * (two floors, a little more for mapped apartments and commercial blocks), wall colours, extra
 * trees along avenues and in parks, and landmark heights and footprints. Everything is
 * deterministic.
 *
 * Built to scale to a whole city: every "what is near here" question goes through a grid.
 */
import { pointKind, type LatLng, type OsmFeatures, type Tags } from "@cow/map-data";
import { buildSea } from "./coast";
import { findLandmarks, insideLandmark } from "./landmarks";
import { SpatialGrid, boundsOf, centroid, clipLine, clipPolygon, closestOnSegment, insideBounds, pointInPolygon, signedArea } from "./geometry";
import type { Area, Bounds, Building, BuildingKind, BuiltWorld, ChunkData, District, NamedPoint, Poi, Point, Road, RoadKind, Tree } from "./types";
import { MAIN_ROADS } from "./types";

export interface BuildOptions {
  readonly name: string;
  readonly origin: LatLng;
  readonly bounds: Bounds;
  readonly chunkSize: number;
}

/** Road classes the game draws, with an estimated carriageway width for when OSM has none. */
const ROAD_CLASS: Record<string, { kind: RoadKind; width: number }> = {
  trunk: { kind: "primary", width: 16 },
  primary: { kind: "primary", width: 15 },
  trunk_link: { kind: "primary", width: 7 },
  primary_link: { kind: "primary", width: 7 },
  secondary: { kind: "secondary", width: 14 },
  secondary_link: { kind: "secondary", width: 7 },
  tertiary: { kind: "tertiary", width: 10 },
  tertiary_link: { kind: "tertiary", width: 6.5 },
  residential: { kind: "residential", width: 7 },
  unclassified: { kind: "residential", width: 7 },
  living_street: { kind: "residential", width: 6 },
  service: { kind: "service", width: 4 },
  footway: { kind: "footway", width: 2 },
  path: { kind: "footway", width: 2 },
  pedestrian: { kind: "footway", width: 3 },
};

/** Estimated lane width, metres, and the shoulder added to a mapped lane count. */
const LANE_WIDTH = 3.3;
const SHOULDER = 0.8;

/** Painted-plaster colours common on Chennai streets. Indexed by `Building.color` lookups in the codec. */
export const WALL_COLORS = [0xf2e3c6, 0xe8c9a0, 0xcfe3d4, 0xf4d6cf, 0xd9e2f0, 0xf7edb5, 0xe3d5ee, 0xfbf3e4, 0xc9dccb, 0xead9c4, 0xdfe7d2, 0xf1ddb8];
export const FLOOR_HEIGHT = 3.1;
/** Parapet on top of the last floor, metres. */
export const PARAPET = 0.9;
/** Floors given to a building when OSM has neither a height nor a floor count (the brief's default). */
export const DEFAULT_FLOORS = 2;

/** Stable pseudo-random number in [0, 1) from an id, so each feature always looks the same. */
function hash(id: number, salt = 0): number {
  let t = (id ^ (salt * 0x9e3779b9)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
}

/** The first number in a tag value ("7", "7.5 m", "3;2"), or NaN. */
function tagNumber(value: string | undefined): number {
  const match = /-?\d+(\.\d+)?/.exec(value ?? "");
  return match ? Number(match[0]) : NaN;
}

function toRoads(features: OsmFeatures, bounds: Bounds): Road[] {
  const roads: Road[] = [];
  for (const way of features.highways) {
    const klass = ROAD_CLASS[way.tags.highway ?? ""];
    if (!klass) continue;
    const footway = klass.kind === "footway";
    const mappedLanes = tagNumber(way.tags.lanes);
    const mappedWidth = tagNumber(way.tags.width);
    const lanes = !footway && mappedLanes >= 1 && mappedLanes <= 10 ? Math.round(mappedLanes) : undefined;
    let width = klass.width;
    if (mappedWidth >= 2 && mappedWidth <= 40) width = mappedWidth;
    else if (lanes !== undefined) width = Math.max(4, lanes * LANE_WIDTH + SHOULDER);
    width = Math.round(width * 10) / 10;
    const oneway = way.tags.oneway === "yes" || way.tags.oneway === "1" || way.tags.oneway === "true" || way.tags.oneway === "-1" || way.tags.junction === "roundabout";
    // `oneway=-1` runs against the way's direction: store it the way traffic goes.
    const points = way.tags.oneway === "-1" ? [...way.points].reverse() : way.points;
    clipLine(points, bounds).forEach((piece, i) => {
      roads.push({
        // Pieces of one way need distinct ids.
        id: way.id * 10 + i,
        kind: klass.kind,
        ...(way.tags.name ? { name: way.tags.name } : {}),
        width,
        ...(lanes !== undefined ? { lanes } : {}),
        oneway,
        points: piece,
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

/** True when the tags themselves say apartments or commercial (not guessed from the footprint). */
function taggedKind(tags: Tags): BuildingKind | null {
  const value = tags.building;
  if (value === "apartments" || value === "residential") return "apartments";
  if (value === "commercial" || value === "retail" || value === "office") return "commercial";
  return null;
}

export function toBuilding(id: number, tags: Tags, rawOutline: readonly Point[]): Building | null {
  const area = signedArea(rawOutline);
  if (Math.abs(area) < 12) return null; // sheds and mapping slivers
  // Normalise winding so walls always face outwards.
  const outline = area < 0 ? [...rawOutline].reverse() : [...rawOutline];
  const size = Math.abs(area);
  const kind = buildingKind(tags, size);
  const mappedHeight = tagNumber(tags.height);
  const mappedLevels = tagNumber(tags["building:levels"]);
  let floors: number;
  let height: number;
  let heightFrom: Building["heightFrom"];
  if (mappedHeight >= 2.5 && mappedHeight <= 250) {
    height = mappedHeight;
    floors = Math.max(1, Math.round((height - PARAPET) / FLOOR_HEIGHT));
    heightFrom = "height";
  } else {
    if (mappedLevels >= 1 && mappedLevels <= 60) {
      floors = Math.round(mappedLevels);
      heightFrom = "levels";
    } else {
      // Estimated. Explicitly tagged blocks get a little deterministic variety.
      const tagged = taggedKind(tags);
      const r = hash(id);
      floors = tagged === "apartments" ? 3 + Math.floor(r * 3) : tagged === "commercial" ? 2 + Math.floor(r * 3) : DEFAULT_FLOORS;
      heightFrom = "estimated";
    }
    height = floors * FLOOR_HEIGHT + PARAPET;
  }
  return {
    id,
    outline,
    floors,
    height: Math.round(height * 10) / 10,
    heightFrom,
    kind,
    color: WALL_COLORS[Math.floor(hash(id, 7) * WALL_COLORS.length)]!,
    ...(tags.name ? { name: tags.name } : {}),
  };
}

function areaKind(tags: Tags): Area["kind"] | null {
  if (tags.leisure === "park" || tags.leisure === "garden" || tags.leisure === "playground" || tags.landuse === "grass" || tags.landuse === "recreation_ground") return "park";
  if (tags.natural === "water") return "water";
  if (tags.natural === "beach" || tags.natural === "sand") return "beach";
  return null;
}

function toAreas(features: OsmFeatures, bounds: Bounds): Area[] {
  const areas: Area[] = [];
  for (const polygon of features.areas) {
    const kind = areaKind(polygon.tags);
    if (!kind) continue;
    if (!insideBounds(centroid(polygon.outline), bounds)) continue;
    areas.push({ id: polygon.id, kind, ...(polygon.tags.name ? { name: polygon.tags.name } : {}), outline: polygon.outline });
  }
  return areas;
}

/** "Is this point on a carriageway or inside a building", answered through grids. */
class Blockers {
  private readonly segments = new SpatialGrid<{ road: Road; i: number }>(50);
  private readonly footprints = new SpatialGrid<Building>(50);

  constructor(roads: readonly Road[], buildings: readonly Building[]) {
    for (const road of roads) {
      for (let i = 0; i < road.points.length - 1; i++) {
        const box = boundsOf([road.points[i]!, road.points[i + 1]!]);
        const pad = road.width / 2 + 1;
        this.segments.add({ road, i }, { minX: box.minX - pad, maxX: box.maxX + pad, minZ: box.minZ - pad, maxZ: box.maxZ + pad });
      }
    }
    for (const building of buildings) this.footprints.add(building, boundsOf(building.outline));
  }

  blocked(p: Point, clearance: number): boolean {
    const onRoad = this.segments.near(p.x, p.z, 0, ({ road, i }) => closestOnSegment(p, road.points[i]!, road.points[i + 1]!).d2 < (road.width / 2 + clearance) ** 2);
    if (onRoad) return true;
    return this.footprints.near(p.x, p.z, 0, (b) => pointInPolygon(p.x, p.z, b.outline));
  }
}

function generateTrees(roads: readonly Road[], areas: readonly Area[], blockers: Blockers, bounds: Bounds, planted: SpatialGrid<Point>): Tree[] {
  const trees: Tree[] = [];
  const add = (p: Point, seed: number) => {
    if (!insideBounds(p, bounds, 4) || blockers.blocked(p, 0.8)) return;
    if (planted.near(p.x, p.z, 6, (t) => (t.x - p.x) ** 2 + (t.z - p.z) ** 2 < 36)) return;
    const tree: Tree = { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, scale: 0.8 + hash(seed, 3) * 0.5, source: "generated" };
    trees.push(tree);
    planted.addPoint(tree, tree.x, tree.z);
  };

  // Avenue trees on both sides of the main roads.
  for (const road of roads) {
    if (!MAIN_ROADS.has(road.kind)) continue;
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
    const box = boundsOf(area.outline);
    const w = box.maxX - box.minX;
    const d = box.maxZ - box.minZ;
    const tries = Math.min(260, Math.round(Math.abs(signedArea(area.outline)) / 110) * 2);
    for (let i = 0; i < tries; i++) {
      const p = { x: box.minX + hash(area.id, i * 2 + 1) * w, z: box.minZ + hash(area.id, i * 2 + 2) * d };
      if (pointInPolygon(p.x, p.z, area.outline)) add(p, area.id + i);
    }
  }
  return trees;
}

const DISTRICT_PLACES = new Set(["suburb", "neighbourhood", "quarter", "locality"]);

export function buildWorldMap(features: OsmFeatures, options: BuildOptions): BuiltWorld {
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
  const blockers = new Blockers(roads, buildings);

  const trees: Tree[] = [];
  const planted = new SpatialGrid<Point>(12);
  const pois: Poi[] = [];
  const busStops: NamedPoint[] = [];
  const signals: Point[] = [];
  const districts: District[] = [];
  for (const point of features.points) {
    if (!insideBounds(point, bounds, 4)) continue;
    const kind = pointKind(point.tags);
    if (kind === "bus_stop") busStops.push({ x: point.x, z: point.z, ...(point.tags.name ? { name: point.tags.name } : {}) });
    if (kind === "traffic_signals") signals.push({ x: point.x, z: point.z });
    if (kind === "place" && DISTRICT_PLACES.has(point.tags.place ?? "")) {
      const name = point.tags["name:en"] ?? point.tags.name;
      if (name) districts.push({ name, kind: point.tags.place!, x: point.x, z: point.z });
    }
    // Mapped trees standing on a carriageway are median trees; medians aren't modelled yet, so
    // they are left out rather than planted in the traffic lane.
    if (point.tags.natural === "tree" && !blockers.blocked(point, 0.5)) {
      const tree: Tree = { x: point.x, z: point.z, scale: 0.9 + hash(point.id) * 0.4, source: "osm" };
      trees.push(tree);
      planted.addPoint(tree, tree.x, tree.z);
    }
    const poi = point.tags.amenity ?? point.tags.shop;
    if (poi) pois.push({ kind: poi, ...(point.tags.name ? { name: point.tags.name } : {}), x: point.x, z: point.z });
  }
  trees.push(...generateTrees(roads, areas, blockers, bounds, planted));
  // Nothing grows on a landmark's plinth, mapped or generated.
  const kept = trees.filter((tree) => !insideLandmark(tree, landmarks, 1.5));

  // Sort everything into the streaming grid by position; areas are cut to every square they cover.
  const chunks = new Map<string, { col: number; row: number; buildings: Building[]; trees: Tree[]; areas: Area[] }>();
  const chunkAt = (col: number, row: number) => {
    const key = `${col},${row}`;
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = { col, row, buildings: [], trees: [], areas: [] };
      chunks.set(key, chunk);
    }
    return chunk;
  };
  const colOf = (x: number) => Math.floor((x - bounds.minX) / chunkSize);
  const rowOf = (z: number) => Math.floor((z - bounds.minZ) / chunkSize);
  for (const building of buildings) {
    const c = centroid(building.outline);
    chunkAt(colOf(c.x), rowOf(c.z)).buildings.push(building);
  }
  for (const tree of kept) chunkAt(colOf(tree.x), rowOf(tree.z)).trees.push(tree);
  for (const area of areas) {
    const box = boundsOf(area.outline);
    for (let col = colOf(box.minX); col <= colOf(box.maxX); col++) {
      for (let row = rowOf(box.minZ); row <= rowOf(box.maxZ); row++) {
        const minX = bounds.minX + col * chunkSize;
        const minZ = bounds.minZ + row * chunkSize;
        const piece = clipPolygon(area.outline, { minX, maxX: minX + chunkSize, minZ, maxZ: minZ + chunkSize });
        if (piece.length > 0) chunkAt(col, row).areas.push({ id: area.id, kind: area.kind, outline: piece });
      }
    }
  }

  const chunkList: ChunkData[] = [...chunks.entries()].map(([key, c]) => ({ key, ...c })).sort((a, b) => a.row - b.row || a.col - b.col);
  const sea = buildSea(features, areas, bounds);

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
    districts,
    ...(sea ? { sea } : {}),
  };
}
