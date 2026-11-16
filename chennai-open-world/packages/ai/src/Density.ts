/**
 * How busy the streets are: by time of day, by road class and by how many shops and services
 * are nearby. Data-driven, so a bigger map (with its own main roads and shopping streets)
 * gets busy in the right places without naming them.
 *
 * Pure logic: no rendering and no physics engine.
 */
import type { Point } from "@cow/game-world";
import type { RoadGraph } from "./RoadGraph";

type Curve = ReadonlyArray<readonly [hour: number, share: number]>;

/** Share of the traffic pool out at each hour: two rush hours, quiet after midnight. */
const TRAFFIC_BY_HOUR: Curve = [
  [0, 0.25], [5, 0.25], [7, 0.6], [8, 1], [10, 1], [11.5, 0.75], [16, 0.75], [17, 1], [20, 1], [22, 0.5], [24, 0.25],
];

/** People out walking: early start, a lull after lunch, busy evenings. */
const PEOPLE_BY_HOUR: Curve = [
  [0, 0.15], [5, 0.15], [6.5, 0.6], [9, 1], [13, 0.8], [15, 0.7], [17, 1], [21, 0.8], [23, 0.3], [24, 0.15],
];

function sample(curve: Curve, hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 1; i < curve.length; i++) {
    const [h1, v1] = curve[i]!;
    const [h0, v0] = curve[i - 1]!;
    if (h <= h1) return v0 + ((v1 - v0) * (h - h0)) / (h1 - h0);
  }
  return curve[curve.length - 1]![1];
}

/** 0..1: how much of the traffic pool is on the roads at this hour. */
export function trafficDensity(hour: number): number {
  return sample(TRAFFIC_BY_HOUR, hour);
}

/** 0..1: how many of the pedestrians are out at this hour. */
export function pedestrianDensity(hour: number): number {
  return sample(PEOPLE_BY_HOUR, hour);
}

/** How much more traffic a road class carries than a residential street. */
const CLASS_WEIGHT = { secondary: 2.6, tertiary: 1.8, residential: 1, service: 0.5, footway: 0.5 } as const;
/** Shops and services within this distance of a road make it busier, metres. */
const SHOP_RADIUS = 120;

/**
 * A weight per edge for where agents appear: main avenues and streets with shops nearby get
 * more. 1 is a residential street with nothing around it.
 */
export function edgeBusyness(graph: RoadGraph, pois: readonly Point[]): Float32Array {
  const weights = new Float32Array(graph.edges.length);
  graph.edges.forEach((edge, i) => {
    const from = graph.nodes[edge.from]!;
    const mx = from.x + edge.dx * edge.length * 0.5;
    const mz = from.z + edge.dz * edge.length * 0.5;
    let shops = 0;
    for (const p of pois) if (Math.abs(p.x - mx) < SHOP_RADIUS && Math.abs(p.z - mz) < SHOP_RADIUS && Math.hypot(p.x - mx, p.z - mz) < SHOP_RADIUS) shops++;
    weights[i] = CLASS_WEIGHT[edge.kind] * (1 + Math.min(shops, 6) * 0.15);
  });
  return weights;
}

/**
 * 0.75..1: how much of the (time-of-day) traffic an area gets, from the length-weighted
 * busyness of the roads around a point. Quiet residential corners get fewer vehicles.
 */
export function areaBusyness(graph: RoadGraph, weights: ArrayLike<number>, at: Point, radius = 250): number {
  let total = 0;
  let length = 0;
  graph.edges.forEach((edge, i) => {
    const from = graph.nodes[edge.from]!;
    const mx = from.x + edge.dx * edge.length * 0.5;
    const mz = from.z + edge.dz * edge.length * 0.5;
    if (Math.abs(mx - at.x) > radius || Math.abs(mz - at.z) > radius) return;
    total += weights[i]! * edge.length;
    length += edge.length;
  });
  if (length === 0) return 0.75;
  return Math.max(0.75, Math.min(1, 0.6 + 0.3 * (total / length)));
}
