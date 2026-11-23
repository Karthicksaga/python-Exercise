/**
 * Build step: the OSM railway extract (Overpass JSON) -> the rail file.
 *
 * Real (from OSM): track centre lines, station positions and names (English and Tamil), the
 * route each passenger service follows (its route relation's ways, in order), and where a
 * route leaves the map. Estimated (invented here): platform length, side and height, the
 * headway and the motion of the trains.
 */
import { GeoProjection, type LatLng } from "@cow/map-data";
import { RailPath, type Point2 } from "./path";
import { PLATFORM_EDGE, PLATFORM_WIDTH } from "./network";
import type { RailFile, RailLineData, RailStationData, RailStopData, RailTrackData } from "./types";

interface OsmNode {
  readonly type: "node";
  readonly id: number;
  readonly lat: number;
  readonly lon: number;
  readonly tags?: Readonly<Record<string, string>>;
}
interface OsmWay {
  readonly type: "way";
  readonly id: number;
  readonly nodes: readonly number[];
  readonly tags?: Readonly<Record<string, string>>;
}
interface OsmRelation {
  readonly type: "relation";
  readonly id: number;
  readonly members?: ReadonlyArray<{ readonly type: string; readonly ref: number; readonly role: string }>;
  readonly tags?: Readonly<Record<string, string>>;
}
export interface RailExtract {
  readonly osm3s?: { readonly timestamp_osm_base?: string };
  readonly elements: ReadonlyArray<OsmNode | OsmWay | OsmRelation | { readonly type: string }>;
}

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** A passenger service to build from a route relation. */
export interface LineSpec {
  readonly id: string;
  readonly relation: number;
  readonly name: string;
  /** Where trains come from and go to (used when the relation has no `from`/`to` tags). */
  readonly from: string;
  readonly to: string;
  readonly headwayMinutes: number;
  readonly offsetMinutes: number;
}

export interface BuildOptions {
  readonly origin: LatLng;
  readonly bounds: Bounds;
  readonly lines: readonly LineSpec[];
  /** Short names for stations whose OSM name is long or official: OSM name -> [English, Tamil]. */
  readonly names?: Readonly<Record<string, readonly [string, string]>>;
  /**
   * Hindi names for the boards where OSM has no `name:hi`: English (short) name -> Devanagari.
   * Transliterations written for the game (estimated), not official spellings.
   */
  readonly hindi?: Readonly<Record<string, string>>;
  /** How far past the map's edge a line is kept, metres (trains appear and vanish out there). */
  readonly margin?: number;
  /** Track ways to leave out (elevated or underground lines drawn wrongly at ground level). */
  readonly skipTrack?: (tags: Readonly<Record<string, string>>) => boolean;
}

const round = (v: number) => Math.round(v * 10) / 10;

function inside(p: Point2, b: Bounds, margin: number): boolean {
  return p.x >= b.minX - margin && p.x <= b.maxX + margin && p.z >= b.minZ - margin && p.z <= b.maxZ + margin;
}

/** Ways joined end to end in the order given, flipping any that run the other way. */
export function chainWays(ways: ReadonlyArray<readonly Point2[]>): Point2[] {
  const same = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z) < 1;
  const gap = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z);
  let line: Point2[] = [];
  for (const way of ways) {
    if (way.length < 2) continue;
    if (line.length === 0) {
      line = [...way];
      continue;
    }
    const head = line[0]!;
    const tail = line[line.length - 1]!;
    const first = way[0]!;
    const last = way[way.length - 1]!;
    // While only one way is in, it may itself be backwards.
    if (line.length > 0 && !same(tail, first) && !same(tail, last) && (same(head, first) || same(head, last))) line.reverse();
    const end = line[line.length - 1]!;
    const forward = gap(end, first) <= gap(end, last);
    const next = forward ? way : [...way].reverse();
    line.push(...(same(end, next[0]!) ? next.slice(1) : next));
  }
  return line;
}

/** The longest run of the line inside the bounds (plus margin), and whether each end ran on past it. */
export function clipLine(points: readonly Point2[], bounds: Bounds, margin: number): { points: Point2[]; startBeyond: boolean; endBeyond: boolean } {
  const box = { minX: bounds.minX - margin, maxX: bounds.maxX + margin, minZ: bounds.minZ - margin, maxZ: bounds.maxZ + margin };
  const runs: Array<{ points: Point2[]; startBeyond: boolean; endBeyond: boolean; length: number }> = [];
  let run: (typeof runs)[number] | null = null;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    // Liang–Barsky: the part of segment a-b inside the box, as t0..t1.
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    let t0 = 0;
    let t1 = 1;
    const edges: Array<[number, number]> = [[-dx, a.x - box.minX], [dx, box.maxX - a.x], [-dz, a.z - box.minZ], [dz, box.maxZ - a.z]];
    let visible = true;
    for (const [p, q] of edges) {
      if (p === 0) {
        if (q < 0) visible = false;
        continue;
      }
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
    }
    if (!visible || t0 > t1 || (t1 - t0) * Math.hypot(dx, dz) < 1e-6) {
      run = null;
      continue;
    }
    const from = { x: a.x + dx * t0, z: a.z + dz * t0 };
    const to = { x: a.x + dx * t1, z: a.z + dz * t1 };
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (!run || t0 > 0) {
      run = { points: [from], startBeyond: t0 > 0 || i > 0, endBeyond: false, length: 0 };
      runs.push(run);
    }
    run.points.push(to);
    run.length += length;
    run.endBeyond = t1 < 1 || i + 2 < points.length;
    if (t1 < 1) run = null;
  }
  const best = runs.reduce<(typeof runs)[number] | null>((a, b) => (!a || b.length > a.length ? b : a), null);
  if (!best) return { points: [], startBeyond: false, endBeyond: false };
  return { points: best.points, startBeyond: best.startBeyond, endBeyond: best.endBeyond };
}

function distanceToPolyline(p: Point2, line: readonly Point2[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const span2 = dx * dx + dz * dz;
    const t = span2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / span2)) : 0;
    best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t));
  }
  return best;
}

/**
 * The platform's side at a stop (estimated): whichever side leaves more room before the next
 * track, sampled along the platform.
 */
export function platformSide(path: RailPath, s: number, tracks: ReadonlyArray<readonly Point2[]>): 1 | -1 {
  const offset = PLATFORM_EDGE + PLATFORM_WIDTH / 2;
  const room = (side: 1 | -1) => {
    let least = Infinity;
    for (const ds of [-40, -20, 0, 20, 40]) {
      const p = path.beside(s + ds, side * offset);
      for (const track of tracks) least = Math.min(least, distanceToPolyline(p, track));
    }
    return least;
  };
  return room(1) >= room(-1) ? 1 : -1;
}

/**
 * Where the two directions' tracks run a few metres apart at a station and both platforms would
 * face the gap, make them one island platform filling it (estimated): the first line's stop draws
 * it, the other's is its twin (the same platform, not drawn or made solid twice).
 */
export function islands(lines: RailLineData[], tracks: ReadonlyArray<readonly Point2[]> = []): void {
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i]!;
      const b = lines[j]!;
      const pathA = RailPath.fromFlat(a.points);
      const pathB = RailPath.fromFlat(b.points);
      const stopsA = [...a.stops];
      const stopsB = [...b.stops];
      stopsA.forEach((stopA, ia) => {
        const ib = stopsB.findIndex((s) => s.id === stopA.id);
        if (ib < 0) return;
        const stopB = stopsB[ib]!;
        // Where each direction's track lies seen from the other (positive: on the left).
        const trackB = pathA.project(pathB.at(stopB.s)).lateral;
        const trackA = pathB.project(pathA.at(stopA.s)).lateral;
        const gap = Math.abs(trackB) - 2 * PLATFORM_EDGE;
        if (gap < 3 || gap > 14) return;
        // Not where another track runs through the gap (a main line between the suburban pair).
        const clear = [-40, 0, 40].every((ds) => {
          const p = pathA.beside(stopA.s + ds, trackB / 2);
          return tracks.every((track) => distanceToPolyline(p, track) > gap / 2 - 0.5);
        });
        if (!clear) return;
        stopsA[ia] = { ...stopA, side: trackB > 0 ? 1 : -1, width: round(gap) };
        stopsB[ib] = { ...stopB, side: trackA > 0 ? 1 : -1, width: round(gap), twin: true };
      });
      lines[i] = { ...a, stops: stopsA };
      lines[j] = { ...b, stops: stopsB };
    }
  }
}

export function buildRail(extract: RailExtract, options: BuildOptions): RailFile {
  const projection = new GeoProjection(options.origin);
  const margin = options.margin ?? 150;
  const nodes = new Map<number, OsmNode>();
  const local = new Map<number, Point2>();
  const ways = new Map<number, OsmWay>();
  const relations = new Map<number, OsmRelation>();
  for (const element of extract.elements) {
    if (element.type === "node") {
      const node = element as OsmNode;
      nodes.set(node.id, node);
      const p = projection.toLocal({ lat: node.lat, lng: node.lon });
      local.set(node.id, { x: p.x, z: p.z });
    } else if (element.type === "way") ways.set((element as OsmWay).id, element as OsmWay);
    else if (element.type === "relation") relations.set((element as OsmRelation).id, element as OsmRelation);
  }
  const wayPoints = (way: OsmWay): Point2[] => way.nodes.map((id) => local.get(id)).filter((p): p is Point2 => p !== undefined);

  // Tracks to draw: every rail way on the map, except ones the caller leaves out.
  const tracks: RailTrackData[] = [];
  const trackLines: Point2[][] = [];
  for (const way of ways.values()) {
    const tags = way.tags ?? {};
    if (tags.railway !== "rail") continue;
    if (options.skipTrack?.(tags)) continue;
    const clipped = clipLine(wayPoints(way), options.bounds, 40);
    if (clipped.points.length < 2) continue;
    trackLines.push(clipped.points);
    tracks.push({ id: way.id, kind: tags.service ? "service" : "main", points: clipped.points.flatMap((p) => [round(p.x), round(p.z)]) });
  }

  // Stations of the suburban railway (not the Metro's) on the map.
  const named = (tags: Readonly<Record<string, string>>): [string, string] => {
    const english = tags.name ?? "";
    const short = options.names?.[english];
    if (short) return [short[0], short[1]];
    return [english, tags["name:ta"] ?? ""];
  };
  const stationNodes = [...nodes.values()].filter((n) => {
    const tags = n.tags ?? {};
    return (tags.railway === "station" || tags.railway === "halt") && tags.station !== "subway" && tags.network !== "Chennai Metro" && tags.network !== "MRTS" && tags.name;
  });

  const lines: RailLineData[] = [];
  const stations = new Map<string, RailStationData>();
  for (const spec of options.lines) {
    const relation = relations.get(spec.relation);
    if (!relation?.members) throw new Error(`Route relation ${spec.relation} (${spec.name}) is missing or has no members; re-run scripts/fetch-rail.mjs.`);
    const memberWays = relation.members
      .filter((m) => m.type === "way" && (m.role === "" || m.role === "forward" || m.role === "backward"))
      .map((m) => ways.get(m.ref))
      .filter((w): w is OsmWay => w !== undefined && w.tags?.railway === "rail")
      .map(wayPoints);
    let full = chainWays(memberWays);
    // Run the line the way the service runs: its stop members (or `from` station) come first.
    const stopRefs = relation.members.filter((m) => m.type === "node" && m.role.startsWith("stop")).map((m) => local.get(m.ref)).filter((p): p is Point2 => p !== undefined);
    if (stopRefs.length >= 2 && full.length >= 2) {
      const path = new RailPath(full);
      if (path.project(stopRefs[0]!).s > path.project(stopRefs[stopRefs.length - 1]!).s) full = full.reverse();
    }
    const clipped = clipLine(full, options.bounds, margin);
    if (clipped.points.length < 2) continue;
    const path = new RailPath(clipped.points);
    const stops: RailStopData[] = [];
    const addStop = (node: OsmNode, at: Point2) => {
      const p = local.get(node.id)!;
      const [name, nameTa] = named(node.tags ?? {});
      if (stops.some((s) => s.id === String(node.id))) return;
      // Keep the platform whole on the line (and on the map).
      const s = Math.max(60, Math.min(path.length - 60, path.project(at).s));
      stops.push({ id: String(node.id), name, nameTa, s: round(s), side: platformSide(path, s, trackLines), width: PLATFORM_WIDTH });
      if (!stations.has(String(node.id))) {
        const nameHi = node.tags?.["name:hi"] ?? options.hindi?.[name] ?? "";
        stations.set(String(node.id), { id: String(node.id), name, nameTa, ...(nameHi ? { nameHi } : {}), x: round(p.x), z: round(p.z) });
      }
    };
    const stopPositions = stopRefs.filter((p) => inside(p, options.bounds, 0) && path.project(p).distance < 15);
    if (stopPositions.length > 0) {
      // The route's own stop positions (on its track), each named after the nearest station.
      for (const at of stopPositions) {
        let best: OsmNode | null = null;
        let bestDistance = 400;
        for (const node of stationNodes) {
          const p = local.get(node.id)!;
          const d = Math.hypot(p.x - at.x, p.z - at.z);
          if (d < bestDistance) {
            bestDistance = d;
            best = node;
          }
        }
        if (best) addStop(best, at);
      }
    } else {
      // No stop positions mapped: stations within a few tracks' width of the line.
      for (const node of stationNodes) {
        const p = local.get(node.id)!;
        if (!inside(p, options.bounds, 0) || path.project(p).distance > 90) continue;
        addStop(node, p);
      }
    }
    stops.sort((a, b) => a.s - b.s);
    const from = relation.tags?.from ?? spec.from;
    const to = relation.tags?.to ?? spec.to;
    lines.push({
      id: spec.id,
      name: spec.name,
      points: clipped.points.flatMap((p) => [round(p.x), round(p.z)]),
      stops,
      from: { name: from, beyond: clipped.startBeyond },
      to: { name: to, beyond: clipped.endBeyond },
      headwayMinutes: spec.headwayMinutes,
      offsetMinutes: spec.offsetMinutes,
    });
  }

  islands(lines, trackLines);
  const date = extract.osm3s?.timestamp_osm_base?.slice(0, 10) ?? "unknown date";
  return { attribution: `© OpenStreetMap contributors (railway data ${date})`, tracks, lines, stations: [...stations.values()] };
}
