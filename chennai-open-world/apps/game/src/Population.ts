/**
 * The city's other inhabitants: AI traffic and pedestrians. The decisions are made by
 * `@cow/ai`; this module gives each agent a body (so the player's vehicle collides with it)
 * and a model, and keeps them in step. It also owns the traffic signals the AI obeys and their
 * models (`SignalView`), and sets how many agents are out from the time of day and the area.
 */
import type * as THREE from "three";
import {
  AgentSystem,
  TRAFFIC_KINDS,
  TrafficSignals,
  areaBusyness,
  buildRoadGraph,
  edgeBusyness,
  pedestrianDensity,
  pedestrianSettings,
  trafficDensity,
  trafficSettings,
  type AgentKind,
  type Obstacle,
  type RoadGraph,
  type Siren,
  type Walker as Spot,
} from "@cow/ai";
import { Casualties, PEDESTRIAN_HIT, hitOutcome, restingSpot, speedKept, vehicleTouches, type CasualtyState, type HitOutcome, type VehicleMotion } from "@cow/combat";
import { SignalView } from "@cow/game-engine";
import type { WorldMap } from "@cow/game-world";
import type { KinematicBox, PhysicsWorld, VehicleBody } from "@cow/physics";
import type { HumanAssets, HumanFigure } from "@cow/player";
import { TrafficCar, VEHICLE_TYPES, type VehicleKind } from "@cow/vehicles";

/** Autos are yellow, as in Chennai (the parked autos use the same colour, `content.ts`). */
const AUTO_YELLOW = 0xf5c400;
const CAR_COLORS = [0xb8bcc4, 0x2b3f6b, 0x7a1f1f, 0xe6e2d6, 0x30343a, 0x3d6b4f, 0x8a6a2f];
const CLOTHES = [0xffffff, 0x9fb8e0, 0xe0c29f, 0xa9d6a9, 0xd9a0a0, 0xc9c9c9, 0xe6dd9a, 0xb7a3d6];

/**
 * Shirt tints for drivers. Chennai auto drivers wear a khaki uniform shirt; others vary.
 * The tint multiplies the model's clothing colour (`HumanAssets.create`).
 */
const AUTO_DRIVER = 0xd9c08f;
const DRIVER_CLOTHES = [0xffffff, 0x9fb8e0, 0xc9c9c9, 0xa9d6a9];
/** Drivers further than this from the player are not drawn (each is a few draw calls), metres. */
const DRIVERS_VISIBLE = 40;

/** Pedestrians further than this from the player are not drawn, metres. */
const PEOPLE_VISIBLE = 90;
/** Put-away agents' bodies wait this far below the street, metres. */
const PARKED_Y = -200;
/** Half the side of the square of roads the AI works on, and how far the player may move before it is rebuilt, metres. */
const AREA_HALF = 1200;
const AREA_REBUILD = 500;
/** Signal models are drawn within this distance, and rebuilt when the player has moved this far. */
const SIGNAL_REACH = 420;
const SIGNAL_REBUILD = 150;
/** How often the number of agents out is worked out again, seconds. */
const DENSITY_EVERY = 1;
/** The area around the player that sets how busy it is, metres. */
const AREA_RADIUS = 250;

/** Room a person lying on the road takes up, for traffic to stop short of, metres. */
const LYING_RADIUS = 1.0;
/** A person is also caught by a vehicle this many seconds of travel ahead of touching it. */
const HIT_LEAD = 1 / 30;

/** The player's vehicle, for hitting pedestrians. */
export interface DrivenVehicle extends VehicleMotion {
  readonly mass: number;
  /** Its body, so the wall check ignores it. */
  readonly body: VehicleBody;
}

/** The player's vehicle hit someone. */
export interface PedestrianHit {
  readonly outcome: HitOutcome;
  /** Impact speed, m/s. */
  readonly speed: number;
  readonly x: number;
  readonly z: number;
  /** Share of its speed the vehicle keeps. */
  readonly keep: number;
}

interface Driver {
  readonly car: TrafficCar;
  readonly body: KinematicBox;
  generation: number;
}
interface Walker {
  readonly figure: HumanFigure;
  readonly body: KinematicBox;
  generation: number;
  /** Height the body was last put at (it is put away below the street while the person lies down). */
  y: number;
}

const isVehicleKind = (name: string): name is VehicleKind => name in VEHICLE_TYPES;

/** The AI's traffic mix, with each kind's footprint taken from its vehicle model. */
function trafficKinds(): AgentKind[] {
  return TRAFFIC_KINDS.filter((kind) => isVehicleKind(kind.name)).map((kind) => {
    const half = VEHICLE_TYPES[kind.name as VehicleKind].physics.halfExtents;
    return { ...kind, halfWidth: half.x, halfLength: half.z };
  });
}

export class Population {
  private readonly traffic: AgentSystem;
  private readonly walkers: AgentSystem;
  private readonly drivers: Driver[] = [];
  private readonly people: Walker[] = [];
  private readonly trafficObstacles: Obstacle[] = [];
  private readonly walkerSpots: Spot[] = [];
  /** People the player has hit, by agent id (`@cow/combat` rules). */
  private readonly casualties = new Casualties();
  private readonly physics: PhysicsWorld;
  /**
   * Road graphs, spawn weights and signals for the area round the player (AREA_HALF each way),
   * not the whole city: about a twentieth of the memory. Rebuilt when the player moves
   * AREA_REBUILD from the centre; agents keep their road (`AgentSystem.rebase`) and the signal
   * clock carries on, so nothing on screen changes.
   */
  private driveGraph: RoadGraph;
  private busyness: Float32Array;
  private areaCentre: { x: number; z: number };
  /** Traffic signals at the main junctions of the area, which the AI traffic obeys. */
  signals: TrafficSignals;
  /** Graphs, busyness and signals for the roads within AREA_HALF of a point. */
  private areaGraphs(at: { x: number; z: number }): { drive: RoadGraph; walk: RoadGraph; busyness: Float32Array; walkBusyness: Float32Array; signals: TrafficSignals } {
    const box = { minX: at.x - AREA_HALF, maxX: at.x + AREA_HALF, minZ: at.z - AREA_HALF, maxZ: at.z + AREA_HALF };
    const inside = (p: { x: number; z: number }) => p.x >= box.minX && p.x <= box.maxX && p.z >= box.minZ && p.z <= box.maxZ;
    const roads = this.map.roads.filter((road) => road.points.some(inside));
    const pois = this.map.pois.filter(inside);
    const local: WorldMap = { ...this.map, roads, pois };
    // Vehicles keep to real carriageways; small service lanes are left to the player.
    const drive = buildRoadGraph(local, (road) => road.kind !== "footway" && road.kind !== "service");
    const walk = buildRoadGraph(local, (road) => road.kind !== "service", false);
    return {
      drive,
      walk,
      // Busier on the main avenues and round the shops, by the map's own road classes and POIs.
      busyness: edgeBusyness(drive, pois),
      walkBusyness: edgeBusyness(walk, pois),
      // Signals at main-road junctions, and wherever OSM maps a traffic signal.
      signals: new TrafficSignals(drive, undefined, (this.map.signals ?? []).filter(inside)),
    };
  }

  /** Rebuild the area's graphs once the player is far enough from its centre. */
  private followArea(focus: { x: number; z: number }): void {
    if (Math.hypot(focus.x - this.areaCentre.x, focus.z - this.areaCentre.z) < AREA_REBUILD) return;
    const area = this.areaGraphs(focus);
    // Open sea, or a corner with no roads: keep the old area.
    if (area.drive.edges.length === 0) return;
    this.areaCentre = { x: focus.x, z: focus.z };
    area.signals.time = this.signals.time;
    this.driveGraph = area.drive;
    this.busyness = area.busyness;
    this.signals = area.signals;
    this.traffic.rebase(area.drive, focus);
    this.traffic.setSpawnWeights(area.busyness);
    this.traffic.useSignals(area.signals);
    this.walkers.rebase(area.walk, focus);
    this.walkers.setSpawnWeights(area.walkBusyness);
    // Signal models belong to the old area's signal list.
    this.signalCentre = { x: Infinity, z: Infinity };
  }

  /** Signal models near the player only (the city has thousands); rebuilt as the player moves. */
  private signalView: SignalView;
  /** Indices into `signals.approaches` of the heads `signalView` draws. */
  private shownApproaches: number[] = [];
  private signalCentre = { x: 0, z: 0 };
  private readonly scene: THREE.Object3D;
  private readonly map: WorldMap;
  private hour: number | null = null;
  private sinceDensity = DENSITY_EVERY;
  private firstDensity = true;

  constructor(map: WorldMap, scene: THREE.Object3D, physics: PhysicsWorld, humans: HumanAssets, focus: { x: number; z: number }, counts: { traffic: number; pedestrians: number }) {
    this.map = map;
    this.physics = physics;
    this.areaCentre = { x: focus.x, z: focus.z };
    const area = this.areaGraphs(focus);
    this.driveGraph = area.drive;
    this.traffic = new AgentSystem(area.drive, map.bounds, trafficSettings(counts.traffic, trafficKinds()), 2026);
    this.walkers = new AgentSystem(area.walk, map.bounds, pedestrianSettings(counts.pedestrians), 600040);
    this.busyness = area.busyness;
    this.traffic.setSpawnWeights(area.busyness);
    this.walkers.setSpawnWeights(area.walkBusyness);
    this.signals = area.signals;
    this.traffic.useSignals(this.signals);
    this.traffic.populate(focus);
    this.walkers.populate(focus);

    this.scene = scene;
    this.signalView = this.signalsNear(focus);

    for (const agent of this.traffic.agents) {
      const name = this.traffic.kinds[agent.kind]!.name;
      const kind = isVehicleKind(name) ? name : "car";
      const car = new TrafficCar(kind, kind === "auto" ? AUTO_YELLOW : CAR_COLORS[agent.id % CAR_COLORS.length]!);
      // Every moving vehicle has someone at the wheel (a baked seated person, shared per shirt).
      car.setDriver(humans.seatedStatic(kind === "auto" ? AUTO_DRIVER : DRIVER_CLOTHES[agent.id % DRIVER_CLOTHES.length]!));
      scene.add(car.object);
      this.drivers.push({ car, body: physics.createKinematicBox(car.type.physics.halfExtents), generation: -1 });
    }
    for (const agent of this.walkers.agents) {
      const figure = humans.create(CLOTHES[agent.id % CLOTHES.length]!, true);
      scene.add(figure.object);
      this.people.push({ figure, body: physics.createKinematicBox({ x: 0.25, y: 0.85, z: 0.25 }), generation: -1, y: PARKED_Y });
    }
  }

  /** AI vehicles out on the streets now. */
  get trafficCount(): number {
    return this.traffic.activeCount;
  }

  /** How many AI vehicles the time of day and the area call for. */
  get trafficWanted(): number {
    return this.traffic.wantedCount;
  }

  /** People out walking now. */
  get pedestrianCount(): number {
    return this.walkers.activeCount;
  }

  /** People the player has hit and what became of them, for tests and debugging. */
  casualtyList(): Array<{ x: number; z: number; state: CasualtyState; speed: number }> {
    return this.casualties.list().map((c) => {
      const agent = this.walkers.agents[c.id]!;
      return { x: agent.x, z: agent.z, state: c.state, speed: agent.speed };
    });
  }

  /**
   * Tests and debugging only: hold a pedestrian standing still at a point, facing `heading`,
   * until a vehicle hits them. Returns false when nobody is free.
   */
  stagePedestrian(x: number, z: number, heading: number): boolean {
    const agent = this.walkers.agents.find((a) => a.active && !this.walkers.isHeld(a) && !this.casualties.get(a.id));
    if (!agent) return false;
    this.walkers.hold(agent);
    this.walkers.moveAgent(agent, x, z, heading);
    return true;
  }

  /** Signalled junctions on the map. */
  get signalCount(): number {
    return this.signals.junctions.length;
  }

  /** AI vehicles held at a red light or a busy crossing (or queued behind one). */
  get waitingAtSignals(): number {
    return this.traffic.agents.filter((a) => a.active && a.atSignal).length;
  }

  /**
   * Time of day, 0 to 24: sets how many vehicles and people are out (rush hours are busiest,
   * late night quiet). Call every step; it is cheap.
   */
  setHour(hour: number): void {
    this.hour = hour;
  }

  /** Positions of the AI vehicles on the streets, for the minimap and tests. */
  trafficPositions(): Array<{ x: number; z: number; speed: number; kind: string }> {
    return this.traffic.agents.filter((a) => a.active).map((a) => ({ x: a.x, z: a.z, speed: a.speed, kind: this.traffic.kinds[a.kind]!.name }));
  }

  /** Work out how many agents should be out, now and then. */
  private density(dt: number, focus: { x: number; z: number }): void {
    if (this.hour === null) return;
    this.sinceDensity += dt;
    if (this.sinceDensity < DENSITY_EVERY) return;
    this.sinceDensity = 0;
    const area = areaBusyness(this.driveGraph, this.busyness, focus, AREA_RADIUS);
    const cars = this.traffic.agents.length;
    const people = this.walkers.agents.length;
    // Even at 3 a.m. the odd vehicle and walker.
    this.traffic.setActiveCount(Math.max(Math.min(2, cars), cars * trafficDensity(this.hour) * area), this.firstDensity);
    this.walkers.setActiveCount(Math.max(Math.min(2, people), people * pedestrianDensity(this.hour)), this.firstDensity);
    this.firstDensity = false;
  }

  /**
   * One fixed step.
   * @param focus where the player is
   * @param player the room the player (or their vehicle) takes up
   * @param parked the player's vehicles, which traffic must drive round or wait behind
   * @param siren the player's ambulance while its siren is on: traffic pulls over
   * @param driven the player's vehicle, which can hit pedestrians
   * @returns the pedestrians the player's vehicle hit this step
   */
  fixedUpdate(dt: number, focus: { x: number; z: number }, player: readonly Obstacle[], parked: readonly Obstacle[], siren: Siren | null = null, driven: DrivenVehicle | null = null): PedestrianHit[] {
    this.followArea(focus);
    this.density(dt, focus);
    // Traffic gives way to the player, parked vehicles and people on the road.
    this.trafficObstacles.length = 0;
    this.walkerSpots.length = 0;
    this.trafficObstacles.push(...player, ...parked);
    for (const walker of this.walkers.agents) {
      if (!walker.active) continue;
      // Someone lying on the road takes up more room; traffic stops short of them.
      this.trafficObstacles.push({ x: walker.x, z: walker.z, radius: this.casualties.isDown(walker.id) ? LYING_RADIUS : 0.4 });
      this.walkerSpots.push(walker);
    }
    // Traffic doesn't run over the player on a crossing either.
    this.walkerSpots.push(...player);
    this.signals.update(dt, this.walkerSpots);
    this.traffic.update(dt, this.trafficObstacles, focus, siren);
    // Pedestrians only step round the player.
    this.walkers.update(dt, player, focus);
    this.tendCasualties(dt, focus);
    const hits = driven ? this.runOver(driven) : [];

    this.traffic.agents.forEach((agent, i) => {
      const driver = this.drivers[i]!;
      const y = agent.active ? driver.car.type.rideHeight : PARKED_Y;
      if (agent.generation !== driver.generation) {
        driver.generation = agent.generation;
        driver.body.teleport(agent.x, y, agent.z, agent.heading);
      } else if (agent.active) {
        driver.body.moveTo(agent.x, y, agent.z, agent.heading);
      }
    });
    this.walkers.agents.forEach((agent, i) => {
      const walker = this.people[i]!;
      // Someone lying on the road is no wall: the player's vehicle rolls past (TD-8 vehicles can't climb).
      const y = agent.active && !this.casualties.isDown(agent.id) ? 0.87 : PARKED_Y;
      if (agent.generation !== walker.generation || y !== walker.y) {
        walker.generation = agent.generation;
        walker.y = y;
        walker.body.teleport(agent.x, y, agent.z, agent.heading);
      } else if (agent.active) {
        walker.body.moveTo(agent.x, y, agent.z, agent.heading);
      }
    });
    return hits;
  }

  /** Timers of the people hit: getting up and limping off, or being removed. */
  private tendCasualties(dt: number, focus: { x: number; z: number }): void {
    const agents = this.walkers.agents;
    for (const change of this.casualties.update(dt, (id) => Math.hypot(agents[id]!.x - focus.x, agents[id]!.z - focus.z))) {
      const agent = agents[change.id]!;
      if (change.type === "getsUp") {
        this.walkers.letGo(agent);
        this.walkers.slow(agent, PEDESTRIAN_HIT.limpSpeed, PEDESTRIAN_HIT.limpFor);
      } else if (change.type === "remove") {
        // Respawns elsewhere, out of sight, like any recycled pedestrian.
        this.walkers.letGo(agent, focus);
      }
    }
  }

  /** Pedestrians the player's vehicle touches this step: knocked aside or down (`@cow/combat` rules). */
  private runOver(vehicle: DrivenVehicle): PedestrianHit[] {
    const speed = Math.hypot(vehicle.vx, vehicle.vz);
    const outcome = hitOutcome(speed);
    if (!outcome) return [];
    const hits: PedestrianHit[] = [];
    for (const agent of this.walkers.agents) {
      if (!agent.active || !this.casualties.canHit(agent.id)) continue;
      if (Math.hypot(agent.x - vehicle.x, agent.z - vehicle.z) > vehicle.halfLength + vehicle.halfWidth + 2) continue;
      if (!vehicleTouches(vehicle, agent.x, agent.z, HIT_LEAD)) continue;
      const rest = restingSpot(vehicle, agent.x, agent.z, outcome);
      // Not through a wall: stop 0.4 m short of anything solid on the way. The ray starts
      // 0.4 m out, outside the person's own collision box.
      const wall = rest.distance > 0.4 ? this.physics.raycast({ x: agent.x + rest.dx * 0.4, y: 0.5, z: agent.z + rest.dz * 0.4 }, { x: rest.dx, y: 0, z: rest.dz }, rest.distance, vehicle.body) : null;
      const distance = wall === null ? rest.distance : Math.max(0, wall);
      const hitX = agent.x;
      const hitZ = agent.z;
      const x = hitX + rest.dx * distance;
      const z = hitZ + rest.dz * distance;
      if (outcome === "stumble") {
        // Knocked aside: steps away, keeps their heading, and walks on.
        this.walkers.letGo(agent);
        this.walkers.moveAgent(agent, x, z);
      } else {
        this.walkers.hold(agent);
        // Lies along the direction they were thrown.
        this.walkers.moveAgent(agent, x, z, Math.atan2(-rest.dx, -rest.dz));
      }
      this.casualties.hit(agent.id, outcome);
      // Everyone nearby stops and steps back, or runs off.
      this.walkers.scare(hitX, hitZ, PEDESTRIAN_HIT.scareRadius, PEDESTRIAN_HIT.scareFor);
      hits.push({ outcome, speed, x: hitX, z: hitZ, keep: speedKept(vehicle.mass) });
    }
    return hits;
  }

  /** Once per rendered frame: place the models, advance the walk animations, light the signals. */
  frame(dt: number, viewer: { x: number; z: number }): void {
    this.traffic.agents.forEach((agent, i) => {
      const { car } = this.drivers[i]!;
      car.object.visible = agent.active;
      if (!agent.active) return;
      car.sync(dt, agent.x, agent.z, agent.heading, agent.speed, agent.generation);
      car.driverVisible = Math.hypot(agent.x - viewer.x, agent.z - viewer.z) < DRIVERS_VISIBLE;
    });
    this.walkers.agents.forEach((agent, i) => {
      const { figure } = this.people[i]!;
      // Animated people are the most expensive thing to draw: only those close enough to be
      // seen clearly are shown and animated.
      figure.visible = agent.active && Math.hypot(agent.x - viewer.x, agent.z - viewer.z) < PEOPLE_VISIBLE;
      if (!figure.object.visible) return;
      figure.object.position.set(agent.x, 0, agent.z);
      figure.object.rotation.y = agent.heading;
      figure.setDown(this.casualties.isDown(agent.id));
      figure.update(dt, agent.speed, true);
    });
    if (Math.hypot(viewer.x - this.signalCentre.x, viewer.z - this.signalCentre.z) > SIGNAL_REBUILD) {
      this.scene.remove(this.signalView.object);
      this.signalView.dispose();
      this.signalView = this.signalsNear(viewer);
    }
    const { approaches } = this.signals;
    const shown = this.shownApproaches;
    this.signalView.update((i) => this.signals.lightFor(approaches[shown[i]!]!));
  }

  /** Models for the signal heads within SIGNAL_REACH of a point. */
  private signalsNear(at: { x: number; z: number }): SignalView {
    this.signalCentre = { x: at.x, z: at.z };
    const near = this.signals.approaches.filter((a) => Math.hypot(a.x - at.x, a.z - at.z) < SIGNAL_REACH);
    this.shownApproaches = near.map((a) => a.index);
    const view = new SignalView(near, near.map((a) => a.crossing));
    this.scene.add(view.object);
    return view;
  }

  /** Signal heads drawn now (the ones near the player). */
  get signalHeadsShown(): number {
    return this.shownApproaches.length;
  }
}
