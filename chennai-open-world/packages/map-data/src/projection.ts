/**
 * Geographic <-> local game coordinates.
 *
 * The game world keeps real coordinates: every chunk is positioned by latitude/longitude and
 * converted to metres around a fixed origin. Local axes follow the renderer's convention:
 *   +X = east, +Y = up, -Z = north (so a map drawn north-up matches the default camera).
 *
 * An equirectangular (local tangent plane) projection is used. Around Chennai its error is
 * below 1 cm per kilometre from the origin, far smaller than OpenStreetMap's own accuracy,
 * and it is cheap enough to run per vertex while streaming chunks.
 */

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export interface LocalPoint {
  /** Metres east of the origin. */
  readonly x: number;
  /** Metres south of the origin (north is negative Z). */
  readonly z: number;
}

/** WGS84 mean Earth radius in metres. */
const EARTH_RADIUS = 6_371_008.8;
const DEG = Math.PI / 180;

/** Anna Nagar Roundtana, the centre of the first playable region. */
export const ANNA_NAGAR_ORIGIN: LatLng = { lat: 13.085, lng: 80.2101 };

export class GeoProjection {
  private readonly cosLat: number;

  constructor(readonly origin: LatLng) {
    if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng) || Math.abs(origin.lat) > 85) {
      throw new RangeError(`Unsupported projection origin: ${origin.lat}, ${origin.lng}`);
    }
    this.cosLat = Math.cos(origin.lat * DEG);
  }

  toLocal(point: LatLng): LocalPoint {
    return {
      x: (point.lng - this.origin.lng) * DEG * EARTH_RADIUS * this.cosLat,
      z: -(point.lat - this.origin.lat) * DEG * EARTH_RADIUS,
    };
  }

  toLatLng(point: LocalPoint): LatLng {
    return {
      lat: this.origin.lat - point.z / (DEG * EARTH_RADIUS),
      lng: this.origin.lng + point.x / (DEG * EARTH_RADIUS * this.cosLat),
    };
  }
}
