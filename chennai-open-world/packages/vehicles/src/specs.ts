/** Handling and size of each vehicle type. Pure numbers; the look is in `models.ts`. */
import type { VehicleSpec } from "@cow/physics";

export type VehicleKind = "car" | "auto" | "bike" | "ambulance" | "bus";

/**
 * A seated driver's pose, relative to the centre of their hip joints, in metres: +X right, +Y up,
 * -Z forwards. Right hand and right ankle; the left side mirrors them. Same shape as
 * `RidingPose` in `@cow/player`, which solves it on the skeleton (two-bone IK).
 */
export interface RidePose {
  /** Torso tipped forwards, radians (negative leans back). */
  readonly lean: number;
  /** Centre of the right palm, on the right grip or the steering wheel rim. */
  readonly hand: { readonly x: number; readonly y: number; readonly z: number };
  /** Right ankle (the sole is about 10 cm lower), on the footboard, peg or pedal. */
  readonly foot: { readonly x: number; readonly y: number; readonly z: number };
  /** How far the knees splay outwards (0 straight ahead, 1 about 45°). */
  readonly knees?: number;
}

/** Hands at ten to two on a steering wheel in front of the chest, feet on the pedals. */
const STEERING: RidePose = { lean: -0.1, hand: { x: 0.17, y: 0.3, z: -0.42 }, foot: { x: 0.12, y: -0.15, z: -0.78 } };

/** How a vehicle's door opens: on a hinge at its front edge, two folding leaves (a bus), or no door. */
export type DoorType = "hinged" | "folding" | "none";

/**
 * How the driver gets in and out (`Boarding.ts`). Chassis frame, metres: +X right, -Z forwards,
 * y up from the chassis centre. India drives on the left, so car and ambulance drivers get in on
 * the right; the bus driver uses the front door on the kerb (left) side. Positions are measured
 * off `models.ts`; where a real vehicle's is not known (floor heights) they are estimates.
 */
export interface VehicleEntry {
  /** Side the driver gets in: 1 right, -1 left. */
  readonly side: 1 | -1;
  /** Where the driver stands outside, beside the door, on the ground. */
  readonly point: { readonly x: number; readonly z: number };
  readonly door: DoorType;
  /**
   * How the body gets onto the seat: "door" sit down through a doorway, "step" step in sideways
   * (the open-sided auto), "swing" swing a leg over the seat (motorbike).
   */
  readonly style: "door" | "step" | "swing";
  /** Standing points on the floor inside (y above the chassis centre), walked between the door and the seat (the bus). */
  readonly aisle?: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number }>;
}

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
   * Where the driver's or rider's hip joints are, relative to the chassis centre (about 10 cm
   * above the seat cushion). The same for the player and AI drivers. Indian vehicles are
   * right-hand drive: +X is the right side when facing forward (-Z). From the models (the auto's
   * from `tools/blender/auto_rickshaw.py`); the closed vehicles' cabins are estimated.
   */
  readonly driver: { readonly x: number; readonly y: number; readonly z: number };
  /** How the driver sits: hands on the grips or the steering wheel, feet on the footboard, pegs or pedals. */
  readonly pose: RidePose;
  /** The rider can be seen (two-wheeler, auto); in closed vehicles the body hides the driver. */
  readonly openSeat?: boolean;
  /** Open two-wheelers lean into corners. */
  readonly leans?: boolean;
  /** Forward gears shown on the HUD. */
  readonly gears: number;
  /** Has a siren and lights (the horn button switches them). */
  readonly siren?: boolean;
  /** Where and how the driver gets in. */
  readonly entry: VehicleEntry;
}

export const VEHICLE_TYPES: Readonly<Record<VehicleKind, VehicleType>> = {
  car: {
    kind: "car",
    label: "Hatchback",
    rideHeight: 0.72,
    driver: { x: 0.36, y: -0.03, z: 0.1 },
    pose: STEERING,
    // Driver's door: front edge (hinge) at z -0.55, rear edge 0.5. Stand behind the open door.
    entry: { side: 1, point: { x: 1.25, z: 0.35 }, door: "hinged", style: "door" },
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
    openSeat: true,
    // Saddle top 0.21 m above the chassis centre; grips 0.47 m up, 0.78 m ahead, 0.335 m out;
    // floor 0.29 m below (Blender model, ground 0.68 m below the chassis centre).
    // The driver hunches and sits deep in the cushion (hips 1 cm above its top) so a 1.75 m
    // figure's head clears the canopy (inside 1.016 m up). Real drivers duck under it too.
    driver: { x: 0, y: 0.22, z: -0.4 },
    pose: { lean: 0.45, hand: { x: 0.335, y: 0.25, z: -0.38 }, foot: { x: 0.16, y: -0.37, z: -0.24 } },
    // Open sides, no door: the driver steps in from the kerb (left) side (estimated; either side is used).
    entry: { side: -1, point: { x: -0.95, z: -0.4 }, door: "none", style: "step" },
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
    openSeat: true,
    // Front of the seat (top 0.245 m), grips at (±0.33, 0.52, -0.42), pegs at (±0.24, -0.265, 0.12): `models.ts`.
    driver: { x: 0, y: 0.345, z: 0.2 },
    pose: { lean: 0.5, hand: { x: 0.33, y: 0.175, z: -0.62 }, foot: { x: 0.23, y: -0.5, z: -0.03 }, knees: 1 },
    // Riders mount from the left, the side stand's side, and swing the right leg over.
    entry: { side: -1, point: { x: -0.7, z: 0.2 }, door: "none", style: "swing" },
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
    driver: { x: 0.45, y: 0.15, z: -0.7 },
    pose: { lean: -0.05, hand: { x: 0.17, y: 0.3, z: -0.42 }, foot: { x: 0.12, y: -0.38, z: -0.7 } },
    // Cab door on the right: hinge at z -1.25 (behind the windscreen), rear edge at the seam, z -0.42.
    entry: { side: 1, point: { x: 1.5, z: -0.5 }, door: "hinged", style: "door" },
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
    driver: { x: 0.8, y: 0.3, z: -4.0 },
    pose: { lean: 0, hand: { x: 0.2, y: 0.25, z: -0.42 }, foot: { x: 0.12, y: -0.42, z: -0.62 } },
    // Front door on the kerb (left) side, 1.1 m wide at z -3.6; then across the floor to the
    // driver's seat on the right. Floor 0.9 m above the ground (estimated: one step up).
    entry: {
      side: -1,
      point: { x: -1.85, z: -3.6 },
      door: "folding",
      style: "door",
      aisle: [
        { x: -0.8, y: -0.35, z: -3.6 },
        { x: 0.25, y: -0.35, z: -3.85 },
      ],
    },
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

/** True when the HUD gear went up a forward gear (2 → 3, or D2 → D3), for the gear-change sound. */
export function shiftedUp(from: string, to: string): boolean {
  const a = Number(from.replace(/^D(?=\d)/, ""));
  const b = Number(to.replace(/^D(?=\d)/, ""));
  return from !== "" && Number.isInteger(a) && Number.isInteger(b) && a >= 1 && b > a;
}
