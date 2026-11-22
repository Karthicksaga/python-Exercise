import { describe, expect, it } from "vitest";
import { Combat, type CombatEvent, type CombatWorld, type PlayerState } from "./Combat";
import { COMBAT_FEEL, attackOutcome, chooseAttackers, chooseLock, hitReaction, nextComboMove } from "./Melee";

const open: CombatWorld = { lineOfSight: () => true, wallDistance: () => null, solidDistance: () => null };
/** Player at the origin facing north (-Z). */
const player = (over: Partial<PlayerState> = {}): PlayerState => ({ x: 0, z: 0, heading: 0, inVehicle: false, speed: 0, ...over });
const step = (combat: Combat, seconds: number, p: PlayerState = player()) => {
  const events: CombatEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) events.push(...combat.update(1 / 60, p));
  return events;
};

describe("the punch combo", () => {
  it("runs jab, cross, hook within the window, and starts again after a pause", () => {
    expect(nextComboMove(null, 0)).toBe("jab");
    expect(nextComboMove("jab", 0.5)).toBe("cross");
    expect(nextComboMove("cross", 0.5)).toBe("hook");
    expect(nextComboMove("hook", 0.5)).toBe("jab");
    expect(nextComboMove("cross", COMBAT_FEEL.comboWindow + 0.1)).toBe("jab");
  });

  it("the hook finishes harder, and knocks the enemy back", () => {
    const combat = new Combat(open);
    combat.spawnGroup("a", [{ x: 0, z: -1.2, armed: false, health: 500 }]);
    const enemy = combat.enemies[0]!;
    const events: CombatEvent[] = [];
    const moves: string[] = [];
    const before: number[] = [];
    for (let i = 0; i < 3; i++) {
      before.push(enemy.health);
      enemy.z = -1.2; // stay in reach for the test
      combat.punch(player(), events);
      moves.push(combat.lastSwing!);
      step(combat, 0.5);
    }
    expect(moves).toEqual(["jab", "cross", "hook"]);
    const hits = events.filter((e) => e.type === "enemyHit");
    expect(hits.map((e) => e.type === "enemyHit" && e.damage)).toEqual([34, 34, 34 * 1.4]);
    expect(hits.map((e) => e.type === "enemyHit" && e.heavy)).toEqual([false, false, true]);
  });
});

describe("hits", () => {
  it("a light hit stuns briefly; a heavy one stuns longer and knocks further", () => {
    expect(hitReaction(20)).toEqual({ ...COMBAT_FEEL.light, heavy: false });
    expect(hitReaction(20, "hook")).toEqual({ ...COMBAT_FEEL.heavy, heavy: true });
    expect(hitReaction(60).heavy).toBe(true);
  });

  it("a stunned enemy is pushed away and does not strike back until it recovers", () => {
    const combat = new Combat(open);
    combat.spawnGroup("a", [{ x: 0, z: -1.2, armed: false }]);
    step(combat, 0.1); // notices the player
    const events: CombatEvent[] = [];
    combat.punch(player(), events);
    const reeling = step(combat, COMBAT_FEEL.light.stun - 0.05);
    expect(reeling.some((e) => e.type === "enemyWindup" || e.type === "enemyPunch")).toBe(false);
    expect(combat.enemies[0]!.z).toBeLessThan(-1.3); // pushed back, away from the player
  });

  it("knock-back stops at a wall", () => {
    const wall: CombatWorld = { ...open, solidDistance: (_x, z, _dx, dz) => (dz < 0 && z < -1.3 ? 0.5 : null) };
    const combat = new Combat(wall);
    combat.spawnGroup("a", [{ x: 0, z: -1.2, armed: false }]);
    const events: CombatEvent[] = [];
    combat.enemies[0]!.heavyHit = false;
    combat.punch(player(), events);
    step(combat, 0.4);
    expect(combat.enemies[0]!.z).toBeGreaterThan(-1.5);
  });
});

describe("blocking and dodging", () => {
  const brawl = (blocking: boolean) => {
    const combat = new Combat(open, () => 0);
    combat.spawnGroup("a", [{ x: 0, z: -1.2, armed: false }]);
    const events = step(combat, 2.2, player({ blocking }));
    return { taken: 100 - combat.health, events };
  };

  it("blocking takes a fifth of a punch, and says so", () => {
    const open = brawl(false);
    const guarded = brawl(true);
    expect(open.taken).toBeGreaterThan(0);
    expect(guarded.taken).toBeCloseTo(open.taken * COMBAT_FEEL.blockShare, 5);
    expect(guarded.events.some((e) => e.type === "blocked")).toBe(true);
  });

  it("bullets are not blocked", () => {
    const shot = (blocking: boolean) => {
      const combat = new Combat(open, () => 0);
      combat.spawnGroup("a", [{ x: 0, z: -8, armed: true }]);
      step(combat, 2, player({ blocking }));
      return 100 - combat.health;
    };
    expect(shot(true)).toBeGreaterThan(0);
    expect(shot(true)).toBe(shot(false));
  });

  it("a punch is telegraphed: it lands a wind-up after it starts, and a dodge in time avoids it", () => {
    const combat = new Combat(open, () => 0);
    combat.spawnGroup("a", [{ x: 0, z: -1.2, armed: false }]);
    let windupAt = -1;
    let landedAt = -1;
    for (let i = 0; i < 180 && landedAt < 0; i++) {
      for (const e of combat.update(1 / 60, player())) {
        if (e.type === "enemyWindup") windupAt = i;
        if (e.type === "enemyPunch") landedAt = i;
      }
    }
    expect(windupAt).toBeGreaterThanOrEqual(0);
    expect((landedAt - windupAt) / 60).toBeCloseTo(COMBAT_FEEL.windup, 1);

    const dodger = new Combat(open, () => 0);
    dodger.spawnGroup("a", [{ x: 0, z: -1.2, armed: false }]);
    // The player reacts a tenth of a second after the wind-up starts (a dodge has to be timed:
    // it lasts less than the wind-up; in the game it also carries the player out of reach).
    const events: CombatEvent[] = [];
    let seenAt = -1;
    for (let i = 0; i < 180; i++) {
      const now = dodger.update(1 / 60, player());
      events.push(...now);
      if (now.some((e) => e.type === "enemyWindup")) seenAt = i;
      if (seenAt >= 0 && i === seenAt + 6) expect(dodger.dodge()).toBe(true);
      if (now.some((e) => e.type === "enemyPunch")) break;
    }
    expect(events.some((e) => e.type === "dodged")).toBe(true);
    expect(dodger.health).toBe(100);
  });

  it("a dodge needs a moment to recover", () => {
    const combat = new Combat(open);
    expect(combat.dodge()).toBe(true);
    expect(combat.dodge()).toBe(false);
    step(combat, COMBAT_FEEL.dodgeEvery + 0.05);
    expect(combat.dodge()).toBe(true);
  });
});

describe("enemies fight as a group", () => {
  it("only two brawlers attack at once; the others circle and wait their turn", () => {
    const combat = new Combat(open, () => 0.5);
    combat.spawnGroup("a", [0, 1, 2, 3, 4].map((i) => ({ x: Math.sin(i * 1.3) * 6, z: Math.cos(i * 1.3) * 6, armed: false, health: 10_000 })));
    let most = 0;
    for (let i = 0; i < 600; i++) {
      combat.update(1 / 60, player());
      const swinging = combat.enemies.filter((e) => e.windup >= 0).length;
      most = Math.max(most, swinging);
    }
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(COMBAT_FEEL.attackers);
    // The waiting ones keep a ring round the player rather than piling in.
    const waiting = combat.enemies.map((e) => Math.hypot(e.x, e.z)).sort((a, b) => a - b).slice(COMBAT_FEEL.attackers);
    for (const d of waiting) expect(d).toBeGreaterThan(COMBAT_FEEL.circleAt - 1);
  });

  it("a gunman between shots strafes and keeps his distance", () => {
    const combat = new Combat(open, () => 0.99); // always miss
    combat.spawnGroup("a", [{ x: 0, z: -9, armed: true }]);
    const start = { ...combat.enemies[0]! };
    step(combat, 2);
    const gunman = combat.enemies[0]!;
    expect(Math.abs(gunman.x - start.x)).toBeGreaterThan(0.5); // moved sideways
    const close = new Combat(open, () => 0.99);
    close.spawnGroup("a", [{ x: 0, z: -5.5, armed: true }]);
    step(close, 1);
    expect(Math.hypot(close.enemies[0]!.x, close.enemies[0]!.z)).toBeGreaterThan(5.5); // backed away
  });

  it("a badly hurt enemy backs off for a while, once", () => {
    const combat = new Combat(open, () => 0.5);
    combat.spawnGroup("a", [{ x: 0, z: -1.5, armed: false, health: 100 }]);
    step(combat, 0.1);
    combat.enemies[0]!.health = 20;
    step(combat, 1.5);
    expect(Math.hypot(combat.enemies[0]!.x, combat.enemies[0]!.z)).toBeGreaterThan(4);
  });

  it("takes turns: the attackers are kept while close, then the nearest", () => {
    const fighters = [{ id: 1, distance: 5 }, { id: 2, distance: 2 }, { id: 3, distance: 3 }, { id: 4, distance: 1 }];
    expect([...chooseAttackers(fighters, new Set())].sort()).toEqual([2, 4]);
    expect([...chooseAttackers(fighters, new Set([1]))].sort()).toEqual([1, 4]);
  });
});

describe("lock-on", () => {
  const sees = () => true;
  const me = { x: 0, z: 0, heading: 0 };

  it("picks the nearest enemy in front, not one behind", () => {
    const targets = [{ id: 1, x: 0, z: 5 }, { id: 2, x: 0.5, z: -6 }, { id: 3, x: 6, z: -6 }];
    expect(chooseLock(me, targets, null, sees)).toBe(2);
  });

  it("an enemy in the player's face takes the lock from a farther one", () => {
    const targets = [{ id: 1, x: 0, z: -6 }, { id: 2, x: 1.2, z: -1 }];
    expect(chooseLock(me, targets, 1, sees)).toBe(2);
    // Not when the locked one is about as close.
    expect(chooseLock(me, [{ id: 1, x: 0, z: -2 }, { id: 2, x: 1.2, z: -1 }], 1, sees)).toBe(1);
  });

  it("keeps the current target while it stays close and in sight", () => {
    const targets = [{ id: 1, x: 0, z: -3 }, { id: 2, x: 9, z: 9 }];
    expect(chooseLock(me, targets, 2, sees)).toBe(2);
    expect(chooseLock(me, targets, 2, (c) => c.id !== 2)).toBe(1);
    expect(chooseLock(me, [{ id: 2, x: 30, z: 0 }], 2, sees)).toBeNull();
  });
});

describe("pedestrians", () => {
  it("a punch or two knocks someone out; a gun kills; a light hit makes them flinch", () => {
    expect(attackOutcome(60, 34, "fists")).toEqual({ health: 26, outcome: "flinch" });
    expect(attackOutcome(26, 34, "fists")).toEqual({ health: 0, outcome: "injured" });
    expect(attackOutcome(60, 50, "bat")).toEqual({ health: 10, outcome: "stumble" });
    expect(attackOutcome(30, 34, "pistol")).toEqual({ health: 0, outcome: "killed" });
  });

  it("can be punched and shot, and are reported rather than counted as enemies", () => {
    const combat = new Combat(open);
    const events: CombatEvent[] = [];
    expect(combat.punch(player(), events, [{ id: 7, x: 0, z: -1 }])).toBeNull();
    expect(events).toMatchObject([{ type: "civilianHit", id: 7, weapon: "fists" }]);
    combat.update(1, player());
    combat.ammo = 1;
    const shot: CombatEvent[] = [];
    const result = combat.shoot(player(), shot, [{ id: 8, x: 0, z: -10 }]);
    expect(result.pellets[0]?.civilian).toBe(8);
    expect(shot.some((e) => e.type === "civilianHit" && e.id === 8 && e.weapon === "pistol")).toBe(true);
  });

  it("an enemy standing nearer than a pedestrian takes the punch", () => {
    const combat = new Combat(open);
    combat.spawnGroup("a", [{ x: 0, z: -1, armed: false }]);
    const events: CombatEvent[] = [];
    expect(combat.punch(player(), events, [{ id: 7, x: 0, z: -1.6 }])).not.toBeNull();
    expect(events.some((e) => e.type === "civilianHit")).toBe(false);
  });
});
