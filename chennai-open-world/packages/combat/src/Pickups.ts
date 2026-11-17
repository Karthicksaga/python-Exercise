/**
 * Weapons lying in the world: a glowing marker the player walks over to pick up a weapon or
 * rounds for it. A taken pickup comes back after a while. Pure logic; the game draws them.
 */
import type { WeaponId } from "./Weapons";

export interface PickupSpot {
  readonly id: string;
  readonly weapon: WeaponId;
  /** Rounds that come with it (0 for the bat). */
  readonly ammo: number;
  readonly x: number;
  readonly z: number;
}

/** Walking within this many metres of a pickup takes it (estimate: about an arm's reach and a step). */
export const PICKUP_RADIUS = 1.6;
/** Game seconds before a taken pickup is back (estimate). */
export const PICKUP_RESPAWN = 240;

export class WeaponPickups {
  /** Seconds until each taken pickup comes back. */
  private readonly away = new Map<string, number>();

  constructor(readonly spots: readonly PickupSpot[]) {}

  /** True while a pickup is lying there to be taken. */
  available(id: string): boolean {
    return !this.away.has(id);
  }

  /**
   * Advance by `dt`; a player on foot at (x, z) takes any pickup within reach.
   * @returns the pickups taken this step
   */
  update(dt: number, x: number, z: number, onFoot: boolean): PickupSpot[] {
    for (const [id, left] of this.away) {
      if (left - dt <= 0) this.away.delete(id);
      else this.away.set(id, left - dt);
    }
    if (!onFoot) return [];
    const taken: PickupSpot[] = [];
    for (const spot of this.spots) {
      if (this.away.has(spot.id) || Math.hypot(spot.x - x, spot.z - z) > PICKUP_RADIUS) continue;
      this.away.set(spot.id, PICKUP_RESPAWN);
      taken.push(spot);
    }
    return taken;
  }

  /** Every pickup back in place (new game). */
  reset(): void {
    this.away.clear();
  }
}
