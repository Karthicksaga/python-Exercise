import { Arsenal, WEAPONS, hitDamage, strayAngle, type WeaponId, type WeaponSpec } from "./Weapons";
import { GANG_RULES, hearsGunshot, lingerStep } from "./Gangs";
import { KNOCK_BACK, STAGGER_TIME, STRIKES, knockBackRoom, strikeKind } from "./Strikes";

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
  /**
   * Distance from a person's own centre to the nearest building, tree or vehicle in a direction,
   * passing through people; null when clear for `max` metres. Used for walking: unlike
   * `wallDistance` it has no blind spot right in front of the person.
   */
  solidDistance(x: number, z: number, dx: number, dz: number, max: number): number | null;
}

export interface EnemySpot {
  readonly x: number;
  readonly z: number;
  /** Armed enemies shoot from a distance; unarmed ones close in and punch. */
  readonly armed: boolean;
  readonly health?: number;
  /** What they carry; a gun when armed (the pistol if not given), otherwise fists or a bat. */
  readonly weapon?: WeaponId;
  /** Clothing tint (a gang's colours); the game's default enemy colours when omitted. */
  readonly tint?: number;
  /** Gang members on their corner: they ignore the player until provoked (see `Gangs.ts`). */
  readonly calm?: boolean;
}

export interface Enemy {
  readonly id: number;
  readonly group: string;
  readonly armed: boolean;
  readonly maxHealth: number;
  readonly weapon: WeaponId;
  readonly tint: number | undefined;
  /** True while a gang member is calm: not watching for the player, not attacking. */
  calm: boolean;
  /** Seconds of unease about an armed player close by (calm gang members only). */
  unease: number;
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
  /** Seconds until this enemy's punch or swing lands (it has started it), or 0. */
  windup: number;
  /** Seconds left of being knocked back by a blow, and the push (m/s) meanwhile. */
  stagger: number;
  pushX: number;
  pushZ: number;
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
  /** A weapon in hand (a loaded gun or the bat): makes gang members uneasy. */
  readonly armed?: boolean;
}

export type CombatEvent =
  | { readonly type: "enemyShot"; readonly fromX: number; readonly fromZ: number; readonly toX: number; readonly toZ: number; readonly hit: boolean }
  /** An enemy starts a punch or a bat swing; it lands (`enemyPunch`) after its wind-up, if the player is still in reach. */
  | { readonly type: "enemySwing"; readonly enemy: Enemy }
  /** An enemy's punch or swing lands on the player. */
  | { readonly type: "enemyPunch"; readonly enemy: Enemy }
  | { readonly type: "enemyDown"; readonly enemy: Enemy }
  | { readonly type: "groupCleared"; readonly group: string }
  | { readonly type: "playerHurt"; readonly amount: number }
  | { readonly type: "playerDied" }
  /** The player fired a gun (for the wanted level, and gang members who hear it). */
  | { readonly type: "playerShot"; readonly x: number; readonly z: number; readonly weapon: WeaponId }
  /** A calm crew is getting uneasy about an armed player (a warning before it turns). */
  | { readonly type: "crewWarning"; readonly group: string }
  /** A calm crew turned on the player. */
  | { readonly type: "crewProvoked"; readonly group: string };

export interface Pellet {
  /** Where the bullet or pellet ended, for drawing the tracer. */
  readonly toX: number;
  readonly toZ: number;
  readonly hit: Enemy | null;
}

export interface ShotResult extends Pellet {
  readonly fired: boolean;
  /** The gun fired, or null when nothing was fired. */
  readonly weapon: WeaponId | null;
  /** Every pellet (one for single-shot guns); the fields above are the first that hit, else the first. */
  readonly pellets: readonly Pellet[];
}

/** How enemies use each gun. Game-design estimates. */
interface EnemyGun {
  readonly damage: number;
  readonly range: number;
  readonly interval: number;
  /** Chance that a shot hits a player standing still at short range. */
  readonly accuracy: number;
}
export const ENEMY_GUNS: Readonly<Partial<Record<WeaponId, EnemyGun>>> = {
  // The pistol keeps the values enemies had before there were other weapons.
  pistol: { damage: 7, range: 22, interval: 1.5, accuracy: 0.45 },
  shotgun: { damage: 15, range: 11, interval: 2.2, accuracy: 0.6 },
  smg: { damage: 4, range: 20, interval: 0.55, accuracy: 0.3 },
};
/** An enemy's punch or bat swing (estimates; the punch is the value from before). */
export const ENEMY_MELEE: Readonly<Partial<Record<WeaponId, number>>> = { fists: 6, bat: 10 };
/** Half the width of a person, metres: a pellet passing closer than this to someone hits them. */
const BODY_HALF_WIDTH = 0.35;
/** Front to centre of a person's collision box, with a margin (metres). */
const BODY_DEPTH = 0.45;

export const PLAYER_MAX_HEALTH = 100;
const ENEMY_HEALTH = 100;
const ENEMY_NOTICE = 28; // metres at which an enemy notices the player
const ENEMY_SPEED = 3.4;
/** How far ahead (from the centre) an enemy looks for walls before stepping: body half-width 0.28 m plus a margin. */
const WALL_LOOKAHEAD = 0.9;
const ENEMY_PUNCH_RANGE = 1.7;
/** An enemy's blow still lands if the player is this much further away by then (arm's reach). */
const ENEMY_REACH_MARGIN = 0.6;
const REGEN_DELAY = 6;
const REGEN_RATE = 7;
const RUN_OVER_SPEED = 4;
/** Seconds a fallen enemy stays on the ground before being removed. */
const DOWN_TIME = 5;

const angleBetween = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export class Combat {
  health = PLAYER_MAX_HEALTH;
  /** The player's weapons and rounds (`Weapons.ts`). */
  readonly arsenal = new Arsenal();
  readonly enemies: Enemy[] = [];
  private nextId = 1;
  private sinceHurt = 99;
  private readonly random: () => number;

  /** Pistol rounds (the stages issue these for armed fights). */
  get ammo(): number {
    return this.arsenal.ammoOf("pistol");
  }

  set ammo(rounds: number) {
    this.arsenal.setAmmo("pistol", rounds);
  }

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
      // A gun for the armed, fists or a bat for the rest, whatever the spot asked for.
      const asked = spot.weapon && (WEAPONS[spot.weapon].kind === "gun") === spot.armed ? spot.weapon : null;
      const weapon = asked ?? (spot.armed ? "pistol" : "fists");
      this.enemies.push({ id: this.nextId++, group, armed: spot.armed, maxHealth: health, weapon, tint: spot.tint, calm: spot.calm === true, unease: 0, x: spot.x, z: spot.z, heading: 0, health, speed: 0, alerted: false, cooldown: 1, downFor: -1, windup: 0, stagger: 0, pushX: 0, pushZ: 0 });
    }
  }

  /** Take a group off the map at once (a gang crew the player has walked away from). */
  removeGroup(group: string): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i]!.group === group) this.enemies.splice(i, 1);
  }

  /** A calm group turns on the player: every member notices them and attacks. */
  provoke(group: string, events: CombatEvent[]): void {
    let changed = false;
    for (const enemy of this.enemies) {
      if (enemy.group !== group || enemy.health <= 0) continue;
      if (enemy.calm) changed = true;
      enemy.calm = false;
      enemy.alerted = true;
      enemy.unease = 0;
    }
    if (changed) events.push({ type: "crewProvoked", group });
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

  /**
   * @param knock a push away from whoever hit them (unit direction and metres): the person
   *   staggers back over `STAGGER_TIME`, never into a wall (`knockBackRoom`)
   */
  private damageEnemy(enemy: Enemy, amount: number, events: CombatEvent[], knock?: { dx: number; dz: number; distance: number }): void {
    if (enemy.health <= 0) return;
    enemy.health = Math.max(0, enemy.health - amount);
    if (knock && knock.distance > 0) {
      enemy.stagger = STAGGER_TIME;
      enemy.pushX = (knock.dx * knock.distance) / STAGGER_TIME;
      enemy.pushZ = (knock.dz * knock.distance) / STAGGER_TIME;
    }
    // Hitting one of a calm crew turns all of them.
    if (enemy.calm) this.provoke(enemy.group, events);
    enemy.alerted = true;
    if (enemy.health > 0) return;
    enemy.downFor = 0;
    enemy.speed = 0;
    events.push({ type: "enemyDown", enemy });
    if (this.remaining(enemy.group) === 0) events.push({ type: "groupCleared", group: enemy.group });
  }

  /** Throw a punch. Returns the enemy hit, null for a miss, or undefined when still recovering. */
  punch(player: PlayerState, events: CombatEvent[]): Enemy | null | undefined {
    if (player.inVehicle) return undefined;
    // Fists, or the bat once the player has one.
    const melee = this.arsenal.trySwing();
    if (!melee) return undefined;
    let best: Enemy | null = null;
    let bestDistance = melee.range;
    for (const enemy of this.enemies) {
      if (enemy.health <= 0) continue;
      const distance = Math.hypot(enemy.x - player.x, enemy.z - player.z);
      const bearing = Math.atan2(-(enemy.x - player.x), -(enemy.z - player.z));
      // Anyone close and roughly in front.
      if (distance < bestDistance && angleBetween(bearing, player.heading) < melee.aimAssist) {
        best = enemy;
        bestDistance = distance;
      }
    }
    if (best) this.damageEnemy(best, melee.damage, events, this.knock(player, best, KNOCK_BACK[strikeKind(melee.id)]));
    return best;
  }

  /**
   * Fire the gun in hand the way the player faces, with a little aim assistance. A gun with no
   * spread (the pistol) puts its bullet on the enemy the assistance picks, as it always did; the
   * shotgun's pellets and the SMG's bullets stray at random within the gun's spread and hit
   * whoever they pass, so they miss more the further away the target is.
   */
  shoot(player: PlayerState, events: CombatEvent[]): ShotResult {
    const straight: ShotResult = { fired: false, weapon: null, toX: player.x, toZ: player.z, hit: null, pellets: [] };
    if (player.inVehicle) return straight;
    const gun = this.arsenal.tryFire();
    if (!gun) return straight;
    events.push({ type: "playerShot", x: player.x, z: player.z, weapon: gun.id });
    // Gang members within earshot turn on the player.
    for (const enemy of this.enemies) {
      if (enemy.calm && enemy.health > 0 && hearsGunshot(enemy.x, enemy.z, player.x, player.z)) this.provoke(enemy.group, events);
    }

    const target = this.assisted(player, gun);
    const aim = target ? Math.atan2(-(target.x - player.x), -(target.z - player.z)) : player.heading;
    const pellets: Pellet[] = [];
    for (let i = 0; i < gun.pellets; i++) {
      if (gun.spread === 0 && target) {
        this.damageEnemy(target, hitDamage(gun, Math.hypot(target.x - player.x, target.z - player.z)), events, this.knock(player, target, KNOCK_BACK.shot));
        pellets.push({ toX: target.x, toZ: target.z, hit: target });
      } else {
        // Nobody in the sights, or a gun that strays: the shot flies until it meets someone or a wall.
        pellets.push(this.pellet(player, gun, gun.spread === 0 ? aim : strayAngle(gun, aim, this.random()), events));
      }
    }
    const first = pellets.find((p) => p.hit) ?? pellets[0]!;
    return { fired: true, weapon: gun.id, toX: first.toX, toZ: first.toZ, hit: first.hit, pellets };
  }

  /** The standing enemy in range and in sight closest to where the player faces, within the gun's aim assistance. */
  private assisted(player: PlayerState, gun: WeaponSpec): Enemy | null {
    let target: Enemy | null = null;
    let bestAngle = gun.aimAssist;
    for (const enemy of this.enemies) {
      if (enemy.health <= 0) continue;
      const distance = Math.hypot(enemy.x - player.x, enemy.z - player.z);
      if (distance > gun.range || distance < 0.3) continue;
      const bearing = Math.atan2(-(enemy.x - player.x), -(enemy.z - player.z));
      const off = angleBetween(bearing, player.heading);
      if (off < bestAngle && this.world.lineOfSight(player.x, player.z, enemy.x, enemy.z)) {
        target = enemy;
        bestAngle = off;
      }
    }
    return target;
  }

  /** One bullet or pellet along `angle`: it hits the nearest person it passes within a body's width of, before any wall. */
  private pellet(player: PlayerState, gun: WeaponSpec, angle: number, events: CombatEvent[]): Pellet {
    const dx = -Math.sin(angle);
    const dz = -Math.cos(angle);
    const wall = Math.min(gun.range, this.world.wallDistance(player.x, player.z, dx, dz, gun.range) ?? gun.range);
    let hit: Enemy | null = null;
    let nearest = wall;
    for (const enemy of this.enemies) {
      if (enemy.health <= 0) continue;
      const ex = enemy.x - player.x;
      const ez = enemy.z - player.z;
      const along = ex * dx + ez * dz;
      // The ray that measured the wall also stops at people's own collision boxes, just in front of
      // them: someone up to a body's depth past the "wall" is that box, and is hit.
      if (along <= 0.3 || along >= nearest + BODY_DEPTH) continue;
      if (Math.abs(ex * dz - ez * dx) <= BODY_HALF_WIDTH) {
        hit = enemy;
        nearest = along;
      }
    }
    if (!hit) return { toX: player.x + dx * wall, toZ: player.z + dz * wall, hit: null };
    this.damageEnemy(hit, hitDamage(gun, nearest), events, this.knock(player, hit, KNOCK_BACK.shot));
    return { toX: hit.x, toZ: hit.z, hit };
  }

  /** A push straight away from the player. */
  private knock(player: { x: number; z: number }, enemy: Enemy, distance: number): { dx: number; dz: number; distance: number } {
    const dx = enemy.x - player.x;
    const dz = enemy.z - player.z;
    const length = Math.hypot(dx, dz);
    return length < 1e-6 ? { dx: 0, dz: 0, distance: 0 } : { dx: dx / length, dz: dz / length, distance };
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
    this.arsenal.tick(dt);
    this.sinceHurt += dt;
    if (this.health > 0 && this.sinceHurt > REGEN_DELAY) this.health = Math.min(PLAYER_MAX_HEALTH, this.health + REGEN_RATE * dt);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i]!;
      if (enemy.stagger > 0) {
        // Knocked back by a blow: a short step away, stopping at walls; nothing else meanwhile.
        const step = Math.min(dt, enemy.stagger);
        enemy.stagger -= step;
        const speed = Math.hypot(enemy.pushX, enemy.pushZ);
        if (speed > 0) {
          const room = knockBackRoom(this.world, enemy.x, enemy.z, enemy.pushX / speed, enemy.pushZ / speed, speed * step);
          enemy.x += (enemy.pushX / speed) * room;
          enemy.z += (enemy.pushZ / speed) * room;
        }
        if (enemy.health > 0) {
          enemy.cooldown = Math.max(0, enemy.cooldown - dt);
          enemy.speed = 0;
          continue;
        }
      }
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
      if (enemy.calm) {
        // A gang member on their corner: uneasy about an armed player close by, and turns on
        // them after a while (with a warning first).
        const before = enemy.unease;
        const step = lingerStep(enemy.unease, player.inVehicle ? Infinity : distance, player.armed === true, dt);
        enemy.unease = step.unease;
        if (enemy.unease > 0 && distance > 0.01) enemy.heading = Math.atan2(-dx, -dz);
        if (step.provoked) this.provoke(enemy.group, events);
        else if (before < GANG_RULES.warnAt && enemy.unease >= GANG_RULES.warnAt && !events.some((e) => e.type === "crewWarning" && e.group === enemy.group)) {
          // One warning per crew, however many of them noticed.
          events.push({ type: "crewWarning", group: enemy.group });
        }
        if (enemy.calm) continue;
      }
      if (!enemy.alerted) {
        if (distance < ENEMY_NOTICE && this.world.lineOfSight(enemy.x, enemy.z, player.x, player.z)) enemy.alerted = true;
        else continue;
      }
      if (this.health <= 0 || distance < 0.01) continue;
      enemy.heading = Math.atan2(-dx, -dz);
      if (enemy.windup > 0) {
        // A punch or swing on its way: it lands when the wind-up ends, if the player is still in reach.
        enemy.windup = Math.max(0, enemy.windup - dt);
        if (enemy.windup === 0 && !player.inVehicle && distance <= ENEMY_PUNCH_RANGE + ENEMY_REACH_MARGIN) {
          events.push({ type: "enemyPunch", enemy });
          // Someone with a gun up close hits with it, a little softer than a fist (as before).
          const fist = ENEMY_MELEE.fists!;
          this.hurtPlayer(enemy.armed ? fist * 0.7 : (ENEMY_MELEE[enemy.weapon] ?? fist), events);
        }
        continue;
      }
      const ux = dx / distance;
      const uz = dz / distance;

      const gun = enemy.armed ? (ENEMY_GUNS[enemy.weapon] ?? ENEMY_GUNS.pistol!) : null;
      const sees = gun !== null && distance < gun.range && this.world.lineOfSight(enemy.x, enemy.z, player.x, player.z);
      if (gun && sees && distance > 5) {
        // Stand and shoot. Moving, distant and in-vehicle targets are harder to hit.
        if (enemy.cooldown === 0) {
          enemy.cooldown = gun.interval * (0.8 + this.random() * 0.4);
          let chance = gun.accuracy * (1 - distance / (gun.range * 1.6));
          if (player.speed > 3) chance *= 0.6;
          if (player.inVehicle) chance *= 0.5;
          const hit = this.random() < chance;
          events.push({ type: "enemyShot", fromX: enemy.x, fromZ: enemy.z, toX: player.x, toZ: player.z, hit });
          if (hit) this.hurtPlayer(gun.damage, events);
        }
        continue;
      }
      if (distance <= ENEMY_PUNCH_RANGE) {
        if (enemy.cooldown === 0 && !player.inVehicle) {
          enemy.cooldown = 1.3;
          // The blow lands after the wind-up the figure shows (`Strikes.ts`).
          enemy.windup = STRIKES[strikeKind(enemy.weapon)].windup;
          events.push({ type: "enemySwing", enemy });
        }
        continue;
      }
      // Close in, stepping round walls rather than walking into them. Measured from the enemy's
      // own centre: a wall closer than the body's front plus a margin blocks the way.
      const step = ENEMY_SPEED * dt;
      let moveX = ux;
      let moveZ = uz;
      if (this.world.solidDistance(enemy.x, enemy.z, ux, uz, WALL_LOOKAHEAD) !== null) {
        const side = enemy.id % 2 === 0 ? 1 : -1;
        moveX = -uz * side;
        moveZ = ux * side;
        if (this.world.solidDistance(enemy.x, enemy.z, moveX, moveZ, WALL_LOOKAHEAD) !== null) continue;
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
