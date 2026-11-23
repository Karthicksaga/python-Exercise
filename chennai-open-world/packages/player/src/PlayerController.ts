/**
 * Player movement rules: turns stick input into a walking, running, jumping character.
 * Knows nothing about rendering or touch; it reads a `PlayerInput` and drives a `CharacterBody`.
 */
import type { CharacterBody, Vec3 } from "@cow/physics";

export interface PlayerInput {
  /** Stick position: x right, y forward, each in [-1, 1]. */
  readonly moveX: number;
  readonly moveY: number;
  /** True on the step the jump button was pressed. */
  readonly jump: boolean;
  /** Camera heading; movement is relative to where the camera looks. */
  readonly cameraYaw: number;
}

export const PLAYER_HEIGHT = 1.75;
export const PLAYER_RADIUS = 0.32;

const WALK_SPEED = 2.4; // m/s
const RUN_SPEED = 6.2;
/** Pushing the stick past this fraction of its travel starts a run. */
const RUN_THRESHOLD = 0.82;
/** How quickly speed follows the stick (1/s): higher is snappier. */
const RESPONSE = 10;
const GRAVITY = 24;
const JUMP_SPEED = 7.2;
const TURN_RATE = 12; // rad/s towards the direction of travel

/**
 * Thrown off a vehicle (TD-29): how hard the body scrapes along the ground once down (m/s²),
 * the share of speed kept when it hits a wall in flight, the speed below which it has stopped
 * (m/s), and how long getting up takes (s; `HumanFigure`'s rise takes 0.7 s).
 */
const TUMBLE_FRICTION = 9;
const WALL_KEEP = 0.7;
const TUMBLE_STOP = 0.3;
export const GET_UP_TIME = 0.75;

/** Thrown off a vehicle: in the air, scraping along the ground, lying still, then getting up. */
export type Knockdown = "flying" | "sliding" | "lying" | "rising";

export class PlayerController {
  /** Heading the character faces, radians (0 = towards -Z / north). */
  yaw: number;
  /** Horizontal speed in m/s, for animation. */
  speed = 0;
  private velocity: Vec3 = { x: 0, y: 0, z: 0 };
  /** Multiplies the running speed (fitness from the gym makes it slightly above 1). */
  runScale = 1;
  /** A dodge in progress: its velocity on the ground and the seconds it has left. */
  private dashing: { vx: number; vz: number; left: number } | null = null;

  /** Thrown off a vehicle (`throwOff`): phase, velocity, seconds in the phase, and how long to lie still. */
  private thrown: { phase: Knockdown; v: Vec3; t: number; lie: number; landed: boolean } | null = null;

  /**
   * Thrown off a vehicle (TD-29): the body flies with `velocity` (m/s), under gravity, stopped by
   * walls and the ground like walking; then scrapes to a stop, lies still for `lieFor` seconds
   * and gets up. The stick does nothing until then. Facing stays at `yaw`.
   */
  throwOff(velocity: Vec3, lieFor: number, yaw: number): void {
    this.dashing = null;
    this.thrown = { phase: "flying", v: { ...velocity }, t: 0, lie: lieFor, landed: false };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = yaw;
    this.speed = 0;
  }

  /** Where a throw is (null when on foot and in control). */
  get knockdown(): Knockdown | null {
    return this.thrown?.phase ?? null;
  }

  /** True once per throw, on the step the body first hits the ground. */
  consumeLanding(): boolean {
    const t = this.thrown;
    if (!t || !t.landed) return false;
    t.landed = false;
    return true;
  }

  /** Dodge: carried `distance` metres along (dx, dz) over `seconds`, whatever the stick says. */
  dash(dx: number, dz: number, distance: number, seconds: number): void {
    const length = Math.hypot(dx, dz) || 1;
    this.dashing = { vx: (dx / length) * (distance / seconds), vz: (dz / length) * (distance / seconds), left: seconds };
  }

  /** True while a dodge is carrying the player. */
  get isDashing(): boolean {
    return this.dashing !== null;
  }

  /** Top running speed, m/s. */
  get runSpeed(): number {
    return RUN_SPEED * this.runScale;
  }

  constructor(
    readonly body: CharacterBody,
    yaw = 0,
  ) {
    this.yaw = yaw;
  }

  get grounded(): boolean {
    return this.body.grounded;
  }

  get position(): Vec3 {
    return this.body.feet();
  }

  /** Advance one fixed physics step. Call before `PhysicsWorld.step`. */
  update(input: PlayerInput, dt: number): void {
    if (this.thrown) {
      this.tumble(this.thrown, dt);
      return;
    }
    const magnitude = Math.min(1, Math.hypot(input.moveX, input.moveY));
    const running = magnitude > RUN_THRESHOLD;
    const targetSpeed = magnitude < 0.08 ? 0 : running ? this.runSpeed : WALK_SPEED * Math.min(1, magnitude / RUN_THRESHOLD);

    // Camera-relative direction on the ground plane.
    let dirX = 0;
    let dirZ = 0;
    if (targetSpeed > 0) {
      const sin = Math.sin(input.cameraYaw);
      const cos = Math.cos(input.cameraYaw);
      dirX = (input.moveX * cos - input.moveY * sin) / magnitude;
      dirZ = (-input.moveX * sin - input.moveY * cos) / magnitude;
    }

    // Ease the horizontal velocity towards the target; less control in the air. A dodge
    // carries the player at its own speed until it ends.
    if (this.dashing) {
      this.velocity.x = this.dashing.vx;
      this.velocity.z = this.dashing.vz;
      this.dashing.left -= dt;
      if (this.dashing.left <= 0) this.dashing = null;
    } else {
      const control = this.body.grounded ? 1 : 0.35;
      const blend = Math.min(1, RESPONSE * control * dt);
      this.velocity.x += (dirX * targetSpeed - this.velocity.x) * blend;
      this.velocity.z += (dirZ * targetSpeed - this.velocity.z) * blend;
    }

    if (this.body.grounded) {
      // A small downward speed keeps the capsule pressed to the ground on slopes and kerbs.
      this.velocity.y = input.jump ? JUMP_SPEED : -2;
    } else {
      this.velocity.y = Math.max(-40, this.velocity.y - GRAVITY * dt);
    }

    const moved = this.body.move({ x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt });
    // Hitting a ceiling or wall: don't keep pushing into it.
    if (this.velocity.y > 0 && moved.y < this.velocity.y * dt * 0.5) this.velocity.y = 0;
    this.speed = Math.hypot(moved.x, moved.z) / dt;

    if (targetSpeed > 0) {
      const wanted = Math.atan2(-dirX, -dirZ);
      let diff = wanted - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // shortest way round
      this.yaw += diff * Math.min(1, TURN_RATE * dt);
    }
  }

  /** One step of a throw (see `throwOff`). */
  private tumble(thrown: NonNullable<PlayerController["thrown"]>, dt: number): void {
    const v = thrown.v;
    thrown.t += dt;
    this.speed = 0;
    if (thrown.phase === "lying" || thrown.phase === "rising") {
      // Keep the body on the ground (a kerb's edge, a slope) while still.
      this.body.move({ x: 0, y: -2 * dt, z: 0 });
      if (thrown.phase === "lying" && thrown.t >= thrown.lie) Object.assign(thrown, { phase: "rising", t: 0 });
      else if (thrown.phase === "rising" && thrown.t >= GET_UP_TIME) this.thrown = null;
      return;
    }
    if (thrown.phase === "sliding") {
      // Scraping along the ground on its back, slowing hard.
      const flat = Math.hypot(v.x, v.z);
      const keep = flat > 0 ? Math.max(0, flat - TUMBLE_FRICTION * dt) / flat : 0;
      v.x *= keep;
      v.z *= keep;
      v.y = this.body.grounded ? -2 : Math.max(-40, v.y - GRAVITY * dt);
    } else {
      v.y = Math.max(-40, v.y - GRAVITY * dt);
    }
    const delta = { x: v.x * dt, y: v.y * dt, z: v.z * dt };
    const moved = this.body.move(delta);
    // A wall in the way: the move slid along it; keep only that, less what the hit cost.
    const wanted = Math.hypot(delta.x, delta.z);
    if (wanted > 1e-6 && Math.hypot(moved.x, moved.z) < wanted * 0.9) {
      v.x = (moved.x / dt) * WALL_KEEP;
      v.z = (moved.z / dt) * WALL_KEEP;
    }
    if (v.y > 0 && moved.y < delta.y * 0.5) v.y = 0;
    if (thrown.phase === "flying" && this.body.grounded && v.y <= 0) {
      thrown.phase = "sliding";
      thrown.t = 0;
      thrown.landed = true;
    } else if (thrown.phase === "sliding" && Math.hypot(v.x, v.z) < TUMBLE_STOP && this.body.grounded) {
      thrown.phase = "lying";
      thrown.t = 0;
    }
  }

  /** Put the player back at a known place (fell out of the world, or restart). */
  respawn(feet: Vec3, yaw: number): void {
    this.dashing = null;
    this.thrown = null;
    this.body.teleport(feet);
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = yaw;
    this.speed = 0;
  }
}
