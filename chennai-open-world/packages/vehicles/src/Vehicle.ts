/** One drivable vehicle: its physics body, its model, and keeping the two in step. */
import * as THREE from "three";
import type { PhysicsWorld, VehicleBody, VehicleControls } from "@cow/physics";
import { buildVehicleModel, type VehicleModel } from "./models";
import { VEHICLE_TYPES, type VehicleKind, type VehicleType } from "./specs";

/** A move longer than this in one fixed step is a teleport: drawn at once (metres). */
const JUMP = 8;

const IDLE: VehicleControls = { throttle: 0, steer: 0, brake: 0.4 };
/**
 * A change of velocity bigger than this in one physics step (m/s) is a crash, not driving:
 * the tyres' grip limit keeps engine, brakes and cornering under about 0.4 m/s per step, even
 * in a drift or braking hard while sliding (checked in VehicleBody.test.ts).
 */
const IMPACT = 1.6;
/** Share of speed kept after a crash. */
const CRASH_KEEP = 0.65;

export class Vehicle {
  readonly type: VehicleType;
  readonly body: VehicleBody;
  private readonly model: VehicleModel;
  private roll = 0;
  private lean = 0;
  private readonly seatPoint = new THREE.Vector3();
  /** Pose at the start of the last fixed step: `sync` draws part-way from it to the body's pose now. */
  private readonly before = { position: new THREE.Vector3(), rotation: new THREE.Quaternion(), set: false };
  private readonly now = { position: new THREE.Vector3(), rotation: new THREE.Quaternion() };
  private last: { x: number; z: number; vx: number; vz: number } | null = null;
  private impact = 0;
  /** Velocity before anything was hit in the last step (see `approachVelocity`). */
  private approach = { x: 0, z: 0 };
  private sirenOn = false;
  private sirenClock = 0;
  private doorAmount = 0;

  constructor(
    readonly id: string,
    kind: VehicleKind,
    physics: PhysicsWorld,
    position: { x: number; z: number },
    yaw: number,
    color = 0xc0392b,
  ) {
    this.type = VEHICLE_TYPES[kind];
    this.body = physics.createVehicle(this.type.physics, { x: position.x, y: this.type.rideHeight + 0.1, z: position.z }, yaw);
    this.model = buildVehicleModel(kind, color);
  }

  get object(): THREE.Group {
    return this.model.object;
  }

  get kind(): VehicleKind {
    return this.type.kind;
  }

  /** Speed shown to the player, km/h. */
  get speedKmh(): number {
    return Math.abs(this.body.forwardSpeed()) * 3.6;
  }

  /**
   * Where the driver's hip joints go (a seated figure's root, `VehicleType.driver`) and the way
   * they face, in world space. Follows the two-wheeler's lean.
   */
  riderPose(): { x: number; y: number; z: number; quaternion: THREE.Quaternion } {
    const seat = this.type.driver;
    const at = this.object.localToWorld(this.seatPoint.set(seat.x, seat.y, seat.z));
    return { x: at.x, y: at.y, z: at.z, quaternion: this.object.quaternion };
  }

  /** How far the driver's door is open, 0 shut to 1 fully open (always 0 without a door). */
  get door(): number {
    return this.doorAmount;
  }

  /** Swing the driver's door (`Boarding` decides how far). Ignored on vehicles without one. */
  setDoor(amount: number): void {
    if (!this.model.door) return;
    this.doorAmount = Math.min(1, Math.max(0, amount));
    this.model.door(this.doorAmount);
  }

  get siren(): boolean {
    return this.sirenOn;
  }

  /** Switch the siren and lights. Ignored on vehicles without them. */
  setSiren(on: boolean): void {
    this.sirenOn = on && this.type.siren === true;
    if (!this.sirenOn) for (const material of this.model.beacons ?? []) material.emissiveIntensity = 0.2;
  }

  /**
   * Velocity over the ground as it was before the last step's collision, if there was one
   * (otherwise the current velocity). A person's body can stop the vehicle in the physics step
   * before the game sees the hit; the hit's speed is the speed the vehicle came in at.
   */
  approachVelocity(): { x: number; z: number } {
    return this.approach;
  }

  /** Strength of a crash in the last step (change of speed, m/s), then 0 until the next one. */
  consumeImpact(): number {
    const impact = this.impact;
    this.impact = 0;
    return impact;
  }

  /**
   * Lose some speed without it counting as a crash (hitting a person): scales the velocity and
   * the crash detector's memory of it alike. @param keep share of speed kept, 0 to 1
   */
  knock(keep: number): void {
    this.body.damp(keep);
    if (this.last) this.last = { ...this.last, vx: this.last.vx * keep, vz: this.last.vz * keep };
    this.approach = { x: this.approach.x * keep, z: this.approach.z * keep };
  }

  /**
   * Points along the vehicle's length with a radius, so AI traffic sees a long bus as a row
   * of circles instead of one huge one.
   */
  footprint(): Array<{ x: number; z: number; radius: number }> {
    const { x: hx, z: hz } = this.type.physics.halfExtents;
    const p = this.body.position();
    const yaw = this.body.yaw();
    const radius = hx + 0.3;
    const count = Math.max(1, Math.round(hz / radius));
    const out: Array<{ x: number; z: number; radius: number }> = [];
    for (let i = 0; i < count; i++) {
      const along = count === 1 ? 0 : -hz + radius + ((2 * (hz - radius)) / (count - 1)) * i;
      out.push({ x: p.x - Math.sin(yaw) * along, z: p.z - Math.cos(yaw) * along, radius });
    }
    return out;
  }

  /** Advance one fixed step. Pass null when nobody is driving (handbrake on). */
  update(controls: VehicleControls | null, dt: number): void {
    // Compare with the previous step: a sudden change of velocity means the vehicle hit something.
    const p = this.body.position();
    const v = this.body.planarVelocity();
    const last = this.last;
    if (last && Math.hypot(p.x - last.x, p.z - last.z) < 3) {
      const change = Math.hypot(v.x - last.vx, v.z - last.vz);
      if (change > IMPACT) {
        this.impact = Math.max(this.impact, change);
        this.body.damp(CRASH_KEEP);
      }
    }
    this.approach = last && Math.hypot(v.x - last.vx, v.z - last.vz) > IMPACT ? { x: last.vx, z: last.vz } : { x: v.x, z: v.z };
    const after = this.body.planarVelocity();
    this.last = { x: p.x, z: p.z, vx: after.x, vz: after.z };
    // Where it is before this step's physics: the start of the step that frames are drawn across.
    const start = this.body.position();
    const turn = this.body.rotation();
    this.before.position.set(start.x, start.y, start.z);
    this.before.rotation.set(turn.x, turn.y, turn.z, turn.w);
    this.before.set = true;
    this.body.drive(controls ?? IDLE, dt);
  }

  /**
   * Copy the physics state onto the model. Call once per rendered frame. `alpha` (0 to 1): how far
   * the clock is past the last fixed step; the model is drawn that far between the pose before
   * that step and the pose after it, so it moves evenly whatever the display rate.
   */
  sync(dt: number, alpha = 1): void {
    if (this.sirenOn) {
      // Red and blue take turns, about three flashes a second.
      this.sirenClock += dt;
      const phase = Math.floor(this.sirenClock * 6) % 2;
      this.model.beacons?.forEach((material, i) => (material.emissiveIntensity = i % 2 === phase ? 3 : 0.1));
    }
    const p = this.body.position();
    const r = this.body.rotation();
    this.now.position.set(p.x, p.y, p.z);
    this.now.rotation.set(r.x, r.y, r.z, r.w);
    // A teleport (a long jump in one step) is drawn at once, not slid across the map.
    if (this.before.set && this.before.position.distanceTo(this.now.position) < JUMP) {
      this.object.position.lerpVectors(this.before.position, this.now.position, Math.max(0, Math.min(1, alpha)));
      this.object.quaternion.slerpQuaternions(this.before.rotation, this.now.rotation, Math.max(0, Math.min(1, alpha)));
    } else {
      this.object.position.copy(this.now.position);
      this.object.quaternion.copy(this.now.rotation);
    }
    if (this.type.leans) {
      // Two-wheelers bank into corners: more with speed and steering. Looks only; the physics
      // body stays upright.
      const wanted = Math.max(-0.5, Math.min(0.5, this.body.steering() * Math.abs(this.body.forwardSpeed()) * 0.16));
      this.lean += (wanted - this.lean) * Math.min(1, dt * 6);
      this.object.rotateZ(this.lean);
    }

    const spec = this.type.physics;
    this.roll += (this.body.forwardSpeed() / (spec.wheels[0]?.radius ?? 0.3)) * dt;
    spec.wheels.forEach((wheel, i) => {
      const pivot = this.model.wheels[i];
      if (!pivot) return;
      pivot.position.set(wheel.x, wheel.y - this.body.suspensionLength(i), wheel.z);
      pivot.rotation.y = wheel.steers ? this.body.steering() : 0;
      const spinner = pivot.getObjectByName("spin");
      if (spinner) spinner.rotation.x = -this.roll;
    });
  }
}
