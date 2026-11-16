import { describe, expect, it } from "vitest";
import { ANNA_NAGAR_ORIGIN, GeoProjection } from "@cow/map-data";
import { buildRail, chainWays, clipLine, type RailExtract } from "./build";
import { EMU_MOTION, RunProfile } from "./motion";
import { FARE, PLATFORM_EDGE, PLATFORM_WIDTH, RailLine, RailNetwork, boarding, canStepOff, platformOf, rideEndsAt, stopAt } from "./network";
import { RailPath } from "./path";
import type { RailLineData } from "./types";

describe("RailPath", () => {
  const path = new RailPath([{ x: 0, z: 0 }, { x: 0, z: -100 }, { x: 100, z: -100 }]);

  it("measures length and walks along it", () => {
    expect(path.length).toBe(200);
    expect(path.at(50)).toMatchObject({ x: 0, z: -50 });
    expect(path.at(150)).toMatchObject({ x: 50, z: -100 });
    // North is yaw 0; east is -90°.
    expect(path.at(50).yaw).toBeCloseTo(0);
    expect(path.at(150).yaw).toBeCloseTo(-Math.PI / 2);
  });

  it("puts left on the left of the direction of travel", () => {
    // Running north, left is west (-X); running east, left is north (-Z).
    expect(path.beside(50, 3).x).toBeCloseTo(-3);
    expect(path.beside(150, 3).z).toBeCloseTo(-103);
    expect(path.project({ x: -3, z: -50 })).toMatchObject({ s: 50, distance: 3 });
    expect(path.project({ x: -3, z: -50 }).lateral).toBeCloseTo(3);
    expect(path.project({ x: 150 - 100, z: -97 }).lateral).toBeCloseTo(-3);
  });
});

describe("building the rail file", () => {
  it("chains ways in order, flipping the ones that run backwards", () => {
    const line = chainWays([
      [{ x: 0, z: 0 }, { x: 0, z: 10 }],
      [{ x: 0, z: 20 }, { x: 0, z: 10 }],
      [{ x: 0, z: 20 }, { x: 0, z: 30 }],
    ]);
    expect(line.map((p) => p.z)).toEqual([0, 10, 20, 30]);
    // A first way that is itself backwards is turned round too.
    expect(chainWays([[{ x: 0, z: 10 }, { x: 0, z: 0 }], [{ x: 0, z: 10 }, { x: 0, z: 20 }]]).map((p) => p.z)).toEqual([0, 10, 20]);
  });

  it("clips to the map and says which ends run on beyond it", () => {
    const bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
    const clipped = clipLine([{ x: 0, z: -300 }, { x: 0, z: -50 }, { x: 0, z: 50 }, { x: 0, z: 80 }], bounds, 20);
    // Cut where it crosses the margin (20 m outside the edge), not at the last point inside.
    expect(clipped.points.map((p) => p.z)).toEqual([-120, -50, 50, 80]);
    expect(clipped.startBeyond).toBe(true);
    expect(clipped.endBeyond).toBe(false);
  });

  // A small made-up line: two stations on a north-south track that runs off the map's south edge.
  const projection = new GeoProjection(ANNA_NAGAR_ORIGIN);
  const node = (id: number, x: number, z: number, tags?: Record<string, string>) => {
    const { lat, lng } = projection.toLatLng({ x, z });
    return { type: "node" as const, id, lat, lon: lng, ...(tags ? { tags } : {}) };
  };
  const extract: RailExtract = {
    osm3s: { timestamp_osm_base: "2026-07-15T15:22:01Z" },
    elements: [
      node(1, 0, -900),
      node(2, 0, 0),
      node(3, 0, 900),
      node(4, 0, 2500),
      // Stations: one beside the track (snapped), one in a building 40 m off it, one on the Metro.
      node(10, 2, -500, { railway: "station", name: "North Halt", "name:ta": "வடக்கு" }),
      node(11, 40, 600, { railway: "station", name: "Very Long Official Name Central" }),
      node(12, 5, 300, { railway: "station", station: "subway", name: "Metro" }),
      // A parallel track 5 m to the east, so platforms go on the west side.
      // Stop positions on the track (the route relation's stop members), unnamed as in OSM.
      node(30, 0, -498),
      node(31, 0, 602),
      node(20, 5, -900),
      node(21, 5, 2500),
      { type: "way", id: 100, nodes: [1, 2], tags: { railway: "rail", usage: "main" } },
      { type: "way", id: 101, nodes: [3, 2], tags: { railway: "rail", usage: "main" } },
      { type: "way", id: 102, nodes: [3, 4], tags: { railway: "rail", usage: "main" } },
      { type: "way", id: 103, nodes: [20, 21], tags: { railway: "rail", usage: "main" } },
      { type: "way", id: 104, nodes: [20, 21], tags: { railway: "rail", name: "MRTS" } },
      {
        type: "relation",
        id: 500,
        tags: { route: "train", from: "Beach", to: "Tambaram" },
        members: [
          { type: "node", ref: 30, role: "stop" },
          { type: "node", ref: 31, role: "stop_exit_only" },
          { type: "way", ref: 100, role: "" },
          { type: "way", ref: 101, role: "" },
          { type: "way", ref: 102, role: "" },
        ],
      },
    ],
  };
  const file = buildRail(extract, {
    origin: ANNA_NAGAR_ORIGIN,
    bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 },
    margin: 150,
    names: { "Very Long Official Name Central": ["Central", "சென்ட்ரல்"] },
    skipTrack: (tags) => tags.name === "MRTS",
    lines: [{ id: "south", relation: 500, name: "Beach – Tambaram", from: "?", to: "?", headwayMinutes: 8, offsetMinutes: 0 }],
  });
  const line = file.lines[0]!;
  const path = RailPath.fromFlat(line.points);

  it("projects OSM coordinates into the local frame", () => {
    expect(line.points[0]).toBeCloseTo(0, 0);
    expect(line.points[1]).toBeCloseTo(-900, 0);
    expect(file.attribution).toContain("2026-07-15");
  });

  it("snaps stations to the track and keeps Metro stations off the line", () => {
    expect(line.stops.map((s) => s.name)).toEqual(["North Halt", "Central"]);
    // At the stop positions, named after the nearest suburban station.
    expect(line.stops[0]!.s).toBeCloseTo(402, 0);
    expect(line.stops[1]!.s).toBeCloseTo(1502, 0);
    expect(line.stops[1]!.nameTa).toBe("சென்ட்ரல்");
    expect(line.stops[0]!.nameTa).toBe("வடக்கு");
    // The station's mark stays where OSM has it.
    expect(file.stations.find((s) => s.name === "Central")).toMatchObject({ x: 40, z: 600 });
  });

  it("puts the platform on the side away from the other track", () => {
    // Running south (+Z), left is east; the other track is east, so platforms are on the right.
    expect(line.stops.every((s) => s.side === -1)).toBe(true);
    const platform = path.beside(line.stops[0]!.s, line.stops[0]!.side * (PLATFORM_EDGE + PLATFORM_WIDTH / 2));
    expect(platform.x).toBeLessThan(-3);
  });

  it("knows the line runs off the map at the south end only, and where to", () => {
    expect(line.from).toEqual({ name: "Beach", beyond: false });
    expect(line.to).toEqual({ name: "Tambaram", beyond: true });
    expect(path.length).toBeCloseTo(900 + 1000 + 150, 0);
  });

  it("leaves out skipped (elevated) tracks", () => {
    expect(file.tracks.map((t) => t.id).sort()).toEqual([100, 101, 102, 103]);
  });

  it("fails clearly when the extract has no relation members", () => {
    expect(() => buildRail({ elements: [] }, { origin: ANNA_NAGAR_ORIGIN, bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, lines: [{ id: "x", relation: 1, name: "x", from: "a", to: "b", headwayMinutes: 5, offsetMinutes: 0 }] })).toThrow(/fetch-rail/);
  });
});

describe("train motion", () => {
  const profile = new RunProfile(5000, [1000, 2200, 4000]);

  it("enters at line speed and stops at each station for 30 s", () => {
    expect(profile.state(0).speed).toBeCloseTo(EMU_MOTION.topSpeed);
    profile.arrivals.forEach((arrival, i) => {
      const at = profile.state(arrival + 1);
      expect(at.stoppedAt).toBe(i);
      expect(at.s).toBeCloseTo(profile.stops[i]!, 3);
      expect(at.speed).toBe(0);
      expect(profile.state(arrival + EMU_MOTION.dwell - 1).stoppedAt).toBe(i);
      expect(profile.state(arrival + EMU_MOTION.dwell + 1).stoppedAt).toBeNull();
    });
  });

  it("speeds up and slows down smoothly and never runs backwards or too fast", () => {
    let last = profile.state(0);
    for (let t = 0.5; t <= profile.duration; t += 0.5) {
      const now = profile.state(t);
      expect(now.s).toBeGreaterThanOrEqual(last.s - 1e-6);
      expect(now.speed).toBeLessThanOrEqual(EMU_MOTION.topSpeed + 1e-6);
      // At most the braking or acceleration rate (slightly harder braking allowed by rounding).
      expect(Math.abs(now.speed - last.speed)).toBeLessThanOrEqual(0.5 * EMU_MOTION.brake + 1e-6);
      last = now;
    }
    expect(profile.state(profile.duration).s).toBeCloseTo(5000, 3);
  });

  it("starts from a terminus standing still", () => {
    const terminus = new RunProfile(1500, [0]);
    expect(terminus.state(1)).toMatchObject({ stoppedAt: 0, speed: 0, nextStop: null });
    expect(terminus.state(EMU_MOTION.dwell + 10).speed).toBeGreaterThan(0);
  });

  it("says which stop is next", () => {
    expect(profile.state(1).nextStop).toBe(0);
    expect(profile.state(profile.arrivals[0]! + 5).nextStop).toBe(1);
    expect(profile.state(profile.duration).nextStop).toBeNull();
  });
});

const lineData: RailLineData = {
  id: "south",
  name: "Beach – Tambaram",
  points: [0, 0, 0, 5000],
  stops: [
    { id: "a", name: "A", nameTa: "அ", s: 1000, side: 1 },
    { id: "b", name: "B", nameTa: "ஆ", s: 2200, side: -1 },
    { id: "c", name: "C", nameTa: "இ", s: 4000, side: 1 },
  ],
  from: { name: "Chennai Beach", beyond: true },
  to: { name: "Tambaram", beyond: true },
  headwayMinutes: 6,
  offsetMinutes: 1,
};

describe("timetable", () => {
  const line = new RailLine(lineData);

  it("has only a few trains on the line, spaced well apart", () => {
    const length = 4 * 21; // four coaches
    for (let clock = 0; clock < 3 * 3600; clock += 7) {
      const trains = line.trains(clock).sort((a, b) => a.state.s - b.state.s);
      expect(trains.length).toBeLessThanOrEqual(Math.ceil(line.profile.duration / line.headway));
      for (let i = 1; i < trains.length; i++) expect(trains[i]!.state.s - trains[i - 1]!.state.s).toBeGreaterThan(length + 100);
    }
  });

  it("each train keeps its id while it runs, and leaves after its run", () => {
    const at = line.trains(4000)[0]!;
    const later = line.trains(4010).find((t) => t.id === at.id);
    expect(later).toBeDefined();
    expect(later!.state.s).toBeGreaterThanOrEqual(at.state.s);
    const departure = Number(at.id.split("#")[1]);
    expect(line.train(departure, line.offset + departure * line.headway + line.profile.duration + 1)).toBeNull();
  });

  it("predicts the next arrival at a stop", () => {
    const clock = 5000;
    const wait = line.nextArrival(1, clock);
    expect(wait).toBeGreaterThanOrEqual(0);
    expect(wait).toBeLessThanOrEqual(line.headway);
    const standing = line.trains(clock + wait + 1).find((t) => t.state.stoppedAt === 1);
    expect(standing).toBeDefined();
    // While a train stands there, the wait is zero.
    expect(line.nextArrival(1, clock + wait + 5)).toBe(0);
  });

  it("network: lines and stations from the file", () => {
    const network = new RailNetwork({ attribution: "©", tracks: [], lines: [lineData], stations: [] });
    expect(network.line("south")?.destination).toBe("Tambaram");
    expect(network.trains(5000).length).toBeGreaterThan(0);
  });
});

describe("boarding", () => {
  const line = new RailLine(lineData);
  const standing = (index: number, extra = 2) => {
    const departure = 3;
    const clock = line.offset + departure * line.headway + line.profile.arrivals[index]! + extra;
    return line.train(departure, clock)!;
  };

  it("finds the stop whose platform the player is on, on either side", () => {
    const platform = platformOf(line, line.stops[1]!);
    expect(stopAt(line, platform)).toBe(1);
    expect(stopAt(line, { x: platform.x, z: platform.z + 200 })).toBeNull();
    expect(stopAt(line, { x: 40, z: 2200 })).toBeNull();
  });

  it("lets the player board a standing train with a ticket", () => {
    expect(boarding(standing(1), 1, 100)).toEqual({ ok: true, fare: FARE });
    expect(boarding(standing(1), 0, 100).ok).toBe(false);
    expect(boarding(standing(1), 1, 2)).toMatchObject({ ok: false, reason: expect.stringContaining("₹") });
    expect(boarding(standing(1, EMU_MOTION.dwell - 0.5), 1, 100)).toMatchObject({ ok: false, reason: expect.stringContaining("closing") });
  });

  it("does not board a train whose next stop is beyond the map; a ride ends at the last stop on it", () => {
    const last = standing(2);
    expect(boarding(last, 2, 100)).toMatchObject({ ok: false, reason: expect.stringContaining("Tambaram") });
    expect(rideEndsAt(last)).toBe(true);
    expect(rideEndsAt(standing(1))).toBe(false);
    expect(canStepOff(standing(1))).toBe(true);
    const moving = line.train(3, line.offset + 3 * line.headway + line.profile.arrivals[1]! + EMU_MOTION.dwell + 20)!;
    expect(canStepOff(moving)).toBe(false);
  });
});
