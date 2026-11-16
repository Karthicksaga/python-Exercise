import { describe, expect, it } from "vitest";
import type { WorldMap } from "@cow/game-world";
import { AgentSystem } from "./Agents";
import { pedestrianSettings, trafficSettings } from "./presets";
import { buildRoadGraph, nextEdge } from "./RoadGraph";

/** A square block of four streets, 200 m a side, plus a footpath across it. */
function town(): WorldMap {
  const corners = [
    { x: -100, z: -100 },
    { x: 100, z: -100 },
    { x: 100, z: 100 },
    { x: -100, z: 100 },
  ];
  const roads = corners.map((corner, i) => ({ id: i, kind: "residential" as const, width: 7, oneway: false, points: [corner, corners[(i + 1) % 4]!] }));
  return {
    name: "Test",
    origin: { lat: 13, lng: 80 },
    attribution: "",
    dataDate: "",
    bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
    chunkSize: 250,
    roads: [...roads, { id: 9, kind: "footway", width: 2, oneway: false, points: [corners[0]!, corners[2]!] }],
    areas: [],
    pois: [],
    chunks: [],
  };
}

describe("road graph", () => {
  it("joins roads that share a point and skips excluded roads", () => {
    const graph = buildRoadGraph(town(), (road) => road.kind !== "footway");
    expect(graph.nodes).toHaveLength(4);
    expect(graph.edges).toHaveLength(8); // four streets, both directions
    expect(graph.nodes.every((node) => node.out.length === 2)).toBe(true);
    expect(buildRoadGraph(town(), () => true).edges).toHaveLength(10);
  });

  it("makes one-way streets one direction only, unless told to ignore that", () => {
    const map = town();
    const oneWay = { ...map, roads: map.roads.map((road) => ({ ...road, oneway: true })) };
    expect(buildRoadGraph(oneWay, (road) => road.kind !== "footway").edges).toHaveLength(4);
    expect(buildRoadGraph(oneWay, (road) => road.kind !== "footway", false).edges).toHaveLength(8);
  });

  it("continues onwards rather than turning back", () => {
    const graph = buildRoadGraph(town(), (road) => road.kind !== "footway");
    const edge = 0;
    const onward = nextEdge(graph, edge, () => 0);
    expect(graph.edges[onward]!.from).toBe(graph.edges[edge]!.to);
    expect(graph.edges[onward]!.to).not.toBe(graph.edges[edge]!.from);
  });
});

describe("agents", () => {
  const map = town();
  const graph = buildRoadGraph(map, (road) => road.kind !== "footway");
  const far = { x: 0, z: 0 };

  it("drive along the streets, in the left-hand lane, without leaving them", () => {
    const system = new AgentSystem(graph, map.bounds, trafficSettings(4), 7);
    system.populate(far);
    const start = system.agents.map((a) => ({ x: a.x, z: a.z }));
    for (let i = 0; i < 60 * 30; i++) system.update(1 / 60, [], far);
    system.agents.forEach((agent, i) => {
      expect(Math.hypot(agent.x - start[i]!.x, agent.z - start[i]!.z)).toBeGreaterThan(5);
      // Always within a lane's width of the square's perimeter.
      const offRoad = Math.abs(Math.max(Math.abs(agent.x), Math.abs(agent.z)) - 100);
      expect(offRoad).toBeLessThan(4.5);
    });
  });

  it("stop for an obstacle in their path and move on when it is gone", () => {
    const system = new AgentSystem(graph, map.bounds, trafficSettings(1), 3);
    system.populate(far);
    const agent = system.agents[0]!;
    for (let i = 0; i < 60 * 4; i++) system.update(1 / 60, [], far);
    expect(agent.speed).toBeGreaterThan(3);
    // Something appears 8 m straight ahead.
    const block = { x: agent.x - Math.sin(agent.heading) * 8, z: agent.z - Math.cos(agent.heading) * 8, radius: 0.5 };
    for (let i = 0; i < 60 * 3; i++) system.update(1 / 60, [block], far);
    expect(agent.speed).toBeLessThan(0.1);
    expect(Math.hypot(agent.x - block.x, agent.z - block.z)).toBeGreaterThan(2.5);
    for (let i = 0; i < 60 * 4; i++) system.update(1 / 60, [], far);
    expect(agent.speed).toBeGreaterThan(3);
  });

  it("pull over and slow down for a siren behind them, then carry on", () => {
    const system = new AgentSystem(graph, map.bounds, trafficSettings(1), 3);
    system.populate(far);
    const agent = system.agents[0]!;
    for (let i = 0; i < 60 * 4; i++) system.update(1 / 60, [], far);
    expect(agent.speed).toBeGreaterThan(3);
    for (let i = 0; i < 60 * 3; i++) {
      // The ambulance follows 20 m behind, facing the same way.
      const siren = { x: agent.x + Math.sin(agent.heading) * 20, z: agent.z + Math.cos(agent.heading) * 20, heading: agent.heading };
      system.update(1 / 60, [], far, siren);
    }
    expect(agent.speed).toBeLessThanOrEqual(2.01);
    expect(agent.pullOver).toBeGreaterThan(0.95);
    // A siren well behind and far away is ignored.
    for (let i = 0; i < 60 * 4; i++) system.update(1 / 60, [], far, { x: agent.x + 500, z: agent.z + 500, heading: 0 });
    expect(agent.pullOver).toBe(0);
    expect(agent.speed).toBeGreaterThan(3);
  });

  it("are recycled near the player when they get too far away", () => {
    const system = new AgentSystem(graph, map.bounds, trafficSettings(3), 5);
    system.populate(far);
    const generations = system.agents.map((a) => a.generation);
    // The player is suddenly a long way off.
    system.update(1 / 60, [], { x: 5000, z: 5000 });
    system.agents.forEach((agent, i) => expect(agent.generation).toBeGreaterThan(generations[i]!));
  });

  it("pedestrians walk beside the road, not on it", () => {
    const walk = buildRoadGraph(map, (road) => road.kind !== "footway", false);
    const system = new AgentSystem(walk, map.bounds, pedestrianSettings(4), 11);
    system.populate(far);
    for (let i = 0; i < 60 * 20; i++) system.update(1 / 60, [], far);
    for (const agent of system.agents) {
      const fromCentreLine = Math.abs(Math.max(Math.abs(agent.x), Math.abs(agent.z)) - 100);
      expect(fromCentreLine).toBeGreaterThan(3.2);
      expect(fromCentreLine).toBeLessThan(7);
      expect(agent.speed).toBeGreaterThan(0.8);
    }
  });

  it("turn round at a dead end instead of circling in front of it", () => {
    // One street with nothing at either end: every agent must reach an end and come back.
    const lane: WorldMap = { ...map, roads: [{ id: 1, kind: "residential", width: 7, oneway: false, points: [{ x: -60, z: 0 }, { x: 0, z: 0 }, { x: 60, z: 0 }] }] };
    for (const settings of [trafficSettings(2), pedestrianSettings(2)]) {
      const system = new AgentSystem(buildRoadGraph(lane, () => true, false), lane.bounds, settings, 4);
      system.populate(far);
      const reach = system.agents.map((a) => ({ min: a.x, max: a.x }));
      // Long enough for the slowest walker (1.1 m/s) to cover the street end to end and back.
      for (let i = 0; i < 60 * 320; i++) {
        system.update(1 / 60, [], far);
        system.agents.forEach((a, k) => {
          reach[k]!.min = Math.min(reach[k]!.min, a.x);
          reach[k]!.max = Math.max(reach[k]!.max, a.x);
        });
      }
      // Each one has been close to both ends of the 120 m street, staying beside it.
      system.agents.forEach((agent, k) => {
        expect(reach[k]!.min).toBeLessThan(-45);
        expect(reach[k]!.max).toBeGreaterThan(45);
        expect(Math.abs(agent.z)).toBeLessThan(7);
      });
    }
  });

  it("creates no agents when there are no roads", () => {
    const empty = buildRoadGraph({ ...map, roads: [] }, () => true);
    expect(new AgentSystem(empty, map.bounds, trafficSettings(5)).agents).toHaveLength(0);
  });
});

describe("moving to a new area's road graph", () => {
  it("keeps every agent on its stretch of road when the new graph has it", () => {
    const map = town();
    const streets = (road: { kind: string }) => road.kind !== "footway";
    const all = buildRoadGraph(map, streets);
    const system = new AgentSystem(all, map.bounds, trafficSettings(4), 3);
    system.populate({ x: 0, z: 0 });
    for (let i = 0; i < 60; i++) system.update(1 / 30, [], { x: 0, z: 0 });
    const before = system.agents.map((a) => {
      const e = all.edges[a.edge]!;
      return { x: a.x, z: a.z, from: all.nodes[e.from]!, to: all.nodes[e.to]!, generation: a.generation };
    });
    // The same streets in another order (as a graph built from another area's road list is).
    const reordered = buildRoadGraph({ ...map, roads: [...map.roads].reverse() }, streets);
    system.rebase(reordered, { x: 0, z: 0 });
    system.agents.forEach((a, i) => {
      const e = reordered.edges[a.edge]!;
      expect(reordered.nodes[e.from]).toMatchObject({ x: before[i]!.from.x, z: before[i]!.from.z });
      expect(reordered.nodes[e.to]).toMatchObject({ x: before[i]!.to.x, z: before[i]!.to.z });
      expect(a.x).toBe(before[i]!.x);
      expect(a.generation).toBe(before[i]!.generation); // not moved
    });
    // And they keep driving on it.
    for (let i = 0; i < 60; i++) system.update(1 / 30, [], { x: 0, z: 0 });
    expect(system.agents.some((a) => a.speed > 1)).toBe(true);
  });

  it("moves agents whose road is gone, and ignores an empty graph", () => {
    const map = town();
    const system = new AgentSystem(buildRoadGraph(map, () => true), map.bounds, trafficSettings(4), 3);
    system.populate({ x: 0, z: 0 });
    const generations = system.agents.map((a) => a.generation);
    system.rebase(buildRoadGraph({ ...map, roads: [] }, () => true), { x: 0, z: 0 });
    expect(system.agents.map((a) => a.generation)).toEqual(generations);
    const north = buildRoadGraph({ ...map, roads: map.roads.slice(0, 1) }, () => true); // only the north street
    system.rebase(north, { x: 0, z: 0 });
    for (const a of system.agents) expect(north.edges[a.edge]).toBeDefined();
  });
});
