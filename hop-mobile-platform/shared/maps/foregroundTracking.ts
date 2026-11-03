import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { api, APIError } from "../services/client";
export class ForegroundTracking {
  private stopWatch?: () => void;
  private generation = 0;
  private lastSent = 0;
  private sending = false;
  private pending?: { lat: number; lng: number; accuracy: number; speed: number; heading: number; at: number };
  private lastFixAt = 0;
  private failures = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  active = false;
  constructor(private status: (message: string) => void) {}
  async start() {
    await api.session();
    const state = await api.state();
    if (!state.driver?.[0]?.online)
      throw new Error("Go online in your Captain account before sharing GPS.");
    const generation = ++this.generation;
    this.active = true;
    const receive = (coords: {
      latitude: number;
      longitude: number;
      accuracy: number;
      speed: number | null;
      heading: number | null;
    }) => {
      const at = Date.now();
      if (generation !== this.generation || document.hidden) return;
      if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude) || Math.abs(coords.latitude) > 90 || Math.abs(coords.longitude) > 180 || coords.accuracy < 1 || coords.accuracy > 100) {
        this.status("GPS accuracy is low · waiting for a better fix");
        return;
      }
      if (at <= this.lastFixAt) return;
      this.lastFixAt = at;
      this.pending = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy, speed: Math.max(0, coords.speed || 0), heading: coords.heading ?? 0, at };
      void this.flush(generation);
    };
    try {
      if (Capacitor.isNativePlatform()) {
        const permission = await Geolocation.requestPermissions();
        if (permission.location === "denied")
          throw new Error("Location permission is required.");
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
          (position, error) => {
            if (error) {
              this.stop();
              this.status("GPS unavailable · sharing stopped");
            } else if (position) receive(position.coords);
          },
        );
        if (generation !== this.generation)
          await Geolocation.clearWatch({ id });
        else
          this.stopWatch = () => {
            void Geolocation.clearWatch({ id });
          };
      } else {
        const id = navigator.geolocation.watchPosition(
          (p) => receive(p.coords),
          () => {
            this.stop();
            this.status("GPS unavailable · sharing stopped");
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
        this.stopWatch = () => navigator.geolocation.clearWatch(id);
      }
    } catch (e) {
      this.stop();
      throw e;
    }
  }
  private async flush(generation: number) {
    if (this.sending || !this.pending || generation !== this.generation) return;
    const fix = this.pending;
    this.pending = undefined;
    if (Date.now() - fix.at > 15000) return;
    this.sending = true;
    this.lastSent = Date.now();
    let failed = false;
    try {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("GPS upload timed out")), 12000));
      await Promise.race([api.request("/api/drivers/location", { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, speed: fix.speed, heading: fix.heading }), timeout]);
      this.failures = 0;
      this.status("Live GPS sharing on · keep Captain open");
    } catch (error) {
      failed = true;
      if (error instanceof APIError && [401, 403].includes(error.status)) {
        this.stop(); this.status("GPS sharing stopped · check your connection and online status");
      } else if (Date.now() - fix.at < 15000) {
        const newerPending = this.pending as typeof fix | undefined;
        this.pending = newerPending && newerPending.at > fix.at ? newerPending : fix;
        this.failures++;
        this.status("GPS upload unavailable · retrying with the next fix");
      }
    } finally {
      this.sending = false;
      if (generation !== this.generation) return;
      if (this.pending) {
        if (failed && this.failures > 0) this.retryTimer = setTimeout(() => void this.flush(generation), Math.min(5000, 500 * 2 ** Math.min(this.failures - 1, 4)));
        else void this.flush(generation);
      }
    }
  }
  stop() {
    this.generation++;
    this.stopWatch?.();
    this.stopWatch = undefined;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.pending = undefined;
    this.active = false;
  }
}
