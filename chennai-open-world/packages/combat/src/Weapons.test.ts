import { describe, expect, it } from "vitest";
import { Combat, type CombatEvent, type CombatWorld, type PlayerState } from "./Combat";
import { Arsenal, GUNS, WEAPONS, damageFactor, hitDamage, strayAngle } from "./Weapons";
import { PICKUP_RADIUS, PICKUP_RESPAWN, WeaponPickups } from "./Pickups";

const open: CombatWorld = { lineOfSight: () => true, wallDistance: () => null, solidDistance: () => null };
const player = (over: Partial<PlayerState> = {}): PlayerState => ({ x: 0, z: 0, heading: 0, inVehicle: false, speed: 0, ...over });
/** A random source that returns the given values in turn, then repeats the last. */
const rolls = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
};

describe("weapon table", () => {
  it("gives each weapon a distinct role", () => {
    const { fists, bat, pistol, shotgun, smg } = WEAPONS;
    // Melee: the bat hits harder and reaches further than fists, but swings slower.
    expect(bat.damage).toBeGreaterThan(fists.damage);
    expect(bat.range).toBeGreaterThan(fists.range);
    expect(bat.interval).toBeGreaterThan(fists.interval);
    // Shotgun: most damage per shot close up, shortest gun range, slowest to fire.
    expect(shotgun.damage * shotgun.pellets).toBeGreaterThan(pistol.damage * 3);
    expect(shotgun.range).toBeLessThan(smg.range);
    expect(shotgun.range).toBeLessThan(pistol.range);
    expect(shotgun.interval).toBeGreaterThan(pistol.interval);
    // SMG: fastest, strays, and carries the most rounds.
    expect(smg.interval).toBeLessThan(pistol.interval / 3);
    expect(smg.spread).toBeGreaterThan(0);
    expect(pistol.spread).toBe(0);
    expect(smg.maxAmmo).toBeGreaterThan(pistol.maxAmmo);
    expect(GUNS).toEqual(["pistol", "shotgun", "smg"]);
  });

  it("damage stays full near, falls off to the stated fraction at the range, and is zero beyond", () => {
    const { shotgun, pistol, smg } = WEAPONS;
    expect(damageFactor(shotgun, 2)).toBe(1);
    expect(damageFactor(shotgun, 5)).toBeCloseTo(1, 6);
    expect(damageFactor(shotgun, 14)).toBeCloseTo(0.4, 6);
    expect(damageFactor(shotgun, 9.5)).toBeCloseTo(0.7, 6); // halfway down the slope
    expect(damageFactor(shotgun, 14.1)).toBe(0);
    expect(hitDamage(shotgun, 3)).toBe(20);
    expect(hitDamage(shotgun, 14)).toBe(8);
    expect(hitDamage(pistol, 40)).toBe(34); // the pistol never falls off within its range
    expect(hitDamage(smg, 30)).toBe(Math.round(14 * 0.6));
  });

  it("strays within the spread, both ways", () => {
    const { smg, pistol } = WEAPONS;
    expect(strayAngle(smg, 1, 0)).toBeCloseTo(1 - smg.spread, 9);
    expect(strayAngle(smg, 1, 0.5)).toBeCloseTo(1, 9);
    expect(strayAngle(smg, 1, 0.999999)).toBeCloseTo(1 + smg.spread, 5);
    expect(strayAngle(pistol, 1, 0.9)).toBe(1);
  });
});

describe("Arsenal", () => {
  it("starts with fists and an empty pistol", () => {
    const arsenal = new Arsenal();
    expect(arsenal.has("fists") && arsenal.has("pistol")).toBe(true);
    expect(arsenal.has("shotgun")).toBe(false);
    expect(arsenal.gun.id).toBe("pistol");
    expect(arsenal.melee.id).toBe("fists");
    expect(arsenal.tryFire()).toBeNull(); // no rounds
  });

  it("uses one round per shot and waits the fire interval between shots", () => {
    const arsenal = new Arsenal();
    arsenal.give("shotgun", 3);
    expect(arsenal.select("shotgun")).toBe(true);
    expect(arsenal.tryFire()?.id).toBe("shotgun");
    expect(arsenal.ammoOf("shotgun")).toBe(2);
    expect(arsenal.tryFire()).toBeNull(); // still pumping
    arsenal.tick(WEAPONS.shotgun.interval - 0.01);
    expect(arsenal.tryFire()).toBeNull();
    arsenal.tick(0.02);
    expect(arsenal.tryFire()).not.toBeNull();
    arsenal.tick(1);
    expect(arsenal.tryFire()).not.toBeNull();
    arsenal.tick(1);
    expect(arsenal.tryFire()).toBeNull(); // empty
    expect(arsenal.ammoOf("shotgun")).toBe(0);
  });

  it("the SMG fires about eleven rounds a second", () => {
    const arsenal = new Arsenal();
    arsenal.give("smg", 100);
    arsenal.select("smg");
    let shots = 0;
    for (let i = 0; i < 60; i++) {
      if (arsenal.tryFire()) shots++;
      arsenal.tick(1 / 60);
    }
    expect(shots).toBeGreaterThanOrEqual(10);
    expect(shots).toBeLessThanOrEqual(12);
    expect(arsenal.ammoOf("smg")).toBe(100 - shots);
  });

  it("caps rounds at what can be carried and reports what was added", () => {
    const arsenal = new Arsenal();
    expect(arsenal.give("shotgun")).toBe(WEAPONS.shotgun.clip);
    expect(arsenal.give("shotgun", 1000)).toBe(WEAPONS.shotgun.maxAmmo - WEAPONS.shotgun.clip);
    expect(arsenal.ammoOf("shotgun")).toBe(WEAPONS.shotgun.maxAmmo);
    expect(arsenal.give("shotgun", 5)).toBe(0);
  });

  it("cycles through the guns owned, in order, and pauses before the new gun fires", () => {
    const arsenal = new Arsenal();
    expect(arsenal.cycle()).toBe("pistol"); // only the pistol: stays
    arsenal.give("smg", 10);
    arsenal.give("shotgun", 10);
    expect(arsenal.guns()).toEqual(["pistol", "shotgun", "smg"]);
    expect(arsenal.cycle()).toBe("shotgun");
    expect(arsenal.tryFire()).toBeNull(); // being raised
    arsenal.tick(0.3);
    expect(arsenal.tryFire()?.id).toBe("shotgun");
    expect(arsenal.cycle()).toBe("smg");
    expect(arsenal.cycle()).toBe("pistol");
    expect(arsenal.select("bat")).toBe(false); // the bat is swung with HIT, not selected
  });

  it("swings the bat once owned, at its own pace", () => {
    const arsenal = new Arsenal();
    expect(arsenal.trySwing()?.id).toBe("fists");
    arsenal.tick(1);
    arsenal.give("bat");
    expect(arsenal.trySwing()?.id).toBe("bat");
    arsenal.tick(WEAPONS.bat.interval - 0.05);
    expect(arsenal.trySwing()).toBeNull();
  });

  it("saves and loads, ignoring damaged data", () => {
    const arsenal = new Arsenal();
    arsenal.give("shotgun", 7);
    arsenal.give("bat");
    arsenal.select("shotgun");
    const copy = new Arsenal();
    copy.load(JSON.parse(JSON.stringify(arsenal.save())));
    expect(copy.ammoOf("shotgun")).toBe(7);
    expect(copy.has("bat")).toBe(true);
    expect(copy.gun.id).toBe("shotgun");
    copy.load({ owned: ["rocket", 3], ammo: { pistol: "many", smg: 9999 }, gun: "rocket" });
    expect(copy.has("bat")).toBe(false);
    expect(copy.ammoOf("smg")).toBe(WEAPONS.smg.maxAmmo); // capped, though not owned yet
    expect(copy.gun.id).toBe("pistol");
    copy.load(null);
    expect(copy.guns()).toEqual(["pistol"]);
  });
});

describe("Combat with the new weapons", () => {
  it("the shotgun knocks down a close enemy in one blast but only wounds at the edge of its range", () => {
    const combat = new Combat(open, () => 0.5); // every pellet flies true
    combat.arsenal.give("shotgun", 5);
    combat.arsenal.select("shotgun");
    combat.spawnGroup("near", [{ x: 0, z: -3, armed: false }]);
    const events: CombatEvent[] = [];
    const shot = combat.shoot(player(), events);
    expect(shot.weapon).toBe("shotgun");
    expect(shot.pellets).toHaveLength(6);
    expect(combat.remaining("near")).toBe(0); // 6 × 20 = 120 at 3 m
    combat.update(1, player({ x: 500 }));
    combat.spawnGroup("far", [{ x: 0, z: -13, armed: false }]);
    combat.shoot(player(), events);
    const far = combat.enemies.find((e) => e.group === "far")!;
    expect(far.health).toBe(100 - 6 * hitDamage(WEAPONS.shotgun, 13));
    expect(far.health).toBeGreaterThan(0);
  });

  it("the shotgun's pellets spread: at range most of them miss", () => {
    // Rolls 0 and 1 send pellets to the edges of the spread; at 12 m those pass beside a person.
    const combat = new Combat(open, rolls(0, 1, 0, 1, 0.5, 0.5));
    combat.arsenal.give("shotgun", 5);
    combat.arsenal.select("shotgun");
    combat.spawnGroup("a", [{ x: 0, z: -12, armed: false }]);
    const shot = combat.shoot(player(), []);
    expect(shot.pellets.filter((p) => p.hit)).toHaveLength(2);
  });

  it("the SMG's bullets stray: a straight roll hits, an edge roll at 20 m misses", () => {
    const combat = new Combat(open, rolls(0.5, 1));
    combat.arsenal.give("smg", 10);
    combat.arsenal.select("smg");
    combat.spawnGroup("a", [{ x: 0, z: -20, armed: false }]);
    expect(combat.shoot(player(), []).hit).not.toBeNull();
    combat.update(0.2, player({ x: 900 }));
    expect(combat.shoot(player(), []).hit).toBeNull();
    expect(combat.arsenal.ammoOf("smg")).toBe(8);
  });

  it("pellets hit people whose own collision box is what the wall ray meets (found in the browser test)", () => {
    // In the game the wall ray also stops at the front of the target's box, 0.28 m before its centre.
    const boxes: CombatWorld = { lineOfSight: () => true, wallDistance: (_x, _z, _dx, dz) => (dz < 0 ? 8 - 0.28 : null), solidDistance: (_x, _z, _dx, dz) => (dz < 0 ? 8 - 0.28 : null)};
    const combat = new Combat(boxes, () => 0.5);
    combat.arsenal.give("smg", 5);
    combat.arsenal.select("smg");
    combat.spawnGroup("a", [{ x: 0, z: -8, armed: false }]);
    expect(combat.shoot(player(), []).hit).not.toBeNull();
    // A real wall a metre in front of them still stops the bullet.
    const walled = new Combat({ lineOfSight: () => true, wallDistance: () => 7, solidDistance: () => 7 }, () => 0.5);
    walled.arsenal.give("smg", 5);
    walled.arsenal.select("smg");
    walled.spawnGroup("a", [{ x: 0, z: -8, armed: false }]);
    expect(walled.shoot(player(), []).hit).toBeNull();
  });

  it("a gun does not reach past its range", () => {
    const combat = new Combat(open, () => 0.5);
    combat.arsenal.give("shotgun", 5);
    combat.arsenal.select("shotgun");
    combat.spawnGroup("a", [{ x: 0, z: -16, armed: false }]);
    const shot = combat.shoot(player(), []);
    expect(shot.fired).toBe(true);
    expect(shot.hit).toBeNull();
    expect(Math.hypot(shot.toX, shot.toZ)).toBeCloseTo(WEAPONS.shotgun.range, 6);
  });

  it("every shot reports where it was fired from (for the wanted level)", () => {
    const combat = new Combat(open);
    combat.ammo = 2;
    const events: CombatEvent[] = [];
    combat.shoot(player({ x: 4, z: 5 }), events);
    expect(events).toContainEqual({ type: "playerShot", x: 4, z: 5, weapon: "pistol" });
    combat.update(1, player());
    combat.shoot(player({ inVehicle: true }), events);
    expect(events.filter((e) => e.type === "playerShot")).toHaveLength(1);
  });

  it("the bat knocks an enemy down in two swings from a little further than a fist reaches", () => {
    const combat = new Combat(open);
    combat.arsenal.give("bat");
    combat.spawnGroup("a", [{ x: 0, z: -2.1, armed: false }]);
    const events: CombatEvent[] = [];
    expect(combat.punch(player(), events)?.health).toBe(50);
    // Wait out the swing in small steps (the enemy closes in, staying in front).
    for (let i = 0; i < 45; i++) combat.update(1 / 60, player());
    combat.punch(player(), events);
    expect(combat.remaining("a")).toBe(0);
  });

  it("enemies use their own weapons: a shotgun close up hurts more than a pistol, a bat more than a fist", () => {
    const hurtBy = (weapon: "pistol" | "shotgun" | "bat" | "fists", z: number) => {
      const combat = new Combat(open, () => 0); // always hits
      combat.spawnGroup("a", [{ x: 0, z, armed: weapon === "pistol" || weapon === "shotgun", weapon }]);
      // In fixed steps: a blow lands after its wind-up, a step or more after it starts.
      for (let i = 0; i < 120; i++) combat.update(1 / 60, player());
      return 100 - combat.health;
    };
    expect(hurtBy("shotgun", -8)).toBeGreaterThan(hurtBy("pistol", -8));
    expect(hurtBy("bat", -1.2)).toBeGreaterThan(hurtBy("fists", -1.2));
  });
});

describe("WeaponPickups", () => {
  const spots = [{ id: "s", weapon: "shotgun" as const, ammo: 10, x: 10, z: 0 }];

  it("is taken by walking over it on foot, not by driving past", () => {
    const pickups = new WeaponPickups(spots);
    expect(pickups.update(0.1, 10 + PICKUP_RADIUS + 0.1, 0, true)).toHaveLength(0);
    expect(pickups.update(0.1, 10, 0, false)).toHaveLength(0);
    expect(pickups.update(0.1, 10.5, 0.5, true).map((s) => s.weapon)).toEqual(["shotgun"]);
    expect(pickups.available("s")).toBe(false);
    expect(pickups.update(0.1, 10, 0, true)).toHaveLength(0); // gone
  });

  it("comes back after a while", () => {
    const pickups = new WeaponPickups(spots);
    pickups.update(0.1, 10, 0, true);
    pickups.update(PICKUP_RESPAWN - 1, 0, 0, true);
    expect(pickups.available("s")).toBe(false);
    pickups.update(1.1, 0, 0, true);
    expect(pickups.available("s")).toBe(true);
  });
});
