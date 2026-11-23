/**
 * Runs the missions in order: tracks the current objective, the countdown, money earned and
 * which stages are done. Pure logic with no rendering or input, so it is fully unit-tested.
 */
import type { Mission, MissionEvent, Objective, PlayerStatus, Progress } from "./types";
import { pathLength, pointAlong, quarrySpeed, type QuarryPlace } from "./chase";
import { FareStop } from "./fares";
import { GoodsStop } from "./goods";

/** Below this speed (m/s) a vehicle counts as stopped. */
const STOPPED = 1.2;

export class MissionRunner {
  private readonly completed: Set<string>;
  private money: number;
  private missionIndex: number;
  private objectiveIndex = 0;
  private timeLeft: number | null = null;
  /** Metres the quarry of a chase objective has gone along its path. */
  private chased = 0;
  /** People getting in or out at the current objective, when it has a fare. */
  private fareStop: FareStop | null = null;
  /** Goods changing hands at the current objective, when it has any. */
  private goodsStop: GoodsStop | null = null;
  /** Passengers in the vehicle before the current objective (picked up earlier in the stage). */
  private riders = 0;
  /** An evade objective: the wanted level has been raised since it started. */
  private wantedSeen = false;

  constructor(
    private readonly missions: readonly Mission[],
    saved?: Progress,
  ) {
    // Ignore saved ids that no longer exist (missions changed between versions).
    const known = new Set(missions.map((m) => m.id));
    this.completed = new Set((saved?.completed ?? []).filter((id) => known.has(id)));
    this.money = Math.max(0, Math.floor(saved?.money ?? 0));
    this.missionIndex = this.firstOpen();
    this.armTimer();
  }

  private firstOpen(): number {
    const index = this.missions.findIndex((m) => !this.completed.has(m.id));
    return index === -1 ? this.missions.length : index;
  }

  /** The mission being played, or null when every stage is finished. */
  get mission(): Mission | null {
    return this.missions[this.missionIndex] ?? null;
  }

  get objective(): Objective | null {
    return this.mission?.objectives[this.objectiveIndex] ?? null;
  }

  /** Seconds left on the current objective, or null when it isn't timed. */
  get secondsLeft(): number | null {
    return this.timeLeft;
  }

  /** Where the quarry of the current chase objective is, or null when the objective is not a chase. */
  get quarry(): QuarryPlace | null {
    const objective = this.objective;
    return objective?.type === "chase" ? pointAlong(objective.path, this.chased) : null;
  }

  /** The pick-up or drop under way at the current objective, or null when it has no fare. */
  get fare(): FareStop | null {
    return this.fareStop;
  }

  /** The goods handover under way at the current objective, or null when it has none. */
  get goods(): GoodsStop | null {
    return this.goodsStop;
  }

  /** Where the current objective sits in its stage (for `cargoAboard`). */
  get objectiveNumber(): number {
    return this.objectiveIndex;
  }

  /** Passengers in the vehicle now (picked up earlier, less any already out at this stop). */
  get aboard(): number {
    return this.riders + (this.fareStop?.change ?? 0);
  }

  get balance(): number {
    return this.money;
  }

  get stagesDone(): number {
    return this.completed.size;
  }

  get stageCount(): number {
    return this.missions.length;
  }

  progress(): Progress {
    return { completed: [...this.completed], money: this.money };
  }

  private armTimer(): void {
    const objective = this.objective;
    this.timeLeft = objective?.type === "reach" && objective.timeLimit ? objective.timeLimit : null;
    this.chased = 0;
    this.wantedSeen = false;
    // Back at the start of a stage nobody is aboard (a failed fare's passenger has gone home).
    if (this.objectiveIndex === 0) this.riders = 0;
    this.fareStop = objective?.type === "reach" && objective.fare ? new FareStop(objective.fare, objective.mode && objective.mode !== "foot" ? objective.mode : "car") : null;
    this.goodsStop = objective?.type === "reach" && objective.goods ? new GoodsStop(objective.goods, objective.mode && objective.mode !== "foot" ? objective.mode : "car") : null;
  }

  private met(objective: Objective, player: PlayerStatus): boolean {
    if (objective.type === "enter") return player.mode === objective.vehicle;
    if (objective.type === "defeat") return player.cleared?.has(objective.group) ?? false;
    if (objective.type === "evade") return this.wantedSeen && (player.wanted ?? 0) === 0;
    if (objective.type === "chase") {
      // Caught: alongside the quarry in a vehicle.
      const quarry = pointAlong(objective.path, this.chased);
      return player.mode !== "foot" && Math.hypot(player.x - quarry.x, player.z - quarry.z) <= objective.radius;
    }
    if (objective.mode && player.mode !== objective.mode) return false;
    if (objective.byTrain && !player.onTrain) return false;
    if (Math.hypot(player.x - objective.x, player.z - objective.z) > objective.radius) return false;
    return !objective.stop || player.speed < STOPPED;
  }

  /** Advance by `dt` seconds. Returns what happened, for messages and sounds. */
  update(dt: number, player: PlayerStatus): MissionEvent[] {
    const mission = this.mission;
    const objective = this.objective;
    if (!mission || !objective) return [];
    const events: MissionEvent[] = [];

    if (objective.type === "evade" && (player.wanted ?? 0) > 0) this.wantedSeen = true;
    // The clock waits while people get in or out: arriving in time is what counts.
    if (this.timeLeft !== null && !this.fareStop?.started && !this.goodsStop?.started) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        // Out of time: the stage starts again from its first objective.
        this.objectiveIndex = 0;
        this.armTimer();
        return [{ type: "failed", mission, reason: "Out of time" }];
      }
    }
    if (objective.type === "chase" && !this.met(objective, player)) {
      const quarry = pointAlong(objective.path, this.chased);
      this.chased += quarrySpeed(objective.speed, Math.hypot(player.x - quarry.x, player.z - quarry.z)) * dt;
      if (this.chased >= pathLength(objective.path)) {
        // Got away: the stage starts again from its first objective.
        this.objectiveIndex = 0;
        this.armTimer();
        return [{ type: "failed", mission, reason: "They got away" }];
      }
      return events;
    }
    if (this.fareStop) {
      // Stopped in the marker: the passengers walk over and get in (or out) before it counts.
      if (!this.fareStop.step(dt, this.met(objective, player), player)) return events;
    } else if (this.goodsStop) {
      // Stopped in the marker: someone walks over and hands the goods in (or takes them) first.
      if (!this.goodsStop.step(dt, this.met(objective, player), player)) return events;
    } else if (!this.met(objective, player)) return events;

    this.riders = this.aboard;
    this.objectiveIndex++;
    const next = mission.objectives[this.objectiveIndex];
    if (next) {
      this.armTimer();
      events.push({ type: "objective", label: next.label });
      return events;
    }

    this.completed.add(mission.id);
    this.money += mission.reward;
    events.push({ type: "completed", mission });
    this.missionIndex = this.firstOpen();
    this.objectiveIndex = 0;
    this.armTimer();
    if (!this.mission) events.push({ type: "allDone" });
    return events;
  }

  /** Start the current stage again from its first objective (after the player is knocked out). */
  restartStage(): void {
    this.objectiveIndex = 0;
    this.armTimer();
  }

  /** Take money away (hospital bill). Never goes below zero. Returns what was actually taken. */
  charge(rupees: number): number {
    const taken = Math.min(this.money, Math.max(0, Math.floor(rupees)));
    this.money -= taken;
    return taken;
  }

  /** Add money earned outside the stages (city jobs). */
  earn(rupees: number): void {
    this.money += Math.max(0, Math.floor(rupees));
  }

  /** Forget all progress (new game). */
  reset(): void {
    this.completed.clear();
    this.money = 0;
    this.missionIndex = 0;
    this.objectiveIndex = 0;
    this.armTimer();
  }
}
