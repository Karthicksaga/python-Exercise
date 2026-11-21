/**
 * Traffic signals at the main junctions, and the zebra crossings in front of them.
 *
 * A junction gets signals where three or more drivable roads meet and at least one of them is
 * a main road (secondary or tertiary). Nodes a few metres apart (a staggered junction, a
 * short link between two carriageways) are treated as one junction. The arms are split into
 * two groups by direction, which take turns: green, amber, then a moment of all-red. Each
 * junction starts its cycle at a different time, so the city's lights don't all change at once.
 *
 * Every signalled arm with traffic coming in has a stop line and, just beyond it, a zebra
 * crossing placed where people walking along the cross road step over this one. Traffic stops
 * at the line on red, on amber when it can stop comfortably, and whenever someone is on the
 * crossing.
 *
 * Pure logic: no rendering and no physics engine.
 */
import type { GraphEdge, RoadGraph } from "./RoadGraph";

export interface SignalTiming {
  /** Seconds each group has green. */
  readonly green: number;
  readonly amber: number;
  /** Seconds when every arm shows red, between one group's amber and the other's green. */
  readonly allRed: number;
}

export const SIGNAL_TIMING: SignalTiming = { green: 12, amber: 3, allRed: 1 };

/** 0 green, 1 amber, 2 red: the order of the lamps from the bottom of the head. */
export type Light = 0 | 1 | 2;
export const GREEN: Light = 0;
export const AMBER: Light = 1;
export const RED: Light = 2;

/** Depth of a zebra crossing along the road, metres. */
export const ZEBRA_DEPTH = 3;
/** People walk this far outside the kerb (matches `pedestrianSettings`). */
const VERGE_WALK = 1.4;
/** Gap between the stop line and the crossing, metres. */
const LINE_GAP = 1;
/** Signal nodes closer than this are one junction, metres. */
const CLUSTER = 16;
/** Longest distance from the junction to its stop line, metres. */
const MAX_STOP_BACK = 16;

export interface Crossing {
  /** Centre of the zebra. */
  readonly x: number;
  readonly z: number;
  /** Unit direction of the road it crosses (direction of incoming traffic). */
  readonly dx: number;
  readonly dz: number;
  /** Along the road, metres. */
  readonly depth: number;
  /** Across the road (the road's width), metres. */
  readonly span: number;
}

export interface SignalApproach {
  /** Position in `TrafficSignals.approaches`. */
  readonly index: number;
  readonly junction: number;
  /** Incoming edge of the drive graph. */
  readonly edge: number;
  /** 0 or 1: which half of the cycle this arm has green. */
  readonly group: 0 | 1;
  /** Distance of the stop line before the end of `edge`, metres. */
  readonly stopBack: number;
  /** The stop line's point on the road's centre line. */
  readonly x: number;
  readonly z: number;
  /** Unit direction of travel towards the junction. */
  readonly dx: number;
  readonly dz: number;
  readonly width: number;
  readonly crossing: Crossing;
}

export interface SignalJunction {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  /** Graph nodes that make up the junction. */
  readonly nodes: readonly number[];
  readonly approaches: readonly SignalApproach[];
  /** Seconds added to the clock for this junction, so neighbours change at different times. */
  readonly offset: number;
}

/** Something that may be on a crossing. */
export interface Walker {
  readonly x: number;
  readonly z: number;
}

const isMain = (edge: GraphEdge) => edge.kind === "primary" || edge.kind === "secondary" || edge.kind === "tertiary";
/** A junction this close to a mapped OSM traffic_signals node is signalled whatever its roads, metres. */
const MAPPED_REACH = 20;

/** The other end of each edge's node, both directions, so one-way streets still count as arms. */
function neighbours(graph: RoadGraph): { incoming: number[][]; arms: Array<Set<number>> } {
  const incoming = graph.nodes.map((): number[] => []);
  const arms = graph.nodes.map(() => new Set<number>());
  graph.edges.forEach((edge, i) => {
    incoming[edge.to]!.push(i);
    arms[edge.from]!.add(edge.to);
    arms[edge.to]!.add(edge.from);
  });
  return { incoming, arms };
}

/**
 * Places vehicles take in turn: nodes where three or more roads meet, and sharp corners (a long
 * vehicle swings across the other lane there). Gives the radius of the area traffic crosses,
 * 0 for everywhere else.
 */
export function junctionRadii(graph: RoadGraph): Float32Array {
  const { incoming, arms } = neighbours(graph);
  const radius = new Float32Array(graph.nodes.length);
  graph.nodes.forEach((node, n) => {
    const around = [...arms[n]!];
    if (around.length < 2) return;
    if (around.length === 2) {
      const a = graph.nodes[around[0]!]!;
      const b = graph.nodes[around[1]!]!;
      const ax = a.x - node.x;
      const az = a.z - node.z;
      const bx = b.x - node.x;
      const bz = b.z - node.z;
      // A straight road has its two arms pointing opposite ways; turns of 60° or more count.
      if ((ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz)) < -0.5) return;
    }
    let widest = 0;
    for (const e of node.out) widest = Math.max(widest, graph.edges[e]!.width);
    for (const e of incoming[n]!) widest = Math.max(widest, graph.edges[e]!.width);
    radius[n] = widest / 2 + 1;
  });
  return radius;
}

export class TrafficSignals {
  readonly junctions: SignalJunction[] = [];
  /** Every signalled arm of every junction, in one list (one signal head each). */
  readonly approaches: SignalApproach[] = [];
  /** Seconds since the signals were switched on. */
  time = 0;
  private readonly byEdge = new Map<number, SignalApproach>();
  private readonly occupied: Uint8Array;
  private readonly cycle: number;

  constructor(
    graph: RoadGraph,
    readonly timing: SignalTiming = SIGNAL_TIMING,
    /** Mapped OSM `highway=traffic_signals` nodes: junctions near one get signals too. */
    mapped: ReadonlyArray<{ readonly x: number; readonly z: number }> = [],
  ) {
    this.cycle = 2 * (timing.green + timing.amber + timing.allRed);
    const { incoming, arms } = neighbours(graph);

    // 1. Nodes that qualify.
    const candidates: number[] = [];
    graph.nodes.forEach((node, n) => {
      if (arms[n]!.size < 3) return;
      const touching = [...node.out, ...incoming[n]!].map((e) => graph.edges[e]!);
      if (touching.some(isMain) || mapped.some((m) => Math.abs(m.x - node.x) < MAPPED_REACH && Math.abs(m.z - node.z) < MAPPED_REACH)) candidates.push(n);
    });

    // 2. Join those close together (grid buckets keep this linear on a big map).
    const parent = new Map<number, number>(candidates.map((n) => [n, n]));
    const root = (n: number): number => {
      let r = n;
      while (parent.get(r) !== r) r = parent.get(r)!;
      parent.set(n, r);
      return r;
    };
    const buckets = new Map<string, number[]>();
    const cell = (v: number) => Math.floor(v / CLUSTER);
    for (const n of candidates) {
      const { x, z } = graph.nodes[n]!;
      for (let i = -1; i <= 1; i++) {
        for (let k = -1; k <= 1; k++) {
          for (const m of buckets.get(`${cell(x) + i},${cell(z) + k}`) ?? []) {
            const other = graph.nodes[m]!;
            if (Math.hypot(other.x - x, other.z - z) < CLUSTER) parent.set(root(n), root(m));
          }
        }
      }
      const key = `${cell(x)},${cell(z)}`;
      buckets.set(key, [...(buckets.get(key) ?? []), n]);
    }
    const clusters = new Map<number, number[]>();
    for (const n of candidates) {
      const r = root(n);
      clusters.set(r, [...(clusters.get(r) ?? []), n]);
    }

    // 3. Arms, groups, stop lines and crossings.
    for (const members of clusters.values()) {
      const inside = new Set(members);
      const id = this.junctions.length;
      // Every arm leaving the junction, as a direction away from it and a width.
      const armsOut: Array<{ ax: number; az: number; width: number }> = [];
      const entering: number[] = [];
      for (const n of members) {
        for (const e of graph.nodes[n]!.out) {
          const edge = graph.edges[e]!;
          if (!inside.has(edge.to)) armsOut.push({ ax: edge.dx, az: edge.dz, width: edge.width });
        }
        for (const e of incoming[n]!) {
          const edge = graph.edges[e]!;
          if (inside.has(edge.from)) continue;
          armsOut.push({ ax: -edge.dx, az: -edge.dz, width: edge.width });
          entering.push(e);
        }
      }
      if (entering.length === 0) continue;
      // The widest arm sets the axis of the first group.
      const reference = entering.map((e) => graph.edges[e]!).reduce((a, b) => (b.width > a.width ? b : a));
      const approaches: SignalApproach[] = [];
      for (const e of entering) {
        const edge = graph.edges[e]!;
        const node = graph.nodes[edge.to]!;
        const ax = -edge.dx;
        const az = -edge.dz;
        const group: 0 | 1 = Math.abs(ax * reference.dx + az * reference.dz) >= Math.SQRT1_2 ? 0 : 1;
        // The crossing sits where people walking beside the cross road step over this arm.
        let halfCross = 0;
        for (const arm of armsOut) if (Math.abs(arm.ax * ax + arm.az * az) < 0.7) halfCross = Math.max(halfCross, arm.width / 2);
        if (halfCross === 0) for (const arm of armsOut) if (arm.ax * ax + arm.az * az < 0.99) halfCross = Math.max(halfCross, arm.width / 2);
        if (halfCross === 0) halfCross = edge.width / 2;
        const crossBack = Math.min(halfCross + VERGE_WALK, MAX_STOP_BACK - ZEBRA_DEPTH / 2 - LINE_GAP);
        const stopBack = crossBack + ZEBRA_DEPTH / 2 + LINE_GAP;
        const approach: SignalApproach = {
          index: this.approaches.length,
          junction: id,
          edge: e,
          group,
          stopBack,
          x: node.x - edge.dx * stopBack,
          z: node.z - edge.dz * stopBack,
          dx: edge.dx,
          dz: edge.dz,
          width: edge.width,
          crossing: { x: node.x - edge.dx * crossBack, z: node.z - edge.dz * crossBack, dx: edge.dx, dz: edge.dz, depth: ZEBRA_DEPTH, span: edge.width },
        };
        approaches.push(approach);
        this.approaches.push(approach);
        this.byEdge.set(e, approach);
      }
      const x = members.reduce((sum, n) => sum + graph.nodes[n]!.x, 0) / members.length;
      const z = members.reduce((sum, n) => sum + graph.nodes[n]!.z, 0) / members.length;
      // A spread of start times that doesn't depend on the order roads were listed in.
      const offset = (((Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 43758.5453) % 1) * this.cycle);
      this.junctions.push({ id, x, z, nodes: members, approaches, offset });
    }
    this.occupied = new Uint8Array(this.approaches.length);
  }

  /** The signalled arm that `edge` leads into, if any. */
  approachOn(edge: number): SignalApproach | undefined {
    return this.byEdge.get(edge);
  }

  /** What a group of a junction shows now. */
  light(junction: number, group: 0 | 1): Light {
    const { green, amber } = this.timing;
    const j = this.junctions[junction]!;
    const half = this.cycle / 2;
    let t = (this.time + j.offset + (group === 1 ? half : 0)) % this.cycle;
    if (t < 0) t += this.cycle;
    if (t < green) return GREEN;
    if (t < green + amber) return AMBER;
    return RED;
  }

  lightFor(approach: SignalApproach): Light {
    return this.light(approach.junction, approach.group);
  }

  /** Someone is on (or stepping onto) this arm's zebra crossing. */
  crossingBusy(approach: SignalApproach): boolean {
    return this.occupied[approach.index] === 1;
  }

  /**
   * Advance the clock and see who is on the crossings.
   * @param walkers people currently in the world
   */
  update(dt: number, walkers: readonly Walker[]): void {
    this.time += dt;
    this.occupied.fill(0);
    if (walkers.length === 0) return;
    // Only crossings near someone matter: a box round all the walkers rules out the rest of the city.
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const w of walkers) {
      minX = Math.min(minX, w.x);
      maxX = Math.max(maxX, w.x);
      minZ = Math.min(minZ, w.z);
      maxZ = Math.max(maxZ, w.z);
    }
    for (const a of this.approaches) {
      const c = a.crossing;
      const reach = c.span + c.depth;
      if (c.x < minX - reach || c.x > maxX + reach || c.z < minZ - reach || c.z > maxZ + reach) continue;
      for (const w of walkers) {
        const rx = w.x - c.x;
        const rz = w.z - c.z;
        if (Math.abs(rx) > c.span + c.depth || Math.abs(rz) > c.span + c.depth) continue;
        const along = Math.abs(rx * c.dx + rz * c.dz);
        const across = Math.abs(rx * c.dz - rz * c.dx);
        // A little wider than the road: someone just stepping off the kerb counts.
        if (along < c.depth / 2 + 0.5 && across < c.span / 2 + 0.6) {
          this.occupied[a.index] = 1;
          break;
        }
      }
    }
  }

  /**
   * Whether traffic on an arm has to stop at the line.
   * @param nose distance from the vehicle's front to the stop line, metres
   * @param braking the hardest deceleration the vehicle can manage, m/s²
   */
  mustStop(approach: SignalApproach, speed: number, nose: number, braking: number): boolean {
    if (this.crossingBusy(approach)) return true;
    const light = this.lightFor(approach);
    if (light === GREEN) return false;
    const needed = (speed * speed) / (2 * Math.max(nose, 0.01));
    // Amber: stop if that is comfortable, otherwise carry on through.
    if (light === AMBER) return needed <= braking * 0.55;
    // Red: stop unless it is physically too late.
    return needed <= braking;
  }
}
