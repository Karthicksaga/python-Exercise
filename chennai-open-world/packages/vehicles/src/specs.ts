/** Handling and size of each vehicle type. Pure numbers; the look is in `models.ts`. */
import type { VehicleSpec } from "@cow/physics";

export type VehicleKind = "car" | "auto" | "bike" | "ambulance" | "bus";

export interface VehicleType {
  readonly kind: VehicleKind;
  /** Name shown to the player. */
  readonly label: string;
  readonly physics: VehicleSpec;
  /** Height of the chassis centre above the ground when parked. */
  readonly rideHeight: number;
  /** Camera distance while driving. */
  readonly cameraDistance: number;
  /**
   * Where a visible rider sits, relative to the chassis centre (the point between their feet
   * when standing). Omitted for closed vehicles, where the driver is hidden.
   */
  readonly seat?: { readonly y: number; readonly z: number };
  /**
   * Where the driver of an AI vehicle sits (the point between their feet, relative to the chassis
   * centre). Indian vehicles are right-hand drive: +X is the right side when facing forward (-Z).
   * Estimated per model, not measured.
   */
  readonly driver?: { readonly x: number; readonly y: number; readonly z: number };
  /** Open two-wheelers lean into corners. */
  readonly leans?: boolean;
  /** Forward gears shown on the HUD. */
  readonly gears: number;
  /** Has a siren and lights (the horn button switches them). */
  readonly siren?: boolean;
}

export const VEHICLE_TYPES: Readonly<Record<VehicleKind, VehicleType>> = {
  car: {
    kind: "car",
    label: "Hatchback",
    rideHeight: 0.72,
    driver: { x: 0.36, y: -0.8, z: -0.15 },
    cameraDistance: 8.5,
    gears: 5,
    physics: {
      halfExtents: { x: 0.82, y: 0.42, z: 1.95 },
      mass: 950,
      wheels: [
        { x: -0.74, y: -0.12, z: -1.25, radius: 0.32, steers: true, driven: true },
        { x: 0.74, y: -0.12, z: -1.25, radius: 0.32, steers: true, driven: true },
        { x: -0.74, y: -0.12, z: 1.25, radius: 0.32, steers: false, driven: false },
        { x: 0.74, y: -0.12, z: 1.25, radius: 0.32, steers: false, driven: false },
      ],
      engineForce: 5600,
      maxSpeed: 23, // about 83 km/h
      maxSteer: 0.6,
      brakeForce: 95,
      drift: 0.55, // the tail steps out in fast, full-lock corners; a countersteer catches it
    },
  },
  auto: {
    kind: "auto",
    label: "Auto-rickshaw",
    rideHeight: 0.7,
    cameraDistance: 7,
    gears: 4,
    seat: { y: -0.72, z: -0.32 },
    driver: { x: 0, y: -0.72, z: -0.4 },
    physics: {
      halfExtents: { x: 0.66, y: 0.45, z: 1.3 },
      mass: 420,
      // Three wheels: one steered at the front, two driven at the back.
      wheels: [
        { x: 0, y: -0.14, z: -1.0, radius: 0.24, steers: true, driven: false },
        { x: -0.6, y: -0.14, z: 0.8, radius: 0.24, steers: false, driven: true },
        { x: 0.6, y: -0.14, z: 0.8, radius: 0.24, steers: false, driven: true },
      ],
      engineForce: 1900,
      maxSpeed: 14, // about 50 km/h
      maxSteer: 0.75,
      brakeForce: 50,
      drift: 0.9, // high because it is slow: only a small twitch near top speed
    },
  },
  bike: {
    kind: "bike",
    label: "Motorbike",
    rideHeight: 0.62,
    cameraDistance: 6.5,
    gears: 5,
    seat: { y: -0.7, z: 0.3 },
    driver: { x: 0, y: -0.7, z: 0.3 },
    leans: true,
    physics: {
      halfExtents: { x: 0.32, y: 0.36, z: 1.0 },
      mass: 190,
      // Two wheels in line. The chassis cannot roll, so it stays upright by itself.
      wheels: [
        { x: 0, y: -0.02, z: -0.72, radius: 0.3, steers: true, driven: false },
        { x: 0, y: -0.02, z: 0.68, radius: 0.3, steers: false, driven: true },
      ],
      engineForce: 1500,
      maxSpeed: 26, // about 94 km/h
      maxSteer: 0.55,
      brakeForce: 28,
      // No `drift`: a two-wheeler never slides; the physics keeps it in line.
    },
  },
  ambulance: {
    kind: "ambulance",
    label: "Ambulance",
    rideHeight: 0.95,
    cameraDistance: 10.5,
    gears: 5,
    siren: true,
    physics: {
      halfExtents: { x: 0.98, y: 0.8, z: 2.5 },
      mass: 2300,
      wheels: [
        { x: -0.86, y: -0.42, z: -1.6, radius: 0.38, steers: true, driven: true },
        { x: 0.86, y: -0.42, z: -1.6, radius: 0.38, steers: true, driven: true },
        { x: -0.86, y: -0.42, z: 1.55, radius: 0.38, steers: false, driven: false },
        { x: 0.86, y: -0.42, z: 1.55, radius: 0.38, steers: false, driven: false },
      ],
      engineForce: 12500,
      maxSpeed: 25, // about 90 km/h
      maxSteer: 0.55,
      brakeForce: 230,
      drift: 0.45, // heavier: slides later and less than the hatchback
    },
  },
  bus: {
    kind: "bus",
    label: "City bus",
    rideHeight: 1.25,
    driver: { x: 0.8, y: -0.45, z: -4.15 },
    cameraDistance: 15,
    gears: 5,
    physics: {
      // A short city bus (about 10 m), so it fits Anna Nagar's side streets.
      halfExtents: { x: 1.25, y: 1.1, z: 5.0 },
      mass: 9000,
      wheels: [
        { x: -1.08, y: -0.72, z: -3.3, radius: 0.5, steers: true, driven: false },
        { x: 1.08, y: -0.72, z: -3.3, radius: 0.5, steers: true, driven: false },
        { x: -1.08, y: -0.72, z: 2.8, radius: 0.5, steers: false, driven: true },
        { x: 1.08, y: -0.72, z: 2.8, radius: 0.5, steers: false, driven: true },
      ],
      engineForce: 34000,
      maxSpeed: 17, // about 60 km/h
      maxSteer: 0.62,
      brakeForce: 900,
      drift: 0.95, // slow and long: the rear only loosens enough to tighten the line
    },
  },
};

/**
 * Gear shown on the HUD: R when reversing, N when stopped, otherwise the gear a driver would
 * be in at this share of top speed. Display only; the engine has no gearbox.
 */
export function gearFor(type: VehicleType, forwardSpeed: number, throttle: number): string {
  if (forwardSpeed < -0.4 || (throttle < 0 && forwardSpeed < 0.4)) return "R";
  if (Math.abs(forwardSpeed) < 0.4 && throttle <= 0) return "N";
  const share = Math.max(0, forwardSpeed) / type.physics.maxSpeed;
  return String(Math.min(type.gears, 1 + Math.floor(share * type.gears * 1.05)));
}

/** True when the HUD gear went up a forward gear (2 → 3), for the gear-change sound. */
export function shiftedUp(from: string, to: string): boolean {
  const a = Number(from);
  const b = Number(to);
  return from !== "" && Number.isInteger(a) && Number.isInteger(b) && a >= 1 && b > a;
}
