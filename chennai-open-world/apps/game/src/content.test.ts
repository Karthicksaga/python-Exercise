/**
 * The game's content built from the real world files (apps/game/public/world): the original
 * jobs are untouched and the city jobs land on real roads in the right places.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeRoads, insideBounds, nearestRoadPoint, worldFromIndex, type Point, type WorldIndexFile } from "@cow/game-world";
import { insideZone } from "@cow/missions";
import { buildContent } from "./content";
import { ANNA_SALAI } from "./cityJobs";

const file = (name: string) => new URL(`../public/world/${name}`, import.meta.url);
const index = JSON.parse(readFileSync(file("index.json"), "utf8")) as WorldIndexFile & { readonly roadNames: readonly string[] };
const city = worldFromIndex(index, decodeRoads(readFileSync(file(index.roads)), index.roadNames));
const content = buildContent(city);
const job = (id: string) => {
  const found = content.jobs.find((j) => j.id === id);
  if (!found) throw new Error(`No job ${id}`);
  return found;
};
const landmark = (id: string): Point => {
  const found = city.landmarks?.find((l) => l.id === id);
  if (!found) throw new Error(`No landmark ${id}`);
  return found;
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

const OLD_JOBS = ["ambulance-run", "courier", "cab-ride", "bus-route", "hospital-transfer", "food-delivery", "medicine-run", "share-auto", "tower-park-visit", "evening-bus"];
const NEW_JOBS = ["marina-evening", "egmore-transfer", "mount-road-bus"];

describe("content on the city map", () => {
  it("keeps the ten original jobs and stages, and adds the city jobs", () => {
    expect(content.jobs.map((j) => j.id)).toEqual([...OLD_JOBS, ...NEW_JOBS]);
    expect(content.missions).toHaveLength(10);
    expect(new Set(content.jobs.map((j) => j.id)).size).toBe(content.jobs.length);
  });

  it("is the same every time it is built", () => {
    expect(JSON.stringify(buildContent(city))).toBe(JSON.stringify(content));
  });

  it("gives parking spots unique ids and parks every job's vehicle somewhere", () => {
    const ids = content.parking.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["car-tnagar", "ambulance-egmore", "bus-mount-road"]) expect(ids).toContain(id);
    const kinds = new Set(content.parking.map((p) => p.kind));
    for (const j of content.jobs) expect(kinds.has(j.vehicle), `vehicle for ${j.id}`).toBe(true);
  });

  it("puts every stop on a drivable road inside the city", () => {
    for (const j of content.jobs) {
      for (const stop of j.stops) {
        expect(insideBounds(stop, city.bounds), `${j.id}: ${stop.label}`).toBe(true);
        const hit = nearestRoadPoint(city, stop);
        expect(hit?.distance ?? Infinity, `${j.id}: ${stop.label}`).toBeLessThan(1);
      }
      expect(j.timeLimit).toBeGreaterThan(0);
      expect(j.payout).toBeGreaterThan(0);
    }
  });

  it("parks the city jobs' vehicles near their starts", () => {
    const near = (parkingId: string, jobId: string, metres: number) => {
      const spot = content.parking.find((p) => p.id === parkingId)!;
      expect(distance(spot, job(jobId).stops[0]!)).toBeLessThan(metres);
      expect(distance(spot, job(jobId).stops[0]!)).toBeLessThan(job(jobId).startRadius ?? Infinity);
    };
    near("car-tnagar", "marina-evening", 80);
    near("ambulance-egmore", "egmore-transfer", 80);
    near("bus-mount-road", "mount-road-bus", 200);
  });

  it("runs the Marina drive from T. Nagar to the Marina beach road in the evening, avoiding Anna Salai", () => {
    const marina = job("marina-evening");
    expect(marina.vehicle).toBe("car");
    expect(marina.hours).toEqual({ from: 16, to: 20.5 });
    const [pickup, drop] = marina.stops;
    expect(marina.stops).toHaveLength(2);
    expect(pickup!.dwell).toBeGreaterThan(0);
    expect(drop!.dwell).toBeGreaterThan(0);
    expect(distance(pickup!, landmark("t-nagar"))).toBeLessThan(600);
    expect(distance(drop!, landmark("marina-beach"))).toBeLessThan(400);
    expect(nearestRoadPoint(city, drop!)?.road.name).toBe("Kamarajar Salai");
    expect(pickup!.label).toContain("Sir Thyagaraya Road");
    // About 6 km of city driving at a fair pace.
    expect(marina.timeLimit).toBeGreaterThan(480);
    expect(marina.timeLimit).toBeLessThan(1200);

    const zone = marina.avoid!;
    expect(zone.name).toBe("Anna Salai");
    // Small: one sample every ~25 m of the stretch, both carriageways.
    expect(zone.points.length).toBeGreaterThan(100);
    expect(zone.points.length).toBeLessThan(700);
    // Every sample is on Anna Salai, and the stops are well clear of it.
    for (const p of zone.points) expect(nearestRoadPoint({ roads: city.roads.filter((r) => r.name === ANNA_SALAI) }, p)!.distance).toBeLessThan(0.5);
    expect(insideZone(zone, pickup!.x, pickup!.z)).toBe(false);
    expect(insideZone(zone, drop!.x, drop!.z)).toBe(false);
    // Covers Anna Salai at Teynampet, between the two ends, with no gaps along it.
    const teynampet = city.roads.filter((r) => r.name === ANNA_SALAI).flatMap((r) => r.points).filter((p) => distance(p, { x: 4000, z: 5000 }) < 400);
    expect(teynampet.length).toBeGreaterThan(0);
    for (const p of teynampet) expect(insideZone(zone, p.x, p.z)).toBe(true);
  });

  it("moves the hospital transfer between two real hospitals in Egmore and Royapettah, without naming them", () => {
    const transfer = job("egmore-transfer");
    expect(transfer.vehicle).toBe("ambulance");
    const district = (name: string) => city.districts!.find((d) => d.name === name)!;
    expect(distance(transfer.stops[0]!, district("Egmore"))).toBeLessThan(1300);
    expect(distance(transfer.stops[1]!, district("Royapettah"))).toBeLessThan(1300);
    const names = city.pois.filter((p) => p.kind === "hospital" && p.name).map((p) => p.name!);
    for (const text of [transfer.title, transfer.brief, ...transfer.stops.map((s) => s.label)]) {
      for (const name of names) expect(text.includes(name), `${text} names ${name}`).toBe(false);
    }
  });

  it("runs the bus along four mapped Anna Salai stops in order, on time", () => {
    const bus = job("mount-road-bus");
    expect(bus.vehicle).toBe("bus");
    expect(bus.stops).toHaveLength(4);
    const stopNames = new Set((city.busStops ?? []).map((s) => s.name));
    let last = 0;
    for (const [i, stop] of bus.stops.entries()) {
      expect(stopNames.has(stop.label.split(": ")[1])).toBe(true);
      expect(nearestRoadPoint(city, stop)?.road.name).toBe(ANNA_SALAI);
      expect(stop.due!).toBeGreaterThan(last);
      last = stop.due!;
      if (i > 0) expect(distance(stop, bus.stops[i - 1]!)).toBeGreaterThan(300);
    }
    const span = distance(bus.stops[0]!, bus.stops[3]!);
    expect(span).toBeGreaterThan(1500);
    expect(span).toBeLessThan(4000);
    expect(bus.timeLimit).toBeGreaterThan(last);
  });
});
