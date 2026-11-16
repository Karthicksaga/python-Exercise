import { describe, expect, it } from "vitest";
import { JobRunner, START_REPUTATION, type Job, type JobPlayer } from "./jobs";

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
