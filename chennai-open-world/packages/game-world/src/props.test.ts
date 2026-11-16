import { describe, expect, it } from "vitest";
import { POLE, SHELTER, chunkFurniture, type FurnitureMap } from "./furniture";
import { PROP_FRONT, PROP_PITCH, PROP_SIZE, chunkProps, propCorners, propSolids, propsAlong } from "./props";
import { pointInPolygon } from "./geometry";
import type { Building, ChunkData, Road } from "./types";

/** A long east-west primary road and a side street crossing it at x = 0. */
const primary: Road = { id: 21, kind: "primary", width: 10, oneway: false, points: [{ x: -480, z: 0 }, { x: 0, z: 0 }, { x: 480, z: 0 }] };
const side: Road = { id: 22, kind: "residential", width: 6, oneway: false, points: [{ x: 0, z: -200 }, { x: 0, z: 0 }, { x: 0, z: 200 }] };
const bounds = { minX: -500, maxX: 500, minZ: -500, maxZ: 500 };
const map: FurnitureMap = { roads: [primary, side], busStops: [{ x: 60, z: 7 }], bounds, chunkSize: 250 };
const chunk = (col: number, row: number, buildings: Building[] = []): ChunkData => ({ key: `${col},${row}`, col, row, buildings, trees: [], areas: [] });
/** Chunks along the road (z = 0 is the edge between rows 1 and 2). */
const roadChunks = (buildings: Building[] = []) => [0, 1, 2, 3].flatMap((col) => [chunk(col, 1, buildings), chunk(col, 2, buildings)]);

describe("propsAlong", () => {
  it("stands at the back of the pavement, facing the road, on both sides", () => {
    const props = propsAlong(primary, [0, 480, 960], 0, 960, []);
    expect(props.length).toBeGreaterThan(10);
    for (const p of props) {
      const front = Math.abs(p.z) - PROP_SIZE[p.kind].hz;
      // Front edge on the pavement's back line (a slight skew moves the corners, not the centre).
      expect(front).toBeGreaterThanOrEqual(5 + PROP_FRONT - 0.01);
      expect(front).toBeLessThan(5 + PROP_FRONT + 0.2);
      // Facing the road: local -Z points back towards z = 0.
      const fz = -Math.cos(p.yaw);
      expect(Math.sign(fz)).toBe(-Math.sign(p.z));
    }
    expect(props.some((p) => p.z > 0) && props.some((p) => p.z < 0)).toBe(true);
  });
  it("does not depend on how the road is cut into chunks", () => {
    const along = [0, 480, 960];
    const whole = propsAlong(primary, along, 0, 960, []);
    const parts = [...propsAlong(primary, along, 0, 300, []), ...propsAlong(primary, along, 300, 960, [])];
    expect(parts).toEqual(whole);
  });
  it("keeps a group out of blocked stretches", () => {
    const props = propsAlong(primary, [0, 480, 960], 0, 960, [[400, 560]]);
    // The group's spot and every item stay at least 1.5 m outside the stretch.
    for (const p of props) expect(p.x + 480 < 398.5 || p.x + 480 > 561.5).toBe(true);
  });
  it("leaves room between the items of a group", () => {
    const props = propsAlong(primary, [0, 480, 960], 0, 960, []);
    for (let i = 0; i < props.length; i++) {
      for (let j = i + 1; j < props.length; j++) {
        const a = props[i]!;
        const b = props[j]!;
        if (Math.sign(a.z) !== Math.sign(b.z) || Math.abs(a.x - b.x) > PROP_PITCH / 2) continue;
        expect(Math.abs(a.x - b.x)).toBeGreaterThan(PROP_SIZE[a.kind].hx + PROP_SIZE[b.kind].hx - 0.25);
      }
    }
  });
});

describe("chunkProps", () => {
  const all = (buildings: Building[] = []) => roadChunks(buildings).flatMap((c) => [...chunkProps(map, c)]);

  it("places props only along main roads", () => {
    const props = all();
    expect(props.length).toBeGreaterThan(10);
    expect(props.every((p) => p.roadId === primary.id)).toBe(true);
  });
  it("keeps the side street and the junction clear", () => {
    for (const p of all()) expect(Math.abs(p.x)).toBeGreaterThan(10);
  });
  it("keeps clear of poles and bus shelters", () => {
    const chunks = roadChunks();
    for (const c of chunks) {
      const f = chunkFurniture(map, c);
      for (const p of chunkProps(map, c)) {
        for (const pole of f.poles) expect(Math.hypot(pole.x - p.x, pole.z - p.z)).toBeGreaterThan(POLE.half + 1);
        for (const s of f.shelters) expect(Math.hypot(s.x - p.x, s.z - p.z)).toBeGreaterThan(SHELTER.width / 2);
      }
    }
  });
  it("leaves out props that would stand in a building", () => {
    // A long row of buildings right at the back of the north pavement.
    const row: Building = { id: 1, kind: "commercial", height: 7, floors: 2, color: 0xffffff, outline: [{ x: -480, z: -7.5 }, { x: 480, z: -7.5 }, { x: 480, z: -30 }, { x: -480, z: -30 }] };
    const props = all([row]);
    expect(props.some((p) => p.z < 0)).toBe(false);
    expect(props.some((p) => p.z > 0)).toBe(true);
    for (const p of props) for (const c of propCorners(p)) expect(pointInPolygon(c.x, c.z, row.outline)).toBe(false);
  });
  it("is the same every time a chunk loads", () => {
    expect(all()).toEqual(all());
  });
});

describe("propSolids", () => {
  it("gives each prop a box standing on the ground", () => {
    const props = all();
    const boxes = propSolids(props);
    expect(boxes).toHaveLength(props.length);
    boxes.forEach((b, i) => {
      expect(b.y - b.hy).toBeCloseTo(0);
      expect(b.hx).toBe(PROP_SIZE[props[i]!.kind].hx);
      expect(b.yaw).toBe(props[i]!.yaw);
    });
  });
});

function all(): ReturnType<typeof chunkProps>[number][] {
  return roadChunks().flatMap((c) => [...chunkProps(map, c)]);
}
