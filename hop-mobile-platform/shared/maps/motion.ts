// Realistic vehicle motion for the live map.
// GPS fixes arrive about every 2 seconds. Instead of jumping, each vehicle glides to the new fix
// over one update interval (so motion looks continuous), turns along the shortest angle, and
// faces its direction of travel. On a trip, fixes near the planned road are snapped onto it.
import type { Coordinate } from "./types";

export function bearing(from: Coordinate, to: Coordinate): number {
  const lat1 = (from.lat * Math.PI) / 180, lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const R = 6371e3, lat1 = (a.lat * Math.PI) / 180, lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Nearest point on a route polyline, with the segment index and the road's direction there. */
export function snapToRoute(point: Coordinate, route: Coordinate[]) {
  if (route.length < 2) return null;
  // Flat projection is accurate enough over a few hundred metres.
  const k = Math.cos((point.lat * Math.PI) / 180);
  let best = { distance: Infinity, index: 0, point, bearing: 0 };
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1];
    const ax = a.lng * k, ay = a.lat, bx = b.lng * k, by = b.lat, px = point.lng * k, py = point.lat;
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
    const p = { lat: ay + t * dy, lng: (ax + t * dx) / k };
    const d = distanceMeters(point, p);
    if (d < best.distance) best = { distance: d, index: i, point: p, bearing: len ? bearing(a, b) : best.bearing };
  }
  return best;
}

/** Route still ahead of a vehicle: from its snapped position to the end. */
export function remainingRoute(route: Coordinate[], snap: { index: number; point: Coordinate }) {
  return [snap.point, ...route.slice(snap.index + 1)];
}

const turn = (from: number, to: number, t: number) => (from + ((((to - from) % 360) + 540) % 360 - 180) * t + 360) % 360;

type Track = { from: Coordinate; to: Coordinate; heading: number; fromHeading: number; started: number; duration: number; shown: Coordinate; shownHeading: number };

/**
 * Animates any number of vehicles. `draw` is called with the interpolated position and heading
 * every frame while something moves; providers only place a marker there.
 */
export class VehicleMotion {
  private tracks = new Map<string, Track>();
  private frame = 0;
  constructor(private draw: (id: string, position: Coordinate, heading: number) => void, private interval = 2100) {}

  /** A new measured position. `heading` is the GPS or road heading when known. */
  set(id: string, to: Coordinate, heading?: number) {
    const now = performance.now();
    const track = this.tracks.get(id);
    const valid = heading != null && Number.isFinite(heading);
    if (!track) {
      const h = valid ? heading! : 0;
      this.tracks.set(id, { from: to, to, heading: h, fromHeading: h, started: now, duration: 0, shown: to, shownHeading: h });
      this.draw(id, to, h);
      return;
    }
    const start = track.shown, moved = distanceMeters(start, to);
    // Heading: trust a measured heading while moving; otherwise face the direction of travel;
    // when parked, keep facing the same way instead of spinning on GPS noise.
    let next = track.heading;
    if (valid && moved > 1.5) next = heading!;
    else if (moved > 4) next = bearing(start, to);
    else if (valid && heading !== 0) next = heading!;
    const jump = moved > 800 || document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches;
    Object.assign(track, { from: start, to, fromHeading: track.shownHeading, heading: next, started: now, duration: jump ? 0 : this.interval });
    if (jump) {
      track.shown = to; track.shownHeading = next;
      this.draw(id, to, next);
      return;
    }
    this.loop();
  }

  remove(id: string) {
    this.tracks.delete(id);
  }

  has(id: string) {
    return this.tracks.has(id);
  }

  private loop() {
    if (this.frame) return;
    const step = (now: number) => {
      this.frame = 0;
      let moving = false;
      for (const [id, t] of this.tracks) {
        if (!t.duration) continue;
        const p = Math.min(1, (now - t.started) / t.duration);
        // Linear position keeps a steady speed across updates; heading eases in quickly.
        t.shown = { lat: t.from.lat + (t.to.lat - t.from.lat) * p, lng: t.from.lng + (t.to.lng - t.from.lng) * p };
        t.shownHeading = turn(t.fromHeading, t.heading, Math.min(1, p * 2.5));
        this.draw(id, t.shown, t.shownHeading);
        if (p < 1) moving = true;
        else t.duration = 0;
      }
      if (moving) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.tracks.clear();
  }
}

/** Where an alternative route is farthest from the chosen one: the clearest spot for its label. */
export function divergencePoint(alternative: Coordinate[], chosen: Coordinate[]): Coordinate {
  let best = alternative[Math.floor(alternative.length / 2)], far = -1;
  const step = Math.max(1, Math.floor(alternative.length / 60));
  for (let i = 0; i < alternative.length; i += step) {
    const d = snapToRoute(alternative[i], chosen)?.distance ?? 0;
    if (d > far) { far = d; best = alternative[i]; }
  }
  return best;
}
