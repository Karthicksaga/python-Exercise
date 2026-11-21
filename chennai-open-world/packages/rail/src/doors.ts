/**
 * The coaches' sliding doors: shut while the train moves, opening just after it stops and closing
 * before it leaves. `boarding` refuses a ticket once the doors start closing (the last 1.5 s of
 * the stop), so the two rules agree. Timings are estimates for a suburban EMU, not measured.
 */
import type { TrainState } from "./motion";

/** Seconds the doors take to slide open or shut. */
export const DOOR_SLIDE = 1.2;
/** Seconds after stopping before the doors start to open, and before leaving that they are shut. */
export const DOOR_DELAY = 0.3;

/** How far the doors are open, 0 shut to 1 open (eased), for a train in `state` that stops `dwell` seconds. */
export function doorOpenness(state: TrainState, dwell: number): number {
  if (state.stoppedAt === null) return 0;
  const sinceStop = dwell - state.dwellLeft;
  const t = Math.min(sinceStop - DOOR_DELAY, state.dwellLeft - DOOR_DELAY) / DOOR_SLIDE;
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}
