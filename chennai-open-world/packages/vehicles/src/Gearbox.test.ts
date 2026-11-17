import { describe, expect, it } from "vitest";
import { Gearbox, SHIFT_SPEED } from "./Gearbox";
import { VEHICLE_TYPES, shiftedUp } from "./specs";

const car = VEHICLE_TYPES.car;
const idle = { gas: false, brake: false, steer: 0 };
const gas = { gas: true, brake: false, steer: 0.3 };
const brake = { gas: false, brake: true, steer: 0 };

describe("Gearbox: touch pedals", () => {
  it("drives forwards in D and backwards in R with the same GAS", () => {
    const box = new Gearbox("D");
    expect(box.controls(gas, 0)).toEqual({ throttle: 1, steer: 0.3, brake: 0 });
    box.select("R", 0);
    expect(box.gear).toBe("R");
    expect(box.controls(gas, 0)).toEqual({ throttle: -1, steer: 0.3, brake: 0 });
  });

  it("brakes with BRAKE in D and in R, and never reverses on the brake", () => {
    const box = new Gearbox("D");
    expect(box.controls(brake, 5)).toEqual({ throttle: 0, steer: 0, brake: 1 });
    // Stopped with the brake held: still braking, not reversing.
    expect(box.controls(brake, 0)).toEqual({ throttle: 0, steer: 0, brake: 1 });
    box.select("R", 0);
    expect(box.controls(brake, -3)).toEqual({ throttle: 0, steer: 0, brake: 1 });
  });

  it("holds the vehicle in P whatever is pressed, with one hint for GAS", () => {
    const box = new Gearbox("D");
    box.select("P", 0);
    expect(box.gear).toBe("P");
    expect(box.controls(gas, 0)).toEqual({ throttle: 0, steer: 0.3, brake: 1 });
    expect(box.consumeHint()).toMatch(/select D/);
    expect(box.controls(gas, 0).brake).toBe(1);
    expect(box.consumeHint()).toBeNull(); // only once per press
    expect(box.controls(idle, 0)).toEqual({ throttle: 0, steer: 0, brake: 1 });
  });

  it("shifts at once when nearly stopped", () => {
    for (const speed of [0, SHIFT_SPEED * 0.9, -SHIFT_SPEED * 0.9]) {
      const box = new Gearbox("D");
      box.select("R", speed);
      expect(box.gear).toBe("R");
      expect(box.pending).toBeNull();
      expect(box.consumeHint()).toBeNull();
    }
  });

  it("brakes before shifting while moving, then engages the gear once stopped", () => {
    const box = new Gearbox("D");
    box.select("R", 8);
    expect(box.gear).toBe("D");
    expect(box.pending).toBe("R");
    expect(box.consumeHint()).toBe("Stopping to shift to R");
    // GAS is ignored while the change waits: full brake.
    expect(box.controls(gas, 8)).toEqual({ throttle: 0, steer: 0.3, brake: 1 });
    expect(box.label(car, 8)).toBe("N");
    expect(box.controls(gas, 0.5)).toEqual({ throttle: -1, steer: 0.3, brake: 0 });
    expect(box.gear).toBe("R");
    expect(box.pending).toBeNull();
  });

  it("treats P like any gear change: brakes to a stop first", () => {
    const box = new Gearbox("D");
    box.select("P", 6);
    expect(box.gear).toBe("D");
    expect(box.controls(idle, 6).brake).toBe(1);
    box.controls(idle, 0.2);
    expect(box.gear).toBe("P");
  });

  it("cancels a waiting change when the engaged gear is selected again", () => {
    const box = new Gearbox("D");
    box.select("R", 8);
    box.select("D", 8);
    expect(box.pending).toBeNull();
    expect(box.controls(gas, 8)).toEqual({ throttle: 1, steer: 0.3, brake: 0 });
  });

  it("says a waiting shift only once", () => {
    const box = new Gearbox("D");
    box.select("R", 8);
    box.consumeHint();
    box.select("R", 8);
    expect(box.consumeHint()).toBeNull();
  });
});

describe("Gearbox: keyboard keys", () => {
  const forward = { gas: false, brake: false, steer: 0, keys: 1 };
  const back = { gas: false, brake: false, steer: 0, keys: -1 };

  it("back brakes while rolling forwards, then shifts to R and reverses (as before)", () => {
    const box = new Gearbox("D");
    expect(box.controls(back, 6)).toEqual({ throttle: 0, steer: 0, brake: 1 });
    expect(box.gear).toBe("D");
    expect(box.controls(back, 0.5)).toEqual({ throttle: -1, steer: 0, brake: 0 });
    expect(box.gear).toBe("R");
    expect(box.consumeHint()).toBeNull();
  });

  it("forward brakes while reversing, then shifts to D and drives", () => {
    const box = new Gearbox("R");
    expect(box.controls(forward, -4)).toEqual({ throttle: 0, steer: 0, brake: 1 });
    expect(box.controls(forward, -0.3)).toEqual({ throttle: 1, steer: 0, brake: 0 });
    expect(box.gear).toBe("D");
  });

  it("leaves P when a key is pressed", () => {
    const box = new Gearbox("P");
    expect(box.controls(forward, 0).throttle).toBe(1);
    expect(box.gear).toBe("D");
    box.reset("P");
    expect(box.controls(back, 0).throttle).toBe(-1);
    expect(box.gear).toBe("R");
  });

  it("lets the touch pedals win over the keys", () => {
    const box = new Gearbox("D");
    expect(box.controls({ ...brake, keys: 1 }, 0)).toEqual({ throttle: 0, steer: 0, brake: 1 });
  });
});

describe("Gearbox.label", () => {
  it("shows P, R, N while a shift waits, D when stopped, and D with the gear when moving", () => {
    const box = new Gearbox("P");
    expect(box.label(car, 0)).toBe("P");
    box.select("D", 0);
    box.controls(idle, 0);
    expect(box.label(car, 0)).toBe("D");
    box.controls(gas, 0);
    expect(box.label(car, 0)).toBe("D1");
    box.controls(gas, car.physics.maxSpeed * 0.5);
    expect(box.label(car, car.physics.maxSpeed * 0.5)).toBe("D3");
    box.select("R", car.physics.maxSpeed * 0.5);
    expect(box.label(car, car.physics.maxSpeed * 0.5)).toBe("N");
    box.controls(idle, 0);
    expect(box.label(car, 0)).toBe("R");
  });

  it("gear-change sound counts D2 → D3 as a shift up", () => {
    expect(shiftedUp("D2", "D3")).toBe(true);
    expect(shiftedUp("D", "D1")).toBe(false);
    expect(shiftedUp("D3", "N")).toBe(false);
    expect(shiftedUp("R", "D1")).toBe(false);
  });
});
