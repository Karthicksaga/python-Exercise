import { describe, expect, it } from "vitest";
import type { Road, RoadKind, WorldMap } from "@cow/game-world";
import { AgentSystem, type Agent } from "./Agents";
import { TRAFFIC_KINDS, trafficSettings } from "./presets";
import { buildRoadGraph, type RoadGraph } from "./RoadGraph";
import { AMBER, GREEN, RED, SIGNAL_TIMING, TrafficSignals, junctionRadii } from "./Signals";

function world(roads: Road[]): WorldMap {
  return {
    name: "Test",
    origin: { lat: 13, lng: 80 },
    attribution: "",
    dataDate: "",
    bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
    chunkSize: 250,
    roads,
    areas: [],
    pois: [],
    chunks: [],
  };
}

const road = (id: number, kind: RoadKind, width: number, points: Array<[number, number]>): Road => ({ id, kind, width, oneway: false, points: points.map(([x, z]) => ({ x, z })) });

/**
 * A 3 × 3 grid, 100 m apart: a tertiary avenue each way through the middle (10 m wide),
 * residential streets round the outside (7 m). Signals belong at the centre (4 arms) and at the
 * four T-junctions where the avenues meet the outer streets; not at the corners.
 */
function grid(): WorldMap {
  return world([
    road(1, "tertiary", 10, [[-100, 0], [0, 0], [100, 0]]),
    road(2, "tertiary", 10, [[0, -100], [0, 0], [0, 100]]),
    road(3, "residential", 7, [[-100, -100], [0, -100], [100, -100]]),
    road(4, "residential", 7, [[100, -100], [100, 0], [100, 100]]),
    road(5, "residential", 7, [[100, 100], [0, 100], [-100, 100]]),
    road(6, "residential", 7, [[-100, 100], [-100, 0], [-100, -100]]),
  ]);
}

const drive = (map: WorldMap) => buildRoadGraph(map, (r) => r.kind !== "footway" && r.kind !== "service");

describe("traffic signals", () => {
  it("are built where three or more roads meet and one is a main road", () => {
    const signals = new TrafficSignals(drive(grid()));
    expect(signals.junctions).toHaveLength(5);
    const centre = signals.junctions.find((j) => Math.hypot(j.x, j.z) < 1)!;
    expect(centre.approaches).toHaveLength(4);
    // The T-junctions have three arms each.
    expect(signals.approaches).toHaveLength(4 + 4 * 3);
    // No signals where only residential streets meet.
    const quiet = world([road(1, "residential", 7, [[-100, 0], [0, 0], [100, 0]]), road(2, "residential", 7, [[0, 0], [0, 100]])]);
    expect(new TrafficSignals(drive(quiet)).junctions).toHaveLength(0);
    // A main road bending is not a junction either.
    const bend = world([road(1, "secondary", 14, [[-100, 0], [0, 0], [0, 100]])]);
    expect(new TrafficSignals(drive(bend)).junctions).toHaveLength(0);
  });

  it("join nodes a few metres apart into one junction", () => {
    // A staggered crossing: side streets 8 m apart on either side of the avenue.
    const staggered = world([
      road(1, "tertiary", 10, [[-100, 0], [0, 0], [8, 0], [100, 0]]),
      road(2, "residential", 7, [[0, -100], [0, 0]]),
      road(3, "residential", 7, [[8, 0], [8, 100]]),
    ]);
    const signals = new TrafficSignals(drive(staggered));
    expect(signals.junctions).toHaveLength(1);
    // Four arms come in from outside; the 8 m link between the nodes is not an arm.
    expect(signals.junctions[0]!.approaches).toHaveLength(4);
  });

  it("give opposite arms the same phase and crossing arms the other", () => {
    const graph = drive(grid());
    const signals = new TrafficSignals(graph);
    const centre = signals.junctions.find((j) => Math.hypot(j.x, j.z) < 1)!;
    const eastWest = centre.approaches.filter((a) => Math.abs(a.dx) > 0.9);
    const northSouth = centre.approaches.filter((a) => Math.abs(a.dz) > 0.9);
    expect(new Set(eastWest.map((a) => a.group)).size).toBe(1);
    expect(new Set(northSouth.map((a) => a.group)).size).toBe(1);
    expect(eastWest[0]!.group).not.toBe(northSouth[0]!.group);
  });

  it("cycle green, amber, red, and never show green to both groups", () => {
    const signals = new TrafficSignals(drive(grid()));
    const cycle = 2 * (SIGNAL_TIMING.green + SIGNAL_TIMING.amber + SIGNAL_TIMING.allRed);
    for (const junction of signals.junctions) {
      const seen: Record<number, number> = { [GREEN]: 0, [AMBER]: 0, [RED]: 0 };
      let bothRed = 0;
      for (let t = 0; t < cycle; t += 0.1) {
        signals.time = t;
        const a = signals.light(junction.id, 0);
        const b = signals.light(junction.id, 1);
        expect(a === GREEN && b === GREEN).toBe(false);
        expect(a !== RED && b !== RED).toBe(false);
        if (a === RED && b === RED) bothRed += 0.1;
        seen[a]! += 0.1;
      }
      expect(seen[GREEN]).toBeCloseTo(SIGNAL_TIMING.green, 0);
      expect(seen[AMBER]).toBeCloseTo(SIGNAL_TIMING.amber, 0);
      // An all-red moment at each change.
      expect(bothRed).toBeCloseTo(2 * SIGNAL_TIMING.allRed, 0);
    }
    // Neighbouring junctions don't all change together.
    expect(new Set(signals.junctions.map((j) => Math.round(j.offset))).size).toBeGreaterThan(2);
  });

  it("put the stop line before the zebra, and the zebra where people walking beside the cross road step over", () => {
    const signals = new TrafficSignals(drive(grid()));
    const centre = signals.junctions.find((j) => Math.hypot(j.x, j.z) < 1)!;
    for (const a of centre.approaches) {
      const line = Math.hypot(a.x, a.z);
      const zebra = Math.hypot(a.crossing.x, a.crossing.z);
      // Cross road 10 m wide; people walk 1.4 m outside its kerb.
      expect(zebra).toBeCloseTo(5 + 1.4, 5);
      expect(line).toBeGreaterThan(zebra + a.crossing.depth / 2);
      expect(a.crossing.span).toBe(10);
    }
  });

  it("see people on a crossing", () => {
    const signals = new TrafficSignals(drive(grid()));
    const a = signals.approaches[0]!;
    signals.update(0.1, [{ x: a.crossing.x + a.crossing.dz * 2, z: a.crossing.z - a.crossing.dx * 2 }]);
    expect(signals.crossingBusy(a)).toBe(true);
    // Walking along the verge beside the road is not crossing it.
    signals.update(0.1, [{ x: a.crossing.x + a.crossing.dz * (a.width / 2 + 1.4), z: a.crossing.z - a.crossing.dx * (a.width / 2 + 1.4) }]);
    expect(signals.crossingBusy(a)).toBe(false);
  });
});

/** Put one agent on a given edge, `back` metres before its end, in lane, at a speed. */
function putOn(graph: RoadGraph, agent: Agent, edgeIndex: number, back: number, speed: number, next?: number): void {
  const edge = graph.edges[edgeIndex]!;
  const from = graph.nodes[edge.from]!;
  const lane = Math.min(edge.width / 4, 2.6);
  const along = edge.length - back;
  agent.edge = edgeIndex;
  agent.next = next ?? graph.nodes[edge.to]!.out.find((e) => {
    const o = graph.edges[e]!;
    return o.dx * edge.dx + o.dz * edge.dz > 0.9; // straight on
  })!;
  agent.x = from.x + edge.dx * along + edge.dz * lane;
  agent.z = from.z + edge.dz * along - edge.dx * lane;
  agent.heading = Math.atan2(-edge.dx, -edge.dz);
  agent.speed = speed;
  agent.stuck = 0;
  agent.generation++;
}

/** An edge of the graph from one point to another. */
const edgeBetween = (graph: RoadGraph, ax: number, az: number, bx: number, bz: number) =>
  graph.edges.findIndex((e) => {
    const f = graph.nodes[e.from]!;
    const t = graph.nodes[e.to]!;
    return f.x === ax && f.z === az && t.x === bx && t.z === bz;
  });

describe("traffic at signals", () => {
  const map = grid();
  const graph = drive(map);
  const centre = { x: 0, z: 0 };

  it("stops before the line on red and goes on green", () => {
    const signals = new TrafficSignals(graph);
    const system = new AgentSystem(graph, map.bounds, trafficSettings(1, [TRAFFIC_KINDS[0]!]), 1);
    system.useSignals(signals);
    system.populate(centre);
    const agent = system.agents[0]!;
    // Coming from the west towards the centre, 60 m out, at 9 m/s.
    const west = edgeBetween(graph, -100, 0, 0, 0);
    putOn(graph, agent, west, 60, 9);
    const approach = signals.approachOn(west)!;
    // Set the clock so this arm has just turned red.
    const j = signals.junctions[approach.junction]!;
    const cycle = 2 * (SIGNAL_TIMING.green + SIGNAL_TIMING.amber + SIGNAL_TIMING.allRed);
    const redAt = (SIGNAL_TIMING.green + SIGNAL_TIMING.amber + (approach.group === 1 ? cycle / 2 : 0)) % cycle;
    signals.time = (((redAt - j.offset) % cycle) + cycle) % cycle + 0.1;
    expect(signals.lightFor(approach)).toBe(RED);
    for (let i = 0; i < 60 * 9; i++) {
      signals.update(1 / 60, []);
      system.update(1 / 60, [], centre);
    }
    expect(signals.lightFor(approach)).toBe(RED);
    expect(agent.speed).toBeLessThan(0.05);
    expect(agent.atSignal).toBe(true);
    // Its front is just behind the stop line.
    const front = -agent.x - TRAFFIC_KINDS[0]!.halfLength; // metres from the centre, coming from the west
    const lineFromCentre = approach.stopBack;
    expect(front).toBeGreaterThan(lineFromCentre - 0.01);
    expect(front).toBeLessThan(lineFromCentre + 1.5);
    // Wait for green and it goes through.
    for (let i = 0; i < 60 * 25 && agent.x < 10; i++) {
      signals.update(1 / 60, []);
      system.update(1 / 60, [], centre);
    }
    expect(agent.x).toBeGreaterThan(10);
  });

  it("waits for someone on the zebra even on green", () => {
    const signals = new TrafficSignals(graph);
    const system = new AgentSystem(graph, map.bounds, trafficSettings(1, [TRAFFIC_KINDS[0]!]), 1);
    system.useSignals(signals);
    system.populate(centre);
    const agent = system.agents[0]!;
    const west = edgeBetween(graph, -100, 0, 0, 0);
    putOn(graph, agent, west, 40, 8);
    const approach = signals.approachOn(west)!;
    const j = signals.junctions[approach.junction]!;
    const cycle = 2 * (SIGNAL_TIMING.green + SIGNAL_TIMING.amber + SIGNAL_TIMING.allRed);
    const greenAt = approach.group === 1 ? cycle / 2 : 0;
    signals.time = (((greenAt - j.offset) % cycle) + cycle) % cycle + 0.1;
    // Someone standing in the middle of the crossing, on the far lane.
    const person = { x: approach.crossing.x, z: approach.crossing.z - 2 };
    for (let i = 0; i < 60 * 6; i++) {
      signals.update(1 / 60, [person]);
      system.update(1 / 60, [], centre);
    }
    expect(signals.lightFor(approach)).toBe(GREEN);
    expect(agent.speed).toBeLessThan(0.05);
    expect(agent.x).toBeLessThan(approach.crossing.x - approach.crossing.depth / 2);
    // They step off; the car carries on.
    for (let i = 0; i < 60 * 4; i++) {
      signals.update(1 / 60, []);
      system.update(1 / 60, [], centre);
    }
    expect(agent.speed).toBeGreaterThan(2);
  });
});

/** Footprints overlap (separating-axis test on two rotated rectangles, shrunk by a margin). */
function overlap(a: Agent, b: Agent, margin: number): boolean {
  const ka = TRAFFIC_KINDS[a.kind]!;
  const kb = TRAFFIC_KINDS[b.kind]!;
  const boxes = [
    { x: a.x, z: a.z, h: a.heading, w: ka.halfWidth - margin, l: ka.halfLength - margin },
    { x: b.x, z: b.z, h: b.heading, w: kb.halfWidth - margin, l: kb.halfLength - margin },
  ];
  const axes = boxes.flatMap((box) => [
    { x: Math.cos(box.h), z: -Math.sin(box.h) },
    { x: -Math.sin(box.h), z: -Math.cos(box.h) },
  ]);
  for (const axis of axes) {
    const project = (box: (typeof boxes)[number]) => {
      const c = box.x * axis.x + box.z * axis.z;
      const r = box.w * Math.abs(Math.cos(box.h) * axis.x - Math.sin(box.h) * axis.z) + box.l * Math.abs(-Math.sin(box.h) * axis.x - Math.cos(box.h) * axis.z);
      return [c - r, c + r] as const;
    };
    const [a0, a1] = project(boxes[0]!);
    const [b0, b1] = project(boxes[1]!);
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}

describe("junctions", () => {
  it("are where roads meet or turn sharply, sized by the widest road", () => {
    const graph = drive(grid());
    const radius = junctionRadii(graph);
    const centre = graph.nodes.findIndex((n) => n.x === 0 && n.z === 0);
    expect(radius[centre]).toBeCloseTo(6);
    // A right-angled corner counts: a bus swings across the other lane there.
    const corner = graph.nodes.findIndex((n) => n.x === 100 && n.z === 100);
    expect(radius[corner]).toBeCloseTo(4.5);
    // A road carrying straight on through a node does not.
    const straight = drive(world([road(1, "residential", 7, [[-100, 0], [0, 0], [100, 2]])]));
    expect(junctionRadii(straight)[1]).toBe(0);
  });

  it("are taken in turn: crossing vehicles never drive through each other", () => {
    // A plain crossroads of residential streets, no signals: two cars arrive together.
    const map = world([road(1, "residential", 7, [[-100, 0], [0, 0], [100, 0]]), road(2, "residential", 7, [[0, -100], [0, 0], [0, 100]])]);
    const graph = drive(map);
    const system = new AgentSystem(graph, map.bounds, trafficSettings(2, [TRAFFIC_KINDS[0]!]), 3);
    system.populate({ x: 0, z: 0 });
    const [a, b] = system.agents as [Agent, Agent];
    putOn(graph, a, edgeBetween(graph, -100, 0, 0, 0), 30, 6); // eastbound
    putOn(graph, b, edgeBetween(graph, 0, 100, 0, 0), 30, 6); // northbound
    let closest = Infinity;
    let gaveWay = false;
    for (let i = 0; i < 60 * 12; i++) {
      system.update(1 / 60, [], { x: 0, z: 0 });
      closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
      gaveWay ||= a.givingWay || b.givingWay;
      expect(overlap(a, b, 0)).toBe(false);
    }
    expect(gaveWay).toBe(true);
    // Both got through.
    expect(Math.max(Math.abs(a.x), Math.abs(a.z))).toBeGreaterThan(20);
    expect(Math.max(Math.abs(b.x), Math.abs(b.z))).toBeGreaterThan(20);
    expect(closest).toBeGreaterThan(2);
  });

  it("a busy mixed grid with signals runs for minutes without vehicles passing through each other", () => {
    const map = grid();
    const graph = drive(map);
    const signals = new TrafficSignals(graph);
    const system = new AgentSystem(graph, map.bounds, trafficSettings(12), 2026);
    system.useSignals(signals);
    const focus = { x: 0, z: 0 };
    system.populate(focus);
    let overlaps = 0;
    let stoppedAtLights = 0;
    let travelled = 0;
    for (let i = 0; i < 60 * 180; i++) {
      signals.update(1 / 60, []);
      system.update(1 / 60, [], focus);
      for (const agent of system.agents) {
        travelled += agent.speed / 60;
        if (agent.atSignal && agent.speed < 0.1) stoppedAtLights++;
      }
      if (i % 6 !== 0) continue;
      for (let p = 0; p < system.agents.length; p++) {
        for (let q = p + 1; q < system.agents.length; q++) {
          // A small margin: the footprints are boxes, the bodies have rounded corners.
          if (overlap(system.agents[p]!, system.agents[q]!, 0.15)) overlaps++;
        }
      }
    }
    expect(overlaps).toBe(0);
    expect(stoppedAtLights).toBeGreaterThan(0);
    // Traffic still flows: on average well over 2 m/s per vehicle.
    expect(travelled / 180 / 12).toBeGreaterThan(2);
  });
});
