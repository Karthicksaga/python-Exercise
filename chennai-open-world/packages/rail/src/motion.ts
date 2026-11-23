/**
 * How a suburban train runs along a line: it enters at line speed (or starts from a terminus),
 * brakes to a stop at each station, waits, accelerates away, and leaves at the far end. The
 * whole run is worked out once per line as a list of phases of constant acceleration, so a
 * train's state at any time is a lookup: trains are a function of the railway clock.
 *
 * The figures are estimates for an EMU of this kind, not measured: about 0.8 m/s² away from a
 * stop, 0.9 m/s² braking, 80 km/h top speed on these short hops, 30 s at each station.
 */

export interface MotionSpec {
  /** m/s². */
  readonly accel: number;
  /** m/s², positive. */
  readonly brake: number;
  /** m/s. */
  readonly topSpeed: number;
  /** Seconds at each station. */
  readonly dwell: number;
}

export const EMU_MOTION: MotionSpec = { accel: 0.8, brake: 0.9, topSpeed: 22, dwell: 30 };

/** A stretch of constant acceleration (a = 0 and v0 = 0 for a stop). */
export interface Phase {
  readonly t0: number;
  readonly duration: number;
  readonly s0: number;
  readonly v0: number;
  readonly a: number;
  /** Index (in the stop list) of the station the train stands at, during a stop. */
  readonly stop?: number;
}

export interface TrainState {
  /** Metres along the line. */
  readonly s: number;
  /** m/s. */
  readonly speed: number;
  /** Index of the stop the train is standing at, or null while moving. */
  readonly stoppedAt: number | null;
  /** Seconds before it leaves the stop (0 while moving). */
  readonly dwellLeft: number;
  /** Index of the next stop ahead (the one it stands at counts as passed), or null after the last. */
  readonly nextStop: number | null;
}

export class RunProfile {
  readonly phases: Phase[] = [];
  /** Seconds from entering (or leaving the first terminus) to leaving the line. */
  readonly duration: number;
  /** When the train arrives at each stop, seconds into the run. */
  readonly arrivals: number[] = [];

  /**
   * @param length line length, metres
   * @param stops distances of the stops along the line, ascending
   */
  constructor(
    readonly length: number,
    readonly stops: readonly number[],
    readonly spec: MotionSpec = EMU_MOTION,
  ) {
    let t = 0;
    let s = 0;
    // Trains enter from beyond the map at line speed, unless the line starts at a stop.
    let v = stops.length > 0 && stops[0]! < 1 ? 0 : spec.topSpeed;
    const push = (duration: number, a: number, stop?: number) => {
      if (duration <= 0) return;
      this.phases.push(stop === undefined ? { t0: t, duration, s0: s, v0: v, a } : { t0: t, duration, s0: s, v0: 0, a: 0, stop });
      s += v * duration + 0.5 * a * duration * duration;
      v += a * duration;
      t += duration;
    };
    stops.forEach((target, index) => {
      const distance = target - s;
      if (distance > 0.01) this.runTo(distance, v, true, push);
      // Snap away rounding so each stop is exact.
      s = target;
      v = 0;
      this.arrivals.push(t);
      push(spec.dwell, 0, index);
    });
    if (length - s > 0.01) this.runTo(length - s, v, false, push);
    this.duration = t;
  }

  /** Phases covering `distance` from speed `v0`, ending stopped (`stop`) or at whatever speed is reached. */
  private runTo(distance: number, v0: number, stop: boolean, push: (duration: number, a: number) => void): void {
    const { accel: a, brake: b, topSpeed: top } = this.spec;
    if (!stop) {
      // Accelerate to top speed, then hold it to the end.
      const toTop = Math.max(0, (top * top - v0 * v0) / (2 * a));
      if (toTop >= distance) {
        const v1 = Math.sqrt(v0 * v0 + 2 * a * distance);
        push((v1 - v0) / a, a);
      } else {
        push((top - v0) / a, a);
        push((distance - toTop) / top, 0);
      }
      return;
    }
    // Highest speed reachable when accelerating then braking to a stop within the distance.
    let peak = Math.sqrt((distance + (v0 * v0) / (2 * a)) / (1 / (2 * a) + 1 / (2 * b)));
    if (peak < v0) {
      // Too close to stop at the normal rate: brake harder, all the way.
      const hard = (v0 * v0) / (2 * distance);
      push(v0 / hard, -hard);
      return;
    }
    peak = Math.min(peak, top);
    const up = (peak * peak - v0 * v0) / (2 * a);
    const down = (peak * peak) / (2 * b);
    push((peak - v0) / a, a);
    push((distance - up - down) / peak, 0);
    push(peak / b, -b);
  }

  /** Where the train is `t` seconds into its run (clamped to the run). */
  state(t: number): TrainState {
    const clamped = Math.max(0, Math.min(this.duration, t));
    let phase = this.phases[this.phases.length - 1];
    for (const p of this.phases) {
      if (clamped < p.t0 + p.duration) {
        phase = p;
        break;
      }
    }
    if (!phase) return { s: 0, speed: 0, stoppedAt: null, dwellLeft: 0, nextStop: this.stops.length > 0 ? 0 : null };
    const tau = Math.min(phase.duration, clamped - phase.t0);
    const s = Math.min(this.length, phase.s0 + phase.v0 * tau + 0.5 * phase.a * tau * tau);
    const speed = Math.max(0, phase.v0 + phase.a * tau);
    if (phase.stop !== undefined) {
      const next = phase.stop + 1 < this.stops.length ? phase.stop + 1 : null;
      return { s, speed: 0, stoppedAt: phase.stop, dwellLeft: phase.duration - tau, nextStop: next };
    }
    const next = this.stops.findIndex((stop) => stop > s + 0.5);
    return { s, speed, stoppedAt: null, dwellLeft: 0, nextStop: next >= 0 ? next : null };
  }
}
