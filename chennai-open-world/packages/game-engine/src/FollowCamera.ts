/**
 * Third-person orbit camera. The player drags to rotate it; it stays behind the target at a
 * fixed distance and moves closer when a wall would otherwise block the view.
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

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    yaw = 0,
  ) {
    this.yaw = yaw;
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

  update(dt: number, feet: { x: number; y: number; z: number }, physics: PhysicsWorld, ignore: CharacterBody | VehicleBody): void {
    this.sinceLook += dt;
    // Follow the target smoothly; snap on the first frame and after a respawn.
    const targetY = feet.y + LOOK_HEIGHT;
    const far = Math.hypot(feet.x - this.focus.x, feet.z - this.focus.z) > 8;
    const follow = !this.primed || far ? 1 : Math.min(1, dt * 14);
    this.focus.x += (feet.x - this.focus.x) * follow;
    this.focus.y += (targetY - this.focus.y) * follow;
    this.focus.z += (feet.z - this.focus.z) * follow;
    this.primed = true;

    // Unit vector from the focus point to the camera.
    const cosPitch = Math.cos(this.pitch);
    const dir = { x: Math.sin(this.yaw) * cosPitch, y: Math.sin(this.pitch), z: Math.cos(this.yaw) * cosPitch };

    // Pull in at once when blocked, ease back out when the view clears.
    const hit = physics.raycast(this.focus, dir, this.reach + 0.3, ignore);
    const allowed = hit === null ? this.reach : Math.max(MIN_DISTANCE, hit - 0.3);
    this.distance = allowed < this.distance ? allowed : this.distance + (allowed - this.distance) * Math.min(1, dt * 5);

    this.camera.position.set(
      this.focus.x + dir.x * this.distance,
      Math.max(0.25, this.focus.y + dir.y * this.distance),
      this.focus.z + dir.z * this.distance,
    );
    this.camera.lookAt(this.focus.x, this.focus.y, this.focus.z);
  }
}
