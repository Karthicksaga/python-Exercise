/**
 * City jobs: everyday paid work picked from the job board (ambulance runs, courier drops, cab
 * fares, bus routes). Each job has a vehicle, stops in order, one time limit and a payout.
 * Finishing pays according to time, bumps and lateness; failing costs a fine and reputation,
 * never the game. Pure logic with no rendering or input, so it is fully unit-tested.
 */
import type { TravelMode } from "./types";

export type JobKind = "ambulance" | "courier" | "cab" | "bus";
export type JobVehicle = Exclude<TravelMode, "foot">;

export interface JobStop {
  /** Instruction shown to the player, e.g. "Pick up the patient". */
  readonly label: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  /** Seconds the vehicle must stand still inside the marker (boarding, loading). */
  readonly dwell?: number;
  /** Bus timetable: seconds after the job starts by which this stop is due. */
  readonly due?: number;
}

export interface Job {
  readonly id: string;
  readonly kind: JobKind;
  readonly title: string;
  readonly brief: string;
  readonly vehicle: JobVehicle;
  readonly stops: readonly JobStop[];
  /** Seconds for the whole job, counted from the moment the player is in the vehicle. */
  readonly timeLimit: number;
  /** Rupees for a perfect run. */
  readonly payout: number;
  /** Rupees taken when the job fails. */
  readonly fine: number;
  /** Reputation needed before the board offers this job. */
  readonly minReputation?: number;
  /** Bumps that end the job (an ambulance patient can only take so much). */
  readonly maxBumps?: number;
  /** Game hours when the board offers the job (e.g. evenings only). Always offered when absent. */
  readonly hours?: JobHours;
  /** A stretch of road to keep off; time spent on it lowers the pay and the rating. */
  readonly avoid?: AvoidZone;
  /**
   * For jobs far from where the player usually is: the clock starts only once the player is in
   * the job's vehicle within this many metres of the first stop, so getting there is free.
   */
  readonly startRadius?: number;
}

/** A window of game hours, 0–24. `from` may be later than `to` for a window across midnight. */
export interface JobHours {
  readonly from: number;
  readonly to: number;
}

/** One sample of a road to avoid: within `radius` of it counts as being on that road. */
export interface AvoidPoint {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface AvoidZone {
  /** Name used on the HUD and the result screen, e.g. "Anna Salai". */
  readonly name: string;
  readonly points: readonly AvoidPoint[];
  /** Seconds allowed inside for free (crossing it at a junction, waiting at its signal). */
  readonly grace: number;
}

export interface JobResult {
  readonly job: Job;
  readonly pay: number;
  /** 1 to 5. */
  readonly stars: number;
  readonly bumps: number;
  readonly seconds: number;
  /** Bus stops reached after their timetable time. */
  readonly late: number;
  /** Seconds spent inside the job's avoid zone (0 when it has none). */
  readonly avoided: number;
  /** One line per thing that changed the pay, for the result screen. */
  readonly notes: readonly string[];
  readonly reputation: number;
}

export type JobEvent =
  | { readonly type: "accepted"; readonly job: Job }
  | { readonly type: "started"; readonly job: Job }
  | { readonly type: "stop"; readonly job: Job; readonly label: string; readonly index: number }
  | { readonly type: "bump"; readonly job: Job; readonly count: number }
  /** The player drove into the job's avoid zone (once each time they enter it). */
  | { readonly type: "avoid"; readonly job: Job; readonly name: string }
  | { readonly type: "completed"; readonly result: JobResult }
  | { readonly type: "failed"; readonly job: Job; readonly reason: string; readonly fine: number; readonly reputation: number };

/** What the job system needs to know about the player each step. */
export interface JobPlayer {
  readonly x: number;
  readonly z: number;
  readonly mode: TravelMode;
  /** m/s */
  readonly speed: number;
}

export interface JobRecord {
  /** 0 to 100. */
  readonly reputation: number;
  readonly done: number;
  readonly failed: number;
  /** Most rupees earned in one go, per job id. */
  readonly best: Readonly<Record<string, number>>;
}

export const START_REPUTATION = 50;
/** Below this speed (m/s) a vehicle counts as stopped. */
const STOPPED = 1.2;
const FAIL_REPUTATION = 5;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Whether a job with these hours is offered at `hour` (game time, 0–24). */
export function openAt(hours: JobHours | undefined, hour: number): boolean {
  if (!hours) return true;
  const h = ((hour % 24) + 24) % 24;
  return hours.from <= hours.to ? h >= hours.from && h < hours.to : h >= hours.from || h < hours.to;
}

/** "16:00–20:30" */
export function hoursText(hours: JobHours): string {
  const text = (hour: number) => {
    const minutes = Math.round(hour * 60) % (24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  };
  return `${text(hours.from)}–${text(hours.to)}`;
}

export function insideZone(zone: AvoidZone, x: number, z: number): boolean {
  return zone.points.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 <= p.radius ** 2);
}

/** Share of the pay lost per second over the grace time, and the most that can be lost. */
const AVOID_RATE = 0.008;
const AVOID_MAX = 0.5;
/** Bonus for keeping clear of the zone (inside the grace time). */
const AVOID_BONUS = 0.1;

/**
 * What time inside an avoid zone does to a finished job: a share of the pay (negative is a
 * cut, positive a bonus), stars lost, and the line for the result screen.
 */
export function avoidPenalty(zone: AvoidZone, seconds: number): { share: number; stars: number; note: string } {
  const over = Math.max(0, seconds - zone.grace);
  if (over <= 0) return { share: AVOID_BONUS, stars: 0, note: `Kept off ${zone.name}: +${Math.round(AVOID_BONUS * 100)}%` };
  const share = Math.min(AVOID_MAX, over * AVOID_RATE);
  return { share: -share, stars: over >= 60 ? 2 : 1, note: `Stuck on ${zone.name} for ${Math.round(seconds)} s: -${Math.round(share * 100)}%` };
}

export class JobRunner {
  private current: Job | null = null;
  private stopIndex = 0;
  private running = false;
  private elapsed = 0;
  private dwelt = 0;
  private bumpCount = 0;
  private lateCount = 0;
  private avoidTime = 0;
  private inAvoid = false;
  private rep: number;
  private doneCount: number;
  private failedCount: number;
  private readonly best: Record<string, number>;

  constructor(saved?: Partial<JobRecord>) {
    const reputation = Number(saved?.reputation ?? START_REPUTATION);
    this.rep = Number.isFinite(reputation) ? clamp(Math.round(reputation), 0, 100) : START_REPUTATION;
    this.doneCount = Math.max(0, Math.floor(Number(saved?.done ?? 0)) || 0);
    this.failedCount = Math.max(0, Math.floor(Number(saved?.failed ?? 0)) || 0);
    this.best = { ...(saved?.best ?? {}) };
  }

  get job(): Job | null {
    return this.current;
  }

  /** True once the player is in the right vehicle and the clock is running. */
  get started(): boolean {
    return this.running;
  }

  get stop(): JobStop | null {
    return this.current?.stops[this.stopIndex] ?? null;
  }

  get stopNumber(): number {
    return this.stopIndex;
  }

  get secondsLeft(): number | null {
    return this.current && this.running ? this.current.timeLimit - this.elapsed : null;
  }

  get bumps(): number {
    return this.bumpCount;
  }

  /** Seconds spent so far inside the job's avoid zone. */
  get avoidSeconds(): number {
    return this.avoidTime;
  }

  get reputation(): number {
    return this.rep;
  }

  get jobsDone(): number {
    return this.doneCount;
  }

  /** Seconds still to wait at the current stop, or null when not waiting. */
  get dwellLeft(): number | null {
    const dwell = this.stop?.dwell;
    return dwell && this.dwelt > 0 ? Math.max(0, dwell - this.dwelt) : null;
  }

  /**
   * Whether the board should offer this job, and why not.
   * @param hour game time; a job with `hours` is offered only inside them (not checked when absent)
   */
  available(job: Job, hour?: number): { ok: true } | { ok: false; reason: string } {
    if (this.current) return { ok: false, reason: "Finish or quit the current job first" };
    if ((job.minReputation ?? 0) > this.rep) return { ok: false, reason: `Needs reputation ${job.minReputation}` };
    if (job.hours && hour !== undefined && !openAt(job.hours, hour)) return { ok: false, reason: `Offered ${hoursText(job.hours)} only` };
    return { ok: true };
  }

  accept(job: Job, hour?: number): JobEvent[] {
    if (!this.available(job, hour).ok) return [];
    this.current = job;
    this.stopIndex = 0;
    this.running = false;
    this.elapsed = 0;
    this.dwelt = 0;
    this.bumpCount = 0;
    this.lateCount = 0;
    this.avoidTime = 0;
    this.inAvoid = false;
    return [{ type: "accepted", job }];
  }

  /** Give up the job: it counts as failed. */
  quit(): JobEvent[] {
    return this.current ? [this.fail(this.current, "Job abandoned")] : [];
  }

  /** The vehicle hit something while on the job. */
  bump(): JobEvent[] {
    const job = this.current;
    if (!job || !this.running) return [];
    this.bumpCount++;
    const events: JobEvent[] = [{ type: "bump", job, count: this.bumpCount }];
    if (job.maxBumps !== undefined && this.bumpCount >= job.maxBumps) events.push(this.fail(job, "Too many crashes"));
    return events;
  }

  update(dt: number, player: JobPlayer): JobEvent[] {
    const job = this.current;
    if (!job) return [];
    const events: JobEvent[] = [];
    const inVehicle = player.mode === job.vehicle;
    if (!this.running) {
      if (!inVehicle) return events;
      const first = job.stops[0];
      if (job.startRadius !== undefined && first && Math.hypot(player.x - first.x, player.z - first.z) > job.startRadius) return events;
      this.running = true;
      events.push({ type: "started", job });
    }
    this.elapsed += dt;
    if (this.elapsed >= job.timeLimit) {
      events.push(this.fail(job, "Out of time"));
      return events;
    }
    if (job.avoid) {
      const inside = insideZone(job.avoid, player.x, player.z);
      if (inside) {
        this.avoidTime += dt;
        if (!this.inAvoid) events.push({ type: "avoid", job, name: job.avoid.name });
      }
      this.inAvoid = inside;
    }

    const stop = job.stops[this.stopIndex];
    if (!stop) return events;
    const inside = inVehicle && Math.hypot(player.x - stop.x, player.z - stop.z) <= stop.radius && player.speed < STOPPED;
    if (!inside) {
      this.dwelt = 0;
      return events;
    }
    this.dwelt += dt;
    if (this.dwelt < (stop.dwell ?? 0)) return events;

    if (stop.due !== undefined && this.elapsed > stop.due) this.lateCount++;
    this.dwelt = 0;
    this.stopIndex++;
    const next = job.stops[this.stopIndex];
    if (next) {
      events.push({ type: "stop", job, label: next.label, index: this.stopIndex });
      return events;
    }
    events.push({ type: "completed", result: this.finish(job) });
    return events;
  }

  /** How a finished run is paid: time left, bumps, lateness, and a bonus per job type. */
  private finish(job: Job): JobResult {
    const timeShare = clamp(1 - this.elapsed / job.timeLimit, 0, 1);
    const notes: string[] = [];
    let pay = job.payout * (0.7 + 0.3 * timeShare);
    notes.push(`${Math.round(timeShare * 100)}% of the time left`);
    if (this.bumpCount > 0) {
      const share = Math.min(0.6, this.bumpCount * (job.kind === "ambulance" ? 0.15 : 0.1));
      pay *= 1 - share;
      notes.push(`${this.bumpCount} bump${this.bumpCount === 1 ? "" : "s"}: -${Math.round(share * 100)}%`);
    } else if (job.kind === "courier") {
      pay += job.payout * 0.25;
      notes.push("Parcel undamaged: +25%");
    } else if (job.kind === "ambulance") {
      pay += job.payout * 0.2;
      notes.push("Smooth ride: +20%");
    }
    if (this.lateCount > 0) {
      const share = Math.min(0.5, this.lateCount * 0.12);
      pay *= 1 - share;
      notes.push(`${this.lateCount} stop${this.lateCount === 1 ? "" : "s"} late: -${Math.round(share * 100)}%`);
    }
    let avoidStars = 0;
    if (job.avoid) {
      const penalty = avoidPenalty(job.avoid, this.avoidTime);
      pay *= 1 + penalty.share;
      avoidStars = penalty.stars;
      notes.push(penalty.note);
    }
    const stars = clamp(5 - this.bumpCount - this.lateCount - avoidStars - (timeShare < 0.15 ? 1 : 0), 1, 5);
    if (job.kind === "cab") {
      // Passengers tip for a good ride.
      const tip = job.payout * (stars - 3) * 0.08;
      pay += tip;
      notes.push(`${stars}★ rating: ${tip >= 0 ? "+" : "-"}₹${Math.abs(Math.round(tip))} tip`);
    }
    const earned = Math.max(Math.round(job.payout * 0.25), Math.round(pay));
    const before = this.rep;
    this.rep = clamp(this.rep + stars - 2, 0, 100);
    this.doneCount++;
    this.best[job.id] = Math.max(this.best[job.id] ?? 0, earned);
    const result: JobResult = { job, pay: earned, stars, bumps: this.bumpCount, seconds: this.elapsed, late: this.lateCount, avoided: this.avoidTime, notes, reputation: this.rep - before };
    this.current = null;
    this.running = false;
    return result;
  }

  private fail(job: Job, reason: string): JobEvent {
    const before = this.rep;
    this.rep = clamp(this.rep - FAIL_REPUTATION, 0, 100);
    this.failedCount++;
    this.current = null;
    this.running = false;
    return { type: "failed", job, reason, fine: job.fine, reputation: this.rep - before };
  }

  /** Lose reputation outside a job (hitting a pedestrian). Never below 0. Returns the points lost. */
  loseReputation(points: number): number {
    const before = this.rep;
    this.rep = clamp(this.rep - Math.max(0, Math.round(points)), 0, 100);
    return before - this.rep;
  }

  record(): JobRecord {
    return { reputation: this.rep, done: this.doneCount, failed: this.failedCount, best: { ...this.best } };
  }

  /** Forget everything (new game). */
  reset(): void {
    this.current = null;
    this.running = false;
    this.rep = START_REPUTATION;
    this.doneCount = 0;
    this.failedCount = 0;
    for (const key of Object.keys(this.best)) delete this.best[key];
  }
}
