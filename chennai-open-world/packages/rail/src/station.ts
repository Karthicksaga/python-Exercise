/**
 * How a station is laid out around each drawn platform, and what its departure board says.
 *
 * OSM gives the tracks and the station's position; everything here is invented to look like a
 * Chennai suburban station (estimated, not surveyed): the foot-over-bridge (FOB) spans every
 * track within reach of the platform and lands beyond the outermost one, where the booking
 * office stands; the platforms are numbered from the first line's side; the board lists the
 * next trains from the timetable. Pure data: the renderer (`RailView`) and the crowd
 * (`StationCrowd`) read the same layout, so stairs, exits and boards agree.
 */
import { PLATFORM_EDGE, PLATFORM_LENGTH, type RailLine, type RailNetwork } from "./network";
import { RailPath } from "./path";
import type { RailFile, RailStationData, RailStopData } from "./types";

/** A line that stops at a platform, and where its track runs in the platform's frame. */
export interface PlatformService {
  readonly line: RailLine;
  /** Index of the stop in `line.stops`. */
  readonly stop: number;
  /** The track's centre, metres to the left of the owning line's direction (the owner's own track is 0). */
  readonly track: number;
  /** The platform edge this line's trains stand at (same frame). */
  readonly edge: number;
  /** From the edge into the platform: +1 or -1 (same frame). */
  readonly inward: 1 | -1;
  /** Platform number painted on the boards (estimated numbering). */
  readonly number: number;
}

/** A drawn platform and the station around it. Lateral distances are in the owning line's frame (left positive). */
export interface StationPlatform {
  /** Unique per drawn platform: line id and stop index. */
  readonly key: string;
  readonly station: RailStationData;
  /** The line whose stop owns (draws) the platform, and that stop. */
  readonly line: RailLine;
  readonly stop: RailStopData;
  readonly index: number;
  /** Island platform (tracks on both sides). */
  readonly island: boolean;
  /** Lateral range of the deck, near edge (the owner's track side) to far edge. */
  readonly near: number;
  readonly far: number;
  readonly services: readonly PlatformService[];
  /** Foot-over-bridge: along the platform (from the stop's centre) and across, from `from` to `to`. */
  readonly fob: { readonly u: number; readonly from: number; readonly to: number };
  /** Booking office at the FOB's outer landing: along, across, and which way its front faces (+1/-1 across). */
  readonly office: { readonly u: number; readonly w: number; readonly facing: 1 | -1 };
  /** Where people leave the platform (along it): its two end ramps and the FOB stair foot. */
  readonly exits: readonly number[];
  /** Busier stations get bigger crowds (Egmore, the islands); 0.5 to 1. */
  readonly busy: number;
}

/** FOB deck height above the ground, metres (clears the overhead wires; estimated). */
export const FOB_HEIGHT = 7.2;
/** FOB stairs on the platform: run along the platform, metres (about 0.3 m going per 0.15 m rise). */
export const FOB_STAIR_RUN = 12.5;
/** Half the FOB deck's width (along the platform), metres. */
export const FOB_HALF_WIDTH = 1.5;
/** How far from the stop's centre the FOB crosses, metres (towards the front of the train). */
export const FOB_AT = -30;
/** Tracks this far from a platform still count as the station's (the FOB spans them), metres. */
const STATION_REACH = 32;

/**
 * Lay out every drawn platform (one per non-twin stop). Other tracks near the platform come
 * from the railway file, so the FOB spans the yard as mapped.
 */
export function stationPlatforms(network: RailNetwork): StationPlatform[] {
  const file: RailFile = network.file;
  const tracks = file.tracks.filter((t) => t.kind === "main").map((t) => RailPath.fromFlat(t.points));
  const out: StationPlatform[] = [];
  for (const line of network.lines) {
    line.stops.forEach((stop, index) => {
      if (stop.twin) return;
      const station = network.station(stop.id) ?? { id: stop.id, name: stop.name, nameTa: stop.nameTa, x: 0, z: 0 };
      const side = stop.side;
      const near = side * PLATFORM_EDGE;
      const far = side * (PLATFORM_EDGE + stop.width);
      const island = stop.width > 6;
      // Other tracks' laterals near the platform's middle (projected back into this line's frame).
      const centre = line.path.at(stop.s);
      const laterals: number[] = [0];
      for (const path of tracks) {
        const hit = path.project(centre);
        if (hit.distance > STATION_REACH + 4) continue;
        const p = path.at(hit.s);
        const back = line.path.project(p);
        if (Math.abs(back.s - stop.s) > 6) continue;
        if (Math.abs(back.lateral) < 1 || Math.abs(back.lateral) > STATION_REACH) continue;
        if (!laterals.some((l) => Math.abs(l - back.lateral) < 1.5)) laterals.push(back.lateral);
      }
      // The services: this stop, plus a twin stop on the island's far edge.
      const services: PlatformService[] = [{ line, stop: index, track: 0, edge: near, inward: side, number: 1 }];
      for (const other of network.lines) {
        if (other === line) continue;
        const twinIndex = other.stops.findIndex((s) => s.id === stop.id && s.twin);
        if (twinIndex < 0) continue;
        const twin = other.stops[twinIndex]!;
        const back = line.path.project(other.path.at(twin.s));
        const track = back.lateral;
        const inward: 1 | -1 = track > (near + far) / 2 ? -1 : 1;
        services.push({ line: other, stop: twinIndex, track, edge: track + inward * PLATFORM_EDGE, inward, number: 2 });
      }
      // Side platforms of the other direction (no twin) are numbered 2 too.
      if (services.length === 1 && line !== network.lines[0]) services[0] = { ...services[0]!, number: 2 };
      // The FOB spans the station's tracks and lands 5 m beyond the outermost on each side
      // (its stairs down there stand clear of the trains).
      const lo = Math.min(far, near, ...laterals) - 5;
      const hi = Math.max(far, near, ...laterals) + 5;
      // The booking office is on the side with more track to cross (the town side of a yard), or behind a side platform.
      const officeSide: 1 | -1 = island ? (Math.abs(hi) > Math.abs(lo) ? 1 : -1) : side;
      const officeW = officeSide > 0 ? hi + 5 : lo - 5;
      const half = PLATFORM_LENGTH / 2;
      out.push({
        key: `${line.id}:${index}`,
        station,
        line,
        stop,
        index,
        island,
        near,
        far,
        services,
        fob: { u: FOB_AT, from: lo, to: hi },
        office: { u: FOB_AT, w: officeW, facing: officeSide > 0 ? -1 : 1 },
        exits: [-half + 1, half - 1, FOB_AT + FOB_HALF_WIDTH + FOB_STAIR_RUN + 0.8],
        busy: Math.min(1, (island ? 0.8 : 0.55) + (station.name.includes("Egmore") ? 0.2 : 0)),
      });
    });
  }
  return out;
}

/** The deck's middle across (the owner's frame). */
export function platformMiddle(p: StationPlatform): number {
  return (p.near + p.far) / 2;
}

/** One row of a departure board. */
export interface BoardRow {
  readonly destination: string;
  readonly platform: number;
  /** Seconds until it arrives (0 while it stands at the platform). */
  readonly wait: number;
  /** "On platform", "Arriving", "Due" or "N min". */
  readonly status: string;
}

/** Status text for a train `wait` seconds away (0 when standing, `standing` true). */
export function boardStatus(wait: number, standing: boolean): string {
  if (standing) return "On platform";
  if (wait < 45) return "Arriving";
  const minutes = Math.ceil(wait / 60);
  return minutes <= 1 ? "Due" : `${minutes} min`;
}

/**
 * The next trains at a platform, soonest first: for each service, its next train and the one
 * after (one headway later), at most `rows` in all. Trains that run off the map still show their
 * real destination (Tambaram), as the boards do.
 */
export function departureRows(platform: StationPlatform, clock: number, rows = 3): BoardRow[] {
  const out: BoardRow[] = [];
  for (const service of platform.services) {
    const { line } = service;
    // A train ending its run here takes no passengers.
    if (service.stop === line.stops.length - 1 && !line.to.beyond) continue;
    const wait = line.nextArrival(service.stop, clock);
    if (!Number.isFinite(wait)) continue;
    const standing = wait === 0 && line.trains(clock).some((t) => t.state.stoppedAt === service.stop);
    out.push({ destination: line.destination, platform: service.number, wait, status: boardStatus(wait, standing) });
    const later = wait + line.headway;
    out.push({ destination: line.destination, platform: service.number, wait: later, status: boardStatus(later, false) });
  }
  out.sort((a, b) => a.wait - b.wait);
  return out.slice(0, rows);
}

/** "17:05" for a time of day in hours. */
export function clockText(hour: number): string {
  const minutes = Math.floor((((hour % 24) + 24) % 24) * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The board's lines of text, for drawing and for tests: a header, then one line per train. */
export function boardText(platform: StationPlatform, clock: number, hour: number): string[] {
  const header = `${platform.station.name.toUpperCase()}  ${clockText(hour)}`;
  return [header, ...departureRows(platform, clock).map((row) => `PF ${row.platform}  ${row.destination.toUpperCase()}  ${row.status.toUpperCase()}`)];
}
