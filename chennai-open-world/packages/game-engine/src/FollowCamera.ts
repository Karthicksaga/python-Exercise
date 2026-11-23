/**
 * Third-person orbit camera. The player drags to rotate it; it stays behind the target at a
 * fixed distance and moves closer when a wall would otherwise block the view.
 *
 * While driving, `chase` turns it into a chase camera: it swings round behind the direction
 * of travel, aims ahead of the vehicle (further the faster it goes), pulls back and widens a
 * little at speed, and smooths bumps and crashes. On foot it behaves as before.
 */
import type * as THREE from "three";
import type { CharacterBody, PhysicsWorld, VehicleBody } from "@cow/physics";

const SENSITIVITY = 0.0055; // radians per CSS pixel dragged
const MIN_PITCH = -0.2;
const MAX_PITCH = 1.15;
/** Default distance behind a person on foot. */
const DISTANCE = 5.6;
const MIN_DISTANCE = 0.9;
/** Height above the feet that the camera looks at (roughly the shoulders). */
const LOOK_HEIGHT = 1.5;
/** Chase camera: how far ahead it aims, in seconds of travel, and at most in metres. */
const LEAD_TIME = 0.3;
const MAX_LEAD = 7;
/** How quickly the aim point follows changes of speed and direction, per second. */
const LEAD_RATE = 2.5;
/** Extra distance (metres) and field of view (degrees) at top speed. */
const SPEED_REACH = 1.4;
const SPEED_FOV = 7;
/** Faster than this (m/s, forwards) the camera trails the direction of travel, not the nose. */
const TRAVEL_TRAIL_FROM = 3;
/** A shake (a blow landing) lasts this long, seconds, and turns the view at most this far at strength 1, radians. */
const SHAKE_TIME = 0.25;
const SHAKE_ANGLE = 0.014;

/** What the chase camera needs to know about the vehicle, once per frame. */
export interface ChaseTarget {
  /** Ground velocity, m/s. */
  readonly velocity: { readonly x: number; readonly z: number };
  /** Where the vehicle points (yaw, 0 = north). */
  readonly heading: number;
  /** Speed along the heading, m/s; negative when reversing. */
  readonly forwardSpeed: number;
  readonly topSpeed: number;
}

export class FollowCamera {
  /** Heading: 0 looks towards -Z (north). */
  yaw: number;
  pitch = 0.32;
  /** How far behind the target the camera wants to be (further for vehicles). */
  reach = DISTANCE;
  private distance = DISTANCE;
  private sinceLook = 10;
  private readonly focus = { x: 0, y: 0, z: 0 };
  private primed = false;
  /** Chase camera state: set by `chase` for the coming `update`. */
  private chasing: ChaseTarget | null = null;
  /** Aim point offset ahead of the vehicle (eased), metres. */
  private readonly lead = { x: 0, z: 0 };
  /** Share of top speed, eased, for the extra distance and field of view. */
  private pace = 0;
  private readonly baseFov: number;
  /** A short shake: its strength and seconds left, and a clock for its wobble. */
  private shaking = 0;
  private shakeLeft = 0;
  private shakeClock = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    yaw = 0,
  ) {
    this.yaw = yaw;
    this.baseFov = camera.fov;
  }

  /**
   * Shake the view for a moment: a blow landing (the player's or on the player). Strength 1 is a
   * punch; a light wobble of the view direction, fading out, that never moves the camera itself.
   */
  shake(strength: number): void {
    this.shaking = Math.max(strength, this.shakeLeft > 0 ? this.shaking : 0);
    this.shakeLeft = SHAKE_TIME;
  }

  /** How far the current shake turns the view now, radians (0 when still). */
  get shakeAngle(): number {
    const fade = this.shakeLeft / SHAKE_TIME;
    return this.shakeLeft > 0 ? SHAKE_ANGLE * this.shaking * fade * fade : 0;
  }

  /** Apply a drag of (dx, dy) CSS pixels. */
  look(dx: number, dy: number): void {
    if (dx !== 0 || dy !== 0) this.sinceLook = 0;
    this.yaw -= dx * SENSITIVITY;
    this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch + dy * SENSITIVITY));
  }

  /**
   * Swing round behind a moving vehicle. Does nothing for a moment after the player has
   * dragged the view, so looking around while driving is still possible.
   */
  trail(heading: number, dt: number): void {
    if (this.sinceLook < 1.5) return;
    const diff = Math.atan2(Math.sin(heading - this.yaw), Math.cos(heading - this.yaw));
    this.yaw += diff * Math.min(1, dt * 2.6);
  }

  /**
   * Chase a vehicle this frame: trail behind where it is going and aim ahead of it. Call each
   * frame while driving, before `update`. Does not trail for a moment after the player has
   * dragged the view, so looking around while driving is still possible.
   */
  chase(target: ChaseTarget, dt: number): void {
    this.chasing = target;
    const { velocity, forwardSpeed } = target;
    if (Math.abs(forwardSpeed) <= 1.5) return;
    // Forwards at speed, follow the direction of travel so a drift shows the car sliding
    // sideways; reversing or crawling, stay behind the nose.
    const travel = forwardSpeed > TRAVEL_TRAIL_FROM ? Math.atan2(-velocity.x, -velocity.z) : target.heading;
    this.trail(travel, dt);
  }

  update(dt: number, feet: { x: number; y: number; z: number }, physics: PhysicsWorld, ignore: CharacterBody | VehicleBody): void {
    this.sinceLook += dt;
    const chase = this.chasing;
    this.chasing = null;
    // Follow the target smoothly; snap on the first frame and after a respawn. A vehicle's
    // height is followed more softly, so suspension bumps don't shake the view.
    const targetY = feet.y + LOOK_HEIGHT;
    const far = Math.hypot(feet.x - this.focus.x, feet.z - this.focus.z) > 8;
    const snap = !this.primed || far;
    const follow = snap ? 1 : Math.min(1, dt * 14);
    const followY = snap ? 1 : chase ? Math.min(1, dt * 5) : follow;
    this.focus.x += (feet.x - this.focus.x) * follow;
    this.focus.y += (targetY - this.focus.y) * followY;
    this.focus.z += (feet.z - this.focus.z) * follow;
    this.primed = true;

    // Aim ahead of a vehicle in the direction of travel. Eased, so a crash or a sudden stop
    // glides the view back instead of jerking it; faded out while the player looks around.
    let leadX = 0;
    let leadZ = 0;
    let pace = 0;
    if (chase && this.sinceLook >= 1.5) {
      const { x, z } = chase.velocity;
      const length = Math.hypot(x, z) * LEAD_TIME;
      const scale = length > MAX_LEAD ? MAX_LEAD / length : 1;
      leadX = x * LEAD_TIME * scale;
      leadZ = z * LEAD_TIME * scale;
    }
    if (chase) pace = Math.min(1, Math.hypot(chase.velocity.x, chase.velocity.z) / Math.max(1, chase.topSpeed));
    const ease = snap ? 1 : Math.min(1, dt * LEAD_RATE);
    this.lead.x += (leadX - this.lead.x) * ease;
    this.lead.z += (leadZ - this.lead.z) * ease;
    this.pace += (pace - this.pace) * ease;
    const fov = this.baseFov + SPEED_FOV * this.pace * this.pace;
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const reach = this.reach + (chase ? SPEED_REACH * this.pace : 0);

    // Unit vector from the focus point to the camera.
    const cosPitch = Math.cos(this.pitch);
    const dir = { x: Math.sin(this.yaw) * cosPitch, y: Math.sin(this.pitch), z: Math.cos(this.yaw) * cosPitch };

    // Pull in at once when blocked, ease back out when the view clears.
    const hit = physics.raycast(this.focus, dir, reach + 0.3, ignore);
    const allowed = hit === null ? reach : Math.max(MIN_DISTANCE, hit - 0.3);
    this.distance = allowed < this.distance ? allowed : this.distance + (allowed - this.distance) * Math.min(1, dt * 5);

    this.camera.position.set(
      this.focus.x + dir.x * this.distance,
      Math.max(0.25, this.focus.y + dir.y * this.distance),
      this.focus.z + dir.z * this.distance,
    );
    this.camera.lookAt(this.focus.x + this.lead.x, this.focus.y, this.focus.z + this.lead.z);
    if (this.shakeLeft > 0) {
      const angle = this.shakeAngle;
      this.shakeClock += dt;
      this.shakeLeft = Math.max(0, this.shakeLeft - dt);
      this.camera.rotateX(Math.sin(this.shakeClock * 71) * angle);
      this.camera.rotateY(Math.sin(this.shakeClock * 53 + 1.3) * angle);
    }
  }
}
