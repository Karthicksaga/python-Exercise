/**
 * Getting in and out of a vehicle as a timed sequence instead of a switch. Getting in: walk to
 * the door, open it, climb in and sit down, pull it shut. Getting out: open the door, stand up
 * and step out; the player walks away while the door swings shut behind them. Vehicles without
 * a door (auto, motorbike) skip the door steps.
 *
 * Pure numbers, no scene: the game turns `walk`, `aisle`, `seated` and `door` into the figure's
 * place and pose and the door's angle (`apps/game/src/Boarder.ts`). Durations are estimates of
 * how long people take, tuned by eye, not measured.
 */
import type { VehicleEntry } from "./specs";

/** Walking pace to the door, m/s (a brisk walk). */
export const BOARD_WALK_SPEED = 1.4;
/** The walk to the door never takes longer than this, seconds: further away, the player hurries. */
export const APPROACH_LIMIT = 1.5;
export const DOOR_OPEN_TIME = 0.5;
export const SIT_TIME = 0.7;
/** Swinging a leg over a motorbike is a little slower than sliding onto a car seat. */
export const SWING_TIME = 0.8;
export const DOOR_CLOSE_TIME = 0.4;
/** Walking the floor inside (the bus): at most this long, seconds. */
export const AISLE_LIMIT = 1.2;

/**
 * approach: walking to the entry point. open: the door opening. climb: up the step and along the
 * floor (bus). sit: from standing to seated. close: the door shutting. stand and out are sit and
 * climb in reverse.
 */
export type BoardingPhase = "approach" | "open" | "climb" | "sit" | "close" | "stand" | "out" | "done";

/**
 * doorOpening: the door starts to open (a click). shut: the door has closed (the slam). seated:
 * the driver is in the seat. free: getting out, the player has their feet on the ground and
 * takes control again. done: the sequence is over.
 */
export type BoardingEvent = "doorOpening" | "shut" | "seated" | "free" | "done";

interface Step {
  readonly phase: Exclude<BoardingPhase, "done">;
  readonly duration: number;
}

/** Smooth start and stop, 0 to 1. */
export function ease(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export class Boarding {
  private readonly steps: Step[] = [];
  private readonly total: number;
  private time = 0;
  private index = 0;
  private started = false;

  /**
   * @param direction "in" to get in, "out" to get out
   * @param approach length of the walk to the entry point, metres (getting in)
   * @param aisle length of the walk along the floor inside, metres (0 when there is none)
   */
  constructor(
    readonly direction: "in" | "out",
    readonly entry: VehicleEntry,
    approach = 0,
    aisle = 0,
  ) {
    const door = entry.door !== "none";
    const sit = entry.style === "swing" ? SWING_TIME : SIT_TIME;
    const climb = aisle > 0 ? Math.min(AISLE_LIMIT, aisle / BOARD_WALK_SPEED) : 0;
    const push = (phase: Step["phase"], duration: number) => {
      if (duration > 0) this.steps.push({ phase, duration });
    };
    if (direction === "in") {
      push("approach", Math.min(APPROACH_LIMIT, Math.max(0, approach) / BOARD_WALK_SPEED));
      if (door) push("open", DOOR_OPEN_TIME);
      push("climb", climb);
      push("sit", sit);
      if (door) push("close", DOOR_CLOSE_TIME);
    } else {
      if (door) push("open", DOOR_OPEN_TIME);
      push("stand", sit);
      push("out", climb);
      if (door) push("close", DOOR_CLOSE_TIME);
    }
    this.total = this.steps.reduce((sum, step) => sum + step.duration, 0);
  }

  /** Seconds the whole sequence takes. */
  get duration(): number {
    return this.total;
  }

  /** Seconds a phase lasts here (0 if this sequence has none). */
  durationOf(phase: BoardingPhase): number {
    return this.steps.find((step) => step.phase === phase)?.duration ?? 0;
  }

  get phase(): BoardingPhase {
    return this.steps[this.index]?.phase ?? "done";
  }

  get done(): boolean {
    return this.index >= this.steps.length;
  }

  /** Share of the whole sequence gone, 0 to 1. */
  get progress(): number {
    if (this.total <= 0) return 1;
    let before = 0;
    for (let i = 0; i < this.index && i < this.steps.length; i++) before += this.steps[i]!.duration;
    return Math.min(1, (before + this.time) / this.total);
  }

  /** How far into the current phase, 0 to 1 (linear). */
  get phaseProgress(): number {
    const step = this.steps[this.index];
    if (!step) return 1;
    return Math.min(1, this.time / step.duration);
  }

  /** Getting out: true once the player stands outside and has control back (the door may still be closing). */
  get free(): boolean {
    if (this.direction === "in") return false;
    const phase = this.phase;
    return phase === "close" || phase === "done";
  }

  /** How far the door is open, 0 shut to 1 fully open (eased). Always 0 for a vehicle with no door. */
  get door(): number {
    if (this.entry.door === "none") return 0;
    const p = this.phaseProgress;
    switch (this.phase) {
      case "approach":
      case "done":
        return 0;
      case "open":
        return ease(p);
      case "close":
        return 1 - ease(p);
      default:
        return 1;
    }
  }

  /** Share of the walk to the entry point done, 0 to 1 (1 once there; getting out it is never walked). */
  get walk(): number {
    if (this.direction === "out") return 1;
    return this.phase === "approach" ? this.phaseProgress : 1;
  }

  /** Share of the walk along the floor inside, from the door (0) to the last standing point (1). */
  get aisle(): number {
    const phase = this.phase;
    if (this.direction === "in") {
      if (phase === "approach" || phase === "open") return 0;
      return phase === "climb" ? this.phaseProgress : 1;
    }
    if (phase === "open" || phase === "stand") return 1;
    return phase === "out" ? 1 - this.phaseProgress : 0;
  }

  /** From standing (0) to seated (1), linear: the figure eases it (`HumanFigure.sitting`). */
  get seated(): number {
    const phase = this.phase;
    if (this.direction === "in") {
      if (phase === "sit") return this.phaseProgress;
      return phase === "close" || phase === "done" ? 1 : 0;
    }
    if (phase === "open") return 1;
    return phase === "stand" ? 1 - this.phaseProgress : 0;
  }

  /** Advance by `dt` seconds; returns what happened, in order. */
  step(dt: number): BoardingEvent[] {
    const events: BoardingEvent[] = [];
    if (this.done) return events;
    // The first step's start counts as happening on the first call.
    if (!this.started && this.phase === "open") events.push("doorOpening");
    this.started = true;
    this.time += Math.max(0, dt);
    while (!this.done && this.time >= this.steps[this.index]!.duration) {
      const finished = this.steps[this.index]!.phase;
      this.time -= this.steps[this.index]!.duration;
      this.index++;
      if (finished === "sit") events.push("seated");
      if (finished === "close") events.push("shut");
      const next = this.phase;
      if (next === "open") events.push("doorOpening");
      // Getting out, control comes back once the figure stands outside: before the door shuts.
      if (this.direction === "out" && (finished === "stand" || finished === "out") && (next === "close" || next === "done")) events.push("free");
    }
    if (this.done) events.push("done");
    return events;
  }
}

/** A point in the vehicle's chassis frame, on the ground plane (x right, -z forwards). */
export interface FlatPoint {
  readonly x: number;
  readonly z: number;
}

/**
 * The walk from where the player stands to the entry point, in the chassis frame, going round
 * the front or back of the body when the player is on the far side (never through it).
 * @param half half the body's width (x) and length (z)
 * @param margin how far outside the body the path keeps, metres
 */
export function approachPath(from: FlatPoint, entry: VehicleEntry, half: FlatPoint, margin = 0.55): FlatPoint[] {
  const to = entry.point;
  const out: FlatPoint[] = [from];
  const cornerX = half.x + margin;
  const cornerZ = half.z + margin;
  // Already on the door's side, clear of the body: straight there.
  const onDoorSide = from.x * entry.side >= half.x + 0.1;
  const beside = Math.abs(from.z) <= cornerZ;
  if (!onDoorSide) {
    // Round whichever end is nearer, counting the walk on both sides of the corner.
    const end = Math.abs(from.z - cornerZ) + Math.abs(to.z - cornerZ) <= Math.abs(from.z + cornerZ) + Math.abs(to.z + cornerZ) ? 1 : -1;
    const z = end * cornerZ;
    // From the far side (or the middle), first out to the corner on the player's side.
    if (beside) out.push({ x: from.x * entry.side > 0 ? entry.side * cornerX : -entry.side * cornerX, z });
    out.push({ x: entry.side * cornerX, z });
  }
  out.push({ x: to.x, z: to.z });
  // Drop zero-length legs.
  return out.filter((p, i) => i === 0 || Math.hypot(p.x - out[i - 1]!.x, p.z - out[i - 1]!.z) > 1e-6);
}

/** Total length of a path, metres. */
export function pathLength(points: readonly FlatPoint[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z);
  return length;
}

/** The point a share `f` (0 to 1) of the way along a path, and the heading of that leg (yaw in the path's frame: 0 faces -Z). */
export function alongPath(points: readonly FlatPoint[], f: number): { x: number; z: number; heading: number } {
  const first = points[0];
  if (!first) return { x: 0, z: 0, heading: 0 };
  let left = Math.min(1, Math.max(0, f)) * pathLength(points);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const leg = Math.hypot(b.x - a.x, b.z - a.z);
    const heading = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    if (left <= leg || i === points.length - 1) {
      const t = leg > 0 ? Math.min(1, left / leg) : 1;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading };
    }
    left -= leg;
  }
  return { x: first.x, z: first.z, heading: 0 };
}
