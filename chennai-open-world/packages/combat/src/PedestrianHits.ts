/**
 * What happens when the player's vehicle hits a pedestrian: whether it touched them, how bad it
 * was (by impact speed), where they end up, what it costs the player, and how long a person
 * lies on the road. Pure logic; the game moves the people and shows the messages.
 *
 * Kept non-graphic on purpose: a person hit hard enough is knocked down and lies on the road.
 * There is no blood or injury shown.
 */

export type HitOutcome = "stumble" | "injured" | "killed";

/**
 * All the numbers in one place. They are game-design estimates, not a medical or crash model:
 * published studies show a pedestrian's risk of death rising steeply between about 30 and
 * 60 km/h of impact speed, but in the game a single speed decides each outcome.
 */
export const PEDESTRIAN_HIT = {
  /** Below this impact speed (m/s, about 7 km/h) the vehicle only nudges the person. */
  minSpeed: 2,
  /** From this speed (m/s, about 16 km/h) the person is knocked down and injured. */
  injuredFrom: 4.5,
  /** From this speed (m/s, 45 km/h) the person is killed. */
  killedFrom: 12.5,
  /** Room a standing person takes up, as a circle, metres. */
  personRadius: 0.35,
  /** A person's mass for the vehicle's loss of speed, kg. */
  personMass: 70,
  /** Fine, rupees, and reputation lost (out of 100) for each outcome. */
  fine: { stumble: 0, injured: 1500, killed: 5000 },
  reputation: { stumble: 0, injured: 8, killed: 20 },
  /** An injured person lies this long, seconds, then gets up and limps away. */
  injuredDown: 5,
  /** Limping pace, m/s, and for how long, seconds. */
  limpSpeed: 0.6,
  limpFor: 30,
  /** A person who was killed stays at least this long, seconds... */
  killedStay: 25,
  /** ...and is then removed once the player is this far away, metres, or after `killedMax` seconds anyway. */
  removeBeyond: 35,
  killedMax: 90,
  /** A person who stumbled cannot be hit again for this long, seconds (they are stepping away). */
  stumbleGrace: 1.5,
  /** People within this distance of a hit react, metres, for this long, seconds. */
  scareRadius: 16,
  scareFor: 6,
  /** Furthest a person is thrown, metres. */
  maxThrow: 8,
} as const;

/** Outcome of an impact at this speed (m/s), or null when too slow to count. */
export function hitOutcome(speed: number): HitOutcome | null {
  const s = Math.abs(speed);
  if (s < PEDESTRIAN_HIT.minSpeed) return null;
  if (s < PEDESTRIAN_HIT.injuredFrom) return "stumble";
  if (s < PEDESTRIAN_HIT.killedFrom) return "injured";
  return "killed";
}

/** Fine (rupees) and reputation lost for an outcome. */
export function hitPenalty(outcome: HitOutcome): { fine: number; reputation: number } {
  return { fine: PEDESTRIAN_HIT.fine[outcome], reputation: PEDESTRIAN_HIT.reputation[outcome] };
}

/**
 * How far the person ends up from where they were hit, along the vehicle's direction of
 * travel, metres. A stumble is a step aside; a knock-down grows with the square of the speed.
 */
export function throwDistance(outcome: HitOutcome, speed: number): number {
  if (outcome === "stumble") return 0.4;
  return Math.min(PEDESTRIAN_HIT.maxThrow, 1 + 0.035 * speed * speed);
}

/**
 * Share of its speed the vehicle keeps: momentum shared with the person (a car hardly slows,
 * a motorbike loses more).
 */
export function speedKept(vehicleMass: number): number {
  return vehicleMass / (vehicleMass + PEDESTRIAN_HIT.personMass);
}

/** The player's vehicle as the rules see it. Heading 0 faces -Z, positive turning left. */
export interface VehicleMotion {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  /** Velocity over the ground, m/s. */
  readonly vx: number;
  readonly vz: number;
  /** Half the width and half the length of its box, metres. */
  readonly halfWidth: number;
  readonly halfLength: number;
}

/**
 * Whether the vehicle touches a person at (x, z) now or within the next `lead` seconds of
 * travel. Looking a little ahead catches the person before the physics engine stops the vehicle
 * against their collision box.
 */
export function vehicleTouches(vehicle: VehicleMotion, x: number, z: number, lead: number): boolean {
  const r = PEDESTRIAN_HIT.personRadius;
  const fx = -Math.sin(vehicle.yaw);
  const fz = -Math.cos(vehicle.yaw);
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const t = (lead * i) / steps;
    const rx = x - (vehicle.x + vehicle.vx * t);
    const rz = z - (vehicle.z + vehicle.vz * t);
    const along = rx * fx + rz * fz;
    const side = rx * fz - rz * fx;
    if (Math.abs(along) <= vehicle.halfLength + r && Math.abs(side) <= vehicle.halfWidth + r) return true;
  }
  return false;
}

/**
 * Where a person hit at (x, z) comes to rest (before walls are taken into account): thrown
 * along the direction of travel and pushed sideways clear of the vehicle's path.
 */
export function restingSpot(vehicle: VehicleMotion, x: number, z: number, outcome: HitOutcome): { x: number; z: number; dx: number; dz: number; distance: number } {
  const speed = Math.hypot(vehicle.vx, vehicle.vz);
  const ux = speed > 0.01 ? vehicle.vx / speed : -Math.sin(vehicle.yaw);
  const uz = speed > 0.01 ? vehicle.vz / speed : -Math.cos(vehicle.yaw);
  // Which side of the path the person was on (along the side vector (-uz, ux)); they are pushed further that way.
  const lateral = (x - vehicle.x) * -uz + (z - vehicle.z) * ux;
  const sign = lateral >= 0 ? 1 : -1;
  const clearance = Math.max(0, vehicle.halfWidth + PEDESTRIAN_HIT.personRadius + 0.5 - Math.abs(lateral));
  const forward = throwDistance(outcome, speed);
  const dx = ux * forward + -uz * sign * clearance;
  const dz = uz * forward + ux * sign * clearance;
  const distance = Math.hypot(dx, dz);
  return { x: x + dx, z: z + dz, dx: distance > 0 ? dx / distance : ux, dz: distance > 0 ? dz / distance : uz, distance };
}

export type CasualtyState = "stumbled" | "down" | "limping" | "dead";

export interface Casualty {
  readonly id: number;
  state: CasualtyState;
  /** Seconds in the current state. */
  time: number;
}

/** Changes the game must act on: someone gets up, stops limping, or is removed. */
export type CasualtyChange = { readonly id: number; readonly type: "getsUp" | "recovered" | "remove" };

/** The people the player has hit, by the id of their pedestrian agent, and their timers. */
export class Casualties {
  private readonly byId = new Map<number, Casualty>();

  /** Record a hit. A new hit replaces whatever happened to that person before. */
  hit(id: number, outcome: HitOutcome): void {
    const state: CasualtyState = outcome === "stumble" ? "stumbled" : outcome === "injured" ? "down" : "dead";
    this.byId.set(id, { id, state, time: 0 });
  }

  /** Whether the vehicle can hit this person now (not lying down, not just stumbled). */
  canHit(id: number): boolean {
    const c = this.byId.get(id);
    if (!c) return true;
    if (c.state === "stumbled") return c.time >= PEDESTRIAN_HIT.stumbleGrace;
    return c.state === "limping";
  }

  /** True while the person lies on the road (injured or killed). */
  isDown(id: number): boolean {
    const state = this.byId.get(id)?.state;
    return state === "down" || state === "dead";
  }

  get(id: number): Casualty | undefined {
    return this.byId.get(id);
  }

  list(): Casualty[] {
    return [...this.byId.values()];
  }

  /** Forget a person (their agent was moved elsewhere). */
  forget(id: number): void {
    this.byId.delete(id);
  }

  clear(): void {
    this.byId.clear();
  }

  /**
   * Advance the timers.
   * @param distance how far the player is from a person, metres (the dead are removed out of the player's way)
   */
  update(dt: number, distance: (id: number) => number): CasualtyChange[] {
    const changes: CasualtyChange[] = [];
    for (const c of [...this.byId.values()]) {
      c.time += dt;
      if (c.state === "stumbled" && c.time >= PEDESTRIAN_HIT.stumbleGrace) {
        this.byId.delete(c.id);
      } else if (c.state === "down" && c.time >= PEDESTRIAN_HIT.injuredDown) {
        c.state = "limping";
        c.time = 0;
        changes.push({ id: c.id, type: "getsUp" });
      } else if (c.state === "limping" && c.time >= PEDESTRIAN_HIT.limpFor) {
        this.byId.delete(c.id);
        changes.push({ id: c.id, type: "recovered" });
      } else if (c.state === "dead" && c.time >= PEDESTRIAN_HIT.killedStay && (distance(c.id) > PEDESTRIAN_HIT.removeBeyond || c.time >= PEDESTRIAN_HIT.killedMax)) {
        this.byId.delete(c.id);
        changes.push({ id: c.id, type: "remove" });
      }
    }
    return changes;
  }
}
