import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANNA_NAGAR_ORIGIN, GeoProjection, parseOsm, type OsmExtract, type OsmFeatures, type OsmPoint } from "@cow/map-data";
import { buildWorldMap } from "./buildWorldMap";
import { closestOnSegment } from "./geometry";
import { LANDMARK_SPECS, findLandmarks, ringPath, startYear, towerProfile } from "./landmarks";
import { landmarkSolids } from "./solids";

const bounds = { minX: -300, maxX: 300, minZ: -300, maxZ: 300 };
const square = (cx: number, cz: number, half: number) => [
  { x: cx - half, z: cz - half },
  { x: cx + half, z: cz - half },
  { x: cx + half, z: cz + half },
  { x: cx - half, z: cz + half },
];
/** A closed path: `sides` points round a circle, the first repeated at the end like OSM. */
const loop = (cx: number, cz: number, radius: number, sides: number, wobble = 0) => {
  const points = Array.from({ length: sides }, (_, i) => {
    const angle = (i / sides) * Math.PI * 2;
    const r = radius + (i % 2 ? wobble : -wobble);
    return { x: cx + Math.cos(angle) * r, z: cz + Math.sin(angle) * r };
  });
  return [...points, points[0]!];
};

function town(points: OsmPoint[] = []): OsmFeatures {
  return {
    timestamp: "test",
    highways: [
      // A square loop and a round one in the park: the round one circles the tower.
      // A long rectangle with ten points: closed, but far from round.
      { id: 7, tags: { highway: "footway" }, points: [-60, -45, -30, -15, 0].flatMap((x) => [{ x, z: -10 }]).concat([0, -15, -30, -45, -60].map((x) => ({ x, z: 10 })), [{ x: -60, z: -10 }]) },
      { id: 8, tags: { highway: "footway", access: "private" }, points: loop(50, -40, 30, 20, 1.5) },
      { id: 9, tags: { highway: "residential" }, points: [{ x: -250, z: 120 }, { x: 250, z: 120 }] },
    ],
    buildings: [],
    areas: [{ id: 1, tags: { leisure: "park", name: "Anna Nagar Tower Park" }, outline: square(0, -20, 110) }],
    points: [
      // Mapped trees right where the tower stands and well away from it.
      { id: 100, tags: { natural: "tree" }, x: 51, z: -41 },
      { id: 101, tags: { natural: "tree" }, x: -80, z: 40 },
      { id: 102, tags: { highway: "bus_stop", name: "Park Stop" }, x: 0, z: 115 },
      { id: 103, tags: { highway: "traffic_signals" }, x: 10, z: 120 },
      ...points,
    ],
  };
}

describe("landmarks", () => {
  it("derives the tower from the circular path in Tower Park when OSM has no tower", () => {
    const [tower, ...rest] = findLandmarks(town(), bounds);
    expect(rest).toEqual([]);
    expect(tower).toMatchObject({ id: "anna-nagar-tower", kind: "tower", name: "Anna Nagar Tower", height: 41, levels: 12, opened: 1968 });
    expect(tower!.x).toBeCloseTo(50, 0);
    expect(tower!.z).toBeCloseTo(-40, 0);
    expect(tower!.source).toMatch(/circular path OSM way 8/);
    expect(tower!.estimated).toEqual(expect.arrayContaining(["height", "levels", "radius", "position"]));
    expect(tower!.radius).toBeLessThan(30 - 3);
  });

  it("prefers a mapped man_made=tower inside the park, and then nothing is estimated about where", () => {
    const [tower] = findLandmarks(town([{ id: 200, tags: { man_made: "tower" }, x: 48, z: -38 }]), bounds);
    expect(tower).toMatchObject({ x: 48, z: -38, source: "OSM node 200" });
    expect(tower!.estimated).not.toContain("position");
  });

  it("takes the footprint from a mapped tower outline, which then beats a viewpoint node", () => {
    const features = town([{ id: 202, tags: { tourism: "viewpoint", "name:en": "Anna Nagar Tower" }, x: 49, z: -39 }]);
    const outline = loop(50, -40, 14, 16).slice(0, -1);
    const [tower] = findLandmarks({ ...features, areas: [...features.areas, { id: 210, tags: { man_made: "tower", start_date: "21/01/1971" }, outline }] }, bounds, [
      { ...LANDMARK_SPECS[0]!, tags: [{ man_made: "tower" }, { tourism: "viewpoint" }] },
    ]);
    expect(tower!.source).toBe("OSM way 210");
    expect(tower!.radius).toBeCloseTo(14, 0);
    // The year comes from OSM's start_date, not the catalogue's 1968.
    expect(tower!.opened).toBe(1971);
    expect(tower!.estimated).toEqual(["height", "levels"]);
  });

  it("reads the year from the usual start_date forms", () => {
    expect(startYear({ start_date: "1968" })).toBe(1968);
    expect(startYear({ start_date: "1968-01-21" })).toBe(1968);
    expect(startYear({ start_date: "21/01/1968" })).toBe(1968);
    expect(startYear({ start_date: "early" })).toBeUndefined();
    expect(startYear({})).toBeUndefined();
  });

  it("ignores towers elsewhere that aren't named after it", () => {
    const [tower] = findLandmarks(town([{ id: 201, tags: { man_made: "tower" }, x: 200, z: 200 }]), bounds);
    expect(tower!.source).toMatch(/circular path/);
  });

  it("finds the other brief landmarks once a bigger extract has them, and skips what is outside the map", () => {
    const extra: OsmPoint[] = [
      { id: 300, tags: { amenity: "place_of_worship", name: "Arulmigu Kapaleeswarar Temple" }, x: 100, z: 100 },
      { id: 301, tags: { place: "suburb", name: "T. Nagar" }, x: -100, z: 100 },
      { id: 302, tags: { natural: "beach", name: "Marina Beach" }, x: 900, z: 0 },
    ];
    const ids = findLandmarks(town(extra), bounds).map((l) => l.id);
    expect(ids).toEqual(["anna-nagar-tower", "kapaleeshwarar-temple", "t-nagar"]);
  });

  it("only accepts a round path, not any loop", () => {
    const features = town();
    const square = { ...features, highways: features.highways.filter((h) => h.id !== 8) };
    expect(ringPath(square, features.areas[0]!.outline)).toBeNull();
    expect(findLandmarks(square, bounds)).toEqual([]);
  });

  it("keeps trees off the plinth and records bus stops and signals", () => {
    const map = buildWorldMap(town(), { name: "Test", origin: ANNA_NAGAR_ORIGIN, bounds, chunkSize: 250 });
    const tower = map.landmarks![0]!;
    const trees = map.chunks.flatMap((c) => c.trees);
    expect(trees.some((t) => t.source === "osm" && t.x === -80)).toBe(true);
    expect(trees.every((t) => Math.hypot(t.x - tower.x, t.z - tower.z) > tower.radius!)).toBe(true);
    expect(map.busStops).toEqual([{ x: 0, z: 115, name: "Park Stop" }]);
    expect(map.signals).toEqual([{ x: 10, z: 120 }]);
  });

  it("gives the tower walkable steps, levels below the canopy and a solid base", () => {
    const [tower] = findLandmarks(town(), bounds);
    const profile = towerProfile(tower!);
    expect(profile.levels).toHaveLength(12);
    expect(profile.height).toBe(41);
    let below = 0;
    for (const step of profile.steps) {
      // The character controller climbs steps up to 0.35 m.
      expect(step.top - below).toBeLessThanOrEqual(0.35);
      below = step.top;
    }
    expect(profile.levels[0]!.y).toBeGreaterThan(profile.drum.top);
    expect(profile.levels[11]!.y).toBeLessThan(profile.canopy.bottom);
    const solids = landmarkSolids([tower!]);
    expect(solids.indices.length).toBeGreaterThan(0);
    let reach = 0;
    let top = 0;
    for (let i = 0; i < solids.vertices.length; i += 3) {
      reach = Math.max(reach, Math.hypot(solids.vertices[i]! - tower!.x, solids.vertices[i + 2]! - tower!.z));
      top = Math.max(top, solids.vertices[i + 1]!);
    }
    expect(reach).toBeCloseTo(tower!.radius!, 1);
    expect(top).toBeGreaterThan(30);
    expect(landmarkSolids([{ ...tower!, kind: "district" }]).indices.length).toBe(0);
  });
});

describe("Anna Nagar Tower in the real extract", () => {
  const extract = JSON.parse(readFileSync(new URL("../../../assets/osm/anna-nagar.osm.json", import.meta.url), "utf8")) as OsmExtract;
  const features = parseOsm(extract, ANNA_NAGAR_ORIGIN);
  const projection = new GeoProjection(ANNA_NAGAR_ORIGIN);
  const corner = (lat: number, lng: number) => projection.toLocal({ lat, lng });
  const sw = corner(13.0805, 80.2056);
  const ne = corner(13.0895, 80.2146);
  const mapBounds = { minX: Math.ceil(sw.x), maxX: Math.floor(ne.x), minZ: Math.ceil(ne.z), maxZ: Math.floor(sw.z) };
  const map = buildWorldMap(features, { name: "Anna Nagar", origin: ANNA_NAGAR_ORIGIN, bounds: mapBounds, chunkSize: 250 });
  const tower = map.landmarks!.find((l) => l.id === "anna-nagar-tower")!;

  it("stands where the real tower is (about 13.0863 N, 80.2138 E)", () => {
    expect(tower).toBeDefined();
    const real = projection.toLocal({ lat: 13.0863, lng: 80.2138 });
    expect(Math.hypot(tower.x - real.x, tower.z - real.z)).toBeLessThan(15);
  });

  it("would be placed within a few metres from the circular path alone, without the tower outline", () => {
    const withoutTower = { ...features, areas: features.areas.filter((a) => a.tags.man_made !== "tower"), points: features.points.filter((p) => !p.tags.man_made && !p.tags.tourism) };
    const [derived] = findLandmarks(withoutTower, mapBounds);
    expect(derived!.source).toMatch(/circular path/);
    expect(derived!.estimated).toContain("position");
    expect(Math.hypot(derived!.x - tower.x, derived!.z - tower.z)).toBeLessThan(3);
  });

  it("has a clear footprint: no tree, building or road on it", () => {
    const r = tower.radius!;
    for (const chunk of map.chunks) {
      for (const t of chunk.trees) expect(Math.hypot(t.x - tower.x, t.z - tower.z)).toBeGreaterThan(r);
      for (const b of chunk.buildings) for (const p of b.outline) expect(Math.hypot(p.x - tower.x, p.z - tower.z)).toBeGreaterThan(r);
    }
    for (const road of map.roads) {
      for (let i = 0; i < road.points.length - 1; i++) {
        const d = Math.sqrt(closestOnSegment(tower, road.points[i]!, road.points[i + 1]!).d2);
        expect(d).toBeGreaterThan(r + road.width / 2);
      }
    }
  });
});
