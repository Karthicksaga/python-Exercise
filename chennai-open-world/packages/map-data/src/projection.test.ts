import { describe, expect, it } from "vitest";
import { ANNA_NAGAR_ORIGIN, GeoProjection } from "./projection";

describe("GeoProjection", () => {
  const projection = new GeoProjection(ANNA_NAGAR_ORIGIN);

  it("places the origin at 0,0", () => {
    expect(projection.toLocal(ANNA_NAGAR_ORIGIN)).toEqual({ x: 0, z: -0 });
  });

  it("puts north at negative Z and east at positive X", () => {
    const north = projection.toLocal({ lat: ANNA_NAGAR_ORIGIN.lat + 0.001, lng: ANNA_NAGAR_ORIGIN.lng });
    const east = projection.toLocal({ lat: ANNA_NAGAR_ORIGIN.lat, lng: ANNA_NAGAR_ORIGIN.lng + 0.001 });
    expect(north.z).toBeLessThan(0);
    expect(north.x).toBeCloseTo(0, 6);
    expect(east.x).toBeGreaterThan(0);
  });

  it("measures real distances: 0.001° of latitude is about 111.2 m", () => {
    const p = projection.toLocal({ lat: ANNA_NAGAR_ORIGIN.lat + 0.001, lng: ANNA_NAGAR_ORIGIN.lng });
    expect(Math.abs(p.z)).toBeGreaterThan(111.1);
    expect(Math.abs(p.z)).toBeLessThan(111.3);
  });

  it("round-trips a point 1 km away to within a millimetre", () => {
    const start = { lat: 13.0921, lng: 80.2178 };
    const back = projection.toLatLng(projection.toLocal(start));
    expect(back.lat).toBeCloseTo(start.lat, 8);
    expect(back.lng).toBeCloseTo(start.lng, 8);
  });

  it("rejects an invalid origin", () => {
    expect(() => new GeoProjection({ lat: Number.NaN, lng: 0 })).toThrow(RangeError);
  });
});
