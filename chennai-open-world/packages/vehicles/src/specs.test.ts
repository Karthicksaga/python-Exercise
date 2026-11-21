import { describe, expect, it } from "vitest";
import { VEHICLE_TYPES, gearFor, shiftedUp } from "./specs";

describe("gearFor", () => {
  const car = VEHICLE_TYPES.car;
  it("shows N when stopped, R when reversing, and climbs through the gears with speed", () => {
    expect(gearFor(car, 0, 0)).toBe("N");
    expect(gearFor(car, 0, -1)).toBe("R");
    expect(gearFor(car, -3, 0)).toBe("R");
    expect(gearFor(car, 0, 1)).toBe("1");
    expect(gearFor(car, car.physics.maxSpeed * 0.5, 1)).toBe("3");
    expect(gearFor(car, car.physics.maxSpeed, 1)).toBe(String(car.gears));
  });
  it("never shows a gear the vehicle doesn't have", () => {
    for (const type of Object.values(VEHICLE_TYPES)) expect(Number(gearFor(type, type.physics.maxSpeed * 1.5, 1))).toBeLessThanOrEqual(type.gears);
  });
});

describe("shiftedUp", () => {
  it("is true only when a forward gear goes up", () => {
    expect(shiftedUp("1", "2")).toBe(true);
    expect(shiftedUp("4", "5")).toBe(true);
    expect(shiftedUp("3", "2")).toBe(false);
    expect(shiftedUp("2", "2")).toBe(false);
    expect(shiftedUp("N", "1")).toBe(false);
    expect(shiftedUp("R", "1")).toBe(false);
    expect(shiftedUp("1", "N")).toBe(false);
    expect(shiftedUp("", "1")).toBe(false);
  });
});

describe("drift tuning", () => {
  it("lets four-wheelers and the auto slide, never the motorbike", () => {
    expect(VEHICLE_TYPES.bike.physics.drift ?? 0).toBe(0);
    for (const kind of ["car", "auto", "ambulance", "bus"] as const) {
      const drift = VEHICLE_TYPES[kind].physics.drift ?? 0;
      expect(drift).toBeGreaterThan(0);
      expect(drift).toBeLessThanOrEqual(1);
    }
  });
});
