/**
 * The suburban railway in the game: tracks and stations drawn near the player, timetabled
 * trains (models for the ones in sight, solid kinematic coaches for the ones close by), and
 * riding: BOARD at a platform when a train stands there (a ₹5 ticket), the camera follows the
 * train, the panel shows the next station, STEP OFF at a stop. A ride towards the map's edge
 * ends at the last station on the map. The rules live in `@cow/rail`; this module connects them
 * to the renderer, physics, player and HUD, like `Population` does for the AI.
 */
import type * as THREE from "three";
import { COACH_HEIGHT, COACH_LENGTH, COACH_WIDTH, DOOR_SILL, RAIL_TOP, RailView, TrainDoors, TrainView, coachDoorways, type ChaseTarget, type CoachPose, type FollowCamera } from "@cow/game-engine";
import type { KinematicBox, PhysicsWorld, StaticBox } from "@cow/physics";
import type { HumanFigure, PlayerController } from "@cow/player";
import { FARE, PLATFORM_HEIGHT, PLATFORM_LENGTH, RailNetwork, boarding, canStepOff, doorOpenness, platformOf, platformOffset, rideEndsAt, stopAt, type RailFile, type RailLine, type TrainAt } from "@cow/rail";
import type { MinimapMarker, RidePanel } from "@cow/ui";

/** Coaches per train (estimated: real Chennai EMUs run 9 or 12 cars). */
export const COACHES = 4;
const PITCH = COACH_LENGTH + 0.6;
/** Trains are drawn within this distance and solid within the smaller one. */
const DRAW_RANGE = 900;
const SOLID_RANGE = 400;
/** The railway clock starts mid-service, so trains are already running. */
const CLOCK_START = 2 * 3600;

export interface RailHost {
  readonly player: PlayerController;
  readonly avatar: HumanFigure;
  readonly camera: FollowCamera;
  money(): number;
  /** Take the fare; the host saves the balance. */
  pay(rupees: number): void;
  toast(title: string, detail: string, seconds: number): void;
  door(): void;
}

/** What tests and the debug snapshot can read about the railway. */
export interface RailSnapshot {
  readonly clock: number;
  /** Line id while riding, else null. */
  readonly riding: string | null;
  readonly train: string | null;
  readonly destination: string | null;
  readonly nextStop: string | null;
  readonly fares: number;
  /** Trains within 1.5 km of the player. */
  readonly trains: Array<{ id: string; line: string; x: number; z: number; speed: number; stoppedAt: string | null }>;
  /** Each line's stops: platform centre, the foot of the platform's steps (ground level), and the wait for the next train. */
  readonly stops: Array<{ line: string; name: string; x: number; z: number; footX: number; footZ: number; nextTrain: number }>;
  readonly drawnCells: number;
  readonly drawnCoaches: number;
  /** How far the sliding doors drawn on the coach nearest the player are open (0 shut, 1 open; 0 when none). */
  readonly doors: number;
  /** Walking through a coach's doorway: "board" (onto the train) or "alight" (off it), or null. */
  readonly walking: "board" | "alight" | null;
}

/** A short walk through a coach's doorway, getting on or off (world space, feet). */
interface DoorWalk {
  readonly points: ReadonlyArray<{ x: number; y: number; z: number }>;
  readonly length: number;
  readonly duration: number;
  readonly boarding: boolean;
  /** Where the player stands at the end (getting off), facing away from the train. */
  readonly end: { x: number; y: number; z: number; yaw: number } | null;
  time: number;
}

/** Walking pace through a doorway, m/s; a longer walk to the door hurries to take at most this long (seconds, estimated). */
const DOOR_WALK_SPEED = 1.5;
const DOOR_WALK_TIME = 4;

interface Ride {
  readonly line: RailLine;
  readonly departure: number;
  readonly id: string;
}

export class Railway {
  readonly network: RailNetwork;
  private readonly view: RailView;
  private readonly trains = new TrainView(COACHES * 8);
  /** Railway time, seconds; trains are a function of it. */
  private clock = CLOCK_START;
  private ride: Ride | null = null;
  private fares = 0;
  /** Solid coaches of the trains near the player, by train id. */
  private readonly bodies = new Map<string, KinematicBox[]>();
  private readonly spare: KinematicBox[] = [];
  private poses: CoachPose[] = [];
  /** What the context button does here: "BOARD", "STEP OFF" or nothing. */
  private offer: "BOARD" | "STEP OFF" | null = null;
  private readonly stationMarkers: MinimapMarker[];
  /** Sliding doors on the coach nearest the player, and how far open they are now. */
  private readonly doors = new TrainDoors();
  private doorAmount = 0;
  /** Walking through a doorway to get on or off, or null. */
  private walk: DoorWalk | null = null;

  constructor(
    file: RailFile,
    scene: THREE.Object3D,
    private readonly physics: PhysicsWorld,
    private readonly panel: RidePanel,
    private readonly host: RailHost,
    options: { drawDistance: number; tamil: boolean },
  ) {
    this.network = new RailNetwork(file);
    this.view = new RailView(file, { drawDistance: options.drawDistance + 150, detailDistance: Math.min(260, options.drawDistance), tamil: options.tamil });
    scene.add(this.view.object, this.trains.object, this.doors.mesh);
    // Platforms and their steps are solid (always: a few boxes for the whole map).
    const group = physics.createStaticGroup();
    for (const box of this.platformSolids()) group.addBox(box);
    this.stationMarkers = file.stations.map((s) => ({ x: s.x, z: s.z, color: "#1d3c78", size: 4.5 }));
  }

  /** Tracks for the minimap. */
  minimapLines(): Array<{ points: Array<{ x: number; z: number }>; width: number }> {
    return this.network.file.tracks
      .filter((t) => t.kind === "main")
      .map((t) => {
        const points: Array<{ x: number; z: number }> = [];
        for (let i = 0; i + 1 < t.points.length; i += 2) points.push({ x: t.points[i]!, z: t.points[i + 1]! });
        return { points, width: 3 };
      });
  }

  get stations(): readonly MinimapMarker[] {
    return this.stationMarkers;
  }

  get riding(): boolean {
    return this.ride !== null;
  }

  /** The context button's label, or null when the railway has nothing to offer here. */
  get action(): "BOARD" | "STEP OFF" | null {
    return this.offer;
  }

  private platformSolids(): StaticBox[] {
    const boxes: StaticBox[] = [];
    for (const line of this.network.lines) {
      for (const stop of line.stops) {
        // An island platform is solid once, for the first direction's stop.
        if (stop.twin) continue;
        const { x, z, yaw } = platformOf(line, stop);
        boxes.push({ x, y: PLATFORM_HEIGHT / 2, z, hx: stop.width / 2, hy: PLATFORM_HEIGHT / 2, hz: PLATFORM_LENGTH / 2, yaw });
        const across = stop.side * platformOffset(stop);
        for (const end of [-1, 1]) {
          for (let k = 0; k < 3; k++) {
            const at = line.path.beside(stop.s + end * (PLATFORM_LENGTH / 2 + 0.4 + k * 0.8), across);
            const top = PLATFORM_HEIGHT - 0.3 * (k + 1);
            boxes.push({ x: at.x, y: top / 2, z: at.z, hx: stop.width / 2, hy: top / 2, hz: 0.4, yaw });
          }
        }
      }
    }
    return boxes;
  }

  /** The train this ride is on, now. */
  private current(): TrainAt | null {
    return this.ride ? this.ride.line.train(this.ride.departure, this.clock) : null;
  }

  /** Coach centres and headings of a train (the train's `s` is its middle). */
  private coaches(train: TrainAt): CoachPose[] {
    const out: CoachPose[] = [];
    const path = train.line.path;
    for (let i = 0; i < COACHES; i++) {
      const s = train.state.s + ((COACHES - 1) / 2 - i) * PITCH;
      const front = path.at(s + 7);
      const back = path.at(s - 7);
      const yaw = Math.atan2(-(front.x - back.x), -(front.z - back.z));
      // The end coaches are driving cabs, the last one facing backwards.
      const last = i === COACHES - 1;
      out.push({ x: (front.x + back.x) / 2, z: (front.z + back.z) / 2, yaw: last ? yaw + Math.PI : yaw, cab: i === 0 || last });
    }
    return out;
  }

  /** Where the rider is: the middle of the train, at roof height (keeps the camera's ray clear of the coaches). */
  ridePosition(): { x: number; y: number; z: number } | null {
    if (this.walk) return this.walkPoint(this.walk).at;
    const train = this.current();
    if (!train) return null;
    const p = train.line.path.at(train.state.s);
    return { x: p.x, y: RAIL_TOP + COACH_HEIGHT - 1.2, z: p.z };
  }

  /** For the chase camera while riding. */
  rideChase(): ChaseTarget | null {
    // Walking through the doorway: the camera follows the figure, not the train.
    if (this.walk) return null;
    const train = this.current();
    if (!train) return null;
    const pose = train.line.path.at(train.state.s);
    const v = train.state.speed;
    return { velocity: { x: -Math.sin(pose.yaw) * v, z: -Math.cos(pose.yaw) * v }, heading: pose.yaw, forwardSpeed: v, topSpeed: 22 };
  }

  /** One physics step: the clock, the solid coaches near `at`, and the end of a ride. */
  fixedUpdate(dt: number, at: { x: number; z: number }): void {
    this.clock += dt;
    this.stepWalk(dt);
    const near = new Set<string>();
    for (const train of this.network.trains(this.clock)) {
      const middle = train.line.path.at(train.state.s);
      if (Math.hypot(middle.x - at.x, middle.z - at.z) > SOLID_RANGE) continue;
      near.add(train.id);
      let boxes = this.bodies.get(train.id);
      const fresh = !boxes;
      if (!boxes) {
        boxes = [];
        for (let i = 0; i < COACHES; i++) boxes.push(this.spare.pop() ?? this.physics.createKinematicBox({ x: COACH_WIDTH / 2, y: COACH_HEIGHT / 2 - 0.3, z: COACH_LENGTH / 2 }));
        this.bodies.set(train.id, boxes);
      }
      this.coaches(train).forEach((coach, i) => {
        const y = RAIL_TOP + 0.3 + COACH_HEIGHT / 2 - 0.3;
        if (fresh) boxes![i]!.teleport(coach.x, y, coach.z, coach.yaw);
        else boxes![i]!.moveTo(coach.x, y, coach.z, coach.yaw);
      });
    }
    for (const [id, boxes] of this.bodies) {
      if (near.has(id)) continue;
      for (const box of boxes) {
        box.teleport(0, -50, 0, 0);
        this.spare.push(box);
      }
      this.bodies.delete(id);
    }

    const train = this.current();
    if (this.ride && !train) {
      // The train left the line (should not happen: rides end at the last stop on the map).
      this.endRide(null);
      return;
    }
    if (train && rideEndsAt(train)) {
      const line = train.line;
      const stop = line.stops[train.state.stoppedAt!]!;
      this.alight(train);
      this.host.toast(`${stop.name}: end of the ride`, line.to.beyond ? `The line continues to ${line.to.name} beyond the map.` : `This train terminates at ${stop.name}.`, 5);
    }
  }

  /** The context button was pressed: board or step off. Returns true if the railway used the press. */
  act(at: { x: number; z: number }): boolean {
    // Stepping off through the doorway: the press is used up.
    if (this.walk && !this.walk.boarding) return true;
    const train = this.current();
    if (train) {
      if (canStepOff(train)) this.alight(train);
      else this.host.toast("Wait for the next station", "You can step off when the train stops.", 2);
      return true;
    }
    const standing = this.standingTrain(at);
    if (!standing) return false;
    const answer = boarding(standing.train, standing.index, this.host.money());
    if (!answer.ok) {
      this.host.toast("Can't board", answer.reason, 2.5);
      return true;
    }
    this.host.pay(answer.fare);
    this.fares += answer.fare;
    const departure = Number(standing.train.id.split("#")[1]);
    this.ride = { line: standing.train.line, departure, id: standing.train.id };
    const { player } = this.host;
    player.body.setEnabled(false);
    // Walk to the nearest open doorway and in; the figure is hidden once inside (`stepWalk`).
    this.walk = this.boardingWalk(standing.train, player.position);
    this.host.avatar.setAiming(false);
    this.host.door();
    const next = standing.train.state.nextStop;
    this.host.toast(`Train to ${standing.train.line.destination}`, `Ticket ₹${answer.fare}. Next: ${next !== null ? standing.train.line.stops[next]!.name : "end of the line"}`, 3);
    return true;
  }

  /** A train standing at the stop the player is at, on any line. */
  private standingTrain(at: { x: number; z: number }): { train: TrainAt; index: number } | null {
    for (const line of this.network.lines) {
      const index = stopAt(line, at);
      if (index === null) continue;
      const train = line.trains(this.clock).find((t) => t.state.stoppedAt === index);
      if (train) return { train, index };
    }
    return null;
  }

  /**
   * Off the train onto its platform: out through the doorway nearest the middle of the train
   * (where the rider is), a short walk onto the platform. Without a doorway on the platform's
   * side (should not happen), straight onto the platform as before.
   */
  private alight(train: TrainAt): void {
    const line = train.line;
    const stop = line.stops[train.state.stoppedAt ?? 0]!;
    const s = Math.max(stop.s - PLATFORM_LENGTH / 2 + 5, Math.min(stop.s + PLATFORM_LENGTH / 2 - 5, train.state.s));
    const middle = line.path.at(train.state.s);
    const door = this.nearestDoorway(train, middle);
    if (door) {
      this.ride = null;
      const floor = RAIL_TOP + DOOR_SILL;
      const points = [
        { ...door.at(COACH_WIDTH / 2 - 0.35), y: floor },
        { ...door.at(COACH_WIDTH / 2 + 0.5), y: PLATFORM_HEIGHT },
        { ...door.at(COACH_WIDTH / 2 + 1.1), y: PLATFORM_HEIGHT },
      ];
      const end = points[points.length - 1]!;
      const length = walkLength(points);
      this.walk = { points, length, duration: length / (DOOR_WALK_SPEED * 1.2), boarding: false, end: { ...end, y: end.y + 0.05, yaw: door.outwards }, time: 0 };
      this.host.avatar.visible = true;
      this.host.camera.reach = 5.6;
      this.host.door();
      return;
    }
    const spot = line.path.beside(s, stop.side * platformOffset(stop));
    const facing = line.path.at(s).yaw + (stop.side > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.endRide({ x: spot.x, y: PLATFORM_HEIGHT + 0.05, z: spot.z, yaw: facing });
  }

  /** Leave the ride; with a place, the player stands there, else (teleport, new game) wherever the game puts them. */
  endRide(at: { x: number; y: number; z: number; yaw: number } | null): void {
    // A walk through a doorway in progress stops too (teleport, new game).
    const walking = this.walk;
    this.walk = null;
    if (!this.ride && !walking) return;
    this.ride = null;
    const { player, avatar, camera } = this.host;
    player.body.setEnabled(true);
    if (at) player.respawn({ x: at.x, y: at.y, z: at.z }, at.yaw);
    if (at) camera.yaw = at.yaw;
    avatar.visible = true;
    camera.reach = 5.6;
    if (!walking) this.host.door();
  }

  /** True while the player walks through a coach's doorway (the figure belongs to the railway). */
  get walking(): boolean {
    return this.walk !== null;
  }

  /** Each frame of a walk through a doorway: place the figure and play the walk. */
  walkFrame(dt: number): void {
    const walk = this.walk;
    if (!walk) return;
    const { at, heading } = this.walkPoint(walk);
    const { avatar } = this.host;
    avatar.object.position.set(at.x, at.y, at.z);
    avatar.object.rotation.set(0, heading, 0);
    avatar.update(dt, walk.duration > 0 ? walk.length / walk.duration : 0, true);
  }

  /** Advance a walk; at its end the boarder disappears inside, and someone getting off stands on the platform. */
  private stepWalk(dt: number): void {
    const walk = this.walk;
    if (!walk) return;
    walk.time += dt;
    // Getting on, the train must not leave with the player still outside: they are in when it moves.
    const moving = walk.boarding && this.current()?.state.stoppedAt === null;
    if (walk.time < walk.duration && !moving) return;
    this.walk = null;
    const { player, avatar, camera } = this.host;
    if (walk.boarding) {
      avatar.visible = false;
      camera.reach = 15;
    } else if (walk.end) {
      player.body.setEnabled(true);
      player.respawn({ x: walk.end.x, y: walk.end.y, z: walk.end.z }, walk.end.yaw);
      avatar.visible = true;
    }
  }

  private walkPoint(walk: DoorWalk): { at: { x: number; y: number; z: number }; heading: number } {
    const points = walk.points;
    let left = Math.min(1, walk.duration > 0 ? walk.time / walk.duration : 1) * walk.length;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const leg = Math.hypot(b.x - a.x, b.z - a.z);
      if (left <= leg || i === points.length - 1) {
        const t = leg > 0 ? Math.min(1, left / leg) : 1;
        return { at: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }, heading: Math.atan2(-(b.x - a.x), -(b.z - a.z)) };
      }
      left -= leg;
    }
    const first = points[0]!;
    return { at: { ...first }, heading: 0 };
  }

  /**
   * The walk from where the player stands to the nearest doorway of a standing train and in.
   * From far along the platform the player hurries (up to a run), so the walk takes a few seconds;
   * it always ends before the doors start closing.
   */
  private boardingWalk(train: TrainAt, from: { x: number; y: number; z: number }): DoorWalk {
    const door = this.nearestDoorway(train, from);
    const floor = RAIL_TOP + DOOR_SILL;
    if (!door) return { points: [from, from], length: 0, duration: 0.2, boarding: true, end: null, time: 0 };
    const outside = { ...door.at(COACH_WIDTH / 2 + 0.6), y: PLATFORM_HEIGHT };
    const inside = { ...door.at(COACH_WIDTH / 2 - 0.6), y: floor };
    const start = { x: from.x, y: from.y, z: from.z };
    // From below the platform (at the foot of its steps), up them first: climbing 0.3 m per metre walked.
    const points: Array<{ x: number; y: number; z: number }> = [start];
    const gap = Math.hypot(from.x - outside.x, from.z - outside.z);
    const climb = (PLATFORM_HEIGHT - from.y) / 0.3;
    if (climb > 0.1 && gap > climb) {
      const t = climb / gap;
      points.push({ x: from.x + (outside.x - from.x) * t, y: PLATFORM_HEIGHT, z: from.z + (outside.z - from.z) * t });
    }
    points.push(outside, inside);
    const length = walkLength(points);
    // Walk; hurry (up to a run) from far along the platform, so the walk ends before the doors close.
    const time = length / Math.max(DOOR_WALK_SPEED, length / DOOR_WALK_TIME);
    const duration = Math.max(0.4, Math.min(time, train.state.dwellLeft - 1.4));
    return { points, length, duration, boarding: true, end: null, time: 0 };
  }

  /**
   * The doorway on the platform's side of a standing train nearest a point: `at(lateral)` gives a
   * point that far out from the coach's centre line, level with the doorway; `outwards` faces
   * away from the train. Null if the train is not at a stop.
   */
  private nearestDoorway(train: TrainAt, near: { x: number; z: number }): { at: (lateral: number) => { x: number; z: number }; outwards: number; coach: CoachPose; side: 1 | -1 } | null {
    const index = train.state.stoppedAt;
    if (index === null) return null;
    const platform = platformOf(train.line, train.line.stops[index]!);
    let best: { at: (lateral: number) => { x: number; z: number }; outwards: number; coach: CoachPose; side: 1 | -1 } | null = null;
    let bestDistance = Infinity;
    for (const coach of this.coaches(train)) {
      const side = platformSide(coach, platform);
      const cos = Math.cos(coach.yaw);
      const sin = Math.sin(coach.yaw);
      for (const z of coachDoorways(coach.cab)) {
        const at = (lateral: number) => {
          const x = side * lateral;
          return { x: coach.x + x * cos + z * sin, z: coach.z - x * sin + z * cos };
        };
        const p = at(COACH_WIDTH / 2 + 0.6);
        const d = Math.hypot(p.x - near.x, p.z - near.z);
        if (d < bestDistance) {
          bestDistance = d;
          best = { at, outwards: coach.yaw - side * (Math.PI / 2), coach, side };
        }
      }
    }
    return best;
  }

  /** The sliding doors: on the coach nearest `at` of a train standing at a stop near the player. */
  private placeDoors(at: { x: number; z: number }): void {
    let best: { coach: CoachPose; side: 1 | -1; amount: number } | null = null;
    let bestDistance = 80;
    for (const train of this.network.trains(this.clock)) {
      const index = train.state.stoppedAt;
      if (index === null) continue;
      const middle = train.line.path.at(train.state.s);
      if (Math.hypot(middle.x - at.x, middle.z - at.z) > 120) continue;
      const platform = platformOf(train.line, train.line.stops[index]!);
      for (const coach of this.coaches(train)) {
        const d = Math.hypot(coach.x - at.x, coach.z - at.z);
        if (d < bestDistance) {
          bestDistance = d;
          best = { coach, side: platformSide(coach, platform), amount: doorOpenness(train.state, train.line.profile.spec.dwell) };
        }
      }
    }
    this.doors.place(best?.coach ?? null, best?.side ?? 1, best?.amount ?? 0);
    this.doorAmount = best?.amount ?? 0;
  }

  /** Each drawn frame: track cells, train models, the panel and the button. */
  frame(at: { x: number; z: number }): void {
    this.view.update(at.x, at.z);
    this.poses = [];
    for (const train of this.network.trains(this.clock)) {
      const middle = train.line.path.at(train.state.s);
      if (Math.hypot(middle.x - at.x, middle.z - at.z) > DRAW_RANGE) continue;
      this.poses.push(...this.coaches(train));
    }
    this.trains.place(this.poses);
    this.placeDoors(at);

    const train = this.current();
    if (train) {
      const next = train.state.nextStop;
      const nextStop = next !== null ? train.line.stops[next]! : null;
      const standing = train.state.stoppedAt !== null ? train.line.stops[train.state.stoppedAt]! : null;
      const km = nextStop ? Math.max(0, nextStop.s - train.state.s) / 1000 : 0;
      this.panel.show({
        title: `Train to ${train.line.destination}`,
        detail: standing ? `${standing.name} · leaves in ${Math.ceil(train.state.dwellLeft)} s` : nextStop ? `Next: ${nextStop.name} · ${km.toFixed(1)} km · ${Math.round(train.state.speed * 3.6)} km/h` : `Towards ${train.line.destination}`,
      });
      this.offer = canStepOff(train) ? "STEP OFF" : null;
      return;
    }
    // On foot at a station: its name, and when the next trains come.
    const here: string[] = [];
    let name = "";
    for (const line of this.network.lines) {
      const index = stopAt(line, at);
      if (index === null) continue;
      name = line.stops[index]!.name;
      const wait = line.nextArrival(index, this.clock);
      here.push(wait < 1 ? `To ${line.destination}: boarding now` : `To ${line.destination} in ${Math.floor(wait / 60)}:${String(Math.floor(wait % 60)).padStart(2, "0")}`);
    }
    this.panel.show(name ? { title: `${name} station · ticket ₹${FARE}`, detail: here.join(" · ") } : null);
    this.offer = this.standingTrain(at) ? "BOARD" : null;
  }

  /** For tests only: move the railway clock forward (trains jump ahead on their timetable). */
  advance(seconds: number): void {
    this.clock += Math.max(0, seconds);
  }

  snapshot(at: { x: number; z: number }): RailSnapshot {
    const train = this.current();
    const next = train && train.state.nextStop !== null ? train.line.stops[train.state.nextStop]!.name : null;
    return {
      clock: this.clock,
      riding: this.ride?.line.id ?? null,
      train: this.ride?.id ?? null,
      destination: train?.line.destination ?? null,
      nextStop: next,
      fares: this.fares,
      trains: this.network
        .trains(this.clock)
        .map((t) => ({ t, p: t.line.path.at(t.state.s) }))
        .filter(({ p }) => Math.hypot(p.x - at.x, p.z - at.z) < 1500)
        .map(({ t, p }) => ({ id: t.id, line: t.line.id, x: p.x, z: p.z, speed: t.state.speed, stoppedAt: t.state.stoppedAt !== null ? t.line.stops[t.state.stoppedAt]!.name : null })),
      stops: this.network.lines.flatMap((line) =>
        line.stops.map((stop, index) => {
          const platform = platformOf(line, stop);
          const foot = line.path.beside(stop.s - PLATFORM_LENGTH / 2 - 4, platform.lateral);
          return { line: line.id, name: stop.name, x: platform.x, z: platform.z, footX: foot.x, footZ: foot.z, nextTrain: line.nextArrival(index, this.clock) };
        }),
      ),
      drawnCells: this.view.drawnCells,
      drawnCoaches: this.poses.length,
      doors: this.doorAmount,
      walking: this.walk ? (this.walk.boarding ? "board" : "alight") : null,
    };
  }
}

/** Length of a walk over the ground, metres. */
function walkLength(points: ReadonlyArray<{ x: number; z: number }>): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z);
  return length;
}

/** Which side of a coach (1 its right, -1 its left, in its own frame) faces the platform. */
function platformSide(coach: CoachPose, platform: { x: number; z: number }): 1 | -1 {
  const right = (platform.x - coach.x) * Math.cos(coach.yaw) - (platform.z - coach.z) * Math.sin(coach.yaw);
  return right >= 0 ? 1 : -1;
}
