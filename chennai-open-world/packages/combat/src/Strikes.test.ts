import { describe, expect, it } from "vitest";
import { Combat, PLAYER_MAX_HEALTH, type CombatEvent, type CombatWorld, type PlayerState } from "./Combat";
import { KNOCK_BACK, STRIKES, SwingClock, knockBackRoom, strikeKind } from "./Strikes";
import { WEAPONS } from "./Weapons";

const open: CombatWorld = { lineOfSight: () => true, wallDistance: () => null, solidDistance: () => null };
/** Player at the origin facing north (-Z). */
const player = (over: Partial<PlayerState> = {}): PlayerState => ({ x: 0, z: 0, heading: 0, inVehicle: false, speed: 0, ...over });
const STEP = 1 / 60;

describe("strike timing", () => {
  it("every blow lands within its weapon's interval, so the rate of blows is unchanged", () => {
    expect(strikeKind("fists")).toBe("punch");
    expect(strikeKind("pistol")).toBe("punch");
    expect(strikeKind("bat")).toBe("bat");
    expect(STRIKES.punch.windup).toBeLessThan(WEAPONS.fists.interval);
    expect(STRIKES.bat.windup).toBeLessThan(WEAPONS.bat.interval);
    expect(STRIKES.punch.windup + STRIKES.punch.recover).toBeLessThanOrEqual(WEAPONS.fists.interval);
    expect(STRIKES.bat.windup + STRIKES.bat.recover).toBeLessThanOrEqual(WEAPONS.bat.interval);
    // The bat is drawn back for longer than a jab.
    expect(STRIKES.bat.windup).toBeGreaterThan(STRIKES.punch.windup);
  });

  it("the player's swing lands once, at the end of its wind-up, and one swing at a time", () => {
    for (const kind of ["punch", "bat"] as const) {
      const clock = new SwingClock();
      expect(clock.begin(kind)).toBe(true);
      expect(clock.begin("punch")).toBe(false); // already swinging
      let landedAt = -1;
      for (let i = 1; i <= 60; i++) {
        const landed = clock.step(STEP);
        if (landed) {
          expect(landedAt).toBe(-1);
          expect(landed).toBe(kind);
          landedAt = i * STEP;
        }
      }
      expect(landedAt).toBeCloseTo(STRIKES[kind].windup, 1);
      expect(landedAt).toBeGreaterThanOrEqual(STRIKES[kind].windup - 1e-9);
      expect(clock.kind).toBeNull();
    }
    const cancelled = new SwingClock();
    cancelled.begin("punch");
    cancelled.cancel();
    expect(cancelled.step(1)).toBeNull();
  });

  it("an enemy's punch starts with a wind-up and hurts the player when it lands, not before", () => {
    const combat = new Combat(open, () => 0);
    combat.spawnGroup("a", [{ x: 0, z: -1.2, armed: false }]);
    const log: Array<{ t: number; type: string }> = [];
    for (let i = 1; i <= 90; i++) for (const e of combat.update(STEP, player())) log.push({ t: i * STEP, type: e.type });
    const swing = log.find((e) => e.type === "enemySwing")!;
    const punch = log.find((e) => e.type === "enemyPunch")!;
    const hurt = log.find((e) => e.type === "playerHurt")!;
    expect(swing).toBeDefined();
    expect(punch.t - swing.t).toBeCloseTo(STRIKES.punch.windup, 1);
    expect(hurt.t).toBe(punch.t);
    expect(combat.health).toBeLessThan(PLAYER_MAX_HEALTH);
  });

  it("an enemy's blow misses a player who stepped out of reach during the wind-up", () => {
    const combat = new Combat(open, () => 0);
    combat.spawnGroup("a", [{ x: 0, z: -1.2, armed: false }]);
    let swung = false;
    let events: CombatEvent[] = [];
    for (let i = 0; i < 90 && !swung; i++) {
      events = combat.update(STEP, player());
      swung = events.some((e) => e.type === "enemySwing");
    }
    expect(swung).toBe(true);
    // The player jumps back 3 m: the blow lands on air.
    const away = player({ z: 3 });
    const after: CombatEvent[] = [];
    for (let i = 0; i < 20; i++) after.push(...combat.update(STEP, away));
    expect(after.some((e) => e.type === "enemyPunch")).toBe(false);
    expect(combat.health).toBe(PLAYER_MAX_HEALTH);
  });
});

describe("knock-back", () => {
  it("is a short step straight away from the player, a bat's longer than a fist's", () => {
    const pushed = (bat: boolean) => {
      const combat = new Combat(open);
      if (bat) combat.arsenal.give("bat");
      combat.spawnGroup("a", [{ x: 0, z: -1.2, armed: false }]);
      combat.punch(player(), []);
      const enemy = combat.enemies[0]!;
      // 14 steps: the stagger (0.22 s) is just over; walking back towards the player has not started.
      for (let i = 0; i < 14; i++) combat.update(STEP, player({ x: 500 }));
      return { x: enemy.x, z: enemy.z };
    };
    const fist = pushed(false);
    expect(fist.x).toBeCloseTo(0, 6);
    expect(-1.2 - fist.z).toBeCloseTo(KNOCK_BACK.punch, 2);
    expect(-1.2 - pushed(true).z).toBeCloseTo(KNOCK_BACK.bat, 2);
  });

  it("stops short of a wall behind the person hit", () => {
    // A wall across the street 1.5 m north of the player (z = -1.5).
    const wall: CombatWorld = {
      lineOfSight: () => true,
      wallDistance: () => null,
      solidDistance: (_x, z, _dx, dz, max) => {
        if (dz >= 0) return null;
        const d = (z + 1.5) / -dz;
        return d >= 0 && d <= max ? d : null;
      },
    };
    expect(knockBackRoom(wall, 0, -1, 0, -1, 0.65)).toBeCloseTo(0.1, 6); // 0.5 m to the wall, less the body's 0.4
    expect(knockBackRoom(wall, 0, -1.2, 0, -1, 0.65)).toBe(0); // already against it
    expect(knockBackRoom(wall, 0, -1, 0, 1, 0.65)).toBe(0.65); // away from it: the full step
    const combat = new Combat(wall);
    combat.arsenal.give("bat");
    combat.spawnGroup("a", [{ x: 0, z: -1, armed: false }]);
    combat.punch(player(), []);
    for (let i = 0; i < 20; i++) combat.update(STEP, player({ x: 500 }));
    const enemy = combat.enemies[0]!;
    // Pushed towards the wall, but its body (0.4 m) never enters it.
    expect(enemy.z).toBeLessThan(-1);
    expect(enemy.z).toBeGreaterThanOrEqual(-1.5 + 0.4 - 1e-6);
  });

  it("a gunshot makes the target flinch back a little", () => {
    const combat = new Combat(open);
    combat.spawnGroup("a", [{ x: 0, z: -10, armed: false }]);
    combat.ammo = 1;
    expect(combat.shoot(player(), []).hit).not.toBeNull();
    const enemy = combat.enemies[0]!;
    expect(enemy.stagger).toBeGreaterThan(0);
    for (let i = 0; i < 14; i++) combat.update(STEP, player({ x: 500 }));
    expect(-10 - enemy.z).toBeCloseTo(KNOCK_BACK.shot, 2);
  });

  it("an enemy knocked down by the last blow is still pushed back as they fall", () => {
    const combat = new Combat(open);
    combat.spawnGroup("a", [{ x: 0, z: -1.2, armed: false, health: 30 }]);
    combat.punch(player(), []);
    const enemy = combat.enemies[0]!;
    expect(enemy.health).toBe(0);
    for (let i = 0; i < 20; i++) combat.update(STEP, player());
    expect(-1.2 - enemy.z).toBeCloseTo(KNOCK_BACK.punch, 2);
  });
});
