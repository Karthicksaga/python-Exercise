/**
 * The player's weapons: what each one does, and the arsenal (which weapons are owned, the rounds
 * for each gun, the gun in hand and the time until the next shot or swing). Pure logic.
 *
 * Every number here is a game-design estimate, chosen so each weapon has a clear role against
 * enemies with 100 health: fists take three punches, the bat two swings; the pistol is the
 * all-rounder, the shotgun knocks down anyone close in one blast but is useless past a street's
 * width, and the SMG empties fast and sprays at range. None is a measured real-world figure.
 */

export type WeaponId = "fists" | "bat" | "pistol" | "shotgun" | "smg";
/** Guns are fired with FIRE; melee weapons are swung with HIT. */
export type WeaponKind = "melee" | "gun";

export interface WeaponSpec {
  readonly id: WeaponId;
  /** Shown on the weapon button and in messages. */
  readonly name: string;
  readonly kind: WeaponKind;
  /** Health taken from an enemy by one hit (one pellet for the shotgun), at full strength. */
  readonly damage: number;
  /** Metres: a melee weapon's reach, a gun's longest shot. */
  readonly range: number;
  /** Seconds between shots or swings. */
  readonly interval: number;
  /** Pellets per shot (1 for everything but the shotgun). */
  readonly pellets: number;
  /** Half-angle in radians that each pellet or bullet may stray from the aim, at random. */
  readonly spread: number;
  /** Shots are pulled onto an enemy within this angle (radians) of where the player faces. */
  readonly aimAssist: number;
  /** Damage is full up to this fraction of the range, then falls off linearly... */
  readonly falloffFrom: number;
  /** ...to this fraction of full damage at the end of the range. */
  readonly falloffTo: number;
  /** Most rounds the player can carry (0 for melee). */
  readonly maxAmmo: number;
  /** Rounds that come with the weapon from a pickup, a reward or the dealer. */
  readonly clip: number;
  /** Rupees at the back-street dealer, for the weapon with one clip (estimate). */
  readonly price: number;
}

const spec = (s: WeaponSpec) => s;

export const WEAPONS: Readonly<Record<WeaponId, WeaponSpec>> = {
  // Existing values from before there was a weapon table (punch 34, 1.9 m, 0.45 s).
  fists: spec({ id: "fists", name: "Fists", kind: "melee", damage: 34, range: 1.9, interval: 0.45, pellets: 1, spread: 0, aimAssist: 1.2, falloffFrom: 1, falloffTo: 1, maxAmmo: 0, clip: 0, price: 0 }),
  // A cricket bat: two swings knock someone down, slower to swing and a little more reach.
  bat: spec({ id: "bat", name: "Cricket bat", kind: "melee", damage: 50, range: 2.3, interval: 0.7, pellets: 1, spread: 0, aimAssist: 1.2, falloffFrom: 1, falloffTo: 1, maxAmmo: 0, clip: 0, price: 300 }),
  // Existing pistol values (34 damage, 45 m, 0.32 s, aim assist 0.5).
  pistol: spec({ id: "pistol", name: "Pistol", kind: "gun", damage: 34, range: 45, interval: 0.32, pellets: 1, spread: 0, aimAssist: 0.5, falloffFrom: 1, falloffTo: 1, maxAmmo: 150, clip: 24, price: 1500 }),
  // Pump shotgun: six pellets of 20 (120 point blank), full damage to 5 m, 40% at 14 m.
  shotgun: spec({ id: "shotgun", name: "Shotgun", kind: "gun", damage: 20, range: 14, interval: 0.95, pellets: 6, spread: 0.13, aimAssist: 0.4, falloffFrom: 5 / 14, falloffTo: 0.4, maxAmmo: 40, clip: 10, price: 3500 }),
  // Compact SMG: about eleven rounds a second of 14 damage, each straying up to 4 degrees.
  smg: spec({ id: "smg", name: "SMG", kind: "gun", damage: 14, range: 30, interval: 0.09, pellets: 1, spread: 0.07, aimAssist: 0.45, falloffFrom: 0.5, falloffTo: 0.6, maxAmmo: 360, clip: 90, price: 5000 }),
};

/** Guns in the order the weapon button cycles through them. */
export const GUNS: readonly WeaponId[] = ["pistol", "shotgun", "smg"];

/** How much of a weapon's damage still lands at a distance: 1 near, down to `falloffTo` at its range, 0 beyond. */
export function damageFactor(weapon: WeaponSpec, distance: number): number {
  if (distance > weapon.range) return 0;
  const full = weapon.range * weapon.falloffFrom;
  if (distance <= full) return 1;
  const t = (distance - full) / Math.max(1e-6, weapon.range - full);
  return 1 + (weapon.falloffTo - 1) * t;
}

/** Damage of one hit (one pellet) at a distance, rounded to whole health points. */
export function hitDamage(weapon: WeaponSpec, distance: number): number {
  return Math.round(weapon.damage * damageFactor(weapon, distance));
}

/** A pellet's direction: the aim plus a random stray within the weapon's spread. @param roll in [0, 1) */
export function strayAngle(weapon: WeaponSpec, aim: number, roll: number): number {
  return aim + (roll * 2 - 1) * weapon.spread;
}

/** What is saved: the guns and bat owned, rounds per gun, and the gun in hand. */
export interface ArsenalSave {
  readonly owned: readonly WeaponId[];
  readonly ammo: Partial<Record<WeaponId, number>>;
  readonly gun: WeaponId;
}

const isWeapon = (id: unknown): id is WeaponId => typeof id === "string" && id in WEAPONS;

export class Arsenal {
  private readonly owned = new Set<WeaponId>(["fists", "pistol"]);
  private readonly rounds = new Map<WeaponId, number>();
  private current: WeaponId = "pistol";
  private gunCooldown = 0;
  private meleeCooldown = 0;

  /** Fists and the pistol (with no rounds) are always there; the rest come from the world. */
  has(id: WeaponId): boolean {
    return this.owned.has(id);
  }

  /** The gun in hand. */
  get gun(): WeaponSpec {
    return WEAPONS[this.current];
  }

  /** What HIT swings: the bat once it is owned (it does everything fists do, harder). */
  get melee(): WeaponSpec {
    return this.owned.has("bat") ? WEAPONS.bat : WEAPONS.fists;
  }

  ammoOf(id: WeaponId): number {
    return this.rounds.get(id) ?? 0;
  }

  /** Set a gun's rounds, kept within 0 and what can be carried. */
  setAmmo(id: WeaponId, rounds: number): void {
    const max = WEAPONS[id].maxAmmo;
    this.rounds.set(id, Math.max(0, Math.min(max, Math.floor(rounds))));
  }

  /**
   * Add a weapon (or more rounds for one already owned). Returns the rounds actually added,
   * which is less than asked when the player already carries close to the most.
   */
  give(id: WeaponId, rounds: number = WEAPONS[id].clip): number {
    this.owned.add(id);
    if (WEAPONS[id].kind === "melee") return 0;
    const before = this.ammoOf(id);
    this.setAmmo(id, before + rounds);
    return this.ammoOf(id) - before;
  }

  /** Guns owned, in button order. */
  guns(): WeaponId[] {
    return GUNS.filter((id) => this.owned.has(id));
  }

  /** Switch to the next owned gun (the weapon button). Returns the gun now in hand. */
  cycle(): WeaponId {
    const guns = this.guns();
    const at = guns.indexOf(this.current);
    this.current = guns[(at + 1) % guns.length] ?? "pistol";
    // A new gun is raised before it fires: a short pause stops switching from beating the fire rate.
    this.gunCooldown = Math.max(this.gunCooldown, 0.25);
    return this.current;
  }

  /** Take a particular owned gun in hand. False when it is not owned or not a gun. */
  select(id: WeaponId): boolean {
    if (!this.owned.has(id) || WEAPONS[id].kind !== "gun") return false;
    this.current = id;
    return true;
  }

  /** Count down the time to the next shot and swing. */
  tick(dt: number): void {
    this.gunCooldown = Math.max(0, this.gunCooldown - dt);
    this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
  }

  /** Fire the gun in hand if it is ready and loaded: uses one round. */
  tryFire(): WeaponSpec | null {
    const gun = this.gun;
    if (this.gunCooldown > 0 || this.ammoOf(gun.id) <= 0) return null;
    this.gunCooldown = gun.interval;
    this.rounds.set(gun.id, this.ammoOf(gun.id) - 1);
    return gun;
  }

  /** Seconds until the next swing or punch may land (0: ready). */
  get meleeReadyIn(): number {
    return this.meleeCooldown;
  }

  /** Swing (or punch) if recovered from the last one. */
  trySwing(): WeaponSpec | null {
    if (this.meleeCooldown > 0) return null;
    const melee = this.melee;
    this.meleeCooldown = melee.interval;
    return melee;
  }

  save(): ArsenalSave {
    const ammo: Partial<Record<WeaponId, number>> = {};
    for (const id of GUNS) if (this.ammoOf(id) > 0) ammo[id] = this.ammoOf(id);
    return { owned: [...this.owned], ammo, gun: this.current };
  }

  /** Restore a save; anything unknown or damaged is ignored. */
  load(data: unknown): void {
    this.reset();
    if (data === null || typeof data !== "object") return;
    const save = data as Partial<Record<keyof ArsenalSave, unknown>>;
    if (Array.isArray(save.owned)) for (const id of save.owned) if (isWeapon(id)) this.owned.add(id);
    if (save.ammo && typeof save.ammo === "object") {
      for (const [id, rounds] of Object.entries(save.ammo)) if (isWeapon(id) && typeof rounds === "number") this.setAmmo(id, rounds);
    }
    if (isWeapon(save.gun)) this.select(save.gun);
  }

  /** Back to a new game's fists and empty pistol. */
  reset(): void {
    this.owned.clear();
    this.owned.add("fists");
    this.owned.add("pistol");
    this.rounds.clear();
    this.current = "pistol";
    this.gunCooldown = 0;
    this.meleeCooldown = 0;
  }
}
