/**
 * Road-following agents: traffic vehicles and pedestrians share this logic and differ only in
 * their settings (speed, how far from the centre line they keep, how sharply they turn).
 *
 * Each agent steers towards a "carrot" point a few metres ahead on its route, which gives
 * smooth cornering without path-planning. Agents slow down for anything in front of them and
 * are recycled to a new place when they get far from the player, so a small number of agents
 * makes the whole map feel populated.
 *
 * Pure logic: no rendering and no physics engine.
 */
import type { Bounds } from "@cow/game-world";
import { nextEdge, type GraphEdge, type RoadGraph } from "./RoadGraph";

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
  x: number;
  z: number;
  /** Heading in radians, 0 = towards -Z (north), positive turning left. */
  heading: number;
  speed: number;
  /** Changes whenever the agent is moved to a new place (snap visuals instead of gliding). */
  generation: number;
  edge: number;
  next: number;
  /** Seconds spent unable to move. */
  stuck: number;
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

export class AgentSystem {
  readonly agents: Agent[] = [];
  private readonly random: () => number;

  constructor(
    private readonly graph: RoadGraph,
    private readonly bounds: Bounds,
    private readonly settings: AgentSettings,
    seed = 1,
  ) {
    this.random = seeded(seed);
    if (graph.edges.length === 0) return; // nothing to drive on: no agents
    for (let id = 0; id < settings.count; id++) {
      this.agents.push({ id, variation: this.random(), x: 0, z: 0, heading: 0, speed: 0, generation: 0, edge: 0, next: 0, stuck: 0 });
    }
  }

  /** Put every agent on the map around a point. Call once before the first update. */
  populate(focus: { x: number; z: number }): void {
    for (const agent of this.agents) this.place(agent, focus, true);
  }

  /** Move an agent to a random stretch of road in the spawn ring around the focus. */
  private place(agent: Agent, focus: { x: number; z: number }, anyDistance: boolean): void {
    const { graph, settings, bounds } = this;
    let chosen = -1;
    for (let attempt = 0; attempt < 40; attempt++) {
      const candidate = Math.floor(this.random() * graph.edges.length);
      const edge = graph.edges[candidate]!;
      const from = graph.nodes[edge.from]!;
      if (edge.length < 6) continue;
      const mx = from.x + edge.dx * edge.length * 0.5;
      const mz = from.z + edge.dz * edge.length * 0.5;
      // Keep clear of the map edge, where roads are cut off.
      if (mx < bounds.minX + 15 || mx > bounds.maxX - 15 || mz < bounds.minZ + 15 || mz > bounds.maxZ - 15) continue;
      const distance = Math.hypot(mx - focus.x, mz - focus.z);
      const minimum = anyDistance ? settings.spawnMin * 0.4 : settings.spawnMin;
      if (distance < minimum || distance > settings.spawnMax) continue;
      // Not on top of another agent.
      if (this.agents.some((other) => other !== agent && Math.hypot(other.x - mx, other.z - mz) < 12)) continue;
      chosen = candidate;
      break;
    }
    if (chosen === -1) chosen = Math.floor(this.random() * graph.edges.length);

    const edge = graph.edges[chosen]!;
    const from = graph.nodes[edge.from]!;
    const lane = settings.lane(edge, agent.variation);
    const along = edge.length * (0.3 + this.random() * 0.4);
    agent.edge = chosen;
    agent.next = nextEdge(graph, chosen, this.random);
    agent.x = from.x + edge.dx * along + edge.dz * lane;
    agent.z = from.z + edge.dz * along - edge.dx * lane;
    agent.heading = Math.atan2(-edge.dx, -edge.dz);
    agent.speed = 0;
    agent.stuck = 0;
    agent.generation++;
  }

  /** The steering target: a point `lookAhead` metres further along the route, in the agent's lane. */
  private carrot(agent: Agent): { x: number; z: number } {
    const { graph, settings } = this;
    let edge = graph.edges[agent.edge]!;
    let from = graph.nodes[edge.from]!;
    let along = (agent.x - from.x) * edge.dx + (agent.z - from.z) * edge.dz + settings.lookAhead;
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
    const lane = settings.lane(edge, agent.variation);
    const s = Math.min(along, edge.length);
    return { x: from.x + edge.dx * s + edge.dz * lane, z: from.z + edge.dz * s - edge.dx * lane };
  }

  /**
   * Advance every agent.
   * @param obstacles things to stop for besides other agents (the player, parked vehicles)
   * @param focus where the player is; agents far from it are moved somewhere closer
   */
  update(dt: number, obstacles: readonly Obstacle[], focus: { x: number; z: number }): void {
    const { graph, settings } = this;
    for (const agent of this.agents) {
      const edge = graph.edges[agent.edge]!;
      const from = graph.nodes[edge.from]!;
      const fx = -Math.sin(agent.heading);
      const fz = -Math.cos(agent.heading);

      // How far ahead is the nearest thing in the agent's path?
      const reach = settings.gap + agent.speed * 1.1 + 2;
      let clear = Infinity;
      const consider = (x: number, z: number, radius: number) => {
        const rx = x - agent.x;
        const rz = z - agent.z;
        const ahead = rx * fx + rz * fz;
        if (ahead <= 0 || ahead > reach + radius) return;
        const side = Math.abs(rx * fz - rz * fx);
        if (side < settings.halfWidth + radius) clear = Math.min(clear, ahead - radius);
      };
      for (const obstacle of obstacles) consider(obstacle.x, obstacle.z, obstacle.radius);
      for (const other of this.agents) {
        if (other === agent) continue;
        const oncoming = Math.cos(other.heading - agent.heading) < 0;
        if (oncoming && !settings.stopsForOncoming) continue;
        consider(other.x, other.z, settings.halfWidth);
      }

      let target = settings.speed(edge, agent.variation);
      if (clear < Infinity) target = clear <= settings.gap ? 0 : Math.min(target, (clear - settings.gap) * 1.2);

      const rate = target > agent.speed ? settings.acceleration : settings.braking;
      agent.speed += Math.max(-rate * dt, Math.min(rate * dt, target - agent.speed));

      // Steer towards the carrot, more gently when barely moving so stopped agents don't spin.
      const carrot = this.carrot(agent);
      const wanted = Math.atan2(-(carrot.x - agent.x), -(carrot.z - agent.z));
      const diff = Math.atan2(Math.sin(wanted - agent.heading), Math.cos(wanted - agent.heading));
      const turn = settings.turnRate * dt * Math.min(1, agent.speed / 1.5 + 0.15);
      agent.heading += Math.max(-turn, Math.min(turn, diff));
      // Slow for sharp corners.
      if (Math.abs(diff) > 0.5) agent.speed = Math.min(agent.speed, Math.max(1.2, target * 0.45));

      agent.x += -Math.sin(agent.heading) * agent.speed * dt;
      agent.z += -Math.cos(agent.heading) * agent.speed * dt;

      // Reached the end of this stretch: continue on the next one.
      const along = (agent.x - from.x) * edge.dx + (agent.z - from.z) * edge.dz;
      if (along >= edge.length - 1) {
        if (agent.next === agent.edge) {
          this.place(agent, focus, false); // dead end with no way out
          continue;
        }
        agent.edge = agent.next;
        agent.next = nextEdge(graph, agent.edge, this.random);
      }

      // Recycle agents that are far away, or jammed for a long time out of the player's sight.
      agent.stuck = agent.speed < 0.2 ? agent.stuck + dt : 0;
      const distance = Math.hypot(agent.x - focus.x, agent.z - focus.z);
      if (distance > settings.despawn || (agent.stuck > 8 && distance > 45)) this.place(agent, focus, false);
    }
  }
}
