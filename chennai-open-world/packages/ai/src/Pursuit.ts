/**
 * A vehicle that chases a moving target through the road network: the shortest way along the
 * roads (A*, worked out again every so often as the target moves), then straight at the
 * target once it is close and nothing is in the way. Used by police cars. It can stop short
 * of the target (to let officers out) or drive into it (ramming, at high wanted levels).
 *
 * Pure and kinematic like the traffic agents: it says where the vehicle is; the game moves a
 * collision box there and draws the model.
 */
import type { RoadGraph } from "./RoadGraph";

/** Index of the graph node nearest a point, or -1 for an empty graph. */
export function nearestNode(graph: RoadGraph, x: number, z: number): number {
  let best = -1;
  let bestDistance = Infinity;
  graph.nodes.forEach((node, i) => {
    if (node.out.length === 0) return; // a dead end of a one-way street: no way out
    const d = (node.x - x) ** 2 + (node.z - z) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  return best;
}

/**
 * Shortest route along the roads from one node to another (A*, straight-line distance as the
 * guide). Returns the nodes in order, starting with `from`, or null when there is no way (or
 * the search gave up after `limit` nodes, so a far target never costs a long frame).
 */
export function findRoute(graph: RoadGraph, from: number, to: number, limit = 8000): number[] | null {
  if (from < 0 || to < 0) return null;
  if (from === to) return [from];
  const goal = graph.nodes[to]!;
  const cost = new Map<number, number>([[from, 0]]);
  const cameFrom = new Map<number, number>();
  // A small binary heap of [estimate, node].
  const heap: Array<[number, number]> = [[0, from]];
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent]![0] <= heap[i]![0]) break;
      [heap[parent], heap[i]] = [heap[i]!, heap[parent]!];
      i = parent;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top;
  };
  const closed = new Set<number>();
  while (heap.length > 0 && closed.size < limit) {
    const [, node] = pop();
    if (closed.has(node)) continue;
    if (node === to) {
      const route = [to];
      let at = to;
      while (at !== from) {
        at = cameFrom.get(at)!;
        route.push(at);
      }
      return route.reverse();
    }
    closed.add(node);
    const base = cost.get(node)!;
    for (const e of graph.nodes[node]!.out) {
      const edge = graph.edges[e]!;
      const next = base + edge.length;
      if (next >= (cost.get(edge.to) ?? Infinity)) continue;
      cost.set(edge.to, next);
      cameFrom.set(edge.to, node);
      const n = graph.nodes[edge.to]!;
      push([next + Math.hypot(n.x - goal.x, n.z - goal.z), edge.to]);
    }
  }
  return null;
}

/** Length of a route along its nodes, metres. */
export function routeLength(graph: RoadGraph, route: readonly number[]): number {
  let length = 0;
  for (let i = 1; i < route.length; i++) {
    const a = graph.nodes[route[i - 1]!]!;
    const b = graph.nodes[route[i]!]!;
    length += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return length;
}

/** The world as a chasing vehicle needs it: is the straight line to a point free of walls? */
export interface PursuitWorld {
  clear(ax: number, az: number, bx: number, bz: number): boolean;
}

export interface PursuitGoal {
  readonly x: number;
  readonly z: number;
  /** The target's velocity, to aim a little ahead of it, m/s. */
  readonly vx: number;
  readonly vz: number;
}

export interface PursuitOptions {
  /** Top speed, m/s. */
  readonly topSpeed: number;
  /**
   * Stop this far (centre to centre, metres) from the target; null to drive into it (ramming),
   * keeping pace once alongside instead of stopping.
   */
  readonly stopShort: number | null;
  /** Seconds of the target's travel to aim ahead (a second car cutting it off aims further). */
  readonly lead: number;
}

/** A thing in the road ahead that the chaser must not drive through (traffic). */
export interface PursuitObstacle {
  readonly x: number;
  readonly z: number;
}

/** Tuning, game-design estimates. */
export const PURSUIT = {
  accel: 6,
  brake: 9,
  /** Turning rate, rad/s, at speed; slower when nearly stopped (a car can't turn on the spot). */
  turnRate: 2.4,
  /** A node counts as reached within this distance, metres. */
  reach: 5,
  /** How often the road route is worked out again, seconds. */
  replanEvery: 1.5,
  /** Within this distance, with a clear line, drive straight at the target, metres. */
  directRange: 35,
  /** Corner speed for a right-angle turn, m/s. */
  cornerSpeed: 6,
  /** Keep a little left of the road's middle (India drives on the left), metres. */
  lane: 1,
  /** Ramming: closing speed on the target once near, m/s, and when "alongside" counts, metres. */
  ramClosing: 4,
  contact: 3,
  /** Traffic within this corridor ahead makes the chaser slow down, metres. */
  obstacleAhead: 8,
  obstacleSide: 1.5,
} as const;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Pursuer {
  x: number;
  z: number;
  /** Heading in radians, 0 = towards -Z (north), positive turning left. */
  heading: number;
  speed = 0;
  /** "road" while following the route, "direct" while driving straight at the target. */
  mode: "road" | "direct" = "road";
  private graph: RoadGraph | null = null;
  private route: number[] = [];
  private step = 0;
  private replanIn = 0;
  private sinceClearCheck = 1;
  private clearLine = false;

  constructor(x: number, z: number, heading: number) {
    this.x = x;
    this.z = z;
    this.heading = heading;
  }

  /** Nodes still to drive through, for tests and the debug view. */
  get routeLeft(): readonly number[] {
    return this.route.slice(this.step);
  }

  /** Forget the route (the road graph was rebuilt, or the target jumped). */
  replan(): void {
    this.replanIn = 0;
  }

  private plan(graph: RoadGraph, goal: PursuitGoal): void {
    this.graph = graph;
    this.replanIn = PURSUIT.replanEvery;
    this.step = 0;
    const to = nearestNode(graph, goal.x, goal.z);
    const route = findRoute(graph, nearestNode(graph, this.x, this.z), to) ?? [];
    // The nearest junction may be one already passed: while the vehicle is already on the way
    // from the first node to the second, drop the first (no turning back to touch it).
    while (route.length >= 2) {
      const a = graph.nodes[route[0]!]!;
      const b = graph.nodes[route[1]!]!;
      const lx = b.x - a.x;
      const lz = b.z - a.z;
      const t = ((this.x - a.x) * lx + (this.z - a.z) * lz) / (lx * lx + lz * lz || 1);
      const side = Math.abs((this.x - a.x) * lz - (this.z - a.z) * lx) / (Math.hypot(lx, lz) || 1);
      const onTheWay = t > 0 && t < 1 && side < 12;
      if (!onTheWay && Math.hypot(this.x - a.x, this.z - a.z) > PURSUIT.reach) break;
      route.shift();
    }
    this.route = route;
  }

  /**
   * One step.
   * @param obstacles traffic and parked vehicles to slow down for
   */
  update(dt: number, graph: RoadGraph, goal: PursuitGoal, options: PursuitOptions, world: PursuitWorld, obstacles: readonly PursuitObstacle[] = []): void {
    if (graph !== this.graph) this.replanIn = 0;
    this.replanIn -= dt;
    const aimX = goal.x + goal.vx * options.lead;
    const aimZ = goal.z + goal.vz * options.lead;
    const toGoal = Math.hypot(goal.x - this.x, goal.z - this.z);

    // Straight at the target when it is close and the line is clear (checked a few times a second).
    this.sinceClearCheck += dt;
    if (toGoal < PURSUIT.directRange && this.sinceClearCheck > 0.25) {
      this.sinceClearCheck = 0;
      this.clearLine = world.clear(this.x, this.z, goal.x, goal.z);
    }
    this.mode = toGoal < PURSUIT.directRange && this.clearLine ? "direct" : "road";

    let targetX = aimX;
    let targetZ = aimZ;
    let desired: number = options.topSpeed;
    if (this.mode === "road") {
      if (this.replanIn <= 0) this.plan(graph, goal);
      // Skip the nodes already reached.
      while (this.step < this.route.length) {
        const node = graph.nodes[this.route[this.step]!]!;
        if (Math.hypot(node.x - this.x, node.z - this.z) > PURSUIT.reach) break;
        this.step++;
      }
      if (this.step < this.route.length) {
        const node = graph.nodes[this.route[this.step]!]!;
        const prev = this.step > 0 ? graph.nodes[this.route[this.step - 1]!]! : { x: this.x, z: this.z };
        const sx = node.x - prev.x;
        const sz = node.z - prev.z;
        const length = Math.hypot(sx, sz) || 1;
        // Drive a little left of the middle of the road.
        targetX = node.x + (sz / length) * PURSUIT.lane;
        targetZ = node.z - (sx / length) * PURSUIT.lane;
        // Slow for the corner at that node, in time to make it.
        const after = this.step + 1 < this.route.length ? graph.nodes[this.route[this.step + 1]!]! : null;
        if (after) {
          const turn = Math.abs(wrap(Math.atan2(after.x - node.x, after.z - node.z) - Math.atan2(sx, sz)));
          const corner = options.topSpeed - (options.topSpeed - PURSUIT.cornerSpeed) * Math.min(1, turn / (Math.PI / 2));
          const left = Math.hypot(node.x - this.x, node.z - this.z);
          desired = Math.min(desired, Math.sqrt(corner * corner + 2 * PURSUIT.brake * 0.5 * left));
        }
      }
    }

    // Stop short of the target, or close on it and keep pace once alongside (ramming).
    if (options.stopShort !== null) {
      const room = toGoal - options.stopShort;
      desired = Math.min(desired, room <= 0 ? 0 : Math.sqrt(2 * PURSUIT.brake * 0.5 * room));
    } else if (toGoal < 12) {
      const pace = Math.hypot(goal.vx, goal.vz);
      // Alongside, drop back a touch: a kinematic body that kept exact pace would push the
      // target along with it. Falling back and closing again gives repeated shunts instead.
      desired = Math.min(desired, toGoal < PURSUIT.contact ? Math.max(0, pace - 1) : pace + PURSUIT.ramClosing);
    }

    // Traffic ahead: slow to stop behind it.
    const fx = -Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    for (const o of obstacles) {
      const rx = o.x - this.x;
      const rz = o.z - this.z;
      const along = rx * fx + rz * fz;
      if (along <= 0 || along > PURSUIT.obstacleAhead) continue;
      if (Math.abs(rx * fz - rz * fx) > PURSUIT.obstacleSide) continue;
      desired = Math.min(desired, Math.max(0, along - 4) * 1.2);
    }

    // Steer towards the target; a target well behind means slowing down to turn round.
    const want = Math.atan2(-(targetX - this.x), -(targetZ - this.z));
    const off = wrap(want - this.heading);
    if (Math.abs(off) > 1.6) desired = Math.min(desired, 4);
    const rate = PURSUIT.turnRate * Math.min(1, 0.25 + this.speed / 6);
    this.heading = wrap(this.heading + Math.max(-rate * dt, Math.min(rate * dt, off)));

    if (this.speed < desired) this.speed = Math.min(desired, this.speed + PURSUIT.accel * dt);
    else this.speed = Math.max(desired, this.speed - PURSUIT.brake * dt);
    this.x += -Math.sin(this.heading) * this.speed * dt;
    this.z += -Math.cos(this.heading) * this.speed * dt;
  }
}
