import { describe, expect, it } from "vitest";
import { busCrowd, doorTime, FARES, FareStop, walkTime } from "./fares";
import { JobRunner, type Job } from "./jobs";
import { MissionRunner } from "./MissionRunner";
import type { Mission, PlayerStatus } from "./types";

const kerb = { x: 0, z: 6 };
/** The vehicle stopped 4 m from the kerb point: a 3 m walk to its door. */
const here = { x: 0, z: 2 };
const run = (stop: FareStop, seconds: number, ready = true, at = here, dt = 0.05) => {
  let done = false;
  for (let t = 0; t < seconds - 1e-9; t += dt) done = stop.step(dt, ready, at);
  return done;
};

describe("FareStop", () => {
  it("waits for the vehicle to stop, then walks the passenger over and in", () => {
    const stop = new FareStop({ board: 1, kerb }, "auto");
    expect(stop.people()).toEqual([{ action: "board", index: 0, stage: "waiting", share: 0, walkSeconds: 0 }]);
    // Driving past (not ready): nobody moves.
    expect(run(stop, 2, false)).toBe(false);
    expect(stop.started).toBe(false);
    const total = walkTime(3) + doorTime("auto");
    expect(run(stop, 1)).toBe(false);
    expect(stop.people()[0]).toMatchObject({ stage: "walking" });
    expect(stop.change).toBe(0);
    expect(run(stop, total - 1 - 0.2)).toBe(false);
    expect(stop.people()[0]!.stage).toBe("entering");
    expect(run(stop, 0.3)).toBe(true);
    expect(stop.people()[0]!.stage).toBe("inside");
    expect(stop.change).toBe(1);
  });

  it("walks a boarder back if the vehicle drives off before they reach it, and starts again when it stops", () => {
    const stop = new FareStop({ board: 1, kerb }, "car");
    run(stop, 1.5);
    const share = stop.people()[0]!.share;
    expect(share).toBeGreaterThan(0);
    run(stop, 0.5, false);
    expect(stop.people()[0]!.share).toBeLessThan(share);
    run(stop, 3, false);
    expect(stop.people()[0]!.stage).toBe("waiting");
    expect(stop.started).toBe(false);
    // Stopped again, further off: the walk is measured afresh.
    run(stop, 0.1, true, { x: 0, z: -2 });
    expect(stop.people()[0]!.walkSeconds).toBeCloseTo(walkTime(7), 5);
  });

  it("lets someone already at the door finish getting in, even if the vehicle moves", () => {
    const stop = new FareStop({ board: 1, kerb }, "car");
    run(stop, walkTime(3) + 0.1);
    expect(stop.people()[0]!.stage).toBe("entering");
    expect(run(stop, doorTime("car"), false)).toBe(true);
  });

  it("lets people off first, one after the other, and they walk off onto the pavement before it is done", () => {
    const stop = new FareStop({ alight: 2, board: 1, kerb }, "bus");
    run(stop, 0.5);
    const [first, second, boarder] = stop.people();
    expect(first).toMatchObject({ action: "alight", stage: "exiting" });
    expect(second).toMatchObject({ action: "alight", stage: "riding" });
    expect(boarder).toMatchObject({ action: "board", stage: "waiting" });
    expect(stop.change).toBe(-1);
    run(stop, FARES.gap);
    expect(stop.people()[1]!.stage).toBe("exiting");
    expect(stop.people()[2]!.stage).toBe("waiting");
    // Once both are out of the door the boarder sets off.
    run(stop, doorTime("bus"));
    expect(stop.people()[2]!.stage).toBe("walking");
    // Those who got off keep walking away even when the bus pulls off.
    const leaving = stop.people()[0]!;
    expect(leaving.stage).toBe("leaving");
    expect(leaving.walkSeconds).toBeCloseTo(walkTime(3 + FARES.walkOff), 5);
    expect(run(stop, 30)).toBe(true);
    expect(stop.people().map((p) => p.stage)).toEqual(["gone", "gone", "inside"]);
    expect(stop.change).toBe(-1);
  });

  it("says what is happening for the HUD, and a patient takes longer", () => {
    const stop = new FareStop({ board: 1, kerb, patient: true }, "ambulance");
    expect(stop.note()).toBeNull();
    run(stop, 0.2);
    expect(stop.note()).toBe("The patient is being loaded");
    expect(doorTime("ambulance", true)).toBeGreaterThan(doorTime("ambulance"));
    const bus = new FareStop({ alight: 1, board: 2, kerb }, "bus");
    run(bus, 0.2);
    expect(bus.note()).toBe("People getting off and on");
  });

  it("caps very long walks", () => {
    expect(walkTime(100)).toBeCloseTo(FARES.maxWalk / FARES.walkSpeed, 5);
    expect(walkTime(0)).toBeGreaterThan(0);
  });
});

describe("busCrowd", () => {
  it("starts empty, lets some off at every later stop, never overfills, and empties at the end", () => {
    for (const stops of [2, 3, 4, 6]) {
      const crowd = busCrowd(stops, 6);
      let aboard = 0;
      crowd.forEach(({ board, alight }, i) => {
        expect(alight).toBeLessThanOrEqual(aboard);
        if (i > 0 && i < stops - 1) expect(alight).toBeGreaterThan(0);
        aboard += board - alight;
        expect(aboard).toBeLessThanOrEqual(6);
        expect(board).toBeGreaterThanOrEqual(0);
      });
      expect(crowd[0]).toEqual({ board: 3, alight: 0 });
      expect(crowd[stops - 1]!.board).toBe(0);
      expect(aboard).toBe(0);
    }
  });
});

const at = (x: number, mode: PlayerStatus["mode"] = "auto", speed = 0, extra: Partial<PlayerStatus> = {}): PlayerStatus => ({ x, z: 0, mode, speed, ...extra });
/** Run for `seconds`, stopping early once the objective moves on (so the next one's clock is untouched). */
const step = (runner: MissionRunner, seconds: number, status: PlayerStatus) => {
  const events = [];
  const label = runner.objective?.label;
  for (let t = 0; t < seconds - 1e-9 && runner.objective?.label === label; t += 0.1) events.push(...runner.update(0.1, status));
  return events;
};

describe("MissionRunner with fares", () => {
  const missions: Mission[] = [
    {
      id: "fare",
      stage: 1,
      title: "Fare",
      brief: "",
      reward: 300,
      objectives: [
        { type: "reach", label: "Pick up", x: 50, z: 0, radius: 5, mode: "auto", stop: true, fare: { board: 1, kerb: { x: 50, z: 5 } } },
        { type: "reach", label: "Drop off", x: 100, z: 0, radius: 5, mode: "auto", stop: true, timeLimit: 10, fare: { alight: 1, kerb: { x: 100, z: 5 } } },
      ],
    },
  ];

  it("completes the pick-up only once the passenger is in, then starts the drop's clock", () => {
    const runner = new MissionRunner(missions);
    // Stopped at the pick-up: not instant any more.
    expect(runner.update(0.1, at(50))).toEqual([]);
    expect(runner.objective?.label).toBe("Pick up");
    expect(runner.fare?.started).toBe(true);
    const boarding = walkTime(5 - FARES.doorOffset) + doorTime("auto");
    expect(step(runner, boarding - 0.4, at(50))).toEqual([]);
    expect(runner.aboard).toBe(0);
    const events = step(runner, 0.6, at(50));
    expect(events.map((e) => e.type)).toEqual(["objective"]);
    expect(runner.objective?.label).toBe("Drop off");
    expect(runner.aboard).toBe(1);
    expect(runner.secondsLeft).toBe(10);
  });

  it("stops the drop's clock while the passenger gets out, and pays once they have walked off", () => {
    const runner = new MissionRunner(missions);
    step(runner, 10, at(50));
    expect(runner.objective?.label).toBe("Drop off");
    step(runner, 6, at(70, "auto", 8));
    expect(runner.secondsLeft).toBeCloseTo(4, 5);
    // Arrives with 4 s to spare; getting out and walking off takes longer than that, and that is fine.
    const leaving = doorTime("auto") + walkTime(5 - FARES.doorOffset + FARES.walkOff);
    expect(leaving).toBeGreaterThan(4);
    runner.update(0.1, at(100));
    expect(runner.aboard).toBe(0);
    const events = step(runner, leaving + 0.2, at(100));
    expect(events.map((e) => e.type)).toEqual(["completed", "allDone"]);
    expect(runner.balance).toBe(300);
  });

  it("puts the passenger out when the stage starts again", () => {
    const runner = new MissionRunner(missions);
    step(runner, 10, at(50));
    expect(runner.aboard).toBe(1);
    runner.restartStage();
    expect(runner.aboard).toBe(0);
    expect(runner.fare?.people()[0]?.stage).toBe("waiting");
  });
});

describe("MissionRunner: evade and the train", () => {
  const missions: Mission[] = [
    {
      id: "run",
      stage: 1,
      title: "Run",
      brief: "",
      reward: 100,
      objectives: [
        { type: "evade", label: "Lose the police", stars: 2 },
        { type: "reach", label: "Ride to Chetpet", x: 0, z: 0, radius: 60, byTrain: true },
      ],
    },
  ];

  it("is not met before the police are after the player, and is met once they are lost", () => {
    const runner = new MissionRunner(missions);
    // The game raises the level just after the objective starts: no wanted level yet is not escaping.
    expect(runner.update(0.1, at(0, "foot", 0, { wanted: 0 }))).toEqual([]);
    expect(runner.update(0.1, at(0, "foot", 0, { wanted: 2 }))).toEqual([]);
    expect(runner.update(0.1, at(0, "foot", 0, { wanted: 1 }))).toEqual([]);
    expect(runner.update(0.1, at(0, "foot", 0, { wanted: 0 }))[0]).toMatchObject({ type: "objective", label: "Ride to Chetpet" });
  });

  it("counts a station only when arriving by train", () => {
    const runner = new MissionRunner(missions);
    runner.update(0.1, at(0, "foot", 0, { wanted: 2 }));
    runner.update(0.1, at(0, "foot", 0, { wanted: 0 }));
    expect(runner.update(0.1, at(10, "foot"))).toEqual([]);
    expect(runner.update(0.1, at(10, "car"))).toEqual([]);
    expect(runner.update(0.1, at(10, "foot", 12, { onTrain: true })).map((e) => e.type)).toEqual(["completed", "allDone"]);
  });
});

describe("JobRunner with fares", () => {
  const job: Job = {
    id: "cab",
    kind: "cab",
    title: "Cab",
    brief: "",
    vehicle: "car",
    stops: [
      { label: "Pick up", x: 50, z: 0, radius: 7, dwell: 2, fare: { board: 1, kerb: { x: 50, z: 5 } } },
      { label: "Drop", x: 200, z: 0, radius: 7, dwell: 1, fare: { alight: 1, kerb: { x: 200, z: 5 } } },
    ],
    timeLimit: 60,
    payout: 500,
    fine: 50,
  };
  const car = (x: number, speed = 0) => ({ x, z: 0, mode: "car" as const, speed });
  const steps = (runner: JobRunner, seconds: number, player: ReturnType<typeof car>) => {
    const events = [];
    for (let t = 0; t < seconds - 1e-9; t += 0.1) events.push(...runner.update(0.1, player));
    return events;
  };

  it("moves on once the passenger is in, not after the old dwell, and the job clock waits meanwhile", () => {
    const runner = new JobRunner();
    runner.accept(job);
    runner.update(0.1, car(0));
    steps(runner, 5, car(30, 10));
    const left = runner.secondsLeft!;
    // The old two-second dwell is not enough: the passenger is still walking over.
    steps(runner, 2.1, car(50));
    expect(runner.stopNumber).toBe(0);
    expect(runner.fare?.note()).toBe("Passenger getting in");
    expect(runner.secondsLeft).toBeCloseTo(left - 0.1, 5);
    const events = steps(runner, walkTime(4) + doorTime("car"), car(50));
    expect(events.some((e) => e.type === "stop")).toBe(true);
    expect(runner.aboard).toBe(1);
    steps(runner, 3, car(200));
    const done = steps(runner, 10, car(200));
    const completed = done.find((e) => e.type === "completed");
    expect(completed).toBeDefined();
    expect(runner.aboard).toBe(0);
    expect(runner.fare).toBeNull();
  });
});
