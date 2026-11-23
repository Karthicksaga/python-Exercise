/**
 * Crashing (TD-29): what a hard impact does to the driver, on screen. The rules (thresholds,
 * damage, the throw's velocity) are `judgeCrash` in `@cow/vehicles`; the flight, the scrape
 * along the ground and getting up are `PlayerController.throwOff`; the fall is the figure's own
 * (`HumanFigure.setDown`). This module puts the body where it leaves the seat, keeps it clear of
 * walls, knocks the motorbike over, and tells the game when the body lands (the damage) and
 * when the player is back on their feet.
 */
import type { PhysicsWorld } from "@cow/physics";
import type { HumanFigure, Knockdown, PlayerController } from "@cow/player";
import { judgeCrash, type CrashOutcome, type Vehicle } from "@cow/vehicles";

export type CrashEvent = { readonly type: "landed"; readonly damage: number } | { readonly type: "up" };

export interface CrashSnapshot {
  /** Where a throw is, or null on foot (or driving). */
  readonly knockdown: Knockdown | null;
  /** The last crash judged above a bump, for tests. */
  readonly last: { readonly type: "shaken" | "thrown"; readonly impactKmh: number; readonly damage: number; readonly vehicle: string } | null;
}

/** The capsule's radius plus a margin: how far the body's start is kept from any wall (metres). */
const CLEARANCE = 0.42;
/** Feet this high above the road as the body leaves the seat (about the footpegs, metres). */
const START_LIFT = 0.35;
/** Length of a body lying on its back, from its feet (metres). */
const BODY_LENGTH = 1.9;
/** The steering beyond this sends the body to that side; otherwise to the left (the kerb side). */
const STEER_SIDE = 0.2;

export class Crashes {
  private pending = 0;
  private from: Vehicle | null = null;
  private last: CrashSnapshot["last"] = null;
  private wasDown = false;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly player: PlayerController,
    private readonly avatar: HumanFigure,
  ) {}

  /** A throw is under way: the player has no control. */
  get busy(): boolean {
    return this.player.knockdown !== null;
  }

  /** What a crash of the driven vehicle does (`impact`: `Vehicle.consumeImpact`, m/s; `steer`: the stick, -1 left to 1 right). */
  judge(vehicle: Vehicle, impact: number, steer: number): CrashOutcome {
    const side = steer > STEER_SIDE ? 1 : -1;
    const outcome = judgeCrash({ kind: vehicle.kind, impact, approach: vehicle.approachVelocity(), side });
    if (outcome.type !== "none") this.last = { type: outcome.type, impactKmh: outcome.impactKmh, damage: outcome.damage, vehicle: vehicle.id };
    return outcome;
  }

  /**
   * Throw the driver off or out. Call once the game has put the player on foot (the capsule
   * enabled, the figure standing). The damage comes with the landing (`fixedUpdate`).
   */
  throwFrom(vehicle: Vehicle, outcome: Extract<CrashOutcome, { type: "thrown" }>): void {
    const p = vehicle.body.position();
    const yaw = vehicle.body.yaw();
    const seat = vehicle.type.driver;
    // The seat, in world space (+X right, -Z forwards in the vehicle's frame).
    const start = {
      x: p.x + seat.x * Math.cos(yaw) + seat.z * Math.sin(yaw),
      y: p.y - vehicle.type.rideHeight + START_LIFT,
      z: p.z - seat.x * Math.sin(yaw) + seat.z * Math.cos(yaw),
    };
    this.keepClear(start);
    const heading = Math.atan2(-outcome.launch.x, -outcome.launch.z);
    this.player.respawn(start, heading);
    this.player.body.passThrough(vehicle.body);
    this.player.throwOff(outcome.launch, outcome.lieFor, heading);
    // Facing the way it flies and falling onto its back: head first, a dive.
    this.avatar.setDown(true);
    if (outcome.topples) {
      // The body goes one way, the bike falls the other.
      const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
      const toward = outcome.launch.x * right.x + outcome.launch.z * right.z;
      vehicle.topple(toward > 0 ? -1 : 1);
    }
    this.pending = outcome.damage;
    this.from = vehicle;
    this.wasDown = true;
  }

  /** Each fixed step, after the player's update: the landing (with its damage) and getting up. */
  fixedUpdate(): CrashEvent[] {
    const events: CrashEvent[] = [];
    if (this.player.consumeLanding()) {
      this.lieClear();
      events.push({ type: "landed", damage: this.pending });
      this.pending = 0;
    }
    const down = this.player.knockdown !== null;
    if (this.wasDown && !down) {
      this.player.body.passThrough(null);
      this.from = null;
      events.push({ type: "up" });
    }
    this.wasDown = down;
    return events;
  }

  /** Each drawn frame while on foot: the figure falls when thrown and gets up when the throw says. */
  frame(): void {
    const phase = this.player.knockdown;
    this.avatar.setDown(phase === "flying" || phase === "sliding" || phase === "lying");
  }

  /** End a throw at once (teleport, knocked out): the figure standing, the capsule solid. True if one was under way. */
  cancel(): boolean {
    if (!this.wasDown && !this.from) return false;
    this.player.body.passThrough(null);
    this.avatar.setDown(false, true);
    this.pending = 0;
    this.from = null;
    this.wasDown = false;
    return true;
  }

  snapshot(): CrashSnapshot {
    return { knockdown: this.player.knockdown, last: this.last };
  }

  /** Move a point away from walls it is closer to than the capsule's radius (rays at waist height). */
  private keepClear(at: { x: number; y: number; z: number }): void {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const dir = { x: Math.sin(a), y: 0, z: Math.cos(a) };
        const hit = this.physics.raycastSolid({ x: at.x, y: at.y + 0.6, z: at.z }, dir, CLEARANCE);
        if (hit === null || hit === 0) continue;
        const push = CLEARANCE - hit;
        at.x -= dir.x * push;
        at.z -= dir.z * push;
      }
    }
  }

  /**
   * The body lies on its back from its feet towards where it came from. If a wall is that way,
   * turn it to lie where there is room, so it never lies through a wall.
   */
  private lieClear(): void {
    const feet = this.player.position;
    const facing = this.player.yaw;
    for (const turn of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const yaw = facing + turn;
      // Behind a figure facing `yaw` is +(sin, cos).
      const dir = { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
      if (this.physics.raycastSolid({ x: feet.x, y: feet.y + 0.3, z: feet.z }, dir, BODY_LENGTH) === null) {
        this.player.yaw = yaw;
        return;
      }
    }
  }
}
