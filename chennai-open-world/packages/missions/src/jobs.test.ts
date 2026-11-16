import { describe, expect, it } from "vitest";
import { avoidPenalty, hoursText, insideZone, JobRunner, openAt, START_REPUTATION, type AvoidZone, type Job, type JobPlayer } from "./jobs";

const ambulance: Job = {
  id: "amb",
  kind: "ambulance",
  title: "Ambulance run",
  brief: "",
  vehicle: "ambulance",
  stops: [
    { label: "Pick up the patient", x: 100, z: 0, radius: 6, dwell: 2 },
    { label: "Drive to the hospital", x: 300, z: 0, radius: 8 },
  ],
  timeLimit: 100,
  payout: 1000,
  fine: 150,
  maxBumps: 3,
};
const bus: Job = {
  id: "bus",
  kind: "bus",
  title: "Bus route",
  brief: "",
  vehicle: "bus",
  stops: [
    { label: "Stop 1", x: 10, z: 0, radius: 6, dwell: 1, due: 5 },
    { label: "Stop 2", x: 20, z: 0, radius: 6, dwell: 1, due: 6 },
  ],
  timeLimit: 60,
  payout: 1000,
  fine: 100,
  minReputation: 55,
};
const at = (x: number, mode: JobPlayer["mode"] = "ambulance", speed = 0): JobPlayer => ({ x, z: 0, mode, speed });

/** Step the runner for `seconds` at one place, collecting the event types. */
function hold(runner: JobRunner, seconds: number, player: JobPlayer): string[] {
  const types: string[] = [];
  for (let t = 0; t < seconds; t += 0.1) types.push(...runner.update(0.1, player).map((e) => e.type));
  return types;
}

describe("JobRunner", () => {
  it("starts the clock only once the player is in the job's vehicle", () => {
    const runner = new JobRunner();
    expect(runner.accept(ambulance).map((e) => e.type)).toEqual(["accepted"]);
    expect(hold(runner, 5, at(0, "foot"))).toEqual([]);
    expect(runner.secondsLeft).toBeNull();
    expect(runner.update(0.1, at(0)).map((e) => e.type)).toEqual(["started"]);
    expect(runner.secondsLeft).toBeCloseTo(99.9, 5);
  });

  it("needs the vehicle stopped inside the marker for the dwell time", () => {
    const runner = new JobRunner();
    runner.accept(ambulance);
    runner.update(0.1, at(0));
    // Rolling through the marker does not count.
    expect(hold(runner, 3, at(100, "ambulance", 5))).toEqual([]);
    expect(runner.stopNumber).toBe(0);
    // Stopped, but for less than the dwell time.
    hold(runner, 1, at(100));
    expect(runner.dwellLeft).toBeGreaterThan(0);
    expect(runner.stopNumber).toBe(0);
    expect(hold(runner, 1.2, at(100))).toContain("stop");
    expect(runner.stop?.label).toBe("Drive to the hospital");
  });

  it("pays more for a fast, smooth run and raises reputation", () => {
    const runner = new JobRunner();
    runner.accept(ambulance);
    runner.update(0.1, at(0));
    hold(runner, 2.2, at(100));
    const events = runner.update(0.1, at(300));
    const done = events.find((e) => e.type === "completed");
    expect(done?.type).toBe("completed");
    if (done?.type !== "completed") return;
    // About 97% of the time left, no bumps: base share plus the smooth-ride bonus.
    expect(done.result.pay).toBeGreaterThan(1150);
    expect(done.result.stars).toBe(5);
    expect(runner.reputation).toBe(START_REPUTATION + 3);
    expect(runner.job).toBeNull();
    expect(runner.record().best.amb).toBe(done.result.pay);
  });

  it("cuts the pay for bumps and fails the ambulance run after too many", () => {
    const runner = new JobRunner();
    runner.accept(ambulance);
    expect(runner.bump()).toEqual([]); // not counted before the job has started
    runner.update(0.1, at(0));
    runner.bump();
    runner.bump();
    const third = runner.bump().map((e) => e.type);
    expect(third).toEqual(["bump", "failed"]);
    expect(runner.job).toBeNull();
    expect(runner.reputation).toBe(START_REPUTATION - 5);
  });

  it("fails when time runs out, with a fine and lost reputation, and the game goes on", () => {
    const runner = new JobRunner();
    runner.accept(ambulance);
    runner.update(0.1, at(0));
    const events = runner.update(200, at(0));
    const failed = events.find((e) => e.type === "failed");
    expect(failed).toMatchObject({ type: "failed", reason: "Out of time", fine: 150, reputation: -5 });
    expect(runner.job).toBeNull();
    // Another job can be taken straight away.
    expect(runner.accept(ambulance)).toHaveLength(1);
  });

  it("locks jobs behind reputation and counts late bus stops", () => {
    const runner = new JobRunner({ reputation: 40 });
    expect(runner.available(bus)).toEqual({ ok: false, reason: "Needs reputation 55" });
    expect(runner.accept(bus)).toEqual([]);

    const trusted = new JobRunner({ reputation: 60 });
    trusted.accept(bus);
    trusted.update(0.1, at(0, "bus"));
    hold(trusted, 1.2, at(10, "bus")); // on time
    hold(trusted, 6, at(0, "bus")); // dawdle past stop 2's time
    expect(hold(trusted, 1.2, at(20, "bus"))).toContain("completed");
    expect(trusted.job).toBeNull();
    expect(trusted.record().done).toBe(1);
    expect(trusted.reputation).toBe(60 + 4 - 2); // 4 stars: one stop late
  });

  it("quitting counts as a failure", () => {
    const runner = new JobRunner();
    runner.accept(ambulance);
    expect(runner.available(ambulance).ok).toBe(false);
    expect(runner.quit()[0]).toMatchObject({ type: "failed", reason: "Job abandoned" });
    expect(runner.record()).toMatchObject({ failed: 1, done: 0 });
  });

  it("ignores damaged saved records", () => {
    const runner = new JobRunner({ reputation: Number.NaN, done: -3 });
    expect(runner.reputation).toBe(START_REPUTATION);
    expect(runner.jobsDone).toBe(0);
  });
});

// A drive along the x axis with a jammed main road on it between x 400 and 600.
const jam: AvoidZone = {
  name: "Anna Salai",
  points: [400, 425, 450, 475, 500, 525, 550, 575, 600].map((x) => ({ x, z: 0, radius: 12 })),
  grace: 10,
};
const evening: Job = {
  id: "evening",
  kind: "cab",
  title: "Evening drive",
  brief: "",
  vehicle: "car",
  stops: [
    { label: "Pick up your friend", x: 0, z: 0, radius: 8, dwell: 1 },
    { label: "Drop at the beach", x: 1000, z: 0, radius: 8, dwell: 1 },
  ],
  timeLimit: 600,
  payout: 1000,
  fine: 100,
  hours: { from: 16, to: 20.5 },
  avoid: jam,
  startRadius: 300,
};
const car = (x: number, z = 0, speed = 0): JobPlayer => ({ x, z, mode: "car", speed });

/** Run the evening job: pick up, `onJam` seconds driving inside the jam, then drop. */
function eveningRun(onJam: number) {
  const runner = new JobRunner();
  runner.accept(evening, 17);
  runner.update(0.1, car(0));
  hold(runner, 1.2, car(0));
  for (let t = 0; t < onJam - 1e-9; t += 0.1) runner.update(0.1, car(500, 0, 3));
  const events: ReturnType<JobRunner["update"]> = [];
  for (let t = 0; t < 1.3; t += 0.1) events.push(...runner.update(0.1, car(1000)));
  const done = events.find((e) => e.type === "completed");
  if (done?.type !== "completed") throw new Error("not completed");
  return done.result;
}

describe("evening hours", () => {
  it("is open inside the window only, also across midnight", () => {
    expect(openAt(undefined, 3)).toBe(true);
    expect(openAt(evening.hours, 15.9)).toBe(false);
    expect(openAt(evening.hours, 16)).toBe(true);
    expect(openAt(evening.hours, 20.4)).toBe(true);
    expect(openAt(evening.hours, 20.5)).toBe(false);
    expect(openAt({ from: 22, to: 2 }, 23)).toBe(true);
    expect(openAt({ from: 22, to: 2 }, 1)).toBe(true);
    expect(openAt({ from: 22, to: 2 }, 12)).toBe(false);
    expect(openAt(evening.hours, 24 + 17)).toBe(true);
    expect(hoursText({ from: 16, to: 20.5 })).toBe("16:00–20:30");
  });

  it("the board offers the job only in the evening and says when", () => {
    const runner = new JobRunner();
    expect(runner.available(evening, 9)).toEqual({ ok: false, reason: "Offered 16:00–20:30 only" });
    expect(runner.accept(evening, 9)).toEqual([]);
    expect(runner.available(evening, 18)).toEqual({ ok: true });
    // Jobs without hours do not depend on the time.
    expect(runner.available(ambulance, 3)).toEqual({ ok: true });
    expect(runner.accept(evening, 18).map((e) => e.type)).toEqual(["accepted"]);
  });
});

describe("start radius", () => {
  it("starts the clock only near the first stop, so the drive there is free", () => {
    const runner = new JobRunner();
    runner.accept(evening, 17);
    expect(hold(runner, 5, car(-2000))).toEqual([]);
    expect(runner.started).toBe(false);
    expect(runner.update(0.1, car(-250)).map((e) => e.type)).toEqual(["started"]);
  });
});

describe("avoid zone", () => {
  it("tells when a point is on the avoided road", () => {
    expect(insideZone(jam, 500, 8)).toBe(true);
    expect(insideZone(jam, 510, 20)).toBe(false);
    expect(insideZone(jam, 300, 0)).toBe(false);
  });

  it("pays a bonus within the grace time and cuts pay and stars beyond it", () => {
    expect(avoidPenalty(jam, 4)).toEqual({ share: 0.1, stars: 0, note: "Kept off Anna Salai: +10%" });
    expect(avoidPenalty(jam, 50)).toEqual({ share: -0.32, stars: 1, note: "Stuck on Anna Salai for 50 s: -32%" });
    expect(avoidPenalty(jam, 75).stars).toBe(2);
    expect(avoidPenalty(jam, 1000).share).toBe(-0.5);
  });

  it("counts time inside only while the job runs, with an event each time the player enters", () => {
    const runner = new JobRunner();
    runner.accept(evening, 17);
    // Before the clock starts, being inside does not count.
    runner.update(1, car(500, 0, 3));
    expect(runner.avoidSeconds).toBe(0);
    runner.update(0.1, car(0));
    expect(runner.update(0.1, car(500, 0, 3)).map((e) => e.type)).toEqual(["avoid"]);
    expect(runner.update(0.1, car(500, 0, 3))).toEqual([]);
    runner.update(0.1, car(300, 0, 3));
    expect(runner.update(0.1, car(500, 0, 3)).map((e) => e.type)).toEqual(["avoid"]);
    expect(runner.avoidSeconds).toBeCloseTo(0.3, 5);
  });

  it("a clean drive earns more and rates higher than one stuck on the avoided road", () => {
    const clean = eveningRun(3);
    const stuck = eveningRun(40);
    expect(clean.notes).toContain("Kept off Anna Salai: +10%");
    expect(clean.stars).toBe(5);
    expect(stuck.avoided).toBeCloseTo(40, 0);
    expect(stuck.notes).toContain("Stuck on Anna Salai for 40 s: -24%");
    expect(stuck.stars).toBe(4);
    expect(stuck.pay).toBeLessThan(clean.pay * 0.8);
  });
});
