/**
 * The people of a fare (`FareStop` in `@cow/missions`) on screen: someone waiting at the kerb who
 * waves as the vehicle comes near, walks to its passenger door once it has stopped, and gets in
 * (sits down on the auto's bench, or disappears through a car's, ambulance's or bus's door, which
 * swings open for them); at a drop, they get out, walk onto the pavement and away. People aboard
 * an auto are drawn seated (baked figures, like `ShareRiders`); in closed vehicles they are out of
 * sight. Only the current stop's people are drawn, and only near the player.
 *
 * Everything here is placed from the rules' state each drawn frame; the only state of its own is
 * who sits where and those walking away after getting out (they carry on after the stop is done).
 */
import * as THREE from "three";
import { FARES, type FarePerson, type FareStop } from "@cow/missions";
import { sitWeight, type HumanAssets, type HumanFigure, type PersonLook } from "@cow/player";
import type { PassengerDoor, Vehicle, VehicleKind } from "@cow/vehicles";
import { PASSENGER, SEATS } from "./ShareRiders";

/** People waiting farther than this from the player are not drawn (metres): far enough to be seen coming. */
const SHOW_RADIUS = 220;
/** They wave once the vehicle is this close (metres). */
const WAVE_RADIUS = 55;
/** Metres between people waiting together, along the kerb. */
const SPACING = 0.85;
/** After walking off the pavement they carry on this long (seconds) before they are gone from view. */
const LINGER = 3;
/** Doors swing at this share a second. */
const DOOR_RATE = 2.5;
/**
 * Clothes for passengers drawn with the player's model (no people manifest), bright enough to
 * stand out at the kerb, and a patient's pale gown. Manifest people wear their own clothes.
 */
const CLOTHES = [0xe8b04a, 0x5f9fe0, 0xd9605f, 0x6fc27a, 0xd88fd0, 0xf0e07a];
const GOWN = 0xcfe3ef;
/** The auto's rear bench (the front seat beside the driver is the share auto's, not a fare's). */
const BENCH = [0, 1, 2] as const;

interface Rider {
  tint: number | undefined;
  /** Who (a manifest id; null: the player's model). */
  person: string | null;
  seat: number;
  object: THREE.Object3D | null;
}

interface Leaver {
  figure: HumanFigure;
  from: THREE.Vector3;
  kerb: THREE.Vector3;
  away: THREE.Vector3;
  t: number;
  walk: number;
}

/** What the game hands over each frame: the stop, who is aboard, the vehicle kind and the marker. */
export interface FareScene {
  readonly stop: FareStop;
  readonly aboard: number;
  readonly kind: VehicleKind;
  readonly marker: { readonly x: number; readonly z: number };
}

export interface FareFiguresSnapshot {
  readonly waiting: number;
  readonly waving: number;
  readonly walking: number;
  readonly seated: number;
  readonly leaving: number;
  /** The most open of the vehicle's passenger doors, 0 to 1. */
  readonly door: number;
  /** People on screen: where they stand (feet), for tests checking they are on the pavement. */
  readonly people: ReadonlyArray<{ readonly x: number; readonly z: number; readonly stage: string }>;
}

const turnTo = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export class FareFigures {
  private readonly pool: HumanFigure[] = [];
  private readonly leavers: Leaver[] = [];
  /** Figures of people who have walked off, kept for the next ones. */
  private readonly spare: HumanFigure[] = [];
  /** Pool figures left part-way seated last frame. */
  private readonly sat = new Set<HumanFigure>();
  private riders: Rider[] = [];
  private vehicle: Vehicle | null = null;
  private readonly ids = new WeakMap<FareStop, number>();
  private nextId = 1;
  /** People already handled getting in or out, by key, so each is counted once. */
  private readonly seen = new Map<string, Rider>();
  private readonly doors = new Map<number, number>();
  private readonly local = new THREE.Vector3();
  private shown: FareFiguresSnapshot = { waiting: 0, waving: 0, walking: 0, seated: 0, leaving: 0, door: 0, people: [] };

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly humans: HumanAssets,
  ) {}

  snapshot(): FareFiguresSnapshot {
    return this.shown;
  }

  /**
   * Once per drawn frame.
   * @param vehicle the vehicle the player drives, when it is the fare's kind
   */
  frame(dt: number, scene: FareScene | null, at: { x: number; z: number }, vehicle: Vehicle | null): void {
    if (vehicle && vehicle !== this.vehicle) this.changeVehicle(vehicle);
    const car = vehicle ?? this.vehicle;
    const people: Array<{ x: number; z: number; stage: string }> = [];
    let used = 0;
    let waving = 0;
    let waiting = 0;
    let walking = 0;
    const wantDoor = new Map<number, number>();

    if (scene && car) {
      const id = this.idOf(scene.stop);
      const list = scene.stop.people();
      const boarders = list.filter((p) => p.action === "board").length;
      const kerb = scene.stop.fare.kerb;
      // Along the kerb: across the line from the kerb spot to the marker.
      const toRoad = new THREE.Vector2(scene.marker.x - kerb.x, scene.marker.z - kerb.z);
      if (toRoad.lengthSq() < 0.01) toRoad.set(1, 0);
      toRoad.normalize();
      const alongKerb = { x: -toRoad.y, z: toRoad.x };
      const near = Math.hypot(at.x - kerb.x, at.z - kerb.z) < SHOW_RADIUS;
      const vehicleAt = car.body.position();
      const close = Math.hypot(vehicleAt.x - kerb.x, vehicleAt.z - kerb.z) < WAVE_RADIUS;

      for (const person of list) {
        const key = `${id}:${person.action}:${person.index}`;
        const spot = { x: kerb.x + alongKerb.x * (person.index - (boarders - 1) / 2) * SPACING, z: kerb.z + alongKerb.z * (person.index - (boarders - 1) / 2) * SPACING };
        const door = this.doorFor(car, kerb);
        const doorAt = this.toWorld(car, door.point.x, -car.type.rideHeight, door.point.z);
        if (person.action === "board") {
          if (person.stage === "inside") {
            this.settle(key, scene, car, door, person);
            continue;
          }
          if (!near) continue;
          const figure = this.figure(used++, this.lookFor(scene, person));
          if (person.stage === "waiting") {
            waiting++;
            figure.object.position.set(spot.x, 0, spot.z);
            const face = close ? vehicleAt : scene.marker;
            figure.object.rotation.set(0, Math.atan2(-(face.x - spot.x), -(face.z - spot.z)), 0);
            figure.setWaving(close);
            if (close) waving++;
            figure.update(dt, 0, true);
          } else if (person.stage === "walking") {
            walking++;
            figure.setWaving(false);
            const x = spot.x + (doorAt.x - spot.x) * person.share;
            const z = spot.z + (doorAt.z - spot.z) * person.share;
            figure.object.position.set(x, 0, z);
            figure.object.rotation.set(0, Math.atan2(-(doorAt.x - spot.x), -(doorAt.z - spot.z)), 0);
            figure.update(dt, Math.hypot(doorAt.x - spot.x, doorAt.z - spot.z) / Math.max(0.3, person.walkSeconds), true);
            if (person.share > 0.7 && door.leaf !== undefined) wantDoor.set(door.leaf, 1);
          } else {
            walking++;
            figure.setWaving(false);
            this.inOut(figure, car, door, this.seatFor(key, door), person.share, dt);
            if (door.leaf !== undefined) wantDoor.set(door.leaf, 1);
          }
          people.push({ x: figure.object.position.x, z: figure.object.position.z, stage: person.stage });
        } else {
          if (person.stage === "riding") continue;
          if (person.stage === "exiting") {
            const rider = this.unseat(key, door);
            const figure = this.figure(used++, rider);
            figure.setWaving(false);
            walking++;
            this.inOut(figure, car, door, rider.seat, 1 - person.share, dt);
            if (door.leaf !== undefined) wantDoor.set(door.leaf, 1);
            people.push({ x: figure.object.position.x, z: figure.object.position.z, stage: person.stage });
          } else if (!this.seen.has(`${key}:off`)) {
            // Out of the door: they walk onto the pavement and away on their own from here.
            const rider = this.unseat(key, door);
            this.seen.set(`${key}:off`, rider);
            const from = new THREE.Vector3(doorAt.x, 0, doorAt.z);
            const away = new THREE.Vector3(-toRoad.x, 0, -toRoad.y);
            const kerbAt = new THREE.Vector3(spot.x, 0, spot.z).addScaledVector(away, FARES.walkOff);
            const same = this.spare.findIndex((f) => f.person === rider.person);
            const figure = same >= 0 ? this.spare.splice(same, 1)[0]! : this.humans.create(0xffffff, true, rider.person);
            figure.setClothes(rider.tint ?? 0xffffff);
            figure.setWaving(false);
            figure.object.visible = true;
            this.scene.add(figure.object);
            this.leavers.push({ figure, from, kerb: kerbAt, away, t: person.stage === "leaving" ? person.share * person.walkSeconds : person.walkSeconds, walk: Math.max(0.3, person.walkSeconds) });
          }
        }
      }
    }
    for (let i = used; i < this.pool.length; i++) {
      this.pool[i]!.object.visible = false;
      this.pool[i]!.setWaving(false);
    }
    const leaving = this.walkAway(dt, people);
    if (car) this.swingDoors(car, wantDoor, dt);
    this.reconcile(scene, car);
    this.shown = { waiting, waving, walking, seated: this.riders.filter((r) => r.object).length, leaving, door: car ? this.maxDoor(car) : 0, people };
  }

  private idOf(stop: FareStop): number {
    let id = this.ids.get(stop);
    if (id === undefined) {
      id = this.nextId++;
      this.ids.set(stop, id);
    }
    return id;
  }

  /**
   * Who a person at a stop is: the wedding party in their silks (stage 16), an elderly patient,
   * or any passenger; a child only beside an adult (not the first of a party).
   */
  private lookFor(scene: FareScene, person: FarePerson): PersonLook {
    const fare = scene.stop.fare;
    const index = this.idOf(scene.stop) * 3 + person.index;
    const look = this.humans.look(fare.patient ? "patient" : fare.party === "wedding" ? "wedding" : "passenger", index, { withAdult: person.index > 0 });
    return look.person ? { person: look.person, tint: look.tint } : { person: null, tint: fare.patient ? GOWN : CLOTHES[index % CLOTHES.length]! };
  }

  private figure(i: number, look: PersonLook): HumanFigure {
    let figure = this.pool[i];
    if (!figure || figure.person !== look.person) {
      // The pool is shared by everyone at the stop: take this person's figure from further along, or make one.
      const j = this.pool.findIndex((f, k) => k > i && f.person === look.person);
      const other = this.pool[i];
      if (j >= 0) {
        figure = this.pool[j]!;
        this.pool[j] = other!;
      } else {
        figure = this.humans.create(0xffffff, true, look.person);
        this.scene.add(figure.object);
        if (other) this.pool.push(other);
      }
      this.pool[i] = figure;
    }
    figure.setClothes(look.tint ?? 0xffffff);
    figure.object.visible = true;
    figure.object.quaternion.identity();
    // Standing again if it sat down last frame (the pool is shared by everyone at the stop).
    if (this.sat.delete(figure)) figure.sitting(PASSENGER, 0, 0);
    return figure;
  }

  /** The passenger door nearest the kerb spot (the kerb side, as people get in on the pavement side). */
  private doorFor(car: Vehicle, kerb: { x: number; z: number }): PassengerDoor {
    const doors = car.type.passengers ?? [{ point: car.type.entry.point, inside: car.type.driver }];
    let best = doors[0]!;
    let bestDistance = Infinity;
    for (const door of doors) {
      const p = this.toWorld(car, door.point.x, 0, door.point.z);
      const d = Math.hypot(p.x - kerb.x, p.z - kerb.z);
      if (d < bestDistance) {
        bestDistance = d;
        best = door;
      }
    }
    return best;
  }

  private toWorld(car: Vehicle, x: number, y: number, z: number): THREE.Vector3 {
    return car.object.localToWorld(this.local.set(x, y, z)).clone();
  }

  /**
   * Between the door (0) and inside (1). The auto: sit down onto the bench seat. Closed vehicles:
   * a step through the doorway, out of sight once in.
   */
  private inOut(figure: HumanFigure, car: Vehicle, door: PassengerDoor, seat: number, amount: number, dt: number): void {
    const ground = -car.type.rideHeight;
    const yaw = car.body.yaw();
    if (car.type.openSeat) {
      const to = SEATS[seat] ?? door.inside;
      // Stepping in facing the seat, then turning to face forwards as they sit.
      const inward = Math.atan2(-(to.x - door.point.x), -(to.z - door.point.z)) + yaw;
      const w = sitWeight(amount);
      const p = this.toWorld(car, door.point.x + (to.x - door.point.x) * w, ground + (to.y - ground) * w, door.point.z + (to.z - door.point.z) * w);
      figure.object.position.copy(p);
      figure.object.rotation.set(0, turnTo(inward, yaw, Math.min(1, amount * 2)), 0);
      figure.sitting(PASSENGER, Math.min(0.999, amount), dt);
      this.sat.add(figure);
      figure.object.visible = true;
    } else {
      const p = this.toWorld(car, door.point.x + (door.inside.x - door.point.x) * amount, ground, door.point.z + (door.inside.z - door.point.z) * amount);
      figure.object.position.copy(p);
      const heading = Math.atan2(-(door.inside.x - door.point.x), -(door.inside.z - door.point.z)) + yaw;
      figure.object.rotation.set(0, heading, 0);
      figure.update(dt, 0.8, true);
      // Gone through the doorway: the body hides them, as it does the driver.
      figure.object.visible = amount < 0.9;
    }
  }

  /** Seat for someone getting in: the free bench seat farthest from their door (they slide across). */
  private seatFor(key: string, door: PassengerDoor): number {
    const booked = this.seen.get(`${key}:seat`);
    if (booked) return booked.seat;
    const taken = new Set([...this.riders.map((r) => r.seat), ...[...this.seen.entries()].filter(([k]) => k.endsWith(":seat")).map(([, r]) => r.seat)]);
    const side = Math.sign(door.point.x) || -1;
    const free = BENCH.filter((s) => !taken.has(s)).sort((a, b) => (SEATS[a]!.x - SEATS[b]!.x) * -side);
    const seat = free[0] ?? 0;
    this.seen.set(`${key}:seat`, { tint: 0, person: null, seat, object: null });
    return seat;
  }

  /** Someone has got in: they sit (seen) in the auto from now on. */
  private settle(key: string, scene: FareScene, car: Vehicle, door: PassengerDoor, person: FarePerson): void {
    if (this.seen.has(`${key}:in`)) return;
    const seat = this.seatFor(key, door);
    const look = this.lookFor(scene, person);
    const rider: Rider = { tint: look.tint, person: look.person, seat, object: null };
    this.seen.set(`${key}:in`, rider);
    this.seen.delete(`${key}:seat`);
    this.riders.push(rider);
    this.draw(rider, car);
  }

  /** Someone gets out: take them off their seat (the one nearest the door), once. */
  private unseat(key: string, door: PassengerDoor): Rider {
    const known = this.seen.get(`${key}:out`);
    if (known) return known;
    const side = Math.sign(door.point.x) || -1;
    this.riders.sort((a, b) => ((SEATS[a.seat]?.x ?? 0) - (SEATS[b.seat]?.x ?? 0)) * side);
    const rider = this.riders.pop() ?? this.newRider(0, 0);
    rider.object?.removeFromParent();
    rider.object = null;
    this.seen.set(`${key}:out`, rider);
    return rider;
  }

  private draw(rider: Rider, car: Vehicle): void {
    if (!car.type.openSeat || rider.object) return;
    const seat = SEATS[rider.seat] ?? SEATS[0]!;
    const person = this.humans.seatedStatic(rider.tint, PASSENGER, rider.person);
    person.position.set(seat.x, seat.y, seat.z);
    car.object.add(person);
    rider.object = person;
  }

  /** Keep the seated people in step with the rules (a failed stage, a new game, a teleport). */
  private reconcile(scene: FareScene | null, car: Vehicle | null): void {
    const want = scene ? scene.aboard : this.riders.length;
    while (this.riders.length > want) this.riders.pop()!.object?.removeFromParent();
    while (car && this.riders.length < Math.min(want, BENCH.length)) {
      const taken = new Set(this.riders.map((r) => r.seat));
      const rider = this.newRider(this.riders.length, BENCH.find((s) => !taken.has(s)) ?? 0);
      this.riders.push(rider);
      this.draw(rider, car);
    }
    if (!scene && this.riders.length === 0) this.seen.clear();
  }

  /** Someone already aboard when the game starts drawing them (a reload, a reset): the `n`-th passenger. */
  private newRider(n: number, seat: number): Rider {
    const look = this.humans.look("passenger", n, { withAdult: n > 0 });
    return { tint: look.person ? look.tint : CLOTHES[n % CLOTHES.length]!, person: look.person, seat, object: null };
  }

  private changeVehicle(vehicle: Vehicle): void {
    for (const rider of this.riders) rider.object?.removeFromParent();
    this.riders = [];
    if (this.vehicle) for (const leaf of this.doors.keys()) this.vehicle.setPassengerDoor(leaf, 0);
    this.doors.clear();
    this.vehicle = vehicle;
  }

  /** Those who got out walk to the pavement, then on a little, and are gone. */
  private walkAway(dt: number, people: Array<{ x: number; z: number; stage: string }>): number {
    for (let i = this.leavers.length - 1; i >= 0; i--) {
      const l = this.leavers[i]!;
      l.t += dt;
      const end = l.kerb.clone().addScaledVector(l.away, FARES.walkSpeed * LINGER);
      let p: THREE.Vector3;
      let from: THREE.Vector3;
      let to: THREE.Vector3;
      if (l.t < l.walk) {
        from = l.from;
        to = l.kerb;
        p = from.clone().lerp(to, l.t / l.walk);
      } else {
        from = l.kerb;
        to = end;
        p = from.clone().lerp(to, Math.min(1, (l.t - l.walk) / LINGER));
      }
      l.figure.object.position.copy(p);
      l.figure.object.rotation.set(0, Math.atan2(-(to.x - from.x), -(to.z - from.z)), 0);
      l.figure.update(dt, FARES.walkSpeed, true);
      if (l.t >= l.walk + LINGER) {
        l.figure.object.removeFromParent();
        this.spare.push(l.figure);
        this.leavers.splice(i, 1);
      } else people.push({ x: p.x, z: p.z, stage: "leaving" });
    }
    return this.leavers.length;
  }

  private swingDoors(car: Vehicle, want: Map<number, number>, dt: number): void {
    for (const leaf of new Set([...want.keys(), ...this.doors.keys()])) {
      const now = this.doors.get(leaf) ?? car.passengerDoor(leaf);
      const target = want.get(leaf) ?? 0;
      const next = now + Math.max(-DOOR_RATE * dt, Math.min(DOOR_RATE * dt, target - now));
      car.setPassengerDoor(leaf, next);
      if (next <= 0 && target === 0) this.doors.delete(leaf);
      else this.doors.set(leaf, next);
    }
  }

  private maxDoor(car: Vehicle): number {
    let most = 0;
    for (const door of car.type.passengers ?? []) if (door.leaf !== undefined) most = Math.max(most, car.passengerDoor(door.leaf));
    return most;
  }
}
