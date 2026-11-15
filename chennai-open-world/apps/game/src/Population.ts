/**
 * The city's other inhabitants: AI traffic and pedestrians. The decisions are made by
 * `@cow/ai`; this module gives each agent a body (so the player's vehicle collides with it)
 * and a model, and keeps them in step.
 */
import type * as THREE from "three";
import { AgentSystem, buildRoadGraph, pedestrianSettings, trafficSettings, type Obstacle } from "@cow/ai";
import type { WorldMap } from "@cow/game-world";
import type { KinematicBox, PhysicsWorld } from "@cow/physics";
import type { HumanAssets, HumanFigure } from "@cow/player";
import { TrafficCar } from "@cow/vehicles";

const CAR_COLORS = [0xb8bcc4, 0x2b3f6b, 0x7a1f1f, 0xe6e2d6, 0x30343a, 0x3d6b4f, 0x8a6a2f];
const CLOTHES = [0xffffff, 0x9fb8e0, 0xe0c29f, 0xa9d6a9, 0xd9a0a0, 0xc9c9c9, 0xe6dd9a, 0xb7a3d6];

/** Pedestrians further than this from the player are not drawn, metres. */
const PEOPLE_VISIBLE = 90;

interface Driver {
  readonly car: TrafficCar;
  readonly body: KinematicBox;
  generation: number;
}
interface Walker {
  readonly figure: HumanFigure;
  readonly body: KinematicBox;
  generation: number;
}

export class Population {
  private readonly traffic: AgentSystem;
  private readonly walkers: AgentSystem;
  private readonly drivers: Driver[] = [];
  private readonly people: Walker[] = [];
  private readonly trafficObstacles: Obstacle[] = [];

  constructor(map: WorldMap, scene: THREE.Object3D, physics: PhysicsWorld, humans: HumanAssets, focus: { x: number; z: number }, counts: { traffic: number; pedestrians: number }) {
    // Vehicles keep to real carriageways; small service lanes are left to the player.
    const driveGraph = buildRoadGraph(map, (road) => road.kind !== "footway" && road.kind !== "service");
    const walkGraph = buildRoadGraph(map, (road) => road.kind !== "service", false);
    this.traffic = new AgentSystem(driveGraph, map.bounds, trafficSettings(counts.traffic), 2026);
    this.walkers = new AgentSystem(walkGraph, map.bounds, pedestrianSettings(counts.pedestrians), 600040);
    this.traffic.populate(focus);
    this.walkers.populate(focus);

    for (const agent of this.traffic.agents) {
      const car = new TrafficCar(agent.variation < 0.7 ? "car" : "auto", CAR_COLORS[agent.id % CAR_COLORS.length]!);
      scene.add(car.object);
      this.drivers.push({ car, body: physics.createKinematicBox(car.type.physics.halfExtents), generation: -1 });
    }
    for (const agent of this.walkers.agents) {
      const figure = humans.create(CLOTHES[agent.id % CLOTHES.length]!, true);
      scene.add(figure.object);
      this.people.push({ figure, body: physics.createKinematicBox({ x: 0.25, y: 0.85, z: 0.25 }), generation: -1 });
    }
  }

  get trafficCount(): number {
    return this.drivers.length;
  }

  get pedestrianCount(): number {
    return this.people.length;
  }

  /** Positions of the AI vehicles, for the minimap and tests. */
  trafficPositions(): Array<{ x: number; z: number; speed: number }> {
    return this.traffic.agents.map((a) => ({ x: a.x, z: a.z, speed: a.speed }));
  }

  /**
   * One fixed step.
   * @param player where the player is, and how much room they take up
   * @param parked the player's vehicles, which traffic must drive round or wait behind
   */
  fixedUpdate(dt: number, player: Obstacle, parked: readonly Obstacle[]): void {
    // Traffic gives way to the player, parked vehicles and people on the road.
    this.trafficObstacles.length = 0;
    this.trafficObstacles.push(player, ...parked);
    for (const walker of this.walkers.agents) this.trafficObstacles.push({ x: walker.x, z: walker.z, radius: 0.4 });
    this.traffic.update(dt, this.trafficObstacles, player);
    // Pedestrians only step round the player.
    this.walkers.update(dt, [player], player);

    this.traffic.agents.forEach((agent, i) => {
      const driver = this.drivers[i]!;
      const y = driver.car.type.rideHeight;
      if (agent.generation !== driver.generation) {
        driver.generation = agent.generation;
        driver.body.teleport(agent.x, y, agent.z, agent.heading);
      } else {
        driver.body.moveTo(agent.x, y, agent.z, agent.heading);
      }
    });
    this.walkers.agents.forEach((agent, i) => {
      const walker = this.people[i]!;
      if (agent.generation !== walker.generation) {
        walker.generation = agent.generation;
        walker.body.teleport(agent.x, 0.87, agent.z, agent.heading);
      } else {
        walker.body.moveTo(agent.x, 0.87, agent.z, agent.heading);
      }
    });
  }

  /** Once per rendered frame: place the models and advance the walk animations. */
  frame(dt: number, viewer: { x: number; z: number }): void {
    this.traffic.agents.forEach((agent, i) => this.drivers[i]!.car.sync(dt, agent.x, agent.z, agent.heading, agent.speed, agent.generation));
    this.walkers.agents.forEach((agent, i) => {
      const { figure } = this.people[i]!;
      // Animated people are the most expensive thing to draw: only those close enough to be
      // seen clearly are shown and animated.
      figure.visible = Math.hypot(agent.x - viewer.x, agent.z - viewer.z) < PEOPLE_VISIBLE;
      if (!figure.object.visible) return;
      figure.object.position.set(agent.x, 0, agent.z);
      figure.object.rotation.y = agent.heading;
      figure.update(dt, agent.speed, true);
    });
  }
}
