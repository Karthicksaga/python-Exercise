/**
 * Passengers on a platform: people wait along the edge for their line's train, walk to the
 * nearest open door when it stops and get on; others get off and walk to the exits. Counts
 * follow the time of day (rush hours busy, nights nearly empty). All numbers are estimates for
 * the look of the game, not passenger counts: a real Chennai rush-hour platform holds hundreds;
 * the game draws at most a few dozen, near the player only.
 *
 * The crowd works in the platform's own frame: `u` metres along the owning line from the
 * stop's centre, `w` metres to its left. The game turns that into world positions.
 */

/** Most people waiting on one platform, and on it at all (waiting plus walking). */
export const MAX_WAITING = 24;
export const MAX_ON_PLATFORM = 36;
/** Most people getting on, and off, one train at one stop. */
export const MAX_BOARDING = 12;
export const MAX_ALIGHTING = 10;
/** People already on a train when it comes into view: least and most (estimated). */
export const LOAD_MIN = 40;
export const LOAD_MAX = 160;
/** A 4-coach train's room, people (estimated; crush load is far more). */
export const TRAIN_CAPACITY = 400;
/** Walking pace, m/s: people waiting stroll, people with a train to catch hurry. */
const STROLL = 1.1;
const HURRY = 1.6;
/** A newcomer arrives every this many seconds while the platform is short of its count. */
const ARRIVE_EVERY = 1.4;
/** People step off one after another, this many seconds apart per door. */
const ALIGHT_GAP = 0.6;

/** A deterministic 0..1 value for a key (same train, same stop, same answer). */
export function hash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * How many people wait on a platform at this hour (0–24), for a station `busy` 0.5–1. Morning and
 * evening rush are fullest, late night nearly empty; smooth between (estimated shape).
 */
export function waitingCount(hour: number, busy = 1): number {
  const h = ((hour % 24) + 24) % 24;
  // Share of the busiest hour, by hour of day (index = hour).
  const shape = [0.08, 0.05, 0.04, 0.04, 0.1, 0.25, 0.45, 0.75, 1, 0.95, 0.7, 0.55, 0.5, 0.5, 0.5, 0.55, 0.7, 0.9, 1, 0.95, 0.7, 0.45, 0.25, 0.15];
  const i = Math.floor(h);
  const t = h - i;
  const share = shape[i]! * (1 - t) + shape[(i + 1) % 24]! * t;
  return Math.max(1, Math.min(MAX_WAITING, Math.round(MAX_WAITING * share * Math.min(1, Math.max(0.3, busy)))));
}

/** People on a train when it is first seen (stable per train id). */
export function initialLoad(trainId: string): number {
  return Math.round(LOAD_MIN + (LOAD_MAX - LOAD_MIN) * hash01(`load:${trainId}`));
}

/**
 * How many get on and off a train at a stop: everyone waiting for it boards, up to
 * `MAX_BOARDING` and the train's room left; between a few and `MAX_ALIGHTING` get off (never
 * more than are on). The number off is stable per train and stop.
 */
export function passengerFlow(waiting: number, load: number, trainId: string, stop: string, capacity = TRAIN_CAPACITY): { board: number; alight: number } {
  const off = Math.min(Math.max(0, load), Math.round(2 + (MAX_ALIGHTING - 2) * hash01(`off:${trainId}:${stop}`)));
  const room = Math.max(0, capacity - (load - off));
  const on = Math.max(0, Math.min(waiting, MAX_BOARDING, room));
  return { board: on, alight: off };
}

export type PassengerState = "arriving" | "waiting" | "boarding" | "alighting";

export interface Passenger {
  readonly id: number;
  u: number;
  w: number;
  /** Heading in the platform's frame: radians from +u towards +w. */
  heading: number;
  state: PassengerState;
  /** Which service (index into the platform's edges) they wait for. */
  readonly service: number;
  /** Where they walk to. */
  tu: number;
  tw: number;
  /** Metres walked (drives the walk cycle). */
  walked: number;
  /** Shirt tint index, 0..7. */
  readonly look: number;
  /** The train being boarded (or got off), else null. */
  train: string | null;
  /** Seconds before an alighting passenger steps out. */
  delay: number;
}

/** A platform edge a service's trains stand at. */
export interface CrowdEdge {
  /** Lateral of the edge (platform frame). */
  readonly w: number;
  /** From the edge into the platform, +1 or -1. */
  readonly inward: 1 | -1;
}

/** A train standing at the platform now. */
export interface CrowdTrain {
  readonly id: string;
  readonly service: number;
  /** Its doorways on the platform's side, in the platform frame (u along, w at the edge). */
  readonly doors: ReadonlyArray<{ readonly u: number; readonly w: number }>;
  /** Doors open, 0 shut to 1 open. */
  readonly open: number;
  /** Seconds before it leaves. */
  readonly dwellLeft: number;
  /** People on board when it stopped. */
  readonly load: number;
}

export interface CrowdSpec {
  /** Half the platform's length, metres. */
  readonly half: number;
  readonly edges: readonly CrowdEdge[];
  /** Where people leave or arrive (along the platform, at its middle across). */
  readonly exits: readonly number[];
  /** Middle of the deck across. */
  readonly middle: number;
  /** A key for this platform (makes the crowd's choices stable per station). */
  readonly key: string;
  /** Furthest in from the edge people wait, metres (a narrow platform keeps them clear of benches and stairs). */
  readonly depth?: number;
  /** Stretches along the platform where nobody waits (under stairs, at a stall). */
  readonly blocked?: ReadonlyArray<readonly [number, number]>;
}

/** What happened at one stop of one train: people on and off. */
export interface StopFlow {
  readonly board: number;
  readonly alight: number;
  boarded: number;
  alighted: number;
}

export class StationCrowd {
  readonly people: Passenger[] = [];
  /** Per train id standing here: how many get on and off, and how many have so far. */
  readonly flows = new Map<string, StopFlow>();
  private nextId = 0;
  private sinceArrival = 0;
  private filled = false;
  private seq = 0;

  constructor(readonly spec: CrowdSpec) {}

  /** People waiting (not walking to a door or away). */
  get waiting(): number {
    let n = 0;
    for (const p of this.people) if (p.state === "waiting") n++;
    return n;
  }

  private random(tag: string): number {
    return hash01(`${this.spec.key}:${tag}:${this.seq++}`);
  }

  /** A spot to wait at for a service: along the platform, 1–3 m in from its edge. */
  private spot(service: number): { u: number; w: number } {
    const edge = this.spec.edges[service]!;
    const depth = Math.max(1.2, this.spec.depth ?? 3);
    let u = 0;
    for (let tries = 0; tries < 8; tries++) {
      u = (this.random("u") * 2 - 1) * this.spec.half * 0.8;
      if (!(this.spec.blocked ?? []).some(([u0, u1]) => u > u0 && u < u1)) break;
    }
    const w = edge.w + edge.inward * (1.1 + this.random("w") * (depth - 1.1));
    return { u, w };
  }

  private add(state: PassengerState, u: number, w: number, service: number, to: { u: number; w: number }): Passenger {
    const p: Passenger = { id: this.nextId++, u, w, heading: 0, state, service, tu: to.u, tw: to.w, walked: 0, look: Math.floor(this.random("look") * 8), train: null, delay: 0 };
    this.people.push(p);
    return p;
  }

  /**
   * One step: newcomers arrive while the platform is short of `target` waiting; when a train
   * stands with its doors open, its share of the waiting walk to its doors and get on, and
   * others get off and walk to the exits.
   */
  step(dt: number, target: number, trains: readonly CrowdTrain[]): void {
    const { spec } = this;
    const want = Math.min(MAX_WAITING, Math.max(0, Math.round(target)));
    if (!this.filled) {
      // The first time the platform is seen, people are already waiting.
      this.filled = true;
      for (let i = 0; i < want; i++) {
        const service = i % spec.edges.length;
        const at = this.spot(service);
        const p = this.add("waiting", at.u, at.w, service, at);
        p.heading = Math.atan2(-spec.edges[service]!.inward, 0);
      }
    }
    this.sinceArrival += dt;
    const arriving = this.people.filter((p) => p.state === "arriving").length;
    if (this.waiting + arriving < want && this.people.length < MAX_ON_PLATFORM && this.sinceArrival > ARRIVE_EVERY) {
      this.sinceArrival = 0;
      const service = Math.floor(this.random("svc") * spec.edges.length);
      const exit = spec.exits[Math.floor(this.random("exit") * spec.exits.length)]!;
      this.add("arriving", exit, spec.middle, service, this.spot(service));
    }

    // Trains at the platform: decide each stop's flow once, when the doors first open.
    const here = new Set<string>();
    for (const train of trains) {
      here.add(train.id);
      if (train.open < 0.6 || train.doors.length === 0) continue;
      let flow = this.flows.get(train.id);
      if (!flow) {
        const waitingFor = this.people.filter((p) => p.state === "waiting" && p.service === train.service).length;
        const { board, alight } = passengerFlow(waitingFor, train.load, train.id, spec.key);
        flow = { board, alight, boarded: 0, alighted: 0 };
        this.flows.set(train.id, flow);
        // Those nearest a door go first.
        const candidates = this.people
          .filter((p) => p.state === "waiting" && p.service === train.service)
          .map((p) => ({ p, door: nearestDoor(train.doors, p) }))
          .sort((a, b) => a.door.d - b.door.d)
          .slice(0, board);
        for (const { p, door } of candidates) {
          p.state = "boarding";
          p.train = train.id;
          p.tu = door.u;
          p.tw = door.w;
        }
        // People getting off appear in the doorways, one after another at each door.
        const space = MAX_ON_PLATFORM - this.people.length;
        for (let i = 0; i < Math.min(alight, Math.max(0, space)); i++) {
          const door = train.doors[i % train.doors.length]!;
          const edge = spec.edges[train.service]!;
          const exit = nearestExit(spec.exits, door.u);
          const p = this.add("alighting", door.u, door.w + edge.inward * 0.2, train.service, { u: exit, w: spec.middle });
          p.train = train.id;
          p.delay = Math.floor(i / train.doors.length) * ALIGHT_GAP;
        }
      }
    }
    // A train that left takes no one else: anyone still walking to it waits for the next.
    for (const p of this.people) {
      if (p.state === "boarding" && p.train && !here.has(p.train)) {
        p.state = "waiting";
        p.train = null;
        const at = this.spot(p.service);
        p.tu = at.u;
        p.tw = at.w;
      }
    }
    for (const id of [...this.flows.keys()]) if (!here.has(id)) this.flows.delete(id);

    // Walk.
    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i]!;
      if (p.delay > 0) {
        p.delay -= dt;
        continue;
      }
      if (p.state === "waiting") {
        // Face the track; settle onto the spot.
        const edge = spec.edges[p.service]!;
        const face = Math.atan2(-edge.inward, 0);
        p.heading += wrapAngle(face - p.heading) * Math.min(1, dt * 2);
        continue;
      }
      const pace = p.state === "boarding" ? HURRY : STROLL;
      const du = p.tu - p.u;
      const dw = p.tw - p.w;
      const d = Math.hypot(du, dw);
      const stepLength = Math.min(d, pace * dt);
      if (d > 1e-6) {
        p.u += (du / d) * stepLength;
        p.w += (dw / d) * stepLength;
        p.walked += stepLength;
        p.heading = Math.atan2(dw, du);
      }
      if (d - stepLength > 0.15) continue;
      if (p.state === "arriving") {
        p.state = "waiting";
      } else if (p.state === "boarding") {
        // In through the door: off the platform, onto the train.
        const flow = p.train ? this.flows.get(p.train) : undefined;
        if (flow) flow.boarded++;
        this.people.splice(i, 1);
      } else if (p.state === "alighting") {
        // Reached the exit: gone down the steps.
        this.people.splice(i, 1);
      }
    }
    // Count people off once they are clear of the doorway (the flow is per stop).
    for (const p of this.people) {
      if (p.state !== "alighting" || p.train === null || p.delay > 0) continue;
      if (p.walked > 0.5) {
        const flow = this.flows.get(p.train);
        if (flow) flow.alighted++;
        p.train = null;
      }
    }
  }
}

function nearestDoor(doors: ReadonlyArray<{ u: number; w: number }>, p: { u: number; w: number }): { u: number; w: number; d: number } {
  let best = { u: doors[0]!.u, w: doors[0]!.w, d: Infinity };
  for (const door of doors) {
    const d = Math.hypot(door.u - p.u, door.w - p.w);
    if (d < best.d) best = { u: door.u, w: door.w, d };
  }
  return best;
}

function nearestExit(exits: readonly number[], u: number): number {
  let best = exits[0]!;
  for (const e of exits) if (Math.abs(e - u) < Math.abs(best - u)) best = e;
  return best;
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
