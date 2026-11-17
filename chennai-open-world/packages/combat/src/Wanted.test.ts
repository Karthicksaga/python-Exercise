import { describe, expect, it } from "vitest";
import { WANTED, Wanted, isPoliceGroup, isVehicleTheft, jobsAllowed, policeUnits, starsFor, type WantedSight } from "./Wanted";

const unseen: WantedSight = { seen: false, held: false };
const seen: WantedSight = { seen: true, held: false };
const held: WantedSight = { seen: true, held: true };

/** Run the rules for `seconds` in 1/60 s steps, collecting the events. */
function run(wanted: Wanted, seconds: number, sight: WantedSight) {
  const events = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    const event = wanted.update(1 / 60, sight);
    if (event) events.push(event);
  }
  return events;
}

describe("raising the wanted level", () => {
  it("starts at zero stars", () => {
    const w = new Wanted();
    expect(w.stars).toBe(0);
    expect(w.update(1, seen)).toBeNull();
    expect(w.seen).toBe(false); // nobody is looking for a player who is not wanted
  });

  it("firing a gun in public gives one star", () => {
    const w = new Wanted();
    expect(w.report("gunfire")).toEqual({ type: "raised", stars: 1, crime: "gunfire" });
    expect(w.stars).toBe(1);
  });

  it("counts a burst of gunfire once, and again after a pause", () => {
    const w = new Wanted();
    w.report("gunfire");
    expect(w.report("gunfire")).toBeNull();
    expect(w.points).toBe(1);
    run(w, WANTED.crimes.gunfire.every + 0.1, seen);
    w.report("gunfire");
    expect(w.points).toBe(2);
  });

  it("keeps firing long enough and it reaches two stars", () => {
    const w = new Wanted();
    for (let i = 0; i < 5; i++) {
      w.report("gunfire");
      run(w, WANTED.crimes.gunfire.every + 0.05, seen);
    }
    expect(w.stars).toBe(2);
  });

  it("hurting a pedestrian gives one star, killing one at least two", () => {
    const hurt = new Wanted();
    hurt.report("pedestrianInjured");
    expect(hurt.stars).toBe(1);
    const killed = new Wanted();
    killed.report("pedestrianKilled");
    expect(killed.stars).toBe(2);
    killed.report("pedestrianKilled");
    expect(killed.stars).toBe(3);
  });

  it("attacking officers escalates fastest", () => {
    const w = new Wanted();
    w.report("officerAssaulted");
    expect(w.stars).toBe(2);
    w.report("officerDown");
    expect(w.stars).toBe(3);
    w.report("officerDown");
    expect(w.stars).toBe(4);
    w.report("officerDown");
    w.report("officerDown");
    expect(w.stars).toBe(5);
    w.report("officerDown");
    expect(w.stars).toBe(WANTED.maxStars); // never more than five
  });

  it("stealing a vehicle and ramming or shooting a police car each give a star", () => {
    for (const crime of ["vehicleTheft", "policeCarRammed", "policeCarShot"] as const) {
      const w = new Wanted();
      w.report(crime);
      expect(w.stars, crime).toBe(1);
    }
  });

  it("a minimum never lowers the level", () => {
    const w = new Wanted();
    w.set(4);
    w.report("vehicleTheft");
    expect(w.stars).toBe(4);
  });

  it("maps points to stars at the thresholds", () => {
    expect(WANTED.starAt.map(starsFor)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(starsFor(WANTED.starAt[2]! - 0.5)).toBe(1);
    expect(starsFor(1000)).toBe(5);
  });
});

describe("losing the police", () => {
  it("drops a star after the police have not seen the player for a while", () => {
    const w = new Wanted();
    w.report("gunfire");
    expect(run(w, WANTED.loseAfter[1]! - 0.5, unseen)).toEqual([]);
    expect(w.stars).toBe(1);
    expect(run(w, 1, unseen)).toEqual([{ type: "lowered", stars: 0 }]);
    expect(w.stars).toBe(0);
  });

  it("takes longer at higher levels, one star at a time", () => {
    const w = new Wanted();
    w.set(3);
    const events = run(w, WANTED.loseAfter[3]! + WANTED.loseAfter[2]! + WANTED.loseAfter[1]! + 1, unseen);
    expect(events).toEqual([
      { type: "lowered", stars: 2 },
      { type: "lowered", stars: 1 },
      { type: "lowered", stars: 0 },
    ]);
    expect(WANTED.loseAfter[3]!).toBeGreaterThan(WANTED.loseAfter[1]!);
  });

  it("a sighting starts the wait again", () => {
    const w = new Wanted();
    w.report("gunfire");
    run(w, WANTED.loseAfter[1]! - 2, unseen);
    run(w, 0.1, seen);
    expect(w.seen).toBe(true);
    expect(w.unseenFor).toBe(0);
    run(w, WANTED.loseAfter[1]! - 2, unseen);
    expect(w.stars).toBe(1);
  });

  it("doesn't decay while the police are still on their way to the crime, then counts from their arrival", () => {
    const w = new Wanted();
    w.report("gunfire");
    const responding: WantedSight = { seen: false, held: false, responding: true };
    expect(run(w, WANTED.loseAfter[1]! * 2, responding)).toEqual([]);
    expect(w.stars).toBe(1);
    expect(w.unseenFor).toBe(0);
    run(w, WANTED.loseAfter[1]! - 1, unseen);
    expect(w.stars).toBe(1);
    expect(run(w, 2, unseen)).toEqual([{ type: "lowered", stars: 0 }]);
  });

  it("never decays while seen", () => {
    const w = new Wanted();
    w.set(2);
    expect(run(w, 200, seen)).toEqual([]);
    expect(w.stars).toBe(2);
  });

  it("a new crime also restarts the search", () => {
    const w = new Wanted();
    w.report("gunfire");
    run(w, WANTED.loseAfter[1]! - 1, unseen);
    run(w, WANTED.crimes.gunfire.every, unseen); // the star is lost meanwhile...
    expect(w.stars).toBe(0);
    w.report("gunfire"); // ...and a new shot brings it back with a full wait
    expect(w.unseenFor).toBe(0);
  });
});

describe("busted", () => {
  it("arrests a player kept still beside an officer at a low level", () => {
    const w = new Wanted();
    w.report("gunfire");
    expect(run(w, WANTED.bustAfter - 0.2, held)).toEqual([]);
    const events = run(w, 0.4, held);
    expect(events).toEqual([{ type: "busted", stars: 1, fine: WANTED.bustFine[1] }]);
    expect(w.stars).toBe(0);
  });

  it("moving away starts the arrest again", () => {
    const w = new Wanted();
    w.set(2);
    run(w, WANTED.bustAfter - 0.3, held);
    run(w, 0.1, seen);
    expect(w.heldFor).toBe(0);
    expect(run(w, WANTED.bustAfter - 0.3, held)).toEqual([]);
    expect(w.stars).toBe(2);
  });

  it("there is no arrest at three stars and above: the police shoot instead", () => {
    const w = new Wanted();
    w.set(3);
    expect(run(w, 10, held)).toEqual([]);
    expect(w.stars).toBe(3);
  });

  it("the fine grows with the level", () => {
    for (let s = 2; s <= WANTED.maxStars; s++) expect(WANTED.bustFine[s]!).toBeGreaterThan(WANTED.bustFine[s - 1]!);
  });
});

describe("police units and jobs", () => {
  it("caps cars and officers by level, and arms them from three stars", () => {
    expect(policeUnits(0)).toEqual({ cars: 0, officers: 0, armed: false, ram: false });
    expect(policeUnits(1).cars).toBe(1);
    expect(policeUnits(2).armed).toBe(false);
    expect(policeUnits(3)).toMatchObject({ armed: true, ram: true });
    for (let s = 1; s <= 5; s++) {
      expect(policeUnits(s).cars).toBeGreaterThanOrEqual(policeUnits(s - 1).cars);
      expect(policeUnits(s).officers).toBeGreaterThanOrEqual(policeUnits(s - 1).officers);
    }
    // A small cap keeps draw calls in budget even at five stars.
    expect(policeUnits(5).cars).toBeLessThanOrEqual(3);
    expect(policeUnits(5).officers).toBeLessThanOrEqual(4);
    expect(policeUnits(99)).toEqual(policeUnits(5));
  });

  it("no new jobs from two stars", () => {
    expect(jobsAllowed(0)).toBe(true);
    expect(jobsAllowed(1)).toBe(true);
    expect(jobsAllowed(2)).toBe(false);
    expect(jobsAllowed(5)).toBe(false);
  });

  it("names police groups", () => {
    expect(isPoliceGroup("police:3")).toBe(true);
    expect(isPoliceGroup("thieves")).toBe(false);
  });
});

describe("vehicle theft", () => {
  const rules = { own: ["car-start"], allowedKinds: [] as string[], taken: new Set<string>() };
  it("the player's own vehicle is never theft", () => {
    expect(isVehicleTheft({ id: "car-start", kind: "car" }, rules)).toBe(false);
  });
  it("someone else's parked car is", () => {
    expect(isVehicleTheft({ id: "car-3", kind: "car" }, rules)).toBe(true);
  });
  it("a job's vehicle is not, while the job asks for that kind", () => {
    expect(isVehicleTheft({ id: "ambulance", kind: "ambulance" }, { ...rules, allowedKinds: ["ambulance"] })).toBe(false);
    expect(isVehicleTheft({ id: "ambulance", kind: "ambulance" }, rules)).toBe(true);
  });
  it("is reported once per vehicle", () => {
    expect(isVehicleTheft({ id: "car-3", kind: "car" }, { ...rules, taken: new Set(["car-3"]) })).toBe(false);
  });
});
