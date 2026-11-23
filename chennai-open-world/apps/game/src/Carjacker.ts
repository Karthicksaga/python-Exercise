/**
 * Taking a vehicle from AI traffic (carjacking). The rules are in `@cow/ai` (`Carjack.ts`): which
 * traffic vehicle can be taken (car, auto, motorbike; stopped or crawling; within reach) and which
 * spare drivable vehicle stands in for it. This module does the swap: the traffic agent leaves
 * the traffic (`Population.takeTraffic`), a drivable `Vehicle` of the same kind and colour takes
 * its place and heading with the same person seated at the wheel, and once the player has pulled
 * them out (`Boarder`'s "pull" phase) the driver becomes a pedestrian who runs off
 * (`Population.releaseDriver`).
 *
 * The spare vehicles are kept to `CARJACK.perKind` per kind and reused (moved, repainted), so
 * taking vehicles never adds bodies, models or draw calls without bound. A taken vehicle the
 * player leaves stays parked where it is until its slot is needed again.
 */
import type * as THREE from "three";
import { CARJACK, chooseJackSlot, pickCarjack, type JackCandidate } from "@cow/ai";
import type { PhysicsWorld } from "@cow/physics";
import type { HumanAssets } from "@cow/player";
import { Vehicle } from "@cow/vehicles";
import type { Population } from "./Population";

interface Slot {
  readonly vehicle: Vehicle;
  usedAt: number;
}

/** The vehicle being taken, its driver still at the wheel until pulled out. */
interface Pending {
  readonly vehicle: Vehicle;
  readonly figure: THREE.Object3D;
}

export class Carjacker {
  private readonly slots: Slot[] = [];
  private pending: Pending | null = null;
  private handed = 0;
  /** Drivers pulled out so far, and the walker who became the last one (tests and debugging). */
  private pulledCount = 0;
  private lastDriver: number | null = null;

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly physics: PhysicsWorld,
    private readonly humans: HumanAssets,
    private readonly population: Population,
    /** The game's vehicle list: new spare vehicles are appended to it. */
    private readonly vehicles: Vehicle[],
  ) {}

  /** The traffic vehicle the player standing at `at` could take now, or null. */
  candidate(at: { x: number; z: number }): JackCandidate | null {
    return pickCarjack(at, this.population.jackCandidates(at, CARJACK.reach + 8));
  }

  /**
   * Take a traffic vehicle: it leaves the traffic and a drivable one with its driver at the
   * wheel is put in its place. Returns that vehicle (the game starts the get-in sequence with a
   * pull), or null when it can no longer be taken (it drove off).
   * @param inUse vehicles that must not be moved (the one driven or being got into)
   */
  take(candidate: JackCandidate, focus: { x: number; z: number }, inUse: (vehicle: Vehicle) => boolean): Vehicle | null {
    // Someone still sitting in a vehicle from an earlier take that never finished: out they go.
    this.release(focus);
    const taken = this.population.takeTraffic(candidate.id, focus);
    if (!taken) return null;
    const choice = chooseJackSlot(
      this.slots.map((s) => ({ kind: s.vehicle.kind, color: s.vehicle.color, free: !inUse(s.vehicle), usedAt: s.usedAt })),
      taken.kind,
      taken.color,
    );
    let slot: Slot;
    if (choice === "new") {
      const count = this.slots.filter((s) => s.vehicle.kind === taken.kind).length;
      const vehicle = new Vehicle(`jacked-${taken.kind}-${count}`, taken.kind, this.physics, taken, taken.heading, taken.color);
      this.scene.add(vehicle.object);
      this.vehicles.push(vehicle);
      slot = { vehicle, usedAt: 0 };
      this.slots.push(slot);
    } else {
      slot = this.slots[choice]!;
      slot.vehicle.repaint(taken.color);
      slot.vehicle.setDoor(0);
    }
    slot.usedAt = ++this.handed;
    const vehicle = slot.vehicle;
    vehicle.body.teleport({ x: taken.x, y: vehicle.type.rideHeight + 0.1, z: taken.z }, taken.heading);
    vehicle.sync(0, 1);
    // The same person at the wheel as in the traffic vehicle, until pulled out.
    const figure = this.humans.seatedStatic(taken.tint, vehicle.type.pose, taken.person);
    const seat = vehicle.type.driver;
    figure.position.set(seat.x, seat.y, seat.z);
    vehicle.object.add(figure);
    this.pending = { vehicle, figure };
    return vehicle;
  }

  /**
   * The driver is out of the seat (the "pulled" event, or the sequence was stopped): the seated
   * figure goes and a pedestrian appears beside the door, running off from the player at `from`.
   */
  release(from: { x: number; z: number }): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    pending.figure.parent?.remove(pending.figure);
    const { vehicle } = pending;
    vehicle.object.updateMatrixWorld(true);
    // Beside the entry point, a step further out from the body.
    const entry = vehicle.type.entry;
    const p = vehicle.body.position();
    const yaw = vehicle.body.yaw();
    const lx = entry.point.x + entry.side * 0.9;
    const lz = entry.point.z;
    const x = p.x + Math.cos(yaw) * lx + Math.sin(yaw) * lz;
    const z = p.z - Math.sin(yaw) * lx + Math.cos(yaw) * lz;
    this.lastDriver = this.population.releaseDriver(x, z, from);
    this.pulledCount++;
  }

  /** Whether this vehicle is one of the spares for taken traffic. */
  owns(vehicle: Vehicle): boolean {
    return this.slots.some((s) => s.vehicle === vehicle);
  }

  snapshot(): { spares: Array<{ id: string; kind: string; color: number }>; pending: string | null; pulled: number; lastDriver: number | null } {
    return {
      spares: this.slots.map((s) => ({ id: s.vehicle.id, kind: s.vehicle.kind, color: s.vehicle.color })),
      pending: this.pending?.vehicle.id ?? null,
      pulled: this.pulledCount,
      lastDriver: this.lastDriver,
    };
  }
}
