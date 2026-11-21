import { describe, expect, it } from "vitest";
import type { Road, WorldMap } from "@cow/game-world";
import { PURSUIT, Pursuer, findRoute, nearestNode, routeLength, type PursuitWorld } from "./Pursuit";
import { buildRoadGraph } from "./RoadGraph";

/** A 3 x 3 grid of streets 100 m apart (x and z from -100 to 100), with one one-way street. */
function grid(): WorldMap {
  const roads: Road[] = [];
  let id = 0;
  for (const c of [-100, 0, 100]) {
    roads.push({ id: id++, kind: "residential", width: 8, oneway: false, points: [{ x: -100, z: c }, { x: 0, z: c }, { x: 100, z: c }] });
    roads.push({ id: id++, kind: "residential", width: 8, oneway: false, points: [{ x: c, z: -100 }, { x: c, z: 0 }, { x: c, z: 100 }] });
  }
  return { name: "Grid", origin: { lat: 13, lng: 80 }, attribution: "", dataDate: "", bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }, chunkSize: 250, roads, areas: [], pois: [], chunks: [] };
}

const open: PursuitWorld = { clear: () => true };
const walled: PursuitWorld = { clear: () => false };
const still = (x: number, z: number) => ({ x, z, vx: 0, vz: 0 });

/** Drive for `seconds` in 1/60 s steps. */
function drive(p: Pursuer, seconds: number, step: (p: Pursuer) => void) {
  for (let t = 0; t < seconds; t += 1 / 60) step(p);
}

describe("routes through the road network", () => {
  const graph = buildRoadGraph(grid(), () => true);

  it("finds the nearest junction", () => {
    const i = nearestNode(graph, 96, -3);
    expect(graph.nodes[i]).toMatchObject({ x: 100, z: 0 });
  });

  it("takes the shortest way along the streets", () => {
    const from = nearestNode(graph, -100, -100);
    const to = nearestNode(graph, 100, 100);
    const route = findRoute(graph, from, to)!;
    expect(route[0]).toBe(from);
    expect(route.at(-1)).toBe(to);
    // Four blocks either way round; never longer.
    expect(routeLength(graph, route)).toBeCloseTo(400, 5);
  });

  it("respects one-way streets", () => {
    const map = grid();
    // The middle east-west street becomes one-way, westbound only.
    const roads = map.roads.map((r) => (r.id === 2 ? { ...r, oneway: true, points: [...r.points].reverse() } : r));
    const oneWay = buildRoadGraph({ ...map, roads }, () => true);
    const west = nearestNode(oneWay, -100, 0);
    const east = nearestNode(oneWay, 100, 0);
    expect(routeLength(oneWay, findRoute(oneWay, east, west)!)).toBeCloseTo(200, 5);
    // Eastbound must go round the block.
    expect(routeLength(oneWay, findRoute(oneWay, west, east)!)).toBeGreaterThan(200);
  });

  it("gives up rather than searching forever", () => {
    expect(findRoute(graph, 0, nearestNode(graph, 100, 100), 1)).toBeNull();
    expect(findRoute(graph, -1, 0)).toBeNull();
  });
});

describe("a car chasing a target", () => {
  const graph = buildRoadGraph(grid(), () => true);

  it("drives along the streets to a target round a corner, and stops short of it", () => {
    // Starts at the south-west corner facing north; the target is at the north-east corner.
    const car = new Pursuer(-100, 100, 0);
    let furthestOffRoad = 0;
    drive(car, 60, (p) => {
      p.update(1 / 60, graph, still(100, -100), { topSpeed: 14, stopShort: 8, lead: 0 }, walled);
      // Always on (or within a few metres of) a street of the grid.
      const off = Math.min(...[-100, 0, 100].map((c) => Math.min(Math.abs(p.x - c), Math.abs(p.z - c))));
      furthestOffRoad = Math.max(furthestOffRoad, off);
    });
    const left = Math.hypot(car.x - 100, car.z + 100);
    expect(left).toBeLessThan(12);
    expect(left).toBeGreaterThan(5);
    expect(car.speed).toBeLessThan(0.5);
    expect(furthestOffRoad).toBeLessThan(6);
  });

  it("goes straight at a close target when the line is clear", () => {
    const car = new Pursuer(0, 30, 0);
    car.update(1 / 60, graph, still(5, 0), { topSpeed: 14, stopShort: 6, lead: 0 }, open);
    expect(car.mode).toBe("direct");
    car.update(1 / 60, graph, still(5, 0), { topSpeed: 14, stopShort: 6, lead: 0 }, walled);
    // The clear line is only checked a few times a second; after that it follows the road.
    drive(car, 0.5, (p) => p.update(1 / 60, graph, still(5, 0), { topSpeed: 14, stopShort: 6, lead: 0 }, walled));
    expect(car.mode).toBe("road");
  });

  it("ramming closes in on a moving target and then keeps pace beside it", () => {
    const target = { x: 0, z: -20, vx: 0, vz: -8 };
    const car = new Pursuer(0, 20, 0);
    car.speed = 10;
    let closest = Infinity;
    drive(car, 6, (p) => {
      target.z += target.vz / 60;
      p.update(1 / 60, graph, target, { topSpeed: 20, stopShort: null, lead: 0 }, open);
      closest = Math.min(closest, Math.hypot(p.x - target.x, p.z - target.z));
    });
    expect(closest).toBeLessThan(PURSUIT.contact + 0.5);
    expect(car.speed).toBeGreaterThan(6);
    expect(car.speed).toBeLessThan(8 + PURSUIT.ramClosing + 0.1);
  });

  it("slows down behind traffic in its way", () => {
    const car = new Pursuer(0, 60, 0);
    car.speed = 12;
    drive(car, 3, (p) => p.update(1 / 60, graph, still(0, -100), { topSpeed: 14, stopShort: 5, lead: 0 }, walled, [{ x: 0, z: p.z - 5 }]));
    expect(car.speed).toBeLessThan(2);
  });

  it("finds a new route when the road graph is rebuilt", () => {
    const car = new Pursuer(-100, 100, 0);
    car.update(1 / 60, graph, still(100, -100), { topSpeed: 14, stopShort: 8, lead: 0 }, walled);
    expect(car.routeLeft.length).toBeGreaterThan(0);
    const rebuilt = buildRoadGraph(grid(), () => true);
    car.update(1 / 60, rebuilt, still(-100, -100), { topSpeed: 14, stopShort: 8, lead: 0 }, walled);
    expect(rebuilt.nodes[car.routeLeft.at(-1)!]).toMatchObject({ x: -100, z: -100 });
  });
});
