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

export class PlayerController {
  /** Heading the character faces, radians (0 = towards -Z / north). */
  yaw: number;
  /** Horizontal speed in m/s, for animation. */
  speed = 0;
  private velocity: Vec3 = { x: 0, y: 0, z: 0 };
  /** Multiplies the running speed (fitness from the gym makes it slightly above 1). */
  runScale = 1;

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

    // Ease the horizontal velocity towards the target; less control in the air.
    const control = this.body.grounded ? 1 : 0.35;
    const blend = Math.min(1, RESPONSE * control * dt);
    this.velocity.x += (dirX * targetSpeed - this.velocity.x) * blend;
    this.velocity.z += (dirZ * targetSpeed - this.velocity.z) * blend;

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

  /** Put the player back at a known place (fell out of the world, or restart). */
  respawn(feet: Vec3, yaw: number): void {
    this.body.teleport(feet);
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = yaw;
    this.speed = 0;
  }
}
