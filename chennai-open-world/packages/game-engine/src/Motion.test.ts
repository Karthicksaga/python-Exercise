import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXED_STEP, GameLoop } from "./GameLoop";
import { Motion } from "./Motion";

describe("Motion", () => {
  it("draws part-way between the last two steps", () => {
    const m = new Motion();
    m.step(0, 0, 0, 0);
    m.step(2, 1, -4, 0.4);
    expect(m.at(0)).toEqual({ x: 0, y: 0, z: 0, heading: 0 });
    expect(m.at(0.5)).toEqual({ x: 1, y: 0.5, z: -2, heading: 0.2 });
    expect(m.at(1)).toEqual({ x: 2, y: 1, z: -4, heading: 0.4 });
  });

  it("turns the short way across ±π", () => {
    const m = new Motion();
    m.step(0, 0, 0, Math.PI - 0.1);
    m.step(0, 0, 0, -Math.PI + 0.1);
    const h = m.at(0.5).heading;
    expect(Math.abs(Math.abs(h) - Math.PI)).toBeLessThan(1e-9);
  });

  it("doesn't slide across a teleport, a long jump or a respawn", () => {
    const m = new Motion();
    m.step(0, 0, 0, 0, 1);
    m.step(0.2, 0, 0, 0, 1);
    m.step(500, 0, 0, 0, 1); // teleport
    expect(m.at(0.5).x).toBe(500);
    m.step(500.2, 0, 0, 0, 2); // the slot was reused by a new agent close by
    expect(m.at(0).x).toBe(500.2);
    m.snap(10, 0, 10, 1);
    expect(m.at(0.3)).toEqual({ x: 10, y: 0, z: 10, heading: 1 });
  });
});

describe("GameLoop and Motion together", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Run the loop at a display rate, with something moving at a steady 6 m/s; the x drawn each frame. */
  function drawnPositions(hz: number, frames: number, smooth: boolean): number[] {
    const callbacks: Array<(now: number) => void> = [];
    vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => callbacks.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("performance", { now: () => 0 });
    let x = 0;
    const motion = new Motion();
    motion.step(0, 0, 0, 0);
    const drawn: number[] = [];
    const loop = new GameLoop({
      fixedUpdate: (dt) => {
        x += 6 * dt;
        motion.step(x, 0, 0, 0);
      },
      frame: (_dt, alpha) => drawn.push(smooth ? motion.at(alpha).x : x),
    });
    loop.start();
    for (let i = 1; i <= frames; i++) callbacks.shift()!((i * 1000) / hz);
    loop.stop();
    return drawn;
  }

  const moves = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i]!);

  it("at 120 Hz, drawing the last step moves in jumps (every other frame stands still)", () => {
    const steps = moves(drawnPositions(120, 60, false));
    expect(steps.filter((d) => d === 0).length).toBeGreaterThan(20);
  });

  it("at 120 Hz and at an uneven 50 Hz, the interpolated position moves the same amount every frame", () => {
    for (const hz of [120, 50, 90]) {
      const steps = moves(drawnPositions(hz, 90, true)).slice(4);
      const expected = 6 / hz;
      for (const d of steps) expect(Math.abs(d - expected)).toBeLessThan(expected * 0.02 + 1e-9);
    }
    expect(FIXED_STEP).toBeCloseTo(1 / 60);
  });
});
