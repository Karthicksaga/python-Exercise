import { describe, expect, it } from "vitest";
import { MOVES, STANCES, armPoses, poseKey, sampleMove } from "./combatMoves";

describe("combat moves", () => {
  it("every move's keys are in order and inside its length, and it ends in the walk cycle", () => {
    for (const [id, move] of Object.entries(MOVES)) {
      let previous = 0;
      for (const key of move.keys) {
        expect(key.at, id).toBeGreaterThan(previous);
        previous = key.at;
      }
      expect(previous, id).toBeLessThan(move.duration);
      expect(sampleMove(move, move.duration)).toBeNull();
      expect(sampleMove(move, move.duration - 0.001)!.weight).toBeLessThan(0.05);
    }
  });

  it("eases in at the start and reaches each key exactly at its time", () => {
    const hook = MOVES.hook;
    expect(sampleMove(hook, 0)!.weight).toBe(0);
    expect(sampleMove(hook, 0.03)!.weight).toBeGreaterThan(0);
    const strike = sampleMove(hook, hook.keys[1]!.at)!;
    expect(strike.to).toBe(hook.keys[1]);
    expect(strike.blend).toBeCloseTo(1, 5);
    expect(strike.weight).toBe(1);
  });

  it("attacks are quick and reactions short, so fights stay responsive", () => {
    for (const id of ["jab", "cross", "recoil", "flinch"] as const) expect(MOVES[id].duration).toBeLessThanOrEqual(0.35);
    expect(MOVES.hook.duration).toBeLessThan(0.5);
    // The enemy's tell lasts at least as long as their wind-up in the rules (0.4 s).
    expect(MOVES.windup.duration).toBeGreaterThanOrEqual(0.4);
  });

  it("every arm pose is listed once for solving, with real directions", () => {
    const poses = armPoses();
    for (const move of Object.values(MOVES)) for (const key of move.keys) if (key.arms) expect(poses.has(poseKey(key.arms))).toBe(true);
    for (const stance of Object.values(STANCES)) expect(poses.has(poseKey(stance.arms!))).toBe(true);
    for (const arms of poses.values()) for (const d of Object.values(arms)) expect(Math.hypot(...d!)).toBeGreaterThan(0.3);
  });
});
