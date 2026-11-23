/**
 * The goods of a job or stage on screen (`GoodsStop` in `@cow/missions`): at a pick-up someone
 * waits at the kerb holding them (a box in both hands, a bag or tiffin carrier in one), walks to
 * the vehicle once it has stopped and puts them in its cargo place (the bike's pillion seat, the
 * car's or auto's back seat through the kerb-side door); they ride there, visible, to the drop,
 * where someone walks up, takes them out into their hands and walks off with them. On a stage
 * without a vehicle (the money back to the tea shop) the player carries them on foot.
 *
 * Only the current stop's person is drawn, and only near the player. Everything is placed from
 * the rules' state each drawn frame; the only state of its own is the goods on the vehicle and
 * the people walking off after a handover (they carry on after the stop is done).
 */
import * as THREE from "three";
import { cargoAboard, FARES, type GoodsKind, type GoodsStop, type Job, type JobRunner, type Mission, type MissionRunner } from "@cow/missions";
import type { CarryKind, Cast, HumanAssets, HumanFigure } from "@cow/player";
import { VEHICLE_TYPES, type Vehicle, type VehicleKind } from "@cow/vehicles";
import { GOODS_CARRY, GOODS_HEIGHT, makeGoods } from "./goodsModels";

/** People farther than this from the player are not drawn (metres), as for fares. */
const SHOW_RADIUS = 220;
/** After walking back to the pavement they carry on this long (seconds) before they are gone. */
const LINGER = 3;
const DOOR_RATE = 2.5;

interface CargoPlace {
  /** Where goods sit, relative to the chassis centre (+X right, -Z forwards), kerb (left) side first. */
  readonly slots: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number }>;
  /** Where the person handing them over stands (left side; mirrored when the kerb is on the right). */
  readonly stand: { readonly x: number; readonly z: number };
  /** Passenger door leaf opened for the handover. */
  readonly leaf?: number;
  /** Mirror the stand and slots to the right side when the kerb is there. */
  readonly mirror: boolean;
}

/**
 * Where goods ride in each vehicle: slots round the vehicle type's `cargo` anchor (the middle of a
 * load's base on the Blender models, `docs/vehicles.md`). This table is the only place to change.
 */
const at = (kind: VehicleKind, dx: number, dy: number, dz: number) => {
  const c = VEHICLE_TYPES[kind].cargo;
  return { x: c.x + dx, y: c.y + dy, z: c.z + dz };
};
export const CARGO: Readonly<Record<VehicleKind, CargoPlace>> = {
  // On the rear carrier behind the seat, then on the pillion half of the seat (top about 0.26 m) ahead of it.
  bike: { slots: [at("bike", 0, 0, 0), at("bike", 0, -0.01, -0.25)], stand: { x: -0.75, z: 0.7 }, mirror: true },
  // The back seat (seen through the glass), through the kerb-side rear door.
  car: { slots: [at("car", -0.42, 0, 0), at("car", 0, 0, 0), at("car", 0.42, 0, 0)], stand: { x: -1.2, z: 1.35 }, leaf: 1, mirror: true },
  // The rear bench, from the open side.
  auto: { slots: [at("auto", -0.38, 0, 0), at("auto", 0, 0, 0), at("auto", 0.38, 0, 0)], stand: { x: -0.95, z: 0.8 }, mirror: true },
  // The floor of the patient's compartment, behind the rear doors.
  ambulance: { slots: [at("ambulance", 0, 0, 0.45), at("ambulance", 0, 0, 0)], stand: { x: 0, z: 3.2 }, leaf: 1, mirror: false },
  // The floor beside the front door.
  bus: { slots: [at("bus", 0, 0, 0), at("bus", 0, 0, 0.45)], stand: { x: -1.85, z: -3.6 }, leaf: 0, mirror: false },
};

/** What the game hands over each frame. */
export interface GoodsScene {
  /** The handover at the current stop, or null between them. */
  readonly stop: GoodsStop | null;
  /** What is in the vehicle now (`cargoAboard`). */
  readonly cargo: readonly GoodsKind[];
  /** The vehicle the goods ride in, or null for any (and on foot). */
  readonly kind: VehicleKind | null;
}

export interface GoodsFiguresSnapshot {
  /** The current stop's person: waiting, walking, handing, or null when none is drawn. */
  readonly stage: string | null;
  readonly action: "load" | "unload" | null;
  /** Items in someone's hands (the person at the stop, those walking off, the player on foot). */
  readonly inHands: number;
  /** Items drawn in the vehicle. */
  readonly onVehicle: number;
  readonly leaving: number;
  /** The current person's carrying pose, or null. */
  readonly carry: CarryKind | null;
  /** Where the current person stands (feet) and the kerb they wait on. */
  readonly person: { readonly x: number; readonly z: number } | null;
  readonly kerb: { readonly x: number; readonly z: number } | null;
  /** How far the door used for the handover is open, 0 to 1. */
  readonly door: number;
  /** Items in the hands of whoever holds them, world positions (for tests: they move with the hands). */
  readonly items: ReadonlyArray<{ readonly kind: GoodsKind; readonly x: number; readonly y: number; readonly z: number; readonly holder: string }>;
}

interface Leaver {
  figure: HumanFigure;
  items: THREE.Group[];
  kinds: GoodsKind[];
  from: THREE.Vector3;
  kerb: THREE.Vector3;
  away: THREE.Vector3;
  t: number;
  walk: number;
}

const turnTo = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

/** How a load of goods is held: one item by its own grip, several stacked in both arms. */
export function carryFor(items: readonly GoodsKind[]): CarryKind {
  return items.length === 1 ? GOODS_CARRY[items[0]!] : "box";
}

/** The scene for a city job's goods, or null when it has none. */
export function jobGoodsScene(job: Job | null, runner: JobRunner): GoodsScene | null {
  if (!job || !job.stops.some((s) => s.goods)) return null;
  return { stop: runner.goods, cargo: cargoAboard(job.stops.map((s) => s.goods), runner.stopNumber, runner.goods), kind: job.vehicle };
}

/** The scene for a stage's goods, or null when it has none. */
export function stageGoodsScene(mission: Mission | null, runner: MissionRunner): GoodsScene | null {
  if (!mission) return null;
  const goods = mission.objectives.map((o) => (o.type === "reach" ? o.goods : undefined));
  if (!goods.some((g) => g)) return null;
  // The vehicle of the stage's goods stops (any, on foot too, when they name none).
  const first = mission.objectives.find((o) => o.type === "reach" && o.goods);
  const mode = first?.type === "reach" ? first.mode : undefined;
  return { stop: runner.goods, cargo: cargoAboard(goods, runner.objectiveNumber, runner.goods), kind: mode && mode !== "foot" ? mode : null };
}

export class GoodsFigures {
  private figure: HumanFigure | null = null;
  /** The stop the figure belongs to, and how far its person had got last frame. */
  private stopOf: GoodsStop | null = null;
  private lastStage: string = "waiting";
  private readonly ids = new WeakMap<GoodsStop, number>();
  private nextId = 1;
  /** Goods in the current person's hands. */
  private held: THREE.Group[] = [];
  private heldKinds: GoodsKind[] = [];
  /** Goods drawn in the vehicle, in `cargo` order, and the vehicle they are in. */
  private onboard: Array<{ kind: GoodsKind; object: THREE.Group }> = [];
  private vehicle: Vehicle | null = null;
  /** The player's figure when it is carrying the goods on foot. */
  private carrier: HumanFigure | null = null;
  private carried: THREE.Group[] = [];
  private readonly leavers: Leaver[] = [];
  private readonly spare = new Map<string, HumanFigure[]>();
  private door = { leaf: -1, amount: 0 };
  private readonly v = new THREE.Vector3();
  private shown: GoodsFiguresSnapshot = { stage: null, action: null, inHands: 0, onVehicle: 0, leaving: 0, carry: null, person: null, kerb: null, door: 0, items: [] };

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly humans: HumanAssets,
  ) {}

  snapshot(): GoodsFiguresSnapshot {
    return this.shown;
  }

  /**
   * Once per drawn frame.
   * @param vehicle the vehicle the player drives, when the goods ride in its kind
   * @param onFoot the player's figure when on foot and the goods go with them (a stage with no vehicle)
   */
  frame(dt: number, scene: GoodsScene | null, at: { x: number; z: number }, vehicle: Vehicle | null, onFoot: HumanFigure | null): void {
    if (vehicle) this.vehicle = vehicle;
    const car = vehicle ?? (onFoot ? null : this.vehicle);
    const stop = scene?.stop ?? null;
    if (stop !== this.stopOf) this.release();
    this.stopOf = stop;

    // The person at the stop and what they hold.
    const person = stop?.person() ?? null;
    let wantDoor = 0;
    let carry: CarryKind | null = null;
    let personAt: { x: number; z: number } | null = null;
    // The goods changing hands at this stop, which are drawn moving rather than in their place.
    let moving: { from: "hands" | "vehicle"; share: number } | null = null;
    if (stop && person && scene) {
      const kerb = stop.goods.kerb;
      const near = Math.hypot(at.x - kerb.x, at.z - kerb.z) < SHOW_RADIUS;
      const load = stop.goods.action === "load";
      if (near || person.stage !== "waiting") {
        const figure = this.figureFor(stop);
        const stand = this.standPoint(car, onFoot, kerb);
        if (person.stage === "waiting") {
          figure.object.position.set(kerb.x, 0, kerb.z);
          const target = car ? car.body.position() : onFoot ? onFoot.object.position : stand;
          const close = Math.hypot(target.x - kerb.x, target.z - kerb.z) < 40;
          figure.object.rotation.set(0, turnTo(kerb, close ? target : stand), 0);
          figure.update(dt, 0, true);
        } else if (person.stage === "walking") {
          figure.object.position.set(kerb.x + (stand.x - kerb.x) * person.share, 0, kerb.z + (stand.z - kerb.z) * person.share);
          figure.object.rotation.set(0, turnTo(kerb, stand), 0);
          figure.update(dt, Math.hypot(stand.x - kerb.x, stand.z - kerb.z) / Math.max(0.3, person.walkSeconds), true);
          if (person.share > 0.7) wantDoor = 1;
        } else {
          // At the vehicle: facing its cargo place, the goods passing from hands to it (or back).
          figure.object.position.set(stand.x, 0, stand.z);
          const slot = this.slotWorld(car, onFoot, 0, stop.goods.items[0]!);
          figure.object.rotation.set(0, turnTo(stand, slot), 0);
          figure.update(dt, 0, true);
          wantDoor = 1;
          const swap = 0.5;
          if (load && person.share < swap) moving = { from: "hands", share: person.share / swap };
          if (!load && person.share >= swap) moving = { from: "vehicle", share: (person.share - swap) / (1 - swap) };
        }
        // Who holds the goods: the sender until they let go, the recipient once they have them.
        const holding = person.holder === "hands";
        carry = holding ? carryFor(stop.goods.items) : null;
        figure.setCarry(carry);
        this.lastStage = person.stage;
        personAt = { x: figure.object.position.x, z: figure.object.position.z };
        if (holding && !moving) this.hold(figure, stop.goods.items);
        else if (!moving) this.dropHeld();
      } else {
        this.hideFigure();
      }
    } else {
      this.hideFigure();
    }

    // Goods in the vehicle (or the player's hands on foot).
    const cargo = scene?.cargo ?? [];
    this.placeCargo(car, onFoot && !car ? onFoot : null, cargo);
    // The goods in motion between the hands and the vehicle.
    if (moving && stop && this.figure) this.moveBetween(stop, car, onFoot, moving);

    if (car) this.swingDoor(car, wantDoor, dt, stop ? this.standSide(car, stop.goods.kerb) : 1);
    const leaving = this.walkAway(dt);
    this.shown = {
      stage: personAt ? (person?.stage ?? null) : null,
      action: stop?.goods.action ?? null,
      inHands: this.held.length + this.carried.length + this.leavers.reduce((n, l) => n + l.items.length, 0) + (moving ? stop!.goods.items.length : 0),
      onVehicle: car ? this.onboard.length : 0,
      leaving,
      carry,
      person: personAt,
      kerb: stop?.goods.kerb ?? null,
      door: this.door.amount,
      items: this.itemList(),
    };
  }

  private itemList(): GoodsFiguresSnapshot["items"] {
    const out: Array<{ kind: GoodsKind; x: number; y: number; z: number; holder: string }> = [];
    const add = (list: THREE.Group[], kinds: readonly GoodsKind[], holder: string) =>
      list.forEach((o, i) => {
        o.getWorldPosition(this.v);
        out.push({ kind: kinds[i] ?? kinds[0]!, x: this.v.x, y: this.v.y, z: this.v.z, holder });
      });
    add(this.held, this.heldKinds, "person");
    add(this.carried, this.onboard.map((o) => o.kind), "player");
    for (const o of this.onboard) if (o.object.parent && o.object.parent !== this.scene) add([o.object], [o.kind], "vehicle");
    for (const l of this.leavers) add(l.items, l.kinds, "leaving");
    return out;
  }

  private idOf(stop: GoodsStop): number {
    let id = this.ids.get(stop);
    if (id === undefined) {
      id = this.nextId++;
      this.ids.set(stop, id);
    }
    return id;
  }

  /** Who stands at the kerb: a clerk or cook handing over, someone taking a delivery, a shopkeeper. */
  private castOf(stop: GoodsStop): Cast {
    const who = stop.goods.who;
    return who === "shopkeeper" ? "shopkeeper" : who === "sender" ? "sender" : who === "recipient" ? "recipient" : stop.goods.action === "load" ? "sender" : "recipient";
  }

  private figureFor(stop: GoodsStop): HumanFigure {
    const look = this.humans.look(this.castOf(stop), this.idOf(stop));
    if (this.figure && this.figure.person === look.person) {
      this.figure.object.visible = true;
      return this.figure;
    }
    if (this.figure) this.retire(this.figure);
    const spare = this.spare.get(look.person ?? "")?.pop();
    const figure = spare ?? this.humans.create(0xffffff, true, look.person);
    figure.setClothes(look.tint ?? 0xffffff);
    figure.object.visible = true;
    this.scene.add(figure.object);
    this.figure = figure;
    return figure;
  }

  private retire(figure: HumanFigure): void {
    figure.object.removeFromParent();
    figure.setCarry(null);
    const key = figure.person ?? "";
    const list = this.spare.get(key) ?? [];
    list.push(figure);
    this.spare.set(key, list);
  }

  private hideFigure(): void {
    if (this.figure) this.figure.object.visible = false;
    this.dropHeld();
  }

  /**
   * The stop has moved on (or ended): if its person had reached the vehicle they walk back to
   * the pavement and away, with the goods when they took them; otherwise they are simply gone.
   */
  private release(): void {
    const figure = this.figure;
    const stop = this.stopOf;
    this.figure = null;
    if (!figure || !stop) return;
    const reached = this.lastStage === "handing" || this.lastStage === "done";
    if (!reached || !figure.object.visible) {
      this.dropHeld();
      this.retire(figure);
      return;
    }
    const kerb = new THREE.Vector3(stop.goods.kerb.x, 0, stop.goods.kerb.z);
    const from = figure.object.position.clone();
    const away = kerb.clone().sub(from).setY(0);
    if (away.lengthSq() < 0.01) away.set(1, 0, 0);
    away.normalize();
    const kinds = stop.goods.action === "unload" ? [...stop.goods.items] : [];
    this.dropHeld();
    const items = kinds.map((k) => this.item(k));
    figure.setCarry(kinds.length ? carryFor(kinds) : null);
    this.leavers.push({ figure, items, kinds, from, kerb: kerb.addScaledVector(away, FARES.walkOff * 0.4), away, t: 0, walk: Math.max(0.3, from.distanceTo(kerb) / FARES.walkSpeed) });
    this.lastStage = "waiting";
  }

  private item(kind: GoodsKind): THREE.Group {
    const object = makeGoods(kind);
    this.scene.add(object);
    return object;
  }

  /** The current person holds these (made once per stop). */
  private hold(figure: HumanFigure, kinds: readonly GoodsKind[]): void {
    if (this.heldKinds.join() !== kinds.join()) {
      this.dropHeld();
      this.held = kinds.map((k) => this.item(k));
      this.heldKinds = [...kinds];
    }
    this.inHands(figure, this.held, this.heldKinds);
  }

  private dropHeld(): void {
    for (const o of this.held) o.removeFromParent();
    this.held = [];
    this.heldKinds = [];
  }

  /**
   * Put items in a figure's hands: a box rests on both hands (several stacked), a bag hangs
   * from the right hand by its handle. Turned with the figure.
   */
  private inHands(figure: HumanFigure, items: readonly THREE.Group[], kinds: readonly GoodsKind[]): void {
    const carry = carryFor(kinds);
    const base = this.handPoint(figure, carry);
    const yaw = figure.object.rotation.y;
    let y = carry === "bag" ? base.y - GOODS_HEIGHT[kinds[0]!] : base.y - 0.03;
    items.forEach((o, i) => {
      o.position.set(base.x, y, base.z);
      o.rotation.set(0, yaw, 0);
      y += GOODS_HEIGHT[kinds[i]!];
      o.visible = figure.object.visible;
    });
  }

  /** Where the hands are, world space: between both (a box), the right one (a bag). */
  private handPoint(figure: HumanFigure, carry: CarryKind): THREE.Vector3 {
    figure.object.updateMatrixWorld(true);
    const right = figure.object.getObjectByName("RightHand");
    const left = figure.object.getObjectByName("LeftHand");
    if (right && left) {
      const r = right.getWorldPosition(new THREE.Vector3());
      if (carry === "bag") return r;
      return r.add(left.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
    }
    // No hand bones: in front of the waist (the figure faces -Z).
    return figure.object.localToWorld(new THREE.Vector3(carry === "bag" ? -0.25 : 0, carry === "bag" ? 0.75 : 0.95, -0.35));
  }

  /** Which side the kerb is on for this vehicle: -1 left, 1 right. */
  private standSide(car: Vehicle, kerb: { x: number; z: number }): number {
    const local = car.object.worldToLocal(new THREE.Vector3(kerb.x, 0, kerb.z));
    return local.x > 0 ? 1 : -1;
  }

  private standPoint(car: Vehicle | null, onFoot: HumanFigure | null, kerb: { x: number; z: number }): { x: number; z: number } {
    if (car) {
      const place = CARGO[car.kind];
      const flip = place.mirror && this.standSide(car, kerb) > 0 ? -1 : 1;
      const p = car.object.localToWorld(new THREE.Vector3(place.stand.x * flip, -car.type.rideHeight, place.stand.z));
      return { x: p.x, z: p.z };
    }
    const at = onFoot?.object.position ?? new THREE.Vector3(kerb.x, 0, kerb.z);
    const dx = kerb.x - at.x;
    const dz = kerb.z - at.z;
    const d = Math.max(0.01, Math.hypot(dx, dz));
    // Face to face with the player, an arm's length apart.
    return d < 0.8 ? { x: kerb.x, z: kerb.z } : { x: at.x + (dx / d) * 0.75, z: at.z + (dz / d) * 0.75 };
  }

  /** The world position of the `index`-th item's place in the vehicle (or the player's hands). */
  private slotWorld(car: Vehicle | null, onFoot: HumanFigure | null, index: number, kind: GoodsKind): THREE.Vector3 {
    if (car) return car.object.localToWorld(this.slotLocal(car, index, kind, this.onboard.map((o) => o.kind)));
    if (onFoot) return this.handPoint(onFoot, carryFor([kind]));
    return new THREE.Vector3();
  }

  /** An item's place in a vehicle: the slots in turn, then stacked on them. */
  private slotLocal(car: Vehicle, index: number, kind: GoodsKind, kinds: readonly GoodsKind[]): THREE.Vector3 {
    const place = CARGO[car.kind];
    const flip = place.mirror && this.stopOf && this.standSide(car, this.stopOf.goods.kerb) > 0 ? -1 : 1;
    const n = place.slots.length;
    const slot = place.slots[index % n]!;
    let y = slot.y;
    for (let i = index % n; i < index; i += n) y += GOODS_HEIGHT[kinds[i] ?? kind];
    return new THREE.Vector3(slot.x * flip, y, slot.z);
  }

  /** Keep the goods drawn in the vehicle (or in the player's hands) in step with the rules. */
  private placeCargo(car: Vehicle | null, onFoot: HumanFigure | null, cargo: readonly GoodsKind[]): void {
    if (this.onboard.map((o) => o.kind).join() !== cargo.join() || (car && this.onboard[0]?.object.parent !== car.object)) {
      for (const o of this.onboard) o.object.removeFromParent();
      this.onboard = cargo.map((kind) => ({ kind, object: makeGoods(kind) }));
    }
    const kinds = cargo;
    if (car) {
      this.onboard.forEach((o, i) => {
        if (o.object.parent !== car.object) car.object.add(o.object);
        o.object.position.copy(this.slotLocal(car, i, o.kind, kinds));
        o.object.rotation.set(0, 0, 0);
        o.object.visible = true;
      });
    } else {
      for (const o of this.onboard) o.object.removeFromParent();
    }
    // On foot, with goods that go with the player: in the player's hands.
    const carrier = onFoot && cargo.length ? onFoot : null;
    if (this.carrier && this.carrier !== carrier) this.carrier.setCarry(null);
    this.carrier = carrier;
    if (carrier) {
      carrier.setCarry(carryFor(cargo));
      if (this.carried.length !== cargo.length) {
        for (const o of this.carried) o.removeFromParent();
        this.carried = cargo.map((k) => this.item(k));
      }
      this.inHands(carrier, this.carried, cargo);
    } else {
      for (const o of this.carried) o.removeFromParent();
      this.carried = [];
    }
  }

  /** The goods of this stop part way between the person's hands and their place in the vehicle. */
  private moveBetween(stop: GoodsStop, car: Vehicle | null, onFoot: HumanFigure | null, moving: { from: "hands" | "vehicle"; share: number }): void {
    const figure = this.figure!;
    const kinds = stop.goods.items;
    if (this.heldKinds.join() !== kinds.join()) {
      this.dropHeld();
      this.held = kinds.map((k) => this.item(k));
      this.heldKinds = [...kinds];
    }
    // Hands first, then the slots (an unload takes the first items in the vehicle; a load adds after those aboard).
    this.inHands(figure, this.held, kinds);
    const first = stop.goods.action === "load" ? this.onboard.length : 0;
    const t = moving.from === "hands" ? moving.share : 1 - moving.share;
    const w = t * t * (3 - 2 * t);
    this.held.forEach((o, i) => {
      const hand = o.position.clone();
      const slot = this.slotWorld(car, onFoot, first + i, kinds[i]!);
      // A small lift over the seat edge on the way.
      o.position.lerpVectors(hand, slot, w).y += Math.sin(w * Math.PI) * 0.12;
      if (car) o.rotation.set(0, car.body.yaw(), 0);
    });
  }

  private swingDoor(car: Vehicle, want: number, dt: number, side: number): void {
    const place = CARGO[car.kind];
    if (place.leaf === undefined) return;
    // The car's right rear door is leaf 2 when the kerb is on the right.
    const leaf = car.kind === "car" && side > 0 ? 2 : place.leaf;
    if (leaf !== this.door.leaf) {
      if (this.door.leaf >= 0 && this.door.amount > 0 && this.vehicle) this.vehicle.setPassengerDoor(this.door.leaf, 0);
      this.door = { leaf, amount: car.passengerDoor(leaf) };
    }
    if (want === 0 && this.door.amount === 0) return;
    const next = this.door.amount + Math.max(-DOOR_RATE * dt, Math.min(DOOR_RATE * dt, want - this.door.amount));
    car.setPassengerDoor(leaf, next);
    this.door.amount = next;
  }

  /** Those who have handed over or taken the goods walk back to the pavement, on a little, and are gone. */
  private walkAway(dt: number): number {
    for (let i = this.leavers.length - 1; i >= 0; i--) {
      const l = this.leavers[i]!;
      l.t += dt;
      const end = l.kerb.clone().addScaledVector(l.away, FARES.walkSpeed * LINGER);
      const [from, to, share] = l.t < l.walk ? [l.from, l.kerb, l.t / l.walk] : [l.kerb, end, Math.min(1, (l.t - l.walk) / LINGER)];
      l.figure.object.position.lerpVectors(from, to, share);
      l.figure.object.rotation.set(0, turnTo(from, to), 0);
      l.figure.object.visible = true;
      l.figure.update(dt, FARES.walkSpeed, true);
      if (l.items.length) this.inHands(l.figure, l.items, l.kinds);
      if (l.t >= l.walk + LINGER) {
        for (const o of l.items) o.removeFromParent();
        this.retire(l.figure);
        this.leavers.splice(i, 1);
      }
    }
    return this.leavers.length;
  }
}
