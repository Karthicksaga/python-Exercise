/**
 * Time of day in the game. One real minute is one game hour by default, so a full day takes
 * 24 minutes. Pure logic: the renderer reads `hour` for light and sky, the AI for traffic.
 */

/** Named times the player can jump to from the pause menu. */
export const TIMES_OF_DAY = [
  { label: "Morning", hour: 8.5 },
  { label: "Noon", hour: 12.5 },
  { label: "Evening", hour: 17.75 },
  { label: "Night", hour: 21.5 },
] as const;

export class GameClock {
  private time: number;

  /**
   * @param hour starting hour, 0 to 24 (golden hour, 17.75, by default)
   * @param hoursPerSecond game hours per real second; 0 stops the clock
   */
  constructor(hour = 17.75, readonly hoursPerSecond = 1 / 60) {
    this.time = GameClock.wrap(hour);
  }

  private static wrap(hour: number): number {
    if (!Number.isFinite(hour)) return 17.75;
    return ((hour % 24) + 24) % 24;
  }

  /** 0 (midnight) to just under 24. */
  get hour(): number {
    return this.time;
  }

  set hour(value: number) {
    this.time = GameClock.wrap(value);
  }

  advance(dt: number): void {
    this.time = GameClock.wrap(this.time + dt * this.hoursPerSecond);
  }

  /** The named time closest to now. */
  get label(): string {
    let best: string = TIMES_OF_DAY[0].label;
    let gap = Infinity;
    for (const t of TIMES_OF_DAY) {
      const d = Math.min(Math.abs(t.hour - this.time), 24 - Math.abs(t.hour - this.time));
      if (d < gap) {
        gap = d;
        best = t.label;
      }
    }
    return best;
  }

  /** Jump to the next named time (pause menu). */
  next(): void {
    const index = TIMES_OF_DAY.findIndex((t) => t.label === this.label);
    this.time = TIMES_OF_DAY[(index + 1) % TIMES_OF_DAY.length]!.hour;
  }

  /** "17:45" */
  text(): string {
    const minutes = Math.round(this.time * 60) % (24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
}
