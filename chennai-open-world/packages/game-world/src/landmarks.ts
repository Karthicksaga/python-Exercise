/**
 * Famous places: which ones the game knows, how to find each in an OpenStreetMap extract, and
 * the proportions of their models.
 *
 * A landmark is placed from OSM when the extract has a feature for it (a `man_made=tower`, a
 * named temple, a beach, a named district). When it doesn't, a landmark may say how to derive
 * its position from what is mapped around it. Heights, level counts and footprints are not in
 * OSM here; they come from published descriptions and are listed in each landmark's `estimated`.
 * Landmarks outside the extract are simply not found, so a bigger extract adds them with no
 * code change.
 */
import type { OsmFeatures, OsmPolygon, Tags } from "@cow/map-data";
import { centroid, insideBounds, pointInPolygon, signedArea } from "./geometry";
import type { Bounds, Landmark, LandmarkKind, Point } from "./types";

export interface LandmarkSpec {
  readonly id: string;
  readonly kind: LandmarkKind;
  readonly name: string;
  /** OSM features that are the landmark itself: one of these tag sets must match fully. */
  readonly tags: ReadonlyArray<Readonly<Record<string, string>>>;
  /** The feature's OSM name must match this... */
  readonly names: RegExp;
  /** ...or the feature must lie inside an OSM area whose name matches this. */
  readonly within?: RegExp;
  /**
   * How to place the landmark when OSM has no feature for it. "ring-path": the centre of the
   * most circular closed footpath inside the `within` area (paths that circle a monument).
   */
  readonly derive?: "ring-path";
  readonly height?: number;
  readonly levels?: number;
  readonly radius?: number;
  readonly opened?: number;
  /** Which of the fields above are estimated (none of them comes from OSM for these places). */
  readonly estimated: readonly string[];
}

/** The landmarks in the city jobs brief. Only Anna Nagar Tower is inside today's extract. */
export const LANDMARK_SPECS: readonly LandmarkSpec[] = [
  {
    id: "anna-nagar-tower",
    kind: "tower",
    name: "Anna Nagar Tower",
    tags: [{ man_made: "tower" }],
    names: /anna nagar tower|visves?varaya tower/i,
    within: /anna nagar tower park/i,
    derive: "ring-path",
    // Estimated from published descriptions, not OSM: about 41 m (135 ft) tall with about 12
    // levels, opened in 1968 (OSM `start_date`, when mapped, replaces the year). The footprint (plinth with steps) comes from the OSM outline when
    // there is one (about 20.6 m radius in the 16 Nov 2026 extract); 9.5 m is the fallback.
    height: 41,
    levels: 12,
    radius: 9.5,
    opened: 1968,
    estimated: ["height", "levels", "radius", "opened"],
  },
  {
    id: "kapaleeshwarar-temple",
    kind: "temple",
    name: "Kapaleeshwarar Temple",
    tags: [{ amenity: "place_of_worship" }, { building: "temple" }],
    names: /kapaleeswarar|kapaleeshwarar|kapali/i,
    // Estimated: the main gopuram is about 37 m tall. No model or footprint yet, label only.
    height: 37,
    estimated: ["height"],
  },
  { id: "marina-beach", kind: "beach", name: "Marina Beach", tags: [{ natural: "beach" }], names: /marina/i, estimated: [] },
  {
    id: "t-nagar",
    kind: "district",
    name: "T. Nagar",
    tags: [{ place: "suburb" }, { place: "neighbourhood" }, { place: "quarter" }],
    names: /^(t\.? ?nagar|thyagaraya ?nagar)$/i,
    estimated: [],
  },
];

/** Centre of area of a polygon (better than the vertex average when vertices are uneven). */
export function areaCentroid(outline: readonly Point[]): Point {
  const area = signedArea(outline);
  if (Math.abs(area) < 1e-6) return centroid(outline);
  let x = 0;
  let z = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const cross = a.x * b.z - b.x * a.z;
    x += (a.x + b.x) * cross;
    z += (a.z + b.z) * cross;
  }
  return { x: x / (6 * area), z: z / (6 * area) };
}

const tagsMatch = (tags: Tags, wanted: Readonly<Record<string, string>>) => Object.entries(wanted).every(([k, v]) => tags[k] === v);

interface Candidate extends Point {
  readonly source: string;
  /** Mean distance of a mapped outline from its centre, when the feature is an outline. */
  readonly radius?: number;
  /** Year from the feature's OSM `start_date`, when it has one. */
  readonly opened?: number;
}

/** The year in an OSM `start_date` ("1968", "1968-01-21" or "21/01/1968"), if any. */
export function startYear(tags: Tags): number | undefined {
  const match = /\b(1[5-9]\d\d|20\d\d)\b/.exec(tags.start_date ?? "");
  return match ? Number(match[1]) : undefined;
}

/** The mapped feature that is the landmark: an outline first (it gives a footprint), else a node. */
function osmFeature(spec: LandmarkSpec, features: OsmFeatures): Candidate | null {
  const enclosing = spec.within ? features.areas.filter((a) => spec.within!.test(a.tags.name ?? "")) : [];
  const accept = (tags: Tags, at: Point) => {
    if (!spec.tags.some((wanted) => tagsMatch(tags, wanted))) return false;
    if (spec.names.test(tags.name ?? "") || spec.names.test(tags["name:en"] ?? "")) return true;
    return enclosing.some((area) => pointInPolygon(at.x, at.z, area.outline));
  };
  const polygons: readonly OsmPolygon[] = [...features.buildings, ...features.areas];
  for (const polygon of polygons) {
    const at = areaCentroid(polygon.outline);
    if (!accept(polygon.tags, at)) continue;
    const radius = polygon.outline.reduce((sum, p) => sum + Math.hypot(p.x - at.x, p.z - at.z), 0) / polygon.outline.length;
    const opened = startYear(polygon.tags);
    return { ...at, radius, ...(opened !== undefined ? { opened } : {}), source: `OSM way ${polygon.id}` };
  }
  for (const point of features.points) {
    if (!accept(point.tags, point)) continue;
    const opened = startYear(point.tags);
    return { x: point.x, z: point.z, ...(opened !== undefined ? { opened } : {}), source: `OSM node ${point.id}` };
  }
  return null;
}

export interface Ring extends Point {
  /** OSM way id of the path. */
  readonly id: number;
  /** Mean distance of the path from its centre, metres. */
  readonly radius: number;
  /** (farthest - nearest) / mean distance; 0 for a perfect circle. */
  readonly roundness: number;
}

/** The most circular closed footpath inside an area, or null when there is none. */
export function ringPath(features: OsmFeatures, area: readonly Point[]): Ring | null {
  let best: Ring | null = null;
  for (const way of features.highways) {
    const kind = way.tags.highway;
    if (kind !== "footway" && kind !== "path" && kind !== "pedestrian") continue;
    const first = way.points[0]!;
    const last = way.points[way.points.length - 1]!;
    if (first.x !== last.x || first.z !== last.z) continue;
    const loop = way.points.slice(0, -1);
    if (loop.length < 8) continue;
    const centre = areaCentroid(loop);
    if (!pointInPolygon(centre.x, centre.z, area)) continue;
    const distances = loop.map((p) => Math.hypot(p.x - centre.x, p.z - centre.z));
    const radius = distances.reduce((sum, d) => sum + d, 0) / distances.length;
    if (radius < 8 || radius > 80) continue;
    const roundness = (Math.max(...distances) - Math.min(...distances)) / radius;
    if (roundness > 0.3) continue;
    if (!best || roundness < best.roundness) best = { id: way.id, x: centre.x, z: centre.z, radius, roundness };
  }
  return best;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Every catalogued landmark the extract has (or lets us derive), inside the playable area. */
export function findLandmarks(features: OsmFeatures, bounds: Bounds, specs: readonly LandmarkSpec[] = LANDMARK_SPECS): Landmark[] {
  const found: Landmark[] = [];
  for (const spec of specs) {
    let at: Candidate | null = osmFeature(spec, features);
    let radius = spec.radius;
    let estimated = [...spec.estimated];
    if (at?.radius !== undefined && radius !== undefined) {
      // A mapped outline is the footprint, so the radius is no longer estimated.
      radius = at.radius;
      estimated = estimated.filter((field) => field !== "radius");
    }
    const opened = at?.opened ?? spec.opened;
    if (at?.opened !== undefined) estimated = estimated.filter((field) => field !== "opened");
    if (!at && spec.derive === "ring-path" && spec.within) {
      const area = features.areas.find((a) => spec.within!.test(a.tags.name ?? ""));
      const ring = area ? ringPath(features, area.outline) : null;
      if (ring && area) {
        at = { x: ring.x, z: ring.z, source: `centre of the circular path OSM way ${ring.id} in ${area.tags.name}` };
        estimated.push("position");
        // Keep the plinth well inside the path around it.
        if (radius !== undefined) radius = Math.min(radius, Math.max(3, ring.radius - 4));
      }
    }
    if (!at || !insideBounds(at, bounds)) continue;
    found.push({
      id: spec.id,
      kind: spec.kind,
      name: spec.name,
      x: round(at.x),
      z: round(at.z),
      ...(spec.height !== undefined ? { height: spec.height } : {}),
      ...(spec.levels !== undefined ? { levels: spec.levels } : {}),
      ...(radius !== undefined ? { radius: round(radius) } : {}),
      ...(opened !== undefined ? { opened } : {}),
      source: at.source,
      estimated,
    });
  }
  return found;
}

/** True when a point is inside the solid footprint of any landmark, with extra clearance. */
export function insideLandmark(p: Point, landmarks: readonly Landmark[], clearance = 0): boolean {
  return landmarks.some((l) => l.radius !== undefined && (p.x - l.x) ** 2 + (p.z - l.z) ** 2 < (l.radius + clearance) ** 2);
}

export interface Ringed {
  /** Outer radius, metres. */
  readonly radius: number;
  /** Height of the top above the ground, metres. */
  readonly top: number;
}

/**
 * Proportions of the tower model, shared by its collision (`landmarkSolids`) and its mesh so
 * the two always agree. Invented to suit the estimated height and level count.
 */
export interface TowerProfile {
  /** Plinth steps, widest and lowest first. Each rise is low enough to walk up. */
  readonly steps: readonly Ringed[];
  /** The ground-floor drum. */
  readonly drum: Ringed;
  /** The central shaft the viewing levels ring. */
  readonly shaft: Ringed;
  /** The viewing levels, bottom first: floor height and balcony radius. */
  readonly levels: ReadonlyArray<{ readonly y: number; readonly radius: number }>;
  /** Roof over the top level. */
  readonly canopy: { readonly bottom: number; readonly top: number; readonly radius: number };
  /** Top of the finial: the full height. */
  readonly height: number;
}

export function towerProfile(tower: Landmark): TowerProfile {
  const footprint = tower.radius ?? 9.5;
  const height = tower.height ?? 41;
  const count = Math.max(2, tower.levels ?? 12);
  const rise = 0.18;
  const steps = [0, 1, 2].map((i) => ({ radius: round(footprint - i * 0.8), top: round(rise * (i + 1)) }));
  const plinthTop = steps[steps.length - 1]!.top;
  // The body grows a little with a wide mapped footprint, and shrinks with a small one.
  const scale = Math.max(0.5, Math.min(1.35, footprint / 9.5));
  const drum = { radius: round(4.4 * scale), top: round(plinthTop + 4.2) };
  const canopyTop = height - 1.6;
  const canopyBottom = canopyTop - 1.8;
  const first = drum.top + 2.2;
  const last = canopyBottom - 2.2;
  const levels = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return { y: round(first + (last - first) * t), radius: round((3.9 - 0.6 * t) * scale) };
  });
  return {
    steps,
    drum,
    shaft: { radius: round(2.3 * scale), top: round(canopyBottom) },
    levels,
    canopy: { bottom: round(canopyBottom), top: round(canopyTop), radius: round(4.3 * scale) },
    height,
  };
}
