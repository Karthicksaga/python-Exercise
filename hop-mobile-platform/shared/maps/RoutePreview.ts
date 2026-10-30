import type { Coordinate } from "./types";

export function computeBearing(from: Coordinate, to: Coordinate): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

export function computeDistanceMeters(a: Coordinate, b: Coordinate): number {
  const R = 6371e3;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function smoothAngle(current: number, target: number, factor = 0.28): number {
  let diff = (target - current + 180) % 360 - 180;
  if (diff < -180) diff += 360;
  return (current + diff * factor + 360) % 360;
}

export type RoutePreviewCallbacks = {
  onProgress: (
    subRoute: Coordinate[],
    vehiclePos: Coordinate,
    heading: number,
  ) => void;
  onCamera?: (pos: Coordinate) => void;
  onComplete: () => void;
};

export class RoutePreviewController {
  private rafId: number | null = null;
  private running = false;
  private currentHeading = 0;
  private lastCameraTime = 0;
  private lastCameraPos?: Coordinate;

  constructor(
    private route: Coordinate[],
    private callbacks: RoutePreviewCallbacks,
  ) {}

  public isRunning(): boolean {
    return this.running;
  }

  public start(): void {
    this.stop();

    if (!this.route || this.route.length < 2) {
      this.callbacks.onComplete();
      return;
    }

    // Accessibility: Respect prefers-reduced-motion by skipping directly to full route
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      const dest = this.route[this.route.length - 1];
      const prev = this.route[this.route.length - 2];
      const heading = computeBearing(prev, dest);
      this.callbacks.onProgress(this.route, dest, heading);
      this.callbacks.onComplete();
      return;
    }

    // 1. Precompute segment cumulative distances
    const cumDistances: number[] = [0];
    let totalDistance = 0;
    for (let i = 0; i < this.route.length - 1; i++) {
      const d = computeDistanceMeters(this.route[i], this.route[i + 1]);
      totalDistance += d;
      cumDistances.push(totalDistance);
    }

    // Edge case: if total distance is 0
    if (totalDistance <= 0) {
      this.callbacks.onProgress(this.route, this.route[0], 0);
      this.callbacks.onComplete();
      return;
    }

    // 2. Adaptive duration (between 3000ms and 5000ms)
    const durationMs = Math.min(
      5000,
      Math.max(3000, 3000 + (totalDistance / 10000) * 2000),
    );

    this.running = true;
    this.currentHeading = computeBearing(this.route[0], this.route[1]);
    this.lastCameraTime = 0;
    this.lastCameraPos = undefined;

    const startTime = performance.now();

    const frame = (now: number) => {
      if (!this.running) return;

      const elapsed = now - startTime;
      const rawProgress = Math.min(1, elapsed / durationMs);
      const eased = easeInOutCubic(rawProgress);
      const targetDist = eased * totalDistance;

      // Find current segment index
      let k = 0;
      while (
        k < cumDistances.length - 2 &&
        cumDistances[k + 1] <= targetDist
      ) {
        k++;
      }

      const segStartDist = cumDistances[k];
      const segEndDist = cumDistances[k + 1];
      const segLen = segEndDist - segStartDist;
      const u = segLen > 0 ? (targetDist - segStartDist) / segLen : 0;

      const p0 = this.route[k];
      const p1 = this.route[k + 1];

      const currentLat = p0.lat + u * (p1.lat - p0.lat);
      const currentLng = p0.lng + u * (p1.lng - p0.lng);
      const currentPos: Coordinate = { lat: currentLat, lng: currentLng };

      const segHeading = computeBearing(p0, p1);
      this.currentHeading = smoothAngle(this.currentHeading, segHeading, 0.25);

      // Build polyline sub-path up to current interpolated vertex
      const subRoute: Coordinate[] = this.route.slice(0, k + 1);
      subRoute.push(currentPos);

      this.callbacks.onProgress(subRoute, currentPos, this.currentHeading);

      // Throttled camera follow (~100ms or when moved >= 10m)
      if (
        this.callbacks.onCamera &&
        (now - this.lastCameraTime >= 100 ||
          (this.lastCameraPos &&
            computeDistanceMeters(this.lastCameraPos, currentPos) >= 12))
      ) {
        this.lastCameraTime = now;
        this.lastCameraPos = currentPos;
        this.callbacks.onCamera(currentPos);
      }

      if (rawProgress >= 1) {
        // Animation completed smoothly
        this.running = false;
        this.rafId = null;
        const dest = this.route[this.route.length - 1];
        const lastHeading = computeBearing(
          this.route[this.route.length - 2] || dest,
          dest,
        );
        this.callbacks.onProgress(this.route, dest, lastHeading);
        this.callbacks.onComplete();
        return;
      }

      this.rafId = requestAnimationFrame(frame);
    };

    this.rafId = requestAnimationFrame(frame);
  }

  public skip(): void {
    if (!this.running && !this.rafId) return;
    this.stop();
    if (!this.route || this.route.length === 0) {
      this.callbacks.onComplete();
      return;
    }
    const dest = this.route[this.route.length - 1];
    const prev = this.route[this.route.length - 2] || dest;
    const heading = computeBearing(prev, dest);
    this.callbacks.onProgress(this.route, dest, heading);
    this.callbacks.onComplete();
  }

  public stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
