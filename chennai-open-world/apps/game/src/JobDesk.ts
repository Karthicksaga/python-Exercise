/**
 * The job board and the job being worked: offers the city jobs, runs the chosen one with
 * `JobRunner`, pays or fines through the shared money total, shows the result screen and
 * saves reputation. The game asks it for the current marker and HUD panel.
 */
import type { Sound } from "@cow/audio";
import { hoursText, JobRunner, SHARE_AUTO, type Job, type JobEvent, type JobPlayer, type JobRecord, type MissionRunner, type RoutePoint, type ShareShift } from "@cow/missions";
import type { Hud, MinimapMarker, MissionView } from "@cow/ui";
import { VEHICLE_TYPES } from "@cow/vehicles";

const SAVE_KEY = "cow-jobs-v1";

function loadRecord(): Partial<JobRecord> | undefined {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as Partial<JobRecord>) : undefined;
  } catch {
    return undefined;
  }
}

/** The share auto shift as tests see it (`window.__cow.snapshot().share`). */
export interface ShareSnapshot {
  readonly aboard: number;
  readonly fares: number;
  readonly carried: number;
  readonly missed: number;
  readonly left: number;
  /** Metres along the route reached, of `length`. */
  readonly progress: number;
  readonly length: number;
  readonly start: RoutePoint;
  readonly end: RoutePoint;
  /** People at the kerb: where they stand and where the auto should pull up. */
  readonly waiting: ReadonlyArray<{ readonly id: number; readonly x: number; readonly z: number; readonly stop: RoutePoint }>;
  /** People aboard and where each one gets off. */
  readonly riding: ReadonlyArray<{ readonly id: number; readonly drop: RoutePoint }>;
}

/** The share auto's next thing to do: whichever comes first along the route, a pick-up or a drop. */
function nextShareStop(shift: ShareShift): { kind: "pickup" | "drop" | "end"; x: number; z: number; radius: number } {
  let best: { kind: "pickup" | "drop" | "end"; x: number; z: number; radius: number; at: number } = { kind: "end", ...shift.end, radius: SHARE_AUTO.endRadius, at: Infinity };
  for (const p of shift.riding) if (p.dropAt < best.at) best = { kind: "drop", ...p.drop, radius: SHARE_AUTO.dropRadius, at: p.dropAt };
  if (shift.aboard < SHARE_AUTO.capacity) {
    for (const p of shift.waiting) if (p.at < best.at) best = { kind: "pickup", ...p.stop, radius: SHARE_AUTO.boardRadius, at: p.at };
  }
  return { kind: best.kind, x: best.x, z: best.z, radius: best.radius };
}

/** What the desk needs from the game: the screen to stop while a board or result is open. */
export interface DeskHost {
  /** Stop the game behind a menu (no pause screen). */
  hold(): void;
  /** Carry on after the menu closes. */
  release(): void;
  /** Money was earned or taken: save the stage progress too. */
  saveMoney(): void;
  /** Game time, 0–24: some jobs are offered only at certain hours. */
  hour(): number;
}

export class JobDesk {
  readonly runner = new JobRunner(loadRecord());

  constructor(
    private readonly jobs: readonly Job[],
    private readonly money: MissionRunner,
    private readonly hud: Hud,
    private readonly sound: Sound,
    private readonly host: DeskHost,
  ) {}

  get active(): Job | null {
    return this.runner.job;
  }

  /** Open the job board over the game. */
  openBoard(): void {
    this.host.hold();
    const current = this.runner.job;
    const hour = this.host.hour();
    this.hud.showOverlay(
      "Job board",
      current ? `On the job: ${current.title}. Quitting costs ₹${current.fine} and reputation.` : `Everyday work around the city. Failing a job costs a fine and reputation, never the game. Reputation ${this.runner.reputation}.`,
    );
    this.hud.addOverlayList(
      this.jobs.map((job) => {
        const check = this.runner.available(job, hour);
        const best = this.runner.record().best[job.id];
        return {
          title: job.title,
          detail: job.brief,
          meta: `${VEHICLE_TYPES[job.vehicle].label} · up to ₹${job.payout} · ${Math.round(job.timeLimit / 60)} min${job.hours ? ` · ${hoursText(job.hours)}` : ""}${best ? ` · best ₹${best}` : ""}`,
          button: "Take job",
          testId: `take-${job.id}`,
          ...(check.ok ? {} : { disabled: current?.id === job.id ? "On this job now" : check.reason }),
          run: () => this.take(job),
        };
      }),
    );
    if (current) this.hud.addOverlayAction({ label: "Quit job", quiet: true, run: () => this.closeWith(this.runner.quit()) });
    this.hud.addOverlayAction({ label: "Close", quiet: true, run: () => this.close() });
  }

  private take(job: Job): void {
    this.handle(this.runner.accept(job, this.host.hour()));
    this.close();
  }

  private close(): void {
    this.hud.hideOverlay();
    this.host.release();
  }

  private closeWith(events: JobEvent[]): void {
    this.close();
    this.handle(events);
  }

  /** One fixed step. @param impact strength of a crash of the player's vehicle this step (0 for none) */
  fixedUpdate(dt: number, player: JobPlayer, impact: number): void {
    if (!this.runner.job) return;
    if (impact > 0) this.handle(this.runner.bump());
    this.handle(this.runner.update(dt, player));
  }

  /** Where the marker goes: the next stop, once the player is in the job's vehicle. */
  stopTarget(): { x: number; z: number; radius: number } | null {
    const shift = this.runner.share;
    if (shift) {
      if (!this.runner.started) {
        const start = shift.route.points[0]!;
        return { x: start.x, z: start.z, radius: 8 };
      }
      const next = nextShareStop(shift);
      return { x: next.x, z: next.z, radius: next.radius };
    }
    const stop = this.runner.stop;
    return stop ? { x: stop.x, z: stop.z, radius: stop.radius } : null;
  }

  /** The HUD panel for the job. */
  view(inVehicle: boolean, distance: number | null): MissionView | null {
    const job = this.runner.job;
    const stop = this.runner.stop;
    if (!job || !stop) return null;
    const vehicle = VEHICLE_TYPES[job.vehicle].label.toLowerCase();
    const shift = this.runner.share;
    if (shift) return this.shareView(job, shift, inVehicle, vehicle, distance);
    const dwell = this.runner.dwellLeft;
    const fareNote = this.runner.fare?.note() ?? null;
    const objective = !inVehicle
      ? `${this.runner.started ? "Get back in" : "Get in"} the ${vehicle}`
      : fareNote
        ? `${stop.label} · ${fareNote}`
        : dwell !== null
        ? `${stop.label}: wait ${Math.ceil(dwell)} s`
        : !this.runner.started && job.startRadius !== undefined
          ? `Drive to the start; the clock starts there. ${stop.label}`
          : stop.label;
    const bumps = this.runner.bumps > 0 ? ` · ${this.runner.bumps} bump${this.runner.bumps === 1 ? "" : "s"}` : "";
    const avoided = job.avoid && this.runner.avoidSeconds >= 1 ? ` · ${Math.round(this.runner.avoidSeconds)} s on ${job.avoid.name}` : "";
    return { title: `Job · ${job.title}${bumps}${avoided}`, objective, distance, secondsLeft: this.runner.secondsLeft };
  }

  private shareView(job: Job, shift: ShareShift, inVehicle: boolean, vehicle: string, distance: number | null): MissionView {
    const next = nextShareStop(shift);
    const near = distance !== null && distance <= next.radius;
    const objective = !inVehicle
      ? `${this.runner.started ? "Get back in" : "Get in"} the ${vehicle}`
      : !this.runner.started
        ? `Drive to the start of the route at ${shift.route.from}; the clock starts there`
        : next.kind === "pickup"
          ? near
            ? "Stop here to let them in"
            : "Someone is waving at the kerb: pull up beside them"
          : next.kind === "drop"
            ? near
              ? "Stop here: a passenger gets off"
              : "Drop the passenger where they asked"
            : `Drive on to ${shift.route.to}, the end of the route`;
    const bumps = this.runner.bumps > 0 ? ` · ${this.runner.bumps} bump${this.runner.bumps === 1 ? "" : "s"}` : "";
    return { title: `Job · ${job.title} · ${shift.aboard}/${SHARE_AUTO.capacity} aboard · ₹${shift.fares}${bumps}`, objective, distance, secondsLeft: this.runner.secondsLeft };
  }

  /** Minimap dots for a share auto shift: people waiting, and where those aboard get off. */
  markers(): MinimapMarker[] {
    const shift = this.runner.share;
    if (!shift || !this.runner.started) return [];
    return [
      ...shift.waiting.map((p) => ({ x: p.x, z: p.z, color: "#7bd389", size: 4 })),
      ...shift.riding.map((p) => ({ x: p.drop.x, z: p.drop.z, color: "#ff8fab", size: 4 })),
    ];
  }

  /** The share auto's route, for the minimap; null when not on a shift. */
  route(): readonly RoutePoint[] | null {
    return this.runner.share?.route.points ?? null;
  }

  shareSnapshot(): ShareSnapshot | null {
    const shift = this.runner.share;
    if (!shift) return null;
    const summary = shift.summary();
    const start = shift.route.points[0]!;
    return {
      aboard: shift.aboard,
      fares: shift.fares,
      carried: summary.carried,
      missed: summary.missed,
      left: summary.left,
      progress: shift.progress,
      length: shift.length,
      start: { x: start.x, z: start.z },
      end: shift.end,
      waiting: shift.waiting.map((p) => ({ id: p.id, x: p.x, z: p.z, stop: p.stop })),
      riding: shift.riding.map((p) => ({ id: p.id, drop: p.drop })),
    };
  }

  private handle(events: JobEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case "accepted":
          this.hud.showToast(event.job.title, event.job.brief, 5);
          break;
        case "started":
          this.sound.chime();
          this.hud.showToast("The clock is running", `${Math.floor(event.job.timeLimit / 60)}:${String(Math.round(event.job.timeLimit % 60)).padStart(2, "0")} for the whole job`, 3);
          break;
        case "stop":
          this.sound.chime();
          break;
        case "bump":
          this.hud.showToast("Bump!", event.job.kind === "ambulance" ? "Careful with the patient" : "That will cost you", 1.4);
          break;
        case "boarded":
          this.sound.chime();
          this.hud.showToast("Passenger in", `Getting off in about ${Math.round((event.passenger.dropAt - event.passenger.at) / 50) * 50} m · ${event.aboard}/${SHARE_AUTO.capacity} aboard`, 2.2);
          break;
        case "dropped":
          // Each passenger pays as they get off (so fares already taken are kept if the shift is quit).
          this.money.earn(event.fare);
          this.host.saveMoney();
          this.sound.cash();
          this.hud.showToast(`Fare +₹${event.fare}`, `${event.aboard}/${SHARE_AUTO.capacity} aboard`, 1.8);
          break;
        case "missed":
          this.hud.showToast("Missed their stop", "They got off further on and paid nothing", 2.4);
          break;
        case "left":
          this.hud.showToast("Passed someone waiting", "There was a free seat: that costs reputation", 2.2);
          break;
        case "avoid":
          this.hud.showToast(`${event.name} is jammed`, "Cross it, don't drive along it: time on it cuts the pay", 2.5);
          break;
        case "completed": {
          const { result } = event;
          // A share auto's fares were paid one by one as people got off.
          if (!result.share) this.money.earn(result.pay);
          this.host.saveMoney();
          this.save();
          this.sound.fanfare();
          this.sound.cash();
          this.host.hold();
          this.hud.showOverlay(
            result.share ? `${result.job.title} shift over` : `${result.job.title} complete`,
            `+₹${result.pay} · ${"★".repeat(result.stars)}${"☆".repeat(5 - result.stars)} · ${Math.round(result.seconds)} s · reputation ${result.reputation >= 0 ? "+" : ""}${result.reputation}. ${result.notes.join(". ")}.`,
            { label: "Continue", run: () => this.close() },
          );
          this.hud.addOverlayAction({ label: "Job board", quiet: true, run: () => this.openBoard() });
          break;
        }
        case "failed": {
          const fine = this.money.charge(event.fine);
          this.host.saveMoney();
          this.save();
          this.sound.fail();
          this.host.hold();
          this.hud.showOverlay(
            "Job failed",
            `${event.reason}. ${fine > 0 ? `Fine ₹${fine}. ` : ""}Reputation ${event.reputation}. The city still needs drivers: try again from the board.`,
            { label: "Continue", run: () => this.close() },
          );
          this.hud.addOverlayAction({ label: "Job board", quiet: true, run: () => this.openBoard() });
          break;
        }
      }
    }
  }

  save(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.runner.record()));
    } catch {
      // No storage: play on without saving.
    }
  }

  reset(): void {
    this.runner.reset();
    this.save();
  }
}
