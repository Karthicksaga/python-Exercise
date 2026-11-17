/**
 * The police: cars that chase the player along the roads, officers who get out and approach on
 * foot, the wanted stars on the HUD, police on the minimap and their siren.
 *
 * The rules (what counts as a crime, how the level rises and falls, when the player is busted)
 * are pure and unit-tested in `@cow/combat` (`Wanted.ts`); the route finding is `@cow/ai`
 * (`Pursuit.ts`). Officers on foot are ordinary `Combat` enemies in "police:…" groups, so the
 * player's punches and pistol work on them and, from three stars, they shoot with the same
 * rules as any armed enemy; `Fighters` draws them in a khaki uniform.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Pursuer, findRoute, nearestNode, routeLength, type Obstacle, type RoadGraph, type Siren } from "@cow/ai";
import type { Sound } from "@cow/audio";
import { POLICE_GROUP, WANTED, Wanted, isPoliceGroup, isVehicleTheft, jobsAllowed, policeUnits, type Combat, type Crime, type Enemy, type HitOutcome } from "@cow/combat";
import { nearestRoadPoint, type WorldMap } from "@cow/game-world";
import type { CharacterBody, KinematicBox, PhysicsWorld, VehicleBody } from "@cow/physics";
import { WantedStars, type MinimapMarker } from "@cow/ui";
import { TrafficCar, VEHICLE_TYPES } from "@cow/vehicles";

/**
 * The player's own vehicles (ids from `content.ts`): taking these is never theft. Everything
 * else parked round the city belongs to someone, unless a job or story step asks for its kind.
 */
const OWN_VEHICLES = ["car-start", "bike-start", "auto-park"];

/** Tuning, game-design estimates. */
const POLICE = {
  /**
   * The first car counts as having reached a reported crime within this many metres of it; until
   * then the wanted level can't fade (the police haven't looked yet). Game-design estimate.
   */
  arrivedWithin: 30,
  /** ...but at most this many game seconds, so a car that can't get there doesn't hold the level up for ever. Estimate. */
  responseMax: 45,
  /** Top speed of a police car by wanted level, m/s (13 m/s is about 47 km/h). */
  topSpeed: [0, 13, 15, 17, 19, 20],
  /** Cars appear this far from where the player was last seen, metres, and never nearer the player than `spawnClear`. */
  spawnNear: 80,
  spawnFar: 140,
  spawnClear: 70,
  /** Seconds between one car arriving and the next. */
  spawnEvery: 5,
  /** A car stops this far (centre to centre) from the player to let officers out, metres... */
  stopShort: 9,
  /** ...and officers get out when it is within this distance and nearly stopped. */
  deployRange: 16,
  officersPerCar: 2,
  /** Seconds after officers got back in before the same car lets them out again. */
  redeployAfter: 6,
  /** Officers go back to their car when the player gets this far away, metres. */
  recallRange: 45,
  /** With no sighting for this long, cars search round where the player was last seen, seconds... */
  searchAfter: 3,
  /** ...within this distance of it, metres. */
  searchRadius: 120,
  /** Cars are taken away beyond this distance from the player once the player is not wanted, metres (or as soon as the player can't see them). */
  leaveBeyond: 90,
  /** A car this far from both the player and the search is recycled, metres. */
  recycleBeyond: 600,
  /** The siren is heard within this distance, metres. */
  sirenHeard: 250,
  /** How often the police look for the player (line-of-sight rays), seconds. */
  lookEvery: 0.2,
  /** Shots ending this close to a police car's box hit it, metres. */
  shotSlack: 0.4,
  /** Gunfire within this distance of a story fight's enemies is part of that fight, not a crime, metres. */
  storyFight: 60,
} as const;

/** White body, khaki band with POLICE, red and blue light bar: an invented livery, no real force's. */
const BODY = 0xf2f2ee;
const KHAKI = "#b39a62";
const POLICE_BLUE = "#1d3d8f";
const CHEST = 1.3;

/** What the police need to know about the player each step. */
export interface PoliceView {
  readonly x: number;
  readonly z: number;
  /** Ground speed, m/s, and velocity. */
  readonly speed: number;
  readonly vx: number;
  readonly vz: number;
  /** The vehicle the player is in, or null on foot. */
  readonly vehicle: { readonly id: string; readonly kind: string; readonly halfLength: number } | null;
  /** Strength of a crash of the player's vehicle this step (0 for none). */
  readonly impact: number;
  /** Kinds of vehicle the current job or story step asks the player to take. */
  readonly allowedKinds: readonly string[];
  /** The player's capsule or vehicle, which sight lines ignore. */
  readonly body: CharacterBody | VehicleBody;
}

export interface PoliceHost {
  /** Arrested: charge the fine, take the weapons and put the player at `station`. */
  busted(fine: number, stars: number, station: { x: number; z: number; yaw: number }): void;
}

interface Unit {
  readonly id: number;
  readonly car: TrafficCar;
  readonly box: KinematicBox;
  readonly pursuer: Pursuer;
  active: boolean;
  /** "chase" drives after the player (or searches), "parked" waits while officers are out. */
  state: "chase" | "parked";
  /** The group its officers are in while they are out. */
  group: string | null;
  deployments: number;
  sinceRecall: number;
  /** Where it searches when the player has not been seen for a while. */
  searchGoal: { x: number; z: number } | null;
  searchFor: number;
  /** 0 chases the player; 1 aims ahead to cut them off (from three stars). */
  role: number;
  /** Seconds since the player stopped being wanted (the car leaves). */
  standingDown: number;
  generation: number;
}

/** Shared materials: every car's light bar flashes together. */
let lightMaterials: { red: THREE.MeshBasicMaterial; blue: THREE.MeshBasicMaterial; livery: THREE.MeshStandardMaterial } | null = null;

function liveryTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 48;
  const g = canvas.getContext("2d")!;
  g.fillStyle = KHAKI;
  g.fillRect(0, 0, 256, 48);
  g.fillStyle = POLICE_BLUE;
  g.fillRect(0, 0, 256, 5);
  g.fillRect(0, 43, 256, 5);
  g.font = "bold 30px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("POLICE", 128, 25);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function materials(): NonNullable<typeof lightMaterials> {
  if (!lightMaterials) {
    lightMaterials = {
      red: new THREE.MeshBasicMaterial({ color: 0xff2020 }),
      blue: new THREE.MeshBasicMaterial({ color: 0x2050ff }),
      livery: new THREE.MeshStandardMaterial({ map: liveryTexture(), roughness: 0.6 }),
    };
  }
  return lightMaterials;
}

/**
 * Light bar and side bands added to a car model: three extra meshes (one draw call each),
 * sized from the model's own bounds so they sit on its roof and doors.
 */
function addLivery(object: THREE.Object3D): void {
  const m = materials();
  const bounds = new THREE.Box3().setFromObject(object);
  const width = bounds.max.x - bounds.min.x;
  const length = bounds.max.z - bounds.min.z;
  const midZ = (bounds.min.z + bounds.max.z) / 2;
  const roof = bounds.max.y - object.position.y;
  const bar = new THREE.BoxGeometry(width * 0.27, 0.09, 0.2);
  const red = new THREE.Mesh(bar, m.red);
  red.position.set(width * 0.15, roof + 0.045, midZ + 0.1);
  const blue = new THREE.Mesh(bar, m.blue);
  blue.position.set(-width * 0.15, roof + 0.045, midZ + 0.1);
  // One band on each side, reading front to back from outside.
  const bandHeight = 0.2;
  const bandY = (bounds.min.y - object.position.y) + (roof - (bounds.min.y - object.position.y)) * 0.42;
  const left = new THREE.PlaneGeometry(length * 0.62, bandHeight);
  left.rotateY(-Math.PI / 2);
  left.translate(bounds.min.x - 0.01, bandY, midZ);
  const right = new THREE.PlaneGeometry(length * 0.62, bandHeight);
  right.rotateY(Math.PI / 2);
  right.translate(bounds.max.x + 0.01, bandY, midZ);
  const bands = new THREE.Mesh(mergeGeometries([left, right], false)!, m.livery);
  object.add(red, blue, bands);
}

export class Police {
  readonly wanted = new Wanted();
  private readonly units: Unit[] = [];
  private readonly stars: WantedStars;
  /** Where the police last saw the player, and how long ago (seconds). */
  private lastSeen: { x: number; z: number } | null = null;
  private sinceSeen = 99;
  /** A crime was reported and no car has reached the spot yet (seconds since the report). */
  private responding: number | null = null;
  private seenNow = false;
  private sinceLook = 99;
  private spawnIn = 0;
  private sinceFlash = 0;
  private flashOn = false;
  /** Health of each officer last step, to notice the player hurting one. */
  private readonly officerHealth = new Map<number, number>();
  /** Vehicles already taken (reported, or allowed at the time): not reported again. */
  private readonly taken = new Set<string>();
  private lastVehicle: string | null = null;
  private readonly stations: Array<{ x: number; z: number }>;
  private readonly graphOf: () => RoadGraph;
  private readonly traffic: () => ReadonlyArray<{ x: number; z: number }>;
  private player: PoliceView | null = null;
  /** The last arrest and the last crime reported, for tests and debugging. */
  lastBust: { fine: number; stars: number; x: number; z: number } | null = null;
  lastCrime: Crime | null = null;

  constructor(
    private readonly map: WorldMap,
    private readonly scene: THREE.Object3D,
    private readonly physics: PhysicsWorld,
    private readonly combat: Combat,
    private readonly sound: Sound,
    hudRoot: HTMLElement,
    world: { graph: () => RoadGraph; traffic: () => ReadonlyArray<{ x: number; z: number }> },
    private readonly host: PoliceHost,
  ) {
    this.stars = new WantedStars(hudRoot);
    this.graphOf = world.graph;
    this.traffic = world.traffic;
    // Police stations are real places from the map (OSM amenity=police); their names are not shown.
    this.stations = map.pois.filter((p) => p.kind === "police").map((p) => ({ x: p.x, z: p.z }));
  }

  /** The job board takes no new jobs at two stars and above. */
  jobRefusal(onAJob: boolean): string | null {
    if (onAJob || jobsAllowed(this.wanted.stars)) return null;
    return "No new jobs while the police are after you. Lose them first.";
  }

  /** Report a crime; the level may rise. */
  report(crime: Crime): void {
    this.lastCrime = crime;
    const event = this.wanted.report(crime);
    if (event && event.stars > 0 && this.units.every((u) => !u.active)) this.spawnIn = 0;
    // The police know where the crime happened.
    if (this.player && this.wanted.stars > 0) {
      this.lastSeen = { x: this.player.x, z: this.player.z };
      this.sinceSeen = 0;
      this.responding = 0;
    }
  }

  /** The player's vehicle hit a pedestrian. */
  pedestrianHit(outcome: HitOutcome): void {
    if (outcome === "injured") this.report("pedestrianInjured");
    else if (outcome === "killed") this.report("pedestrianKilled");
  }

  /**
   * The player fired a shot from (x, z) that ended at (toX, toZ). Shots in a story fight (its
   * enemies close by) are part of that fight: the police don't come for them.
   */
  gunfire(x: number, z: number, toX: number, toZ: number): void {
    for (const unit of this.units) {
      if (!unit.active) continue;
      const half = unit.car.type.physics.halfExtents;
      // The shot's end point in the car's own frame.
      const dx = toX - unit.pursuer.x;
      const dz = toZ - unit.pursuer.z;
      const h = unit.pursuer.heading;
      const along = dx * -Math.sin(h) + dz * -Math.cos(h);
      const side = dx * Math.cos(h) - dz * Math.sin(h);
      if (Math.abs(along) < half.z + POLICE.shotSlack && Math.abs(side) < half.x + POLICE.shotSlack) this.report("policeCarShot");
    }
    const storyFight = this.combat.enemies.some((e) => !isPoliceGroup(e.group) && e.health > 0 && Math.hypot(e.x - x, e.z - z) < POLICE.storyFight);
    if (!storyFight) this.report("gunfire");
  }

  /** Enemy groups that are police officers (the game keeps them when it tidies story enemies). */
  groups(): string[] {
    const groups = new Set<string>();
    for (const e of this.combat.enemies) if (isPoliceGroup(e.group)) groups.add(e.group);
    return [...groups];
  }

  /** Room the police cars take up, for traffic to give way to. */
  obstacles(): Obstacle[] {
    const out: Obstacle[] = [];
    for (const unit of this.units) {
      if (!unit.active) continue;
      const { x, z, heading } = unit.pursuer;
      const fx = -Math.sin(heading);
      const fz = -Math.cos(heading);
      out.push({ x: x + fx, z: z + fz, radius: 1.1 }, { x: x - fx, z: z - fz, radius: 1.1 });
    }
    return out;
  }

  /** The nearest chasing car with its siren on: traffic pulls over for it. */
  siren(at: { x: number; z: number }): Siren | null {
    let best: Unit | null = null;
    let bestDistance = Infinity;
    for (const unit of this.units) {
      if (!unit.active || unit.state !== "chase" || this.wanted.stars === 0) continue;
      const d = Math.hypot(unit.pursuer.x - at.x, unit.pursuer.z - at.z);
      if (d < bestDistance) {
        bestDistance = d;
        best = unit;
      }
    }
    return best ? { x: best.pursuer.x, z: best.pursuer.z, heading: best.pursuer.heading } : null;
  }

  /**
   * True while the police are still on their way to a reported crime: until a car gets near the
   * spot (or sees the player, or `responseMax` passes), the wanted level can't fade. Otherwise a
   * car with a long drive in would be called off before it had looked, and the player would lose
   * the star without doing anything.
   */
  private stillResponding(dt: number): boolean {
    if (this.responding === null) return false;
    this.responding += dt;
    const spot = this.lastSeen;
    const arrived = spot !== null && this.units.some((u) => u.active && Math.hypot(u.pursuer.x - spot.x, u.pursuer.z - spot.z) < POLICE.arrivedWithin);
    if (arrived || this.seenNow || this.wanted.stars === 0 || this.responding > POLICE.responseMax) this.responding = null;
    return this.responding !== null;
  }

  /** Everything gone: not wanted, no cars, no officers (after an arrest, a knock-out, a new game). */
  clear(): void {
    this.wanted.clear();
    for (const unit of this.units) this.putAway(unit);
    this.combat.keepOnly(this.combat.enemies.filter((e) => !isPoliceGroup(e.group)).map((e) => e.group));
    this.officerHealth.clear();
    this.lastSeen = null;
    this.sinceSeen = 99;
    this.seenNow = false;
    this.responding = null;
  }

  /** Tests and debugging: set the level directly. */
  setStars(stars: number): void {
    this.wanted.set(stars);
    if (this.player) this.lastSeen = { x: this.player.x, z: this.player.z };
    this.sinceSeen = 0;
    this.spawnIn = 0;
  }

  private putAway(unit: Unit): void {
    if (unit.group) this.removeGroup(unit.group);
    unit.group = null;
    unit.active = false;
    unit.state = "chase";
    unit.car.object.visible = false;
    unit.box.teleport(unit.pursuer.x, -200, unit.pursuer.z, 0);
  }

  private removeGroup(group: string): void {
    const keep = new Set<string>();
    for (const e of this.combat.enemies) if (e.group !== group) keep.add(e.group);
    this.combat.keepOnly([...keep]);
  }

  private officers(): Enemy[] {
    return this.combat.enemies.filter((e) => isPoliceGroup(e.group));
  }

  /** True when nothing solid lies on the straight line between two points at chest height. */
  private lineClear(ax: number, az: number, fromClear: number, bx: number, bz: number, toClear: number, ignore?: CharacterBody | VehicleBody): boolean {
    const distance = Math.hypot(bx - ax, bz - az);
    const reach = distance - fromClear - toClear;
    if (reach <= 0) return true;
    const dx = (bx - ax) / distance;
    const dz = (bz - az) / distance;
    return this.physics.raycast({ x: ax + dx * fromClear, y: CHEST, z: az + dz * fromClear }, { x: dx, y: 0, z: dz }, reach, ignore) === null;
  }

  /** Whether any unit can see the player now. */
  private look(p: PoliceView): boolean {
    const toClear = p.vehicle ? p.vehicle.halfLength + 0.4 : 0.6;
    for (const unit of this.units) {
      if (!unit.active) continue;
      const d = Math.hypot(unit.pursuer.x - p.x, unit.pursuer.z - p.z);
      if (d < WANTED.sightCar && this.lineClear(unit.pursuer.x, unit.pursuer.z, 2.6, p.x, p.z, toClear, p.body)) return true;
    }
    for (const officer of this.officers()) {
      if (officer.health <= 0) continue;
      const d = Math.hypot(officer.x - p.x, officer.z - p.z);
      if (d < WANTED.sightOfficer && this.lineClear(officer.x, officer.z, 0.6, p.x, p.z, toClear, p.body)) return true;
    }
    return false;
  }

  /** A road junction out of the player's sight, near where the police look for them, with a short drive in. */
  private spawnPoint(graph: RoadGraph, p: PoliceView, centre: { x: number; z: number }): { x: number; z: number; heading: number } | null {
    const candidates: number[] = [];
    graph.nodes.forEach((node, i) => {
      if (node.out.length === 0) return;
      const fromCentre = Math.hypot(node.x - centre.x, node.z - centre.z);
      if (fromCentre < POLICE.spawnNear || fromCentre > POLICE.spawnFar) return;
      if (Math.hypot(node.x - p.x, node.z - p.z) < POLICE.spawnClear) return;
      candidates.push(i);
    });
    const goal = nearestNode(graph, centre.x, centre.z);
    for (let attempt = 0; attempt < 12 && candidates.length > 0; attempt++) {
      const pick = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0]!;
      const node = graph.nodes[pick]!;
      // Out of sight: something solid in the way (the player must not see it appear).
      if (this.lineClear(p.x, p.z, 0.6, node.x, node.z, 2.6, p.body)) continue;
      const route = findRoute(graph, pick, goal, 3000);
      if (!route || route.length < 2) continue;
      // Not a long way round (a one-way street the wrong way).
      if (routeLength(graph, route) > 2 * Math.hypot(node.x - centre.x, node.z - centre.z) + 40) continue;
      const next = graph.nodes[route[1]!]!;
      return { x: node.x, z: node.z, heading: Math.atan2(-(next.x - node.x), -(next.z - node.z)) };
    }
    return null;
  }

  private unit(): Unit | null {
    const free = this.units.find((u) => !u.active);
    if (free) return free;
    if (this.units.length >= WANTED.cars[WANTED.maxStars]) return null;
    // Built the first time each is needed, then reused: no models created or disposed mid-chase.
    const car = new TrafficCar("car", BODY);
    addLivery(car.object);
    // No figure at the wheel: closed cars hide their driver (as the player's car does), and a
    // seated figure would cost several draw calls and thousands of triangles per car.
    car.object.visible = false;
    this.scene.add(car.object);
    const unit: Unit = {
      id: this.units.length + 1,
      car,
      box: this.physics.createKinematicBox(VEHICLE_TYPES.car.physics.halfExtents),
      pursuer: new Pursuer(0, 0, 0),
      active: false,
      state: "chase",
      group: null,
      deployments: 0,
      sinceRecall: 99,
      searchGoal: null,
      searchFor: 0,
      role: this.units.length % 2,
      standingDown: 0,
      generation: 0,
    };
    this.units.push(unit);
    return unit;
  }

  private dispatch(graph: RoadGraph, p: PoliceView): void {
    const cap = policeUnits(this.wanted.stars).cars;
    const active = this.units.filter((u) => u.active).length;
    if (active >= cap || this.spawnIn > 0) return;
    const spot = this.spawnPoint(graph, p, this.lastSeen ?? p);
    if (!spot) {
      this.spawnIn = 1; // try again in a moment
      return;
    }
    const unit = this.unit();
    if (!unit) return;
    unit.active = true;
    unit.state = "chase";
    unit.searchGoal = null;
    unit.sinceRecall = 99;
    unit.standingDown = 0;
    unit.pursuer.x = spot.x;
    unit.pursuer.z = spot.z;
    unit.pursuer.heading = spot.heading;
    unit.pursuer.speed = 8;
    unit.pursuer.replan();
    unit.generation++;
    unit.car.object.visible = true;
    unit.box.teleport(spot.x, unit.car.type.rideHeight, spot.z, spot.heading);
    this.spawnIn = POLICE.spawnEvery;
  }

  /** Officers out of a stopped car, beside its doors. */
  private deploy(unit: Unit): void {
    const living = this.officers().filter((e) => e.health > 0).length;
    const count = Math.min(POLICE.officersPerCar, policeUnits(this.wanted.stars).officers - living);
    if (count <= 0) return;
    const armed = policeUnits(this.wanted.stars).armed;
    const { x, z, heading } = unit.pursuer;
    const side = VEHICLE_TYPES.car.physics.halfExtents.x + 0.7;
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);
    const spots = [1, -1].slice(0, count).map((s) => ({ x: x - rx * side * s, z: z - rz * side * s, armed }));
    unit.deployments++;
    unit.group = `${POLICE_GROUP}${unit.id}-${unit.deployments}`;
    this.combat.spawnGroup(unit.group, spots);
    for (const e of this.combat.enemies) {
      if (e.group !== unit.group) continue;
      // They know where the player is: they come straight out after them.
      e.alerted = true;
      e.heading = heading;
      this.officerHealth.set(e.id, e.health);
    }
    unit.state = "parked";
  }

  /** Officers back in the car (they vanish into it) and the chase goes on. */
  private recall(unit: Unit): void {
    if (unit.group) this.removeGroup(unit.group);
    unit.group = null;
    unit.state = "chase";
    unit.sinceRecall = 0;
  }

  /** One fixed step, before combat (officers' attacks are held back below three stars). */
  fixedUpdate(dt: number, p: PoliceView): void {
    this.player = p;
    // Getting into someone else's vehicle.
    const vehicleId = p.vehicle?.id ?? null;
    if (p.vehicle && vehicleId !== this.lastVehicle) {
      if (isVehicleTheft(p.vehicle, { own: OWN_VEHICLES, allowedKinds: p.allowedKinds, taken: this.taken })) this.report("vehicleTheft");
      this.taken.add(p.vehicle.id);
    }
    this.lastVehicle = vehicleId;

    // Officers hurt by the player since the last step.
    for (const officer of this.officers()) {
      const before = this.officerHealth.get(officer.id);
      if (before !== undefined && officer.health < before) this.report(officer.health <= 0 ? "officerDown" : "officerAssaulted");
      this.officerHealth.set(officer.id, officer.health);
    }
    // Driving into a police car (faster than it was going: being rammed is not the player's crime).
    if (p.impact > 0 && p.vehicle) {
      for (const unit of this.units) {
        if (!unit.active) continue;
        const d = Math.hypot(unit.pursuer.x - p.x, unit.pursuer.z - p.z);
        if (d < p.vehicle.halfLength + VEHICLE_TYPES.car.physics.halfExtents.z + 0.8 && p.speed > unit.pursuer.speed + 1.5) this.report("policeCarRammed");
      }
    }

    // Who can see the player (a few times a second: each look is a ray per unit).
    this.sinceLook += dt;
    if (this.sinceLook >= POLICE.lookEvery) {
      this.sinceLook = 0;
      this.seenNow = this.wanted.stars > 0 && this.look(p);
    }
    this.sinceSeen += dt;
    if (this.seenNow) {
      this.lastSeen = { x: p.x, z: p.z };
      this.sinceSeen = 0;
    }
    let held = false;
    if (!p.vehicle && p.speed < WANTED.stillBelow) {
      for (const officer of this.officers()) if (officer.health > 0 && Math.hypot(officer.x - p.x, officer.z - p.z) < WANTED.bustRange) held = true;
    }
    const event = this.wanted.update(dt, { seen: this.seenNow, held, responding: this.stillResponding(dt) });
    if (event?.type === "busted") {
      this.arrest(event.fine, event.stars, p);
      return;
    }

    const stars = this.wanted.stars;
    const units = policeUnits(stars);
    // Below three stars officers walk up to make an arrest; they don't throw punches or shoot.
    if (!units.armed) for (const officer of this.officers()) officer.cooldown = Math.max(officer.cooldown, 0.5);

    const graph = this.graphOf();
    this.spawnIn -= dt;
    if (stars > 0) this.dispatch(graph, p);
    const traffic = this.units.some((u) => u.active) ? this.traffic() : [];
    for (const unit of this.units) {
      if (!unit.active) continue;
      this.drive(unit, dt, graph, p, traffic);
    }
  }

  private drive(unit: Unit, dt: number, graph: RoadGraph, p: PoliceView, traffic: ReadonlyArray<{ x: number; z: number }>): void {
    const stars = this.wanted.stars;
    const car = unit.pursuer;
    const toPlayer = Math.hypot(car.x - p.x, car.z - p.z);
    unit.sinceRecall += dt;

    if (stars === 0) {
      // Standing down: officers back in, and the car leaves once the player can't see it.
      if (unit.group) this.recall(unit);
      unit.standingDown += dt;
      const seen = toPlayer < POLICE.leaveBeyond && this.lineClear(p.x, p.z, 0.6, car.x, car.z, 2.6, p.body);
      if (!seen || unit.standingDown > 8) {
        this.putAway(unit);
        return;
      }
    } else if (toPlayer > POLICE.recycleBeyond && (!this.lastSeen || Math.hypot(car.x - this.lastSeen.x, car.z - this.lastSeen.z) > POLICE.recycleBeyond)) {
      this.putAway(unit);
      return;
    }

    if (unit.state === "parked") {
      const living = this.officers().filter((e) => e.group === unit.group && e.health > 0).length;
      const escaped = toPlayer > POLICE.recallRange || (p.vehicle !== null && p.speed > 6 && toPlayer > 20);
      if (living === 0 || escaped) this.recall(unit);
      car.speed = 0;
    } else {
      const units = policeUnits(stars);
      // Ram a moving vehicle; a stopped one is boxed in and the officers get out (armed from three stars).
      const ram = units.ram && p.vehicle !== null && p.speed > 3 && this.sinceSeen < 1;
      let goal: { x: number; z: number; vx: number; vz: number };
      let stopShort: number | null = POLICE.stopShort;
      if (this.sinceSeen < POLICE.searchAfter || !this.lastSeen) {
        goal = this.sinceSeen < 1 ? { x: p.x, z: p.z, vx: p.vx, vz: p.vz } : { ...(this.lastSeen ?? p), vx: 0, vz: 0 };
        unit.searchGoal = null;
        if (ram) stopShort = null;
      } else {
        // Lost them: drive to where they were seen, then round the streets near it.
        unit.searchFor -= dt;
        const centre = this.lastSeen;
        const there = unit.searchGoal ? Math.hypot(car.x - unit.searchGoal.x, car.z - unit.searchGoal.z) < 10 : false;
        if (!unit.searchGoal || there || unit.searchFor <= 0) {
          const angle = Math.random() * Math.PI * 2;
          const r = Math.random() * POLICE.searchRadius;
          const node = graph.nodes[nearestNode(graph, centre.x + Math.cos(angle) * r, centre.z + Math.sin(angle) * r)];
          unit.searchGoal = node ? { x: node.x, z: node.z } : centre;
          unit.searchFor = 20;
        }
        goal = { ...unit.searchGoal, vx: 0, vz: 0 };
        stopShort = 2;
      }
      const lead = ram ? (unit.role === 1 ? 1.2 : 0.3) : 0;
      car.update(dt, graph, goal, { topSpeed: POLICE.topSpeed[stars] ?? POLICE.topSpeed[1], stopShort, lead }, { clear: (ax, az, bx, bz) => this.lineClear(ax, az, 2.6, bx, bz, 1, p.body) }, traffic);
      // Officers get out once the car has pulled up near the player (on foot, or stopped in a vehicle).
      const playerStopped = p.vehicle === null || p.speed < 2;
      if (stars > 0 && this.seenNow && !ram && playerStopped && toPlayer < POLICE.deployRange && car.speed < 1.5 && unit.sinceRecall > POLICE.redeployAfter) this.deploy(unit);
    }
    unit.box.moveTo(car.x, unit.car.type.rideHeight, car.z, car.heading);
  }

  /** Busted: everything stands down and the player is taken to the nearest police station. */
  private arrest(fine: number, stars: number, p: PoliceView): void {
    let station = { x: p.x, z: p.z };
    let best = Infinity;
    for (const s of this.stations) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < best) {
        best = d;
        station = s;
      }
    }
    // On the pavement outside, facing along the road.
    const road = nearestRoadPoint(this.map, station);
    const side = road ? road.road.width / 2 + 1.2 : 0;
    const at = road ? { x: road.x + Math.cos(road.heading) * side, z: road.z - Math.sin(road.heading) * side, yaw: road.heading } : { ...station, yaw: 0 };
    this.clear();
    this.lastBust = { fine, stars, x: at.x, z: at.z };
    this.host.busted(fine, stars, at);
  }

  /** Once per rendered frame: place the cars, flash the lights, the HUD stars and the siren. */
  frame(dt: number, at: { x: number; z: number }): void {
    this.sinceFlash += dt;
    if (this.sinceFlash > 0.18) {
      this.sinceFlash = 0;
      this.flashOn = !this.flashOn;
      const m = materials();
      m.red.color.setHex(this.flashOn ? 0xff2020 : 0x3a0808);
      m.blue.color.setHex(this.flashOn ? 0x0a1440 : 0x2050ff);
    }
    let nearest = Infinity;
    for (const unit of this.units) {
      if (!unit.active) continue;
      const car = unit.pursuer;
      unit.car.sync(dt, car.x, car.z, car.heading, car.speed, unit.generation);
      const d = Math.hypot(car.x - at.x, car.z - at.z);
      if (unit.state === "chase" && this.wanted.stars > 0) nearest = Math.min(nearest, d);
    }
    this.stars.set(this.wanted.stars, this.wanted.seen);
    this.sound.setPoliceSiren(nearest < POLICE.sirenHeard ? Math.max(0.15, 1 - (nearest - 20) / (POLICE.sirenHeard - 20)) : null);
  }

  /** Police on the minimap: cars flash blue and red, officers are blue dots. */
  markers(): MinimapMarker[] {
    const out: MinimapMarker[] = [];
    for (const unit of this.units) if (unit.active) out.push({ x: unit.pursuer.x, z: unit.pursuer.z, color: this.flashOn ? "#ff4040" : "#3d7bff", size: 5 });
    for (const officer of this.officers()) if (officer.health > 0) out.push({ x: officer.x, z: officer.z, color: "#3d7bff", size: 3.5 });
    return out;
  }

  /** For tests and debugging. */
  snapshot(): {
    stars: number;
    seen: boolean;
    points: number;
    unseenFor: number;
    cars: Array<{ x: number; z: number; speed: number; state: string; mode: string }>;
    officers: Array<{ x: number; z: number; health: number; armed: boolean }>;
    lastBust: { fine: number; stars: number; x: number; z: number } | null;
    lastCrime: Crime | null;
  } {
    return {
      stars: this.wanted.stars,
      seen: this.wanted.seen,
      points: this.wanted.points,
      unseenFor: this.wanted.unseenFor,
      cars: this.units.filter((u) => u.active).map((u) => ({ x: u.pursuer.x, z: u.pursuer.z, speed: u.pursuer.speed, state: u.state, mode: u.pursuer.mode })),
      officers: this.officers().map((e) => ({ x: e.x, z: e.z, health: e.health, armed: e.armed })),
      lastBust: this.lastBust,
      lastCrime: this.lastCrime,
    };
  }
}
