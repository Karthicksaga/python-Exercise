import { describe, expect, it } from "vitest";
import { Combat, type CombatEvent, type CombatWorld, type EnemySpot, type PlayerState } from "./Combat";
import { GANG_RULES, crewsToField, hearsGunshot, lingerStep } from "./Gangs";

const open: CombatWorld = { lineOfSight: () => true, wallDistance: () => null, solidDistance: () => null };
const player = (over: Partial<PlayerState> = {}): PlayerState => ({ x: 0, z: 0, heading: 0, inVehicle: false, speed: 0, ...over });
const crew: EnemySpot[] = [
  { x: 0, z: -6, armed: false, calm: true, weapon: "bat", tint: 0xd4a017 },
  { x: 2, z: -6, armed: true, calm: true, weapon: "pistol", tint: 0xd4a017 },
];
const run = (combat: Combat, seconds: number, p: PlayerState) => {
  const events: CombatEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) events.push(...combat.update(1 / 60, p));
  return events;
};

describe("gang hostility rules", () => {
  it("unease builds only while armed and close, and fades slower than it builds", () => {
    let step = lingerStep(0, 5, true, 1);
    expect(step).toEqual({ unease: 1, provoked: false });
    step = lingerStep(step.unease, 5, false, 1); // put the weapon away
    expect(step.unease).toBeCloseTo(1 - GANG_RULES.lingerCoolRate, 9);
    expect(lingerStep(0, GANG_RULES.lingerRange + 0.1, true, 1).unease).toBe(0);
    expect(lingerStep(GANG_RULES.lingerTime - 0.5, 3, true, 0.5).provoked).toBe(true);
  });

  it("gunshots are heard within the alarm distance", () => {
    expect(hearsGunshot(0, 0, GANG_RULES.gunshotAlarm - 1, 0)).toBe(true);
    expect(hearsGunshot(0, 0, GANG_RULES.gunshotAlarm + 1, 0)).toBe(false);
  });

  it("a calm crew ignores an unarmed player walking past", () => {
    const combat = new Combat(open, () => 0);
    combat.spawnGroup("gang:a:0", crew);
    const events = run(combat, 10, player());
    expect(events.filter((e) => e.type === "playerHurt")).toHaveLength(0);
    expect(combat.enemies.every((e) => e.calm && !e.alerted)).toBe(true);
  });

  it("turns hostile, all together, when one of them is hit", () => {
    const combat = new Combat(open, () => 0);
    combat.spawnGroup("gang:a:0", crew);
    combat.spawnGroup("gang:b:0", [{ x: 50, z: 50, armed: false, calm: true }]);
    combat.ammo = 5;
    const events: CombatEvent[] = [];
    const shot = combat.shoot(player({ heading: 0 }), events);
    expect(shot.hit).not.toBeNull();
    expect(events).toContainEqual({ type: "crewProvoked", group: "gang:a:0" });
    const a = combat.enemies.filter((e) => e.group === "gang:a:0");
    expect(a.every((e) => !e.calm && e.alerted)).toBe(true);
    // Another crew far away did not hear it.
    expect(combat.enemies.find((e) => e.group === "gang:b:0")!.calm).toBe(true);
    // And now they fight back.
    expect(run(combat, 4, player()).some((e) => e.type === "playerHurt")).toBe(true);
  });

  it("a punch turns the crew too", () => {
    const combat = new Combat(open);
    combat.spawnGroup("gang:a:0", [{ x: 0, z: -1.2, armed: false, calm: true }, { x: 3, z: -6, armed: true, calm: true }]);
    const events: CombatEvent[] = [];
    combat.punch(player(), events);
    expect(events.map((e) => e.type)).toContain("crewProvoked");
    expect(combat.enemies.every((e) => !e.calm)).toBe(true);
  });

  it("a shot fired nearby turns a crew even when it misses everyone", () => {
    const combat = new Combat(open);
    combat.spawnGroup("gang:a:0", crew);
    combat.ammo = 5;
    const events: CombatEvent[] = [];
    const shot = combat.shoot(player({ heading: Math.PI }), events); // facing away, south
    expect(shot.hit).toBeNull();
    expect(events.map((e) => e.type)).toEqual(["playerShot", "crewProvoked"]);
  });

  it("lingering armed close by draws a warning, then the crew turns", () => {
    const combat = new Combat(open, () => 0);
    combat.spawnGroup("gang:a:0", crew);
    const close = player({ z: -2, armed: true });
    const early = run(combat, GANG_RULES.warnAt + 0.1, close);
    expect(early.map((e) => e.type)).toEqual(["crewWarning"]);
    expect(combat.enemies.every((e) => e.calm)).toBe(true);
    const later = run(combat, GANG_RULES.lingerTime - GANG_RULES.warnAt, close);
    expect(later.map((e) => e.type)).toContain("crewProvoked");
    expect(combat.enemies.every((e) => !e.calm)).toBe(true);
  });

  it("an armed player who keeps their distance, or drives past, is left alone", () => {
    const combat = new Combat(open, () => 0);
    combat.spawnGroup("gang:a:0", crew);
    run(combat, 20, player({ z: 6, armed: true })); // 12 m away
    run(combat, 20, player({ z: -5, armed: true, inVehicle: true }));
    expect(combat.enemies.every((e) => e.calm)).toBe(true);
  });

  it("removeGroup takes a crew off the street at once", () => {
    const combat = new Combat(open);
    combat.spawnGroup("gang:a:0", crew);
    combat.spawnGroup("park", [{ x: 9, z: 9, armed: false }]);
    combat.removeGroup("gang:a:0");
    expect(combat.enemies.map((e) => e.group)).toEqual(["park"]);
  });
});

describe("crewsToField", () => {
  const crews = [
    { id: "a", x: 0, z: 50 },
    { id: "b", x: 0, z: 80 },
    { id: "c", x: 0, z: 100 },
    { id: "d", x: 0, z: 400 },
  ];

  it("fields the nearest crews within range, at most the cap", () => {
    expect(crewsToField(crews, 0, 0, new Set(), new Set())).toEqual(["a", "b"]);
    expect(crewsToField(crews, 0, 0, new Set(), new Set(), 3)).toEqual(["a", "b", "c"]);
    expect(crewsToField(crews, 0, 1000, new Set(), new Set())).toEqual([]);
  });

  it("keeps a crew already out until the player is well past the edge, so it doesn't flicker", () => {
    // At 130 m: too far to come out, close enough to stay.
    expect(crewsToField([{ id: "a", x: 0, z: 130 }], 0, 0, new Set(), new Set())).toEqual([]);
    expect(crewsToField([{ id: "a", x: 0, z: 130 }], 0, 0, new Set(["a"]), new Set())).toEqual(["a"]);
    expect(crewsToField([{ id: "a", x: 0, z: GANG_RULES.leaveRange + 1 }], 0, 0, new Set(["a"]), new Set())).toEqual([]);
  });

  it("leaves a beaten crew's corner empty while it regroups", () => {
    expect(crewsToField(crews, 0, 0, new Set(["a"]), new Set(["a"]))).toEqual(["b", "c"]);
  });
});
