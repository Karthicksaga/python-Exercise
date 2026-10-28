import type { Coordinate, MapData, MapView } from "./types";
import { vehicleCategory } from "./types";
declare global {
  interface Window {
    hopGoogleReady?: () => void;
    gm_authFailure?: () => void;
  }
}
let loading: Promise<void> | undefined;
let authFailed = false;
export function loadGoogle(key: string): Promise<void> {
  if (authFailed)
    return Promise.reject(new Error("Google Maps authentication failed"));
  if (typeof google !== "undefined" && google.maps?.Map)
    return Promise.resolve();
  if (!key) return Promise.reject(new Error("Google Maps key is missing"));
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Google Maps timed out")),
      12000,
    );
    window.hopGoogleReady = () => {
      clearTimeout(timer);
      resolve();
    };
    const previous = window.gm_authFailure;
    window.gm_authFailure = () => {
      authFailed = true;
      clearTimeout(timer);
      reject(new Error("Google Maps authentication failed"));
      window.dispatchEvent(new Event("hop-map-auth-failed"));
      previous?.();
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, callback: "hopGoogleReady", loading: "async", v: "weekly" })}`;
    script.async = true;
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Google Maps could not load"));
    };
    document.head.append(script);
  });
  return loading;
}
export class GoogleMapView implements MapView {
  private map: google.maps.Map;
  private vehicles = new Map<string, google.maps.Marker>();
  private pins: google.maps.Marker[] = [];
  private route: google.maps.Polyline;
  private tileTimeout?: ReturnType<typeof setTimeout>;
  constructor(host: HTMLElement, center: Coordinate, failed: () => void) {
    this.map = new google.maps.Map(host, {
      center,
      zoom: 14,
      disableDefaultUI: true,
      clickableIcons: false,
      gestureHandling: "greedy",
      mapTypeControl: false,
    });
    this.map.addListener("click", (event: google.maps.MapMouseEvent) => {
      if (event.latLng)
        window.dispatchEvent(
          new CustomEvent("hop-map-pick", { detail: event.latLng.toJSON() }),
        );
    });
    this.map.addListener("dragstart", () =>
      window.dispatchEvent(new Event("hop-map-drag")),
    );
    this.tileTimeout = setTimeout(failed, 15000);
    google.maps.event.addListenerOnce(this.map, "tilesloaded", () =>
      clearTimeout(this.tileTimeout),
    );
    this.route = new google.maps.Polyline({
      map: this.map,
      strokeColor: "#167b5b",
      strokeWeight: 5,
    });
  }
  update(data: MapData) {
    const ids = new Set(data.vehicles.map((v) => v.id));
    for (const [id, marker] of this.vehicles)
      if (!ids.has(id)) {
        marker.setMap(null);
        this.vehicles.delete(id);
      }
    for (const v of data.vehicles) {
      let marker = this.vehicles.get(v.id);
      if (!marker) {
        marker = new google.maps.Marker({
          map: this.map,
          title: "Live captain",
          icon: {
            url: `./assets/${vehicleCategory(v.category)}.png`,
            scaledSize: new google.maps.Size(42, 30),
            anchor: new google.maps.Point(21, 15),
          },
        });
        this.vehicles.set(v.id, marker);
      }
      // Only measured server positions are displayed. No idle wandering or extrapolation.
      marker.setPosition({ lat: v.lat, lng: v.lng });
    }
    this.pins.forEach((p) => p.setMap(null));
    this.pins = [];
    for (const [point, title, color] of [
      [data.pickup, "Pickup", "#167b5b"],
      [data.dropoff, "Destination", "#e54d36"],
      [data.current, "Current location", "#2677df"],
    ] as const)
      if (point)
        this.pins.push(
          new google.maps.Marker({
            map: this.map,
            position: point,
            title,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: color,
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 3,
            },
          }),
        );
    this.route.setPath(data.route || []);
  }
  center(point: Coordinate) {
    this.map.panTo(point);
  }
  fit(points: Coordinate[]) {
    if (!points.length) return;
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    this.map.fitBounds(bounds, 35);
  }
  destroy() {
    clearTimeout(this.tileTimeout);
    this.vehicles.forEach((m) => m.setMap(null));
    this.pins.forEach((m) => m.setMap(null));
    this.route.setMap(null);
    google.maps.event.clearInstanceListeners(this.map);
  }
}
