import { api, APIError } from "../services/client";
import type { Ride } from "../services/contracts";
import type { MapData, Vehicle, Coordinate } from "./types";
import { validCoordinate } from "./types";
import { arrivalNote, waitNote } from "./pins";
export type Telemetry = Coordinate & {
  at: string;
  stale: boolean;
  status: string;
  heading?: number;
};
export function measuredVehicle(
  position: Telemetry,
  category: string,
  now = Date.now(),
): Vehicle[] {
  const age = now - Date.parse(position.at);
  return position.stale ||
    !validCoordinate(position) ||
    !Number.isFinite(age) ||
    age < -5000 ||
    age > 20000 ||
    !["accepted", "arrived", "in_progress"].includes(position.status)
    ? []
    : [
        {
          id: "active-captain",
          category,
          lat: position.lat,
          lng: position.lng,
          heading: position.heading,
        },
      ];
}
export class LiveFeed {
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private point?: Coordinate;
  private navigation?: {
    ride: string;
    until: number;
    route: Coordinate[];
    steps: { instruction: string; meters: number }[];
    seconds: number;
    meters: number;
    stale: boolean;
  };
  private data: MapData = {
    center: { lat: 13.0067, lng: 80.2206 },
    vehicles: [],
  };
  private lastPositionAt = 0;
  private lastFreshAt = 0; // this phone's clock when a newer captain fix last arrived
  private approach?: { ride: string; until: number; route: Coordinate[]; seconds?: number };
  constructor(
    private role: "rider" | "captain",
    private update: (data: MapData, message: string) => void,
    private driverStatus?: (online: boolean) => void,
  ) {}
  setLocation(point: Coordinate) {
    this.point = point;
  }
  async start() {
    await this.tick();
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }
  private async tick() {
    if (this.stopped) return;
    if (document.hidden) {
      this.schedule();
      return;
    }
    try {
      await api.session();
      const state = await api.state();
      window.dispatchEvent(
        new CustomEvent("hop-live-state", { detail: state }),
      );
      this.driverStatus?.(!!state.driver?.[0]?.online);
      const ride = state.rides?.find(
        (r) =>
          (this.role === "rider" ? r.mine : r.driving) &&
          ["requested", "accepted", "arrived", "in_progress"].includes(
            r.status,
          ),
      );
      if (ride) await this.trip(ride);
      else {
        const driver = state.driver?.[0];
        const center =
          this.point ||
          (driver?.lat != null && driver?.lng != null
            ? { lat: driver.lat, lng: driver.lng }
            : undefined);
        if (center && validCoordinate(center)) {
          const nearby = await api.request<{ drivers: Vehicle[] | null }>(
            `/api/nearby?lat=${encodeURIComponent(center.lat)}&lng=${encodeURIComponent(center.lng)}`,
          );
          this.data = {
            center,
            vehicles: (nearby.drivers || []).filter(validCoordinate),
          };
          this.update(
            this.data,
            this.data.vehicles.length
              ? "Live nearby vehicles"
              : "No nearby vehicles online",
          );
        } else {
          this.data = { center: this.data.center, vehicles: [] };
          this.update(
            this.data,
            "Turn on location to see vehicles near you",
          );
        }
      }
    } catch (e) {
      // Never leave stale or fabricated cars visible after an unsuccessful poll.
      this.data = { center: this.data.center, vehicles: [] };
      this.update(
        this.data,
        e instanceof APIError && e.status === 401
          ? "Sign in to Hop to see live vehicles"
          : "Live vehicle updates unavailable · retrying",
      );
    }
    this.schedule();
  }
  private async trip(ride: Ride) {
    const pickup = { lat: ride.pickup_lat, lng: ride.pickup_lng },
      dropoff = { lat: ride.dropoff_lat, lng: ride.dropoff_lng };
    const position = await api.request<Telemetry>(
      `/api/rides/${encodeURIComponent(ride.id)}/position`,
    );
    const positionAt = Date.parse(position.at);
    // A captain who is standing still sends fixes less often than this 2 s poll. Keep showing
    // their last position for up to 30 s, and only then say it's out of date (and hide the car).
    const newer = Number.isFinite(positionAt) && positionAt > this.lastPositionAt;
    if (newer) {
      this.lastPositionAt = positionAt;
      this.lastFreshAt = Date.now();
    } else if (!Number.isFinite(positionAt) || Date.now() - this.lastFreshAt > 30_000) {
      this.data = { ...this.data, vehicles: [] };
      this.update(this.data, "Captain’s location is out of date · waiting for their phone");
      return;
    }
    const vehicles = measuredVehicle(position, ride.vehicle_category);
    let road = ride.route?.filter(validCoordinate);
    if (this.role === "captain" && vehicles.length) {
      try {
        const key = `${ride.id}:${ride.status}`;
        if (
          this.navigation?.ride !== key ||
          this.navigation.until < Date.now()
        ) {
          const nav = await api.request<{
            route: Coordinate[];
            steps: { instruction: string; meters: number }[];
            seconds: number;
            meters: number;
            stale: boolean;
          }>(`/api/rides/${encodeURIComponent(ride.id)}/nav`);
          this.navigation = { ...nav, ride: key, until: Date.now() + 8000 };
        }
        if (!this.navigation.stale && this.navigation.route?.length > 2)
          road = this.navigation.route.filter(validCoordinate);
        window.dispatchEvent(
          new CustomEvent("hop-navigation", { detail: this.navigation }),
        );
      } catch {
        window.dispatchEvent(
          new CustomEvent("hop-navigation", { detail: null }),
        );
      }
    }
    if (this.role === "captain" && !vehicles.length)
      window.dispatchEvent(new CustomEvent("hop-navigation", { detail: null }));
    // While the captain is on the way, show the rider the road the captain is taking. The same
    // call gives the time to the next stop for the pin callouts (wait, then arrival time).
    let approach = false;
    let secondsLeft: number | undefined;
    if (this.role === "rider" && (ride.status === "accepted" || ride.status === "in_progress") && vehicles.length) {
      try {
        const key = `${ride.id}:${ride.status}`;
        if (this.approach?.ride !== key || this.approach.until < Date.now()) {
          const nav = await api.request<{ route: Coordinate[]; stale: boolean; seconds?: number }>(`/api/rides/${encodeURIComponent(ride.id)}/nav`);
          this.approach = {
            ride: key, until: Date.now() + 15000,
            route: nav.stale ? [] : (nav.route || []).filter(validCoordinate),
            seconds: !nav.stale && Number.isFinite(nav.seconds) ? nav.seconds : undefined,
          };
        }
        secondsLeft = this.approach.seconds;
        if (ride.status === "accepted" && this.approach.route.length > 2) { road = this.approach.route; approach = true; }
      } catch {
        this.approach = undefined; // keep the booked route; never invent an approach path or time
      }
    }
    this.data = {
      center: vehicles[0] || pickup,
      pickup,
      dropoff,
      route: road,
      vehicles,
      phase: ride.status,
      approach,
      pickupNote: this.role === "rider" ? waitNote(ride.status, secondsLeft) : undefined,
      dropoffNote: this.role === "rider" && ride.status === "in_progress" && secondsLeft != null ? arrivalNote(secondsLeft) : undefined,
    };
    this.update(
      this.data,
      vehicles.length
        ? "Live captain location"
        : "Waiting for a fresh captain GPS update",
    );
  }
  private schedule() {
    if (!this.stopped) this.timer = setTimeout(() => void this.tick(), 2000);
  }
}
