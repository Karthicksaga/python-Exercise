/**
 * The look of the city by time of day and weather, as plain numbers. Pure: no Three.js, so it
 * can be unit-tested. `SceneRenderer` turns a `Look` into lights, fog and exposure, and
 * `MapView` into sky colours. Colours are sRGB triples in 0..1.
 *
 * The sun's path is a game path, not an almanac: it rises in the east around 06:00, passes high
 * in the south and sets in the west around 18:45, so 17:45 (the default start) is a low,
 * warm golden-hour sun with long shadows.
 */

export type Rgb = readonly [number, number, number];
export type Vec3 = readonly [number, number, number];

export interface Look {
  readonly hour: number;
  /** 0 dry to 1 raining. */
  readonly rain: number;
  /** Direction from the ground towards the light that casts shadows (sun by day, moon by night). Unit length, never below 4° elevation. */
  readonly light: Vec3;
  readonly lightColor: Rgb;
  readonly lightIntensity: number;
  /** Where the sun really is, for the sky glow; may be below the horizon. Unit length. */
  readonly sunSky: Vec3;
  /** How visible the sun disc is, 0 to 1. */
  readonly sunDisc: number;
  /** Direction of the moon (fixed in the south-west sky). Unit length. */
  readonly moon: Vec3;
  /** How visible the moon and stars are, 0 to 1. */
  readonly moonlight: number;
  readonly hemiSky: Rgb;
  readonly hemiGround: Rgb;
  readonly hemiIntensity: number;
  /** Sky colour overhead and at the horizon. The horizon colour is also the fog colour. */
  readonly zenith: Rgb;
  readonly horizon: Rgb;
  /** Colour and strength of the glow around the sun and along the horizon below it. */
  readonly glow: Rgb;
  readonly glowStrength: number;
  readonly exposure: number;
  /** Strength of sky reflections on cars and glass. */
  readonly environment: number;
  /** 0 by day, 1 at night: lamps, lit windows and headlight pools follow it. */
  readonly night: number;
  /** Fog thickness multiplier: 1 is a clear noon; above 1 the haze starts nearer. */
  readonly haze: number;
}

interface Key {
  readonly hour: number;
  readonly lightColor: number;
  readonly lightIntensity: number;
  readonly hemiSky: number;
  readonly hemiGround: number;
  readonly hemiIntensity: number;
  readonly zenith: number;
  readonly horizon: number;
  readonly glow: number;
  readonly glowStrength: number;
  readonly exposure: number;
  readonly environment: number;
  readonly night: number;
  readonly haze: number;
}

const NIGHT: Omit<Key, "hour"> = {
  lightColor: 0x9db2de,
  lightIntensity: 0.45,
  hemiSky: 0x34466e,
  hemiGround: 0x1c1a17,
  hemiIntensity: 0.55,
  zenith: 0x040a1a,
  horizon: 0x1b2539,
  glow: 0x000000,
  glowStrength: 0,
  exposure: 1.3,
  environment: 0.08,
  night: 1,
  haze: 1.15,
};

/** Hand-tuned looks through the day, in order. The last one equals the first (wrap at midnight). */
const KEYS: readonly Key[] = [
  { hour: 0, ...NIGHT },
  { hour: 4.9, ...NIGHT },
  // Dawn: the moon fades out just before the sun takes over (see LIGHT_SWITCH).
  { hour: 5.85, lightColor: 0xffa77a, lightIntensity: 0.15, hemiSky: 0x6a78a0, hemiGround: 0x3a3228, hemiIntensity: 0.55, zenith: 0x1d3360, horizon: 0xd39a80, glow: 0xff9a5a, glowStrength: 0.6, exposure: 1.15, environment: 0.18, night: 0.65, haze: 1.25 },
  { hour: 6.7, lightColor: 0xffbf8a, lightIntensity: 1.5, hemiSky: 0xbccce6, hemiGround: 0x7d6a50, hemiIntensity: 0.7, zenith: 0x4a80c6, horizon: 0xf0cba6, glow: 0xffb070, glowStrength: 1, exposure: 1.1, environment: 0.35, night: 0.1, haze: 1.3 },
  { hour: 8.5, lightColor: 0xfff0d8, lightIntensity: 2.45, hemiSky: 0xdcecff, hemiGround: 0x8d7b5a, hemiIntensity: 0.82, zenith: 0x3f86d4, horizon: 0xcadde8, glow: 0xfff0c8, glowStrength: 0.5, exposure: 1.05, environment: 0.45, night: 0, haze: 1.05 },
  { hour: 12.5, lightColor: 0xfff5e4, lightIntensity: 2.7, hemiSky: 0xdfefff, hemiGround: 0x8d7b5a, hemiIntensity: 0.85, zenith: 0x3a80d0, horizon: 0xc9dbe6, glow: 0xfff4dc, glowStrength: 0.4, exposure: 1.0, environment: 0.45, night: 0, haze: 1 },
  { hour: 15.5, lightColor: 0xffead0, lightIntensity: 2.65, hemiSky: 0xe4ecf6, hemiGround: 0x8f7a58, hemiIntensity: 0.82, zenith: 0x4387d0, horizon: 0xd6dcdc, glow: 0xffe4b8, glowStrength: 0.55, exposure: 1.04, environment: 0.45, night: 0, haze: 1.05 },
  // Golden hour, the default look: low warm sun, warm haze, cool blue overhead.
  { hour: 17.75, lightColor: 0xffb26a, lightIntensity: 2.9, hemiSky: 0xf2d6b8, hemiGround: 0x8a6a48, hemiIntensity: 0.78, zenith: 0x5585c2, horizon: 0xf0c592, glow: 0xffa860, glowStrength: 1.1, exposure: 1.12, environment: 0.45, night: 0, haze: 1.2 },
  { hour: 18.5, lightColor: 0xff8a4c, lightIntensity: 1.3, hemiSky: 0xd4a892, hemiGround: 0x5a4434, hemiIntensity: 0.65, zenith: 0x37589a, horizon: 0xee9a6c, glow: 0xff7a3a, glowStrength: 1.3, exposure: 1.12, environment: 0.3, night: 0.3, haze: 1.25 },
  // Dusk: the sun's light fades out just before the moon takes over.
  { hour: 19.0, lightColor: 0xb08a8a, lightIntensity: 0.18, hemiSky: 0x6a6a8e, hemiGround: 0x3a3028, hemiIntensity: 0.55, zenith: 0x1a2a55, horizon: 0x8e6a72, glow: 0xff6a3a, glowStrength: 0.65, exposure: 1.18, environment: 0.15, night: 0.7, haze: 1.2 },
  { hour: 19.8, lightColor: 0x9db2de, lightIntensity: 0.35, hemiSky: 0x3c4c74, hemiGround: 0x221e1a, hemiIntensity: 0.55, zenith: 0x081230, horizon: 0x2c3048, glow: 0x803a2a, glowStrength: 0.15, exposure: 1.25, environment: 0.1, night: 0.95, haze: 1.15 },
  { hour: 20.6, ...NIGHT },
  { hour: 24, ...NIGHT },
];

const DEG = Math.PI / 180;
/** Sun elevation (degrees) below which the moon casts the shadows instead. */
const LIGHT_SWITCH = -4;
/** The light never comes from lower than this, so shadows stay a sensible length. */
const MIN_LIGHT_ELEVATION = 4;
const MOON: Vec3 = normalize([-0.32, 0.8, 0.5]);

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function hexToRgb(hex: number): Rgb {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** A grey with the same brightness, a little darker: what rain does to a sky colour. */
function overcast(c: Rgb, amount: number): Rgb {
  const luma = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const grey: Rgb = [luma * 0.82, luma * 0.86, luma * 0.92];
  return mixRgb(c, grey, amount);
}

export function wrapHour(hour: number): number {
  if (!Number.isFinite(hour)) return 17.75;
  return ((hour % 24) + 24) % 24;
}

/** Sun elevation in degrees: about 70° at midday, negative at night. */
export function sunElevation(hour: number): number {
  const h = wrapHour(hour);
  return 70 * Math.sin((Math.PI * (h - 6.1)) / 12.6);
}

/** Unit vector towards the sun. East (+X) in the morning, south (+Z) at noon, west (-X) in the evening. */
function sunDirection(hour: number, elevationDegrees: number): Vec3 {
  const theta = (Math.PI * (wrapHour(hour) - 6.1)) / 12.6;
  const hx = Math.cos(theta);
  const hz = 0.45 * Math.sin(theta);
  const flat = Math.hypot(hx, hz) || 1;
  const e = elevationDegrees * DEG;
  return [(hx / flat) * Math.cos(e), Math.sin(e), (hz / flat) * Math.cos(e)];
}

function keysAround(hour: number): [Key, Key, number] {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i]!;
    const b = KEYS[i + 1]!;
    if (hour >= a.hour && hour <= b.hour) {
      const span = b.hour - a.hour;
      const t = span > 0 ? (hour - a.hour) / span : 0;
      // Ease between keys so changes start and end gently.
      return [a, b, t * t * (3 - 2 * t)];
    }
  }
  const last = KEYS[KEYS.length - 1]!;
  return [last, last, 0];
}

/**
 * The look at an hour (0 to 24, wraps) and a rain level (0 to 1).
 * @param rain 0 dry, 1 steady light rain: greyer sky, weaker sun, thicker haze
 */
export function lightingAt(hour: number, rain = 0): Look {
  const h = wrapHour(hour);
  const wet = Math.min(1, Math.max(0, Number.isFinite(rain) ? rain : 0));
  const [a, b, t] = keysAround(h);
  const num = (pick: (k: Key) => number) => pick(a) + (pick(b) - pick(a)) * t;
  const col = (pick: (k: Key) => number) => mixRgb(hexToRgb(pick(a)), hexToRgb(pick(b)), t);

  const elevation = sunElevation(h);
  const sunSky = sunDirection(h, elevation);
  const light = elevation > LIGHT_SWITCH ? sunDirection(h, Math.max(elevation, MIN_LIGHT_ELEVATION)) : MOON;
  const night = num((k) => k.night);

  return {
    hour: h,
    rain: wet,
    light,
    lightColor: overcast(col((k) => k.lightColor), wet * 0.6),
    lightIntensity: num((k) => k.lightIntensity) * (1 - 0.7 * wet),
    sunSky,
    sunDisc: Math.min(1, Math.max(0, (elevation + 1) / 4)) * (1 - wet),
    moon: MOON,
    moonlight: Math.min(1, Math.max(0, (night - 0.5) * 2)) * (1 - wet),
    hemiSky: overcast(col((k) => k.hemiSky), wet * 0.7),
    hemiGround: col((k) => k.hemiGround),
    hemiIntensity: num((k) => k.hemiIntensity) * (1 + 0.15 * wet),
    zenith: overcast(col((k) => k.zenith), wet * 0.8),
    horizon: overcast(col((k) => k.horizon), wet * 0.75),
    glow: col((k) => k.glow),
    glowStrength: num((k) => k.glowStrength) * (1 - 0.85 * wet),
    exposure: num((k) => k.exposure) * (1 - 0.04 * wet),
    environment: num((k) => k.environment),
    night,
    haze: num((k) => k.haze) * (1 + 0.5 * wet),
  };
}
