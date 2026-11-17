/**
 * The suburban railway in the game: tracks and stations drawn near the player, timetabled
 * trains (models for the ones in sight, solid kinematic coaches for the ones close by), and
 * riding: BOARD at a platform when a train stands there (a ₹5 ticket), the camera follows the
 * train, the panel shows the next station, STEP OFF at a stop. A ride towards the map's edge
 * ends at the last station on the map. The rules live in `@cow/rail`; this module connects them
 * to the renderer, physics, player and HUD, like `Population` does for the AI.
 */
import type * as THREE from "three";
import { COACH_HEIGHT, COACH_LENGTH, COACH_WIDTH, RAIL_TOP, RailView, TrainView, type ChaseTarget, type CoachPose, type FollowCamera } from "@cow/game-engine";
import type { KinematicBox, PhysicsWorld, StaticBox } from "@cow/physics";
import type { HumanFigure, PlayerController } from "@cow/player";
import { FARE, PLATFORM_HEIGHT, PLATFORM_LENGTH, RailNetwork, boarding, canStepOff, platformOf, platformOffset, rideEndsAt, stopAt, type RailFile, type RailLine, type TrainAt } from "@cow/rail";
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
}

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
    scene.add(this.view.object, this.trains.object);
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
    const train = this.current();
    if (!train) return null;
    const p = train.line.path.at(train.state.s);
    return { x: p.x, y: RAIL_TOP + COACH_HEIGHT - 1.2, z: p.z };
  }

  /** For the chase camera while riding. */
  rideChase(): ChaseTarget | null {
    const train = this.current();
    if (!train) return null;
    const pose = train.line.path.at(train.state.s);
    const v = train.state.speed;
    return { velocity: { x: -Math.sin(pose.yaw) * v, z: -Math.cos(pose.yaw) * v }, heading: pose.yaw, forwardSpeed: v, topSpeed: 22 };
  }

  /** One physics step: the clock, the solid coaches near `at`, and the end of a ride. */
  fixedUpdate(dt: number, at: { x: number; z: number }): void {
    this.clock += dt;
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
    const { player, avatar, camera } = this.host;
    player.body.setEnabled(false);
    avatar.visible = false;
    camera.reach = 15;
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

  /** Off the train onto its platform, beside the middle coach. */
  private alight(train: TrainAt): void {
    const line = train.line;
    const stop = line.stops[train.state.stoppedAt ?? 0]!;
    const s = Math.max(stop.s - PLATFORM_LENGTH / 2 + 5, Math.min(stop.s + PLATFORM_LENGTH / 2 - 5, train.state.s));
    const spot = line.path.beside(s, stop.side * platformOffset(stop));
    const facing = line.path.at(s).yaw + (stop.side > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.endRide({ x: spot.x, y: PLATFORM_HEIGHT + 0.05, z: spot.z, yaw: facing });
  }

  /** Leave the ride; with a place, the player stands there, else (teleport, new game) wherever the game puts them. */
  endRide(at: { x: number; y: number; z: number; yaw: number } | null): void {
    if (!this.ride) return;
    this.ride = null;
    const { player, avatar, camera } = this.host;
    player.body.setEnabled(true);
    if (at) player.respawn({ x: at.x, y: at.y, z: at.z }, at.yaw);
    if (at) camera.yaw = at.yaw;
    avatar.visible = true;
    camera.reach = 5.6;
    this.host.door();
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
    };
  }
}
