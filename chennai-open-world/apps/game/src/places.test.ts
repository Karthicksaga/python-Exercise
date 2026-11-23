/**
 * Places and stories built from the real world files: every entrance is on a pavement beside a
 * road inside the home square, clear of parked vehicles, and every story step points at a place.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeRoads, insideBounds, nearestRoadPoint, worldFromIndex, type WorldIndexFile } from "@cow/game-world";
import { buildContent, homeBounds, homeMap } from "./content";
import { buildPlaces } from "./places";

const file = (name: string) => new URL(`../public/world/${name}`, import.meta.url);
const index = JSON.parse(readFileSync(file("index.json"), "utf8")) as WorldIndexFile & { readonly roadNames: readonly string[] };
const city = worldFromIndex(index, decodeRoads(readFileSync(file(index.roads)), index.roadNames));
const content = buildContent(city);
const { places, stories } = buildPlaces(city, content);
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe("places on the map", () => {
  it("has the five places, each once", () => {
    expect(places.map((p) => p.kind).sort()).toEqual(["cinema", "gym", "home", "hospital", "mall"]);
    expect(new Set(places.map((p) => p.id)).size).toBe(5);
  });

  it("puts every entrance on the pavement of a road inside the home square", () => {
    const bounds = homeBounds(city);
    const map = homeMap(city);
    for (const place of places) {
      expect(insideBounds(place, bounds, 0)).toBe(true);
      const road = nearestRoadPoint(map, place)!;
      // Beside the carriageway, not on it and not far from it.
      expect(road.distance).toBeGreaterThan(road.road.width / 2 - 0.5);
      expect(road.distance).toBeLessThan(road.road.width / 2 + 4);
    }
  });

  it("keeps entrances clear of parked vehicles and of each other", () => {
    for (const place of places) {
      for (const spot of content.parking) expect(distance(place, spot)).toBeGreaterThanOrEqual(8);
      for (const other of places) if (other !== place) expect(distance(place, other)).toBeGreaterThanOrEqual(30);
    }
  });

  it("puts the hospital and the cinema at mapped amenities, and home near the start", () => {
    const near = (kinds: string[], place: { x: number; z: number }) => Math.min(...city.pois.filter((p) => kinds.includes(p.kind)).map((p) => distance(p, place)));
    expect(near(["hospital"], places.find((p) => p.kind === "hospital")!)).toBeLessThan(60);
    expect(near(["cinema", "theatre"], places.find((p) => p.kind === "cinema")!)).toBeLessThan(60);
    expect(distance(places.find((p) => p.kind === "home")!, content.spawn)).toBeLessThan(60);
  });

  it("has three stories whose places and activity steps exist", () => {
    expect(stories.map((s) => s.id)).toEqual(["paati-checkup", "gym-bet", "first-show"]);
    const ids = new Set(places.map((p) => p.id));
    for (const story of stories) {
      expect(ids.has(story.offeredAt)).toBe(true);
      expect(story.reward).toBeGreaterThan(0);
      for (const step of story.steps) {
        if (step.type === "activity") expect(ids.has(step.place)).toBe(true);
        if (step.type === "reach") expect(insideBounds(step, homeBounds(city), 0)).toBe(true);
      }
    }
  });

  it("is the same every time it is built", () => {
    expect(JSON.stringify(buildPlaces(city, buildContent(city)))).toBe(JSON.stringify({ places, stories }));
  });
});
