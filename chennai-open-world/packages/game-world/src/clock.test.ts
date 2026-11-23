import { describe, expect, it } from "vitest";
import { GameClock } from "./clock";

describe("GameClock", () => {
  it("starts at golden hour, advances and wraps past midnight", () => {
    const clock = new GameClock();
    expect(clock.hour).toBeCloseTo(17.75);
    expect(clock.label).toBe("Evening");
    clock.hour = 23.9;
    clock.advance(60 * 0.2); // 12 real seconds at one hour per minute
    expect(clock.hour).toBeCloseTo(0.1, 5);
    expect(clock.text()).toBe("00:06");
  });
  it("cycles through the named times", () => {
    const clock = new GameClock(21.5);
    clock.next();
    expect(clock.label).toBe("Morning");
    expect(new GameClock(Number.NaN).hour).toBeCloseTo(17.75);
  });
});
