/**
 * The railway at run time: each line's path and run profile, and a timetable that says which
 * trains are on the line at a given railway-clock time and where. Trains are entries in the
 * timetable; the game only builds bodies and models for the few near the player.
 */
import { RunProfile, EMU_MOTION, type MotionSpec, type TrainState } from "./motion";
import { RailPath, type Point2 } from "./path";
import type { RailEndData, RailFile, RailLineData, RailStationData, RailStopData } from "./types";

/** Platform length (estimated: long enough for the game's four-coach trains, with room). */
export const PLATFORM_LENGTH = 110;
/** Platform height above the ground, metres (Indian high-level platforms are about 0.84 m). */
export const PLATFORM_HEIGHT = 0.9;
export const PLATFORM_WIDTH = 4;
/** Distance from the track's centre to the platform's edge. */
export const PLATFORM_EDGE = 1.75;
/** Ticket for one ride, rupees (estimated: a second-class single for a short suburban trip). */
export const FARE = 5;

/** A train on the line now. */
export interface TrainAt {
  /** Stable while the train is on the line: line id and departure number. */
  readonly id: string;
  readonly line: RailLine;
  /** Seconds into its run. */
  readonly t: number;
  readonly state: TrainState;
}

export class RailLine {
  readonly id: string;
  readonly name: string;
  readonly path: RailPath;
  readonly stops: readonly RailStopData[];
  readonly from: RailEndData;
  readonly to: RailEndData;
  readonly profile: RunProfile;
  /** Seconds between departures, and of the first one. */
  readonly headway: number;
  readonly offset: number;

  constructor(data: RailLineData, spec: MotionSpec = EMU_MOTION) {
    this.id = data.id;
    this.name = data.name;
    this.path = RailPath.fromFlat(data.points);
    this.stops = [...data.stops].sort((a, b) => a.s - b.s);
    this.from = data.from;
    this.to = data.to;
    this.headway = data.headwayMinutes * 60;
    this.offset = data.offsetMinutes * 60;
    this.profile = new RunProfile(this.path.length, this.stops.map((stop) => stop.s), spec);
  }

  /** "to Tambaram" for trains running off the map, "to Chennai Central" for a terminus on it. */
  get destination(): string {
    return this.to.name;
  }

  /** Trains on the line at railway time `clock` (seconds). */
  trains(clock: number): TrainAt[] {
    const out: TrainAt[] = [];
    const first = Math.ceil((clock - this.offset - this.profile.duration) / this.headway);
    const last = Math.floor((clock - this.offset) / this.headway);
    for (let k = Math.max(first, -1_000_000); k <= last; k++) {
      const t = clock - (this.offset + k * this.headway);
      if (t < 0 || t > this.profile.duration) continue;
      out.push({ id: `${this.id}#${k}`, line: this, t, state: this.profile.state(t) });
    }
    return out;
  }

  /** The train with this departure number, if it is on the line now. */
  train(departure: number, clock: number): TrainAt | null {
    const t = clock - (this.offset + departure * this.headway);
    if (t < 0 || t > this.profile.duration) return null;
    return { id: `${this.id}#${departure}`, line: this, t, state: this.profile.state(t) };
  }

  /** Seconds from `clock` until the next train arrives at stop `index` (0 if one stands there). */
  nextArrival(index: number, clock: number): number {
    const arrival = this.profile.arrivals[index];
    if (arrival === undefined) return Infinity;
    const dwell = this.profile.spec.dwell;
    // The latest departure whose train has not yet left this stop.
    const k = Math.ceil((clock - this.offset - arrival - dwell) / this.headway);
    const at = this.offset + k * this.headway + arrival;
    return Math.max(0, at - clock);
  }
}

export class RailNetwork {
  readonly lines: RailLine[];
  readonly stations: readonly RailStationData[];
  readonly attribution: string;

  constructor(readonly file: RailFile, spec: MotionSpec = EMU_MOTION) {
    this.lines = file.lines.map((line) => new RailLine(line, spec));
    this.stations = file.stations;
    this.attribution = file.attribution;
  }

  trains(clock: number): TrainAt[] {
    return this.lines.flatMap((line) => line.trains(clock));
  }

  line(id: string): RailLine | undefined {
    return this.lines.find((line) => line.id === id);
  }

  station(id: string): RailStationData | undefined {
    return this.stations.find((station) => station.id === id);
  }
}

/** Where a stop's platform is: its centre, the way the track runs and the side it lies on. */
export function platformOf(line: RailLine, stop: RailStopData): { x: number; z: number; yaw: number; s: number; lateral: number } {
  const lateral = stop.side * (PLATFORM_EDGE + PLATFORM_WIDTH / 2);
  const centre = line.path.beside(stop.s, lateral);
  return { ...centre, yaw: line.path.at(stop.s).yaw, s: stop.s, lateral };
}

/** The stop whose platform (or the ground right by it) the player is at, if any. */
export function stopAt(line: RailLine, p: Point2): number | null {
  const where = line.path.project(p);
  if (where.distance > 16) return null;
  for (let i = 0; i < line.stops.length; i++) {
    const stop = line.stops[i]!;
    if (Math.abs(where.s - stop.s) > PLATFORM_LENGTH / 2 + 8) continue;
    // On the platform's side of the track, or standing on the track by it.
    if (where.lateral * stop.side > -2.5) return i;
  }
  return null;
}

export type BoardingAnswer =
  | { readonly ok: true; readonly fare: number }
  | { readonly ok: false; readonly reason: string };

/**
 * May the player board this train at stop `index`? The train must be standing there with time
 * left, it must stop again on the map, and the player must have the fare.
 */
export function boarding(train: TrainAt, index: number, money: number): BoardingAnswer {
  const { state, line } = train;
  if (state.stoppedAt !== index) return { ok: false, reason: "The train is not standing here." };
  if (state.dwellLeft < 1.5) return { ok: false, reason: "The doors are closing." };
  if (state.nextStop === null) {
    return { ok: false, reason: line.to.beyond ? `This train's next stop is beyond the map (towards ${line.to.name}).` : "This train terminates here." };
  }
  if (money < FARE) return { ok: false, reason: `A ticket costs ₹${FARE}.` };
  return { ok: true, fare: FARE };
}

/** True when a rider must get off here: the train stops on the map no more. */
export function rideEndsAt(train: TrainAt): boolean {
  return train.state.stoppedAt !== null && train.state.nextStop === null;
}

/** May a rider step off now? Only while the train stands at a station. */
export function canStepOff(train: TrainAt): boolean {
  return train.state.stoppedAt !== null && train.state.dwellLeft > 0.2;
}
