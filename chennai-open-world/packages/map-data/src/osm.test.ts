import { describe, expect, it } from "vitest";
import { parseOsm, pointKind, type OsmExtract } from "./osm";

const origin = { lat: 13.085, lng: 80.2101 };
const extract: OsmExtract = {
  osm3s: { timestamp_osm_base: "2026-11-15T14:46:48Z" },
  elements: [
    { type: "node", id: 1, lat: 13.085, lon: 80.2101 },
    { type: "node", id: 2, lat: 13.0851, lon: 80.2101 },
    { type: "node", id: 3, lat: 13.0851, lon: 80.2102 },
    { type: "node", id: 4, lat: 13.085, lon: 80.2102, tags: { natural: "tree" } },
    { type: "way", id: 10, nodes: [1, 2, 3, 4, 1], tags: { building: "yes" } },
    { type: "way", id: 11, nodes: [1, 2, 3], tags: { highway: "residential", name: "1st Street" } },
    { type: "way", id: 12, nodes: [1, 2, 3, 1], tags: { leisure: "park" } },
    { type: "way", id: 13, nodes: [1, 2, 99], tags: { landuse: "residential" } },
  ],
};

describe("parseOsm", () => {
  const features = parseOsm(extract, origin);

  it("keeps the data timestamp for attribution", () => {
    expect(features.timestamp).toBe("2026-11-15T14:46:48Z");
  });

  it("turns closed building ways into outlines without the repeated point", () => {
    expect(features.buildings).toHaveLength(1);
    expect(features.buildings[0]!.outline).toHaveLength(4);
    expect(features.buildings[0]!.outline[0]).toEqual({ x: 0, z: -0 });
    // 0.0001° of latitude is about 11.1 m north (negative Z).
    expect(features.buildings[0]!.outline[1]!.z).toBeCloseTo(-11.12, 1);
  });

  it("keeps highways as lines with their tags", () => {
    expect(features.highways).toHaveLength(1);
    expect(features.highways[0]!.tags.name).toBe("1st Street");
    expect(features.highways[0]!.points).toHaveLength(3);
  });

  it("separates areas and tagged points, and skips open non-highway ways", () => {
    expect(features.areas.map((a) => a.id)).toEqual([12]);
    expect(features.points.map((p) => p.tags.natural)).toEqual(["tree"]);
  });

  it("sorts tagged nodes into the kinds the world builder uses", () => {
    expect(pointKind({ natural: "tree" })).toBe("tree");
    expect(pointKind({ highway: "bus_stop", name: "Stop" })).toBe("bus_stop");
    expect(pointKind({ public_transport: "platform", bus: "yes" })).toBe("bus_stop");
    expect(pointKind({ highway: "traffic_signals" })).toBe("traffic_signals");
    expect(pointKind({ amenity: "place_of_worship", religion: "hindu" })).toBe("place_of_worship");
    expect(pointKind({ man_made: "tower" })).toBe("landmark");
    expect(pointKind({ historic: "memorial" })).toBe("landmark");
    expect(pointKind({ place: "suburb", name: "Somewhere" })).toBe("place");
    expect(pointKind({ shop: "bakery" })).toBe("poi");
    expect(pointKind({ highway: "crossing" })).toBeNull();
  });

  it("keeps closed tower and place-of-worship outlines that are not buildings as areas", () => {
    const more = parseOsm({ elements: [...extract.elements, { type: "way", id: 14, nodes: [1, 2, 3, 1], tags: { man_made: "tower" } }] }, origin);
    expect(more.areas.map((a) => a.id)).toEqual([12, 14]);
  });

  it("rejects input that is not an Overpass extract", () => {
    expect(() => parseOsm({} as OsmExtract, origin)).toThrow(/Overpass/);
  });
});
