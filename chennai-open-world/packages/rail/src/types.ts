/**
 * The railway file (`apps/game/public/world/rail.json`, built by `npm run build:rail` from the
 * OSM railway extract). Coordinates are local metres, rounded to 10 cm, as flat [x, z, ...] lists.
 */

/** A track as drawn: every running line, siding and yard track on the map. */
export interface RailTrackData {
  readonly id: number;
  /** "main" for running lines, "service" for sidings, yards and crossovers. */
  readonly kind: "main" | "service";
  readonly points: readonly number[];
}

/** A stop on a line. */
export interface RailStopData {
  /** Station id, shared by the stops of both directions (the OSM node id). */
  readonly id: string;
  readonly name: string;
  /** Tamil name from OSM `name:ta`, or a transliteration marked as estimated in the builder. */
  readonly nameTa: string;
  /** Metres along the line. */
  readonly s: number;
  /** Platform side: 1 on the left of the direction of travel, -1 on the right (estimated). */
  readonly side: 1 | -1;
}

/** Where one end of a line goes. */
export interface RailEndData {
  /** The place trains come from or go to ("Tambaram", "Chennai Beach"). */
  readonly name: string;
  /** True when that place is beyond the map's edge (the line runs off the map). */
  readonly beyond: boolean;
}

/** One direction of a passenger service: trains run from the start of `points` to its end. */
export interface RailLineData {
  readonly id: string;
  readonly name: string;
  readonly points: readonly number[];
  readonly stops: readonly RailStopData[];
  readonly from: RailEndData;
  readonly to: RailEndData;
  /** Minutes between trains (estimated, not the real timetable). */
  readonly headwayMinutes: number;
  /** Minutes after the railway clock's zero of the first departure. */
  readonly offsetMinutes: number;
}

/** A station: one board and minimap mark, whichever lines stop there. */
export interface RailStationData {
  readonly id: string;
  readonly name: string;
  readonly nameTa: string;
  readonly x: number;
  readonly z: number;
}

export interface RailFile {
  /** "© OpenStreetMap contributors", with the data date. */
  readonly attribution: string;
  readonly tracks: readonly RailTrackData[];
  readonly lines: readonly RailLineData[];
  readonly stations: readonly RailStationData[];
}
