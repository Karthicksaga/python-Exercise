/** One drivable vehicle: its physics body, its model, and keeping the two in step. */
import * as THREE from "three";
import type { PhysicsWorld, VehicleBody, VehicleControls } from "@cow/physics";
import { buildVehicleModel, type VehicleModel } from "./models";
import { VEHICLE_TYPES, type VehicleKind, type VehicleType } from "./specs";

const IDLE: VehicleControls = { throttle: 0, steer: 0, brake: 0.4 };

export class Vehicle {
  readonly type: VehicleType;
  readonly body: VehicleBody;
  private readonly model: VehicleModel;
  private roll = 0;
  private lean = 0;
  private readonly seatPoint = new THREE.Vector3();

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
   * Where a visible rider's feet-origin goes, and the way they face, in world space.
   * Null for closed vehicles.
   */
  riderPose(): { x: number; y: number; z: number; quaternion: THREE.Quaternion } | null {
    const seat = this.type.seat;
    if (!seat) return null;
    const at = this.object.localToWorld(this.seatPoint.set(0, seat.y, seat.z));
    return { x: at.x, y: at.y, z: at.z, quaternion: this.object.quaternion };
  }

  /** Advance one fixed step. Pass null when nobody is driving (handbrake on). */
  update(controls: VehicleControls | null, dt: number): void {
    this.body.drive(controls ?? IDLE, dt);
  }

  /** Copy the physics state onto the model. Call once per rendered frame. */
  sync(dt: number): void {
    const p = this.body.position();
    const r = this.body.rotation();
    this.object.position.set(p.x, p.y, p.z);
    this.object.quaternion.set(r.x, r.y, r.z, r.w);
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
