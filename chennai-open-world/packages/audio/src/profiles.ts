/**
 * The sound design as data: how each vehicle's engine and horn are built, and the maths that
 * turns the game's state (speed, gear, throttle, positions) into what is heard. No Web Audio
 * here, so all of it is unit-tested; `Sound.ts` and `voices.ts` turn it into nodes.
 *
 * Engines are modelled on what drives Chennai's streets (estimated, not recordings):
 * - car: a 1.2 L four-cylinder petrol hatchback, smooth hum;
 * - auto: a single-cylinder four-stroke three-wheeler, slow uneven "putt" and panel rattle;
 * - bike: a 150 cc single, rasping and revvy;
 * - bus: a six-cylinder diesel, low growl, injector clatter and a turbo whistle;
 * - ambulance: a four-cylinder diesel van.
 * The pitch that matters is the firing frequency: rpm / 60 × cylinders / 2 for a four-stroke.
 */

export type VehicleSoundKind = "car" | "auto" | "bike" | "bus" | "ambulance";

export const VEHICLE_SOUND_KINDS: readonly VehicleSoundKind[] = ["car", "auto", "bike", "bus", "ambulance"];

export interface EngineProfile {
  readonly cylinders: number;
  /** 4 (fires every other turn) or 2 (every turn). */
  readonly strokes: 2 | 4;
  readonly idleRpm: number;
  /** Where the driver changes up: the top of each gear. */
  readonly shiftRpm: number;
  /** Revving in neutral or at a standstill goes no higher than this share of the way to `shiftRpm`. */
  readonly freeRev: number;
  /** Forward gears (matches `VehicleType.gears`). */
  readonly gears: number;
  /** Top speed, m/s (matches the vehicle's physics). */
  readonly topSpeed: number;
  /** Main pulse waveform: sawtooth is buzzy and full, square hollow and putt-like. */
  readonly wave: "sawtooth" | "square";
  /** Weight of a pure sine on the firing note (the body of a multi-cylinder engine's hum). */
  readonly sub: number;
  /** Exhaust resonance: band-pass centre (Hz) and sharpness. */
  readonly exhaust: { readonly hz: number; readonly q: number };
  /** Low-pass cutoff at idle and at full revs with full throttle (Hz): brighter when pushed. */
  readonly cutoff: readonly [idle: number, full: number];
  /** Noise chopped by every firing: putts for singles, clatter for diesels (0..1). */
  readonly roughness: number;
  /** Where that noise sits (Hz): low for exhaust putts, high for diesel clatter and panel rattle. */
  readonly roughHz: number;
  /** Slow uneven running at idle (0..1): a single cylinder lopes, a six does not. */
  readonly lope: number;
  /** A turbo's whistle, as loud as boost (0 for none). */
  readonly turbo: number;
  /** Tyre and wind roar at speed: open vehicles (auto, bike) hear more wind (0..1). */
  readonly wind: number;
  /** Overall level of this engine in the mix. */
  readonly volume: number;
}

export const ENGINES: Readonly<Record<VehicleSoundKind, EngineProfile>> = {
  car: {
    cylinders: 4, strokes: 4, idleRpm: 800, shiftRpm: 3400, freeRev: 0.55, gears: 5, topSpeed: 23,
    wave: "sawtooth", sub: 0.35, exhaust: { hz: 170, q: 1.4 }, cutoff: [420, 1700],
    roughness: 0.06, roughHz: 700, lope: 0.02, turbo: 0, wind: 0.45, volume: 0.9,
  },
  auto: {
    cylinders: 1, strokes: 4, idleRpm: 1350, shiftRpm: 4600, freeRev: 0.6, gears: 4, topSpeed: 14,
    wave: "square", sub: 0, exhaust: { hz: 330, q: 3 }, cutoff: [900, 2600],
    roughness: 0.6, roughHz: 2400, lope: 0.28, turbo: 0, wind: 0.75, volume: 0.8,
  },
  bike: {
    cylinders: 1, strokes: 4, idleRpm: 1600, shiftRpm: 7600, freeRev: 0.75, gears: 5, topSpeed: 26,
    wave: "sawtooth", sub: 0.2, exhaust: { hz: 250, q: 2.6 }, cutoff: [750, 3200],
    roughness: 0.38, roughHz: 900, lope: 0.18, turbo: 0, wind: 1, volume: 0.85,
  },
  bus: {
    cylinders: 6, strokes: 4, idleRpm: 650, shiftRpm: 2000, freeRev: 0.5, gears: 5, topSpeed: 17,
    wave: "sawtooth", sub: 0.6, exhaust: { hz: 110, q: 1.2 }, cutoff: [260, 950],
    roughness: 0.32, roughHz: 1800, lope: 0, turbo: 0.5, wind: 0.3, volume: 1.15,
  },
  ambulance: {
    cylinders: 4, strokes: 4, idleRpm: 680, shiftRpm: 2600, freeRev: 0.55, gears: 5, topSpeed: 25,
    wave: "sawtooth", sub: 0.45, exhaust: { hz: 140, q: 1.3 }, cutoff: [330, 1300],
    roughness: 0.2, roughHz: 1500, lope: 0.01, turbo: 0.25, wind: 0.4, volume: 0.95,
  },
};

export interface HornNote {
  readonly hz: number;
  /** Seconds from the press. */
  readonly at: number;
  readonly length: number;
}

export interface HornProfile {
  readonly notes: readonly HornNote[];
  readonly wave: "sawtooth" | "square" | "triangle";
  /** Band-pass that gives the horn its trumpet or diaphragm colour (Hz, sharpness). */
  readonly colour: { readonly hz: number; readonly q: number };
  /** A fast buzz in the level (a cheap diaphragm horn's rattle), Hz; 0 for none. */
  readonly buzz: number;
  /** Seconds to reach full level: an air horn swells, an electric horn snaps on. */
  readonly attack: number;
  /** Pitch at the very start as a share of the note (air horns start flat and rise). */
  readonly scoop: number;
  readonly volume: number;
}

export const HORNS: Readonly<Record<VehicleSoundKind, HornProfile>> = {
  // Twin disc horns, a major third apart: the familiar hatchback "meh-meep".
  car: {
    notes: [{ hz: 415, at: 0, length: 0.42 }, { hz: 523, at: 0, length: 0.42 }],
    wave: "square", colour: { hz: 1700, q: 1.1 }, buzz: 0, attack: 0.01, scoop: 1, volume: 0.13,
  },
  // A cheap buzzy electric horn, high and thin, tapped twice: "pee-peep".
  auto: {
    notes: [{ hz: 680, at: 0, length: 0.12 }, { hz: 680, at: 0.19, length: 0.2 }],
    wave: "square", colour: { hz: 2600, q: 2.2 }, buzz: 34, attack: 0.005, scoop: 1, volume: 0.3,
  },
  // One small disc horn, higher and shorter than a car's.
  bike: {
    notes: [{ hz: 560, at: 0, length: 0.3 }],
    wave: "square", colour: { hz: 2300, q: 1.6 }, buzz: 0, attack: 0.008, scoop: 1, volume: 0.2,
  },
  // A compressed-air horn chord, low, swelling in and long.
  bus: {
    notes: [{ hz: 233, at: 0, length: 0.85 }, { hz: 294, at: 0, length: 0.85 }, { hz: 349, at: 0, length: 0.85 }],
    wave: "sawtooth", colour: { hz: 1100, q: 0.9 }, buzz: 0, attack: 0.06, scoop: 0.9, volume: 0.11,
  },
  // The ambulance's button switches the siren; this is its plain horn (used by traffic).
  ambulance: {
    notes: [{ hz: 392, at: 0, length: 0.4 }, { hz: 494, at: 0, length: 0.4 }],
    wave: "square", colour: { hz: 1500, q: 1.1 }, buzz: 0, attack: 0.012, scoop: 1, volume: 0.13,
  },
};

/** The traffic and vehicle names the game uses, mapped to a sound (unknown kinds sound like a car). */
export function soundKind(name: string): VehicleSoundKind {
  return (VEHICLE_SOUND_KINDS as readonly string[]).includes(name) ? (name as VehicleSoundKind) : "car";
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Engine speed for a vehicle moving at `speed` m/s with the accelerator at `throttle` (0..1).
 * Gears follow the HUD's rule (`gearFor` in `@cow/vehicles`): each gear spans an equal share of
 * top speed, so the revs climb through a gear and drop at each change, like a real gearbox.
 * Standing still with the accelerator down, the engine revs freely.
 */
export function engineRpm(profile: EngineProfile, speed: number, throttle: number): number {
  const share = clamp01(Math.abs(speed) / profile.topSpeed);
  const span = profile.shiftRpm - profile.idleRpm;
  if (Math.abs(speed) < 0.4) return profile.idleRpm + span * profile.freeRev * clamp01(throttle);
  const position = share * profile.gears * 1.05;
  const gear = Math.min(profile.gears, 1 + Math.floor(position));
  // Each gear starts a little above idle (the clutch is in) and climbs to the change point; top
  // gear keeps climbing towards the limit.
  const within = gear === profile.gears ? Math.min(1.25, position - (gear - 1)) : clamp01(position - (gear - 1));
  const lugging = gear === 1 ? 0.15 : 0.42;
  const rpm = profile.idleRpm + span * (lugging + (1 - lugging) * within);
  // Easing off lets the revs sag a little; pushing holds them up.
  return rpm * (0.94 + 0.06 * clamp01(throttle));
}

/** Combustion pulses per second at this engine speed: the note you hear. */
export function firingHz(profile: EngineProfile, rpm: number): number {
  const perTurn = profile.strokes === 4 ? profile.cylinders / 2 : profile.cylinders;
  return (rpm / 60) * perTurn;
}

/** Where the listener is: the camera, facing `yaw` (forward is -sin, -cos as everywhere in the game). */
export interface Listener {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export interface Placement {
  /** 0..1 loudness after distance. */
  readonly gain: number;
  /** -1 (left) .. 1 (right). */
  readonly pan: number;
  /** Low-pass cutoff (Hz): far sounds lose their top, as air and buildings absorb it. */
  readonly cutoff: number;
}

/**
 * How a sound at (x, z) is heard: inverse-distance loudness with a gentle start (full within
 * `near` metres, silent at `far`), panned by its bearing, duller with distance.
 */
export function place(listener: Listener, x: number, z: number, near = 6, far = 60): Placement {
  const dx = x - listener.x;
  const dz = z - listener.z;
  const distance = Math.hypot(dx, dz);
  if (distance >= far) return { gain: 0, pan: 0, cutoff: 600 };
  const falloff = near / Math.max(near, distance);
  // Fade the last stretch to zero so a sound does not pop in or out at `far`.
  const edge = clamp01((far - distance) / (far * 0.25));
  // Right of the listener: the facing direction turned a quarter clockwise, (cos yaw, -sin yaw).
  const right = distance < 0.01 ? 0 : (dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw)) / distance;
  return { gain: falloff * edge, pan: Math.max(-1, Math.min(1, right * 0.85)), cutoff: 600 + 7400 * Math.pow(1 - distance / far, 2) };
}

/**
 * Seconds between footsteps at this speed (m/s): a stride grows from walking to running, and
 * cadence rises, as in people (about 1.9 steps a second walking, 2.8 running).
 */
export function stepInterval(speed: number): number {
  const s = Math.max(0.3, speed);
  const stride = s < 2.2 ? 0.72 : Math.min(1.45, 0.72 + (s - 2.2) * 0.25);
  return Math.max(0.28, Math.min(0.75, stride / s));
}

/**
 * The city's background level by hour: quiet before dawn, building to the morning rush, a
 * daytime plateau, the evening rush loudest (Chennai's roads at 6 to 8 pm), fading at night.
 */
export function cityLevel(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const bump = (centre: number, width: number): number => Math.exp(-(((h - centre) / width) ** 2));
  return clamp01(0.12 + 0.55 * bump(13, 6) + 0.35 * bump(9, 1.6) + 0.45 * bump(19, 1.8) - 0.1 * bump(3, 2));
}

/** Birds by hour: the koel's call at dawn, crows through the day; crickets after dark. */
export function wildlife(hour: number): { koel: number; crows: number; crickets: number } {
  const h = ((hour % 24) + 24) % 24;
  const bump = (centre: number, width: number): number => Math.exp(-(((h - centre) / width) ** 2));
  return {
    koel: clamp01(bump(6.3, 1.2)),
    crows: clamp01(h > 6 && h < 18.5 ? 0.5 + 0.5 * bump(8, 2) : 0),
    crickets: clamp01(h >= 19 || h < 5 ? 1 : bump(19, 0.6) + bump(5, 0.6)),
  };
}

/**
 * Chance per second that a stopped vehicle near the player sounds its horn. Chennai honks:
 * often in the rushes, rarely in the small hours, more when the queue has stood a while.
 */
export function honkChance(hour: number, stoppedSeconds: number): number {
  if (stoppedSeconds < 1.5) return 0;
  return Math.min(0.12, 0.02 * (0.3 + cityLevel(hour)) * Math.min(3, stoppedSeconds / 2));
}
