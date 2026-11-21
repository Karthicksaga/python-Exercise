import { describe, expect, it } from "vitest";
import { DOOR_DELAY, DOOR_SLIDE, doorOpenness } from "./doors";
import { EMU_MOTION, RunProfile } from "./motion";

describe("train doors", () => {
  const dwell = EMU_MOTION.dwell;
  const stopped = (dwellLeft: number) => ({ s: 0, speed: 0, stoppedAt: 0, dwellLeft, nextStop: 1 });

  it("are shut while moving and open in the middle of a stop", () => {
    expect(doorOpenness({ s: 10, speed: 5, stoppedAt: null, dwellLeft: 0, nextStop: 0 }, dwell)).toBe(0);
    expect(doorOpenness(stopped(dwell / 2), dwell)).toBe(1);
  });

  it("open just after stopping and shut before leaving", () => {
    expect(doorOpenness(stopped(dwell), dwell)).toBe(0);
    expect(doorOpenness(stopped(dwell - DOOR_DELAY - DOOR_SLIDE / 2), dwell)).toBeCloseTo(0.5, 5);
    expect(doorOpenness(stopped(DOOR_DELAY), dwell)).toBe(0);
    expect(doorOpenness(stopped(0), dwell)).toBe(0);
  });

  it("are still fully open at the last moment a ticket is sold", () => {
    expect(doorOpenness(stopped(1.5), dwell)).toBe(1);
    expect(doorOpenness(stopped(1.4), dwell)).toBeLessThan(1);
  });

  it("move smoothly through a whole stop of a real run", () => {
    const profile = new RunProfile(3000, [1000, 2000]);
    let last = 0;
    let most = 0;
    for (let t = 0; t < profile.duration; t += 0.05) {
      const amount = doorOpenness(profile.state(t), dwell);
      expect(Math.abs(amount - last)).toBeLessThan(0.08);
      last = amount;
      most = Math.max(most, amount);
    }
    expect(most).toBe(1);
  });
});
