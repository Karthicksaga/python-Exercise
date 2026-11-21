import { describe, expect, it } from "vitest";
import {
  ESCALATOR_HOURS,
  FILMS,
  FREE_QUEUE_HOURS,
  FREE_SOCKS,
  GYM_PASS,
  Life,
  MAX_FITNESS,
  MAX_HEALTH,
  NEEDLE_PERIOD,
  OUTFITS,
  POPCORN_PRICE,
  SNACKS,
  TICKET_PRICE,
  TREATMENT_HOURS,
  WORKOUT_GOOD_NEEDED,
  WORKOUT_HOURS,
  WORKOUT_REPS,
  WORKOUT_ZONE,
  clockText,
  daysPassed,
  goodRep,
  lifeFromSave,
  needleAt,
  nextShow,
  parseLife,
  saveWithLife,
  sleepHours,
  sprintFactor,
  treatmentFee,
  type Now,
} from "./life";

const now = (hour: number, money = 1000, health = MAX_HEALTH): Now => ({ hour, money, health });

describe("home", () => {
  it("sleeps until 07:00 the next morning, restores health and counts the day", () => {
    const life = new Life();
    const out = life.sleep(now(22, 0, 30));
    expect(out.ok).toBe(true);
    expect(out.hours).toBeCloseTo(9);
    expect(out.health).toBe(MAX_HEALTH);
    expect(out.cost).toBe(0);
    expect(life.day).toBe(1);
  });

  it("sleeping in the small hours stays on the same day", () => {
    const life = new Life();
    expect(life.sleep(now(2)).hours).toBeCloseTo(5);
    expect(life.day).toBe(0);
    expect(sleepHours(7)).toBe(24);
  });

  it("changes into the next outfit the player owns", () => {
    const life = new Life();
    expect(life.outfit.id).toBe("everyday");
    life.changeClothes();
    expect(life.outfit.id).toBe("festival");
    life.changeClothes();
    expect(life.outfit.id).toBe("everyday");
  });
});

describe("hospital", () => {
  it("charges by missing health, with a minimum fee, and nothing when healthy", () => {
    expect(treatmentFee(100, false)).toBe(0);
    expect(treatmentFee(90, false)).toBe(50);
    expect(treatmentFee(40, false)).toBe(180);
    expect(treatmentFee(40, true)).toBe(0);
  });

  it("treats for the fee, restores health and passes half an hour", () => {
    const life = new Life();
    const out = life.treat(now(10, 500, 40), false);
    expect(out).toMatchObject({ ok: true, cost: 180, health: MAX_HEALTH });
    expect(out.hours).toBe(TREATMENT_HOURS);
  });

  it("is free when the player came by ambulance", () => {
    const out = new Life().treat(now(10, 0, 20), true);
    expect(out).toMatchObject({ ok: true, cost: 0, health: MAX_HEALTH });
  });

  it("refuses without the money, and the free queue takes three hours instead", () => {
    const life = new Life();
    expect(life.treat(now(10, 20, 40), false)).toMatchObject({ ok: false, cost: 0, hours: 0 });
    expect(life.freeQueue(now(10, 0, 40))).toMatchObject({ ok: true, cost: 0, health: MAX_HEALTH, hours: FREE_QUEUE_HOURS });
    expect(life.treat(now(10, 500, 100), false).ok).toBe(false);
  });
});

describe("gym", () => {
  it("the needle sweeps the bar and back; the middle is the good zone", () => {
    expect(needleAt(0)).toBe(0);
    expect(needleAt(NEEDLE_PERIOD / 2)).toBeCloseTo(1);
    expect(needleAt(NEEDLE_PERIOD / 4)).toBeCloseTo(0.5);
    expect(needleAt(NEEDLE_PERIOD)).toBeCloseTo(0);
    expect(goodRep(0.5)).toBe(true);
    expect(goodRep(WORKOUT_ZONE[0] - 0.01)).toBe(false);
    expect(goodRep(0.95)).toBe(false);
  });

  it("raises fitness once a day, only with enough good reps, and costs a day pass", () => {
    const life = new Life();
    const weak = life.workout(now(9), WORKOUT_GOOD_NEEDED - 1);
    expect(weak).toMatchObject({ ok: true, cost: GYM_PASS, hours: WORKOUT_HOURS });
    expect(life.fitness).toBe(0);
    life.workout(now(10), WORKOUT_REPS);
    expect(life.fitness).toBe(1);
    // Same day again: not counted.
    const again = life.workout(now(11), WORKOUT_REPS);
    expect(again.message).toMatch(/tomorrow/);
    expect(life.fitness).toBe(1);
    // The next day it counts again.
    life.sleep(now(22));
    life.workout(now(8), WORKOUT_REPS);
    expect(life.fitness).toBe(2);
  });

  it("fitness raises sprint speed a little: 2% a point, at most 10%", () => {
    expect(sprintFactor(0)).toBe(1);
    expect(sprintFactor(1)).toBeCloseTo(1.02);
    expect(sprintFactor(MAX_FITNESS)).toBeCloseTo(1.1);
    expect(sprintFactor(99)).toBeCloseTo(1.1);
    const life = new Life({ fitness: MAX_FITNESS });
    life.workout(now(8), WORKOUT_REPS);
    expect(life.fitness).toBe(MAX_FITNESS);
    expect(life.sprint).toBeCloseTo(1.1);
  });

  it("refuses without the day pass money, unless a friend pays", () => {
    const life = new Life();
    expect(life.workout(now(8, 10), WORKOUT_REPS).ok).toBe(false);
    expect(life.workout(now(8, 0), WORKOUT_REPS, true)).toMatchObject({ ok: true, cost: 0 });
    expect(life.fitness).toBe(1);
  });
});

describe("mall", () => {
  it("snacks restore a little health for their price, capped at full", () => {
    const life = new Life();
    const bajji = SNACKS.find((s) => s.id === "bajji-plate")!;
    expect(life.buySnack(now(12, 500, 50), bajji.id)).toMatchObject({ ok: true, cost: bajji.price, health: 70 });
    expect(life.buySnack(now(12, 500, 95), bajji.id).health).toBe(MAX_HEALTH);
    expect(life.buySnack(now(12, 10, 50), bajji.id).ok).toBe(false);
  });

  it("clothes are bought once, worn at once, and come with free socks the first time", () => {
    const life = new Life();
    const shirt = OUTFITS.find((o) => o.id === "maroon-shirt")!;
    const out = life.buyOutfit(now(12, 1000), shirt.id);
    expect(out).toMatchObject({ ok: true, cost: shirt.price });
    expect(out.message).toMatch(/BUY 1 GET 1/);
    expect(life.outfit.id).toBe(shirt.id);
    expect(life.owns(FREE_SOCKS)).toBe(true);
    expect(life.buyOutfit(now(12, 1000), shirt.id).ok).toBe(false);
    expect(life.buyOutfit(now(12, 100), "track-suit").ok).toBe(false);
    expect(life.buyOutfit(now(12, 1000), "everyday").ok).toBe(false);
  });

  it("the escalator queue takes ten minutes", () => {
    expect(new Life().escalator(now(12)).hours).toBeCloseTo(ESCALATOR_HOURS);
  });
});

describe("cinema", () => {
  it("has three invented films in different genres", () => {
    expect(FILMS).toHaveLength(3);
    expect(new Set(FILMS.map((f) => f.genre)).size).toBe(3);
  });

  it("finds the next show, also across midnight", () => {
    expect(nextShow(10)).toEqual({ start: 11, wait: 1 });
    expect(nextShow(14.5)).toEqual({ start: 14.5, wait: 0 });
    expect(nextShow(19)).toEqual({ start: 21.5, wait: 2.5 });
    const late = nextShow(23);
    expect(late.start).toBe(11);
    expect(late.wait).toBeCloseTo(12);
  });

  it("a ticket costs money; watching passes the wait plus the film, with audience moments", () => {
    const life = new Life();
    const film = FILMS[1]!;
    const out = life.watch(now(18), film.id);
    expect(out.ok).toBe(true);
    expect(out.cost).toBe(TICKET_PRICE);
    expect(out.hours).toBeCloseTo(0.5 + film.runtime);
    expect(out.lines.join(" ")).toMatch(/whistles/);
    expect(out.lines.join(" ")).toMatch(/phone rings/);
    expect(out.lines.join(" ")).toMatch(/INTERVAL/);
    expect(life.state().films).toEqual([film.id]);
    expect(clockText(18 + out.hours)).toBe("21:15");
  });

  it("a late show past midnight counts the new day; no money, no ticket", () => {
    const life = new Life();
    life.watch(now(21.5), FILMS[0]!.id);
    expect(life.day).toBe(1);
    expect(life.watch(now(10, 100), FILMS[0]!.id).ok).toBe(false);
    expect(life.watch(now(10, 0), FILMS[0]!.id, true).ok).toBe(true);
    expect(life.popcorn(now(12, 100, 50))).toMatchObject({ ok: true, cost: POPCORN_PRICE, health: 55 });
  });
});

describe("days and saving", () => {
  it("counts midnights as the clock runs", () => {
    const life = new Life();
    life.tick(23.99, 0.01);
    expect(life.day).toBe(1);
    life.tick(10, 10.02);
    expect(life.day).toBe(1);
    expect(daysPassed(20, 30)).toBe(2);
    expect(daysPassed(20, 2)).toBe(0);
  });

  it("an old save (no life) loads as a fresh life, and writing keeps completed and money", () => {
    const old = { completed: ["morning-walk", "borrowed-wheels"], money: 350 };
    const life = new Life(lifeFromSave(old));
    expect(life.state()).toEqual({ day: 0, fitness: 0, trainedDay: -1, outfit: "everyday", owned: ["everyday", "festival"], films: [], stories: [] });
    life.workout(now(9), 5);
    const written = saveWithLife(old, life.state());
    expect(written.completed).toEqual(old.completed);
    expect(written.money).toBe(350);
    const reloaded = new Life(lifeFromSave(JSON.parse(JSON.stringify(written))));
    expect(reloaded.fitness).toBe(1);
    expect(reloaded.trainedToday()).toBe(true);
  });

  it("damaged values fall back to safe ones", () => {
    const s = parseLife({ day: "x", fitness: 99, outfit: "track-suit", owned: [1, "socks"], films: null, stories: ["a", "a"] });
    expect(s.day).toBe(0);
    expect(s.fitness).toBe(MAX_FITNESS);
    // Not owned, so not worn.
    expect(s.outfit).toBe("everyday");
    expect(s.owned).toEqual(["everyday", "festival", "socks"]);
    expect(s.stories).toEqual(["a"]);
    expect(lifeFromSave(null).fitness).toBe(0);
    expect(lifeFromSave("junk").outfit).toBe("everyday");
  });

  it("reset forgets everything", () => {
    const life = new Life({ fitness: 3, owned: ["track-suit"], outfit: "track-suit", stories: ["x"] });
    expect(life.outfit.id).toBe("track-suit");
    life.reset();
    expect(life.fitness).toBe(0);
    expect(life.outfit.id).toBe("everyday");
    expect(life.state().stories).toEqual([]);
  });
});
