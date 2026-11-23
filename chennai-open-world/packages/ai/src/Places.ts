/**
 * What kind of place a stretch of pavement (or sand) is, and how many people and vehicles it
 * has at each hour (TD-31). Everything is read from the map the world already has: road classes
 * and names, shops and places of worship (OSM POIs), beaches (OSM `natural=beach`) and the sea,
 * railway stations and temple landmarks. Nothing is hand-placed.
 *
 * Pure logic: no rendering and no physics engine.
 */
import { SpatialGrid, boundsOf, closestOnSegment, pointInPolygon, roadSegmentsNear, type Area, type Bounds, type Landmark, type Point, type Poi, type Road, type Sea } from "@cow/game-world";

export type PlaceKind = "beach" | "promenade" | "market" | "station" | "temple" | "main-road" | "street" | "lane";

export const PLACE_KINDS: readonly PlaceKind[] = ["beach", "promenade", "market", "station", "temple", "main-road", "street", "lane"];

type Curve = ReadonlyArray<readonly [hour: number, value: number]>;

/**
 * People out, by kind of place and hour: on the beach per 1000 m² of sand, everywhere else per
 * 100 m of road (both pavements together). Estimates from how Chennai is used, not counts: the
 * beaches fill in the evening and at dawn (walkers), shopping streets by day and into the night,
 * stations at the rush hours, temples at dawn and dusk; residential lanes are sparse by day and
 * empty at night, while main roads always have someone.
 */
export const PLACE_PEOPLE: Readonly<Record<PlaceKind, Curve>> = {
  beach: [[0, 0.1], [4.5, 0.1], [6, 2.5], [8, 2], [10, 0.5], [15, 0.8], [17, 5], [18.5, 9], [20.5, 7], [22, 2], [23.5, 0.2], [24, 0.1]],
  promenade: [[0, 0.5], [4.5, 0.8], [6, 8], [8, 6], [10, 2], [15, 3], [17, 9], [19, 12], [21, 8], [23, 2], [24, 0.5]],
  market: [[0, 0.3], [6, 0.5], [8, 3], [10, 9], [13, 10], [15, 8], [17, 11], [20, 12], [21.5, 6], [23, 1], [24, 0.3]],
  station: [[0, 0.3], [4.5, 1], [7, 6], [8.5, 10], [10.5, 4], [16, 4], [17.5, 10], [19.5, 9], [21, 3], [23, 0.5], [24, 0.3]],
  temple: [[0, 0.2], [4.5, 1], [6, 6], [8, 5], [11, 2], [16, 2], [18, 7], [20, 6], [21.5, 1], [24, 0.2]],
  "main-road": [[0, 0.3], [5, 0.4], [7, 2], [9, 3], [13, 2.5], [17, 3.5], [20, 3], [22, 1], [24, 0.3]],
  street: [[0, 0.05], [5, 0.15], [7, 1.2], [9, 1.5], [13, 1], [17, 2], [21, 1.5], [23, 0.3], [24, 0.05]],
  lane: [[0, 0], [5, 0.05], [7, 0.6], [9, 0.6], [13, 0.4], [17, 0.8], [21, 0.5], [23, 0.05], [24, 0]],
};

/**
 * Share of the time-of-day traffic (`trafficDensity`) a kind of road carries: arterials and the
 * beach road busy, shopping streets nearly so, residential lanes quiet.
 */
export const PLACE_TRAFFIC: Readonly<Record<PlaceKind, number>> = {
  beach: 0,
  promenade: 1,
  market: 0.85,
  station: 0.85,
  temple: 0.65,
  "main-road": 1,
  street: 0.55,
  lane: 0.25,
};

function sample(curve: Curve, hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 1; i < curve.length; i++) {
    const [h1, v1] = curve[i]!;
    const [h0, v0] = curve[i - 1]!;
    if (h <= h1) return v0 + ((v1 - v0) * (h - h0)) / (h1 - h0);
  }
  return curve[curve.length - 1]![1];
}

/** People per 100 m of road (per 1000 m² of sand on the beach) at this kind of place and hour. */
export function placePeople(kind: PlaceKind, hour: number): number {
  return sample(PLACE_PEOPLE[kind], hour);
}

/** The most `placePeople` ever gives for a kind of place (crowds are generated at this and thinned by hour). */
export function placePeak(kind: PlaceKind): number {
  return Math.max(...PLACE_PEOPLE[kind].map(([, v]) => v));
}

/** How much traffic a road class can carry, relative to a residential street. */
const CARRIES: Readonly<Record<Road["kind"], number>> = { primary: 4, secondary: 3, tertiary: 2, residential: 1, service: 0.5, footway: 0 };

/** OSM shop and amenity values that make a street a shopping street. */
const SHOPS: ReadonlySet<string> = new Set([
  "clothes", "jewelry", "shoes", "fabric", "bag", "supermarket", "convenience", "greengrocer", "general", "fashion_accessories",
  "electronics", "mobile_phone", "cosmetics", "watches", "marketplace", "department_store", "mall", "variety_store", "tailor",
  "sari", "boutique", "gift", "toys", "books", "stationery", "bakery", "confectionery", "sweets", "fast_food", "restaurant", "cafe",
  "tea", "ice_cream", "pharmacy", "hardware", "electrical", "optician", "fruit", "vegetables", "butcher", "seafood", "kiosk",
]);
/** Shops within this distance of a stretch of road, and how many make it a market street. */
const MARKET_RADIUS = 90;
const MARKET_SHOPS = 9;
/** A residential street with at least this many shops near is a street, not a quiet lane. */
const STREET_SHOPS = 2;
/** Railway stations' forecourts and approach roads, metres. */
const STATION_RADIUS = 160;
/** Temple landmarks' streets, and the street outside a mapped place of worship, metres. */
const TEMPLE_RADIUS = 140;
const SHRINE_RADIUS = 45;
/** Roads this close to the sand are the beach front, metres. */
const PROMENADE_REACH = 70;
/** Road names that mean the sea front. */
const PROMENADE_NAME = /beach|promenade|marina/i;

/**
 * Shore sand not mapped as a beach: within this distance of the coastline, inland, near
 * something named for a beach (Elliot's Beach has a playground and a promenade in OSM, but no
 * `natural=beach`), and seaward of every road. An estimate (TD-31).
 */
const SHORE_WIDTH = 110;
const SHORE_ANCHOR = 700;
const SHORE_ROAD_CLEAR = 8;

export interface PlaceSources {
  readonly roads: readonly Road[];
  readonly areas: readonly Area[];
  readonly pois: readonly Poi[];
  readonly landmarks?: readonly Landmark[];
  readonly sea?: Sea;
  /** Railway stations (the rail file's). */
  readonly stations?: readonly Point[];
}

interface Beach {
  readonly outline: readonly Point[];
  readonly box: Bounds;
}

/** Where people are: the kind of each stretch of road and whether a point is on the sand. */
export class PlaceMap {
  private readonly roads: readonly Road[];
  private readonly shops = new SpatialGrid<Point>(MARKET_RADIUS);
  private readonly shrines = new SpatialGrid<Point>(SHRINE_RADIUS * 2);
  private readonly stations = new SpatialGrid<Point>(STATION_RADIUS);
  private readonly temples: readonly Point[];
  private readonly beaches: readonly Beach[];
  private readonly sea: Sea | undefined;
  private readonly seaBox: Bounds | null;
  /** Things named for a beach, which estimated shore sand must be near. */
  private readonly beachAnchors: readonly Point[];
  private readonly segmentKinds = new Map<string, PlaceKind>();

  constructor(sources: PlaceSources) {
    this.roads = sources.roads;
    for (const p of sources.pois) {
      if (SHOPS.has(p.kind)) this.shops.addPoint(p, p.x, p.z);
      if (p.kind === "place_of_worship") this.shrines.addPoint(p, p.x, p.z);
    }
    for (const s of sources.stations ?? []) this.stations.addPoint(s, s.x, s.z);
    this.temples = (sources.landmarks ?? []).filter((l) => l.kind === "temple");
    this.beaches = sources.areas.filter((a) => a.kind === "beach" && a.outline.length >= 3).map((a) => ({ outline: a.outline, box: boundsOf(a.outline) }));
    this.sea = sources.sea;
    this.seaBox = sources.sea ? boundsOf(sources.sea.outline) : null;
    const anchors: Point[] = [];
    for (const a of sources.areas) if (a.name && PROMENADE_NAME.test(a.name) && a.kind !== "water") anchors.push(boundsCentre(boundsOf(a.outline)));
    for (const p of sources.pois) if (p.name && /beach/i.test(p.name)) anchors.push(p);
    for (const l of sources.landmarks ?? []) if (l.kind === "beach") anchors.push(l);
    this.beachAnchors = anchors;
  }

  private count(grid: SpatialGrid<Point>, x: number, z: number, radius: number, enough: number): number {
    let n = 0;
    grid.near(x, z, radius, (p) => {
      if (Math.hypot(p.x - x, p.z - z) < radius) n++;
      return n >= enough;
    });
    return n;
  }

  /** In the sea (its outline reaches past the map, so this is cheap to rule out inland). */
  inSea(x: number, z: number): boolean {
    const box = this.seaBox;
    if (!this.sea || !box || x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) return false;
    return pointInPolygon(x, z, this.sea.outline);
  }

  /** On a mapped beach (OSM `natural=beach`), and not in the water. */
  onMappedBeach(x: number, z: number): boolean {
    for (const b of this.beaches) {
      if (x < b.box.minX || x > b.box.maxX || z < b.box.minZ || z > b.box.maxZ) continue;
      if (pointInPolygon(x, z, b.outline)) return !this.inSea(x, z);
    }
    return false;
  }

  /** Estimated shore sand: by the water near a named beach, seaward of the roads (see SHORE_WIDTH). */
  onShore(x: number, z: number): boolean {
    const sea = this.sea;
    if (!sea || this.beachAnchors.length === 0) return false;
    if (!this.beachAnchors.some((a) => Math.hypot(a.x - x, a.z - z) < SHORE_ANCHOR)) return false;
    let best: { x: number; z: number; d2: number } | null = null;
    for (let i = 0; i < sea.coast.length - 1; i++) {
      const hit = closestOnSegment({ x, z }, sea.coast[i]!, sea.coast[i + 1]!);
      if (!best || hit.d2 < best.d2) best = hit;
    }
    if (!best || best.d2 > SHORE_WIDTH * SHORE_WIDTH || this.inSea(x, z)) return false;
    // Seaward of every road: none within a few metres, and none between here and the water.
    const to = { x: best.x, z: best.z };
    let blocked = false;
    roadSegmentsNear(this.roads, (x + to.x) / 2, (z + to.z) / 2, Math.sqrt(best.d2) / 2 + SHORE_ROAD_CLEAR + 4, (road, i) => {
      const a = road.points[i]!;
      const b = road.points[i + 1]!;
      if (closestOnSegment({ x, z }, a, b).d2 < (road.width / 2 + SHORE_ROAD_CLEAR) ** 2 || crosses({ x, z }, to, a, b)) blocked = true;
      return blocked;
    });
    return !blocked;
  }

  /** On sand where people may stand or sit: a mapped beach, or estimated shore sand. */
  onSand(x: number, z: number): boolean {
    return this.onMappedBeach(x, z) || this.onShore(x, z);
  }

  /** True when the map has any beach (mapped or named) within `radius` of a point: cheap test before sampling sand. */
  nearBeach(x: number, z: number, radius: number): boolean {
    for (const b of this.beaches) if (x > b.box.minX - radius && x < b.box.maxX + radius && z > b.box.minZ - radius && z < b.box.maxZ + radius) return true;
    return this.sea !== undefined && this.beachAnchors.some((a) => Math.hypot(a.x - x, a.z - z) < SHORE_ANCHOR + radius);
  }

  /** The kind of place a segment of a road is (`i`: index of its first point), cached. */
  segmentKind(road: Road, i: number): PlaceKind {
    const key = `${road.id}:${i}`;
    let kind = this.segmentKinds.get(key);
    if (kind === undefined) {
      const a = road.points[i]!;
      const b = road.points[i + 1]!;
      kind = this.kindAt(road, (a.x + b.x) / 2, (a.z + b.z) / 2);
      this.segmentKinds.set(key, kind);
    }
    return kind;
  }

  /** The kind of place a point on a road is, by the rules above (in order of precedence). */
  kindAt(road: Pick<Road, "kind" | "name" | "width">, x: number, z: number): PlaceKind {
    if ((road.name && PROMENADE_NAME.test(road.name)) || this.besideSand(x, z, road.width / 2 + PROMENADE_REACH)) return "promenade";
    if (this.count(this.stations, x, z, STATION_RADIUS, 1) > 0) return "station";
    const shops = this.count(this.shops, x, z, MARKET_RADIUS, MARKET_SHOPS);
    if (shops >= MARKET_SHOPS) return "market";
    if (this.temples.some((t) => Math.hypot(t.x - x, t.z - z) < TEMPLE_RADIUS) || this.count(this.shrines, x, z, SHRINE_RADIUS, 1) > 0) return "temple";
    if (road.kind === "primary" || road.kind === "secondary") return "main-road";
    if (road.kind === "tertiary" || shops >= STREET_SHOPS) return "street";
    return "lane";
  }

  /** Sand within `reach` of a point (a few probes round it). */
  private besideSand(x: number, z: number, reach: number): boolean {
    if (!this.nearBeach(x, z, reach)) return false;
    for (let k = 0; k < 8; k++) {
      const angle = (k / 8) * Math.PI * 2;
      for (const r of [reach * 0.5, reach]) if (this.onMappedBeach(x + Math.sin(angle) * r, z + Math.cos(angle) * r)) return true;
    }
    return false;
  }

  /**
   * People per 100 m of road round a point (length-weighted over the roads within `radius`) and
   * the share of the traffic the area gets (0..1): for how many walkers and vehicles are out.
   */
  areaLevels(at: Point, hour: number, radius = 250): { people: number; traffic: number } {
    let length = 0;
    let people = 0;
    let driven = 0;
    let traffic = 0;
    const seen = new Set<string>();
    roadSegmentsNear(this.roads, at.x, at.z, radius, (road, i) => {
      const key = `${road.id}:${i}`;
      if (seen.has(key)) return;
      seen.add(key);
      const a = road.points[i]!;
      const b = road.points[i + 1]!;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      if (Math.abs(mx - at.x) > radius || Math.abs(mz - at.z) > radius) return;
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      const kind = this.segmentKind(road, i);
      length += l;
      people += l * placePeople(kind, hour);
      if (road.kind !== "footway" && road.kind !== "service") {
        // Weighted by how much the road can carry: an avenue through a quiet colony keeps it busy.
        const carries = l * CARRIES[road.kind];
        driven += carries;
        traffic += carries * PLACE_TRAFFIC[kind];
      }
    });
    return { people: length > 0 ? people / length : 0, traffic: driven > 0 ? traffic / driven : 0 };
  }
}

function boundsCentre(b: Bounds): Point {
  return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
}

/** Segments p-q and a-b cross. */
function crosses(p: Point, q: Point, a: Point, b: Point): boolean {
  const side = (o: Point, s: Point, t: Point) => (s.x - o.x) * (t.z - o.z) - (s.z - o.z) * (t.x - o.x);
  const d1 = side(a, b, p);
  const d2 = side(a, b, q);
  const d3 = side(p, q, a);
  const d4 = side(p, q, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * How many of a pool of walkers and vehicles to put out round the player: the pool times the
 * time of day (`trafficDensity`) times the area's share for traffic, and for walkers the area's
 * people per 100 m against `fullAt` (a pool fully out at that). Both at least `least`.
 */
export function areaCounts(levels: { people: number; traffic: number }, pools: { walkers: number; traffic: number }, trafficShare: number, least = 2, fullAt = 2.5): { walkers: number; traffic: number } {
  const walkers = pools.walkers * Math.min(1, levels.people / fullAt);
  // Never fewer than a third of the hour's traffic: even a lane has a main road near.
  const traffic = pools.traffic * trafficShare * Math.max(0.3, Math.min(1, levels.traffic));
  return { walkers: Math.max(Math.min(least, pools.walkers), walkers), traffic: Math.max(Math.min(least, pools.traffic), traffic) };
}
