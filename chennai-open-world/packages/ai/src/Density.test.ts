import { describe, expect, it } from "vitest";
import type { Road, WorldMap } from "@cow/game-world";
import { AgentSystem } from "./Agents";
import { areaBusyness, edgeBusyness, pedestrianDensity, trafficDensity } from "./Density";
import { TRAFFIC_KINDS, trafficSettings } from "./presets";
import { buildRoadGraph } from "./RoadGraph";

describe("traffic density", () => {
  it("peaks in the morning and evening rush and is light late at night", () => {
    for (const rush of [8.5, 9.5, 17.5, 19.5]) expect(trafficDensity(rush)).toBe(1);
    expect(trafficDensity(13)).toBeLessThan(0.85);
    expect(trafficDensity(13)).toBeGreaterThan(0.5);
    for (const late of [1, 3, 4.5]) expect(trafficDensity(late)).toBeLessThanOrEqual(0.3);
    // Wraps round midnight, and never leaves 0..1.
    expect(trafficDensity(24 + 9)).toBe(trafficDensity(9));
    for (let h = 0; h < 24; h += 0.25) {
      expect(trafficDensity(h)).toBeGreaterThan(0);
      expect(trafficDensity(h)).toBeLessThanOrEqual(1);
      expect(pedestrianDensity(h)).toBeGreaterThan(0);
      expect(pedestrianDensity(h)).toBeLessThanOrEqual(1);
    }
    expect(pedestrianDensity(2)).toBeLessThan(pedestrianDensity(18));
  });
});

/** An avenue along z = 0 with a shop beside it, and a residential street far to the south. */
function town(): WorldMap {
  const roads: Road[] = [
    { id: 1, kind: "secondary", width: 14, oneway: false, points: [{ x: -150, z: 0 }, { x: 150, z: 0 }] },
    { id: 2, kind: "residential", width: 7, oneway: false, points: [{ x: -150, z: 150 }, { x: 150, z: 150 }] },
    { id: 3, kind: "residential", width: 7, oneway: false, points: [{ x: -150, z: -150 }, { x: 150, z: -150 }] },
  ];
  return {
    name: "Test",
    origin: { lat: 13, lng: 80 },
    attribution: "",
    dataDate: "",
    bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
    chunkSize: 250,
    roads,
    areas: [],
    pois: [{ x: 0, z: 150, kind: "bakery" }, { x: 10, z: 150, kind: "pharmacy" }],
    chunks: [],
  };
}

describe("where traffic goes", () => {
  const map = town();
  const graph = buildRoadGraph(map, () => true);
  const weights = edgeBusyness(graph, map.pois);
  const weightOf = (z: number) => weights[graph.edges.findIndex((e) => graph.nodes[e.from]!.z === z)]!;

  it("weights main roads and streets with shops above quiet residential streets", () => {
    expect(weightOf(0)).toBeGreaterThan(2);
    expect(weightOf(-150)).toBe(1);
    expect(weightOf(150)).toBeGreaterThan(weightOf(-150));
  });

  it("puts more vehicles on the busier roads", () => {
    const counts = { avenue: 0, shops: 0, quiet: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      const system = new AgentSystem(graph, map.bounds, { ...trafficSettings(6), spawnMin: 0, spawnMax: 1000 }, seed);
      system.setSpawnWeights(weights);
      system.populate({ x: 0, z: 0 });
      for (const a of system.agents) {
        if (Math.abs(a.z) < 10) counts.avenue++;
        else if (a.z > 0) counts.shops++;
        else counts.quiet++;
      }
    }
    expect(counts.avenue).toBeGreaterThan(counts.shops);
    expect(counts.shops).toBeGreaterThan(counts.quiet);
  });

  it("rates an area by its roads: quieter round residential streets", () => {
    expect(areaBusyness(graph, weights, { x: 0, z: 0 }, 60)).toBe(1);
    expect(areaBusyness(graph, weights, { x: 0, z: -150 }, 60)).toBeLessThan(1);
    expect(areaBusyness(graph, weights, { x: 0, z: -150 }, 60)).toBeGreaterThanOrEqual(0.75);
  });
});

describe("mixed traffic", () => {
  const map = town();
  const graph = buildRoadGraph(map, () => true);

  it("mixes cars, two-wheelers, autos and buses, with any first part of the pool mixed too", () => {
    const system = new AgentSystem(graph, map.bounds, trafficSettings(9), 1);
    const names = system.agents.map((a) => system.kinds[a.kind]!.name);
    expect(new Set(names)).toEqual(new Set(["car", "bike", "auto", "bus"]));
    expect(new Set(names.slice(0, 4)).size).toBeGreaterThanOrEqual(3);
  });

  it("drives each kind at its own pace: buses and autos slower than cars, two-wheelers quicker", () => {
    const pace: Record<string, number> = {};
    for (const kind of TRAFFIC_KINDS) {
      const system = new AgentSystem(graph, map.bounds, trafficSettings(1, [kind]), 4);
      system.populate({ x: 0, z: 0 });
      const agent = system.agents[0]!;
      // Same agent (same variation), same road, only the kind differs.
      let top = 0;
      for (let i = 0; i < 60 * 12; i++) {
        system.update(1 / 60, [], { x: 0, z: 0 });
        top = Math.max(top, agent.speed);
      }
      pace[kind.name] = top;
      expect(top).toBeLessThanOrEqual(kind.maxSpeed + 1e-6);
    }
    expect(pace.bus!).toBeLessThan(pace.car!);
    expect(pace.auto!).toBeLessThan(pace.car!);
    expect(pace.bike!).toBeGreaterThan(pace.car!);
  });

  it("keeps a longer gap behind a bus than behind a two-wheeler", () => {
    const behind = (leader: (typeof TRAFFIC_KINDS)[number]) => {
      // Shares chosen so agent 0 is a car and agent 1 the leader's kind.
      const system = new AgentSystem(graph, map.bounds, trafficSettings(2, [{ ...TRAFFIC_KINDS[0]!, share: 0.1 }, { ...leader, share: 1 }]), 2);
      expect(system.kinds[system.agents[1]!.kind]!.name).toBe(leader.name);
      system.populate({ x: 0, z: 0 });
      const [car, lead] = system.agents;
      // Line them up on the quiet street heading east; the leader stopped 25 m ahead.
      const lane = -1.75;
      const edge = graph.edges.findIndex((e) => graph.nodes[e.from]!.z === -150 && e.dx > 0);
      for (const [agent, x] of [[car!, -60], [lead!, -35]] as const) {
        agent.edge = edge;
        agent.next = edge;
        agent.x = x;
        agent.z = -150 + lane;
        agent.heading = -Math.PI / 2;
        agent.speed = 0;
      }
      car!.speed = 6;
      for (let i = 0; i < 60 * 8; i++) {
        lead!.speed = 0;
        lead!.x = -35;
        system.update(1 / 60, [], { x: 0, z: 0 });
      }
      expect(car!.speed).toBeLessThan(0.1);
      return -35 - car!.x;
    };
    const bike = TRAFFIC_KINDS.find((k) => k.name === "bike")!;
    const bus = TRAFFIC_KINDS.find((k) => k.name === "bus")!;
    expect(behind(bus)).toBeGreaterThan(behind(bike) + 3);
  });
});

describe("active count", () => {
  const map = town();
  const graph = buildRoadGraph(map, () => true);

  it("puts extra agents away when it gets quiet and brings them back, out of sight", () => {
    const system = new AgentSystem(graph, map.bounds, trafficSettings(8), 3);
    const focus = { x: 0, z: 0 };
    system.populate(focus);
    system.setActiveCount(3, true);
    system.update(1 / 60, [], focus);
    expect(system.activeCount).toBe(3);
    expect(system.agents.slice(3).every((a) => !a.active)).toBe(true);
    // Put-away agents are not moved and do not block anyone.
    const parked = system.agents[5]!;
    const at = { x: parked.x, z: parked.z };
    for (let i = 0; i < 60 * 3; i++) system.update(1 / 60, [], focus);
    expect({ x: parked.x, z: parked.z }).toEqual(at);
    // Busier again: they come back in the spawn ring, not next to the player.
    system.setActiveCount(8);
    system.update(1 / 60, [], focus);
    expect(system.activeCount).toBe(8);
    for (const a of system.agents.slice(3)) expect(Math.hypot(a.x - focus.x, a.z - focus.z)).toBeGreaterThan(60);
  });

  it("waits until an agent is out of sight before putting it away", () => {
    const system = new AgentSystem(graph, map.bounds, trafficSettings(4), 3);
    const focus = { x: 0, z: 0 };
    system.populate(focus);
    const near = system.agents[3]!;
    near.x = 10;
    near.z = 0;
    system.setActiveCount(1);
    system.update(1 / 60, [], focus);
    expect(near.active).toBe(true);
    near.x = 140;
    system.update(1 / 60, [], focus);
    expect(near.active).toBe(false);
  });
});
