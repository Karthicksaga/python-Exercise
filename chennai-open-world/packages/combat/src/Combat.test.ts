import { describe, expect, it } from "vitest";
import { Combat, PLAYER_MAX_HEALTH, type CombatEvent, type CombatWorld, type PlayerState } from "./Combat";

const open: CombatWorld = { lineOfSight: () => true, wallDistance: () => null, solidDistance: () => null };
const walled: CombatWorld = { lineOfSight: () => false, wallDistance: () => 6, solidDistance: () => 6 };
/** Player at the origin facing north (-Z). */
const player = (over: Partial<PlayerState> = {}): PlayerState => ({ x: 0, z: 0, heading: 0, inVehicle: false, speed: 0, ...over });
const run = (combat: Combat, seconds: number, p: PlayerState) => {
  const events: CombatEvent[] = [];
  for (let i = 0; i < seconds * 60; i++) events.push(...combat.update(1 / 60, p));
  return events;
};

describe("Combat", () => {
  it("punches hit only enemies close and in front, with a recovery time", () => {
    const combat = new Combat(open);
    combat.spawnGroup("a", [{ x: 0, z: -1.2, armed: false }, { x: 0, z: 1.2, armed: false }]);
    const events: CombatEvent[] = [];
    const hit = combat.punch(player(), events);
    expect(hit?.z).toBe(-1.2); // the one in front, not the one behind
    expect(hit?.health).toBe(66);
    expect(combat.punch(player(), events)).toBeUndefined(); // still recovering
    combat.update(0.5, player({ x: 500 }));
    expect(combat.punch(player({ heading: Math.PI / 2 }), events)).toBeNull(); // facing west: nobody there
  });

  it("three punches knock an enemy down and clear the group", () => {
    const combat = new Combat(open);
    combat.spawnGroup("a", [{ x: 0, z: -1.2, armed: false }]);
    const events: CombatEvent[] = [];
    for (let i = 0; i < 3; i++) {
      combat.punch(player(), events);
      combat.update(0.5, player()); // wait out the recovery; the enemy stays in reach
    }
    // Each landed punch is reported (the 22 Nov 2026 redesign shows a reaction for every hit).
    expect(events.map((e) => e.type)).toEqual(["enemyHit", "enemyHit", "enemyHit", "enemyDown", "groupCleared"]);
    expect(combat.remaining("a")).toBe(0);
    // The body is removed after a few seconds.
    combat.update(6, player());
    expect(combat.enemies).toHaveLength(0);
  });

  it("shooting uses ammunition, is pulled onto an enemy in front, and is stopped by walls", () => {
    const combat = new Combat(open);
    combat.spawnGroup("a", [{ x: 3, z: -20, armed: false }]);
    const events: CombatEvent[] = [];
    expect(combat.shoot(player(), events).fired).toBe(false); // no ammunition
    combat.ammo = 2;
    const shot = combat.shoot(player(), events);
    expect(shot.hit?.health).toBe(66);
    expect(combat.ammo).toBe(1);
    expect(combat.shoot(player(), events).fired).toBe(false); // too soon
    combat.update(0.4, player({ x: 500 }));
    // Facing away: the bullet misses and flies straight.
    const miss = combat.shoot(player({ heading: Math.PI }), events);
    expect(miss).toMatchObject({ fired: true, hit: null });
    expect(miss.toZ).toBeCloseTo(45, 0);

    const blocked = new Combat(walled);
    blocked.spawnGroup("a", [{ x: 0, z: -20, armed: false }]);
    blocked.ammo = 1;
    const stopped = blocked.shoot(player(), []);
    expect(stopped.hit).toBeNull();
    expect(stopped.toZ).toBeCloseTo(-6, 5); // ends at the wall
  });

  it("unarmed enemies notice the player, run up and punch", () => {
    const combat = new Combat(open, () => 0);
    combat.spawnGroup("a", [{ x: 0, z: -15, armed: false }]);
    const events = run(combat, 6, player());
    expect(Math.hypot(combat.enemies[0]!.x, combat.enemies[0]!.z)).toBeLessThan(1.8);
    expect(events.some((e) => e.type === "enemyPunch")).toBe(true);
    expect(combat.health).toBeLessThan(PLAYER_MAX_HEALTH);
  });

  it("enemies ignore a player they cannot see", () => {
    const combat = new Combat(walled, () => 0);
    combat.spawnGroup("a", [{ x: 0, z: -15, armed: true }]);
    expect(run(combat, 5, player())).toEqual([]);
    expect(combat.enemies[0]!.z).toBe(-15);
  });

  it("armed enemies shoot from a distance and can kill the player", () => {
    const combat = new Combat(open, () => 0); // every shot hits
    combat.spawnGroup("a", [{ x: 0, z: -12, armed: true }, { x: 4, z: -12, armed: true }]);
    const events = run(combat, 20, player());
    expect(events.filter((e) => e.type === "enemyShot").length).toBeGreaterThan(10);
    expect(events.at(-1)?.type).toBe("playerDied");
    expect(combat.health).toBe(0);
    // They stayed back rather than charging.
    expect(Math.abs(combat.enemies[0]!.z)).toBeGreaterThan(5);
    combat.revive();
    expect(combat.health).toBe(PLAYER_MAX_HEALTH);
  });

  it("health comes back after a few seconds without being hurt", () => {
    const combat = new Combat(open, () => 0);
    combat.spawnGroup("a", [{ x: 0, z: -1, armed: false }]);
    run(combat, 2, player());
    const hurt = combat.health;
    expect(hurt).toBeLessThan(PLAYER_MAX_HEALTH);
    combat.keepOnly([]);
    run(combat, 5, player());
    expect(combat.health).toBe(hurt); // not yet
    run(combat, 20, player());
    expect(combat.health).toBe(PLAYER_MAX_HEALTH);
  });

  it("a fast vehicle knocks enemies down, and its driver cannot punch or shoot", () => {
    const combat = new Combat(open, () => 1);
    combat.spawnGroup("a", [{ x: 0, z: -1, armed: false }]);
    combat.ammo = 5;
    const driver = player({ inVehicle: true, speed: 10 });
    expect(combat.punch(driver, [])).toBeUndefined();
    expect(combat.shoot(driver, []).fired).toBe(false);
    const events = run(combat, 0.2, driver);
    expect(events.map((e) => e.type)).toContain("enemyDown");
  });

  it("spawning a group twice does not double it", () => {
    const combat = new Combat(open);
    combat.spawnGroup("a", [{ x: 0, z: 0, armed: false }]);
    combat.spawnGroup("a", [{ x: 0, z: 0, armed: false }]);
    expect(combat.enemies).toHaveLength(1);
  });

  it("hurt (a crash) takes health whatever the dodge, and reports a knock-out at zero", () => {
    const combat = new Combat(open);
    expect(combat.dodge()).toBe(true);
    expect(combat.hurt(30)).toEqual([{ type: "playerHurt", amount: 30 }]);
    expect(combat.health).toBe(PLAYER_MAX_HEALTH - 30);
    expect(combat.hurt(500).map((e) => e.type)).toEqual(["playerHurt", "playerDied"]);
    expect(combat.health).toBe(0);
    expect(combat.hurt(10)).toEqual([]);
  });
});
