/**
 * Thin wrapper around the Rapier physics engine.
 *
 * Nothing outside this package imports Rapier, so the engine can be upgraded or replaced
 * without touching gameplay code. Units are metres, seconds and radians.
 */
import RAPIER from "@dimforge/rapier3d-compat";
import { VehicleBody, buildVehicle, type VehicleSpec } from "./VehicleBody";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface StaticBox {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly hx: number;
  readonly hy: number;
  readonly hz: number;
  /** Rotation around the vertical axis. */
  readonly yaw: number;
}

export interface CharacterOptions {
  /** Capsule radius. */
  readonly radius: number;
  /** Total standing height, including both capsule caps. */
  readonly height: number;
  /** Position of the feet. */
  readonly feet: Vec3;
}

/**
 * A capsule moved by a kinematic character controller: it slides along walls, climbs kerbs
 * and stays glued to the ground, but is never pushed around by the solver.
 */
export class CharacterBody {
  /** True when the last move ended standing on something. */
  grounded = false;
  private readonly halfHeight: number;

  /** @internal Created by `PhysicsWorld.createCharacter`. */
  constructor(
    private readonly body: RAPIER.RigidBody,
    readonly collider: RAPIER.Collider,
    private readonly controller: RAPIER.KinematicCharacterController,
    options: CharacterOptions,
  ) {
    this.halfHeight = options.height / 2;
  }

  /** Current position of the feet. */
  feet(): Vec3 {
    const t = this.body.translation();
    return { x: t.x, y: t.y - this.halfHeight, z: t.z };
  }

  /**
   * Try to move by `delta` this step. The controller shortens or redirects the move where
   * something solid is in the way. Returns the movement that was actually possible.
   */
  move(delta: Vec3): Vec3 {
    const ignored = this.ignored;
    if (ignored) this.controller.computeColliderMovement(this.collider, delta, undefined, undefined, (c) => c.parent()?.handle !== ignored.handle);
    else this.controller.computeColliderMovement(this.collider, delta);
    const moved = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z });
    return { x: moved.x, y: moved.y, z: moved.z };
  }

  /** A body the capsule's moves pass through (see `passThrough`). */
  private ignored: RAPIER.RigidBody | null = null;

  /**
   * Thrown out of a vehicle (TD-29): moves pass through that vehicle, and nothing else is pushed
   * by the capsule (it becomes a sensor), so a body leaving from the seat does not shove the
   * vehicle it is leaving. Walls and the ground still stop it. Null makes it solid again.
   */
  passThrough(vehicle: VehicleBody | null): void {
    this.ignored = vehicle ? vehicle.body : null;
    this.collider.setSensor(vehicle !== null);
  }

  /** Switch the capsule off (while the player sits in a vehicle) or back on. */
  setEnabled(enabled: boolean): void {
    this.collider.setEnabled(enabled);
  }

  /** Move instantly, ignoring collisions (respawn). */
  teleport(feet: Vec3): void {
    this.body.setTranslation({ x: feet.x, y: feet.y + this.halfHeight, z: feet.z }, true);
  }
}

/**
 * A solid box moved by game logic rather than by forces (traffic vehicles, pedestrians).
 * Dynamic bodies such as the player's car collide with it; it is never pushed back.
 */
export class KinematicBox {
  /** @internal Created by `PhysicsWorld.createKinematicBox`. */
  constructor(
    private readonly world: RAPIER.World,
    private readonly body: RAPIER.RigidBody,
  ) {}

  /** Where the box should be after the next physics step. */
  moveTo(x: number, y: number, z: number, yaw: number): void {
    this.body.setNextKinematicTranslation({ x, y, z });
    this.body.setNextKinematicRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
  }

  /** Jump there at once (when an agent is moved to a new place). */
  teleport(x: number, y: number, z: number, yaw: number): void {
    this.body.setTranslation({ x, y, z }, true);
    this.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  }

  dispose(): void {
    this.world.removeRigidBody(this.body);
  }
}

export class StaticGroup {
  /** @internal Created by `PhysicsWorld.createStaticGroup`. */
  constructor(
    private readonly world: RAPIER.World,
    readonly body: RAPIER.RigidBody,
  ) {}

  addBox(box: StaticBox): void {
    const half = box.yaw / 2;
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(box.hx, box.hy, box.hz)
        .setTranslation(box.x, box.y, box.z)
        .setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) })
        .setFriction(1),
      this.body,
    );
  }

  /** Arbitrary static triangles (building walls). Ignored when empty. */
  addMesh(vertices: Float32Array, indices: Uint32Array): void {
    if (indices.length === 0) return;
    this.world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices), this.body);
  }
}

export class PhysicsWorld {
  private constructor(private readonly world: RAPIER.World) {}

  /** Loads the WebAssembly module (once) and creates an empty world. */
  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld(new RAPIER.World({ x: 0, y: -9.81, z: 0 }));
  }

  /**
   * A set of static solids that can be removed together (one streamed chunk of the world).
   * All shapes hang off a single fixed body.
   */
  createStaticGroup(): StaticGroup {
    return new StaticGroup(this.world, this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed()));
  }

  removeStaticGroup(group: StaticGroup): void {
    this.world.removeRigidBody(group.body);
  }

  createCharacter(options: CharacterOptions): CharacterBody {
    const { radius, height, feet } = options;
    const halfSegment = Math.max(0.01, height / 2 - radius);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(feet.x, feet.y + height / 2, feet.z),
    );
    const collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(halfSegment, radius), body);

    // A small skin gap keeps the capsule from getting stuck in corners.
    const controller = this.world.createCharacterController(0.02);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.setSlideEnabled(true);
    controller.enableAutostep(0.35, 0.2, false); // kerbs and steps
    controller.enableSnapToGround(0.3);
    controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    controller.setMinSlopeSlideAngle((35 * Math.PI) / 180);
    return new CharacterBody(body, collider, controller, options);
  }

  createKinematicBox(halfExtents: Vec3): KinematicBox {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z), body);
    return new KinematicBox(this.world, body);
  }

  /** A drivable vehicle resting at `position` (its chassis centre), facing `yaw`. */
  createVehicle(spec: VehicleSpec, position: Vec3, yaw: number): VehicleBody {
    return buildVehicle(this.world, spec, position, yaw);
  }

  /**
   * Distance to the first solid along a ray, or null when nothing is hit within `maxDistance`.
   * `direction` must be normalised. `ignore` is skipped (the player's capsule or their vehicle).
   */
  raycast(origin: Vec3, direction: Vec3, maxDistance: number, ignore?: CharacterBody | VehicleBody): number | null {
    const ray = new RAPIER.Ray(origin, direction);
    const hit =
      ignore instanceof VehicleBody
        ? this.world.castRay(ray, maxDistance, true, undefined, undefined, undefined, ignore.body)
        : this.world.castRay(ray, maxDistance, true, undefined, undefined, ignore?.collider);
    return hit ? hit.timeOfImpact : null;
  }

  /**
   * Like `raycast`, but only fixed solids and vehicles count: people's collision boxes and the
   * player's capsule (kinematic bodies) are passed through. So a ray can start at a person's own
   * centre, which matters because buildings are hollow: a ray that starts past a wall, inside a
   * building, sees nothing.
   */
  raycastSolid(origin: Vec3, direction: Vec3, maxDistance: number): number | null {
    const hit = this.world.castRay(new RAPIER.Ray(origin, direction), maxDistance, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
    return hit ? hit.timeOfImpact : null;
  }

  /** Advance the simulation by one fixed step. */
  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  dispose(): void {
    this.world.free();
  }
}
