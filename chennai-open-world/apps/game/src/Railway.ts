/**
 * The suburban railway in the game: tracks and stations drawn near the player, timetabled
 * trains (models for the ones in sight, solid kinematic coaches for the ones close by), and
 * riding: BOARD at a platform when a train stands there (a ₹5 ticket), the camera follows the
 * train, the panel shows the next station, STEP OFF at a stop. A ride towards the map's edge
 * ends at the last station on the map. The rules live in `@cow/rail`; this module connects them
 * to the renderer, physics, player and HUD, like `Population` does for the AI.
 *
 * Stations come alive near the player (`StationCrowd`, `StationLife`): people wait on the
 * platforms, get on and off the trains, the departure board counts down to the next train, the
 * clock keeps the time of day, a chime announces each train and the horn sounds as it leaves.
 * Everything drawn moves with a render clock that follows the railway clock smoothly between
 * physics steps, so trains and people glide rather than step.
 */
import type * as THREE from "three";
import { COACH_HEIGHT, COACH_LENGTH, COACH_WIDTH, DOOR_SILL, RAIL_TOP, RailView, StationLife, TrainDoors, TrainView, coachDoorways, platformStair, stallAt, type ChaseTarget, type CoachPose, type FollowCamera } from "@cow/game-engine";
import type { KinematicBox, PhysicsWorld, StaticBox } from "@cow/physics";
import type { CrowdFigures, CrowdPlacement, HumanFigure, PlayerController } from "@cow/player";
import { FARE, PLATFORM_HEIGHT, PLATFORM_LENGTH, RailNetwork, StationCrowd, boardText, boarding, canStepOff, doorOpenness, initialLoad, platformMiddle, platformOf, platformOffset, rideEndsAt, stopAt, waitingCount, type CrowdTrain, type RailFile, type RailLine, type StationPlatform, type TrainAt } from "@cow/rail";
import type { MinimapMarker, RidePanel } from "@cow/ui";

/** Coaches per train (estimated: real Chennai EMUs run 9 or 12 cars). */
export const COACHES = 4;
const PITCH = COACH_LENGTH + 0.6;
/** Trains are drawn within this distance and solid within the smaller one. */
const DRAW_RANGE = 900;
const SOLID_RANGE = 400;
/** The railway clock starts mid-service, so trains are already running. */
const CLOCK_START = 2 * 3600;
/** Platforms within this distance of the player have their crowd; at most this many at once. */
const CROWD_RANGE = 170;
const CROWD_PLATFORMS = 2;
/** The departure board and clock are live at the nearest platform within this distance, metres. */
const BOARD_RANGE = 200;
/** Platform people further than this from the player are not drawn, metres. */
const PEOPLE_DRAWN = 80;
/** At most this many platform people are drawn at once (the nearest). */
const PEOPLE_MAX = 20;
/** Trains whose wheels are drawn turning: within this distance, metres. */
const WHEEL_RANGE = 140;
/** A train pulling away sounds its horn when within this distance of the player, metres. */
const HORN_RANGE = 350;
/** The chime is announced this many seconds before a train reaches the platform the player is at. */
const ANNOUNCE_AHEAD = 50;

export interface RailHost {
  readonly player: PlayerController;
  readonly avatar: HumanFigure;
  readonly camera: FollowCamera;
  money(): number;
  /** Take the fare; the host saves the balance. */
  pay(rupees: number): void;
  toast(title: string, detail: string, seconds: number): void;
  door(): void;
  /** A train pulling away nearby: its horn, `level` 1 close to 0 far. */
  horn?(level: number): void;
  /** The platform's announcement chime (a train is coming). */
  announce?(): void;
}

/** What tests and the debug snapshot can read about the station the player is at. */
export interface StationSnapshot {
  readonly station: string;
  readonly platform: string;
  /** People waiting, walking to a door, and getting off, on the platform now. */
  readonly waiting: number;
  readonly boarding: number;
  readonly alighting: number;
  /** For the train standing at this platform now (or null): people on it, and how many got on and off here so far. */
  readonly train: { id: string; onTrain: number; boarded: number; alighted: number; board: number; alight: number } | null;
  /** The departure board's lines (header first), or empty when it is not live here. */
  readonly board: string[];
  /** Crowd figures drawn this frame (all live platforms), and their triangles. */
  readonly drawn: number;
  readonly crowdTriangles: number;
  /** Where this platform's people stand (feet; not the tea seller), for checking they are on the deck. */
  readonly people: ReadonlyArray<{ x: number; y: number; z: number }>;
  /** Announcements made since the start. */
  readonly announcements: number;
  /** Horns sounded since the start. */
  readonly horns: number;
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
  /** The live station near the player, or null. */
  readonly station: StationSnapshot | null;
  /** Wheelsets drawn turning. */
  readonly wheelsets: number;
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
  /** Railway time the drawn trains and people are shown at: follows `clock` smoothly between physics steps. */
  private viewClock = CLOCK_START;
  /** Every drawn platform (the same layout the station models use). */
  private readonly platforms: readonly StationPlatform[];
  /** Platform crowds near the player, by platform key, and the figures that draw them (once baked). */
  private readonly crowds = new Map<string, StationCrowd>();
  private crowdClock = CLOCK_START;
  private figures: CrowdFigures | null = null;
  private readonly people: CrowdPlacement[] = [];
  /** People on each train in view (set when first seen; changed by who gets on and off). */
  private readonly loads = new Map<string, number>();
  /** Doorways of trains standing at a crowd's platform, in its frame (doors don't move while it stands). */
  private readonly doorCache = new Map<string, CrowdTrain["doors"]>();
  private readonly life = new StationLife();
  private livePlatform: StationPlatform | null = null;
  private hour = 12;
  /** Trains near the player last step, and whether each was standing (the horn sounds as one pulls away). */
  private readonly standing = new Map<string, boolean>();
  /** Seconds to the next train at each service of the platform the player is at, last step (for the chime). */
  private readonly lastWait = new Map<string, number>();
  private announcements = 0;
  private horns = 0;

  constructor(
    file: RailFile,
    private readonly scene: THREE.Object3D,
    private readonly physics: PhysicsWorld,
    private readonly panel: RidePanel,
    private readonly host: RailHost,
    options: { drawDistance: number; tamil: boolean; hindi?: boolean },
  ) {
    this.network = new RailNetwork(file);
    this.view = new RailView(file, { drawDistance: options.drawDistance + 150, detailDistance: Math.min(260, options.drawDistance), tamil: options.tamil, hindi: options.hindi ?? false });
    this.platforms = this.view.platforms;
    scene.add(this.view.object, this.trains.object, this.doors.mesh, this.life.object);
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

  /**
   * Coach centres and headings of a train (the train's `s` is its middle).
   * @param roll give each coach the distance run, so its wheels are drawn turning
   */
  private coaches(train: TrainAt, roll = false): CoachPose[] {
    const out: CoachPose[] = [];
    const path = train.line.path;
    for (let i = 0; i < COACHES; i++) {
      const s = train.state.s + ((COACHES - 1) / 2 - i) * PITCH;
      const front = path.at(s + 7);
      const back = path.at(s - 7);
      const yaw = Math.atan2(-(front.x - back.x), -(front.z - back.z));
      // The end coaches are driving cabs, the last one facing backwards.
      const last = i === COACHES - 1;
      const pose = { x: (front.x + back.x) / 2, z: (front.z + back.z) / 2, yaw: last ? yaw + Math.PI : yaw, cab: i === 0 || last };
      // The trailing cab is drawn facing backwards: in its own frame its wheels turn the other way.
      out.push(roll ? { ...pose, roll: last ? -train.state.s : train.state.s } : pose);
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
    this.listen(at);
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

  /** The horn of a train pulling away near the player, and the chime before a train reaches the player's platform. */
  private listen(at: { x: number; z: number }): void {
    const seen = new Set<string>();
    for (const train of this.network.trains(this.clock)) {
      const middle = train.line.path.at(train.state.s);
      const d = Math.hypot(middle.x - at.x, middle.z - at.z);
      if (d > HORN_RANGE) continue;
      seen.add(train.id);
      const stood = this.standing.get(train.id);
      const stands = train.state.stoppedAt !== null;
      if (stood === true && !stands) {
        this.horns++;
        this.host.horn?.(1 - d / HORN_RANGE);
      }
      this.standing.set(train.id, stands);
    }
    for (const id of [...this.standing.keys()]) if (!seen.has(id)) this.standing.delete(id);
    // The platform the player is at: a chime when its next train is under a minute away.
    for (const line of this.network.lines) {
      const index = stopAt(line, at);
      const key = `${line.id}:${index}`;
      if (index === null) {
        for (const k of [...this.lastWait.keys()]) if (k.startsWith(`${line.id}:`)) this.lastWait.delete(k);
        continue;
      }
      const wait = line.nextArrival(index, this.clock);
      const before = this.lastWait.get(key);
      if (before !== undefined && before > ANNOUNCE_AHEAD && wait <= ANNOUNCE_AHEAD && wait > 1) {
        this.announcements++;
        this.host.announce?.();
      }
      this.lastWait.set(key, wait);
    }
  }

  /** The baked crowd figures, once ready (people on the platforms are drawn from then on). */
  useCrowd(figures: CrowdFigures): void {
    this.figures = figures;
    this.scene.add(figures.object);
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
  private placeDoors(at: { x: number; z: number }, trains: readonly TrainAt[]): void {
    let best: { coach: CoachPose; side: 1 | -1; amount: number } | null = null;
    let bestDistance = 80;
    for (const train of trains) {
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

  /**
   * Each drawn frame: track cells, train models, the stations' people, board and clock, the
   * panel and the button.
   * @param dt seconds since the last frame
   * @param hour time of day (crowds and clocks follow it)
   */
  frame(at: { x: number; z: number }, dt = 0, hour = 12): void {
    this.hour = hour;
    // The render clock runs on with the frames and is pulled gently onto the railway clock: no
    // step at each physics tick, and no lasting drift on a slow machine. A jump (test hook) snaps.
    this.viewClock += Math.max(0, Math.min(0.25, dt));
    const behind = this.clock - this.viewClock;
    if (Math.abs(behind) > 0.5) this.viewClock = this.clock;
    else this.viewClock += behind * Math.min(1, dt * 6);
    // Never ahead of the timetable by more than a frame: a train must not reach a stop early.
    this.viewClock = Math.min(this.viewClock, this.clock + 1 / 60);
    // Riding (or stepping through a doorway), the camera follows the train on the physics step:
    // drawn on the same clock, the train stays steady in view. (Drop this once the camera is
    // interpolated between steps too.)
    if (this.ride || this.walk) this.viewClock = this.clock;
    const shown = this.network.trains(this.viewClock);
    this.view.update(at.x, at.z);
    this.poses = [];
    for (const train of shown) {
      const middle = train.line.path.at(train.state.s);
      const d = Math.hypot(middle.x - at.x, middle.z - at.z);
      if (d > DRAW_RANGE) continue;
      this.poses.push(...this.coaches(train, d < WHEEL_RANGE));
    }
    this.trains.place(this.poses);
    this.placeDoors(at, shown);
    this.stationFrame(at, shown);

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

  /** Crowds on the platforms near the player, stepped on the render clock, and the live board and clock. */
  private stationFrame(at: { x: number; z: number }, trains: readonly TrainAt[]): void {
    const step = Math.max(0, Math.min(0.25, this.viewClock - this.crowdClock));
    this.crowdClock = this.viewClock;
    const near = this.platforms
      .map((p) => ({ p, d: Math.hypot(platformCentre(p).x - at.x, platformCentre(p).z - at.z) }))
      .filter(({ d }) => d < Math.max(CROWD_RANGE, BOARD_RANGE))
      .sort((a, b) => a.d - b.d);
    const live = near.filter(({ d }) => d < CROWD_RANGE).slice(0, CROWD_PLATFORMS).map(({ p }) => p);
    for (const key of [...this.crowds.keys()]) if (!live.some((p) => p.key === key)) this.crowds.delete(key);
    this.people.length = 0;
    for (const platform of live) {
      let crowd = this.crowds.get(platform.key);
      if (!crowd) {
        crowd = new StationCrowd(crowdSpec(platform));
        this.crowds.set(platform.key, crowd);
      }
      const standing = this.standingAt(platform, trains);
      const flowsBefore = new Map([...crowd.flows].map(([id, f]) => [id, { boarded: f.boarded, alighted: f.alighted }]));
      crowd.step(step, waitingCount(this.hour, platform.busy), standing);
      // Who got on and off changes the train's load.
      for (const [id, flow] of crowd.flows) {
        const before = flowsBefore.get(id) ?? { boarded: 0, alighted: 0 };
        const load = this.loads.get(id) ?? initialLoad(id);
        this.loads.set(id, Math.max(0, load + (flow.boarded - before.boarded) - (flow.alighted - before.alighted)));
      }
      this.placePeople(platform, crowd, at);
    }
    // Forget trains no longer on the line.
    if (this.loads.size > 64) {
      const running = new Set(trains.map((t) => t.id));
      for (const id of [...this.loads.keys()]) if (!running.has(id)) this.loads.delete(id);
    }
    for (const id of [...this.doorCache.keys()]) if (!trains.some((t) => id.startsWith(`${t.id}@`) && t.state.stoppedAt !== null)) this.doorCache.delete(id);
    // Only the nearest people are drawn (the triangle budget near busy stations; TD-23).
    if (this.people.length > PEOPLE_MAX) {
      this.people.sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z));
      this.people.length = PEOPLE_MAX;
    }
    this.figures?.place(this.people);
    // The departure board and clock at the nearest platform.
    const board = near.find(({ d }) => d < BOARD_RANGE)?.p ?? null;
    this.livePlatform = board;
    this.life.show(board, board ? boardText(board, this.viewClock, this.hour) : [], this.hour);
  }

  /** Trains standing at a platform now, with their doorways in its frame. */
  private standingAt(platform: StationPlatform, trains: readonly TrainAt[]): CrowdTrain[] {
    const out: CrowdTrain[] = [];
    platform.services.forEach((service, index) => {
      const train = trains.find((t) => t.line.id === service.line.id && t.state.stoppedAt === service.stop);
      if (!train) return;
      const key = `${train.id}@${platform.key}`;
      let doors = this.doorCache.get(key);
      if (!doors) {
        const list: Array<{ u: number; w: number }> = [];
        const centre = platformCentre(platform);
        for (const coach of this.coaches(train)) {
          const side = platformSide(coach, centre);
          const cos = Math.cos(coach.yaw);
          const sin = Math.sin(coach.yaw);
          for (const z of coachDoorways(coach.cab)) {
            const x = side * (COACH_WIDTH / 2 + 0.3);
            const p = { x: coach.x + x * cos + z * sin, z: coach.z - x * sin + z * cos };
            const hit = platform.line.path.project(p);
            const u = hit.s - platform.stop.s;
            // Only doorways alongside the platform's deck.
            if (Math.abs(u) > PLATFORM_LENGTH / 2 - 1) continue;
            list.push({ u, w: service.edge });
          }
        }
        doors = list;
        this.doorCache.set(key, doors);
      }
      out.push({ id: train.id, service: index, doors, open: doorOpenness(train.state, train.line.profile.spec.dwell), dwellLeft: train.state.dwellLeft, load: this.loads.get(train.id) ?? initialLoad(train.id) });
    });
    return out;
  }

  /** The crowd's people in the world, standing on the deck; and the tea seller behind the counter. */
  private placePeople(platform: StationPlatform, crowd: StationCrowd, at: { x: number; z: number }): void {
    const path = platform.line.path;
    const put = (u: number, w: number, heading: number, walked: number | null, look: number) => {
      const s = platform.stop.s + u;
      const p = path.beside(s, w);
      // Far down a platform people are a few pixels tall: not drawn (they are still there).
      if (Math.hypot(p.x - at.x, p.z - at.z) > PEOPLE_DRAWN) return;
      const pose = path.at(s);
      // Heading in the platform frame: from +u (the line's direction) towards +w (its left).
      const fx = -Math.sin(pose.yaw);
      const fz = -Math.cos(pose.yaw);
      const lx = -fz;
      const lz = fx;
      const dx = fx * Math.cos(heading) + lx * Math.sin(heading);
      const dz = fz * Math.cos(heading) + lz * Math.sin(heading);
      this.people.push({ x: p.x, y: PLATFORM_HEIGHT, z: p.z, yaw: Math.atan2(-dx, -dz), walked, look });
    };
    for (const person of crowd.people) {
      if (person.delay > 0) continue;
      put(person.u, person.w, person.heading, person.state === "waiting" ? null : person.walked, person.look);
    }
    const tea = stallAt(platform);
    // Facing out over the counter: towards -w when the counter faces -w.
    put(tea.u - 0.2, tea.w + tea.facing * 0.2, tea.facing > 0 ? Math.PI / 2 : -Math.PI / 2, null, 2);
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
      station: this.stationSnapshot(at),
      wheelsets: this.trains.wheelsets,
    };
  }

  private stationSnapshot(at: { x: number; z: number }): StationSnapshot | null {
    // The crowd of the platform nearest the player.
    let best: { platform: StationPlatform; crowd: StationCrowd } | null = null;
    let bestDistance = Infinity;
    for (const platform of this.platforms) {
      const crowd = this.crowds.get(platform.key);
      if (!crowd) continue;
      const c = platformCentre(platform);
      const d = Math.hypot(c.x - at.x, c.z - at.z);
      if (d < bestDistance) {
        bestDistance = d;
        best = { platform, crowd };
      }
    }
    if (!best) return null;
    const { platform, crowd } = best;
    const count = (state: string) => crowd.people.filter((p) => p.state === state).length;
    const standing = this.standingAt(platform, this.network.trains(this.viewClock))[0] ?? null;
    const flow = standing ? crowd.flows.get(standing.id) : undefined;
    return {
      station: platform.station.name,
      platform: platform.key,
      waiting: count("waiting"),
      boarding: count("boarding"),
      alighting: count("alighting"),
      train: standing ? { id: standing.id, onTrain: this.loads.get(standing.id) ?? initialLoad(standing.id), boarded: flow?.boarded ?? 0, alighted: flow?.alighted ?? 0, board: flow?.board ?? 0, alight: flow?.alight ?? 0 } : null,
      board: this.livePlatform === platform ? this.life.lines : [],
      drawn: this.figures?.drawn ?? 0,
      crowdTriangles: (this.figures?.drawn ?? 0) * (this.figures?.trianglesEach ?? 0),
      people: crowd.people
        .filter((p) => p.delay <= 0)
        .map((p) => {
          const at = platform.line.path.beside(platform.stop.s + p.u, p.w);
          return { x: Math.round(at.x * 100) / 100, y: PLATFORM_HEIGHT, z: Math.round(at.z * 100) / 100 };
        }),
      announcements: this.announcements,
      horns: this.horns,
    };
  }
}

/** The middle of a platform's deck, in the world. */
function platformCentre(p: StationPlatform): { x: number; z: number } {
  return p.line.path.beside(p.stop.s, platformMiddle(p));
}

/** How the crowd of a platform is laid out: its edges, exits, and where nobody stands. */
function crowdSpec(p: StationPlatform): ConstructorParameters<typeof StationCrowd>[0] {
  const blocked: Array<readonly [number, number]> = [];
  if (!p.island) {
    // On a narrow side platform people keep clear of the FOB's stairs and the tea stall.
    const [u0, u1] = platformStair(p);
    blocked.push([u0 - 1, u1 + 1]);
    const tea = stallAt(p);
    blocked.push([tea.u - 2, tea.u + 2]);
  }
  return {
    half: PLATFORM_LENGTH / 2,
    edges: p.services.map((s) => ({ w: s.edge, inward: s.inward })),
    exits: p.exits,
    middle: platformMiddle(p),
    key: p.key,
    depth: p.island ? 3 : 2.1,
    blocked,
  };
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
