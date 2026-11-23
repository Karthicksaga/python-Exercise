/**
 * An ambulance patient on screen (a fare with `patient`, `FareStop` in `@cow/missions`): instead
 * of walking in, the patient lies on a wheeled stretcher at the kerb with a paramedic beside it.
 * Once the ambulance has stopped its rear doors open, the paramedic wheels the stretcher to the
 * back, lifts it in and climbs in after it, and the doors close. At the hospital the reverse:
 * the doors open, the stretcher comes out and is wheeled across the pavement towards the
 * entrance. Drawn from the fare's own state (the rules and their timings are the fare's), near
 * the player only. Patients are elderly or adult (cast "patient"), never children.
 */
import * as THREE from "three";
import { FARES, type FarePerson, type FareStop } from "@cow/missions";
import type { HumanAssets, HumanFigure } from "@cow/player";
import type { Vehicle } from "@cow/vehicles";
import { makeGoods } from "./goodsModels";

const SHOW_RADIUS = 220;
/** After the stop they carry on towards the entrance this long (seconds), then are gone. */
const LINGER = 4;
const DOOR_RATE = 2.5;
/** The patient's pale gown, when drawn with the player's model. */
const GOWN = 0xcfe3ef;

/**
 * The stretcher's way into the ambulance, relative to its chassis centre: from behind the rear
 * doors (`out`) to its place on the floor (`in`), the floor this far above the ground. The
 * ambulance's rear-door area (estimated). TODO: take these from the vehicle type's `cargo`
 * anchor once the vehicles branch lands.
 */
const AMBULANCE = { out: { x: 0, z: 3.7 }, in: { x: 0, z: 1.35 }, floor: 0.42, leaf: 1 } as const;
/** Mattress top on the trolley (metres), where the patient lies. */
const MATTRESS = 0.79;
/** The paramedic walks this far behind the trolley's centre, at its push bar (metres). */
const BEHIND = 1.25;

export interface StretcherSnapshot {
  /** The patient's stage (`FareStage`), or null when nothing is drawn. */
  readonly stage: string | null;
  /** Where the stretcher is (its centre, on the ground or the ambulance floor). */
  readonly stretcher: { readonly x: number; readonly y: number; readonly z: number } | null;
  readonly paramedic: { readonly x: number; readonly z: number } | null;
  /** How far the rear doors are open, 0 to 1. */
  readonly door: number;
  /** The patient lies on it (true) rather than walking. */
  readonly lying: boolean;
  readonly leaving: boolean;
}

interface Pose {
  x: number;
  y: number;
  z: number;
  /** The trolley's heading: the way its foot end points (0 = -Z). */
  yaw: number;
  /** Paramedic beside (at the kerb) or behind it pushing; null when they are in the ambulance. */
  medic: "beside" | "behind" | null;
  medicSpeed: number;
}

const heading = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
const ease = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
const turn = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export class StretcherFigures {
  private trolley: THREE.Group | null = null;
  private patient: HumanFigure | null = null;
  private medic: HumanFigure | null = null;
  private stopOf: FareStop | null = null;
  private stop = 0;
  private door = 0;
  private car: Vehicle | null = null;
  /** After the hospital drop: on towards the entrance, from here. */
  private leaving: { from: Pose; away: { x: number; z: number }; t: number } | null = null;
  private last: Pose | null = null;
  private lastStage: string | null = null;
  private shown: StretcherSnapshot = { stage: null, stretcher: null, paramedic: null, door: 0, lying: false, leaving: false };

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly humans: HumanAssets,
  ) {}

  snapshot(): StretcherSnapshot {
    return this.shown;
  }

  /**
   * Once per drawn frame.
   * @param stop the patient fare under way, or null
   * @param marker the stop's marker (the road side of the kerb)
   * @param vehicle the ambulance the player drives
   */
  frame(dt: number, stop: FareStop | null, marker: { x: number; z: number } | null, at: { x: number; z: number }, vehicle: Vehicle | null): void {
    if (vehicle) this.car = vehicle;
    const car = vehicle ?? this.car;
    if (stop !== this.stopOf) {
      // A drop just finished: the stretcher carries on to the entrance by itself.
      if (this.stopOf && this.lastStage === "leaving" && this.last && this.stopOf.fare.alight) {
        const kerb = this.stopOf.fare.kerb;
        const away = { x: kerb.x - this.last.x, z: kerb.z - this.last.z };
        const d = Math.max(0.01, Math.hypot(away.x, away.z));
        this.leaving = { from: { ...this.last }, away: { x: away.x / d, z: away.z / d }, t: 0 };
      }
      this.stopOf = stop;
      this.stop++;
    }
    const person = stop?.people()[0] ?? null;
    let pose: Pose | null = null;
    let wantDoor = 0;
    if (stop && person && car && marker) {
      const near = Math.hypot(at.x - stop.fare.kerb.x, at.z - stop.fare.kerb.z) < SHOW_RADIUS;
      const r = this.poseFor(stop, person, car, marker);
      pose = near || person.stage !== "waiting" ? r.pose : null;
      wantDoor = r.door;
    }
    this.lastStage = person?.stage ?? null;
    if (pose) {
      this.leaving = null;
      this.last = pose;
    } else if (this.leaving) {
      // Wheeled on across the pavement towards the hospital entrance.
      const l = this.leaving;
      l.t += dt;
      const s = Math.min(1, l.t / LINGER);
      pose = { x: l.from.x + l.away.x * FARES.walkSpeed * LINGER * s, y: 0, z: l.from.z + l.away.z * FARES.walkSpeed * LINGER * s, yaw: heading({ x: 0, z: 0 }, l.away), medic: "behind", medicSpeed: FARES.walkSpeed };
      if (l.t >= LINGER) {
        this.leaving = null;
        pose = null;
      }
    }
    this.draw(pose, dt, stop);
    if (car) this.swingDoor(car, wantDoor, dt);
    this.shown = {
      stage: pose ? (person?.stage ?? "gone") : null,
      stretcher: pose ? { x: pose.x, y: pose.y, z: pose.z } : null,
      paramedic: pose && pose.medic && this.medic ? { x: this.medic.object.position.x, z: this.medic.object.position.z } : null,
      door: this.door,
      lying: pose !== null,
      leaving: this.leaving !== null,
    };
  }

  /** Where the stretcher is in each stage of the patient's fare, and whether the rear doors are wanted open. */
  private poseFor(stop: FareStop, person: FarePerson, car: Vehicle, marker: { x: number; z: number }): { pose: Pose | null; door: number } {
    const kerb = stop.fare.kerb;
    const ground = -car.type.rideHeight;
    const local = (x: number, y: number, z: number) => car.object.localToWorld(new THREE.Vector3(x, y, z));
    const out = local(AMBULANCE.out.x, ground, AMBULANCE.out.z);
    const inside = local(AMBULANCE.in.x, ground + AMBULANCE.floor, AMBULANCE.in.z);
    const outFloor = local(AMBULANCE.out.x, ground, AMBULANCE.out.z);
    // Into the ambulance foot end first: its heading is the vehicle's forwards.
    const inward = car.body.yaw();
    // Waiting along the kerb, foot end towards the marker's side of the road.
    const along = heading(kerb, marker) + Math.PI / 2;
    const board = person.action === "board";
    const walkTo = (from: THREE.Vector3 | { x: number; z: number }, to: THREE.Vector3 | { x: number; z: number }, share: number, speed: number): Pose => ({
      x: from.x + (to.x - from.x) * share,
      y: 0,
      z: from.z + (to.z - from.z) * share,
      yaw: heading(from, to),
      medic: "behind",
      medicSpeed: speed,
    });
    const speed = Math.hypot(out.x - kerb.x, out.z - kerb.z) / Math.max(0.3, person.walkSeconds);
    switch (person.stage) {
      case "waiting":
        return { pose: { x: kerb.x, y: 0, z: kerb.z, yaw: along, medic: "beside", medicSpeed: 0 }, door: 0 };
      case "walking": {
        const p = walkTo(kerb, out, person.share, speed);
        // Turn to line up with the doorway over the last few metres.
        p.yaw = turn(p.yaw, inward, ease((person.share - 0.6) / 0.4));
        return { pose: p, door: person.share > 0.5 ? 1 : 0 };
      }
      case "entering":
      case "exiting": {
        // Lifted up to the floor in the first third, rolled in along it after (out: the reverse).
        const share = person.stage === "entering" ? person.share : 1 - person.share;
        const lift = ease(share / 0.3);
        const roll = ease((share - 0.3) / 0.7);
        const x = outFloor.x + (inside.x - outFloor.x) * roll;
        const z = outFloor.z + (inside.z - outFloor.z) * roll;
        return { pose: { x, y: AMBULANCE.floor * lift, z, yaw: inward, medic: share < 0.92 ? "behind" : null, medicSpeed: share > 0.3 ? 0.8 : 0 }, door: 1 };
      }
      case "leaving": {
        // From behind the ambulance across to the kerb and on onto the pavement.
        const away = { x: kerb.x - marker.x, z: kerb.z - marker.z };
        const d = Math.max(0.01, Math.hypot(away.x, away.z));
        const end = { x: kerb.x + (away.x / d) * FARES.walkOff, z: kerb.z + (away.z / d) * FARES.walkOff };
        const p = walkTo(out, end, person.share, speed);
        p.yaw = turn(inward + Math.PI, p.yaw, ease(person.share / 0.25));
        return { pose: p, door: person.share < 0.4 ? 1 : 0 };
      }
      default:
        // Inside (riding there, or in after the pick-up), or gone.
        void board;
        return { pose: null, door: 0 };
    }
  }

  private draw(pose: Pose | null, dt: number, stop: FareStop | null): void {
    if (!pose) {
      if (this.trolley) this.trolley.visible = false;
      if (this.patient) this.patient.object.visible = false;
      if (this.medic) this.medic.object.visible = false;
      return;
    }
    this.trolley ??= makeGoods("stretcher");
    if (!this.trolley.parent) this.scene.add(this.trolley);
    this.trolley.visible = true;
    // The model's head (push bar) end is +Z; heading is where the foot end points.
    this.trolley.position.set(pose.x, pose.y, pose.z);
    this.trolley.rotation.set(0, pose.yaw, 0);
    const index = this.stop;
    const patient = this.person("patient", index, stop);
    patient.object.visible = true;
    patient.setDown(true);
    // Lying on the mattress: `setDown` tips the figure onto its back, centred on its root with the
    // head towards its -Z, so it is turned to put the head on the pillow (the trolley's +Z end).
    const onBed = this.trolley.localToWorld(new THREE.Vector3(0, MATTRESS - 0.02, 0.05));
    patient.object.position.copy(onBed);
    patient.object.rotation.set(0, pose.yaw + Math.PI, 0);
    const medic = this.person("paramedic", index, stop);
    if (!pose.medic) {
      medic.object.visible = false;
      return;
    }
    medic.object.visible = true;
    medic.setCarry(pose.medic === "behind" ? "push" : null);
    const spot = pose.medic === "behind" ? new THREE.Vector3(0, 0, BEHIND) : new THREE.Vector3(0.75, 0, 0.6);
    const p = this.trolley.localToWorld(spot);
    medic.object.position.set(p.x, pose.y > 0.05 && pose.medic === "behind" ? Math.min(pose.y, 0) : 0, p.z);
    medic.object.rotation.set(0, pose.medic === "behind" ? pose.yaw : pose.yaw + Math.PI / 2, 0);
    medic.update(dt, pose.medicSpeed, true);
  }

  private person(kind: "patient" | "paramedic", index: number, stop: FareStop | null): HumanFigure {
    const look = this.humans.look(kind, index);
    let figure = kind === "patient" ? this.patient : this.medic;
    if (!figure || figure.person !== look.person) {
      figure?.object.removeFromParent();
      figure = this.humans.create(0xffffff, true, look.person);
      this.scene.add(figure.object);
      if (kind === "patient") this.patient = figure;
      else this.medic = figure;
    }
    figure.setClothes(look.tint ?? (kind === "patient" ? GOWN : 0xa9c9de));
    void stop;
    return figure;
  }

  private swingDoor(car: Vehicle, want: number, dt: number): void {
    if (car.kind !== "ambulance") return;
    if (want === 0 && this.door === 0) return;
    this.door += Math.max(-DOOR_RATE * dt, Math.min(DOOR_RATE * dt, want - this.door));
    car.setPassengerDoor(AMBULANCE.leaf, this.door);
  }
}
