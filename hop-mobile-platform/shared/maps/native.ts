// Native Google map for the Android apps (Maps SDK for Android through @capacitor/google-maps).
// Native map loads without a Map ID are free and unlimited, unlike the web map, which is billed
// per load. The SDK draws the map underneath the web view, so the page above the map area is
// made transparent while it is shown.
//
// The plugin can't move or rotate a marker, so a moving vehicle is redrawn (new marker first,
// then the old one removed) from pre-rendered PNGs at 15° steps (scripts/map-sprites.mjs).
import type { PluginListenerHandle } from "@capacitor/core";
import { GoogleMap, LatLngBounds, MapType } from "@capacitor/google-maps";
import { CapacitorGoogleMaps } from "@capacitor/google-maps/dist/esm/implementation";
import { hopMapStyles } from "./google";
import { VehicleMotion } from "./motion";
import type { AlternativeRoute, Coordinate, MapData, MapPreferences, MapView } from "./types";
import { vehicleCategory } from "./types";

const SPRITE_STEP = 15;
const sprite = (category: string, heading: number) =>
  `assets/map/${vehicleCategory(category)}-${String((Math.round((((heading % 360) + 360) % 360) / SPRITE_STEP) * SPRITE_STEP) % 360).padStart(3, "0")}.png`;
const VEHICLE = { width: 46, height: 46 };
const PIN = { width: 32, height: 42 };
const MOVE_EVERY_MS = 160; // redraw a gliding vehicle about 6 times a second
// Google never tells the app that it rejected the API key: the map stays blank instead. If the
// first tiles haven't loaded by then, the app switches to OpenStreetMap.
const TILES_LOADED_WITHIN_MS = 12_000;
let sequence = 0;

export const nativeMapsEnabled = () => import.meta.env.VITE_NATIVE_MAPS === "true";

type Placed = { id: string; key: string };

export class NativeMapView implements MapView {
  private map?: GoogleMap;
  private queue: Promise<unknown> = Promise.resolve();
  private failed = false;
  private pickup?: Placed;
  private dropoff?: Placed;
  private current?: Placed;
  private route?: Placed;
  private alternatives = new Map<string, number>(); // polyline id → route index
  private preview?: Placed;
  private vehicles = new Map<string, { placed?: Placed; category: string; last: number; pending?: { p: Coordinate; h: number } }>();
  private lastCamera = { center: { lat: 13.0067, lng: 80.2206 }, zoom: 14 };
  private motion = new VehicleMotion((id, p, h) => this.moveVehicle(id, p, h));
  private restoredBackgrounds: [HTMLElement, string][] = [];
  private tilesTimer?: ReturnType<typeof setTimeout>;
  private tilesListener?: Promise<PluginListenerHandle>;

  constructor(private host: HTMLElement, center: Coordinate, private failure: () => void) {
    this.lastCamera.center = center;
    this.revealBehindPage();
    const id = `hop-map-${++sequence}`;
    this.tilesTimer = setTimeout(() => this.fail(), TILES_LOADED_WITHIN_MS);
    this.tilesListener = CapacitorGoogleMaps.addListener("onMapLoaded", (e) => {
      if (e.mapId === id) this.stopTilesWatch();
    });
    this.run(async () => {
      this.map = await GoogleMap.create({
        id,
        element: host,
        apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
        forceCreate: true,
        config: { center, zoom: 14, styles: hopMapStyles({ traffic: false, satellite: false, lowdata: false, night: false }) },
      });
      await this.map.setOnMapClickListener((e) => window.dispatchEvent(new CustomEvent("hop-map-pick", { detail: { lat: e.latitude, lng: e.longitude } })));
      await this.map.setOnCameraMoveStartedListener((e) => { if (e.isGesture) window.dispatchEvent(new Event("hop-map-drag")); });
      await this.map.setOnCameraIdleListener((e) => { this.lastCamera = { center: { lat: e.latitude, lng: e.longitude }, zoom: e.zoom }; });
      await this.map.setOnPolylineClickListener((e) => {
        const index = this.alternatives.get(e.polylineId);
        if (index != null) window.dispatchEvent(new CustomEvent("hop-route-pick", { detail: { index } }));
      });
    });
  }

  // Native calls run one after another, in order. A failure switches the app to the web map.
  private run(work: () => Promise<unknown>) {
    this.queue = this.queue.then(() => (this.failed ? undefined : work())).catch(() => this.fail());
    return this.queue;
  }

  private fail() {
    this.stopTilesWatch();
    if (!this.failed) { this.failed = true; this.failure(); }
  }

  private stopTilesWatch() {
    clearTimeout(this.tilesTimer);
    void this.tilesListener?.then((l) => l.remove()).catch(() => undefined);
    this.tilesListener = undefined;
  }

  // The native map sits under the web view: clear the backgrounds between it and the page root.
  private revealBehindPage() {
    for (let el: HTMLElement | null = this.host; el; el = el.parentElement) {
      this.restoredBackgrounds.push([el, el.style.background]);
      el.style.background = "transparent";
    }
    document.documentElement.classList.add("hop-native-map");
  }

  setPreferences(p: MapPreferences) {
    this.run(async () => {
      if (!this.map) return;
      await this.map.setMapType(p.satellite && !p.lowdata ? MapType.Hybrid : MapType.Normal);
      await this.map.enableTrafficLayer(p.traffic && !p.lowdata);
    });
  }

  private async placeMarker(old: Placed | undefined, key: string, marker: Parameters<GoogleMap["addMarker"]>[0]): Promise<Placed> {
    if (old?.key === key) return old;
    const id = await this.map!.addMarker(marker);
    if (old) await this.map!.removeMarker(old.id); // add first, then remove: no flicker
    return { id, key };
  }
  private async clear(old?: Placed) {
    if (old && this.map) await this.map.removeMarker(old.id);
  }

  update(data: MapData) {
    this.run(async () => {
      if (!this.map) return;
      const pin = (p: Coordinate, icon: string, title: string, z: number) => ({
        coordinate: p, iconUrl: `assets/map/${icon}.png`, iconSize: PIN, iconAnchor: { x: PIN.width / 2, y: PIN.height }, title, zIndex: z,
      });
      if (data.pickup) this.pickup = await this.placeMarker(this.pickup, `${data.pickup.lat},${data.pickup.lng}`, pin(data.pickup, "pickup", "Pickup", 10));
      else { await this.clear(this.pickup); this.pickup = undefined; }
      if (data.dropoff) this.dropoff = await this.placeMarker(this.dropoff, `${data.dropoff.lat},${data.dropoff.lng}`, pin(data.dropoff, "dropoff", "Destination", 10));
      else { await this.clear(this.dropoff); this.dropoff = undefined; }
      if (data.current) this.current = await this.placeMarker(this.current, `${data.current.lat.toFixed(5)},${data.current.lng.toFixed(5)}`, {
        coordinate: data.current, iconUrl: "assets/map/current.png", iconSize: { width: 44, height: 44 }, iconAnchor: { x: 22, y: 22 }, title: "Your location", zIndex: 8,
      });
      else { await this.clear(this.current); this.current = undefined; }
      await this.setRoute(data.route || []);
      // Vehicles: the motion engine decides positions; markers follow at a bridge-friendly rate.
      const ids = new Set(data.vehicles.map((v) => v.id));
      for (const [id, v] of this.vehicles) {
        if (!ids.has(id)) { this.motion.remove(id); await this.clear(v.placed); this.vehicles.delete(id); }
      }
      for (const v of data.vehicles) {
        if (!this.vehicles.has(v.id)) this.vehicles.set(v.id, { category: v.category, last: 0 });
        this.motion.set(v.id, v, v.heading);
      }
    });
  }

  private routeKey = "";
  private async setRoute(points: Coordinate[]) {
    const key = points.length ? `${points.length}:${points[0].lat},${points[0].lng}:${points.at(-1)!.lat}` : "";
    if (key === this.routeKey) return;
    this.routeKey = key;
    const old = this.route;
    this.route = undefined;
    if (points.length > 1) {
      const [id] = await this.map!.addPolylines([{ path: points, strokeColor: "#4b3fd1", strokeOpacity: 0.95, strokeWeight: 6, geodesic: false }]);
      this.route = { id, key };
    }
    if (old) await this.map!.removePolylines([old.id]);
  }

  // Called by the motion engine every frame; redraws at most every MOVE_EVERY_MS per vehicle.
  private moveVehicle(id: string, p: Coordinate, h: number) {
    const v = this.vehicles.get(id);
    if (!v) return;
    const now = performance.now();
    if (now - v.last < MOVE_EVERY_MS && v.placed) { v.pending = { p, h }; return; }
    v.last = now;
    v.pending = undefined;
    this.run(async () => {
      if (!this.map || !this.vehicles.has(id)) return;
      v.placed = await this.placeMarker(v.placed, `${p.lat.toFixed(6)},${p.lng.toFixed(6)}:${sprite(v.category, h)}`, {
        coordinate: p, iconUrl: sprite(v.category, h), iconSize: VEHICLE, iconAnchor: { x: VEHICLE.width / 2, y: VEHICLE.height / 2 }, title: "Live captain", zIndex: 20,
      });
    });
    // Make sure the final position of a glide is drawn even if it landed inside the throttle window.
    setTimeout(() => { const last = this.vehicles.get(id)?.pending; if (last) this.moveVehicle(id, last.p, last.h); }, MOVE_EVERY_MS);
  }

  setRouteProgress(points: Coordinate[]) {
    this.run(() => this.setRoute(points));
  }

  setAlternatives(routes: AlternativeRoute[]) {
    this.run(async () => {
      if (!this.map) return;
      const old = [...this.alternatives.keys()];
      this.alternatives.clear();
      const others = routes.filter((r) => !r.selected && r.route.length > 1);
      if (others.length) {
        const ids = await this.map.addPolylines(others.map((r) => ({ path: r.route, strokeColor: "#8b8fa3", strokeOpacity: 0.65, strokeWeight: 6, clickable: true, tag: String(r.index) })));
        ids.forEach((id, i) => this.alternatives.set(id, others[i].index));
      }
      if (old.length) await this.map.removePolylines(old);
    });
  }

  private previewAt = 0;
  setPreviewVehicle(pos: Coordinate | null, heading = 0) {
    const now = performance.now();
    if (pos && now - this.previewAt < MOVE_EVERY_MS) return;
    this.previewAt = now;
    this.run(async () => {
      if (!this.map) return;
      if (!pos) { await this.clear(this.preview); this.preview = undefined; return; }
      this.preview = await this.placeMarker(this.preview, `${pos.lat},${pos.lng}:${heading}`, {
        coordinate: pos, iconUrl: sprite("sedan", heading), iconSize: VEHICLE, iconAnchor: { x: 23, y: 23 }, title: "Route preview", zIndex: 30,
      });
    });
  }

  center(point: Coordinate) {
    this.run(async () => { await this.map?.setCamera({ coordinate: point, animate: true }); });
  }

  fit(points: Coordinate[]) {
    if (!points.length) return;
    if (points.length === 1) {
      this.run(async () => { await this.map?.setCamera({ coordinate: points[0], zoom: Math.max(this.lastCamera.zoom, 15), animate: true }); });
      return;
    }
    const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
    const sw = { lat: Math.min(...lats), lng: Math.min(...lngs) }, ne = { lat: Math.max(...lats), lng: Math.max(...lngs) };
    this.run(async () => {
      await this.map?.fitBounds(new LatLngBounds({ southwest: sw, northeast: ne, center: { lat: (sw.lat + ne.lat) / 2, lng: (sw.lng + ne.lng) / 2 } }), 60);
    });
  }

  camera() {
    return this.lastCamera;
  }
  restore(camera: { center: Coordinate; zoom: number }) {
    this.lastCamera = camera;
    this.run(async () => { await this.map?.setCamera({ coordinate: camera.center, zoom: camera.zoom, animate: false }); });
  }

  destroy() {
    this.stopTilesWatch();
    this.motion.destroy();
    const map = this.map;
    this.failed = true; // stop queued work
    void map?.destroy().catch(() => undefined);
    for (const [el, bg] of this.restoredBackgrounds) el.style.background = bg;
    document.documentElement.classList.remove("hop-native-map");
  }
}
