import { describe, expect, it } from "vitest";
import { DistrictIndex, VisitedDistricts } from "./districts";
import type { District } from "./types";

const districts: District[] = [
  { name: "Anna Nagar", kind: "suburb", x: 0, z: 0 },
  { name: "T. Nagar", kind: "suburb", x: 3000, z: 5000 },
  { name: "Mylapore", kind: "suburb", x: 6500, z: 5700 },
];

describe("DistrictIndex", () => {
  const index = new DistrictIndex(districts);
  it("picks the nearest district point within reach", () => {
    expect(index.at({ x: 200, z: -300 })?.name).toBe("Anna Nagar");
    expect(index.at({ x: 3400, z: 5200 })?.name).toBe("T. Nagar");
    expect(index.at({ x: 5600, z: 5600 })?.name).toBe("Mylapore");
  });
  it("finds nothing far from every district", () => {
    expect(index.at({ x: 20_000, z: 0 })).toBeNull();
  });
  it("looks across grid cells", () => {
    expect(new DistrictIndex([{ name: "Edge", kind: "suburb", x: 999, z: 999 }]).at({ x: 1001, z: 1001 })?.name).toBe("Edge");
  });
});

describe("VisitedDistricts", () => {
  it("records each district once, in order, and summarises", () => {
    const v = new VisitedDistricts();
    expect(v.visit("Anna Nagar")).toBe(true);
    expect(v.visit("Anna Nagar")).toBe(false);
    v.visit("T. Nagar");
    expect(v.summary()).toBe("Anna Nagar and T. Nagar");
    for (const name of ["A", "B", "C"]) v.visit(name);
    expect(v.count).toBe(5);
    expect(v.summary()).toBe("Anna Nagar, T. Nagar, A, B and 1 more");
  });
  it("ignores damaged saves", () => {
    expect(new VisitedDistricts("nonsense").count).toBe(0);
    expect(new VisitedDistricts(["X", 3, "X", "Y"]).list()).toEqual(["X", "Y"]);
  });
});
