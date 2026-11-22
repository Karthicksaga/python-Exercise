import { Arsenal, WEAPONS, hitDamage, strayAngle, type WeaponId, type WeaponSpec } from "./Weapons";
import { GANG_RULES, hearsGunshot, lingerStep } from "./Gangs";
import { COMBAT_FEEL, chooseAttackers, hitReaction, nextComboMove, type Civilian, type ComboMove } from "./Melee";

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
  /** Seconds left stunned by a hit: no moving or attacking. */
  stun: number;
  /** Knock-back still to travel, metres per second along x and z (decays). */
  knockX: number;
  knockZ: number;
  /** Seconds left winding up a punch or swing, or -1 when not winding up. */
  windup: number;
  /** Seconds left backing off, hurt; and whether this enemy has already backed off once. */
  retreat: number;
  retreated: boolean;
  /** Strafing or circling direction (1 or -1) and seconds until it may change. */
  strafe: number;
  strafeFor: number;
  /** Seconds since this enemy was last hit (for the hit flash and health bar), and whether that hit was heavy. */
  sinceHit: number;
  heavyHit: boolean;
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
  /** Holding BLOCK: melee hits do a fifth of their damage (bullets are not blocked). */
  readonly blocking?: boolean;
}

export type CombatEvent =
  | { readonly type: "enemyShot"; readonly fromX: number; readonly fromZ: number; readonly toX: number; readonly toZ: number; readonly hit: boolean }
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
  | { readonly type: "crewProvoked"; readonly group: string }
  /** The player's attack landed on an enemy (for the reaction, health bar and sound). */
  | { readonly type: "enemyHit"; readonly enemy: Enemy; readonly damage: number; readonly heavy: boolean; readonly weapon: WeaponId }
  /** The player's attack landed on a pedestrian; the game decides what it does to them (`attackOutcome`). */
  | { readonly type: "civilianHit"; readonly id: number; readonly damage: number; readonly heavy: boolean; readonly weapon: WeaponId; readonly fromX: number; readonly fromZ: number }
  /** An enemy is winding up a punch or swing: it lands in `COMBAT_FEEL.windup` seconds. */
  | { readonly type: "enemyWindup"; readonly enemy: Enemy }
  /** A melee hit on the player was blocked (this much damage still taken). */
  | { readonly type: "blocked"; readonly amount: number }
  /** A hit on the player missed because they were dodging. */
  | { readonly type: "dodged" };

export interface Pellet {
  /** Where the bullet or pellet ended, for drawing the tracer. */
  readonly toX: number;
  readonly toZ: number;
  readonly hit: Enemy | null;
  /** A pedestrian it hit instead, by id. */
  readonly civilian?: number;
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
  /** The last punch of the combo and seconds since the last swing. */
  private comboLast: ComboMove | null = null;
  private sinceSwing = 99;
  /** What the last swing was (for the player's animation): a combo punch or the bat. */
  lastSwing: ComboMove | "bat" | null = null;
  /** Seconds left untouchable after a dodge, and until the next dodge. */
  private dodging = 0;
  private dodgeWait = 0;
  /** Melee enemies allowed to attack now (the rest circle). */
  private attackers = new Set<number>();

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
      const id = this.nextId++;
      this.enemies.push({
        id, group, armed: spot.armed, maxHealth: health, weapon, tint: spot.tint, calm: spot.calm === true, unease: 0, x: spot.x, z: spot.z, heading: 0, health, speed: 0, alerted: false, cooldown: 1, downFor: -1,
        stun: 0, knockX: 0, knockZ: 0, windup: -1, retreat: 0, retreated: false, strafe: id % 2 === 0 ? 1 : -1, strafeFor: 1 + (id % 3) * 0.6, sinceHit: 99, heavyHit: false,
      });
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
   * A hit from the player: damage, and the hit's reaction (stunned, knocked back away from the
   * player, a wind-up interrupted). `move` names a combo punch or the bat.
   */
  private hitEnemy(enemy: Enemy, amount: number, events: CombatEvent[], from: { x: number; z: number }, weapon: WeaponId, move?: ComboMove | "bat"): void {
    if (enemy.health <= 0) return;
    const reaction = hitReaction(amount, move);
    enemy.stun = Math.max(enemy.stun, reaction.stun);
    enemy.windup = -1;
    enemy.sinceHit = 0;
    enemy.heavyHit = reaction.heavy;
    const away = Math.hypot(enemy.x - from.x, enemy.z - from.z);
    if (away > 0.01) {
      // Knock-back travels over about a fifth of a second.
      enemy.knockX = ((enemy.x - from.x) / away) * reaction.knock * 5;
      enemy.knockZ = ((enemy.z - from.z) / away) * reaction.knock * 5;
    }
    events.push({ type: "enemyHit", enemy, damage: amount, heavy: reaction.heavy, weapon });
    this.damageEnemy(enemy, amount, events);
  }

  private damageEnemy(enemy: Enemy, amount: number, events: CombatEvent[]): void {
    if (enemy.health <= 0) return;
    enemy.health = Math.max(0, enemy.health - amount);
    // Hitting one of a calm crew turns all of them.
    if (enemy.calm) this.provoke(enemy.group, events);
    enemy.alerted = true;
    if (enemy.health > 0) return;
    enemy.downFor = 0;
    enemy.speed = 0;
    events.push({ type: "enemyDown", enemy });
    if (this.remaining(enemy.group) === 0) events.push({ type: "groupCleared", group: enemy.group });
  }

  /**
   * Throw a punch (the next of the combo: jab, cross, hook) or swing the bat. Returns the enemy
   * hit, null for a miss (or a pedestrian hit, reported as a `civilianHit` event), or undefined
   * when still recovering. `lastSwing` says which move it was.
   */
  punch(player: PlayerState, events: CombatEvent[], civilians: readonly Civilian[] = []): Enemy | null | undefined {
    if (player.inVehicle || player.blocking) return undefined;
    // Fists, or the bat once the player has one.
    const melee = this.arsenal.trySwing();
    if (!melee) return undefined;
    const move: ComboMove | "bat" = melee.id === "bat" ? "bat" : nextComboMove(this.comboLast, this.sinceSwing);
    this.comboLast = move === "bat" ? null : move;
    this.sinceSwing = 0;
    this.lastSwing = move;
    const damage = melee.damage * (move === "bat" ? 1 : COMBAT_FEEL.combo[move]);
    let best: Enemy | null = null;
    let bestCivilian: Civilian | null = null;
    let bestDistance = melee.range;
    const inFront = (x: number, z: number) => {
      const distance = Math.hypot(x - player.x, z - player.z);
      const bearing = Math.atan2(-(x - player.x), -(z - player.z));
      return distance < bestDistance && angleBetween(bearing, player.heading) < melee.aimAssist ? distance : null;
    };
    for (const enemy of this.enemies) {
      if (enemy.health <= 0) continue;
      // Anyone close and roughly in front.
      const distance = inFront(enemy.x, enemy.z);
      if (distance !== null) {
        best = enemy;
        bestDistance = distance;
      }
    }
    for (const civilian of civilians) {
      const distance = inFront(civilian.x, civilian.z);
      if (distance !== null) {
        best = null;
        bestCivilian = civilian;
        bestDistance = distance;
      }
    }
    if (best) this.hitEnemy(best, damage, events, player, melee.id, move);
    else if (bestCivilian) events.push({ type: "civilianHit", id: bestCivilian.id, damage, heavy: hitReaction(damage, move).heavy, weapon: melee.id, fromX: player.x, fromZ: player.z });
    return best;
  }

  /**
   * Dodge: a moment untouchable (the game moves the player). False while the last dodge is
   * still recovering.
   */
  dodge(): boolean {
    if (this.dodgeWait > 0 || this.health <= 0) return false;
    this.dodging = COMBAT_FEEL.dodgeFor;
    this.dodgeWait = COMBAT_FEEL.dodgeEvery;
    return true;
  }

  /** True during a dodge's untouchable moment. */
  get dodgingNow(): boolean {
    return this.dodging > 0;
  }

  /**
   * Fire the gun in hand the way the player faces, with a little aim assistance. A gun with no
   * spread (the pistol) puts its bullet on the enemy the assistance picks, as it always did; the
   * shotgun's pellets and the SMG's bullets stray at random within the gun's spread and hit
   * whoever they pass, so they miss more the further away the target is.
   */
  shoot(player: PlayerState, events: CombatEvent[], civilians: readonly Civilian[] = []): ShotResult {
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
        this.hitEnemy(target, hitDamage(gun, Math.hypot(target.x - player.x, target.z - player.z)), events, player, gun.id);
        pellets.push({ toX: target.x, toZ: target.z, hit: target });
      } else {
        // Nobody in the sights, or a gun that strays: the shot flies until it meets someone or a wall.
        pellets.push(this.pellet(player, gun, gun.spread === 0 ? aim : strayAngle(gun, aim, this.random()), events, civilians));
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
  private pellet(player: PlayerState, gun: WeaponSpec, angle: number, events: CombatEvent[], civilians: readonly Civilian[] = []): Pellet {
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
    // A pedestrian nearer than any enemy the bullet would hit takes it instead.
    let civilian: Civilian | null = null;
    for (const c of civilians) {
      const ex = c.x - player.x;
      const ez = c.z - player.z;
      const along = ex * dx + ez * dz;
      if (along <= 0.3 || along >= nearest + BODY_DEPTH) continue;
      if (Math.abs(ex * dz - ez * dx) <= BODY_HALF_WIDTH) {
        civilian = c;
        nearest = along;
        hit = null;
      }
    }
    if (civilian) {
      const damage = hitDamage(gun, nearest);
      events.push({ type: "civilianHit", id: civilian.id, damage, heavy: hitReaction(damage).heavy, weapon: gun.id, fromX: player.x, fromZ: player.z });
      return { toX: civilian.x, toZ: civilian.z, hit: null, civilian: civilian.id };
    }
    if (!hit) return { toX: player.x + dx * wall, toZ: player.z + dz * wall, hit: null };
    this.hitEnemy(hit, hitDamage(gun, nearest), events, player, gun.id);
    return { toX: hit.x, toZ: hit.z, hit };
  }

  private hurtPlayer(amount: number, events: CombatEvent[], melee = false, blocking = false): void {
    if (this.health <= 0) return;
    if (this.dodging > 0) {
      events.push({ type: "dodged" });
      return;
    }
    if (melee && blocking) {
      amount *= COMBAT_FEEL.blockShare;
      events.push({ type: "blocked", amount });
    }
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
    this.sinceSwing += dt;
    this.dodging = Math.max(0, this.dodging - dt);
    this.dodgeWait = Math.max(0, this.dodgeWait - dt);
    if (this.health > 0 && this.sinceHurt > REGEN_DELAY) this.health = Math.min(PLAYER_MAX_HEALTH, this.health + REGEN_RATE * dt);

    // Melee fighters take turns: a couple attack, the rest circle and wait (`COMBAT_FEEL.attackers`).
    const brawlers = this.enemies
      .filter((e) => e.health > 0 && !e.calm && e.alerted && !e.armed)
      .map((e) => ({ id: e.id, distance: Math.hypot(player.x - e.x, player.z - e.z) }));
    this.attackers = chooseAttackers(brawlers, this.attackers);

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
      enemy.sinceHit += dt;
      enemy.strafeFor -= dt;
      if (enemy.strafeFor <= 0) {
        enemy.strafe = -enemy.strafe;
        enemy.strafeFor = 1.4 + this.random() * 1.2;
      }
      this.knockBack(enemy, dt);
      enemy.stun = Math.max(0, enemy.stun - dt);

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
      const ux = dx / distance;
      const uz = dz / distance;
      // Reeling from a hit: no moving, no attacking.
      if (enemy.stun > 0) continue;

      // A punch or swing that was wound up lands now, if the player is still in reach.
      if (enemy.windup >= 0) {
        enemy.windup -= dt;
        if (enemy.windup <= 0) {
          enemy.windup = -1;
          enemy.cooldown = 1.3;
          if (distance <= ENEMY_PUNCH_RANGE + 0.4 && !player.inVehicle) {
            events.push({ type: "enemyPunch", enemy });
            // Someone with a gun up close hits with it, a little softer than a fist (as before).
            const fist = ENEMY_MELEE.fists!;
            this.hurtPlayer(enemy.armed ? fist * 0.7 : (ENEMY_MELEE[enemy.weapon] ?? fist), events, true, player.blocking === true);
          }
        }
        continue;
      }

      // Badly hurt: back off for a while, once (not the boss).
      if (!enemy.retreated && enemy.maxHealth <= 150 && enemy.health < enemy.maxHealth * COMBAT_FEEL.retreatBelow) {
        enemy.retreated = true;
        enemy.retreat = COMBAT_FEEL.retreatFor;
      }
      if (enemy.retreat > 0) {
        enemy.retreat -= dt;
        this.walk(enemy, -ux, -uz, ENEMY_SPEED * 0.8, dt);
        continue;
      }

      const gun = enemy.armed ? (ENEMY_GUNS[enemy.weapon] ?? ENEMY_GUNS.pistol!) : null;
      const sees = gun !== null && distance < gun.range && this.world.lineOfSight(enemy.x, enemy.z, player.x, player.z);
      if (gun && sees && distance > 5) {
        // Shoot, and between shots keep a little distance and strafe. Moving, distant and
        // in-vehicle targets are harder to hit.
        if (enemy.cooldown === 0) {
          enemy.cooldown = gun.interval * (0.8 + this.random() * 0.4);
          let chance = gun.accuracy * (1 - distance / (gun.range * 1.6));
          if (player.speed > 3) chance *= 0.6;
          if (player.inVehicle) chance *= 0.5;
          const hit = this.random() < chance;
          events.push({ type: "enemyShot", fromX: enemy.x, fromZ: enemy.z, toX: player.x, toZ: player.z, hit });
          if (hit) this.hurtPlayer(gun.damage, events);
        } else if (distance < COMBAT_FEEL.gunmanSpace + 1) {
          this.walk(enemy, -ux, -uz, COMBAT_FEEL.strafeSpeed, dt);
        } else if (!this.walk(enemy, -uz * enemy.strafe, ux * enemy.strafe, COMBAT_FEEL.strafeSpeed, dt)) {
          enemy.strafe = -enemy.strafe;
        }
        continue;
      }
      if (distance <= ENEMY_PUNCH_RANGE) {
        // In reach: wind up (the player sees it coming), if it is this one's turn.
        if (enemy.cooldown === 0 && !player.inVehicle && (enemy.armed || this.attackers.has(enemy.id))) {
          enemy.windup = COMBAT_FEEL.windup;
          events.push({ type: "enemyWindup", enemy });
        }
        continue;
      }
      if (!enemy.armed && !this.attackers.has(enemy.id) && distance < COMBAT_FEEL.circleAt + 3) {
        // Not this one's turn: circle the player at a distance, sidestepping round.
        const radial = Math.max(-1, Math.min(1, distance - COMBAT_FEEL.circleAt));
        const mx = -uz * enemy.strafe + ux * radial;
        const mz = ux * enemy.strafe + uz * radial;
        const length = Math.hypot(mx, mz) || 1;
        if (!this.walk(enemy, mx / length, mz / length, COMBAT_FEEL.circleSpeed, dt)) enemy.strafe = -enemy.strafe;
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

  /** Step an enemy along a direction unless a wall is in the way; false when it could not move. */
  private walk(enemy: Enemy, dx: number, dz: number, speed: number, dt: number): boolean {
    if (this.world.solidDistance(enemy.x, enemy.z, dx, dz, WALL_LOOKAHEAD) !== null) return false;
    enemy.x += dx * speed * dt;
    enemy.z += dz * speed * dt;
    enemy.speed = speed;
    return true;
  }

  /** Slide an enemy along its knock-back, stopping at walls; it fades in about a fifth of a second. */
  private knockBack(enemy: Enemy, dt: number): void {
    const speed = Math.hypot(enemy.knockX, enemy.knockZ);
    if (speed < 0.05) {
      enemy.knockX = 0;
      enemy.knockZ = 0;
      return;
    }
    const step = speed * dt;
    if (this.world.solidDistance(enemy.x, enemy.z, enemy.knockX / speed, enemy.knockZ / speed, WALL_LOOKAHEAD + step) === null) {
      enemy.x += enemy.knockX * dt;
      enemy.z += enemy.knockZ * dt;
    }
    const fade = Math.exp(-dt * 10);
    enemy.knockX *= fade;
    enemy.knockZ *= fade;
  }
}
