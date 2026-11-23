/**
 * Share auto: an auto-rickshaw that runs one fixed route, like a bus without stops. People wait
 * at the kerb anywhere along it; the driver pulls up beside them (slow, within a few metres) to
 * let them in, and stops wherever each one asks to get off, further along. Every passenger pays
 * a small fare by the distance they rode. Pure logic with no rendering or input.
 *
 * Fares are estimates of what a Chennai share auto charges (a small flat part plus a few rupees
 * a kilometre), not a published tariff.
 */

export interface RoutePoint {
  readonly x: number;
  readonly z: number;
}

export interface ShareRoute {
  /** The road it runs along, e.g. "2nd Avenue, Anna Nagar West". */
  readonly name: string;
  /** Where it starts and ends (area names, for the board and the HUD). */
  readonly from: string;
  readonly to: string;
  /** Centre line of the carriageway, in driving order. Metres. */
  readonly points: readonly RoutePoint[];
  /** Metres from the centre line to where people wait, on the driver's left (the kerb side). */
  readonly kerb: number;
  /** Metres from the centre line to the middle of the left lane, where the auto pulls up. */
  readonly lane: number;
}

/** Every number of the share auto in one place. Fares are estimates (see the file comment). */
export const SHARE_AUTO = {
  /** Three in the back plus the shared front seat. */
  capacity: 4,
  /** Rupees: flat part of every fare. */
  baseFare: 10,
  /** Rupees per kilometre ridden. */
  perKm: 5,
  /** Below this speed (m/s) the auto counts as stopped. */
  stopped: 1.2,
  /** Metres from a waiting passenger within which they can get in. */
  boardRadius: 6,
  /** Metres from a passenger's drop point within which they can get off. */
  dropRadius: 8,
  /** Seconds stopped before people are in or out. */
  boardSeconds: 1.5,
  dropSeconds: 1,
  /** People waiting at once (each one is an animated figure, so only a few). */
  maxWaiting: 3,
  /** Metres ahead of the auto where new passengers appear. */
  spawnAhead: { min: 60, max: 320 },
  /** Metres between one waiting passenger and the next. */
  spawnGap: { min: 90, max: 240 },
  /** Metres a passenger rides. */
  ride: { min: 250, max: 1200 },
  /** A waiting passenger this far behind the auto has been driven past. */
  passMargin: 20,
  /** A drop point this far behind the auto has been missed. */
  missMargin: 40,
  /** No one asks to get off this close to the end of the route. */
  endMargin: 40,
  /** Metres from the end of the route that count as reaching it. */
  endRadius: 10,
  /** Farther than this from the route (metres) the auto is off it: progress is not updated. */
  offRoute: 30,
} as const;

/** Rupees for a ride of `metres`. */
export function shareFare(metres: number): number {
  return Math.round(SHARE_AUTO.baseFare + (SHARE_AUTO.perKm * Math.max(0, metres)) / 1000);
}

/** About what a good shift on a route this long earns: every passenger who appears, carried. */
export function shareEstimate(length: number): number {
  const gap = (SHARE_AUTO.spawnGap.min + SHARE_AUTO.spawnGap.max) / 2;
  const ride = (SHARE_AUTO.ride.min + SHARE_AUTO.ride.max) / 2;
  const riders = Math.max(1, Math.floor((length - SHARE_AUTO.ride.min - SHARE_AUTO.endMargin) / gap) + 1);
  return riders * shareFare(Math.min(ride, length));
}

export type PassengerState = "waiting" | "riding" | "dropped" | "missed" | "left" | "gone";

export interface SharePassenger {
  readonly id: number;
  /** Waiting at the kerb, in the auto, dropped where they asked, carried past their drop,
   * left waiting by an auto with a free seat, or gone (the auto was full when it passed). */
  readonly state: PassengerState;
  /** Metres along the route where they wait, and where they want to get off. */
  readonly at: number;
  readonly dropAt: number;
  /** Where they stand at the kerb. */
  readonly x: number;
  readonly z: number;
  /** Where the auto pulls up beside them (middle of the left lane). */
  readonly stop: RoutePoint;
  /** Where they want to get off (middle of the left lane). */
  readonly drop: RoutePoint;
  /** Rupees paid, once dropped. */
  readonly fare: number;
}

export type ShareEvent =
  | { readonly type: "boarded"; readonly passenger: SharePassenger; readonly aboard: number }
  | { readonly type: "dropped"; readonly passenger: SharePassenger; readonly fare: number; readonly aboard: number }
  /** Carried past their drop point: they get off further on, annoyed, and pay nothing. */
  | { readonly type: "missed"; readonly passenger: SharePassenger }
  /** Driven past while there was a free seat. */
  | { readonly type: "left"; readonly passenger: SharePassenger };

export interface ShareSummary {
  /** Passengers dropped where they asked. */
  readonly carried: number;
  /** Rupees of fares. */
  readonly fares: number;
  /** Carried past their drop point, or still aboard when the shift ended. */
  readonly missed: number;
  /** Driven past while there was a free seat. */
  readonly left: number;
}

/** What the share auto needs to know about the player each step. */
export interface ShareDriver {
  readonly x: number;
  readonly z: number;
  /** m/s */
  readonly speed: number;
  /** In the job's vehicle. */
  readonly inVehicle: boolean;
}

/** Reputation for a finished shift: a little for people carried, a little off for each let-down. */
export function shareReputation(summary: ShareSummary): number {
  const earned = summary.carried >= 6 ? 3 : summary.carried >= 3 ? 2 : summary.carried >= 1 ? 1 : 0;
  return Math.max(-5, Math.min(3, earned - summary.missed - summary.left));
}

/** Rating for a finished shift, 1 to 5. */
export function shareStars(summary: ShareSummary, bumps: number): number {
  if (summary.carried === 0) return 1;
  return Math.max(1, Math.min(5, 5 - summary.missed - summary.left - Math.floor(bumps / 2)));
}

/** A small deterministic random generator (mulberry32), so a shift can be replayed in tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A polyline measured along its length. */
export class RouteLine {
  readonly length: number;
  private readonly at: number[] = [0];

  constructor(readonly points: readonly RoutePoint[]) {
    if (points.length < 2) throw new Error("A route needs at least two points");
    for (let i = 1; i < points.length; i++) this.at.push(this.at[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z));
    this.length = this.at[this.at.length - 1]!;
  }

  /** The point `s` metres along, the unit direction of travel there, and `side` metres to its left. */
  pointAt(s: number, side = 0): RoutePoint & { readonly dx: number; readonly dz: number } {
    const d = Math.max(0, Math.min(this.length, s));
    let i = 1;
    while (i < this.at.length - 1 && this.at[i]! < d) i++;
    const a = this.points[i - 1]!;
    const b = this.points[i]!;
    const span = this.at[i]! - this.at[i - 1]!;
    const t = span > 0 ? (d - this.at[i - 1]!) / span : 0;
    const dx = span > 0 ? (b.x - a.x) / span : 1;
    const dz = span > 0 ? (b.z - a.z) / span : 0;
    // Left of the direction of travel (+X east, +Z south): (dz, -dx).
    return { x: a.x + (b.x - a.x) * t + dz * side, z: a.z + (b.z - a.z) * t - dx * side, dx, dz };
  }

  /**
   * The nearest point on the route to `p` with its distance along (`s`) and from it (`off`),
   * searching only between `from` and `to` metres along, so a route that bends back near itself
   * is not confused.
   */
  project(p: RoutePoint, from = 0, to = Infinity): { s: number; off: number } {
    let best = { s: 0, off: Infinity };
    for (let i = 1; i < this.points.length; i++) {
      if (this.at[i]! < from || this.at[i - 1]! > to) continue;
      const a = this.points[i - 1]!;
      const b = this.points[i]!;
      const span = this.at[i]! - this.at[i - 1]!;
      // Kept inside both the piece and the window.
      const lo = span > 0 ? Math.max(0, (from - this.at[i - 1]!) / span) : 0;
      const hi = span > 0 ? Math.min(1, (to - this.at[i - 1]!) / span) : 0;
      const t = span > 0 ? Math.max(lo, Math.min(hi, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (span * span))) : 0;
      const off = Math.hypot(a.x + (b.x - a.x) * t - p.x, a.z + (b.z - a.z) * t - p.z);
      if (off < best.off) best = { s: this.at[i - 1]! + span * t, off };
    }
    return best;
  }
}

interface Passenger {
  id: number;
  state: PassengerState;
  at: number;
  dropAt: number;
  x: number;
  z: number;
  stop: RoutePoint;
  drop: RoutePoint;
  fare: number;
}

const round = (v: number) => Math.round(v * 10) / 10;

/** One shift on a share auto route: who is waiting, who is aboard, and what they paid. */
export class ShareShift {
  readonly line: RouteLine;
  private readonly people: Passenger[] = [];
  private progressAt = 0;
  private nextAt: number;
  private nextId = 1;
  private stoppedFor = 0;
  private fareTotal = 0;

  constructor(
    readonly route: ShareRoute,
    private readonly random: () => number = seededRandom(1),
  ) {
    this.line = new RouteLine(route.points);
    this.nextAt = this.between(SHARE_AUTO.spawnAhead.min, SHARE_AUTO.spawnAhead.min + SHARE_AUTO.spawnGap.min);
  }

  /** Metres along the route the auto has reached. */
  get progress(): number {
    return this.progressAt;
  }

  get length(): number {
    return this.line.length;
  }

  /** Everyone who has appeared this shift, in the order they appeared. */
  get passengers(): readonly SharePassenger[] {
    return this.people;
  }

  get waiting(): readonly SharePassenger[] {
    return this.people.filter((p) => p.state === "waiting");
  }

  get riding(): readonly SharePassenger[] {
    return this.people.filter((p) => p.state === "riding");
  }

  get aboard(): number {
    return this.people.reduce((n, p) => n + (p.state === "riding" ? 1 : 0), 0);
  }

  get fares(): number {
    return this.fareTotal;
  }

  /** The end of the route (middle of the left lane). */
  get end(): RoutePoint {
    const p = this.line.pointAt(this.line.length, this.route.lane);
    return { x: p.x, z: p.z };
  }

  /** Seconds the auto has been standing still in the job's vehicle. */
  get stoppedSeconds(): number {
    return this.stoppedFor;
  }

  /** The tally so far. */
  summary(): ShareSummary {
    const count = (state: PassengerState) => this.people.reduce((n, p) => n + (p.state === state ? 1 : 0), 0);
    return { carried: count("dropped"), fares: this.fareTotal, missed: count("missed"), left: count("left") };
  }

  /** The auto is stopped at the end of the route. */
  atEnd(driver: ShareDriver): boolean {
    const end = this.end;
    return driver.inVehicle && driver.speed < SHARE_AUTO.stopped && Math.hypot(driver.x - end.x, driver.z - end.z) <= SHARE_AUTO.endRadius;
  }

  /** End the shift: anyone still aboard never got where they were going. */
  close(): ShareSummary {
    for (const p of this.people) {
      if (p.state === "riding") p.state = "missed";
      else if (p.state === "waiting") p.state = "gone";
    }
    return this.summary();
  }

  update(dt: number, driver: ShareDriver): ShareEvent[] {
    const events: ShareEvent[] = [];
    if (driver.inVehicle) {
      const hit = this.line.project(driver, this.progressAt - 100, this.progressAt + 1500);
      if (hit.off <= SHARE_AUTO.offRoute) this.progressAt = Math.max(this.progressAt, hit.s);
    }

    // Passengers whose stop or drop is behind the auto now.
    for (const p of this.people) {
      if (p.state === "waiting" && p.at < this.progressAt - SHARE_AUTO.passMargin) {
        p.state = this.aboard < SHARE_AUTO.capacity ? "left" : "gone";
        if (p.state === "left") events.push({ type: "left", passenger: p });
      } else if (p.state === "riding" && p.dropAt < this.progressAt - SHARE_AUTO.missMargin) {
        p.state = "missed";
        events.push({ type: "missed", passenger: p });
      }
    }

    const stopped = driver.inVehicle && driver.speed < SHARE_AUTO.stopped;
    this.stoppedFor = stopped ? this.stoppedFor + dt : 0;
    if (stopped) {
      // Out first, then in, so a seat freed here can be taken here.
      if (this.stoppedFor >= SHARE_AUTO.dropSeconds) {
        for (const p of this.people) {
          if (p.state !== "riding" || Math.hypot(driver.x - p.drop.x, driver.z - p.drop.z) > SHARE_AUTO.dropRadius) continue;
          p.state = "dropped";
          p.fare = shareFare(p.dropAt - p.at);
          this.fareTotal += p.fare;
          events.push({ type: "dropped", passenger: p, fare: p.fare, aboard: this.aboard });
        }
      }
      if (this.stoppedFor >= SHARE_AUTO.boardSeconds) {
        for (const p of this.people) {
          if (this.aboard >= SHARE_AUTO.capacity) break;
          if (p.state !== "waiting" || Math.hypot(driver.x - p.x, driver.z - p.z) > SHARE_AUTO.boardRadius) continue;
          p.state = "riding";
          events.push({ type: "boarded", passenger: p, aboard: this.aboard });
        }
      }
    }

    this.spawn();
    return events;
  }

  /** Keep a few people waiting at the kerb ahead of the auto, while the route has room for a ride. */
  private spawn(): void {
    const last = this.line.length - SHARE_AUTO.endMargin - SHARE_AUTO.ride.min;
    // The auto got ahead of the next spot (it came on the route further along): move it on.
    if (this.nextAt < this.progressAt + SHARE_AUTO.spawnAhead.min) this.nextAt = this.progressAt + this.between(SHARE_AUTO.spawnAhead.min, SHARE_AUTO.spawnAhead.min + SHARE_AUTO.spawnGap.min);
    while (this.waiting.length < SHARE_AUTO.maxWaiting && this.nextAt <= last && this.nextAt <= this.progressAt + SHARE_AUTO.spawnAhead.max) {
      const at = this.nextAt;
      const dropAt = Math.min(this.line.length - SHARE_AUTO.endMargin, at + this.between(SHARE_AUTO.ride.min, SHARE_AUTO.ride.max));
      const kerb = this.line.pointAt(at, this.route.kerb);
      const stop = this.line.pointAt(at, this.route.lane);
      const drop = this.line.pointAt(dropAt, this.route.lane);
      this.people.push({
        id: this.nextId++,
        state: "waiting",
        at,
        dropAt,
        x: round(kerb.x),
        z: round(kerb.z),
        stop: { x: round(stop.x), z: round(stop.z) },
        drop: { x: round(drop.x), z: round(drop.z) },
        fare: 0,
      });
      this.nextAt += this.between(SHARE_AUTO.spawnGap.min, SHARE_AUTO.spawnGap.max);
    }
  }

  private between(lo: number, hi: number): number {
    return Math.round(lo + (hi - lo) * this.random());
  }
}
