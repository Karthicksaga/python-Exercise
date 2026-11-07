// OpenStreetMap drawn by MapLibre directly (Nov 2026), so the map can tilt into 3D.
// It replaces the Leaflet view (osm.ts) wherever the phone has WebGL; osm.ts stays as the
// fallback for phones without it and for VITE_MAP_STYLE=raster.
//
// - Base: Hop's vector style (vectorStyle.ts) with 3D buildings, landmark badges and one-way
//   arrows. If the vector server fails to load, image tiles are used instead.
// - Hop's own layers on top: the service area edge, the captain demand glow, alternative routes,
//   the walking path and the route (drawn in, then a soft light travels along it).
// - Pins, vehicles and "you are here" are HTML markers, so they keep the approved artwork
//   and animations. Pins stand upright when the map tilts; vehicles lie flat on the road.
// - 3D: a live trip that follows the vehicle tilts and turns heading-up (navigation view).
//   Overviews (fit) are always flat. setThreeD() is the map's 3D button.
import maplibregl, { type GeoJSONSource, type StyleSpecification, type LayerSpecification, type ExpressionSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { AlternativeRoute, Coordinate, MapData, MapView, MapPreferences } from "./types";
import { divergencePoint, VehicleMotion } from "./motion";
import { topDownVehicle } from "./vehicleArt";
import { framePadding, pinHtml, type PinKind } from "./pins";
import { hopVectorStyle, VECTOR_ATTRIBUTION, type HopMapMode } from "./vectorStyle";
import { provideIcons } from "./mapIcons";

const VECTOR_LOAD_MS = 20_000; // a cold first load (fonts + tiles) can be slow on phones
const ROUTE = "#4b3fd1";
const NAV_PITCH = 55;
const TILT_PITCH = 50;
const LIVE = ["accepted", "arrived", "in_progress"];
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const lngLat = (p: Coordinate): [number, number] => [p.lng, p.lat];

type Feature = GeoJSON.Feature;
const collection = (features: Feature[] = []): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const line = (points: Coordinate[], properties: Record<string, unknown> = {}): Feature => ({
  type: "Feature", properties, geometry: { type: "LineString", coordinates: points.map(lngLat) },
});

/** A service area is a lat/lng rectangle (zones in /api/config). */
export type ServiceArea = { min_lat: number; max_lat: number; min_lng: number; max_lng: number };
/** One cell of /api/drivers/demand. */
export type DemandCell = { lat: number; lng: number; requests: number; drivers?: number };

// Landmarks used for "near …" on the pickup, and as suggested pickup points.
const NEAR_CLASSES = new Set(["place_of_worship", "fuel", "bus", "railway", "hospital", "shop", "college", "school"]);
const PICKUP_POINT_CLASSES = new Set(["railway", "bus", "hospital", "shop"]);
const SUFFIX: Record<string, [RegExp, string]> = {
  fuel: [/bunk|petrol|fuel|pump|station/i, "bunk"],
  bus: [/bus|stop|stand|depot/i, "bus stop"],
  railway: [/station|metro|junction/i, "station"],
};
function landmarkName(props: Record<string, unknown>) {
  const name = String(props["name:en"] || props.name || "").trim();
  if (!name) return "";
  const suffix = SUFFIX[String(props.class)];
  return suffix && !suffix[0].test(name) ? `${name} ${suffix[1]}` : name;
}
const isPickupPoint = (props: Record<string, unknown>) =>
  PICKUP_POINT_CLASSES.has(String(props.class)) &&
  (props.class !== "shop" || ["mall", "department_store"].includes(String(props.subclass))) &&
  (props.class !== "railway" || !["halt", "tram_stop"].includes(String(props.subclass)));

function distance(a: Coordinate, b: Coordinate) {
  const R = 6371e3, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function markerElement(className: string, title?: string, html = "") {
  const el = document.createElement("div");
  el.className = `hop-map-marker ${className}`;
  if (title) el.title = title;
  el.innerHTML = html;
  return el;
}
const vehicleHtml = (category: string, heading = 0) =>
  `<div class="hop-vehicle-marker" style="transform: rotate(${Number.isFinite(heading) ? heading : 0}deg);"><img src="${topDownVehicle(category)}" alt="Vehicle" class="hop-vehicle-icon" draggable="false" /></div>`;

// Hop's own layers, drawn above the base map. Their data lives here, so a restyle keeps them.
const OVERLAY_SOURCES = ["hop-area", "hop-demand", "hop-alt", "hop-walk", "hop-route"] as const;
type OverlaySource = (typeof OVERLAY_SOURCES)[number];
function overlayLayers(night: boolean): LayerSpecification[] {
  return [
    // Outside the service area is shaded, with a dashed edge, so riders see where Hop runs.
    { id: "hop-area-mask", type: "fill", source: "hop-area", filter: ["==", ["get", "kind"], "mask"], paint: { "fill-color": night ? "#000000" : "#14151f", "fill-opacity": night ? 0.28 : 0.08 } },
    { id: "hop-area-edge", type: "line", source: "hop-area", filter: ["==", ["get", "kind"], "edge"], paint: { "line-color": ROUTE, "line-opacity": 0.45, "line-width": 1.5, "line-dasharray": [3, 3] } },
    // Captain demand glow: where riders asked for rides in the last 45 minutes.
    {
      id: "hop-demand", type: "heatmap", source: "hop-demand", maxzoom: 17,
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 0, 0, 6, 1],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 15, 1.4],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 18, 13, 38, 16, 70],
        "heatmap-opacity": 0.55,
        "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(255,166,0,0)", 0.3, "rgba(255,176,46,0.5)", 0.6, "rgba(255,122,41,0.75)", 1, "rgba(234,67,53,0.9)"],
      },
    },
    { id: "hop-alt", type: "line", source: "hop-alt", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#8b8fa3", "line-width": 6, "line-opacity": 0.6 } },
    { id: "hop-walk", type: "line", source: "hop-walk", layout: { "line-cap": "round" }, paint: { "line-color": "#2677df", "line-width": 3, "line-opacity": 0.9, "line-dasharray": [0.2, 2.3] } },
    { id: "hop-route-casing", type: "line", source: "hop-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": night ? "#171923" : "#ffffff", "line-width": 8, "line-opacity": 0.9 } },
    { id: "hop-route", type: "line", source: "hop-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-width": 5, "line-gradient": solid() } },
    {
      id: "hop-route-arrows", type: "symbol", source: "hop-route", minzoom: 13,
      layout: { "symbol-placement": "line", "symbol-spacing": 90, "icon-image": "hop-route-arrow", "icon-rotate": 90, "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true },
    },
  ];
}
function solid(): ExpressionSpecification {
  return ["interpolate", ["linear"], ["line-progress"], 0, ROUTE, 1, ROUTE];
}

export class MapLibreMapView implements MapView {
  private map: maplibregl.Map;
  private host: HTMLElement;
  private status: (message: string) => void;
  private destroyed = false;
  private loaded = false;
  private base: "vector" | "raster" = "vector";
  private look: { mode: HopMapMode; night: boolean } = { mode: "browse", night: false };
  private nightPreferred = false;
  private lowData = false;
  private geo: Record<OverlaySource, GeoJSON.FeatureCollection> = {
    "hop-area": collection(), "hop-demand": collection(), "hop-alt": collection(), "hop-walk": collection(), "hop-route": collection(),
  };
  private routePoints: Coordinate[] = [];
  private vehicles = new Map<string, maplibregl.Marker>();
  private motion = new VehicleMotion((id, p, heading) => {
    const marker = this.vehicles.get(id);
    if (!marker) return;
    marker.setLngLat(lngLat(p));
    const el = marker.getElement().querySelector<HTMLElement>(".hop-vehicle-marker");
    if (el) el.style.transform = `rotate(${heading}deg)`;
    if (this.nav && id === this.followId && Number.isFinite(heading)) this.navHeading = heading;
  });
  private pins: Partial<Record<PinKind, { marker: maplibregl.Marker; key: string }>> = {};
  private current?: maplibregl.Marker;
  private currentHeading?: number;
  private preview?: maplibregl.Marker;
  private tags: maplibregl.Marker[] = [];
  private tagRoutes: { from: Coordinate; route: Coordinate[] }[] = [];
  private suggestions: maplibregl.Marker[] = [];
  private suggestKey = "";
  private near?: string;
  private data?: MapData;
  private resize: ResizeObserver;
  // 3D
  private threeD = true; // the person's choice; off means always flat
  private nav = false; // a live trip following the vehicle: tilted and heading-up
  private navHeading?: number;
  private followId?: string;
  // Route animation
  private routeKey = "";
  private animation = 0;
  private drawTimer?: ReturnType<typeof setTimeout>;

  constructor(host: HTMLElement, center: Coordinate, status: (message: string) => void) {
    this.host = host;
    this.status = status;
    try { this.threeD = localStorage.getItem("hop-map-3d") !== "off"; } catch { /* storage blocked */ }
    this.map = new maplibregl.Map({
      container: host,
      style: this.style(),
      center: lngLat(center),
      zoom: 14,
      attributionControl: { compact: false, customAttribution: [] },
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 65,
      fadeDuration: 150,
    });
    // Two-finger tilt works; turning the map by hand is off outside navigation (it confuses
    // north-up booking screens).
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disableRotation();
    provideIcons(this.map);
    host.classList.add("hop-vector-base", "hop-maplibre");
    (host as HTMLElement & { hopDebug?: unknown }).hopDebug = {
      route: () => this.routePoints,
      project: (p: Coordinate) => this.map.project(lngLat(p)),
      vehicle: () => [...this.vehicles.values()][0]?.getLngLat(),
      pitch: () => this.map.getPitch(),
      bearing: () => this.map.getBearing(),
      nav: () => ({ nav: this.nav, phase: this.data?.phase, following: this.data?.following, threeD: this.threeD }),
      overlay: (id: OverlaySource) => this.geo[id].features.length,
      jump: (p: Coordinate, zoom: number) => this.map.jumpTo({ center: lngLat(p), zoom }),
    };

    const timer = setTimeout(() => this.useRaster("timed out"), VECTOR_LOAD_MS);
    this.map.once("load", () => {
      this.loaded = true;
      clearTimeout(timer);
      this.afterLoad();
    });
    this.map.on("error", (e) => {
      if (this.destroyed) return;
      if (!this.loaded && this.base === "vector") {
        clearTimeout(timer);
        this.useRaster(e.error?.message || "load error");
      } else if (this.loaded) this.status("Map tiles unavailable · check your connection");
    });

    this.map.on("click", (event) => {
      const target = event.originalEvent.target as Element | null;
      if (target?.closest?.(".maplibregl-marker")) return;
      const alt = this.loaded && this.map.getLayer("hop-alt") ? this.map.queryRenderedFeatures(event.point, { layers: ["hop-alt"] })[0] : undefined;
      if (alt) {
        window.dispatchEvent(new CustomEvent("hop-route-pick", { detail: { index: alt.properties?.index } }));
        return;
      }
      window.dispatchEvent(new CustomEvent("hop-map-pick", { detail: { lat: event.lngLat.lat, lng: event.lngLat.lng } }));
    });
    this.map.on("dragstart", () => window.dispatchEvent(new Event("hop-map-drag")));
    this.map.on("pitchend", this.tiltChanged);
    this.map.on("moveend", this.afterMove);
    this.map.on("resize", this.keepCalloutsInside);
    this.map.on("idle", this.refreshNearby);
    this.resize = new ResizeObserver(() => { if (!this.destroyed) this.map.resize(); });
    this.resize.observe(host);
  }

  // ── Style ────────────────────────────────────────────
  private night = () => this.nightPreferred || Boolean(this.host.closest(".app.dark"));

  private style(): StyleSpecification {
    const { mode, night } = this.look;
    const base: StyleSpecification = this.base === "vector" ? hopVectorStyle(mode, night) : this.rasterStyle(night);
    const sources = { ...base.sources } as StyleSpecification["sources"];
    for (const id of OVERLAY_SOURCES) sources[id] = { type: "geojson", data: this.geo[id], ...(id === "hop-route" ? { lineMetrics: true } : {}) };
    return { ...base, sources, layers: [...base.layers, ...overlayLayers(night)] };
  }
  private rasterStyle(night: boolean): StyleSpecification {
    return {
      version: 8,
      glyphs: hopVectorStyle("browse", false).glyphs,
      sources: {
        tiles: {
          type: "raster", tileSize: 256, maxzoom: 19,
          tiles: [import.meta.env.VITE_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          attribution: import.meta.env.VITE_MAP_ATTRIBUTION || '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": night ? "#1a1c26" : "#dfdfeb" } },
        // The same soft tint the Leaflet map used; night darkens instead of inverting.
        { id: "tiles", type: "raster", source: "tiles", paint: night ? { "raster-saturation": -0.7, "raster-brightness-max": 0.45, "raster-contrast": -0.1 } : { "raster-saturation": -0.6, "raster-contrast": -0.06 } },
      ],
    };
  }
  private useRaster(reason: string) {
    if (this.destroyed || this.base === "raster" || this.loaded) return;
    console.warn(`Hop vector map unavailable (${reason}); using image tiles`);
    this.base = "raster";
    this.host.classList.remove("hop-vector-base");
    // The first "load" listener (constructor) still fires once this style has drawn.
    this.map.setStyle(this.style());
  }
  private restyle(mode: HopMapMode, night: boolean) {
    if (mode === this.look.mode && night === this.look.night) return;
    this.look = { mode, night };
    if (!this.destroyed) this.map.setStyle(this.style(), { diff: true });
  }
  private afterLoad() {
    if (this.destroyed) return;
    for (const id of OVERLAY_SOURCES) this.setGeo(id, this.geo[id]);
    this.map.setMaxPitch(this.lowData ? 0 : 65);
    this.refreshNearby();
  }
  private setGeo(id: OverlaySource, data: GeoJSON.FeatureCollection) {
    this.geo[id] = data;
    if (this.destroyed) return;
    (this.map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  }

  setPreferences(preferences: MapPreferences) {
    this.lowData = preferences.lowdata;
    this.nightPreferred = preferences.night;
    this.host.classList.toggle("hop-night-tiles", preferences.night);
    this.host.dataset.lowData = String(preferences.lowdata);
    // Low-data: flat map, and fewer tiles kept around.
    this.map.setMaxPitch(this.lowData ? 0 : 65);
    this.restyle(this.look.mode, this.night());
  }

  // ── 3D ───────────────────────────────────────────────
  /** The map's 3D button: tilt now (and allow the navigation view), or flatten and stay flat. */
  setThreeD(on: boolean) {
    this.threeD = on;
    try { localStorage.setItem("hop-map-3d", on ? "auto" : "off"); } catch { /* storage blocked */ }
    if (!on) {
      this.map.easeTo({ pitch: 0, bearing: 0, duration: reduced() ? 0 : 600 });
      return;
    }
    if (this.lowData) return;
    if (this.nav) this.followCamera();
    else this.map.easeTo({ pitch: TILT_PITCH, zoom: Math.max(this.map.getZoom(), 16), duration: reduced() ? 0 : 700 });
  }
  isTilted() {
    return this.map.getPitch() > 5;
  }
  private tiltChanged = () => {
    this.host.dataset.tilted = String(this.isTilted());
    window.dispatchEvent(new CustomEvent("hop-map-tilt", { detail: this.isTilted() }));
  };
  private followCamera(point?: Coordinate) {
    const at = point || this.data?.current || this.vehicles.get(this.followId || "")?.getLngLat();
    if (!at) return;
    const heading = point?.heading ?? this.navHeading;
    this.map.easeTo({
      center: [at.lng, at.lat],
      pitch: NAV_PITCH,
      bearing: heading != null && Number.isFinite(heading) ? heading : this.map.getBearing(),
      zoom: Math.max(this.map.getZoom(), 16.5),
      // Show more road ahead than behind.
      offset: [0, Math.round(this.host.clientHeight * 0.18)],
      duration: reduced() ? 0 : 700,
    });
  }

  // ── Data ─────────────────────────────────────────────
  update(data: MapData) {
    this.data = data;
    // 1. Vehicles glide and turn (motion engine); they lie flat on the road when tilted.
    const ids = new Set(data.vehicles.map((v) => v.id));
    for (const [id, marker] of this.vehicles) {
      if (ids.has(id)) continue;
      this.motion.remove(id);
      marker.remove();
      this.vehicles.delete(id);
    }
    for (const v of data.vehicles) {
      if (!this.vehicles.has(v.id)) {
        const el = markerElement("hop-vehicle-div-icon", "Live captain", vehicleHtml(v.category, v.heading));
        el.style.zIndex = "3";
        this.vehicles.set(v.id, this.addMarker(new maplibregl.Marker({ element: el, rotationAlignment: "map", pitchAlignment: "map" }).setLngLat(lngLat(v))));
      }
      this.motion.set(v.id, v, v.heading);
    }

    // 2. Pickup and drop-off pins with their callouts.
    const live = Boolean(data.phase && LIVE.includes(data.phase));
    this.restyle(data.phase ? "ride" : "browse", this.night());
    this.placePin("pickup", data.pickup, data);
    this.placePin("dropoff", data.dropoff, data);
    requestAnimationFrame(this.keepCalloutsInside);

    // 3. Dotted walking path from the rider to a nearby pickup while booking.
    const walk = data.editable && data.current && data.pickup && data.pickupNote ? [data.current, data.pickup] : undefined;
    this.setGeo("hop-walk", collection(walk ? [line(walk)] : []));

    // 4. You are here, with a heading beam.
    this.placeCurrent(data.current);

    // 5. Route with direction arrows; while booking it draws itself in.
    this.routePoints = data.route?.length ? data.route : [];
    this.host.toggleAttribute("data-route", this.routePoints.length > 1);
    this.setGeo("hop-route", collection(this.routePoints.length > 1 ? [line(this.routePoints)] : []));
    if (this.routePoints.length > 1) this.animateRoute(data);
    else { this.routeKey = ""; this.stopAnimation(); }

    // 6. Navigation view: a live trip that follows the vehicle tilts and turns heading-up.
    const wasNav = this.nav;
    this.followId = data.vehicles[0]?.id;
    this.nav = live && Boolean(data.following) && this.threeD && !this.lowData;
    const lead = data.vehicles[0]?.heading;
    if (this.nav && lead != null && Number.isFinite(lead)) this.navHeading = lead;
    if (wasNav && !this.nav && this.isTilted()) this.map.easeTo({ pitch: 0, bearing: 0, duration: reduced() ? 0 : 600 });
    this.suggestPickupPoints();
  }

  private addMarker(marker: maplibregl.Marker) {
    marker.addTo(this.map);
    // MapLibre labels every marker "Map marker"; ours carry their own titles and callouts.
    marker.getElement().removeAttribute("aria-label");
    return marker;
  }

  private placePin(kind: PinKind, point: Coordinate | undefined, data: MapData) {
    const note = kind === "pickup" ? data.pickupNote : data.dropoffNote;
    const editable = Boolean(data.editable);
    const waiting = kind === "pickup" && data.phase === "accepted";
    const searching = kind === "pickup" && data.phase === "requested";
    const callout = !(kind === "pickup" && data.phase === "in_progress");
    // "near Indian Oil bunk": landmarks help find the pickup (booking, and the captain on the way).
    const near = kind === "pickup" && callout && (editable || data.phase === "accepted" || data.phase === "arrived") ? this.near : undefined;
    const key = `${note ?? ""}|${editable}|${waiting}|${searching}|${callout}|${near ?? ""}`;
    const existing = this.pins[kind];
    if (!point) {
      existing?.marker.remove();
      delete this.pins[kind];
      return;
    }
    if (!existing) {
      const el = markerElement("hop-custom-pin-icon", kind === "pickup" ? "Pickup location" : "Dropoff destination", pinHtml(kind, note, { editable, waiting, searching, callout, near }));
      el.style.zIndex = "5";
      el.addEventListener("click", (e) => {
        if ((e.target as Element).closest("[data-pin-edit]")) window.dispatchEvent(new CustomEvent("hop-pin-edit", { detail: { target: kind } }));
      });
      const marker = this.addMarker(new maplibregl.Marker({ element: el, anchor: "center", draggable: editable, pitchAlignment: "viewport", rotationAlignment: "viewport" }).setLngLat(lngLat(point)));
      marker.on("dragend", () => {
        const at = marker.getLngLat();
        window.dispatchEvent(new CustomEvent("hop-map-pick", { detail: { lat: at.lat, lng: at.lng, target: kind } }));
      });
      this.pins[kind] = { marker, key };
      return;
    }
    existing.marker.setLngLat(lngLat(point));
    existing.marker.setDraggable(editable);
    if (key !== existing.key) {
      existing.key = key;
      existing.marker.getElement().innerHTML = pinHtml(kind, note, { editable, waiting, searching, callout, near });
    }
  }

  private placeCurrent(point: Coordinate | undefined) {
    if (!point) {
      this.current?.remove();
      this.current = undefined;
      return;
    }
    const heading = point.heading;
    const has = heading != null && !Number.isNaN(heading);
    if (!this.current) {
      const el = markerElement("hop-current-location-icon", "Your location", `<div class="hop-current-marker"><div class="hop-current-pulse"></div><div class="hop-current-halo"></div><div class="hop-heading-cone" style="transform: rotate(${has ? heading : 0}deg); ${has ? "" : "display:none;"}"><div class="hop-heading-beam"></div></div><div class="hop-current-dot"></div></div>`);
      el.style.zIndex = "2";
      this.current = this.addMarker(new maplibregl.Marker({ element: el, rotationAlignment: "map", pitchAlignment: "map" }).setLngLat(lngLat(point)));
      this.currentHeading = heading;
      return;
    }
    this.current.setLngLat(lngLat(point));
    if (heading === this.currentHeading) return;
    this.currentHeading = heading;
    const cone = this.current.getElement().querySelector<HTMLElement>(".hop-heading-cone");
    if (!cone) return;
    cone.style.display = has ? "block" : "none";
    if (has) cone.style.transform = `rotate(${heading}deg)`;
  }

  // ── Landmarks near the pickup, suggested pickup points ──
  private poi() {
    if (!this.loaded || this.base !== "vector" || this.destroyed) return [];
    try {
      return this.map.querySourceFeatures("osm", { sourceLayer: "poi" });
    } catch {
      return [];
    }
  }
  private refreshNearby = () => {
    if (this.destroyed || !this.data) return;
    const pickup = this.data.pickup;
    let near: string | undefined;
    if (pickup) {
      let best = 160; // metres: further than this isn't "near"
      for (const f of this.poi()) {
        const props = f.properties || {};
        if (!NEAR_CLASSES.has(String(props.class)) || f.geometry.type !== "Point") continue;
        const [lng, lat] = f.geometry.coordinates as [number, number];
        const d = distance(pickup, { lat, lng });
        const name = landmarkName(props);
        if (name && d < best) { best = d; near = name; }
      }
    }
    if (near !== this.near) {
      this.near = near;
      if (this.data) this.placePin("pickup", this.data.pickup, this.data);
      this.host.dataset.pickupNear = near || "";
      requestAnimationFrame(this.keepCalloutsInside);
    }
    this.suggestPickupPoints();
  };
  /** While booking: up to 3 nearby stations, bus stands, hospitals or malls as one-tap pickups. */
  private suggestPickupPoints() {
    const data = this.data;
    // Only when zoomed in near the pickup, so they never clutter the route overview.
    const show = Boolean(data?.editable && data.pickup && this.map.getZoom() >= 15);
    const points: { lat: number; lng: number; name: string }[] = [];
    if (show && data?.pickup) {
      const seen = new Set<string>();
      for (const f of this.poi()) {
        const props = f.properties || {};
        if (!isPickupPoint(props) || f.geometry.type !== "Point") continue;
        const [lng, lat] = f.geometry.coordinates as [number, number];
        const d = distance(data.pickup, { lat, lng });
        const name = landmarkName(props);
        if (!name || seen.has(name) || d < 30 || d > 450) continue;
        seen.add(name);
        points.push({ lat, lng, name });
      }
      points.sort((a, b) => distance(data.pickup!, a) - distance(data.pickup!, b));
      points.length = Math.min(points.length, 3);
    }
    const key = JSON.stringify(points);
    if (key === this.suggestKey) return this.hideOffscreen();
    this.suggestKey = key;
    this.suggestions.forEach((m) => m.remove());
    this.suggestions = points.map((p) => {
      const el = markerElement("hop-suggest-icon", undefined, `<button type="button" class="hop-pickup-suggest" aria-label="Pick up at ${p.name.replace(/"/g, "&quot;")}"><i aria-hidden="true"></i><span>${p.name.replace(/[<>&]/g, "")}</span></button>`);
      el.style.zIndex = "4";
      el.querySelector("button")!.addEventListener("click", (e) => {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent("hop-map-pick", { detail: { lat: p.lat, lng: p.lng, target: "pickup" } }));
      });
      return this.addMarker(new maplibregl.Marker({ element: el, anchor: "left", offset: [-8, 0] }).setLngLat([p.lng, p.lat]));
    });
    this.hideOffscreen();
  }
  /** Map buttons outside the visible map are hidden, so nothing tappable sits off-screen. */
  private hideOffscreen() {
    this.placeTags();
    const box = this.host.getBoundingClientRect();
    const bars = Number(this.host.dataset.topInset || 0);
    for (const marker of [...this.suggestions, ...this.tags]) {
      const el = marker.getElement();
      const p = this.map.project(marker.getLngLat());
      // Suggestions also stay out from under the bars over the map's top edge.
      const top = this.suggestions.includes(marker) ? bars + 24 : 8;
      el.style.visibility = p.x < 8 || p.y < top || p.x > box.width - 8 || p.y > box.height - 8 ? "hidden" : "";
    }
  }

  /** A route label slides along its route until it is clear of the bars over the map's top. */
  private placeTags() {
    if (!this.tags.length) return;
    const top = Number(this.host.dataset.topInset || 0) + 26, width = this.host.clientWidth, height = this.host.clientHeight;
    // How far a point is from the clear part of the map (0 = clear).
    const miss = (p: Coordinate) => {
      const at = this.map.project(lngLat(p));
      return Math.max(0, top - at.y) + Math.max(0, at.y - (height - 26)) + Math.max(0, 60 - at.x) + Math.max(0, at.x - (width - 60));
    };
    this.tags.forEach((tag, i) => {
      const { from, route } = this.tagRoutes[i] || {};
      if (!from || !route) return;
      if (!miss(from)) return tag.setLngLat(lngLat(from));
      let best = from, score = miss(from);
      for (const p of route) {
        const m = miss(p);
        if (m < score) { best = p; score = m; if (!m) break; }
      }
      tag.setLngLat(lngLat(best));
    });
  }

  // ── Hop's own layers ─────────────────────────────────
  setServiceAreas(areas: ServiceArea[]) {
    const valid = areas.filter((a) => [a.min_lat, a.max_lat, a.min_lng, a.max_lng].every(Number.isFinite));
    if (!valid.length) return this.setGeo("hop-area", collection());
    const ring = (a: ServiceArea) => [[a.min_lng, a.min_lat], [a.max_lng, a.min_lat], [a.max_lng, a.max_lat], [a.min_lng, a.max_lat], [a.min_lng, a.min_lat]];
    const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
    this.setGeo("hop-area", collection([
      { type: "Feature", properties: { kind: "mask" }, geometry: { type: "Polygon", coordinates: [world, ...valid.map((a) => ring(a).reverse())] } },
      ...valid.map((a): Feature => ({ type: "Feature", properties: { kind: "edge" }, geometry: { type: "LineString", coordinates: ring(a) } })),
    ]));
  }
  setDemand(cells: DemandCell[]) {
    this.setGeo("hop-demand", collection(cells.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng)).map((c) => ({
      type: "Feature",
      // Busy cells that already have captains glow less.
      properties: { weight: Math.max(0, c.requests - 0.5 * (c.drivers || 0)) },
      geometry: { type: "Point", coordinates: [c.lng, c.lat] },
    }))));
  }

  // ── Route animation ──────────────────────────────────
  // While booking, a new route draws itself from pickup to drop-off (pins pop in at each end),
  // then a soft light keeps travelling along it. Live trips skip this. Off under reduced motion.
  private animateRoute(data: MapData) {
    const pts = this.routePoints;
    if (!data.editable) {
      this.routeKey = "";
      this.stopAnimation();
      return;
    }
    const key = JSON.stringify([pts[0], pts[pts.length - 1], pts.length]);
    if (key === this.routeKey) return;
    this.routeKey = key;
    this.stopAnimation();
    if (reduced()) return;
    const run = (duration: number, frame: (t: number) => ExpressionSpecification, done?: () => void, loop = false) => {
      const start = performance.now();
      let last = 0;
      const tick = (now: number) => {
        if (this.destroyed || key !== this.routeKey) return;
        const t = loop ? ((now - start) % duration) / duration : Math.min(1, (now - start) / duration);
        if (now - last > 33 && this.map.getLayer("hop-route")) { // about 30 fps is plenty here
          last = now;
          this.map.setPaintProperty("hop-route", "line-gradient", frame(t));
        }
        if (!loop && t >= 1) return done?.();
        this.animation = requestAnimationFrame(tick);
      };
      this.animation = requestAnimationFrame(tick);
    };
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    const drawn = (t: number): ExpressionSpecification => {
      const p = Math.min(0.999, Math.max(0.001, ease(t)));
      return ["interpolate", ["linear"], ["line-progress"], 0, ROUTE, p, ROUTE, p + 0.0005, "rgba(75,63,209,0)", 1, "rgba(75,63,209,0)"];
    };
    const flow = (t: number): ExpressionSpecification => {
      const seg = 0.06, c = 0.02 + t * 0.96;
      const a = Math.max(0.0001, c - seg), b = Math.min(0.9999, c + seg);
      return ["interpolate", ["linear"], ["line-progress"], 0, ROUTE, a, ROUTE, c, "#d9d4ff", b, ROUTE, 1, ROUTE];
    };
    // Start once the camera has settled on the new route.
    this.drawTimer = setTimeout(() => {
      this.pop("pickup");
      run(1200, drawn, () => {
        this.pop("dropoff");
        const meters = pts.slice(1).reduce((sum, p, i) => sum + distance(pts[i], p), 0);
        run(Math.min(4500, Math.max(1800, meters / 3)), flow, undefined, true);
      });
    }, 450);
  }
  private stopAnimation() {
    clearTimeout(this.drawTimer);
    cancelAnimationFrame(this.animation);
    if (this.loaded && this.map.getLayer("hop-route")) this.map.setPaintProperty("hop-route", "line-gradient", solid());
  }
  private pop(kind: PinKind) {
    const pin = this.pins[kind]?.marker.getElement().querySelector<HTMLElement>(".hop-marker-pin");
    if (!pin) return;
    pin.classList.remove("hop-pin-pop");
    void pin.offsetWidth;
    pin.classList.add("hop-pin-pop");
  }

  // ── Callouts stay inside the map ─────────────────────
  private afterMove = () => {
    this.keepCalloutsInside();
    if (this.data?.editable) this.suggestPickupPoints();
    else this.hideOffscreen();
  };
  private keepCalloutsInside = () => {
    if (this.destroyed) return;
    const box = this.host.getBoundingClientRect();
    const top = box.top + Number(this.host.dataset.topInset || 0);
    for (const kind of ["pickup", "dropoff"] as PinKind[]) {
      const pin = this.pins[kind]?.marker.getElement().querySelector<HTMLElement>(".hop-marker-pin");
      const callout = pin?.querySelector<HTMLElement>(".hop-pin-callout");
      if (!pin || !callout) continue;
      callout.style.setProperty("--dx", "0px");
      pin.classList.remove("below");
      let rect = callout.getBoundingClientRect();
      if (rect.top < top + 4) { pin.classList.add("below"); rect = callout.getBoundingClientRect(); }
      const dx = rect.right > box.right - 8 ? box.right - 8 - rect.right : rect.left < box.left + 8 ? box.left + 8 - rect.left : 0;
      callout.style.setProperty("--dx", `${Math.round(dx)}px`);
    }
  };

  // ── MapView ──────────────────────────────────────────
  setAlternatives(routes: AlternativeRoute[]) {
    this.tags.forEach((m) => m.remove());
    const others = routes.filter((r) => !r.selected && r.route.length > 1);
    this.setGeo("hop-alt", collection(others.map((r) => line(r.route, { index: r.index }))));
    this.host.dataset.alternatives = String(others.length);
    const selected = routes.find((r) => r.selected)?.route ?? [];
    this.tagRoutes = [];
    this.tags = others.map((alt) => {
      const mid = divergencePoint(alt.route, selected);
      this.tagRoutes.push({ from: mid, route: alt.route });
      const el = markerElement("hop-route-tag-icon", undefined, `<button type="button" class="hop-route-tag" aria-label="Use route: ${alt.label}">${alt.label}</button>`);
      el.querySelector("button")!.addEventListener("click", (e) => {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent("hop-route-pick", { detail: { index: alt.index } }));
      });
      return this.addMarker(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(lngLat(mid)));
    });
    this.hideOffscreen();
  }

  setRouteProgress(points: Coordinate[]) {
    this.routePoints = points;
    this.host.toggleAttribute("data-route", points.length > 1);
    this.setGeo("hop-route", collection(points.length > 1 ? [line(points)] : []));
  }

  setPreviewVehicle(pos: Coordinate | null, heading = 0, category = "auto") {
    if (!pos) {
      this.preview?.remove();
      this.preview = undefined;
      return;
    }
    if (!this.preview) {
      const el = markerElement("hop-vehicle-div-icon", undefined, vehicleHtml(category, heading));
      el.style.zIndex = "6";
      this.preview = this.addMarker(new maplibregl.Marker({ element: el, rotationAlignment: "map", pitchAlignment: "map" }).setLngLat(lngLat(pos)));
      return;
    }
    this.preview.setLngLat(lngLat(pos));
    this.preview.getElement().innerHTML = vehicleHtml(category, heading);
  }

  pulseDestination(active: boolean) {
    this.pins.dropoff?.marker.getElement().querySelector(".hop-marker-pin")?.classList.toggle("pulse", active);
  }

  center(point: Coordinate) {
    if (this.nav) return this.followCamera(point);
    this.map.easeTo({ center: lngLat(point), duration: reduced() ? 0 : 500 });
  }

  fit(points: Coordinate[]) {
    if (!points.length) return;
    const duration = reduced() ? 0 : 700;
    if (points.length === 1) {
      this.map.easeTo({ center: lngLat(points[0]), zoom: Math.max(this.map.getZoom(), 15), duration });
      return;
    }
    // Overviews are flat and north-up, so the whole route is visible.
    const bounds = new maplibregl.LngLatBounds();
    points.forEach((p) => bounds.extend(lngLat(p)));
    // While choosing, the other route options stay in view too, so their labels can be tapped.
    for (const f of this.geo["hop-alt"].features) {
      if (f.geometry.type === "LineString") f.geometry.coordinates.forEach((c) => bounds.extend(c as [number, number]));
    }
    const camera = this.map.cameraForBounds(bounds, { padding: framePadding(this.host), maxZoom: 17, bearing: 0 });
    // Whole zoom levels, as the approved Leaflet map framed routes (a little room around them).
    if (camera) this.map.easeTo({ ...camera, zoom: Math.floor(camera.zoom ?? 14), pitch: 0, bearing: 0, duration });
  }

  camera() {
    const c = this.map.getCenter();
    return { center: { lat: c.lat, lng: c.lng }, zoom: this.map.getZoom() };
  }
  restore(camera: { center: Coordinate; zoom: number }) {
    this.map.jumpTo({ center: lngLat(camera.center), zoom: camera.zoom });
  }

  destroy() {
    this.destroyed = true;
    this.stopAnimation();
    this.motion.destroy();
    this.resize.disconnect();
    this.map.remove();
  }
}
