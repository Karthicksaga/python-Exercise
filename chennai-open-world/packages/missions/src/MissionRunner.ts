/**
 * Runs the missions in order: tracks the current objective, the countdown, money earned and
 * which stages are done. Pure logic with no rendering or input, so it is fully unit-tested.
 */
import type { Mission, MissionEvent, Objective, PlayerStatus, Progress } from "./types";

/** Below this speed (m/s) a vehicle counts as stopped. */
const STOPPED = 1.2;

export class MissionRunner {
  private readonly completed: Set<string>;
  private money: number;
  private missionIndex: number;
  private objectiveIndex = 0;
  private timeLeft: number | null = null;

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
  }

  private met(objective: Objective, player: PlayerStatus): boolean {
    if (objective.type === "enter") return player.mode === objective.vehicle;
    if (objective.type === "defeat") return player.cleared?.has(objective.group) ?? false;
    if (objective.mode && player.mode !== objective.mode) return false;
    if (Math.hypot(player.x - objective.x, player.z - objective.z) > objective.radius) return false;
    return !objective.stop || player.speed < STOPPED;
  }

  /** Advance by `dt` seconds. Returns what happened, for messages and sounds. */
  update(dt: number, player: PlayerStatus): MissionEvent[] {
    const mission = this.mission;
    const objective = this.objective;
    if (!mission || !objective) return [];
    const events: MissionEvent[] = [];

    if (this.timeLeft !== null) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        // Out of time: the stage starts again from its first objective.
        this.objectiveIndex = 0;
        this.armTimer();
        return [{ type: "failed", mission, reason: "Out of time" }];
      }
    }
    if (!this.met(objective, player)) return events;

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
