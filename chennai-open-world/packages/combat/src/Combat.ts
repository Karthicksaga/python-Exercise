/**
 * Fighting rules: the player's health and ammunition, punches and gunshots, and enemies that
 * notice the player, chase them and attack. Pure logic: the game supplies two questions about
 * the world (is there a clear line between two points? how far can something move?) and draws
 * whatever the returned events describe.
 */

export interface CombatWorld {
  /** True when nothing solid lies between two points at chest height. */
  lineOfSight(ax: number, az: number, bx: number, bz: number): boolean;
  /** Distance to the first wall from a point in a direction, or null when clear for `max` metres. */
  wallDistance(x: number, z: number, dx: number, dz: number, max: number): number | null;
}

export interface EnemySpot {
  readonly x: number;
  readonly z: number;
  /** Armed enemies shoot from a distance; unarmed ones close in and punch. */
  readonly armed: boolean;
  readonly health?: number;
}

export interface Enemy {
  readonly id: number;
  readonly group: string;
  readonly armed: boolean;
  readonly maxHealth: number;
  x: number;
  z: number;
  /** Heading in radians, 0 = towards -Z (north), positive turning left. */
  heading: number;
  health: number;
  /** Ground speed, for animation. */
  speed: number;
  alerted: boolean;
  /** Seconds until this enemy may attack again. */
  cooldown: number;
  /** Seconds since death, or -1 while alive. */
  downFor: number;
}

export interface PlayerState {
  readonly x: number;
  readonly z: number;
  /** Heading the player faces. */
  readonly heading: number;
  /** True when inside a vehicle: harder to hit, cannot attack, can run enemies over. */
  readonly inVehicle: boolean;
  /** Speed in m/s. */
  readonly speed: number;
}

export type CombatEvent =
  | { readonly type: "enemyShot"; readonly fromX: number; readonly fromZ: number; readonly toX: number; readonly toZ: number; readonly hit: boolean }
  | { readonly type: "enemyPunch"; readonly enemy: Enemy }
  | { readonly type: "enemyDown"; readonly enemy: Enemy }
  | { readonly type: "groupCleared"; readonly group: string }
  | { readonly type: "playerHurt"; readonly amount: number }
  | { readonly type: "playerDied" };

export interface ShotResult {
  readonly fired: boolean;
  /** Where the bullet ended, for drawing the tracer. */
  readonly toX: number;
  readonly toZ: number;
  readonly hit: Enemy | null;
}

export const PLAYER_MAX_HEALTH = 100;
const PUNCH_DAMAGE = 34;
const PUNCH_RANGE = 1.9;
const PUNCH_INTERVAL = 0.45;
const SHOT_DAMAGE = 34;
const SHOT_RANGE = 45;
const SHOT_INTERVAL = 0.32;
/** The player's shots are pulled onto an enemy within this angle of where they face. */
const AIM_ASSIST = 0.5;
const ENEMY_HEALTH = 100;
const ENEMY_NOTICE = 28; // metres at which an enemy notices the player
const ENEMY_SPEED = 3.4;
const ENEMY_PUNCH_DAMAGE = 6;
const ENEMY_PUNCH_RANGE = 1.7;
const ENEMY_SHOT_DAMAGE = 7;
const ENEMY_SHOT_RANGE = 22;
const ENEMY_SHOT_INTERVAL = 1.5;
/** Chance that an enemy's shot hits a player standing still at short range. */
const ENEMY_ACCURACY = 0.45;
const REGEN_DELAY = 6;
const REGEN_RATE = 7;
const RUN_OVER_SPEED = 4;
/** Seconds a fallen enemy stays on the ground before being removed. */
const DOWN_TIME = 5;

const angleBetween = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export class Combat {
  health = PLAYER_MAX_HEALTH;
  ammo = 0;
  readonly enemies: Enemy[] = [];
  private nextId = 1;
  private sinceHurt = 99;
  private punchCooldown = 0;
  private shotCooldown = 0;
  private readonly random: () => number;

  /** @param random source of chance for enemy accuracy; injectable so tests are exact */
  constructor(
    private readonly world: CombatWorld,
    random: () => number = Math.random,
  ) {
    this.random = random;
  }

  /** Put a group of enemies on the map. Does nothing if the group is already there. */
  spawnGroup(group: string, spots: readonly EnemySpot[]): void {
    if (this.enemies.some((e) => e.group === group)) return;
    for (const spot of spots) {
      const health = spot.health ?? ENEMY_HEALTH;
      this.enemies.push({ id: this.nextId++, group, armed: spot.armed, maxHealth: health, x: spot.x, z: spot.z, heading: 0, health, speed: 0, alerted: false, cooldown: 1, downFor: -1 });
    }
  }

  /** Remove every enemy that is not in one of the given groups. */
  keepOnly(groups: readonly string[]): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!groups.includes(this.enemies[i]!.group)) this.enemies.splice(i, 1);
    }
  }

  /** Enemies of a group still standing. */
  remaining(group: string): number {
    return this.enemies.filter((e) => e.group === group && e.health > 0).length;
  }

  /** Back to full health (after a respawn). */
  revive(): void {
    this.health = PLAYER_MAX_HEALTH;
    this.sinceHurt = 99;
  }

  private damageEnemy(enemy: Enemy, amount: number, events: CombatEvent[]): void {
    if (enemy.health <= 0) return;
    enemy.health = Math.max(0, enemy.health - amount);
    enemy.alerted = true;
    if (enemy.health > 0) return;
    enemy.downFor = 0;
    enemy.speed = 0;
    events.push({ type: "enemyDown", enemy });
    if (this.remaining(enemy.group) === 0) events.push({ type: "groupCleared", group: enemy.group });
  }

  /** Throw a punch. Returns the enemy hit, null for a miss, or undefined when still recovering. */
  punch(player: PlayerState, events: CombatEvent[]): Enemy | null | undefined {
    if (this.punchCooldown > 0 || player.inVehicle) return undefined;
    this.punchCooldown = PUNCH_INTERVAL;
    let best: Enemy | null = null;
    let bestDistance = PUNCH_RANGE;
    for (const enemy of this.enemies) {
      if (enemy.health <= 0) continue;
      const distance = Math.hypot(enemy.x - player.x, enemy.z - player.z);
      const bearing = Math.atan2(-(enemy.x - player.x), -(enemy.z - player.z));
      // Anyone close and roughly in front.
      if (distance < bestDistance && angleBetween(bearing, player.heading) < 1.2) {
        best = enemy;
        bestDistance = distance;
      }
    }
    if (best) this.damageEnemy(best, PUNCH_DAMAGE, events);
    return best;
  }

  /** Fire the pistol the way the player faces, with a little aim assistance. */
  shoot(player: PlayerState, events: CombatEvent[]): ShotResult {
    const straight = { fired: false, toX: player.x, toZ: player.z, hit: null };
    if (this.shotCooldown > 0 || this.ammo <= 0 || player.inVehicle) return straight;
    this.shotCooldown = SHOT_INTERVAL;
    this.ammo--;

    let target: Enemy | null = null;
    let bestAngle = AIM_ASSIST;
    for (const enemy of this.enemies) {
      if (enemy.health <= 0) continue;
      const distance = Math.hypot(enemy.x - player.x, enemy.z - player.z);
      if (distance > SHOT_RANGE || distance < 0.3) continue;
      const bearing = Math.atan2(-(enemy.x - player.x), -(enemy.z - player.z));
      const off = angleBetween(bearing, player.heading);
      if (off < bestAngle && this.world.lineOfSight(player.x, player.z, enemy.x, enemy.z)) {
        target = enemy;
        bestAngle = off;
      }
    }
    if (target) {
      this.damageEnemy(target, SHOT_DAMAGE, events);
      return { fired: true, toX: target.x, toZ: target.z, hit: target };
    }
    // Nobody in the sights: the bullet flies straight until it meets a wall.
    const dx = -Math.sin(player.heading);
    const dz = -Math.cos(player.heading);
    const reach = this.world.wallDistance(player.x, player.z, dx, dz, SHOT_RANGE) ?? SHOT_RANGE;
    return { fired: true, toX: player.x + dx * reach, toZ: player.z + dz * reach, hit: null };
  }

  private hurtPlayer(amount: number, events: CombatEvent[]): void {
    if (this.health <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.sinceHurt = 0;
    events.push({ type: "playerHurt", amount });
    if (this.health === 0) events.push({ type: "playerDied" });
  }

  /** Advance one step: cooldowns, healing, and every enemy's decision. */
  update(dt: number, player: PlayerState): CombatEvent[] {
    const events: CombatEvent[] = [];
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    this.sinceHurt += dt;
    if (this.health > 0 && this.sinceHurt > REGEN_DELAY) this.health = Math.min(PLAYER_MAX_HEALTH, this.health + REGEN_RATE * dt);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i]!;
      if (enemy.health <= 0) {
        enemy.downFor += dt;
        if (enemy.downFor > DOWN_TIME) this.enemies.splice(i, 1);
        continue;
      }
      const dx = player.x - enemy.x;
      const dz = player.z - enemy.z;
      const distance = Math.hypot(dx, dz);
      enemy.cooldown = Math.max(0, enemy.cooldown - dt);
      enemy.speed = 0;

      // A fast vehicle knocks down anyone it hits.
      if (player.inVehicle && player.speed > RUN_OVER_SPEED && distance < 1.9) {
        this.damageEnemy(enemy, 70, events);
        continue;
      }
      if (!enemy.alerted) {
        if (distance < ENEMY_NOTICE && this.world.lineOfSight(enemy.x, enemy.z, player.x, player.z)) enemy.alerted = true;
        else continue;
      }
      if (this.health <= 0 || distance < 0.01) continue;
      enemy.heading = Math.atan2(-dx, -dz);
      const ux = dx / distance;
      const uz = dz / distance;

      const sees = distance < ENEMY_SHOT_RANGE && this.world.lineOfSight(enemy.x, enemy.z, player.x, player.z);
      if (enemy.armed && sees && distance > 5) {
        // Stand and shoot. Moving, distant and in-vehicle targets are harder to hit.
        if (enemy.cooldown === 0) {
          enemy.cooldown = ENEMY_SHOT_INTERVAL * (0.8 + this.random() * 0.4);
          let chance = ENEMY_ACCURACY * (1 - distance / (ENEMY_SHOT_RANGE * 1.6));
          if (player.speed > 3) chance *= 0.6;
          if (player.inVehicle) chance *= 0.5;
          const hit = this.random() < chance;
          events.push({ type: "enemyShot", fromX: enemy.x, fromZ: enemy.z, toX: player.x, toZ: player.z, hit });
          if (hit) this.hurtPlayer(ENEMY_SHOT_DAMAGE, events);
        }
        continue;
      }
      if (distance <= ENEMY_PUNCH_RANGE) {
        if (enemy.cooldown === 0 && !player.inVehicle) {
          enemy.cooldown = 1.3;
          events.push({ type: "enemyPunch", enemy });
          this.hurtPlayer(enemy.armed ? ENEMY_PUNCH_DAMAGE * 0.7 : ENEMY_PUNCH_DAMAGE, events);
        }
        continue;
      }
      // Close in, stepping round walls rather than walking into them.
      const step = ENEMY_SPEED * dt;
      let moveX = ux;
      let moveZ = uz;
      if (this.world.wallDistance(enemy.x, enemy.z, ux, uz, 1.2) !== null) {
        const side = enemy.id % 2 === 0 ? 1 : -1;
        moveX = -uz * side;
        moveZ = ux * side;
        if (this.world.wallDistance(enemy.x, enemy.z, moveX, moveZ, 1.2) !== null) continue;
      }
      // Keep a little apart from the others so a group doesn't stand in one spot.
      let crowded = false;
      for (const other of this.enemies) {
        if (other === enemy || other.health <= 0) continue;
        const ahead = (other.x - enemy.x) * moveX + (other.z - enemy.z) * moveZ;
        if (ahead > 0 && Math.hypot(other.x - enemy.x, other.z - enemy.z) < 0.9) crowded = true;
      }
      if (crowded) continue;
      enemy.x += moveX * step;
      enemy.z += moveZ * step;
      enemy.speed = ENEMY_SPEED;
    }
    return events;
  }
}
