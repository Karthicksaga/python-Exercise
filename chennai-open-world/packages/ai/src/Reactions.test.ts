/** Pedestrians held still when knocked down, limping, and reacting to a hit nearby. */
import { describe, expect, it } from "vitest";
import type { WorldMap } from "@cow/game-world";
import { AgentSystem, type Agent } from "./Agents";
import { pedestrianSettings, trafficSettings } from "./presets";
import { buildRoadGraph } from "./RoadGraph";

/** One long straight street, east-west through the origin. */
const street: WorldMap = {
  name: "Test",
  origin: { lat: 13, lng: 80 },
  attribution: "",
  dataDate: "",
  bounds: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 },
  chunkSize: 250,
  roads: [{ id: 1, kind: "residential", width: 7, oneway: false, points: [{ x: -300, z: 0 }, { x: 0, z: 0 }, { x: 300, z: 0 }] }],
  areas: [],
  pois: [],
  chunks: [],
};
const focus = { x: 0, z: 0 };
const walkers = (count: number) => {
  const system = new AgentSystem(buildRoadGraph(street, () => true, false), street.bounds, pedestrianSettings(count), 9);
  system.populate(focus);
  return system;
};
const run = (system: AgentSystem, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) system.update(1 / 60, [], focus);
};
const first = (system: AgentSystem, i = 0): Agent => system.agents[i]!;

describe("pedestrians the game holds", () => {
  it("stay exactly where they are put, even far from the player, until let go", () => {
    const system = walkers(2);
    run(system, 1);
    const agent = first(system);
    system.hold(agent);
    system.moveAgent(agent, 12, 6, 1);
    const generation = agent.generation;
    // Far beyond the recycling distance, and for longer than the stuck timer.
    for (let i = 0; i < 60 * 12; i++) system.update(1 / 60, [], { x: 1000, z: 0 });
    expect(agent).toMatchObject({ x: 12, z: 6, heading: 1, speed: 0, generation, active: true });
    // Quiet streets don't put them away either.
    system.setActiveCount(0, true);
    system.update(1 / 60, [], focus);
    expect(agent.active).toBe(true);
    system.setActiveCount(2, true);
    system.letGo(agent);
    run(system, 3);
    expect(agent.speed).toBeGreaterThan(0.8);
  });

  it("can be let go to a new place out of sight (respawn)", () => {
    const system = walkers(2);
    const agent = first(system);
    system.hold(agent);
    system.moveAgent(agent, 3, 3);
    const generation = agent.generation;
    system.letGo(agent, focus);
    expect(agent.generation).toBeGreaterThan(generation);
    expect(Math.hypot(agent.x - focus.x, agent.z - focus.z)).toBeGreaterThanOrEqual(pedestrianSettings(1).spawnMin);
    expect(system.isHeld(agent)).toBe(false);
  });

  it("limp below the given speed for the given time, then walk normally", () => {
    const system = walkers(1);
    const agent = first(system);
    system.slow(agent, 0.6, 4);
    let fastest = 0;
    for (let i = 0; i < 60 * 3.9; i++) {
      system.update(1 / 60, [], focus);
      fastest = Math.max(fastest, agent.speed);
    }
    expect(fastest).toBeLessThanOrEqual(0.6 + 1e-9);
    expect(system.speedLimit(agent)).toBe(0.6);
    run(system, 2);
    expect(system.speedLimit(agent)).toBe(Infinity);
    expect(agent.speed).toBeGreaterThan(1);
  });

  it("traffic stops short of a person lying on the road (given as an obstacle)", () => {
    const traffic = new AgentSystem(buildRoadGraph(street, () => true), street.bounds, trafficSettings(1), 3);
    traffic.populate(focus);
    const car = first(traffic);
    for (let i = 0; i < 60 * 3; i++) traffic.update(1 / 60, [], focus);
    const lying = { x: car.x - Math.sin(car.heading) * 15, z: car.z - Math.cos(car.heading) * 15, radius: 1 };
    for (let i = 0; i < 60 * 5; i++) traffic.update(1 / 60, [lying], focus);
    expect(car.speed).toBeLessThan(0.1);
    expect(Math.hypot(car.x - lying.x, car.z - lying.z)).toBeGreaterThan(2);
  });
});

describe("pedestrians near a hit", () => {
  it("walking towards it stop and step back; walking away run off; far away carry on", () => {
    const system = walkers(3);
    run(system, 2);
    const towards = first(system, 0);
    const away = first(system, 1);
    const far = first(system, 2);
    // A spot 6 m ahead of the first; the second is put 6 m beyond it, walking the same way; the third 40 m off.
    const spot = { x: towards.x - Math.sin(towards.heading) * 6, z: towards.z - Math.cos(towards.heading) * 6 };
    system.moveAgent(away, spot.x - Math.sin(towards.heading) * 6, spot.z - Math.cos(towards.heading) * 6, towards.heading);
    system.moveAgent(far, spot.x + 40, spot.z);
    const start = Math.hypot(towards.x - spot.x, towards.z - spot.z);
    system.scare(spot.x, spot.z, 16, 6);
    expect(system.isScared(towards)).toBe(true);
    expect(system.isScared(away)).toBe(true);
    expect(system.isScared(far)).toBe(false);
    let awayTop = 0;
    for (let i = 0; i < 60 * 3; i++) {
      system.update(1 / 60, [], focus);
      awayTop = Math.max(awayTop, away.speed);
    }
    expect(towards.speed).toBeLessThan(0.05);
    expect(Math.hypot(towards.x - spot.x, towards.z - spot.z)).toBeGreaterThan(start + 1);
    expect(awayTop).toBeGreaterThan(3.2); // running
    expect(far.speed).toBeLessThan(2);
    // Once the fright is over everyone walks on.
    run(system, 6);
    expect(system.isScared(towards)).toBe(false);
    expect(towards.speed).toBeGreaterThan(0.8);
    expect(away.speed).toBeLessThan(2);
  });

  it("held people don't react", () => {
    const system = walkers(1);
    const agent = first(system);
    system.hold(agent);
    system.scare(agent.x, agent.z, 16, 6);
    expect(system.isScared(agent)).toBe(false);
  });
});

describe("placing someone on the nearest road (a driver pulled out of a taken car)", () => {
  it("puts them there, on that road going the way asked, and they run off when frightened", () => {
    const system = walkers(3);
    const agent = first(system);
    system.hold(agent);
    // Facing east (heading -π/2), a step off the street's centre line.
    system.placeAt(agent, 50, 2, -Math.PI / 2);
    expect(system.isHeld(agent)).toBe(false);
    expect([agent.x, agent.z]).toEqual([50, 2]);
    const graph = buildRoadGraph(street, () => true, false);
    expect(graph.edges[agent.edge]!.dx).toBeGreaterThan(0.9);
    // Frightened from behind (the player at the door): runs off east, away from them, crossing
    // to their side of the street (the left, as they go) on the way.
    system.scare(48, 2, 4, 3);
    run(system, 2);
    expect(agent.x).toBeGreaterThan(51.5);
    expect(Math.hypot(agent.x - 48, agent.z - 2)).toBeGreaterThan(5);
    expect(agent.speed).toBeGreaterThan(3);
  });
});
