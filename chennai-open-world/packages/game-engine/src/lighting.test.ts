import { describe, expect, it } from "vitest";
import { lightingAt, sunElevation, type Look, type Rgb } from "./lighting";

const degrees = (look: Look) => (Math.asin(look.light[1]) * 180) / Math.PI;
const warmth = (c: Rgb) => c[0] - c[2];
/** Largest change of any number in a look. */
function jump(a: Look, b: Look): number {
  let worst = 0;
  for (const key of ["lightIntensity", "hemiIntensity", "glowStrength", "exposure", "environment", "night", "haze"] as const) worst = Math.max(worst, Math.abs(a[key] - b[key]));
  for (const key of ["zenith", "horizon", "hemiSky", "hemiGround", "glow"] as const) for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(a[key][i]! - b[key][i]!));
  return worst;
}

describe("lightingAt", () => {
  it("golden hour (the default 17:45) has a low, warm sun in the west and warm haze", () => {
    const look = lightingAt(17.75);
    expect(degrees(look)).toBeGreaterThan(8);
    expect(degrees(look)).toBeLessThan(25);
    expect(look.light[0]).toBeLessThan(-0.8); // west is -X
    expect(warmth(look.lightColor)).toBeGreaterThan(0.4);
    expect(warmth(look.horizon)).toBeGreaterThan(0.2);
    expect(look.night).toBe(0);
    expect(look.haze).toBeGreaterThan(lightingAt(12.5).haze);
  });

  it("noon is high and neutral, night is dark with the moon lighting the scene", () => {
    const noon = lightingAt(12.5);
    expect(degrees(noon)).toBeGreaterThan(60);
    expect(noon.light[2]).toBeGreaterThan(0); // the midday sun is in the south (+Z)
    const night = lightingAt(21.5);
    expect(night.night).toBe(1);
    expect(night.lightIntensity).toBeLessThan(noon.lightIntensity / 4);
    expect(Math.max(...night.zenith)).toBeLessThan(0.15);
    expect(night.moonlight).toBe(1);
    expect(night.sunDisc).toBe(0);
    expect(sunElevation(21.5)).toBeLessThan(0);
  });

  it("the morning sun rises in the east", () => {
    expect(lightingAt(7).light[0]).toBeGreaterThan(0.8);
  });

  it("wraps around midnight and tolerates bad input", () => {
    expect(lightingAt(24)).toEqual(lightingAt(0));
    expect(lightingAt(-2).hour).toBeCloseTo(22);
    expect(lightingAt(Number.NaN).hour).toBeCloseTo(17.75);
  });

  it("changes smoothly through the day, with finite unit directions", () => {
    // One real second at the default speed (one game hour per real minute) never changes the look by much.
    const step = 1 / 60;
    let previous = lightingAt(0);
    for (let hour = step; hour <= 24; hour += step) {
      const look = lightingAt(hour);
      expect(jump(previous, look)).toBeLessThan(0.06);
      for (const v of [look.light, look.sunSky, look.moon]) expect(Math.hypot(...v)).toBeCloseTo(1, 5);
      expect(degrees(look)).toBeGreaterThanOrEqual(3.99);
      previous = look;
    }
  });

  it("rain dims the sun, greys the sky and thickens the haze", () => {
    const dry = lightingAt(17.75, 0);
    const wet = lightingAt(17.75, 1);
    expect(wet.rain).toBe(1);
    expect(wet.lightIntensity).toBeLessThan(dry.lightIntensity * 0.5);
    expect(warmth(wet.horizon)).toBeLessThan(warmth(dry.horizon));
    expect(wet.haze).toBeGreaterThan(dry.haze * 1.4);
    expect(wet.sunDisc).toBe(0);
    expect(lightingAt(17.75, 5).rain).toBe(1);
  });
});
