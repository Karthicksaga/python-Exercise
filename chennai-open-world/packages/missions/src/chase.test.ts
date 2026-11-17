import { describe, expect, it } from "vitest";
import { CHASE_BURST, CHASE_EASE, pathLength, pointAlong, quarrySpeed } from "./chase";
import { MissionRunner } from "./MissionRunner";
import type { Mission, PlayerStatus } from "./types";

const path = [
  { x: 0, z: 0 },
  { x: 0, z: -100 },
  { x: 100, z: -100 },
];

describe("chase rules", () => {
  it("measures a path and finds points along it with their heading", () => {
    expect(pathLength(path)).toBe(200);
    expect(pointAlong(path, 50)).toEqual({ x: 0, z: -50, heading: -0 });
    const corner = pointAlong(path, 150);
    expect(corner.x).toBeCloseTo(50, 9);
    expect(corner.z).toBe(-100);
    expect(corner.heading).toBeCloseTo(-Math.PI / 2, 9); // heading east
    expect(pointAlong(path, 999)).toMatchObject({ x: 100, z: -100 });
    expect(pointAlong(path, -5)).toMatchObject({ x: 0, z: 0 });
  });

  it("the quarry eases off when far ahead and bursts away when close", () => {
    expect(quarrySpeed(10, 30)).toBe(10);
    expect(quarrySpeed(10, 100)).toBeCloseTo(10 * CHASE_EASE, 9);
    expect(quarrySpeed(10, 5)).toBeCloseTo(10 * CHASE_BURST, 9);
  });
});

const chase: Mission = {
  id: "courier",
  stage: 11,
  title: "Courier",
  brief: "",
  reward: 2000,
  weapons: [{ id: "shotgun", ammo: 10 }],
  objectives: [
    { type: "chase", label: "Stop the courier", path, speed: 10, radius: 6, quarry: "bike" },
    { type: "reach", label: "Take the package back", x: 0, z: 0, radius: 5, hostiles: "ambush" },
  ],
};
const at = (x: number, z: number, mode: PlayerStatus["mode"] = "car"): PlayerStatus => ({ x, z, mode, speed: 10 });

describe("MissionRunner chase objective", () => {
  it("the quarry runs along its path from the start of the objective", () => {
    const runner = new MissionRunner([chase]);
    expect(runner.quarry).toMatchObject({ x: 0, z: 0 });
    // Player 30 m behind: normal speed.
    for (let i = 0; i < 60; i++) runner.update(1 / 60, at(0, 30));
    expect(runner.quarry!.z).toBeCloseTo(-10, 6);
  });

  it("is caught by drawing alongside in a vehicle, not on foot", () => {
    const runner = new MissionRunner([chase]);
    runner.update(1, at(0, 30));
    const q = runner.quarry!;
    expect(runner.update(0.01, at(q.x + 3, q.z, "foot"))).toEqual([]);
    expect(runner.update(0.01, at(q.x + 3, q.z, "bike"))).toEqual([{ type: "objective", label: "Take the package back" }]);
    expect(runner.quarry).toBeNull();
  });

  it("fails and starts again when the quarry reaches the end of its path", () => {
    const runner = new MissionRunner([chase]);
    const events = [];
    // The player is far behind: the quarry eases off but still gets away in time.
    for (let i = 0; i < 60 * 60 && events.length === 0; i++) events.push(...runner.update(1 / 60, at(900, 900)));
    expect(events).toEqual([{ type: "failed", mission: chase, reason: "They got away" }]);
    expect(runner.objective?.type).toBe("chase");
    expect(runner.quarry).toMatchObject({ x: 0, z: 0 }); // back at the start
  });

  it("pays money on completion; the weapons reward travels with the mission", () => {
    const runner = new MissionRunner([chase]);
    runner.update(0.01, at(0, 2));
    const done = runner.update(0.01, at(0, 0, "foot"));
    expect(done[0]).toEqual({ type: "completed", mission: chase });
    expect(runner.balance).toBe(2000);
    expect(chase.weapons).toEqual([{ id: "shotgun", ammo: 10 }]);
  });
});
