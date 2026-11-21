import { describe, expect, it } from "vitest";
import { JobRunner } from "./jobs";

describe("reputation lost outside a job (hitting a pedestrian)", () => {
  it("drops by the points asked, never below zero, and is saved in the record", () => {
    const runner = new JobRunner({ reputation: 50 });
    expect(runner.loseReputation(20)).toBe(20);
    expect(runner.reputation).toBe(30);
    expect(runner.record().reputation).toBe(30);
    expect(runner.loseReputation(45)).toBe(30);
    expect(runner.reputation).toBe(0);
    expect(runner.loseReputation(-5)).toBe(0); // never a gain
    expect(runner.reputation).toBe(0);
  });
});
