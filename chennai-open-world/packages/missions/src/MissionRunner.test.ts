import { describe, expect, it } from "vitest";
import { MissionRunner } from "./MissionRunner";
import type { Mission, PlayerStatus } from "./types";

const missions: Mission[] = [
  { id: "walk", stage: 1, title: "Walk", brief: "", reward: 50, objectives: [{ type: "reach", label: "Go to the stall", x: 10, z: 0, radius: 3 }] },
  {
    id: "fare",
    stage: 2,
    title: "Fare",
    brief: "",
    reward: 300,
    objectives: [
      { type: "enter", label: "Get in the auto", vehicle: "auto" },
      { type: "reach", label: "Pick up", x: 50, z: 0, radius: 5, mode: "auto", stop: true },
      { type: "reach", label: "Drop off", x: 100, z: 0, radius: 5, mode: "auto", stop: true, timeLimit: 10 },
    ],
  },
];
const at = (x: number, mode: PlayerStatus["mode"] = "foot", speed = 0): PlayerStatus => ({ x, z: 0, mode, speed });

describe("MissionRunner", () => {
  it("starts on the first stage and completes it when the marker is reached", () => {
    const runner = new MissionRunner(missions);
    expect(runner.mission?.id).toBe("walk");
    expect(runner.update(0.1, at(0))).toEqual([]);
    const events = runner.update(0.1, at(8));
    expect(events.map((e) => e.type)).toEqual(["completed"]);
    expect(runner.balance).toBe(50);
    expect(runner.mission?.id).toBe("fare");
  });

  it("requires the right vehicle and a full stop", () => {
    const runner = new MissionRunner(missions, { completed: ["walk"], money: 50 });
    // Standing where the pick-up is does nothing before getting in the auto.
    expect(runner.update(0.1, at(50))).toEqual([]);
    expect(runner.update(0.1, at(0, "car"))).toEqual([]);
    expect(runner.update(0.1, at(0, "auto"))[0]).toMatchObject({ type: "objective", label: "Pick up" });
    // Driving through the marker is not a pick-up.
    expect(runner.update(0.1, at(50, "auto", 8))).toEqual([]);
    expect(runner.update(0.1, at(50, "auto", 0.3))[0]).toMatchObject({ type: "objective", label: "Drop off" });
    expect(runner.secondsLeft).toBe(10);
  });

  it("fails a timed objective and restarts the stage", () => {
    const runner = new MissionRunner(missions, { completed: ["walk"], money: 50 });
    runner.update(0.1, at(0, "auto"));
    runner.update(0.1, at(50, "auto", 0));
    expect(runner.update(6, at(60, "auto", 5))).toEqual([]);
    const events = runner.update(6, at(70, "auto", 5));
    expect(events[0]).toMatchObject({ type: "failed", reason: "Out of time" });
    expect(runner.objective?.label).toBe("Get in the auto");
    expect(runner.balance).toBe(50);
  });

  it("pays the reward, reports the end and keeps progress", () => {
    const runner = new MissionRunner(missions, { completed: ["walk"], money: 50 });
    runner.update(0.1, at(0, "auto"));
    runner.update(0.1, at(50, "auto", 0));
    const events = runner.update(0.1, at(100, "auto", 0));
    expect(events.map((e) => e.type)).toEqual(["completed", "allDone"]);
    expect(runner.balance).toBe(350);
    expect(runner.mission).toBeNull();
    expect(runner.progress()).toEqual({ completed: ["walk", "fare"], money: 350 });
    expect(runner.update(1, at(0))).toEqual([]);
  });

  it("a defeat objective waits for its enemy group, and a knocked-out player restarts the stage", () => {
    const fight: Mission[] = [
      {
        id: "brawl",
        stage: 1,
        title: "Brawl",
        brief: "",
        reward: 600,
        objectives: [
          { type: "reach", label: "Go to the park", x: 10, z: 0, radius: 3 },
          { type: "defeat", label: "Beat the thugs", group: "park", x: 10, z: 0, radius: 12 },
        ],
      },
    ];
    const runner = new MissionRunner(fight, { completed: [], money: 130 });
    runner.update(0.1, at(10));
    expect(runner.objective?.label).toBe("Beat the thugs");
    expect(runner.update(0.1, at(10))).toEqual([]);
    expect(runner.update(0.1, { ...at(10), cleared: new Set(["other"]) })).toEqual([]);

    runner.restartStage();
    expect(runner.objective?.label).toBe("Go to the park");
    expect(runner.charge(100)).toBe(100);
    expect(runner.charge(100)).toBe(30); // only what is left
    expect(runner.balance).toBe(0);

    runner.update(0.1, at(10));
    const events = runner.update(0.1, { ...at(10), cleared: new Set(["park"]) });
    expect(events[0]).toMatchObject({ type: "completed" });
    expect(runner.balance).toBe(600);
  });

  it("ignores saved stages that no longer exist and can reset", () => {
    const runner = new MissionRunner(missions, { completed: ["walk", "deleted"], money: 70.9 });
    expect(runner.stagesDone).toBe(1);
    expect(runner.balance).toBe(70);
    runner.reset();
    expect(runner.mission?.id).toBe("walk");
    expect(runner.balance).toBe(0);
  });
});
