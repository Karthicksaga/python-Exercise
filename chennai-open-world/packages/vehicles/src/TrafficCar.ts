/**
 * The visible body of an AI-driven vehicle. It has no suspension or engine of its own: the AI
 * says where it is, and this places the model and rolls the wheels.
 */
import type * as THREE from "three";
import { buildVehicleModel, type VehicleModel } from "./models";
import { SETTLED_SUSPENSION, VEHICLE_TYPES, type VehicleKind, type VehicleType } from "./specs";

export class TrafficCar {
  readonly type: VehicleType;
  private readonly model: VehicleModel;
  private roll = 0;
  private drawnHeading = 0;
  private drawnGeneration = -1;

  constructor(kind: VehicleKind, color: number) {
    this.type = VEHICLE_TYPES[kind];
    // Traffic is seen from a distance: the light model (LOD1).
    this.model = buildVehicleModel(kind, color, "far");
    this.type.physics.wheels.forEach((wheel, i) => this.model.wheels[i]?.position.set(wheel.x, wheel.y - SETTLED_SUSPENSION, wheel.z));
  }

  get object(): THREE.Group {
    return this.model.object;
  }

  private driverFigure: THREE.Object3D | null = null;

  /**
   * Seat a driver where this kind's driver sits: a person baked in this kind's riding pose
   * (`HumanAssets.seatedStatic(tint, type.pose)`), root at the hip joints.
   */
  setDriver(figure: THREE.Object3D): void {
    const seat = this.type.driver;
    if (this.driverFigure) this.model.object.remove(this.driverFigure);
    figure.position.set(seat.x, seat.y, seat.z);
    this.model.object.add(figure);
    this.driverFigure = figure;
  }

  /** Show or hide the driver (drawn only near the player: a person is several draw calls). */
  set driverVisible(visible: boolean) {
    if (this.driverFigure) this.driverFigure.visible = visible;
  }

  /**
   * @param generation changes when the AI moved the vehicle to a new place: snap, don't glide
   */
  sync(dt: number, x: number, z: number, heading: number, speed: number, generation: number): void {
    if (generation !== this.drawnGeneration) {
      this.drawnGeneration = generation;
      this.drawnHeading = heading;
    }
    // Front wheels point where the vehicle is turning.
    const turning = Math.atan2(Math.sin(heading - this.drawnHeading), Math.cos(heading - this.drawnHeading));
    this.drawnHeading = heading;
    const steer = Math.max(-0.5, Math.min(0.5, (turning / Math.max(dt, 1e-3)) * 0.35));

    this.object.position.set(x, this.type.rideHeight, z);
    this.object.rotation.set(0, heading, 0);
    this.roll += (speed / (this.type.physics.wheels[0]?.radius ?? 0.3)) * dt;
    this.type.physics.wheels.forEach((wheel, i) => {
      const pivot = this.model.wheels[i];
      if (!pivot) return;
      pivot.rotation.y = wheel.steers ? steer : 0;
      const spinner = pivot.getObjectByName("spin");
      if (spinner) spinner.rotation.x = -this.roll;
    });
  }
}
