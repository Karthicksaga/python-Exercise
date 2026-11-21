/**
 * Getting in and out of a vehicle on screen: runs a `Boarding` sequence (`@cow/vehicles`) and
 * turns it into the door's swing and the player's figure walking to the door, sitting down and
 * standing up again. The rules (phases, timings, the path round the body) are in `@cow/vehicles`;
 * this module only places things, like `Railway` does for trains. The game decides what happens
 * when the driver is seated or back on their feet (`Game.ts`).
 */
import * as THREE from "three";
import { sitWeight, type HumanFigure } from "@cow/player";
import { Boarding, alongPath, approachPath, pathLength, type BoardingEvent, type BoardingPhase, type FlatPoint, type Vehicle } from "@cow/vehicles";

interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** What tests and the debug snapshot can read about a sequence in progress. */
export interface BoardingSnapshot {
  readonly direction: "in" | "out";
  readonly phase: BoardingPhase;
  readonly vehicle: string;
  readonly door: number;
  readonly progress: number;
  /** Share from standing (0) to seated (1). */
  readonly seated: number;
}

/** How far the hips dip below a straight line while ducking through a doorway, and rise over a motorbike's seat, metres (estimated). */
const DUCK = 0.06;
const SWING_LIFT = 0.08;

/** Shortest-way turn from heading a to heading b by share t. */
function turn(a: number, b: number, t: number): number {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

export class Boarder {
  private boarding: Boarding | null = null;
  private vehicle: Vehicle | null = null;
  /** The walk to the entry point, in the vehicle's frame, and the heights of its ends. */
  private path: FlatPoint[] = [];
  private fromY = 0;
  /** Ground under the entry point, in the vehicle's frame. */
  private groundY = 0;
  /** Entry point on the ground, then the standing points inside (vehicle frame). */
  private aisle: Point3[] = [];
  private aisleLength = 0;
  /** Heading at the start of the current phase and the one drawn last, in the vehicle's frame (0 = facing forwards). */
  private heading = 0;
  private lastHeading = 0;
  private lastPhase: BoardingPhase | null = null;
  private readonly local = new THREE.Vector3();
  private readonly turnY = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  /** Where the figure stands (its feet, or the seat point once seated), world space. */
  private readonly where: Point3 = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly avatar: HumanFigure,
    /** Height of the ground at a point, ignoring the vehicle (null if nothing is found). */
    private readonly groundAt: (x: number, z: number, vehicle: Vehicle) => number | null,
  ) {}

  /** A sequence is running and the player has no control (false again once a driver getting out is on their feet). */
  get busy(): boolean {
    return this.boarding !== null && !this.boarding.free;
  }

  /** The vehicle of a sequence still running (getting out, its door may still be closing). */
  get active(): Vehicle | null {
    return this.boarding ? this.vehicle : null;
  }

  get direction(): "in" | "out" | null {
    return this.boarding?.direction ?? null;
  }

  /** The figure's place while busy, for the camera and the game; null otherwise. */
  position(): Point3 | null {
    return this.busy ? this.where : null;
  }

  /** Where a driver getting out stands once free (feet on the ground, world space) and the way they face. */
  exitPlace(): { x: number; y: number; z: number; yaw: number } | null {
    const vehicle = this.vehicle;
    if (!vehicle) return null;
    const point = vehicle.type.entry.point;
    const at = this.toWorld(vehicle, point.x, this.groundY, point.z);
    return { x: at.x, y: at.y, z: at.z, yaw: vehicle.body.yaw() };
  }

  /** Start getting in: the player stands at `feet` (world space). */
  startIn(vehicle: Vehicle, feet: Point3, yaw: number): void {
    this.begin(vehicle);
    vehicle.object.updateMatrixWorld(true);
    const from = vehicle.object.worldToLocal(this.local.set(feet.x, feet.y, feet.z));
    this.fromY = from.y;
    const half = vehicle.type.physics.halfExtents;
    this.path = approachPath({ x: from.x, z: from.z }, vehicle.type.entry, half);
    this.heading = this.lastHeading = yaw - vehicle.body.yaw();
    this.where.x = feet.x;
    this.where.y = feet.y;
    this.where.z = feet.z;
    this.boarding = new Boarding("in", vehicle.type.entry, pathLength(this.path), this.aisleLength);
  }

  /** Start getting out of the vehicle the player is driving. */
  startOut(vehicle: Vehicle): void {
    this.begin(vehicle);
    this.heading = this.lastHeading = 0;
    const seat = vehicle.type.driver;
    Object.assign(this.where, this.toWorld(vehicle, seat.x, this.groundY, seat.z));
    this.boarding = new Boarding("out", vehicle.type.entry, 0, this.aisleLength);
  }

  private begin(vehicle: Vehicle): void {
    this.vehicle = vehicle;
    this.lastPhase = null;
    const { entry, rideHeight } = vehicle.type;
    vehicle.object.updateMatrixWorld(true);
    const outside = this.toWorld(vehicle, entry.point.x, -rideHeight, entry.point.z);
    const ground = this.groundAt(outside.x, outside.z, vehicle);
    this.groundY = ground === null ? -rideHeight : vehicle.object.worldToLocal(this.local.set(outside.x, ground, outside.z)).y;
    this.aisle = [{ x: entry.point.x, y: this.groundY, z: entry.point.z }, ...(entry.aisle ?? []).map((p) => ({ ...p }))];
    this.aisleLength = 0;
    for (let i = 1; i < this.aisle.length; i++) {
      const a = this.aisle[i - 1]!;
      const b = this.aisle[i]!;
      this.aisleLength += Math.hypot(b.x - a.x, b.z - a.z);
    }
  }

  /** Stop at once (teleport, new game, knocked out): the door shuts; the game puts the player somewhere. */
  cancel(): void {
    this.vehicle?.setDoor(0);
    this.boarding = null;
    this.vehicle = null;
  }

  /** One fixed step: advance the sequence and swing the door. */
  fixedUpdate(dt: number): BoardingEvent[] {
    const boarding = this.boarding;
    const vehicle = this.vehicle;
    if (!boarding || !vehicle) return [];
    const events = boarding.step(dt);
    vehicle.setDoor(boarding.door);
    if (boarding.done) this.boarding = null;
    return events;
  }

  /** Each drawn frame while busy: place and pose the figure. */
  frame(dt: number): void {
    const boarding = this.boarding;
    const vehicle = this.vehicle;
    if (!boarding || !vehicle || boarding.free) return;
    const { type } = vehicle;
    const pose = type.pose;
    const phase = boarding.phase;
    const avatar = this.avatar;
    // Each phase turns the figure from the heading the last one left it at.
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      this.heading = this.lastHeading;
    }
    let at: Point3;
    let heading = this.heading;

    if (phase === "approach") {
      // Walking to the door at the pace the sequence allows, facing the way of the walk.
      const step = alongPath(this.path, boarding.walk);
      at = { x: step.x, y: this.fromY + (this.groundY - this.fromY) * boarding.walk, z: step.z };
      heading = step.heading;
      const time = boarding.durationOf("approach");
      avatar.update(dt, time > 0 ? pathLength(this.path) / time : 0, true);
    } else if (phase === "climb" || phase === "out") {
      // Along the floor inside (the bus): walking, facing the way of the walk.
      const step = this.alongAisle(boarding.aisle);
      at = step.at;
      heading = phase === "out" ? step.heading + Math.PI : step.heading;
      const time = boarding.durationOf(phase);
      avatar.update(dt, time > 0 ? this.aisleLength / time : 0, true);
    } else if (phase === "sit" || phase === "stand" || (phase === "open" && boarding.direction === "in")) {
      // From the last standing point to the seat: the root moves the same eased share as the
      // figure's pose (`HumanFigure.sitting`), so the hips travel in a straight line.
      const amount = boarding.seated;
      const w = sitWeight(amount);
      const stand = this.aisle[this.aisle.length - 1]!;
      const seat = type.driver;
      const bump = type.entry.style === "swing" ? SWING_LIFT : type.entry.style === "door" ? -DUCK : 0;
      at = {
        x: stand.x + (seat.x - stand.x) * w,
        y: stand.y + (seat.y - stand.y) * w + bump * Math.sin(Math.PI * w),
        z: stand.z + (seat.z - stand.z) * w,
      };
      // Turn to face along the vehicle before sitting: while the door opens, or as the sitting starts.
      const share = phase === "open" ? boarding.phaseProgress : Math.min(1, amount * 2.5);
      heading = phase === "stand" ? 0 : turn(this.heading, 0, sitWeight(share));
      avatar.sitting(pose, amount, dt);
    } else {
      // Seated: the door closing behind (getting in) or opening (getting out).
      const seat = type.driver;
      at = { x: seat.x, y: seat.y, z: seat.z };
      heading = 0;
      avatar.sitting(pose, 1, dt);
    }
    this.lastHeading = heading;

    const world = this.toWorld(vehicle, at.x, at.y, at.z);
    avatar.object.position.set(world.x, world.y, world.z);
    // Upright while walking; with the vehicle (its lean or slope) once on the seat.
    const seated = boarding.seated;
    this.turnY.setFromAxisAngle(this.up, heading);
    if (seated > 0) avatar.object.quaternion.copy(vehicle.object.quaternion).multiply(this.turnY);
    else avatar.object.quaternion.setFromAxisAngle(this.up, vehicle.body.yaw() + heading);
    // The game's "where": the figure's feet while standing, the ground under them while sitting.
    this.where.x = world.x;
    this.where.z = world.z;
    this.where.y = seated > 0 ? this.toWorld(vehicle, at.x, this.groundY, at.z).y : world.y;
  }

  /** Point a share of the way along the inside walk (entry point to the last standing point). */
  private alongAisle(share: number): { at: Point3; heading: number } {
    const points = this.aisle;
    let left = Math.min(1, Math.max(0, share)) * this.aisleLength;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const leg = Math.hypot(b.x - a.x, b.z - a.z);
      if (left <= leg || i === points.length - 1) {
        const t = leg > 0 ? Math.min(1, left / leg) : 1;
        // Up the step at the start of the first leg (the bus's floor is about 0.35 m above its sill).
        const rise = i === 1 ? Math.min(1, t * 3) : t;
        return {
          at: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * rise, z: a.z + (b.z - a.z) * t },
          heading: Math.atan2(-(b.x - a.x), -(b.z - a.z)),
        };
      }
      left -= leg;
    }
    const last = points[points.length - 1]!;
    return { at: { ...last }, heading: 0 };
  }

  private toWorld(vehicle: Vehicle, x: number, y: number, z: number): Point3 {
    const p = vehicle.object.localToWorld(this.local.set(x, y, z));
    return { x: p.x, y: p.y, z: p.z };
  }

  snapshot(): BoardingSnapshot | null {
    const boarding = this.boarding;
    const vehicle = this.vehicle;
    if (!boarding || !vehicle) return null;
    return { direction: boarding.direction, phase: boarding.phase, vehicle: vehicle.id, door: vehicle.door, progress: boarding.progress, seated: boarding.seated };
  }
}
