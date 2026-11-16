/**
 * Road-following agents: traffic vehicles and pedestrians share this logic and differ only in
 * their settings (speed, how far from the centre line they keep, how sharply they turn).
 *
 * Each agent steers towards a "carrot" point a few metres ahead on its route, which gives
 * smooth cornering without path-planning. Agents slow down for anything in front of them and
 * are recycled to a new place when they get far from the player, so a small number of agents
 * makes the whole map feel populated.
 *
 * Vehicles also stop at red lights and for people on zebra crossings (`TrafficSignals`), and
 * take turns through junctions: before entering one, a vehicle claims it, and waits while
 * someone whose path crosses its own is inside. Vehicles from the same arm, or straight on from
 * opposite arms, share a junction.
 *
 * Pure logic: no rendering and no physics engine.
 */
import type { Bounds } from "@cow/game-world";
import { nextEdge, type GraphEdge, type RoadGraph } from "./RoadGraph";
import { junctionRadii, type TrafficSignals } from "./Signals";

/** One type of agent in a mixed pool (car, auto-rickshaw, bus, two-wheeler). */
export interface AgentKind {
  readonly name: string;
  /** Share of the pool, relative to the other kinds. */
  readonly share: number;
  /** Multiplies the road's cruising speed. */
  readonly speedFactor: number;
  /** Never faster than this, m/s. */
  readonly maxSpeed: number;
  /** Multiplies the settings' acceleration (a loaded bus pulls away slowly). */
  readonly accelerationFactor: number;
  /** Half the width and half the length of its footprint, metres. */
  readonly halfWidth: number;
  readonly halfLength: number;
  /** Gap kept to whatever is in front when stopped, front to back, metres. */
  readonly gap: number;
}

export interface AgentSettings {
  readonly count: number;
  /** Cruising speed on a road, m/s. `variation` is a stable 0..1 number per agent. */
  speed(edge: GraphEdge, variation: number): number;
  /** Distance kept to the left of the centre line (India drives on the left), metres. */
  lane(edge: GraphEdge, variation: number): number;
  /** How far ahead the steering target sits, metres. */
  readonly lookAhead: number;
  /** Fastest turn, radians per second. */
  readonly turnRate: number;
  readonly acceleration: number;
  readonly braking: number;
  /** Half the agent's width: how close something must be to its path to block it. */
  readonly halfWidth: number;
  /** Gap kept to whatever is in front when stopped, metres. */
  readonly gap: number;
  /**
   * Whether an agent coming the other way blocks the path. True for vehicles (a head-on car is
   * a real obstacle); false for pedestrians, who simply pass each other. Without this, two
   * people meeting on a footpath would stand face to face for ever.
   */
  readonly stopsForOncoming: boolean;
  /** Agents appear between these distances from the focus point and are recycled beyond `despawn`. */
  readonly spawnMin: number;
  readonly spawnMax: number;
  readonly despawn: number;
  /**
   * A mixed pool. Without it every agent is the same size (`halfWidth`, `gap`). Agents are
   * spread over the kinds by id, so any first part of the pool has a fair mix.
   */
  readonly kinds?: readonly AgentKind[];
  /** Whether agents take turns through junctions (vehicles do; people step round each other). */
  readonly takesTurnsAtJunctions?: boolean;
  /** Agents left over when the active count drops are put away once this far from the focus. */
  readonly retireBeyond?: number;
}

/** How far towards the kerb traffic moves for a siren, metres. */
const PULL_OVER = 1.8;
/** Traffic this close to a siren, and not well behind it, gives way. */
const SIREN_RANGE = 55;
/** Speed traffic slows to while giving way, m/s. */
const YIELD_SPEED = 2;
/** Stop lines further than this are ignored, metres. */
const SIGNAL_RANGE = 50;
/** Where the steering axle sits, as a share of the half length ahead of the middle. */
const FRONT_AXLE = 0.65;
/** A vehicle in a junction that has not moved for this long no longer holds others back, s. */
const JAMMED = 4;

/** An emergency vehicle with its siren on. */
export interface Siren {
  readonly x: number;
  readonly z: number;
  /** Heading of the emergency vehicle, radians. */
  readonly heading: number;
}

export interface Obstacle {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface Agent {
  readonly id: number;
  /** Stable 0..1 number, for picking a model, colour and pace. */
  readonly variation: number;
  /** Index into the settings' `kinds` (0 when the pool is not mixed). */
  readonly kind: number;
  /** False while put away because the streets are quiet: not moved, not drawn, not in the way. */
  active: boolean;
  x: number;
  z: number;
  /** Heading in radians, 0 = towards -Z (north), positive turning left. */
  heading: number;
  speed: number;
  /** Changes whenever the agent is moved to a new place (snap visuals instead of gliding). */
  generation: number;
  /** 0 (in lane) to 1 (pulled over to the kerb for an emergency vehicle). */
  pullOver: number;
  edge: number;
  next: number;
  /** Seconds spent unable to move. */
  stuck: number;
  /** Held at a stop line this step (red, amber, or someone on the crossing), or queued behind someone who is. */
  atSignal: boolean;
  /** Waiting for a crossing vehicle to clear a junction this step. */
  givingWay: boolean;
}

/** Which way a vehicle leaves a junction. India drives on the left, so right turns cross traffic. */
type Turn = -1 | 0 | 1;
const Turn = { Left: -1, Straight: 0, Right: 1 } as const;
// Turns are wide (vehicles reach the junction's middle before turning), so only vehicles from
// the same arm, or straight on and left from opposite arms, share a junction.

interface Claim {
  readonly agent: Agent;
  readonly dx: number;
  readonly dz: number;
  readonly turn: Turn;
}

/** Small deterministic generator so behaviour is repeatable in tests. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Kind for the agent with this id: a low-discrepancy spread, so every stretch of ids is mixed. */
function kindFor(id: number, kinds: readonly AgentKind[]): number {
  const total = kinds.reduce((sum, k) => sum + k.share, 0);
  const v = ((id * 0.6180339887) % 1) * total;
  let sum = 0;
  for (let i = 0; i < kinds.length; i++) {
    sum += kinds[i]!.share;
    if (v < sum) return i;
  }
  return kinds.length - 1;
}

/** Side of a spawn cell, metres. */
const CELL = 100;
const cellKey = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);

export class AgentSystem {
  readonly agents: Agent[] = [];
  readonly kinds: readonly AgentKind[];
  private readonly random: () => number;
  private signals: TrafficSignals | null = null;
  /** Spawn weight per edge, or null for an even spread. */
  private weights: ArrayLike<number> | null = null;
  /** Edges by the 100 m cell holding their midpoint, so spawning looks only near the focus. */
  private readonly cells = new Map<number, number[]>();
  /** Edges near the focus's cell with their cumulative weights; rebuilt when the focus moves cell. */
  private pool: { key: number; edges: Int32Array; cumulative: Float64Array } | null = null;
  private radius: Float32Array;
  private readonly claims = new Map<number, Claim[]>();
  /** Junction nodes each agent has claimed, by agent id. */
  private readonly holding: number[][] = [];
  private wanted: number;
  private retireNow = false;

  constructor(
    private graph: RoadGraph,
    private readonly bounds: Bounds,
    private readonly settings: AgentSettings,
    seed = 1,
  ) {
    this.random = seeded(seed);
    this.kinds = settings.kinds ?? [
      { name: "default", share: 1, speedFactor: 1, maxSpeed: Infinity, accelerationFactor: 1, halfWidth: settings.halfWidth, halfLength: settings.halfWidth, gap: settings.gap },
    ];
    this.radius = new Float32Array(0);
    this.wanted = graph.edges.length === 0 ? 0 : settings.count;
    if (graph.edges.length === 0) return; // nothing to drive on: no agents
    this.index(graph);
    for (let id = 0; id < settings.count; id++) {
      this.agents.push({
        id,
        variation: this.random(),
        kind: kindFor(id, this.kinds),
        active: true,
        x: 0,
        z: 0,
        heading: 0,
        speed: 0,
        generation: 0,
        pullOver: 0,
        edge: 0,
        next: 0,
        stuck: 0,
        atSignal: false,
        givingWay: false,
      });
      this.holding.push([]);
    }
  }

  /** Junction sizes and the spawn cells for a graph. */
  private index(graph: RoadGraph): void {
    this.graph = graph;
    this.radius = this.settings.takesTurnsAtJunctions ? junctionRadii(graph) : new Float32Array(graph.nodes.length);
    this.cells.clear();
    this.pool = null;
    graph.edges.forEach((edge, i) => {
      const from = graph.nodes[edge.from]!;
      const key = cellKey(Math.floor((from.x + edge.dx * edge.length * 0.5) / CELL), Math.floor((from.z + edge.dz * edge.length * 0.5) / CELL));
      const list = this.cells.get(key);
      if (list) list.push(i);
      else this.cells.set(key, [i]);
    });
  }

  /**
   * Move to a new road graph (the roads round a new area of a big map) without disturbing anyone:
   * every agent keeps the stretch of road it is on, found in the new graph by its end points.
   * Agents whose road is not in the new graph are moved to the spawn ring round `focus`.
   * Junction claims start afresh. Spawn weights must be set again for the new graph.
   * A graph with no edges is ignored (the agents stay where they are).
   */
  rebase(graph: RoadGraph, focus: { x: number; z: number }): void {
    if (graph.edges.length === 0 || this.agents.length === 0) return;
    const keyOf = (g: RoadGraph, e: number) => {
      const edge = g.edges[e]!;
      const a = g.nodes[edge.from]!;
      const b = g.nodes[edge.to]!;
      return `${a.x},${a.z}>${b.x},${b.z}`;
    };
    const byKey = new Map<string, number>();
    graph.edges.forEach((_, i) => byKey.set(keyOf(graph, i), i));
    const old = this.graph;
    const moved = this.agents.map((agent) => {
      const edge = byKey.get(keyOf(old, agent.edge));
      const next = byKey.get(keyOf(old, agent.next));
      return { edge, next };
    });
    this.claims.clear();
    for (const held of this.holding) held.length = 0;
    this.weights = null;
    this.index(graph);
    this.agents.forEach((agent, i) => {
      const { edge, next } = moved[i]!;
      if (edge === undefined) {
        this.place(agent, focus, false);
        return;
      }
      agent.edge = edge;
      agent.next = next ?? nextEdge(graph, edge, this.random);
    });
  }

  /** Obey these signals and crossings (vehicles only). */
  useSignals(signals: TrafficSignals | null): void {
    this.signals = signals;
  }

  /** Make agents appear more often on some edges (one weight per edge; see `edgeBusyness`). */
  setSpawnWeights(weights: ArrayLike<number> | null): void {
    this.weights = weights && weights.length === this.graph.edges.length ? weights : null;
    this.pool = null;
  }

  /**
   * How many agents should be out. Extra ones are put away once they are out of sight (or at
   * once with `immediately`); missing ones appear in the spawn ring, away from the player.
   */
  setActiveCount(count: number, immediately = false): void {
    this.wanted = Math.max(0, Math.min(this.agents.length, Math.round(count)));
    if (immediately) this.retireNow = true;
  }

  /** Agents out on the map now. */
  get activeCount(): number {
    let n = 0;
    for (const agent of this.agents) if (agent.active) n++;
    return n;
  }

  /** How many agents are wanted out (the last `setActiveCount`). */
  get wantedCount(): number {
    return this.wanted;
  }

  /** Put every agent on the map around a point. Call once before the first update. */
  populate(focus: { x: number; z: number }): void {
    for (const agent of this.agents) if (agent.active) this.place(agent, focus, true);
  }

  /** The edges within reach of the spawn ring around `focus`, weighted by busyness. */
  private poolAt(focus: { x: number; z: number }): { key: number; edges: Int32Array; cumulative: Float64Array } {
    const cx = Math.floor(focus.x / CELL);
    const cz = Math.floor(focus.z / CELL);
    const key = cellKey(cx, cz);
    if (this.pool?.key === key) return this.pool;
    const reach = Math.ceil(this.settings.spawnMax / CELL) + 1;
    const edges: number[] = [];
    for (let i = -reach; i <= reach; i++) for (let k = -reach; k <= reach; k++) edges.push(...(this.cells.get(cellKey(cx + i, cz + k)) ?? []));
    const cumulative = new Float64Array(edges.length);
    let sum = 0;
    edges.forEach((e, i) => (cumulative[i] = sum += this.weights ? Math.max(0, this.weights[e]!) : 1));
    this.pool = { key, edges: Int32Array.from(edges), cumulative };
    return this.pool;
  }

  /** A random edge near the focus (weighted), or anywhere when nothing is near. */
  private pickEdge(focus: { x: number; z: number }): number {
    const { edges, cumulative } = this.poolAt(focus);
    const total = cumulative.length > 0 ? cumulative[cumulative.length - 1]! : 0;
    if (total <= 0) return Math.floor(this.random() * this.graph.edges.length);
    const r = this.random() * total;
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid]! > r) hi = mid;
      else lo = mid + 1;
    }
    return edges[lo]!;
  }

  /** Move an agent to a random stretch of road in the spawn ring around the focus. */
  private place(agent: Agent, focus: { x: number; z: number }, anyDistance: boolean): void {
    const { graph, settings, bounds } = this;
    this.releaseAll(agent);
    let chosen = -1;
    let chosenAlong = 0.5;
    for (let attempt = 0; attempt < 40; attempt++) {
      const candidate = this.pickEdge(focus);
      const edge = graph.edges[candidate]!;
      const from = graph.nodes[edge.from]!;
      if (edge.length < 6) continue;
      const t = 0.3 + this.random() * 0.4;
      const mx = from.x + edge.dx * edge.length * t;
      const mz = from.z + edge.dz * edge.length * t;
      // Keep clear of the map edge, where roads are cut off.
      if (mx < bounds.minX + 15 || mx > bounds.maxX - 15 || mz < bounds.minZ + 15 || mz > bounds.maxZ - 15) continue;
      const distance = Math.hypot(mx - focus.x, mz - focus.z);
      const minimum = anyDistance ? settings.spawnMin * 0.4 : settings.spawnMin;
      if (distance < minimum || distance > settings.spawnMax) continue;
      // Not inside a junction.
      const s = edge.length * t;
      if (s < this.radius[edge.from]! + 2 || edge.length - s < this.radius[edge.to]! + 2) continue;
      // Not on top of another agent.
      if (this.agents.some((other) => other !== agent && other.active && Math.hypot(other.x - mx, other.z - mz) < 12)) continue;
      chosen = candidate;
      chosenAlong = t;
      break;
    }
    if (chosen === -1) chosen = this.pickEdge(focus);

    const edge = graph.edges[chosen]!;
    const from = graph.nodes[edge.from]!;
    const lane = settings.lane(edge, agent.variation);
    agent.pullOver = 0;
    const along = edge.length * chosenAlong;
    agent.edge = chosen;
    agent.next = nextEdge(graph, chosen, this.random);
    agent.x = from.x + edge.dx * along + edge.dz * lane;
    agent.z = from.z + edge.dz * along - edge.dx * lane;
    agent.heading = Math.atan2(-edge.dx, -edge.dz);
    agent.speed = 0;
    agent.stuck = 0;
    agent.generation++;
  }

  /**
   * The steering target: a point `lookAhead` metres further along the route, in the agent's lane.
   * Measured from the front axle (`px`, `pz`), so a long bus turns when its front reaches the
   * corner rather than its middle.
   */
  private carrot(agent: Agent, px: number, pz: number): { x: number; z: number } {
    const { graph, settings } = this;
    let edge = graph.edges[agent.edge]!;
    let from = graph.nodes[edge.from]!;
    let along = (px - from.x) * edge.dx + (pz - from.z) * edge.dz + settings.lookAhead;
    const following = graph.edges[agent.next]!;
    // Look round the corner only when the route carries on roughly forwards. At a sharp turn or
    // a dead end the next stretch doubles back, so a target on it would move *towards* the
    // agent as it approached and the agent would circle without ever reaching the corner.
    // There, aim at the end of the current stretch and turn once it has been reached.
    const gentle = edge.dx * following.dx + edge.dz * following.dz > 0.3;
    if (along > edge.length && agent.next !== agent.edge && gentle) {
      along -= edge.length;
      edge = following;
      from = graph.nodes[edge.from]!;
    }
    const lane = settings.lane(edge, agent.variation) + agent.pullOver * PULL_OVER;
    const s = Math.min(along, edge.length);
    return { x: from.x + edge.dx * s + edge.dz * lane, z: from.z + edge.dz * s - edge.dx * lane };
  }

  /** Speed that brings the front to a halt `room` metres ahead, braking at half the maximum. */
  private stopSpeed(room: number): number {
    const left = room - 0.3;
    return left <= 0.05 ? 0 : Math.sqrt(this.settings.braking * left);
  }

  /** Distance from the agent's front to a stop line it must stop at, or Infinity. */
  private signalStop(agent: Agent, kind: AgentKind, edge: GraphEdge, along: number): number {
    const { signals } = this;
    if (!signals) return Infinity;
    const remaining = edge.length - along;
    let approach = signals.approachOn(agent.edge);
    let toLine: number;
    if (approach) toLine = remaining - approach.stopBack;
    else {
      if (agent.next === agent.edge) return Infinity;
      approach = signals.approachOn(agent.next);
      if (!approach) return Infinity;
      toLine = remaining + this.graph.edges[agent.next]!.length - approach.stopBack;
    }
    const nose = toLine - kind.halfLength;
    // Already over the line: committed.
    if (nose < 0 || nose > SIGNAL_RANGE) return Infinity;
    return signals.mustStop(approach, agent.speed, nose, this.settings.braking) ? nose : Infinity;
  }

  private turnOf(edge: GraphEdge, next: GraphEdge): Turn {
    if (edge.dx * next.dx + edge.dz * next.dz < -0.7) return Turn.Right; // a U-turn crosses everything
    const cross = edge.dx * next.dz - edge.dz * next.dx;
    return cross > 0.35 ? Turn.Right : cross < -0.35 ? Turn.Left : Turn.Straight;
  }

  /** Whether a vehicle may enter a junction alongside everyone already inside. */
  private compatible(node: number, agent: Agent, dx: number, dz: number, turn: Turn): boolean {
    for (const claim of this.claims.get(node) ?? []) {
      if (claim.agent === agent || claim.agent.stuck > JAMMED) continue;
      const dot = dx * claim.dx + dz * claim.dz;
      // Same arm: following, the path check keeps the gap.
      if (dot > 0.7) continue;
      // Opposite arms pass each other unless one turns across the other.
      if (dot < -0.7 && turn !== Turn.Right && claim.turn !== Turn.Right) continue;
      return false;
    }
    return true;
  }

  private release(agent: Agent, node: number): void {
    const list = this.claims.get(node);
    if (list) {
      const i = list.findIndex((c) => c.agent === agent);
      if (i >= 0) list.splice(i, 1);
      if (list.length === 0) this.claims.delete(node);
    }
    const held = this.holding[agent.id];
    if (held) {
      const k = held.indexOf(node);
      if (k >= 0) held.splice(k, 1);
    }
  }

  private releaseAll(agent: Agent): void {
    const held = this.holding[agent.id];
    if (!held) return;
    for (const node of [...held]) this.release(agent, node);
  }

  /** Let go of junctions left behind. */
  private releasePassed(agent: Agent, kind: AgentKind, edge: GraphEdge): void {
    const held = this.holding[agent.id]!;
    for (let i = held.length - 1; i >= 0; i--) {
      const n = held[i]!;
      if (n === edge.to) continue;
      const node = this.graph.nodes[n]!;
      if (Math.hypot(agent.x - node.x, agent.z - node.z) > this.radius[n]! + kind.halfLength + 0.5) this.release(agent, n);
    }
  }

  /** Distance from the agent's front to a junction it must wait at, or Infinity. Claims it when free. */
  private junctionGate(agent: Agent, kind: AgentKind, edge: GraphEdge, along: number, mayEnter: boolean): number {
    const { graph } = this;
    const held = this.holding[agent.id]!;
    const n = edge.to;
    const r = this.radius[n]!;
    if (r === 0 || held.includes(n) || agent.next === agent.edge) return Infinity;
    const nose = edge.length - along - r - kind.halfLength;
    // Decide in time to stop at half braking.
    if (nose > 1.5 + (agent.speed * agent.speed) / this.settings.braking) return Infinity;
    if (!mayEnter && nose > 0) return Infinity;
    const turn = this.turnOf(edge, graph.edges[agent.next]!);
    if (nose < -0.5 || this.compatible(n, agent, edge.dx, edge.dz, turn)) {
      const list = this.claims.get(n) ?? [];
      list.push({ agent, dx: edge.dx, dz: edge.dz, turn });
      this.claims.set(n, list);
      held.push(n);
      return Infinity;
    }
    return Math.max(0, nose);
  }

  /** Apply `setActiveCount`: bring agents out or put them away. */
  private applyActive(focus: { x: number; z: number }): void {
    const retireBeyond = this.settings.retireBeyond ?? this.settings.spawnMin;
    for (const agent of this.agents) {
      const wanted = agent.id < this.wanted;
      if (wanted && !agent.active) {
        agent.active = true;
        this.place(agent, focus, this.retireNow);
      } else if (!wanted && agent.active && (this.retireNow || Math.hypot(agent.x - focus.x, agent.z - focus.z) > retireBeyond)) {
        agent.active = false;
        agent.speed = 0;
        agent.atSignal = false;
        agent.givingWay = false;
        this.releaseAll(agent);
        agent.generation++;
      }
    }
    this.retireNow = false;
  }

  /**
   * Advance every agent.
   * @param obstacles things to stop for besides other agents (the player, parked vehicles)
   * @param focus where the player is; agents far from it are moved somewhere closer
   * @param siren an emergency vehicle that traffic pulls over for, if any
   */
  update(dt: number, obstacles: readonly Obstacle[], focus: { x: number; z: number }, siren: Siren | null = null): void {
    const { graph, settings, kinds } = this;
    this.applyActive(focus);
    for (const agent of this.agents) {
      if (!agent.active) continue;
      const kind = kinds[agent.kind]!;
      const edge = graph.edges[agent.edge]!;
      const from = graph.nodes[edge.from]!;
      const fx = -Math.sin(agent.heading);
      const fz = -Math.cos(agent.heading);

      // How far ahead is the nearest thing in the agent's path? Distances are from its front
      // to the near side of the other thing, which is a box seen at an angle.
      const reach = kind.gap + agent.speed * 1.1 + 2 + kind.halfLength;
      let clear = Infinity;
      let blocker: Agent | null = null;
      const consider = (x: number, z: number, depth: number, side: number): boolean => {
        const rx = x - agent.x;
        const rz = z - agent.z;
        const ahead = rx * fx + rz * fz;
        if (ahead <= 0 || ahead > reach + depth) return false;
        const offset = Math.abs(rx * fz - rz * fx);
        if (offset >= kind.halfWidth + side || ahead - depth - kind.halfLength >= clear) return false;
        clear = ahead - depth - kind.halfLength;
        return true;
      };
      for (const obstacle of obstacles) if (consider(obstacle.x, obstacle.z, obstacle.radius, obstacle.radius)) blocker = null;
      for (const other of this.agents) {
        if (other === agent || !other.active) continue;
        const cos = Math.cos(other.heading - agent.heading);
        if (cos < 0 && !settings.stopsForOncoming) continue;
        const theirs = kinds[other.kind]!;
        const c = Math.abs(cos);
        const s = Math.abs(Math.sin(other.heading - agent.heading));
        if (consider(other.x, other.z, c * theirs.halfLength + s * theirs.halfWidth, s * theirs.halfLength + c * theirs.halfWidth)) blocker = other;
      }

      let target = Math.min(kind.maxSpeed, settings.speed(edge, agent.variation) * kind.speedFactor);
      if (clear < Infinity) target = clear <= kind.gap ? 0 : Math.min(target, (clear - kind.gap) * 1.2);

      // Red light, amber, or people on the zebra ahead.
      const along = (agent.x - from.x) * edge.dx + (agent.z - from.z) * edge.dz;
      const line = this.signalStop(agent, kind, edge, along);
      if (line < Infinity) target = Math.min(target, this.stopSpeed(line));
      // Queued behind someone waiting at the lights counts as waiting at the lights.
      agent.atSignal = line < Infinity || (blocker !== null && blocker.atSignal && clear < kind.gap + 3);
      // Wait for crossing traffic to clear the junction.
      if (this.holding[agent.id]!.length > 0) this.releasePassed(agent, kind, edge);
      const box = this.radius[edge.to]! > 0 ? this.junctionGate(agent, kind, edge, along, line === Infinity) : Infinity;
      agent.givingWay = box < Infinity;
      if (agent.givingWay) target = Math.min(target, this.stopSpeed(box));

      // Give way to a siren: move to the kerb and crawl until it has gone past.
      let yielding = false;
      if (siren) {
        const rx = agent.x - siren.x;
        const rz = agent.z - siren.z;
        const ahead = rx * -Math.sin(siren.heading) + rz * -Math.cos(siren.heading);
        yielding = ahead > -4 && Math.hypot(rx, rz) < SIREN_RANGE;
      }
      agent.pullOver += Math.max(-dt, Math.min(dt, (yielding ? 1 : 0) - agent.pullOver));
      if (yielding) target = Math.min(target, YIELD_SPEED);

      const rate = target > agent.speed ? settings.acceleration * kind.accelerationFactor : settings.braking;
      agent.speed += Math.max(-rate * dt, Math.min(rate * dt, target - agent.speed));

      // Steer towards the carrot, more gently when barely moving so stopped agents don't spin.
      const axle = kind.halfLength * FRONT_AXLE;
      const px = agent.x + fx * axle;
      const pz = agent.z + fz * axle;
      const carrot = this.carrot(agent, px, pz);
      const wanted = Math.atan2(-(carrot.x - px), -(carrot.z - pz));
      const diff = Math.atan2(Math.sin(wanted - agent.heading), Math.cos(wanted - agent.heading));
      const turn = settings.turnRate * dt * Math.min(1, agent.speed / 1.5 + 0.15);
      agent.heading += Math.max(-turn, Math.min(turn, diff));
      // Slow for sharp corners.
      if (Math.abs(diff) > 0.5) agent.speed = Math.min(agent.speed, Math.max(1.2, target * 0.45));

      agent.x += -Math.sin(agent.heading) * agent.speed * dt;
      agent.z += -Math.cos(agent.heading) * agent.speed * dt;

      // Reached the end of this stretch: continue on the next one.
      // Reached by the front axle, which is what steers.
      const moved = (agent.x - from.x) * edge.dx + (agent.z - from.z) * edge.dz + axle;
      if (moved >= edge.length - 1) {
        if (agent.next === agent.edge) {
          this.place(agent, focus, false); // dead end with no way out
          continue;
        }
        agent.edge = agent.next;
        agent.next = nextEdge(graph, agent.edge, this.random);
      }

      // Recycle agents that are far away, or jammed for a long time out of the player's sight.
      // Waiting at the lights is not being jammed.
      agent.stuck = agent.speed < 0.2 && !agent.atSignal ? agent.stuck + dt : 0;
      const distance = Math.hypot(agent.x - focus.x, agent.z - focus.z);
      if (distance > settings.despawn || (agent.stuck > 8 && distance > 45)) this.place(agent, focus, false);
    }
  }
}
