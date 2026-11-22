/**
 * The visible side of combat: a figure and a collision box for every enemy, bullet tracers,
 * and the answers to the two questions the combat rules ask about the world.
 */
import * as THREE from "three";
import { isPoliceGroup, type Combat, type CombatWorld, type Enemy } from "@cow/combat";
import { Motion } from "@cow/game-engine";
import type { KinematicBox, PhysicsWorld } from "@cow/physics";
import type { HumanAssets, HumanFigure } from "@cow/player";
import type { CombatMark } from "@cow/ui";

const CHEST = 1.2;
/** Enemy clothing tints: unarmed thugs in maroon, armed ones in near-black, police officers in khaki. */
const TINT = { unarmed: 0xb04a4a, armed: 0x4a4a55, police: 0xe3cb8f } as const;

interface Body {
  readonly figure: HumanFigure;
  readonly box: KinematicBox;
  placed: boolean;
  /** The last two fixed steps, drawn in between (smooth on any display rate). */
  readonly motion: Motion;
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
    solidDistance(x, z, dx, dz, max) {
      return physics.raycastSolid({ x, y: CHEST, z }, { x: dx, y: 0, z: dz }, max);
    },
  };
}

export class Fighters {
  private readonly bodies = new Map<number, Body>();
  private readonly tracers: Array<{ mesh: THREE.Mesh; life: number }> = [];
  private readonly tracerMaterial = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
  private readonly tracerGeometry = new THREE.BoxGeometry(0.035, 0.035, 1);
  /** Muzzle flashes: a bright star that shows for a moment where a gun fires. */
  private readonly flashes: Array<{ sprite: THREE.Sprite; life: number }> = [];
  private readonly flashMaterial = new THREE.SpriteMaterial({ map: muzzleTexture(), color: 0xffe0a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  private readonly scratch = new THREE.Vector3();

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
      body.motion.step(enemy.x, 0, enemy.z, enemy.heading);
    }
  }

  private body(enemy: Enemy): Body {
    let body = this.bodies.get(enemy.id);
    if (!body) {
      // Gang members wear their gang's colours.
      const figure = this.humans.create(isPoliceGroup(enemy.group) ? TINT.police : enemy.tint ?? (enemy.armed ? TINT.armed : TINT.unarmed), true);
      // Guns are drawn while aiming; a bat is carried in the hand. Fists: nothing held.
      if (enemy.weapon === "bat") figure.setWeapon("bat", true);
      else if (enemy.weapon === "shotgun" || enemy.weapon === "smg") figure.setWeapon(enemy.weapon);
      else if (!enemy.armed) figure.setWeapon(null);
      // A boss is visibly bigger.
      if (enemy.maxHealth > 150) figure.object.scale.setScalar(1.18);
      this.scene.add(figure.object);
      body = { figure, box: this.physics.createKinematicBox({ x: 0.28, y: 0.85, z: 0.28 }), placed: false, motion: new Motion() };
      body.motion.snap(enemy.x, 0, enemy.z, enemy.heading);
      this.bodies.set(enemy.id, body);
    }
    return body;
  }

  /** Once per rendered frame. `alpha`: how far the clock is past the last fixed step (0 to 1); enemies are drawn that far between their last two steps. */
  frame(dt: number, alpha = 1): void {
    const alive = new Set<number>();
    for (const enemy of this.combat.enemies) {
      alive.add(enemy.id);
      const { figure, motion } = this.body(enemy);
      const drawn = motion.at(alpha);
      figure.object.position.set(drawn.x, 0, drawn.z);
      figure.object.rotation.y = drawn.heading;
      figure.setDown(enemy.health <= 0);
      figure.setAiming(enemy.armed && enemy.alerted && enemy.speed === 0);
      // Brawlers square up, fists raised, once the fight is on.
      figure.setStance(!enemy.armed && enemy.weapon === "fists" && enemy.alerted && !enemy.calm && enemy.health > 0 ? "guard" : null);
      figure.update(dt, enemy.speed, true);
    }
    // Enemies the rules have removed leave the scene too.
    for (const [id, body] of this.bodies) {
      if (alive.has(id)) continue;
      this.scene.remove(body.figure.object);
      body.box.dispose();
      this.bodies.delete(id);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const flash = this.flashes[i]!;
      flash.life -= dt;
      flash.sprite.material.opacity = Math.max(0, flash.life / 0.06);
      if (flash.life > 0) continue;
      this.scene.remove(flash.sprite);
      flash.sprite.material.dispose();
      this.flashes.splice(i, 1);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tracer = this.tracers[i]!;
      tracer.life -= dt;
      if (tracer.life > 0) continue;
      this.scene.remove(tracer.mesh);
      this.tracers.splice(i, 1);
    }
  }

  /** An enemy's punch or swing lands. */
  enemyPunch(enemy: Enemy): void {
    this.bodies.get(enemy.id)?.figure.play(enemy.weapon === "bat" ? "bat" : "cross");
  }

  /** An enemy draws back to strike: the tell the player can block or dodge on. */
  enemyWindup(enemy: Enemy): void {
    this.bodies.get(enemy.id)?.figure.play("windup");
  }

  /** The player's hit landed: a flinch, or a stagger for a heavy one. */
  enemyHit(enemy: Enemy, heavy: boolean): void {
    if (enemy.health > 0) this.bodies.get(enemy.id)?.figure.play(heavy ? "stagger" : "flinch");
  }

  /** A gun fires at (x, z), pointing along `yaw`: a flash at the muzzle for a moment. */
  muzzleFlash(x: number, z: number, yaw: number, height = 1.4): void {
    const sprite = new THREE.Sprite(this.flashMaterial.clone());
    sprite.position.set(x - Math.sin(yaw) * 0.25, height, z - Math.cos(yaw) * 0.25);
    sprite.scale.setScalar(0.45 + Math.random() * 0.15);
    sprite.material.rotation = Math.random() * Math.PI;
    this.scene.add(sprite);
    this.flashes.push({ sprite, life: 0.06 });
  }

  /** Health bars, the lock-on brackets and hit markers: where each standing enemy is on screen. */
  marks(camera: THREE.Camera, locked: number | null, near: { x: number; z: number }): CombatMark[] {
    const out: CombatMark[] = [];
    for (const enemy of this.combat.enemies) {
      if (enemy.health <= 0 || Math.hypot(enemy.x - near.x, enemy.z - near.z) > 40) continue;
      const body = this.bodies.get(enemy.id);
      if (!body) continue;
      const at = body.figure.object.position;
      const head = this.scratch.set(at.x, 2.15, at.z).project(camera);
      const inView = head.z > -1 && head.z < 1 && Math.abs(head.x) < 1.05 && Math.abs(head.y) < 1.05;
      const headXY = { x: head.x, y: head.y };
      const chest = this.scratch.set(at.x, 1.25, at.z).project(camera);
      out.push({ id: enemy.id, head: headXY, chest: { x: chest.x, y: chest.y }, inView, health: enemy.health / enemy.maxHealth, sinceHit: enemy.sinceHit, heavyHit: enemy.heavyHit, locked: enemy.id === locked });
    }
    return out;
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

/** A small soft star for muzzle flashes, drawn once. */
function muzzleTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  if (g) {
    const glow = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    glow.addColorStop(0, "rgba(255,255,255,1)");
    glow.addColorStop(0.25, "rgba(255,220,140,.9)");
    glow.addColorStop(1, "rgba(255,140,40,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, size, size);
    // Four short spikes.
    g.strokeStyle = "rgba(255,240,200,.9)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(size / 2, 4);
    g.lineTo(size / 2, size - 4);
    g.moveTo(4, size / 2);
    g.lineTo(size - 4, size / 2);
    g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

