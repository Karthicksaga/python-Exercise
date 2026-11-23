import { describe, expect, it } from "vitest";
import { FLINCH_TIME, fistAmount, flinchAmount, strikeFrame } from "./strikePose";

const W = 0.12;
const R = 0.26;

describe("strike poses over time", () => {
  it("a punch is drawn back, then fully out exactly when the blow lands, then back to the clip", () => {
    expect(strikeFrame("punch", 0, W, R)).toMatchObject({ from: "clip", to: "chamber", amount: 0 });
    expect(strikeFrame("punch", W * 0.5 + 1e-6, W, R)).toMatchObject({ from: "chamber", to: "jab" });
    // Just before the strike the arm is almost out; at the strike it is fully out.
    expect(strikeFrame("punch", W - 0.005, W, R)!.amount).toBeGreaterThan(0.8);
    expect(strikeFrame("punch", W, W, R)).toMatchObject({ from: "jab", to: "jab" });
    expect(strikeFrame("punch", W + R - 0.01, W, R)!.to).toBe("clip");
    expect(strikeFrame("punch", W + R, W, R)).toBeNull();
  });

  it("the bat goes back over the shoulder, comes across at the blow, and follows through", () => {
    const w = 0.22;
    const r = 0.38;
    expect(strikeFrame("bat", w * 0.3, w, r)).toMatchObject({ from: "clip", to: "batBack" });
    expect(strikeFrame("bat", w * 0.8, w, r)).toMatchObject({ from: "batBack", to: "batHit" });
    expect(strikeFrame("bat", w, w, r)).toMatchObject({ from: "batHit", to: "batFollow", amount: 0 });
    expect(strikeFrame("bat", w + r, w, r)).toBeNull();
  });

  it("the fist is closed by the blow and open again afterwards", () => {
    expect(fistAmount(0, W, R)).toBe(0);
    expect(fistAmount(W, W, R)).toBe(1);
    expect(fistAmount(W + R * 0.5, W, R)).toBe(1);
    expect(fistAmount(W + R - 0.001, W, R)).toBeLessThan(0.05);
    expect(fistAmount(W + R, W, R)).toBe(0);
  });

  it("a flinch snaps back fast and is over in well under half a second", () => {
    expect(flinchAmount(0)).toBe(0);
    expect(flinchAmount(0.06)).toBe(1);
    expect(flinchAmount(0.2)).toBeGreaterThan(0);
    expect(flinchAmount(0.2)).toBeLessThan(1);
    expect(flinchAmount(FLINCH_TIME)).toBe(0);
    expect(FLINCH_TIME).toBeLessThan(0.5);
  });
});
