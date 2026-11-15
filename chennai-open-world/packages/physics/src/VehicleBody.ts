/**
 * A drivable vehicle: a rigid chassis on ray-cast wheels (suspension and tyre grip are
 * simulated per wheel, the wheels themselves are not rigid bodies).
 *
 * Local axes: forward is -Z, right is +X, up is +Y. The chassis cannot roll or pitch, which
 * keeps handling predictable on a touchscreen and makes it impossible to flip over.
 */
import RAPIER from "@dimforge/rapier3d-compat";
import type { Vec3 } from "./PhysicsWorld";

export interface WheelSpec {
  /** Position of the suspension mount relative to the chassis centre. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly steers: boolean;
  readonly driven: boolean;
}

export interface VehicleSpec {
  /** Half-sizes of the chassis collision box. */
  readonly halfExtents: Vec3;
  readonly mass: number;
  readonly wheels: readonly WheelSpec[];
  /** Total driving force at full throttle, newtons. */
  readonly engineForce: number;
  /** Top speed forwards, m/s. Reverse is limited to a third of it. */
  readonly maxSpeed: number;
  /** Largest steering angle at standstill, radians. It narrows with speed. */
  readonly maxSteer: number;
  readonly brakeForce: number;
}

export interface VehicleControls {
  /** -1 (full reverse) to 1 (full throttle). */
  readonly throttle: number;
  /** -1 (left) to 1 (right). */
  readonly steer: number;
  /** 0 to 1. */
  readonly brake: number;
}

const SUSPENSION_REST = 0.32;
const DOWN = { x: 0, y: -1, z: 0 };
const AXLE = { x: -1, y: 0, z: 0 };

export class VehicleBody {
  private steerAngle = 0;

  /** @internal Created by `PhysicsWorld.createVehicle`. */
  constructor(
    /** @internal The chassis body; other packages must not use it. */
    readonly body: RAPIER.RigidBody,
    private readonly controller: RAPIER.DynamicRayCastVehicleController,
    readonly spec: VehicleSpec,
  ) {
    spec.wheels.forEach((wheel, i) => {
      controller.addWheel({ x: wheel.x, y: wheel.y, z: wheel.z }, DOWN, AXLE, SUSPENSION_REST, wheel.radius);
      controller.setWheelSuspensionStiffness(i, 28);
      controller.setWheelSuspensionCompression(i, 2.4);
      controller.setWheelSuspensionRelaxation(i, 2.9);
      controller.setWheelMaxSuspensionTravel(i, 0.25);
      controller.setWheelMaxSuspensionForce(i, spec.mass * 40);
      controller.setWheelFrictionSlip(i, 2.2);
      controller.setWheelSideFrictionStiffness(i, 1);
    });
  }

  position(): Vec3 {
    const t = this.body.translation();
    return { x: t.x, y: t.y, z: t.z };
  }

  rotation(): { x: number; y: number; z: number; w: number } {
    const r = this.body.rotation();
    return { x: r.x, y: r.y, z: r.z, w: r.w };
  }

  /** Heading in radians, 0 = facing -Z (north), positive turning left. */
  yaw(): number {
    const r = this.body.rotation();
    // Forward (-Z) rotated by the chassis orientation, projected on the ground.
    const fx = -2 * (r.x * r.z + r.w * r.y);
    const fz = -(1 - 2 * (r.x * r.x + r.y * r.y));
    return Math.atan2(-fx, -fz);
  }

  /** Speed along the vehicle's own forward direction, m/s (negative when reversing). */
  forwardSpeed(): number {
    const v = this.body.linvel();
    const yaw = this.yaw();
    return v.x * -Math.sin(yaw) + v.z * -Math.cos(yaw);
  }

  /** Current steering angle of the front wheels, radians (positive = left). */
  steering(): number {
    return this.steerAngle;
  }

  /** How far each wheel's suspension is extended, for drawing the wheels. */
  suspensionLength(wheel: number): number {
    return this.controller.wheelSuspensionLength(wheel) ?? SUSPENSION_REST;
  }

  /** Apply the driver's input, then advance the wheels. Call before `PhysicsWorld.step`. */
  drive(controls: VehicleControls, dt: number): void {
    const { spec, controller } = this;
    const speed = this.forwardSpeed();
    const drivenCount = Math.max(1, spec.wheels.filter((w) => w.driven).length);

    // Engine: full force at standstill, fading to nothing at top speed.
    let force = 0;
    if (controls.throttle > 0 && speed < spec.maxSpeed) {
      force = spec.engineForce * controls.throttle * Math.min(1, (spec.maxSpeed - speed) / 4);
    } else if (controls.throttle < 0 && speed > -spec.maxSpeed / 3) {
      force = spec.engineForce * 0.6 * controls.throttle;
    }
    // Lifting off slows the vehicle gently, like engine braking.
    const coasting = controls.throttle === 0 && controls.brake === 0;
    const brake = controls.brake * spec.brakeForce + (coasting ? spec.brakeForce * 0.06 : 0);

    // Fast vehicles get a smaller steering lock, and the wheels turn at a finite rate.
    const lock = spec.maxSteer / (1 + Math.abs(speed) * 0.09);
    const wanted = -controls.steer * lock;
    const step = 2.6 * dt;
    this.steerAngle += Math.max(-step, Math.min(step, wanted - this.steerAngle));

    spec.wheels.forEach((wheel, i) => {
      controller.setWheelEngineForce(i, wheel.driven ? -force / drivenCount : 0);
      controller.setWheelBrake(i, brake / spec.wheels.length);
      controller.setWheelSteering(i, wheel.steers ? this.steerAngle : 0);
    });
    if (force !== 0 || controls.brake > 0) this.body.wakeUp();
    controller.updateVehicle(dt);
  }

  /** Stop dead (parking, mission reset). */
  halt(): void {
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  teleport(position: Vec3, yaw: number): void {
    this.body.setTranslation(position, true);
    this.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    this.halt();
  }
}

/** @internal Used by `PhysicsWorld.createVehicle`. */
export function buildVehicle(world: RAPIER.World, spec: VehicleSpec, position: Vec3, yaw: number): VehicleBody {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setLinearDamping(0.08)
      .setAngularDamping(1.2)
      .setCanSleep(true),
  );
  body.setEnabledRotations(false, true, false, true);
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(spec.halfExtents.x, spec.halfExtents.y, spec.halfExtents.z).setMass(spec.mass).setFriction(0.4).setRestitution(0.1),
    body,
  );
  return new VehicleBody(body, world.createVehicleController(body), spec);
}
