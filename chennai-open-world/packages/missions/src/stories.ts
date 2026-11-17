/**
 * Short stories: optional, light missions that use the places (a hospital check-up for
 * grandmother, a gym bet, the first show of a new film). A story is offered at a place, has
 * steps in order like a stage (reach, get in a vehicle, or do something inside a place) and pays
 * a reward once. Failing one (out of time) just ends it; it can be started again. Pure logic.
 */
import type { Objective, PlayerStatus } from "./types";

/** Do something inside a place: met when the game reports that activity there. */
export interface ActivityStep {
  readonly type: "activity";
  readonly label: string;
  /** Place id. */
  readonly place: string;
  /** Activity id the place screen reports, e.g. "checkup". */
  readonly activity: string;
  /** The place's entrance, for the marker. */
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export type StoryStep = Objective | ActivityStep;

export interface Story {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
  /** Rupees paid the first time it is finished. */
  readonly reward: number;
  /** Place id where the story is offered. */
  readonly offeredAt: string;
  readonly steps: readonly StoryStep[];
  /** Shown when it is finished. */
  readonly ending: string;
}

export type StoryEvent =
  | { readonly type: "started"; readonly story: Story }
  | { readonly type: "step"; readonly story: Story; readonly label: string; readonly index: number }
  | { readonly type: "completed"; readonly story: Story; readonly reward: number }
  | { readonly type: "failed"; readonly story: Story; readonly reason: string };

/** Below this speed (m/s) a vehicle counts as stopped (as for stages). */
const STOPPED = 1.2;

export class StoryRunner {
  private current: Story | null = null;
  private index = 0;
  private timeLeft: number | null = null;
  private readonly finished: Set<string>;

  constructor(
    private readonly stories: readonly Story[],
    completed: Iterable<string> = [],
  ) {
    const known = new Set(stories.map((s) => s.id));
    this.finished = new Set([...completed].filter((id) => known.has(id)));
  }

  get story(): Story | null {
    return this.current;
  }

  get step(): StoryStep | null {
    return this.current?.steps[this.index] ?? null;
  }

  get stepNumber(): number {
    return this.index;
  }

  get secondsLeft(): number | null {
    return this.timeLeft;
  }

  get completed(): ReadonlySet<string> {
    return this.finished;
  }

  /** Stories offered at a place that have not been finished yet. */
  offeredAt(place: string): Story[] {
    return this.stories.filter((s) => s.offeredAt === place && !this.finished.has(s.id));
  }

  /** The activity the current step wants done at this place, if any. */
  wanted(place: string): ActivityStep | null {
    const step = this.step;
    return step?.type === "activity" && step.place === place ? step : null;
  }

  start(id: string): StoryEvent[] {
    const story = this.stories.find((s) => s.id === id);
    if (!story || this.current || this.finished.has(id)) return [];
    this.current = story;
    this.index = 0;
    this.arm();
    return [{ type: "started", story }];
  }

  /** Give up the story (no penalty: it can be started again). */
  quit(): StoryEvent[] {
    const story = this.current;
    if (!story) return [];
    this.current = null;
    this.timeLeft = null;
    return [{ type: "failed", story, reason: "Story abandoned" }];
  }

  private arm(): void {
    const step = this.step;
    this.timeLeft = step?.type === "reach" && step.timeLimit ? step.timeLimit : null;
  }

  private met(step: StoryStep, player: PlayerStatus): boolean {
    if (step.type === "enter") return player.mode === step.vehicle;
    if (step.type === "defeat" || step.type === "activity") return false;
    if (step.mode && player.mode !== step.mode) return false;
    if (Math.hypot(player.x - step.x, player.z - step.z) > step.radius) return false;
    return !step.stop || player.speed < STOPPED;
  }

  private advance(story: Story): StoryEvent[] {
    this.index++;
    const next = story.steps[this.index];
    if (next) {
      this.arm();
      return [{ type: "step", story, label: next.label, index: this.index }];
    }
    this.current = null;
    this.timeLeft = null;
    const first = !this.finished.has(story.id);
    this.finished.add(story.id);
    return [{ type: "completed", story, reward: first ? story.reward : 0 }];
  }

  update(dt: number, player: PlayerStatus): StoryEvent[] {
    const story = this.current;
    const step = this.step;
    if (!story || !step) return [];
    if (this.timeLeft !== null) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.current = null;
        this.timeLeft = null;
        return [{ type: "failed", story, reason: "Out of time" }];
      }
    }
    return this.met(step, player) ? this.advance(story) : [];
  }

  /** The player did `activity` inside `place`. */
  activity(place: string, activity: string): StoryEvent[] {
    const story = this.current;
    const step = this.step;
    if (!story || step?.type !== "activity" || step.place !== place || step.activity !== activity) return [];
    return this.advance(story);
  }

  /** Forget everything (new game). */
  reset(): void {
    this.current = null;
    this.timeLeft = null;
    this.finished.clear();
  }
}
