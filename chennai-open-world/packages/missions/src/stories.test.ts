import { describe, expect, it } from "vitest";
import { StoryRunner, type Story } from "./stories";
import type { PlayerStatus } from "./types";

const checkup: Story = {
  id: "checkup",
  title: "Paati's check-up",
  brief: "",
  reward: 400,
  offeredAt: "home",
  ending: "",
  steps: [
    { type: "enter", label: "Get in a car", vehicle: "car" },
    { type: "reach", label: "Drive to the hospital", x: 100, z: 0, radius: 8, mode: "car", stop: true },
    { type: "activity", label: "Go in for the check-up", place: "hospital", activity: "checkup", x: 100, z: 5, radius: 3 },
    { type: "reach", label: "Drive home", x: 0, z: 0, radius: 8, mode: "car", stop: true, timeLimit: 60 },
  ],
};
const race: Story = {
  id: "race",
  title: "Gym bet",
  brief: "",
  reward: 300,
  offeredAt: "gym",
  ending: "",
  steps: [
    { type: "activity", label: "Win the workout", place: "gym", activity: "challenge", x: 0, z: 0, radius: 3 },
    { type: "reach", label: "Race to the juice shop", x: 50, z: 0, radius: 4, mode: "foot", timeLimit: 20 },
  ],
};
const at = (x: number, z: number, mode: PlayerStatus["mode"] = "foot", speed = 0): PlayerStatus => ({ x, z, mode, speed });

describe("StoryRunner", () => {
  it("offers unfinished stories at their place and runs the steps in order", () => {
    const runner = new StoryRunner([checkup, race]);
    expect(runner.offeredAt("home").map((s) => s.id)).toEqual(["checkup"]);
    expect(runner.offeredAt("gym").map((s) => s.id)).toEqual(["race"]);
    expect(runner.start("checkup")[0]?.type).toBe("started");
    // Only one at a time.
    expect(runner.start("race")).toEqual([]);

    expect(runner.update(0.1, at(0, 0))).toEqual([]);
    expect(runner.update(0.1, at(0, 0, "car"))[0]).toMatchObject({ type: "step", index: 1 });
    // Moving through the marker too fast does not count; stopping does.
    expect(runner.update(0.1, at(100, 0, "car", 5))).toEqual([]);
    expect(runner.update(0.1, at(100, 0, "car", 0))[0]).toMatchObject({ type: "step", index: 2 });

    // The activity step: wanted at the hospital only, met when that activity is reported.
    expect(runner.wanted("hospital")?.activity).toBe("checkup");
    expect(runner.wanted("home")).toBeNull();
    expect(runner.update(5, at(100, 5))).toEqual([]);
    expect(runner.activity("hospital", "treat")).toEqual([]);
    expect(runner.activity("hospital", "checkup")[0]).toMatchObject({ type: "step", index: 3 });
    expect(runner.secondsLeft).toBe(60);

    const done = runner.update(1, at(0, 0, "car", 0));
    expect(done[0]).toMatchObject({ type: "completed", reward: 400 });
    expect(runner.story).toBeNull();
    expect(runner.completed.has("checkup")).toBe(true);
    expect(runner.offeredAt("home")).toEqual([]);
    expect(runner.start("checkup")).toEqual([]);
  });

  it("running out of time ends the story; it can be started again", () => {
    const runner = new StoryRunner([race]);
    runner.start("race");
    runner.activity("gym", "challenge");
    expect(runner.secondsLeft).toBe(20);
    expect(runner.update(19, at(10, 0))).toEqual([]);
    expect(runner.update(1.5, at(20, 0))[0]).toMatchObject({ type: "failed", reason: "Out of time" });
    expect(runner.story).toBeNull();
    expect(runner.offeredAt("gym")).toHaveLength(1);
    runner.start("race");
    runner.activity("gym", "challenge");
    // Reaching it in a vehicle does not count: the race is on foot.
    expect(runner.update(1, at(50, 0, "bike"))).toEqual([]);
    expect(runner.update(1, at(50, 0))[0]).toMatchObject({ type: "completed", reward: 300 });
  });

  it("quitting is free, saved ids are kept, unknown ones dropped", () => {
    const runner = new StoryRunner([checkup, race], ["race", "gone"]);
    expect([...runner.completed]).toEqual(["race"]);
    runner.start("checkup");
    expect(runner.quit()[0]).toMatchObject({ type: "failed", reason: "Story abandoned" });
    expect(runner.story).toBeNull();
    runner.reset();
    expect(runner.completed.size).toBe(0);
  });
});
