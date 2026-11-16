import { describe, expect, it } from "vitest";
import type { Building, Road, RoadSpan } from "@cow/game-world";
import { addBalcony, addChajja, addShopFronts, planFacade, shopsOnWall, wallFacesRoad } from "./FacadeKit";
import { KIT_CELLS, KIT_SIZE, signRect } from "./kitAtlas";
import { MeshBuilder } from "./MeshBuilder";
import { NARROW_SIGNS, SHOP_SIGNS, SIGN_WORDS, WIDE_SIGNS, signGlyphs } from "./shopSigns";

/** A 12 m × 8 m block; with this outline order, edge 0 (z = 0, x 0 → 12) faces -z. */
function building(id: number, kind: Building["kind"], floors = 3): Building {
  return {
    id,
    kind,
    floors,
    height: 3.3 + (floors - 1) * 3 + 0.9,
    color: 0xe0d0b0,
    outline: [
      { x: 0, z: 0 },
      { x: 12, z: 0 },
      { x: 12, z: 8 },
      { x: 0, z: 8 },
    ],
  };
}

function span(kind: Road["kind"], z: number): RoadSpan {
  const road: Road = { id: 1, kind, width: 10, oneway: false, points: [{ x: -50, z }, { x: 50, z }] };
  return { road, start: 0, end: 1, offset: 0, total: 100 };
}

describe("wallFacesRoad", () => {
  const [p, q, r] = building(1, "commercial").outline;
  it("is true for a wall with a road close in front of it", () => {
    expect(wallFacesRoad(p!, q!, [span("residential", -10)], false)).toBe(true);
  });
  it("is false for the wall facing away, a road too far off, or a footway", () => {
    expect(wallFacesRoad(q!, r!, [span("residential", -10)], false)).toBe(false);
    expect(wallFacesRoad(p!, q!, [span("residential", -40)], false)).toBe(false);
    expect(wallFacesRoad(p!, q!, [span("footway", -10)], false)).toBe(false);
  });
  it("can be limited to main roads", () => {
    expect(wallFacesRoad(p!, q!, [span("residential", -10)], true)).toBe(false);
    expect(wallFacesRoad(p!, q!, [span("primary", -10)], true)).toBe(true);
  });
});

describe("planFacade", () => {
  const road = [span("primary", -10)];
  it("gives commercial buildings shop fronts on the road side only", () => {
    const plan = planFacade(building(7, "commercial"), road);
    expect([...plan.shopWalls]).toEqual([0]);
  });
  it("gives houses shops only on a main road and only with an upper floor, and nothing shops without a road", () => {
    let shops = 0;
    for (let id = 0; id < 1000; id++) {
      if (planFacade(building(id, "house"), road).shopWalls.size > 0) shops++;
      expect(planFacade(building(id, "house"), [span("residential", -10)]).shopWalls.size).toBe(0);
      expect(planFacade({ ...building(id, "house", 1), height: 4.5 }, road).shopWalls.size).toBe(0);
      expect(planFacade(building(id, "commercial"), []).shopWalls.size).toBe(0);
    }
    expect(shops / 1000).toBeCloseTo(0.4, 1);
  });
  it("gives about half the apartment blocks on a main road shops, and none on a side street", () => {
    let shops = 0;
    for (let id = 0; id < 1000; id++) {
      if (planFacade(building(id, "apartments"), road).shopWalls.size > 0) shops++;
      expect(planFacade(building(id, "apartments"), [span("residential", -10)]).shopWalls.size).toBe(0);
    }
    expect(shops).toBeGreaterThan(400);
    expect(shops).toBeLessThan(600);
  });
  it("skips shop fronts when the ground floor is too low for shutter and sign", () => {
    const low: Building = { ...building(7, "commercial", 1), height: 3.5 };
    expect(planFacade(low, road).shopWalls.size).toBe(0);
  });
  it("is deterministic and gives the expected shares of sunshades and balconies", () => {
    let chajjas = 0;
    let balconies = 0;
    for (let id = 0; id < 1000; id++) {
      const a = planFacade(building(id, "apartments"), road);
      const b = planFacade(building(id, "apartments"), road);
      expect(b).toEqual(a);
      if (a.chajjas) chajjas++;
      if (a.balconies) balconies++;
      expect(planFacade(building(id, "commercial"), road).balconies).toBe(false);
      expect(planFacade(building(id, "house", 1), road).balconies).toBe(false);
    }
    expect(chajjas / 1000).toBeCloseTo(0.85, 1);
    expect(balconies / 1000).toBeCloseTo(0.7, 1);
  });
});

describe("shopsOnWall", () => {
  it("covers every bay exactly once with signs of the right width", () => {
    for (let id = 0; id < 100; id++) {
      const shops = shopsOnWall(building(id, "commercial"), 0, 5);
      let next = 0;
      for (const shop of shops) {
        expect(shop.firstBay).toBe(next);
        next += shop.bays;
        expect(SHOP_SIGNS[shop.sign]!.wide).toBe(shop.bays === 2);
      }
      expect(next).toBe(5);
      expect(shopsOnWall(building(id, "commercial"), 0, 5)).toEqual(shops);
    }
  });
  it("keeps hours (a few shut all day) and mixes lit and dim interiors", () => {
    const shops = Array.from({ length: 80 }, (_, id) => shopsOnWall(building(id, "commercial"), 0, 4)).flat();
    const shut = shops.filter((s) => !s.hours).length;
    expect(shut).toBeGreaterThan(0);
    expect(shut).toBeLessThan(shops.length * 0.25);
    for (const s of shops) if (s.hours) expect(s.hours.opens).toBeLessThan(s.hours.closes);
    expect(new Set(shops.map((s) => s.lit)).size).toBe(2);
  });
});

describe("kit geometry", () => {
  const frame = { x: 0, z: 0, ux: 1, uz: 0, nx: 0, nz: -1 };
  const plaster = { u: 0.005, v: 0.86 };
  const triangles = (m: MeshBuilder) => (m.build()?.index?.count ?? 0) / 3;
  it("keeps each piece low-poly", () => {
    const walls = new MeshBuilder();
    addChajja(walls, frame, 3.2, 3.3, 3, plaster, [1, 1, 1]);
    expect(triangles(walls)).toBe(4);
    const slab = new MeshBuilder();
    const rail = new MeshBuilder();
    addBalcony(slab, rail, frame, 3.2, 3.3, plaster, [1, 1, 1]);
    expect(triangles(slab)).toBe(6);
    expect(triangles(rail)).toBe(6);
    const kit = new MeshBuilder();
    addShopFronts(kit, building(3, "commercial"), 0, frame, 12, 4);
    // Per bay an interior (2), a shutter (2) and the shutter box's front and bottom (4); a
    // five-sided sign (10) per shop.
    const shops = shopsOnWall(building(3, "commercial"), 0, 4).length;
    expect(triangles(kit)).toBe(4 * 8 + shops * 10);
  });
  it("gives the shutters' bottom corners their shop's hours, and nothing else", () => {
    const kit = new MeshBuilder("aShop");
    const b = building(3, "commercial");
    addShopFronts(kit, b, 0, frame, 12, 4);
    const geometry = kit.build()!;
    const shop = geometry.getAttribute("aShop");
    const y = geometry.getAttribute("position");
    const open = shopsOnWall(b, 0, 4).filter((s) => s.hours).reduce((n, s) => n + s.bays, 0);
    let timed = 0;
    for (let v = 0; v < shop.count; v++) {
      if (shop.getZ(v) === 0) continue;
      timed++;
      expect(y.getY(v)).toBe(0);
      expect(shop.getX(v)).toBeLessThan(shop.getY(v));
    }
    expect(timed).toBe(open * 2);
  });
  it("puts every face of a sunshade on the outside of the wall, facing out", () => {
    const walls = new MeshBuilder();
    addChajja(walls, frame, 3.2, 0, 3, plaster, [1, 1, 1]);
    const geometry = walls.build()!;
    const position = geometry.getAttribute("position");
    for (let k = 0; k < position.count; k++) expect(position.getZ(k)).toBeLessThanOrEqual(1e-9);
    // Front face winding agrees with its normal (-z): check the first triangle.
    const index = geometry.index!;
    const v = (i: number) => [position.getX(index.getX(i)), position.getY(index.getX(i)), position.getZ(index.getX(i))] as const;
    const [a, b, c] = [v(0), v(1), v(2)];
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    expect(nz).toBeLessThan(0);
  });
});

describe("shop signs", () => {
  it("is the curated, invented list", () => {
    expect(SHOP_SIGNS.map((s) => s.english)).toEqual([
      "GROCERY & PROVISIONS",
      "VEG MEALS · TIFFIN",
      "TEXTILES & READYMADES",
      "NILA TIFFIN CENTRE",
      "MEDICALS",
      "TEA · COFFEE",
      "NEW STORES",
      "FLOWERS",
      "FOOTWEAR",
      "MOBILE SERVICE",
    ]);
  });
  it("uses only generic English shop words", () => {
    for (const sign of SHOP_SIGNS) {
      const words = sign.english.match(/[A-Za-z]+/g) ?? [];
      for (const word of words) expect(SIGN_WORDS.has(word), word).toBe(true);
      // The Tamil line is Tamil script and spaces only: no Latin brand slipped in.
      expect(sign.tamil).toMatch(/^[஀-௿ ]+$/);
    }
  });
  it("fits the kit atlas without overlapping its cells", () => {
    expect(WIDE_SIGNS.length).toBeLessThanOrEqual(4);
    expect(NARROW_SIGNS.length).toBeLessThanOrEqual(6);
    const rects = [...SHOP_SIGNS.map((_, i) => signRect(i)), ...Object.values(KIT_CELLS)];
    for (const [x, y, w, h] of rects) {
      expect(x + w).toBeLessThanOrEqual(KIT_SIZE);
      expect(y + h).toBeLessThanOrEqual(KIT_SIZE);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const [ax, ay, aw, ah] = rects[i]!;
        const [bx, by, bw, bh] = rects[j]!;
        expect(ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah).toBe(false);
      }
  });
  it("lists the glyphs the embedded font subset was cut to", () => {
    // If this changes, re-cut assets/fonts/noto-sans-tamil-signs.woff2 (assets/README.md).
    expect(signGlyphs()).toBe(" உகசடணதநனபமரலளவஸாிீுூெேைோ்");
  });
});
