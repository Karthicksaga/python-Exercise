import { describe, expect, it } from "vitest";
import { EMU_MOTION, RunProfile } from "./motion";
import { RailNetwork } from "./network";
import { boardStatus, boardText, clockText, departureRows, stationPlatforms } from "./station";
import { LOAD_MAX, LOAD_MIN, MAX_ALIGHTING, MAX_BOARDING, MAX_ON_PLATFORM, MAX_WAITING, StationCrowd, initialLoad, passengerFlow, waitingCount, type CrowdTrain } from "./crowd";
import type { RailFile } from "./types";

describe("a train arriving at and leaving a station", () => {
  const profile = new RunProfile(3000, [1000, 2000]);
  const arrive = profile.arrivals[0]!;

  it("slows down all the way to a stop exactly at the stop mark", () => {
    let last = Infinity;
    // The last 20 s before arriving: speed falls every sample and reaches 0 on the mark.
    for (let t = arrive - 20; t <= arrive; t += 0.5) {
      const state = profile.state(t);
      expect(state.speed).toBeLessThanOrEqual(last + 1e-9);
      last = state.speed;
    }
    const at = profile.state(arrive);
    expect(at.speed).toBe(0);
    expect(at.s).toBeCloseTo(1000, 6);
    expect(at.stoppedAt).toBe(0);
    // Just before the mark it is still creeping in, short of it.
    const before = profile.state(arrive - 1);
    expect(before.speed).toBeGreaterThan(0);
    expect(before.speed).toBeLessThan(1.5);
    expect(before.s).toBeLessThan(1000);
    // Braking is steady (about the EMU's brake rate), not a sudden stop.
    expect(profile.state(arrive - 2).speed - before.speed).toBeCloseTo(EMU_MOTION.brake, 6);
  });

  it("stands for the dwell, then pulls away faster and faster", () => {
    for (let t = arrive; t < arrive + EMU_MOTION.dwell - 0.01; t += 1) {
      const state = profile.state(t);
      expect(state.speed).toBe(0);
      expect(state.s).toBeCloseTo(1000, 6);
    }
    let last = 0;
    for (let t = arrive + EMU_MOTION.dwell + 0.5; t < arrive + EMU_MOTION.dwell + 15; t += 0.5) {
      const state = profile.state(t);
      expect(state.stoppedAt).toBeNull();
      expect(state.speed).toBeGreaterThan(last);
      last = state.speed;
    }
    // Accelerating from rest: s grows with the square of time at the EMU's rate.
    const s5 = profile.state(arrive + EMU_MOTION.dwell + 5).s - 1000;
    expect(s5).toBeCloseTo(0.5 * EMU_MOTION.accel * 25, 4);
  });
});

// Two directions: the down line has a side platform at A and an island at B shared with the up line.
const file: RailFile = {
  attribution: "© OpenStreetMap contributors",
  tracks: [
    { id: 1, kind: "main", points: [0, 0, 0, 3000] },
    { id: 2, kind: "main", points: [-16, 0, -16, 3000] },
    { id: 3, kind: "main", points: [10, 0, 10, 3000] },
  ],
  lines: [
    {
      id: "down",
      name: "Down",
      points: [0, 0, 0, 3000],
      stops: [
        { id: "a", name: "Alpha", nameTa: "அ", s: 1000, side: 1, width: 4 },
        { id: "b", name: "Bravo", nameTa: "ப", s: 2000, side: -1, width: 12.5 },
      ],
      from: { name: "North", beyond: true },
      to: { name: "South", beyond: true },
      headwayMinutes: 8,
      offsetMinutes: 0,
    },
    {
      id: "up",
      name: "Up",
      points: [-16, 3000, -16, 0],
      stops: [
        { id: "b", name: "Bravo", nameTa: "ப", s: 1000, side: -1, width: 12.5, twin: true },
        { id: "a", name: "Alpha", nameTa: "அ", s: 2000, side: 1, width: 4 },
      ],
      from: { name: "South", beyond: true },
      to: { name: "North", beyond: true },
      headwayMinutes: 8,
      offsetMinutes: 3,
    },
  ],
  stations: [
    { id: "a", name: "Alpha", nameTa: "அ", nameHi: "अ", x: 4, z: 1000 },
    { id: "b", name: "Bravo", nameTa: "ப", x: -8, z: 2000 },
  ],
};
const network = new RailNetwork(file);

describe("station layout", () => {
  const platforms = stationPlatforms(network);

  it("draws one platform per stop, an island once for both directions", () => {
    expect(platforms.map((p) => p.key)).toEqual(["down:0", "down:1", "up:1"]);
    const island = platforms.find((p) => p.key === "down:1")!;
    expect(island.island).toBe(true);
    expect(island.services.map((s) => [s.line.id, s.number])).toEqual([["down", 1], ["up", 2]]);
    // The up line's track is on the island's far side (16 m to the down line's right), its edge facing back in.
    const up = island.services[1]!;
    expect(up.track).toBeCloseTo(-16, 0);
    expect(up.inward).toBe(1);
    expect(up.edge).toBeCloseTo(-14.25, 1);
  });

  it("spans every track nearby with the foot-over-bridge and puts the booking office beyond", () => {
    const side = platforms.find((p) => p.key === "down:0")!;
    // Tracks at 0 (own), +10 (left, behind the platform) and -16 (right, the other direction): the FOB reaches past both.
    expect(side.fob.from).toBeLessThan(-16);
    expect(side.fob.to).toBeGreaterThan(10);
    // A side platform's office is behind it, beyond the FOB's landing.
    expect(side.office.w).toBeGreaterThan(side.fob.to);
    expect(side.exits.length).toBe(3);
  });

  it("numbers the other direction's side platform 2", () => {
    expect(platforms.find((p) => p.key === "up:1")!.services[0]!.number).toBe(2);
  });
});

describe("the departure board", () => {
  const platforms = stationPlatforms(network);
  const island = platforms.find((p) => p.key === "down:1")!;

  it("lists the next trains soonest first, both directions, with minutes", () => {
    const clock = 4 * 3600;
    const rows = departureRows(island, clock);
    expect(rows).toHaveLength(3);
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.wait).toBeGreaterThanOrEqual(rows[i - 1]!.wait);
    expect(new Set(rows.map((r) => r.destination))).toEqual(new Set(["South", "North"]));
    // The first row agrees with the timetable.
    const down = network.line("down")!;
    const up = network.line("up")!;
    expect(rows[0]!.wait).toBeCloseTo(Math.min(down.nextArrival(1, clock), up.nextArrival(0, clock)), 6);
  });

  it("says when a train stands at the platform", () => {
    const down = network.line("down")!;
    // A train of the down line stands at Bravo: its arrival time plus a few seconds.
    const clock = down.offset + 10 * down.headway + down.profile.arrivals[1]! + 5;
    const rows = departureRows(island, clock);
    expect(rows[0]).toMatchObject({ destination: "South", platform: 1, wait: 0, status: "On platform" });
    const text = boardText(island, clock, 17.5);
    expect(text[0]).toBe("BRAVO  17:30");
    expect(text[1]).toBe("PF 1  SOUTH  ON PLATFORM");
  });

  it("words the status by the wait", () => {
    expect(boardStatus(0, true)).toBe("On platform");
    expect(boardStatus(30, false)).toBe("Arriving");
    expect(boardStatus(55, false)).toBe("Due");
    expect(boardStatus(301, false)).toBe("6 min");
    expect(clockText(9.25)).toBe("09:15");
    expect(clockText(23.999)).toBe("23:59");
  });
});

describe("passengers", () => {
  it("wait in rush hours far more than at night, within the cap", () => {
    expect(waitingCount(8.5)).toBeGreaterThan(waitingCount(3) * 4);
    expect(waitingCount(18)).toBe(MAX_WAITING);
    expect(waitingCount(3)).toBeGreaterThanOrEqual(1);
    expect(waitingCount(12, 0.5)).toBeLessThan(waitingCount(12, 1));
    for (let h = 0; h < 24; h += 0.25) expect(waitingCount(h)).toBeLessThanOrEqual(MAX_WAITING);
  });

  it("board up to the cap and the train's room, and alight between a few and the cap", () => {
    expect(passengerFlow(5, 100, "t#1", "s").board).toBe(5);
    expect(passengerFlow(50, 100, "t#1", "s").board).toBe(MAX_BOARDING);
    // A full train takes only as many as get off.
    const full = passengerFlow(50, 400, "t#1", "s", 400);
    expect(full.board).toBe(full.alight);
    for (let k = 0; k < 50; k++) {
      const { alight } = passengerFlow(10, 100, `t#${k}`, "s");
      expect(alight).toBeGreaterThanOrEqual(2);
      expect(alight).toBeLessThanOrEqual(MAX_ALIGHTING);
      // The same train at the same stop always lets off the same number.
      expect(passengerFlow(3, 100, `t#${k}`, "s").alight).toBe(alight);
    }
    expect(passengerFlow(10, 1, "t#1", "s").alight).toBeLessThanOrEqual(1);
    const load = initialLoad("down#7");
    expect(load).toBeGreaterThanOrEqual(LOAD_MIN);
    expect(load).toBeLessThanOrEqual(LOAD_MAX);
  });

  const spec = { half: 55, edges: [{ w: 1.75, inward: 1 as const }, { w: 14, inward: -1 as const }], exits: [-54, 54, -16.7], middle: 7.9, key: "test" };
  const train = (open: number, dwellLeft: number): CrowdTrain => ({ id: "down#3", service: 0, doors: [-20, -10, 0, 10, 20].map((u) => ({ u, w: 1.75 })), open, dwellLeft, load: 120 });

  it("fills the platform at once, then a stopped train takes some and lets others off", () => {
    const crowd = new StationCrowd(spec);
    crowd.step(1 / 60, 20, []);
    expect(crowd.waiting).toBe(20);
    const forDown = crowd.people.filter((p) => p.service === 0).length;
    // Everyone waits on the deck, by their edge.
    for (const p of crowd.people) {
      expect(p.w).toBeGreaterThan(1.75);
      expect(p.w).toBeLessThan(14);
    }
    // Doors shut: nobody moves yet.
    crowd.step(1 / 60, 20, [train(0.2, 29)]);
    expect(crowd.waiting).toBe(20);
    // Doors open: the flow is decided and people walk.
    crowd.step(1 / 60, 20, [train(1, 27)]);
    const flow = crowd.flows.get("down#3")!;
    expect(flow.board).toBe(Math.min(forDown, MAX_BOARDING));
    expect(flow.alight).toBeGreaterThan(0);
    expect(crowd.waiting).toBe(20 - flow.board);
    for (let i = 0; i < 25 * 60; i++) crowd.step(1 / 60, 20, [train(1, 27 - i / 60)]);
    // Everyone who set off reached a door (an island platform is at most 12 m across, 40 m to a door).
    expect(flow.boarded).toBe(flow.board);
    expect(flow.alighted).toBe(flow.alight);
    expect(crowd.people.length).toBeLessThanOrEqual(MAX_ON_PLATFORM);
  });

  it("sends those still walking back to wait when the train leaves, and the people off walk to the exits", () => {
    const crowd = new StationCrowd(spec);
    crowd.step(1 / 60, 20, []);
    crowd.step(1 / 60, 20, [train(1, 3)]);
    const walking = crowd.people.filter((p) => p.state === "boarding").length;
    expect(walking).toBeGreaterThan(0);
    // It leaves before most reach a door.
    crowd.step(0.2, 20, [train(1, 2.8)]);
    crowd.step(1 / 60, 20, []);
    expect(crowd.people.filter((p) => p.state === "boarding")).toHaveLength(0);
    for (let i = 0; i < 90 * 60; i++) crowd.step(1 / 60, 20, []);
    // The people who got off are gone through the exits; the platform is back to its count.
    expect(crowd.people.filter((p) => p.state === "alighting")).toHaveLength(0);
    expect(crowd.waiting).toBe(20);
  });
});
