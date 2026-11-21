/**
 * Fares: people getting in and out at a stage's or a job's pick-up and drop. Before, a pick-up
 * was only a marker to stop at; now someone waits at the kerb, walks to the vehicle once it has
 * stopped, and gets in, and only then is the stop done. At a drop they get out, walk onto the
 * pavement and off. A bus stop does both: some get off, then others get on.
 *
 * Pure logic, one `FareStop` per stop: each person has their own clock, so the game can draw
 * every one of them (`FareFigures` in the game) from `people()`. All times are estimates.
 *
 * Rules:
 * - Nobody moves until the vehicle is stopped in the marker (`ready`).
 * - Those getting off go first, one after the other; then those getting on, one after the other.
 * - Someone walking to the vehicle walks back if it drives off before they reach the door. Once
 *   a person is at the door (getting in or out) they finish, and someone getting off walks off
 *   whatever the vehicle does next.
 * - The stop is done when every boarder is in and every leaver has walked off.
 */
import type { TravelMode } from "./types";

export type FareVehicle = Exclude<TravelMode, "foot">;

export interface FarePoint {
  readonly x: number;
  readonly z: number;
}

/** Who gets in and out at a stop, and where they wait (or go to) on the pavement. */
export interface Fare {
  /** People who get in here. */
  readonly board?: number;
  /** People who get out here. */
  readonly alight?: number;
  /** Where they wait, or walk to after getting out: on the pavement beside the marker. */
  readonly kerb: FarePoint;
  /** A patient (the ambulance): slower in and out, said so on the HUD. */
  readonly patient?: boolean;
}

/** Every timing in one place. Estimates, judged against people getting into Chennai autos, cabs and buses. */
export const FARES = {
  /** Walking pace to and from the vehicle, m/s. */
  walkSpeed: 1.3,
  /** Longest walk counted (someone far across a wide road hurries), metres. */
  maxWalk: 14,
  /** Shortest walk counted, metres. */
  minWalk: 0.6,
  /** From the vehicle's centre to where a passenger stands at its door, metres (about half its width). */
  doorOffset: 1,
  /** Seconds to get in (or out) once at the door, by vehicle. */
  enter: { auto: 1.2, car: 1.8, ambulance: 2.6, bus: 1, bike: 1 } as Readonly<Record<FareVehicle, number>>,
  /** A patient takes this much longer (helped onto the stretcher). */
  patientFactor: 1.5,
  /** Seconds between one person and the next. */
  gap: 0.9,
  /** Metres someone getting out walks past the kerb point, onto the pavement and away. */
  walkOff: 2.5,
} as const;

export type FareStage =
  /** Getting on: at the kerb, walking to the door, getting in, in. */
  | "waiting"
  | "walking"
  | "entering"
  | "inside"
  /** Getting off: still in, getting out at the door, walking off, gone. */
  | "riding"
  | "exiting"
  | "leaving"
  | "gone";

/** One person at a stop as the game draws them. */
export interface FarePerson {
  readonly action: "board" | "alight";
  /** Order among those boarding (or alighting) here, from 0. */
  readonly index: number;
  readonly stage: FareStage;
  /** How far through the stage, 0 to 1 (0 for waiting, inside, riding and gone). */
  readonly share: number;
  /** Seconds the walk takes (to the door, or from it onto the pavement). */
  readonly walkSeconds: number;
}

interface Person {
  readonly action: "board" | "alight";
  readonly index: number;
  /** Seconds into this person's own sequence. */
  t: number;
  walk: number;
}

/** Seconds of a walk of `metres`, clamped to the counted range. */
export function walkTime(metres: number): number {
  return Math.min(FARES.maxWalk, Math.max(FARES.minWalk, metres)) / FARES.walkSpeed;
}

/** Seconds at the door for one person. */
export function doorTime(vehicle: FareVehicle, patient = false): number {
  return FARES.enter[vehicle] * (patient ? FARES.patientFactor : 1);
}

export class FareStop {
  private readonly people_: Person[];
  private readonly door: number;

  constructor(
    readonly fare: Fare,
    readonly vehicle: FareVehicle,
  ) {
    this.door = doorTime(vehicle, fare.patient);
    this.people_ = [
      ...Array.from({ length: Math.max(0, fare.alight ?? 0) }, (_, index) => ({ action: "alight" as const, index, t: 0, walk: 0 })),
      ...Array.from({ length: Math.max(0, fare.board ?? 0) }, (_, index) => ({ action: "board" as const, index, t: 0, walk: 0 })),
    ];
  }

  /** Someone has started moving: the stage's clock waits while people get in and out. */
  get started(): boolean {
    return this.people_.some((p) => p.t > 0);
  }

  get done(): boolean {
    return this.people_.every((p) => this.finished(p));
  }

  /** Change in the people inside the vehicle so far: those in, less those who have got out. */
  get change(): number {
    let n = 0;
    for (const p of this.people_) {
      if (p.action === "board" && p.walk > 0 && p.t >= p.walk + this.door) n++;
      if (p.action === "alight" && p.t > 0) n--;
    }
    return n;
  }

  private finished(p: Person): boolean {
    return p.action === "board" ? p.walk > 0 && p.t >= p.walk + this.door : p.walk > 0 && p.t >= this.door + p.walk;
  }

  /** At the door or past it: carries on whatever the vehicle does. */
  private committed(p: Person): boolean {
    return p.action === "alight" ? p.t > 0 : p.walk > 0 && p.t >= p.walk;
  }

  /**
   * One step.
   * @param ready the vehicle is stopped in the marker, with the player driving it
   * @param at the vehicle's position (walks are measured from the kerb point to it)
   * @returns true once everyone is in and out
   */
  step(dt: number, ready: boolean, at: FarePoint): boolean {
    const kerbToVehicle = Math.max(0, Math.hypot(at.x - this.fare.kerb.x, at.z - this.fare.kerb.z) - FARES.doorOffset);
    let before: Person | null = null;
    for (const p of this.people_) {
      if (this.finished(p)) {
        before = p;
        continue;
      }
      if (this.committed(p)) {
        p.t += dt;
      } else if (ready && this.mayStart(p, before)) {
        // The walk is measured as they set off, from where the vehicle stands then.
        if (p.t === 0) p.walk = p.action === "board" ? walkTime(kerbToVehicle) : walkTime(kerbToVehicle + FARES.walkOff);
        p.t += dt;
      } else if (p.t > 0) {
        // The vehicle moved off before they reached it: they walk back to the kerb.
        p.t = Math.max(0, p.t - dt);
      }
      before = p;
    }
    return this.done;
  }

  /** The one before has gone ahead far enough, and everyone getting off is out of the door. */
  private mayStart(p: Person, before: Person | null): boolean {
    if (p.action === "board" && this.people_.some((q) => q.action === "alight" && q.t < this.door)) return false;
    if (!before || before.action !== p.action) return true;
    return before.t >= FARES.gap || this.finished(before);
  }

  /** Everyone at this stop and where they are in their sequence. */
  people(): FarePerson[] {
    return this.people_.map((p) => {
      const base = { action: p.action, index: p.index, walkSeconds: p.walk };
      if (p.action === "board") {
        if (p.t <= 0 || p.walk <= 0) return { ...base, stage: "waiting" as const, share: 0 };
        if (p.t < p.walk) return { ...base, stage: "walking" as const, share: p.t / p.walk };
        if (p.t < p.walk + this.door) return { ...base, stage: "entering" as const, share: (p.t - p.walk) / this.door };
        return { ...base, stage: "inside" as const, share: 0 };
      }
      if (p.t <= 0) return { ...base, stage: "riding" as const, share: 0 };
      if (p.t < this.door) return { ...base, stage: "exiting" as const, share: p.t / this.door };
      if (p.t < this.door + p.walk) return { ...base, stage: "leaving" as const, share: (p.t - this.door) / p.walk };
      return { ...base, stage: "gone" as const, share: 0 };
    });
  }

  /** A line for the HUD while people are moving, or null. */
  note(): string | null {
    if (!this.started || this.done) return null;
    const out = this.people_.some((p) => p.action === "alight" && !this.finished(p));
    const into = this.people_.some((p) => p.action === "board" && !this.finished(p));
    const many = (this.fare.board ?? 0) + (this.fare.alight ?? 0) > 1;
    if (this.fare.patient) return out ? "The patient is being taken in" : "The patient is being loaded";
    if (out && into) return "People getting off and on";
    if (out) return many ? "Passengers getting out" : "Passenger getting out";
    return many ? "Passengers getting in" : "Passenger getting in";
  }
}

/** People getting on and off at each of a bus route's stops: nobody on at the start, everyone off at the end. */
export function busCrowd(stops: number, capacity = 6): Array<{ board: number; alight: number }> {
  const out: Array<{ board: number; alight: number }> = [];
  let aboard = 0;
  for (let i = 0; i < stops; i++) {
    const last = i === stops - 1;
    // A few off at every stop after the first (more as the bus fills), everyone at the last.
    const alight = last ? aboard : Math.min(aboard, i === 0 ? 0 : 1 + (i % 2));
    aboard -= alight;
    // Three at the first stop, then two or one; nobody boards at the end of the line.
    const board = last ? 0 : Math.min(capacity - aboard, i === 0 ? 3 : 2 - (i % 2));
    aboard += board;
    out.push({ board, alight });
  }
  return out;
}
