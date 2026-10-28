import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { api } from "../services/client";
export class ForegroundTracking {
  private stopWatch?: () => void;
  private generation = 0;
  private lastSent = 0;
  private sending = false;
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
      if (
        generation !== this.generation ||
        document.hidden ||
        this.sending ||
        Date.now() - this.lastSent < 6000
      )
        return;
      if (coords.accuracy < 1 || coords.accuracy > 100) {
        this.status("GPS accuracy is low · waiting for a better fix");
        return;
      }
      this.sending = true;
      this.lastSent = Date.now();
      void api
        .request("/api/drivers/location", {
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          speed: Math.max(0, coords.speed || 0),
          heading: coords.heading || 0,
        })
        .then(() => this.status("Live GPS sharing on · keep Captain open"))
        .catch(() => {
          this.stop();
          this.status(
            "GPS sharing stopped · check your connection and online status",
          );
        })
        .finally(() => {
          this.sending = false;
        });
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
  stop() {
    this.generation++;
    this.stopWatch?.();
    this.stopWatch = undefined;
    this.active = false;
  }
}
