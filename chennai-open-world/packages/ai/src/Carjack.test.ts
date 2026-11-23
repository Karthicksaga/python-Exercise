/** Which traffic vehicles the player can take, and which spare vehicle stands in for them. */
import { describe, expect, it } from "vitest";
import { CARJACK, carjackable, chooseJackSlot, distanceToFootprint, pickCarjack, type JackCandidate } from "./Carjack";

const car = (over: Partial<JackCandidate> = {}): JackCandidate => ({ id: 1, kind: "car", x: 0, z: 0, heading: 0, speed: 0, halfWidth: 0.85, halfLength: 2, ...over });

describe("carjackable", () => {
  it("takes cars, autos and motorbikes that are stopped or crawling", () => {
    for (const kind of ["car", "auto", "bike"]) expect(carjackable(kind, 0)).toBe(true);
    expect(carjackable("car", CARJACK.maxSpeed - 0.1)).toBe(true);
  });
  it("never buses or ambulances, and nothing moving faster than a crawl", () => {
    expect(carjackable("bus", 0)).toBe(false);
    expect(carjackable("ambulance", 0)).toBe(false);
    expect(carjackable("car", CARJACK.maxSpeed + 0.1)).toBe(false);
    expect(carjackable("bike", 8)).toBe(false);
  });
});

describe("distanceToFootprint", () => {
  it("measures from the body's sides and ends, turned with the heading", () => {
    // Facing north (-Z): 0.85 m half width across X, 2 m half length along Z.
    expect(distanceToFootprint(2, 0, car())).toBeCloseTo(1.15);
    expect(distanceToFootprint(0, -3, car())).toBeCloseTo(1);
    expect(distanceToFootprint(0, 0, car())).toBe(0);
    // Facing east (heading -π/2): the long side now runs along X.
    const east = car({ heading: -Math.PI / 2 });
    expect(distanceToFootprint(3, 0, east)).toBeCloseTo(1);
    expect(distanceToFootprint(0, 2, east)).toBeCloseTo(1.15);
  });
});

describe("pickCarjack", () => {
  it("picks the nearest takeable vehicle within reach", () => {
    const near = car({ id: 1, x: 3 });
    const nearer = car({ id: 2, x: -2.5 });
    expect(pickCarjack({ x: 0, z: 0 }, [near, nearer])?.id).toBe(2);
  });
  it("reaches a car stopped for the player standing in front of it", () => {
    // Stopped with its `gap` (1.8 m) to the player's 0.5 m radius: front bumper 2.3 m away.
    expect(pickCarjack({ x: 0, z: -2 - 2.3 }, [car()])?.id).toBe(1);
  });
  it("skips moving vehicles, buses and anything out of reach", () => {
    expect(pickCarjack({ x: 0, z: 0 }, [car({ x: 2, speed: 6 })])).toBeNull();
    expect(pickCarjack({ x: 0, z: 0 }, [car({ x: 2, kind: "bus" })])).toBeNull();
    expect(pickCarjack({ x: 0, z: 0 }, [car({ x: 0.85 + CARJACK.reach + 0.2 })])).toBeNull();
  });
});

describe("chooseJackSlot", () => {
  it("reuses a free vehicle of the same kind and colour", () => {
    const slots = [{ kind: "car", color: 1, free: true, usedAt: 1 }];
    expect(chooseJackSlot(slots, "car", 1)).toBe(0);
  });
  it("makes a new one while the kind is under the cap", () => {
    const slots = [{ kind: "car", color: 1, free: true, usedAt: 1 }];
    expect(chooseJackSlot(slots, "car", 2)).toBe("new");
    expect(chooseJackSlot(slots, "bike", 1)).toBe("new");
  });
  it("at the cap reuses the free one of that kind handed out longest ago, never the one in use", () => {
    const slots = [
      { kind: "car", color: 1, free: false, usedAt: 1 },
      { kind: "car", color: 2, free: true, usedAt: 5 },
      { kind: "bike", color: 3, free: true, usedAt: 0 },
    ];
    expect(chooseJackSlot(slots, "car", 9, 2)).toBe(1);
    const three = [...slots, { kind: "car", color: 4, free: true, usedAt: 3 }];
    expect(chooseJackSlot(three, "car", 9, 3)).toBe(3);
  });
  it("keeps the number of spare vehicles per kind bounded over many takes", () => {
    const slots: Array<{ kind: string; color: number; free: boolean; usedAt: number }> = [];
    let driving = -1;
    for (let t = 0; t < 50; t++) {
      if (driving >= 0) slots[driving] = { ...slots[driving]!, free: true };
      const color = t % 7;
      const choice = chooseJackSlot(slots, "car", color);
      if (choice === "new") slots.push({ kind: "car", color, free: false, usedAt: t });
      else slots[choice] = { kind: "car", color, free: false, usedAt: t };
      driving = choice === "new" ? slots.length - 1 : choice;
    }
    expect(slots.length).toBe(CARJACK.perKind);
  });
});
