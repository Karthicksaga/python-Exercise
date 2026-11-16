/**
 * A drivable vehicle: a rigid chassis on ray-cast wheels (suspension and tyre grip are
 * simulated per wheel, the wheels themselves are not rigid bodies).
 *
 * Local axes: forward is -Z, right is +X, up is +Y. The chassis cannot roll or pitch, which
 * keeps handling predictable on a touchscreen and makes it impossible to flip over.
 *
 * Arcade drift: fast and at full lock, vehicles with a `drift` rating loosen their rear tyres
 * so the tail steps out; a countersteer, easing the stick or losing speed brings the grip back.
 * Vehicles without one (two-wheelers) are held in line instead.
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
  /**
   * 0 to 1: how readily the rear tyres let go when cornering hard at speed, so the tail steps
   * out and can be caught by steering the other way. Leave it out for vehicles that must not
   * slide (two-wheelers).
   */
  readonly drift?: number;
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
/** Tyre grip: how much force a tyre can pass before it slides, and how firmly it resists sliding sideways. */
const FRICTION_SLIP = 2.2;
const SIDE_STIFFNESS = 1;

/**
 * Drift tuning. A drift starts above `DRIFT_FROM` of top speed with the stick near full lock;
 * the rear tyres then lose up to `REAR_SIDE_LOSS` of their sideways stiffness and
 * `REAR_SLIP_LOSS` of their grip (scaled by the vehicle's `drift`). Countersteering keeps only
 * `COUNTER_KEEP` of the release, and a slide past `SPIN_GUARD` radians gets its grip back, so
 * the vehicle swings out but does not spin round.
 */
const DRIFT_FROM = 0.52;
const DRIFT_FULL = 0.72;
const STEER_FROM = 0.55;
const STEER_FULL = 0.95;
const REAR_SIDE_LOSS = 0.85;
const REAR_SLIP_LOSS = 0.55;
const COUNTER_KEEP = 0.25;
/** Extra steering lock when countersteering a full drift, radians. */
const COUNTER_LOCK = 0.18;
const SPIN_GUARD = { from: 0.3, to: 0.5 };
/** How fast the rear lets go and grips again, per second. */
const RELEASE_RATE = 3;
const REGRIP_RATE = 2.2;
/** Slip angle (radians) reported as no drift and as a full drift by `drifting()`. */
const SLIP_QUIET = 0.06;
const SLIP_LOUD = 0.32;
/** How hard a vehicle without `drift` is turned back into line once it slips, (rad/s) per radian of slip per second. */
const HOLD_LINE_RATE = 12;

const smoothstep = (from: number, to: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

export class VehicleBody {
  private steerAngle = 0;
  /** Share of rear grip given up for a drift, 0 to 1 (eased). */
  private release = 0;
  /** Last measured slide, 0 to 1. */
  private slide = 0;
  /** Distance of the unsteered (rear) wheels behind the chassis centre, metres. */
  private readonly rearAxle: number;

  /** @internal Created by `PhysicsWorld.createVehicle`. */
  constructor(
    /** @internal The chassis body; other packages must not use it. */
    readonly body: RAPIER.RigidBody,
    private readonly controller: RAPIER.DynamicRayCastVehicleController,
    readonly spec: VehicleSpec,
  ) {
    const rear = spec.wheels.filter((w) => !w.steers);
    this.rearAxle = rear.length > 0 ? rear.reduce((sum, w) => sum + w.z, 0) / rear.length : 0;
    spec.wheels.forEach((wheel, i) => {
      controller.addWheel({ x: wheel.x, y: wheel.y, z: wheel.z }, DOWN, AXLE, SUSPENSION_REST, wheel.radius);
      controller.setWheelSuspensionStiffness(i, 28);
      controller.setWheelSuspensionCompression(i, 2.4);
      controller.setWheelSuspensionRelaxation(i, 2.9);
      controller.setWheelMaxSuspensionTravel(i, 0.25);
      controller.setWheelMaxSuspensionForce(i, spec.mass * 40);
      controller.setWheelFrictionSlip(i, FRICTION_SLIP);
      controller.setWheelSideFrictionStiffness(i, SIDE_STIFFNESS);
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

  /** Velocity over the ground, m/s. */
  planarVelocity(): { x: number; z: number } {
    const v = this.body.linvel();
    return { x: v.x, z: v.z };
  }

  /** Scale the vehicle's speed (a crash costs momentum). */
  damp(factor: number): void {
    const v = this.body.linvel();
    this.body.setLinvel({ x: v.x * factor, y: v.y, z: v.z * factor }, true);
  }

  /** Current steering angle of the front wheels, radians (positive = left). */
  steering(): number {
    return this.steerAngle;
  }

  /**
   * How much the vehicle is sliding sideways, 0 (gripping) to 1 (a full drift), from the angle
   * between where it points and where it is going. Drives the tyre squeal.
   */
  drifting(): number {
    return this.slide;
  }

  /**
   * Angle between the heading and the way the rear axle is moving, radians (positive = the
   * tail sliding right). Measured at the rear axle because in a tight, gripping turn at low
   * speed the chassis centre moves sideways too, and that is not a slide.
   */
  private slipAngle(): number {
    const v = this.body.linvel();
    const yaw = this.yaw();
    const forward = v.x * -Math.sin(yaw) + v.z * -Math.cos(yaw);
    const right = v.x * Math.cos(yaw) - v.z * Math.sin(yaw) + this.body.angvel().y * this.rearAxle;
    return Math.atan2(right, Math.abs(forward));
  }

  /**
   * Arcade drift: fast and at full lock, the rear tyres give up some sideways grip so the tail
   * swings out. Steering against the slide (countersteer) or easing off the stick or the speed
   * gives the grip back. Two-wheelers (no `drift`) always keep full grip. Returns true while
   * the driver is countersteering.
   */
  private updateGrip(steer: number, speed: number, dt: number): boolean {
    const { spec, controller } = this;
    const slip = this.slipAngle();
    const moving = Math.abs(speed) > 4 ? 1 : 0;
    this.slide = moving * smoothstep(SLIP_QUIET, SLIP_LOUD, Math.abs(slip));
    const drift = spec.drift ?? 0;
    if (drift <= 0) {
      this.holdLine(slip, speed, dt);
      return false;
    }

    const fast = speed > 0 ? smoothstep(DRIFT_FROM, DRIFT_FULL, speed / spec.maxSpeed) : 0;
    const hard = smoothstep(STEER_FROM, STEER_FULL, Math.abs(steer));
    // Sliding right means the tail is out to the left; steering right then points the wheels
    // where the car is going: a countersteer.
    const countering = Math.abs(slip) > 0.05 && Math.sign(steer) === Math.sign(slip);
    const guard = 1 - smoothstep(SPIN_GUARD.from, SPIN_GUARD.to, Math.abs(slip));
    const wanted = drift * fast * hard * guard * (countering ? COUNTER_KEEP : 1);
    const rate = (wanted > this.release ? RELEASE_RATE : REGRIP_RATE) * dt;
    this.release += Math.max(-rate, Math.min(rate, wanted - this.release));

    spec.wheels.forEach((wheel, i) => {
      if (wheel.steers) return;
      controller.setWheelSideFrictionStiffness(i, SIDE_STIFFNESS * (1 - REAR_SIDE_LOSS * this.release));
      controller.setWheelFrictionSlip(i, FRICTION_SLIP * (1 - REAR_SLIP_LOSS * this.release));
    });
    return countering;
  }

  /**
   * For vehicles that must not slide (two-wheelers): once the rear tyre starts to slip, turn
   * the nose back into line with the direction of travel, as a rider would. Without this, a
   * flick of full lock at top speed set a motorbike yawing on its own for two seconds.
   */
  private holdLine(slip: number, speed: number, dt: number): void {
    if (Math.abs(slip) < SLIP_QUIET || Math.abs(speed) < 1) return;
    // Tail sliding right: turn the nose right (negative yaw) to line it up with the travel.
    const w = this.body.angvel();
    this.body.setAngvel({ x: w.x, y: w.y - slip * HOLD_LINE_RATE * dt, z: w.z }, true);
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

    // Fast vehicles get a smaller steering lock, and the wheels turn at a finite rate. In a
    // drift, steering against the slide gets extra lock so a countersteer can catch it.
    const countering = this.updateGrip(controls.steer, speed, dt);
    const lock = spec.maxSteer / (1 + Math.abs(speed) * 0.09) + (countering ? this.release * COUNTER_LOCK : 0);
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
    this.release = 0;
    this.slide = 0;
    this.spec.wheels.forEach((_, i) => {
      this.controller.setWheelSideFrictionStiffness(i, SIDE_STIFFNESS);
      this.controller.setWheelFrictionSlip(i, FRICTION_SLIP);
    });
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
