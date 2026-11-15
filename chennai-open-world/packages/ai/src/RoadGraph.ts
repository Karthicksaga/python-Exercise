/**
 * The road network as a graph: junctions and bends are nodes, stretches of road between them
 * are directed edges. Built once from the world map; traffic and pedestrians navigate on it.
 */
import type { Road, RoadKind, WorldMap } from "@cow/game-world";

export interface GraphNode {
  readonly x: number;
  readonly z: number;
  /** Indices of the edges that leave this node. */
  readonly out: number[];
}

export interface GraphEdge {
  readonly from: number;
  readonly to: number;
  readonly length: number;
  /** Unit direction of travel. */
  readonly dx: number;
  readonly dz: number;
  readonly width: number;
  readonly kind: RoadKind;
}

export interface RoadGraph {
  readonly nodes: GraphNode[];
  readonly edges: GraphEdge[];
}

/**
 * @param include which roads to use (vehicles skip footpaths, pedestrians use everything)
 * @param respectOneWay false for pedestrians, who walk both ways on any street
 */
export function buildRoadGraph(map: WorldMap, include: (road: Road) => boolean, respectOneWay = true): RoadGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const index = new Map<string, number>();

  // Roads that meet share a point in OpenStreetMap, so equal coordinates mean a junction.
  const nodeAt = (x: number, z: number): number => {
    const key = `${x.toFixed(1)},${z.toFixed(1)}`;
    let id = index.get(key);
    if (id === undefined) {
      id = nodes.length;
      nodes.push({ x, z, out: [] });
      index.set(key, id);
    }
    return id;
  };
  const connect = (from: number, to: number, road: Road) => {
    const a = nodes[from]!;
    const b = nodes[to]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 0.5) return;
    a.out.push(edges.length);
    edges.push({ from, to, length, dx: (b.x - a.x) / length, dz: (b.z - a.z) / length, width: road.width, kind: road.kind });
  };

  for (const road of map.roads) {
    if (!include(road)) continue;
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = nodeAt(road.points[i]!.x, road.points[i]!.z);
      const b = nodeAt(road.points[i + 1]!.x, road.points[i + 1]!.z);
      if (a === b) continue;
      connect(a, b, road);
      if (!respectOneWay || !road.oneway) connect(b, a, road);
    }
  }
  return { nodes, edges };
}

/** Pick the edge to take after `edge`: any way onwards, turning back only at a dead end. */
export function nextEdge(graph: RoadGraph, edge: number, random: () => number): number {
  const current = graph.edges[edge]!;
  const options = graph.nodes[current.to]!.out.filter((candidate) => graph.edges[candidate]!.to !== current.from);
  const pool = options.length > 0 ? options : graph.nodes[current.to]!.out;
  // A one-way street can end with no way out; stay on the same edge and let the caller respawn.
  if (pool.length === 0) return edge;
  return pool[Math.floor(random() * pool.length)]!;
}
