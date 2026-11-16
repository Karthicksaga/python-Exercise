/**
 * The share auto job: a route along one real main road of Anna Nagar, the eastbound carriageway
 * of 2nd Avenue from Thirumangalam to Anna Nagar East, chained from its OpenStreetMap pieces.
 * Passengers are generated along it while the shift runs (`ShareShift` in `@cow/missions`).
 *
 * Real: the road, its direction and width, and the area names at its ends (nearest OSM place
 * points). Invented: where people wait, where they get off, and the fares (estimates).
 * Deterministic for a given map.
 */
import type { District, Point, Road, WorldMap } from "@cow/game-world";
import { RouteLine, SHARE_AUTO, shareEstimate, type Job, type ShareRoute } from "@cow/missions";
import type { Parking } from "./content";

export const SHARE_ROAD = "2nd Avenue, Anna Nagar West";
/** Roughly where the route should start: Thirumangalam, at 2nd Avenue's west end. */
const START_NEAR: Point = { x: -1200, z: 0 };
/** Seconds the clock waits until the player is in an auto this close to the route's start. */
const START_RADIUS = 150;
/** The share auto is parked this far along the route from its start. */
const PARK_AT = 25;

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const round = (p: Point): Point => ({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 });
const shortName = (road: string) => road.split(",")[0]!;

/**
 * One carriageway of a named road, as a single line in driving order: start at the piece
 * beginning nearest `near` and follow the pieces that begin where the last one ended.
 */
export function chainRoad(roads: readonly Road[], name: string, near: Point): { points: Point[]; width: number } | null {
  const pieces = roads.filter((r) => r.name === name && r.kind !== "footway" && r.points.length >= 2);
  let piece = pieces.reduce<Road | null>((best, r) => (!best || distance(r.points[0]!, near) < distance(best.points[0]!, near) ? r : best), null);
  if (!piece) return null;
  const width = piece.width;
  const used = new Set<Road>();
  const points: Point[] = [];
  while (piece && !used.has(piece)) {
    used.add(piece);
    for (const p of points.length ? piece.points.slice(1) : piece.points) points.push(round(p));
    const end = points[points.length - 1]!;
    piece = pieces.find((r) => !used.has(r) && distance(r.points[0]!, end) < 1.5) ?? null;
  }
  return { points, width };
}

/** The nearest named area that is not a lettered block ("AA Block"): a name people would say. */
function areaNear(districts: readonly District[], p: Point): string {
  const named = districts.filter((d) => !/\bBlock$/.test(d.name));
  const best = named.reduce<District | null>((b, d) => (!b || distance(d, p) < distance(b, p) ? d : b), null);
  return best?.name ?? "the end of the road";
}

/** The share auto job and the auto parked at the start of its route, or null without the road. */
export function shareAutoJob(map: WorldMap): { job: Job; parking: Parking } | null {
  const chain = chainRoad(map.roads, SHARE_ROAD, START_NEAR);
  if (!chain || chain.points.length < 2) return null;
  const first = chain.points[0]!;
  const last = chain.points[chain.points.length - 1]!;
  const districts = map.districts ?? [];
  const route: ShareRoute = {
    name: SHARE_ROAD,
    from: areaNear(districts, first),
    to: areaNear(districts, last),
    points: chain.points,
    // People wait just past the kerb; the auto pulls up in the left lane.
    kerb: Math.round((chain.width / 2 + 0.7) * 10) / 10,
    lane: Math.round((chain.width / 4) * 10) / 10,
  };
  const line = new RouteLine(route.points);
  const spot = line.pointAt(PARK_AT, Math.max(0.2, chain.width / 2 - 1.3));
  const parking: Parking = { id: "auto-share", kind: "auto", ...round(spot), yaw: Math.atan2(-spot.dx, -spot.dz), color: 0xf5c400 };
  const road = shortName(SHARE_ROAD);
  const job: Job = {
    id: "share-auto",
    kind: "share",
    title: "Share auto",
    brief: `Run a share auto down ${road}, ${route.from} to ${route.to}. People wave it down anywhere: pull up beside them to let them in (${SHARE_AUTO.capacity} seats), and stop where each one asks to get off. Fares are small (about ₹${SHARE_AUTO.baseFare} plus ₹${SHARE_AUTO.perKm} a km each, estimated); missing a drop or passing people by costs reputation.`,
    vehicle: "auto",
    stops: [{ label: `End of the route at ${route.to}`, ...last, radius: SHARE_AUTO.endRadius }],
    timeLimit: Math.round(line.length / 5 + 150),
    payout: shareEstimate(line.length),
    fine: 30,
    startRadius: START_RADIUS,
    share: route,
  };
  return { job, parking };
}
