import { describe, expect, it } from "vitest";
import { cargoAboard, GOODS, GoodsStop, goodsName, type Goods } from "./goods";
import { walkTime } from "./fares";
import { JobRunner, type Job } from "./jobs";
import { MissionRunner } from "./MissionRunner";
import type { Mission } from "./types";

const load: Goods = { action: "load", items: ["parcel"], kerb: { x: 0, z: 5 } };
const drop: Goods = { action: "unload", items: ["parcel"], kerb: { x: 100, z: 5 } };
const run = (stop: GoodsStop, seconds: number, ready: boolean, at = { x: 0, z: 0 }) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.1) stop.step(0.1, ready, at);
};

describe("GoodsStop", () => {
  it("waits until the vehicle is stopped, then walks over, hands the goods in and is done", () => {
    const stop = new GoodsStop(load, "bike");
    run(stop, 3, false);
    expect(stop.person()).toMatchObject({ stage: "waiting", holder: "hands" });
    expect(stop.started).toBe(false);
    stop.step(0.1, true, { x: 0, z: 0 });
    // 5 m from the kerb, less the door offset.
    expect(stop.person().walkSeconds).toBeCloseTo(walkTime(4), 5);
    expect(stop.person().stage).toBe("walking");
    expect(stop.note()).toBe("The parcel being loaded");
    run(stop, walkTime(4), true);
    expect(stop.person().stage).toBe("handing");
    expect(stop.person().holder).toBe("hands");
    run(stop, GOODS.hand.bike * GOODS.swap, true);
    expect(stop.person().holder).toBe("vehicle");
    expect(stop.done).toBe(false);
    run(stop, GOODS.hand.bike * (1 - GOODS.swap) + 0.1, true);
    expect(stop.done).toBe(true);
    expect(stop.person().stage).toBe("done");
    expect(stop.note()).toBeNull();
  });

  it("walks back to the kerb if the vehicle drives off before they reach it, and finishes once at it", () => {
    const stop = new GoodsStop(load, "car");
    run(stop, 1, true);
    const share = stop.person().share;
    run(stop, 0.5, false);
    expect(stop.person().share).toBeLessThan(share);
    run(stop, 5, false);
    expect(stop.person().stage).toBe("waiting");
    run(stop, walkTime(4) + 0.2, true);
    expect(stop.person().stage).toBe("handing");
    // At the vehicle: they finish even if it moves now.
    run(stop, GOODS.hand.car + 0.1, false);
    expect(stop.done).toBe(true);
  });

  it("at a drop the goods start in the vehicle and end in the recipient's hands", () => {
    const stop = new GoodsStop(drop, "car");
    expect(stop.person().holder).toBe("vehicle");
    run(stop, 30, true, { x: 100, z: 0 });
    expect(stop.done).toBe(true);
    expect(stop.person().holder).toBe("hands");
    expect(new GoodsStop(drop, "car").note()).toBeNull();
  });

  it("names the goods on the HUD", () => {
    expect(goodsName(["tiffin", "tiffin"])).toBe("the lunch boxes");
    expect(goodsName(["food-bag", "parcel"])).toBe("the goods");
    expect(goodsName(["cash-bag"])).toBe("the money");
  });
});

describe("cargoAboard", () => {
  const lunch: Array<Goods | undefined> = [
    undefined,
    { action: "load", items: ["tiffin", "tiffin"], kerb: { x: 0, z: 0 } },
    { action: "unload", items: ["tiffin"], kerb: { x: 0, z: 0 } },
    { action: "unload", items: ["tiffin"], kerb: { x: 0, z: 0 } },
  ];

  it("has nothing aboard before the pick-up, both after it, then one fewer at each drop", () => {
    expect(cargoAboard(lunch, 0, null)).toEqual([]);
    const pickup = new GoodsStop(lunch[1]!, "bike");
    expect(cargoAboard(lunch, 1, pickup)).toEqual([]);
    run(pickup, 30, true);
    expect(cargoAboard(lunch, 1, pickup)).toEqual(["tiffin", "tiffin"]);
    const first = new GoodsStop(lunch[2]!, "bike");
    expect(cargoAboard(lunch, 2, first)).toEqual(["tiffin", "tiffin"]);
    run(first, 30, true);
    expect(cargoAboard(lunch, 2, first)).toEqual(["tiffin"]);
    expect(cargoAboard(lunch, 3, null)).toEqual(["tiffin"]);
    expect(cargoAboard(lunch, 4, null)).toEqual([]);
  });

  it("parcels already in the car are aboard from the start; recovered goods only at their own stop", () => {
    const parcels: Array<Goods | undefined> = [undefined, drop, drop, drop];
    expect(cargoAboard(parcels, 0, null)).toEqual(["parcel", "parcel", "parcel"]);
    expect(cargoAboard(parcels, 3, null)).toEqual(["parcel"]);
    const money: Array<Goods | undefined> = [undefined, undefined, { action: "unload", items: ["cash-bag"], kerb: { x: 0, z: 0 }, aboard: "here" }];
    expect(cargoAboard(money, 0, null)).toEqual([]);
    expect(cargoAboard(money, 1, null)).toEqual([]);
    expect(cargoAboard(money, 2, null)).toEqual(["cash-bag"]);
  });

  it("mixed goods: what is still to be loaded is not aboard", () => {
    const biryani: Array<Goods | undefined> = [
      { action: "load", items: ["food-bag", "parcel"], kerb: { x: 0, z: 0 } },
      { action: "unload", items: ["food-bag"], kerb: { x: 0, z: 0 } },
      { action: "unload", items: ["parcel"], kerb: { x: 0, z: 0 } },
    ];
    expect(cargoAboard(biryani, 0, null)).toEqual([]);
    expect(cargoAboard(biryani, 1, null)).toEqual(["food-bag", "parcel"]);
    expect(cargoAboard(biryani, 2, null)).toEqual(["parcel"]);
  });
});

describe("runners with goods", () => {
  const job: Job = {
    id: "courier",
    kind: "courier",
    title: "Courier",
    brief: "",
    vehicle: "bike",
    stops: [
      { label: "Collect", x: 50, z: 0, radius: 6, dwell: 2, goods: { action: "load", items: ["parcel"], kerb: { x: 50, z: 4 } } },
      { label: "Deliver", x: 200, z: 0, radius: 6, dwell: 1, goods: { action: "unload", items: ["parcel"], kerb: { x: 200, z: 4 } } },
    ],
    timeLimit: 60,
    payout: 400,
    fine: 50,
  };
  const bike = (x: number, speed = 0) => ({ x, z: 0, mode: "bike" as const, speed });
  const steps = (runner: JobRunner, seconds: number, player: ReturnType<typeof bike>) => {
    const events = [];
    for (let t = 0; t < seconds - 1e-9; t += 0.1) events.push(...runner.update(0.1, player));
    return events;
  };

  it("a job stop waits for the handover, not the old dwell, with the clock paused, and pays as before", () => {
    const runner = new JobRunner();
    runner.accept(job);
    runner.update(0.1, bike(0));
    steps(runner, 5, bike(30, 10));
    const left = runner.secondsLeft!;
    steps(runner, 2.1, bike(50));
    expect(runner.stopNumber).toBe(0);
    expect(runner.goods?.note()).toBe("The parcel being loaded");
    expect(runner.secondsLeft).toBeCloseTo(left - 0.1, 5);
    const events = steps(runner, walkTime(3) + GOODS.hand.bike, bike(50));
    expect(events.some((e) => e.type === "stop")).toBe(true);
    expect(runner.goods?.goods.action).toBe("unload");
    steps(runner, 3, bike(200));
    const completed = steps(runner, 10, bike(200)).find((e) => e.type === "completed");
    expect(completed?.type === "completed" && completed.result.pay).toBeGreaterThan(400);
    expect(runner.goods).toBeNull();
  });

  it("a stage objective with goods is met once they have changed hands, and its timer waits", () => {
    const missions: Mission[] = [
      {
        id: "parcel",
        stage: 1,
        title: "Parcel",
        brief: "",
        reward: 100,
        objectives: [{ type: "reach", label: "Deliver", x: 10, z: 0, radius: 6, mode: "car", stop: true, timeLimit: 20, goods: { action: "unload", items: ["parcel"], kerb: { x: 10, z: 4 } } }],
      },
    ];
    const runner = new MissionRunner(missions);
    const car = { x: 10, z: 0, mode: "car" as const, speed: 0 };
    runner.update(0.1, car);
    const left = runner.secondsLeft!;
    expect(runner.goods?.started).toBe(true);
    for (let i = 0; i < 20; i++) runner.update(0.1, car);
    expect(runner.secondsLeft).toBe(left);
    let done = false;
    for (let i = 0; i < 100 && !done; i++) done = runner.update(0.1, car).some((e) => e.type === "completed");
    expect(done).toBe(true);
    expect(runner.balance).toBe(100);
  });
});
