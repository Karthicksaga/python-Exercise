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
  /** One line per thing that changed the pay, for the result screen. */
  readonly notes: readonly string[];
  readonly reputation: number;
}

export type JobEvent =
  | { readonly type: "accepted"; readonly job: Job }
  | { readonly type: "started"; readonly job: Job }
  | { readonly type: "stop"; readonly job: Job; readonly label: string; readonly index: number }
  | { readonly type: "bump"; readonly job: Job; readonly count: number }
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

export class JobRunner {
  private current: Job | null = null;
  private stopIndex = 0;
  private running = false;
  private elapsed = 0;
  private dwelt = 0;
  private bumpCount = 0;
  private lateCount = 0;
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

  /** Whether the board should offer this job, and why not. */
  available(job: Job): { ok: true } | { ok: false; reason: string } {
    if (this.current) return { ok: false, reason: "Finish or quit the current job first" };
    if ((job.minReputation ?? 0) > this.rep) return { ok: false, reason: `Needs reputation ${job.minReputation}` };
    return { ok: true };
  }

  accept(job: Job): JobEvent[] {
    if (!this.available(job).ok) return [];
    this.current = job;
    this.stopIndex = 0;
    this.running = false;
    this.elapsed = 0;
    this.dwelt = 0;
    this.bumpCount = 0;
    this.lateCount = 0;
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
      this.running = true;
      events.push({ type: "started", job });
    }
    this.elapsed += dt;
    if (this.elapsed >= job.timeLimit) {
      events.push(this.fail(job, "Out of time"));
      return events;
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
    const stars = clamp(5 - this.bumpCount - this.lateCount - (timeShare < 0.15 ? 1 : 0), 1, 5);
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
    const result: JobResult = { job, pay: earned, stars, bumps: this.bumpCount, seconds: this.elapsed, late: this.lateCount, notes, reputation: this.rep - before };
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
