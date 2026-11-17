import { describe, expect, it } from "vitest";
import { JobRunner, START_REPUTATION, type Job, type JobEvent, type JobPlayer } from "./jobs";
import { RouteLine, SHARE_AUTO, shareEstimate, shareFare, shareReputation, ShareShift, shareStars, type ShareDriver, type ShareEvent, type ShareRoute } from "./shareAuto";

/** A straight 2 km route heading east (+X); the kerb side (driver's left) is north (-Z). */
const route: ShareRoute = { name: "Test Avenue", from: "West End", to: "East End", points: [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 2000, z: 0 }], kerb: 4.5, lane: 1.8 };

/** Gaps as short as allowed and rides as long as allowed: people pile up, nobody gets off soon. */
function crowded(): () => number {
  let calls = 0;
  // First call places the first passenger; then each passenger takes a ride length, then a gap.
  return () => (calls++ === 0 ? 0 : calls % 2 === 0 ? 1 : 0);
}

/** Drive along the route's lane from where the driver is to `s` metres, at `speed`, collecting events. */
function drive(shift: ShareShift, from: number, to: number, speed = 8): ShareEvent[] {
  const events: ShareEvent[] = [];
  const dt = 0.1;
  for (let s = from; s < to; s += speed * dt) {
    const p = shift.line.pointAt(s, route.lane);
    events.push(...shift.update(dt, { x: p.x, z: p.z, speed, inVehicle: true }));
  }
  return events;
}

/** Stand still at a point for `seconds`. */
function wait(shift: ShareShift, at: { x: number; z: number }, seconds: number, inVehicle = true): ShareEvent[] {
  const events: ShareEvent[] = [];
  for (let t = 0; t < seconds - 1e-9; t += 0.1) events.push(...shift.update(0.1, { x: at.x, z: at.z, speed: 0, inVehicle }));
  return events;
}
const types = (events: readonly { type: string }[]) => events.map((e) => e.type);

describe("share auto fares and route", () => {
  it("charges a small flat part plus a few rupees a kilometre", () => {
    expect(shareFare(0)).toBe(SHARE_AUTO.baseFare);
    expect(shareFare(1000)).toBe(SHARE_AUTO.baseFare + SHARE_AUTO.perKm);
    expect(shareFare(2000)).toBe(SHARE_AUTO.baseFare + 2 * SHARE_AUTO.perKm);
    expect(shareFare(-50)).toBe(SHARE_AUTO.baseFare);
    // A good shift on 2 km earns a few hundred rupees at most.
    expect(shareEstimate(2000)).toBeGreaterThan(50);
    expect(shareEstimate(2000)).toBeLessThan(400);
    expect(SHARE_AUTO.capacity).toBe(4);
  });

  it("measures the route and finds the nearest point within a window", () => {
    const line = new RouteLine(route.points);
    expect(line.length).toBe(2000);
    const p = line.pointAt(1500, 4);
    expect(p.x).toBeCloseTo(1500);
    expect(p.z).toBeCloseTo(-4);
    expect(line.project({ x: 700, z: 10 })).toEqual({ s: 700, off: 10 });
    expect(line.project({ x: 700, z: 0 }, 1200, 1800).s).toBe(1200);
  });
});

describe("ShareShift", () => {
  it("puts a few people at the kerb ahead of the auto, with drop points further on", () => {
    const shift = new ShareShift(route);
    shift.update(0.1, { x: 0, z: 1.8, speed: 0, inVehicle: true });
    const waiting = shift.waiting;
    expect(waiting.length).toBeGreaterThan(0);
    expect(waiting.length).toBeLessThanOrEqual(SHARE_AUTO.maxWaiting);
    for (const p of waiting) {
      expect(p.at).toBeGreaterThanOrEqual(SHARE_AUTO.spawnAhead.min);
      expect(p.at).toBeLessThanOrEqual(SHARE_AUTO.spawnAhead.max);
      // On the kerb side, beside the lane where the auto stops.
      expect(p.z).toBeCloseTo(-route.kerb, 1);
      expect(p.stop).toEqual({ x: p.x, z: -route.lane });
      expect(p.dropAt - p.at).toBeGreaterThanOrEqual(SHARE_AUTO.ride.min);
      expect(p.dropAt).toBeLessThanOrEqual(shift.length - SHARE_AUTO.endMargin);
    }
    // Always the same for the same seed.
    const again = new ShareShift(route);
    again.update(0.1, { x: 0, z: 1.8, speed: 0, inVehicle: true });
    expect(again.waiting).toEqual(waiting);
    // More appear as the auto moves on, never more than a few at once.
    drive(shift, 0, 900, 30);
    expect(shift.passengers.length).toBeGreaterThan(waiting.length);
    expect(shift.waiting.length).toBeLessThanOrEqual(SHARE_AUTO.maxWaiting);
    for (const p of shift.waiting) expect(p.at).toBeGreaterThan(shift.progress - SHARE_AUTO.passMargin);
  });

  it("lets people in only when the auto is stopped beside them", () => {
    const shift = new ShareShift(route);
    shift.update(0.1, { x: 0, z: -1.8, speed: 0, inVehicle: true });
    const first = shift.waiting[0]!;
    // Rolling slowly past does not count.
    expect(types(drive(shift, 0, first.at + 3, 3))).not.toContain("boarded");
    // Stopped, but too far away (beyond the board radius).
    expect(types(wait(shift, { x: first.x - 10, z: first.stop.z }, 3))).not.toContain("boarded");
    // Stopped beside them, on foot: no.
    expect(types(wait(shift, first.stop, 3, false))).not.toContain("boarded");
    // Stopped beside them, in the auto, for less than the boarding time: not yet.
    expect(types(wait(shift, first.stop, SHARE_AUTO.boardSeconds - 0.3))).toEqual([]);
    const events = wait(shift, first.stop, 0.5);
    expect(types(events)).toContain("boarded");
    expect(shift.aboard).toBe(1);
    expect(shift.passengers.find((p) => p.id === first.id)?.state).toBe("riding");
  });

  it("takes at most four passengers; a full auto passing someone is no fault", () => {
    const shift = new ShareShift(route, crowded());
    let s = 0;
    for (let n = 1; n <= 5; n++) {
      shift.update(0.1, { ...shift.line.pointAt(s, route.lane), speed: 5, inVehicle: true });
      const next = shift.waiting[0]!;
      drive(shift, s, next.at);
      s = next.at;
      wait(shift, next.stop, 2);
      expect(shift.aboard).toBe(Math.min(n, SHARE_AUTO.capacity));
      if (n === 5) expect(shift.passengers.find((p) => p.id === next.id)?.state).toBe("waiting");
    }
    const fifth = shift.waiting[0]!;
    const events = drive(shift, s, s + 60);
    expect(types(events)).not.toContain("left");
    expect(shift.passengers.find((p) => p.id === fifth.id)?.state).toBe("gone");
    expect(shift.summary().left).toBe(0);
  });

  it("drops a passenger at their point and charges by the distance they rode", () => {
    const shift = new ShareShift(route);
    shift.update(0.1, { x: 0, z: -1.8, speed: 0, inVehicle: true });
    const rider = shift.waiting[0]!;
    drive(shift, 0, rider.at);
    wait(shift, rider.stop, 2);
    expect(shift.aboard).toBe(1);
    // Stopping short of the drop point does nothing.
    drive(shift, rider.at, rider.dropAt - 30);
    expect(types(wait(shift, shift.line.pointAt(rider.dropAt - 30, route.lane), 3))).not.toContain("dropped");
    drive(shift, rider.dropAt - 30, rider.dropAt);
    const events = wait(shift, rider.drop, 1.5);
    const dropped = events.find((e) => e.type === "dropped");
    expect(dropped?.type).toBe("dropped");
    if (dropped?.type !== "dropped") return;
    expect(dropped.fare).toBe(shareFare(rider.dropAt - rider.at));
    expect(dropped.fare).toBeGreaterThanOrEqual(SHARE_AUTO.baseFare);
    expect(shift.fares).toBe(dropped.fare);
    expect(shift.summary().carried).toBe(1);
  });

  it("counts a drop point driven past, and people left waiting with a seat free", () => {
    const shift = new ShareShift(route);
    shift.update(0.1, { x: 0, z: -1.8, speed: 0, inVehicle: true });
    const rider = shift.waiting[0]!;
    drive(shift, 0, rider.at);
    wait(shift, rider.stop, 2);
    const events = drive(shift, rider.at, rider.dropAt + SHARE_AUTO.missMargin + 5);
    expect(types(events)).toContain("missed");
    // Everyone else waiting on the way was driven past with three seats free.
    expect(types(events)).toContain("left");
    const summary = shift.summary();
    expect(summary.missed).toBe(1);
    expect(summary.left).toBeGreaterThan(0);
    expect(summary.carried).toBe(0);
    expect(shift.aboard).toBe(0);
  });

  it("knows when the auto is stopped at the end, and closing the shift counts anyone still aboard", () => {
    const shift = new ShareShift(route, crowded());
    shift.update(0.1, { x: 0, z: -1.8, speed: 0, inVehicle: true });
    const rider = shift.waiting[0]!;
    drive(shift, 0, rider.at);
    wait(shift, rider.stop, 2);
    const end: ShareDriver = { ...shift.end, speed: 0, inVehicle: true };
    expect(shift.atEnd(end)).toBe(true);
    expect(shift.atEnd({ ...end, speed: 4 })).toBe(false);
    expect(shift.atEnd({ ...end, x: end.x - 30 })).toBe(false);
    expect(shift.close().missed).toBe(1);
    expect(shift.aboard).toBe(0);
  });
});

describe("share auto reputation and rating", () => {
  it("earns a little for people carried and loses a little per let-down, within -5 to +3", () => {
    expect(shareReputation({ carried: 0, fares: 0, missed: 0, left: 0 })).toBe(0);
    expect(shareReputation({ carried: 1, fares: 12, missed: 0, left: 0 })).toBe(1);
    expect(shareReputation({ carried: 4, fares: 50, missed: 0, left: 0 })).toBe(2);
    expect(shareReputation({ carried: 9, fares: 120, missed: 0, left: 0 })).toBe(3);
    expect(shareReputation({ carried: 4, fares: 50, missed: 1, left: 2 })).toBe(-1);
    expect(shareReputation({ carried: 0, fares: 0, missed: 4, left: 6 })).toBe(-5);
    expect(shareStars({ carried: 5, fares: 60, missed: 0, left: 0 }, 0)).toBe(5);
    expect(shareStars({ carried: 5, fares: 60, missed: 1, left: 1 }, 2)).toBe(2);
    expect(shareStars({ carried: 0, fares: 0, missed: 0, left: 0 }, 0)).toBe(1);
  });
});

describe("JobRunner with a share auto shift", () => {
  const job: Job = {
    id: "share",
    kind: "share",
    title: "Share auto",
    brief: "",
    vehicle: "auto",
    stops: [{ label: "End of the route", x: 2000, z: -1.8, radius: 10 }],
    timeLimit: 400,
    payout: 150,
    fine: 50,
    startRadius: 100,
    share: route,
  };
  const at = (x: number, z = -1.8, speed = 0, mode: JobPlayer["mode"] = "auto"): JobPlayer => ({ x, z, mode, speed });
  const run = (runner: JobRunner, player: JobPlayer, seconds: number): JobEvent[] => {
    const events: JobEvent[] = [];
    for (let t = 0; t < seconds - 1e-9; t += 0.1) events.push(...runner.update(0.1, player));
    return events;
  };

  it("starts the clock in an auto near the start of the route, not at its end", () => {
    const runner = new JobRunner();
    runner.accept(job);
    expect(runner.share).not.toBeNull();
    expect(types(run(runner, at(500), 1))).toEqual([]);
    expect(types(run(runner, at(-40, -1.8, 0, "foot"), 1))).toEqual([]);
    expect(types(runner.update(0.1, at(-40)))).toEqual(["started"]);
  });

  it("pays the fares at the end of the route, with the tally and reputation on the result", () => {
    const runner = new JobRunner();
    runner.accept(job);
    runner.update(0.1, at(0));
    const shift = runner.share!;
    const rider = shift.waiting[0]!;
    for (let s = 0; s < rider.at; s += 1) runner.update(0.1, at(s, -1.8, 8));
    expect(types(run(runner, at(rider.stop.x, rider.stop.z), 2))).toContain("boarded");
    for (let s = rider.at; s < rider.dropAt; s += 1) runner.update(0.1, at(s, -1.8, 8));
    const dropped = run(runner, at(rider.drop.x, rider.drop.z), 1.5).find((e) => e.type === "dropped");
    expect(dropped?.type === "dropped" && dropped.fare).toBe(shareFare(rider.dropAt - rider.at));
    // Then straight to the end, leaving the rest waiting.
    for (let s = rider.dropAt; s < 2000; s += 1) runner.update(0.1, at(s, -1.8, 8));
    const done = run(runner, at(2000), 0.5).find((e) => e.type === "completed");
    expect(done?.type).toBe("completed");
    if (done?.type !== "completed") return;
    const summary = done.result.share!;
    expect(summary.carried).toBe(1);
    expect(done.result.pay).toBe(summary.fares);
    expect(summary.left).toBeGreaterThan(0);
    expect(done.result.reputation).toBe(shareReputation(summary));
    expect(runner.reputation).toBe(START_REPUTATION + shareReputation(summary));
    expect(done.result.notes.join(". ")).toContain("1 passenger carried");
    expect(runner.job).toBeNull();
    expect(runner.share).toBeNull();
    expect(runner.record().best.share).toBe(summary.fares);
  });

  it("ends the shift when time runs out, paying what was earned instead of failing", () => {
    const runner = new JobRunner();
    runner.accept(job);
    runner.update(0.1, at(0));
    const events = run(runner, at(0), job.timeLimit + 1);
    expect(types(events)).toContain("completed");
    expect(types(events)).not.toContain("failed");
    const done = events.find((e) => e.type === "completed");
    if (done?.type !== "completed") return;
    expect(done.result.pay).toBe(0);
    expect(done.result.notes[0]).toBe("Shift time up");
    expect(done.result.reputation).toBe(0);
  });

  it("quitting a shift costs the usual fine and reputation", () => {
    const runner = new JobRunner();
    runner.accept(job);
    runner.update(0.1, at(0));
    const [failed] = runner.quit();
    expect(failed?.type).toBe("failed");
    expect(runner.reputation).toBe(START_REPUTATION - 5);
    expect(runner.share).toBeNull();
  });
});
