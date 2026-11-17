/**
 * The visible side of combat: a figure and a collision box for every enemy, bullet tracers,
 * and the answers to the two questions the combat rules ask about the world.
 */
import * as THREE from "three";
import type { Combat, CombatWorld, Enemy } from "@cow/combat";
import type { KinematicBox, PhysicsWorld } from "@cow/physics";
import type { HumanAssets, HumanFigure } from "@cow/player";

const CHEST = 1.2;
/** Enemy clothing tints: unarmed thugs in maroon, armed ones in near-black. */
const TINT = { unarmed: 0xb04a4a, armed: 0x4a4a55 } as const;

interface Body {
  readonly figure: HumanFigure;
  readonly box: KinematicBox;
  placed: boolean;
}

/** How the combat rules see the world: ray casts against buildings, trees and vehicles. */
export function combatWorld(physics: PhysicsWorld): CombatWorld {
  return {
    lineOfSight(ax, az, bx, bz) {
      const distance = Math.hypot(bx - ax, bz - az);
      if (distance < 0.5) return true;
      const dx = (bx - ax) / distance;
      const dz = (bz - az) / distance;
      // Start and stop a little short so the ray doesn't hit the two people themselves.
      return physics.raycast({ x: ax + dx * 0.6, y: CHEST, z: az + dz * 0.6 }, { x: dx, y: 0, z: dz }, Math.max(0, distance - 1.2)) === null;
    },
    wallDistance(x, z, dx, dz, max) {
      // Distance from the point itself; the ray starts 0.6 m out so it misses the person standing
      // there (it reaches 0.6 m further than `max`, which only matters for a null "clear" answer).
      const hit = physics.raycast({ x: x + dx * 0.6, y: CHEST, z: z + dz * 0.6 }, { x: dx, y: 0, z: dz }, max);
      return hit === null ? null : hit + 0.6;
    },
  };
}

export class Fighters {
  private readonly bodies = new Map<number, Body>();
  private readonly tracers: Array<{ mesh: THREE.Mesh; life: number }> = [];
  private readonly tracerMaterial = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
  private readonly tracerGeometry = new THREE.BoxGeometry(0.035, 0.035, 1);

  constructor(
    private readonly combat: Combat,
    private readonly scene: THREE.Object3D,
    private readonly physics: PhysicsWorld,
    private readonly humans: HumanAssets,
  ) {}

  /** After each physics step: move the enemies' collision boxes with them. */
  fixedUpdate(): void {
    for (const enemy of this.combat.enemies) {
      const body = this.body(enemy);
      if (enemy.health <= 0) {
        body.box.teleport(enemy.x, -40, enemy.z, 0); // a fallen enemy is no obstacle
      } else if (body.placed) {
        body.box.moveTo(enemy.x, 0.87, enemy.z, enemy.heading);
      } else {
        body.box.teleport(enemy.x, 0.87, enemy.z, enemy.heading);
        body.placed = true;
      }
    }
  }

  private body(enemy: Enemy): Body {
    let body = this.bodies.get(enemy.id);
    if (!body) {
      // Gang members wear their gang's colours.
      const figure = this.humans.create(enemy.tint ?? (enemy.armed ? TINT.armed : TINT.unarmed), true);
      // Guns are drawn while aiming; a bat is carried in the hand. Fists: nothing held.
      if (enemy.weapon === "bat") figure.setWeapon("bat", true);
      else if (enemy.weapon === "shotgun" || enemy.weapon === "smg") figure.setWeapon(enemy.weapon);
      else if (!enemy.armed) figure.setWeapon(null);
      // A boss is visibly bigger.
      if (enemy.maxHealth > 150) figure.object.scale.setScalar(1.18);
      this.scene.add(figure.object);
      body = { figure, box: this.physics.createKinematicBox({ x: 0.28, y: 0.85, z: 0.28 }), placed: false };
      this.bodies.set(enemy.id, body);
    }
    return body;
  }

  /** Once per rendered frame. */
  frame(dt: number): void {
    const alive = new Set<number>();
    for (const enemy of this.combat.enemies) {
      alive.add(enemy.id);
      const { figure } = this.body(enemy);
      figure.object.position.set(enemy.x, 0, enemy.z);
      figure.object.rotation.y = enemy.heading;
      figure.setDown(enemy.health <= 0);
      figure.setAiming(enemy.armed && enemy.alerted && enemy.speed === 0);
      figure.update(dt, enemy.speed, true);
    }
    // Enemies the rules have removed leave the scene too.
    for (const [id, body] of this.bodies) {
      if (alive.has(id)) continue;
      this.scene.remove(body.figure.object);
      body.box.dispose();
      this.bodies.delete(id);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tracer = this.tracers[i]!;
      tracer.life -= dt;
      if (tracer.life > 0) continue;
      this.scene.remove(tracer.mesh);
      this.tracers.splice(i, 1);
    }
  }

  /** An enemy throws a punch (arm animation). */
  enemyPunch(enemy: Enemy): void {
    this.bodies.get(enemy.id)?.figure.punch();
  }

  /** What the enemies hold in their hands now (tests): weapon ids, one per enemy shown with one. */
  heldWeapons(): string[] {
    const held: string[] = [];
    for (const body of this.bodies.values()) {
      const weapon = body.figure.shownWeapon;
      if (weapon) held.push(weapon);
    }
    return held;
  }

  /** Draw a bullet's path for a moment. */
  tracer(fromX: number, fromZ: number, toX: number, toZ: number): void {
    const length = Math.hypot(toX - fromX, toZ - fromZ);
    if (length < 0.5) return;
    const mesh = new THREE.Mesh(this.tracerGeometry, this.tracerMaterial);
    mesh.position.set((fromX + toX) / 2, 1.36, (fromZ + toZ) / 2);
    mesh.scale.z = length;
    mesh.rotation.y = Math.atan2(toX - fromX, toZ - fromZ);
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.07 });
  }
}
