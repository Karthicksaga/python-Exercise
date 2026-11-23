import { describe, expect, it } from "vitest";
import type { Area, Poi, Road, Sea } from "@cow/game-world";
import { CrowdField } from "./Crowds";
import { PLACE_KINDS, PLACE_TRAFFIC, PlaceMap, areaCounts, placePeak, placePeople } from "./Places";

/**
 * A small coastal town (+X east, the sea beyond x = 300): a beach (x 200..300) with the beach
 * road along it, a shopping street, a station, a temple street, an avenue and a quiet lane.
 */
function town(): { roads: Road[]; areas: Area[]; pois: Poi[]; sea: Sea; stations: { x: number; z: number }[] } {
  const road = (id: number, kind: Road["kind"], width: number, points: Array<[number, number]>, name?: string): Road => ({ id, kind, width, oneway: false, points: points.map(([x, z]) => ({ x, z })), ...(name ? { name } : {}) });
  const roads = [
    road(1, "primary", 14, [[180, -400], [180, 400]], "Kamarajar Salai"),
    road(2, "residential", 7, [[-200, -300], [100, -300]], "Bazaar Street"),
    road(3, "secondary", 12, [[-200, 0], [100, 0]], "Station Road"),
    road(4, "residential", 7, [[-200, 300], [100, 300]], "Temple Street"),
    road(5, "primary", 14, [[-1000, -1000], [-1000, 1000]], "Avenue"),
    road(6, "residential", 7, [[-1500, 600], [-1200, 600]], "5th Cross Street"),
  ];
  const beach: Area = { id: 10, kind: "beach", name: "Town Beach", outline: [{ x: 200, z: -400 }, { x: 300, z: -400 }, { x: 300, z: 400 }, { x: 200, z: 400 }] };
  const shops: Poi[] = Array.from({ length: 12 }, (_, i) => ({ kind: i % 2 ? "clothes" : "jewelry", x: -150 + i * 20, z: -310 }));
  const pois: Poi[] = [...shops, { kind: "place_of_worship", x: -50, z: 310 }];
  const sea: Sea = { coast: [{ x: 300, z: 2000 }, { x: 300, z: -2000 }], outline: [{ x: 300, z: -2000 }, { x: 3000, z: -2000 }, { x: 3000, z: 2000 }, { x: 300, z: 2000 }], source: "test" };
  return { roads, areas: [beach], pois, sea, stations: [{ x: -50, z: 20 }] };
}

describe("people by place and hour", () => {
  it("every place has a curve for the whole day, wrapping round midnight", () => {
    for (const kind of PLACE_KINDS) {
      for (let h = 0; h < 24; h += 0.5) {
        expect(placePeople(kind, h)).toBeGreaterThanOrEqual(0);
        expect(placePeople(kind, h)).toBeLessThanOrEqual(placePeak(kind));
      }
      expect(placePeople(kind, 24 + 7)).toBeCloseTo(placePeople(kind, 7));
    }
  });

  it("beaches are busiest in the evening, empty at night, quiet at midday", () => {
    expect(placePeople("beach", 18.5)).toBe(placePeak("beach"));
    expect(placePeople("beach", 3)).toBeLessThan(0.2);
    expect(placePeople("beach", 12)).toBeLessThan(placePeople("beach", 18.5) / 5);
    // Dawn walkers.
    expect(placePeople("beach", 6)).toBeGreaterThan(placePeople("beach", 12) * 2);
  });

  it("markets are busy by day, stations at the rush hours, temples at dawn and dusk", () => {
    expect(placePeople("market", 12)).toBeGreaterThan(placePeople("market", 7) * 2);
    expect(placePeople("market", 3)).toBeLessThan(1);
    for (const rush of [8.5, 17.5]) expect(placePeople("station", rush)).toBeGreaterThan(placePeople("station", 13) * 2);
    expect(placePeople("temple", 6)).toBeGreaterThan(placePeople("temple", 13) * 2);
    expect(placePeople("temple", 18)).toBeGreaterThan(placePeople("temple", 13) * 2);
  });

  it("residential lanes are sparse by day and empty at night; main roads always have someone", () => {
    for (const h of [9, 13, 18]) expect(placePeople("lane", h)).toBeLessThan(1);
    for (const h of [0, 1, 2, 3, 4]) {
      expect(placePeople("lane", h)).toBeLessThan(0.05);
      expect(placePeople("main-road", h)).toBeGreaterThanOrEqual(0.3);
    }
    // In the evening the beach and its road outnumber a lane many times over.
    expect(placePeople("promenade", 18.5)).toBeGreaterThan(placePeople("lane", 18.5) * 10);
  });

  it("arterials and the beach road carry traffic, lanes little, the sand none", () => {
    expect(PLACE_TRAFFIC["main-road"]).toBe(1);
    expect(PLACE_TRAFFIC.promenade).toBe(1);
    expect(PLACE_TRAFFIC.lane).toBeLessThan(PLACE_TRAFFIC.street);
    expect(PLACE_TRAFFIC.street).toBeLessThan(PLACE_TRAFFIC["main-road"]);
    expect(PLACE_TRAFFIC.beach).toBe(0);
  });
});

describe("kinds of place, from the map", () => {
  const t = town();
  const places = new PlaceMap(t);
  const kind = (id: number) => places.segmentKind(t.roads.find((r) => r.id === id)!, 0);

  it("reads the beach road, a market, a station, a temple, an avenue and a lane", () => {
    expect(kind(1)).toBe("promenade");
    expect(kind(2)).toBe("market");
    expect(kind(3)).toBe("station");
    expect(kind(4)).toBe("temple");
    expect(kind(5)).toBe("main-road");
    expect(kind(6)).toBe("lane");
  });

  it("the sand is the beach outline, never the sea", () => {
    expect(places.onSand(250, 0)).toBe(true);
    expect(places.onSand(320, 0)).toBe(false);
    expect(places.inSea(320, 0)).toBe(true);
    expect(places.onSand(100, 0)).toBe(false);
  });

  it("estimates shore sand by a named beach that OSM has no outline for: seaward of the roads only", () => {
    // Elliot's Beach has a named playground and promenade in OSM but no natural=beach.
    const road: Road = { id: 1, kind: "tertiary", width: 10, oneway: false, points: [{ x: 200, z: -500 }, { x: 200, z: 500 }], name: "Shore Road" };
    const playground: Area = { id: 2, kind: "park", name: "Elliot's Beach Playground", outline: [{ x: 150, z: -20 }, { x: 180, z: -20 }, { x: 180, z: 20 }, { x: 150, z: 20 }] };
    const shore = new PlaceMap({ roads: [road], areas: [playground], pois: [], sea: t.sea });
    expect(shore.onSand(260, 0)).toBe(true);
    // Landward of the road, on the road, in the water, or far from any named beach: not sand.
    expect(shore.onSand(150, 0)).toBe(false);
    expect(shore.onSand(203, 0)).toBe(false);
    expect(shore.onSand(320, 0)).toBe(false);
    expect(shore.onSand(260, 1500)).toBe(false);
    // No named beach near: the coast is not sand (a harbour wall, say).
    expect(new PlaceMap({ roads: [road], areas: [], pois: [], sea: t.sea }).onSand(260, 0)).toBe(false);
  });

  it("a lane is quieter than the beach front in people and traffic", () => {
    const front = places.areaLevels({ x: 180, z: 0 }, 18.5, 150);
    const lane = places.areaLevels({ x: -1350, z: 600 }, 18.5, 150);
    expect(front.people).toBeGreaterThan(lane.people * 10);
    expect(front.traffic).toBeGreaterThan(lane.traffic * 3);
    const pools = { walkers: 7, traffic: 9 };
    const busy = areaCounts(front, pools, 1);
    const quiet = areaCounts(lane, pools, 1);
    expect(busy.walkers).toBe(7);
    expect(busy.traffic).toBe(9);
    expect(quiet.walkers).toBeLessThan(busy.walkers);
    expect(quiet.traffic).toBeLessThan(busy.traffic / 2);
    // Never fewer than two of each, even in a lane at 3 a.m.
    const night = areaCounts(places.areaLevels({ x: -1350, z: 600 }, 3, 150), pools, 0.25);
    expect(night.walkers).toBe(2);
    expect(night.traffic).toBe(2);
  });
});

describe("crowds", () => {
  const t = town();
  const places = new PlaceMap(t);
  const field = (cap = 90) => new CrowdField(places, t.roads, { cap, newCells: 1000 });

  it("the beach in the evening has many people near, a lane a handful, and the beach is empty at night", () => {
    const evening = field().near({ x: 240, z: 0 }, 18.5, 0);
    const lane = field().near({ x: -1350, z: 600 }, 18.5, 0);
    const night = field().near({ x: 240, z: 0 }, 3, 0);
    expect(evening.length).toBeGreaterThanOrEqual(40);
    expect(lane.length).toBeLessThanOrEqual(5);
    expect(night.length).toBeLessThanOrEqual(3);
    // Sitting, standing and walking on the sand.
    expect(evening.filter((p) => p.sitting).length).toBeGreaterThan(5);
    expect(evening.filter((p) => p.walked !== null).length).toBeGreaterThan(0);
  });

  it("people on the beach are on the sand, never in the sea; people on the pavements are off the carriageway", () => {
    const f = field(1000);
    for (let s = 0; s < 40; s += 7) {
      for (const p of f.near({ x: 230, z: 0 }, 18.5, s)) {
        if (p.kind === "beach") expect(places.onSand(p.x, p.z)).toBe(true);
        expect(places.inSea(p.x, p.z)).toBe(false);
        if (p.kind === "promenade") expect(Math.abs(p.x - 180)).toBeGreaterThanOrEqual(7.9);
      }
    }
  });

  it("is the same crowd every visit, and the hour only adds or removes people", () => {
    const a = field().near({ x: 240, z: 0 }, 18.5, 0).map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`);
    const b = field().near({ x: 240, z: 0 }, 18.5, 0).map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`);
    expect(b).toEqual(a);
    const f = field(1000);
    const late = new Set(f.near({ x: 240, z: 0 }, 21, 0).map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`));
    const peak = new Set(f.near({ x: 240, z: 0 }, 18.5, 0).map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`));
    expect(late.size).toBeLessThan(peak.size);
    for (const p of late) expect(peak.has(p)).toBe(true);
  });

  it("never more than the cap, the nearest kept, and fewer far away", () => {
    const f = field(25);
    const near = f.near({ x: 240, z: 0 }, 18.5, 0);
    expect(near.length).toBe(25);
    const all = field(1000).near({ x: 240, z: 0 }, 18.5, 0);
    const d = (p: { x: number; z: number }) => Math.hypot(p.x - 240, p.z);
    const furthestKept = Math.max(...near.map(d));
    expect(all.filter((p) => d(p) < furthestKept - 0.01).length).toBeLessThanOrEqual(25);
    // Density per square metre is lower in the far ring (beyond `near`) than in the near disc.
    const inner = all.filter((p) => d(p) < 40).length / (Math.PI * 40 * 40);
    const outer = all.filter((p) => d(p) >= 40).length / (Math.PI * (70 * 70 - 40 * 40));
    expect(outer).toBeLessThan(inner * 0.75);
  });

  it("steps out of the way of the player and their vehicle", () => {
    const f = field(1000);
    const before = f.near({ x: 240, z: 0 }, 18.5, 0);
    const target = before[0]!;
    const after = f.near({ x: 240, z: 0 }, 18.5, 0, [{ x: target.x, z: target.z, radius: 2.2 }]);
    for (const p of after) expect(Math.hypot(p.x - target.x, p.z - target.z)).toBeGreaterThanOrEqual(2.2 + 0.5 - 1e-6);
  });

  it("makes only a few new squares per call, so arriving costs no long frame", () => {
    const f = new CrowdField(places, t.roads, { newCells: 4 });
    f.near({ x: 240, z: 0 }, 18.5, 0);
    expect(f.cellCount).toBe(4);
    for (let i = 0; i < 40; i++) f.near({ x: 240, z: 0 }, 18.5, 0);
    const full = field().near({ x: 240, z: 0 }, 18.5, 0).length;
    expect(f.near({ x: 240, z: 0 }, 18.5, 0).length).toBe(full);
  });

  it("puts nobody inside a building, and makes a square only once its buildings are known", () => {
    // A block of houses over the beach's north half (z < 0).
    const solid = (x: number, z: number) => x > 190 && x < 310 && z < 0;
    const built = new CrowdField(places, t.roads, { cap: 1000, newCells: 1000 }, { ready: () => true, solid });
    const people = built.near({ x: 240, z: 0 }, 18.5, 0);
    expect(people.length).toBeGreaterThan(10);
    for (const p of people) expect(solid(p.x, p.z)).toBe(false);
    const waiting = new CrowdField(places, t.roads, { newCells: 1000 }, { ready: () => false, solid: () => false });
    expect(waiting.near({ x: 240, z: 0 }, 18.5, 0).length).toBe(0);
    expect(waiting.cellCount).toBe(0);
  });
});
