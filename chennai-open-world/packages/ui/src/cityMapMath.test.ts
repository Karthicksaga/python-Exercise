import { describe, expect, it } from "vitest";
import {
  ZOOM_BANDS,
  chainLines,
  straightRuns,
  bandFor,
  cellsIn,
  clampCentre,
  clampScale,
  fitScale,
  panBy,
  pinToEdge,
  pinchView,
  scaleBar,
  screenToWorld,
  simplify,
  visibleBox,
  worldToScreen,
  zoomAbout,
  type CityView,
} from "./cityMapMath";

const view: CityView = { cx: 3269, cz: 4960, scale: 0.5, width: 915, height: 412 };
const limits = { min: 0.03, max: 6 };
const city = { minX: -1615, maxX: 8633, minZ: -1091, maxZ: 11655 };

describe("projection", () => {
  it("puts the centre in the middle of the screen, north up (−z is up)", () => {
    expect(worldToScreen(view, 3269, 4960)).toEqual({ x: 457.5, y: 206 });
    const north = worldToScreen(view, 3269, 4960 - 100);
    expect(north.x).toBeCloseTo(457.5);
    expect(north.y).toBeCloseTo(206 - 50); // 100 m at 0.5 px/m
    const east = worldToScreen(view, 3269 + 100, 4960);
    expect(east.x).toBeCloseTo(457.5 + 50);
  });

  it("screen → world is the inverse of world → screen", () => {
    for (const [x, z] of [[0, 0], [-1615, 11655], [8000, 20], [3269.4, 4960.7]] as const) {
      const p = worldToScreen(view, x, z);
      const back = screenToWorld(view, p.x, p.y);
      expect(back.x).toBeCloseTo(x, 6);
      expect(back.z).toBeCloseTo(z, 6);
    }
  });

  it("the visible box is the screen in metres, plus padding", () => {
    const box = visibleBox(view, 10);
    expect(box.maxX - box.minX).toBeCloseTo((915 + 20) / 0.5);
    expect(box.maxZ - box.minZ).toBeCloseTo((412 + 20) / 0.5);
    expect((box.minX + box.maxX) / 2).toBeCloseTo(3269);
  });
});

describe("zoom", () => {
  it("clamps the scale between the limits (and recovers from nonsense)", () => {
    expect(clampScale(100, limits)).toBe(6);
    expect(clampScale(0.001, limits)).toBe(0.03);
    expect(clampScale(1, limits)).toBe(1);
    expect(clampScale(Number.NaN, limits)).toBe(0.03);
  });

  it("the whole city fits on screen at the fit scale", () => {
    const s = fitScale(city, 915, 412, 12);
    expect((city.maxX - city.minX) * s).toBeLessThanOrEqual(915 - 24 + 1e-9);
    expect((city.maxZ - city.minZ) * s).toBeLessThanOrEqual(412 - 24 + 1e-9);
    // Tall city, wide screen: height is the limit.
    expect((city.maxZ - city.minZ) * s).toBeCloseTo(412 - 24);
  });

  it("zooming about a point keeps that point's world position under it", () => {
    const at = { x: 700, y: 100 };
    const before = screenToWorld(view, at.x, at.y);
    const zoomed = zoomAbout(view, 2, at.x, at.y, limits);
    expect(zoomed.scale).toBe(1);
    const after = screenToWorld(zoomed, at.x, at.y);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.z).toBeCloseTo(before.z, 6);
  });

  it("zooming past the limit stops at it, still anchored", () => {
    const zoomed = zoomAbout({ ...view, scale: 5 }, 4, 457.5, 206, limits);
    expect(zoomed.scale).toBe(6);
    expect(zoomed.cx).toBeCloseTo(view.cx);
  });

  it("chooses more detail the further in", () => {
    expect(bandFor(0.03)).toBe(0);
    expect(bandFor(0.1)).toBe(1);
    expect(bandFor(0.5)).toBe(2);
    expect(bandFor(1)).toBe(3);
    expect(bandFor(6)).toBe(ZOOM_BANDS.length - 1);
    // Every band draws what the one before did, and more.
    for (let i = 1; i < ZOOM_BANDS.length; i++) {
      for (const kind of ZOOM_BANDS[i - 1]!.kinds) expect(ZOOM_BANDS[i]!.kinds.has(kind)).toBe(true);
      expect(ZOOM_BANDS[i]!.tolerance).toBeLessThan(ZOOM_BANDS[i - 1]!.tolerance);
    }
  });
});

describe("gestures", () => {
  it("a drag moves the map with the finger", () => {
    const moved = panBy(view, 100, -50);
    // The world point that was in the middle is now 100 px right and 50 px up.
    const p = worldToScreen(moved, view.cx, view.cz);
    expect(p.x).toBeCloseTo(557.5);
    expect(p.y).toBeCloseTo(156);
  });

  it("pinching apart doubles the scale when the fingers' distance doubles", () => {
    const a0 = { x: 400, y: 200 };
    const b0 = { x: 500, y: 200 };
    const result = pinchView(view, a0, b0, { x: 350, y: 200 }, { x: 550, y: 200 }, limits);
    expect(result.scale).toBeCloseTo(1);
    // The midpoint (450, 200) did not move, so the world under it is the same.
    const before = screenToWorld(view, 450, 200);
    const after = screenToWorld(result, 450, 200);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.z).toBeCloseTo(before.z, 6);
  });

  it("a pinch that slides also pans: the world point under the midpoint follows it", () => {
    const a0 = { x: 400, y: 200 };
    const b0 = { x: 500, y: 200 };
    const anchor = screenToWorld(view, 450, 200);
    const result = pinchView(view, a0, b0, { x: 300, y: 300 }, { x: 350, y: 300 }, limits);
    expect(result.scale).toBeCloseTo(0.25);
    const p = worldToScreen(result, anchor.x, anchor.z);
    expect(p.x).toBeCloseTo(325);
    expect(p.y).toBeCloseTo(300);
  });

  it("pinching is clamped to the zoom limits", () => {
    const result = pinchView({ ...view, scale: 4 }, { x: 400, y: 200 }, { x: 410, y: 200 }, { x: 100, y: 200 }, { x: 800, y: 200 }, limits);
    expect(result.scale).toBe(6);
  });

  it("the centre can't be dragged off the city", () => {
    const far = clampCentre({ ...view, cx: 50_000, cz: -50_000 }, city);
    expect(far.cx).toBe(city.maxX);
    expect(far.cz).toBe(city.minZ);
    const inside = clampCentre(view, city);
    expect(inside).toBe(view);
    // Zoomed right out, the city is held in the middle.
    const out = clampCentre({ ...view, scale: 0.02, cx: 0 }, city);
    expect(out.cx).toBeCloseTo((city.minX + city.maxX) / 2);
  });
});

describe("culling", () => {
  it("lists the grid cells a box touches", () => {
    expect(cellsIn({ minX: 10, maxX: 990, minZ: 10, maxZ: 20 }, 1000)).toEqual([[0, 0]]);
    expect(cellsIn({ minX: -10, maxX: 1010, minZ: 10, maxZ: 20 }, 1000)).toEqual([[-1, 0], [0, 0], [1, 0]]);
    expect(cellsIn({ minX: 0, maxX: 500, minZ: -1500, maxZ: -600 }, 1000)).toEqual([[0, -2], [0, -1]]);
  });

  it("only the cells around the view are drawn at street level, the whole city zoomed out", () => {
    const near = cellsIn(visibleBox({ ...view, scale: 2 }, 40), 1000);
    expect(near.length).toBeLessThanOrEqual(2);
    const whole = cellsIn(visibleBox({ ...view, scale: fitScale(city, 915, 412, 12) }, 40), 1000);
    expect(whole.length).toBeGreaterThan(100);
  });
});

describe("simplify", () => {
  it("drops points on a straight line and keeps the corners", () => {
    const line = [
      { x: 0, z: 0 },
      { x: 10, z: 0.1 },
      { x: 20, z: 0 },
      { x: 20, z: 20 },
    ];
    expect(simplify(line, 1)).toEqual([line[0], line[2], line[3]]);
    expect(simplify(line, 0)).toEqual(line);
    expect(simplify(line, 0.05)).toEqual(line);
  });

  it("never drops the ends, and keeps a two-point line", () => {
    const two = [{ x: 0, z: 0 }, { x: 1, z: 1 }];
    expect(simplify(two, 100)).toEqual(two);
    const zig = Array.from({ length: 50 }, (_, i) => ({ x: i, z: i % 2 }));
    const out = simplify(zig, 10);
    expect(out[0]).toEqual(zig[0]);
    expect(out[out.length - 1]).toEqual(zig[49]);
    expect(out.length).toBe(2);
  });
});

describe("scale bar and edge pins", () => {
  it("picks a round distance no longer than the space given", () => {
    expect(scaleBar(0.5, 110)).toEqual({ metres: 200, px: 100, label: "200 m" });
    expect(scaleBar(0.03, 110).label).toBe("2 km");
    expect(scaleBar(6, 110)).toEqual({ metres: 10, px: 60, label: "10 m" });
    for (const s of [0.02, 0.07, 0.3, 1.1, 4]) expect(scaleBar(s, 110).px).toBeLessThanOrEqual(110 + 1e-9); // floating point: 100 m × 1.1
  });

  it("pins an off-screen point to the edge, pointing at it", () => {
    const inside = pinToEdge(view, { x: 100, y: 100 }, 30);
    expect(inside.inside).toBe(true);
    const east = pinToEdge(view, { x: 5000, y: 206 }, 30);
    expect(east.inside).toBe(false);
    expect(east.x).toBeCloseTo(915 - 30);
    expect(east.y).toBeCloseTo(206);
    expect(east.angle).toBeCloseTo(0);
    const north = pinToEdge(view, { x: 457.5, y: -9000 }, 30);
    expect(north.y).toBeCloseTo(30);
  });
});

describe("street name placement", () => {
  it("joins a street's pieces that meet end to end, whichever way each was drawn", () => {
    const a = [{ x: 0, z: 0 }, { x: 100, z: 0 }];
    const b = [{ x: 200, z: 0 }, { x: 100, z: 0 }]; // drawn backwards
    const c = [{ x: 200, z: 0 }, { x: 300, z: 0.2 }];
    const apart = [{ x: 0, z: 500 }, { x: 50, z: 500 }];
    const chains = chainLines([b, apart, c, a]);
    expect(chains).toHaveLength(2);
    const long = chains.find((ch) => ch.length === 4)!;
    const xs = long.map((p) => p.x);
    expect(xs[0] === 0 ? xs : [...xs].reverse()).toEqual([0, 100, 200, 300]);
  });

  it("finds the straight stretches long enough for a name, text kept upright", () => {
    // East 300 m, then a right-angle turn south for 30 m.
    const line = [{ x: 0, z: 0 }, { x: 100, z: 1 }, { x: 300, z: 0 }, { x: 300, z: 30 }];
    const runs = straightRuns(line, 0.2, 40);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.length).toBeCloseTo(300);
    expect(runs[0]!.x).toBeCloseTo(150);
    expect(Math.abs(runs[0]!.angle)).toBeLessThan(0.01);
    // A street drawn west to east or east to west reads the same way.
    const back = straightRuns([...line].reverse(), 0.2, 40);
    expect(back[back.length - 1]!.angle).toBeCloseTo(runs[0]!.angle, 5);
    for (const run of straightRuns([{ x: 0, z: 0 }, { x: -50, z: -50 }], 0.2, 10)) {
      expect(run.angle).toBeGreaterThanOrEqual(-Math.PI / 2);
      expect(run.angle).toBeLessThanOrEqual(Math.PI / 2);
    }
  });
});
