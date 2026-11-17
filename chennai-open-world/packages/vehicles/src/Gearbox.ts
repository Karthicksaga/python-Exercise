/**
 * The driver's gear selector, like an automatic: P (park), R (reverse) and D (drive), plus the
 * accelerator and brake. Turns what the player presses into the physics controls.
 *
 * - D: GAS drives forwards, BRAKE brakes (and holds the vehicle once stopped).
 * - R: GAS drives backwards, BRAKE brakes.
 * - P: the vehicle is held still; GAS does nothing.
 * - Changing gear needs the vehicle nearly stopped. Asked for while moving, the gearbox brakes
 *   first and shifts once stopped (shown as N meanwhile); asking for the gear already engaged
 *   cancels that.
 * - The keyboard's two keys (W/S or the arrows) keep working the old way: forward drives, back
 *   brakes and, once stopped, shifts to R and reverses; forward in R brakes, then shifts to D.
 */
import type { VehicleControls } from "@cow/physics";
import { gearFor, type VehicleType } from "./specs";

export type GearSelection = "P" | "R" | "D";

/** Below this speed (m/s, about 4 km/h) the vehicle counts as stopped and can change gear. */
export const SHIFT_SPEED = 1;

export interface DriveInput {
  /** Accelerator held (touch GAS). */
  readonly gas: boolean;
  /** Brake held (touch BRAKE). */
  readonly brake: boolean;
  /** -1 (left) to 1 (right). */
  readonly steer: number;
  /** Keyboard forward (+1) or back (-1), which also shift between D and R by themselves. */
  readonly keys?: number;
}

const HOLD = 1;

export class Gearbox {
  private selected: GearSelection;
  private next: GearSelection | null = null;
  private hint: string | null = null;
  private gasBefore = false;
  /** Throttle sent last step: -1, 0 or 1 (for the HUD). */
  private throttle = 0;

  constructor(gear: GearSelection = "D") {
    this.selected = gear;
  }

  /** The gear engaged now. */
  get gear(): GearSelection {
    return this.selected;
  }

  /** The gear asked for while still moving, engaged once stopped; null when none. */
  get pending(): GearSelection | null {
    return this.next;
  }

  /** Start over in this gear, nothing pending (getting in or out). */
  reset(gear: GearSelection): void {
    this.selected = gear;
    this.next = null;
    this.hint = null;
    this.gasBefore = false;
    this.throttle = 0;
  }

  /**
   * Ask for a gear. Engaged at once when nearly stopped; otherwise the gearbox brakes first and
   * a short hint says so. Asking for the gear already engaged cancels a pending change.
   */
  select(gear: GearSelection, forwardSpeed: number): void {
    if (gear === this.selected) {
      this.next = null;
      return;
    }
    if (Math.abs(forwardSpeed) < SHIFT_SPEED) {
      this.selected = gear;
      this.next = null;
      return;
    }
    if (this.next !== gear) this.hint = `Stopping to shift to ${gear}`;
    this.next = gear;
  }

  /** Physics controls for one fixed step. */
  controls(input: DriveInput, forwardSpeed: number): VehicleControls {
    const stopped = Math.abs(forwardSpeed) < SHIFT_SPEED;
    let gas = input.gas;
    let brake = input.brake;
    const keys = input.keys ?? 0;
    if (!gas && !brake && keys !== 0) {
      // Two-key driving: the key's direction picks D or R once stopped, and brakes before that.
      const wanted: GearSelection = keys > 0 ? "D" : "R";
      const rollingAway = keys > 0 ? forwardSpeed < -SHIFT_SPEED : forwardSpeed > SHIFT_SPEED;
      if (this.selected !== wanted && (this.selected === "P" || !rollingAway)) this.select(wanted, forwardSpeed);
      if (this.selected === wanted && this.next === null) gas = true;
      else brake = true;
    }
    if (this.next !== null && stopped) {
      this.selected = this.next;
      this.next = null;
    }
    const steer = input.steer;
    let out: VehicleControls;
    if (this.next !== null || this.selected === "P") {
      if (this.selected === "P" && gas && !this.gasBefore) this.hint = "In P: select D to drive or R to reverse";
      out = { throttle: 0, steer, brake: HOLD };
    } else {
      const direction = this.selected === "R" ? -1 : 1;
      out = { throttle: gas ? direction : 0, steer, brake: brake ? 1 : 0 };
    }
    this.gasBefore = gas;
    this.throttle = out.throttle;
    return out;
  }

  /** A short message for the player (shift refused or delayed), once; then null. */
  consumeHint(): string | null {
    const hint = this.hint;
    this.hint = null;
    return hint;
  }

  /**
   * The HUD's gear: P, R, N while a change waits for the vehicle to stop, D when stopped in
   * drive, or D with the gear a driver would be in at this speed (D1, D2…).
   */
  label(type: VehicleType, forwardSpeed: number): string {
    if (this.next !== null) return "N";
    if (this.selected !== "D") return this.selected;
    const gear = gearFor(type, Math.max(0, forwardSpeed), Math.max(0, this.throttle));
    return /^\d+$/.test(gear) ? `D${gear}` : "D";
  }
}
