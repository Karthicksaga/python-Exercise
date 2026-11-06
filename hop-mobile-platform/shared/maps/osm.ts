import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AlternativeRoute, Coordinate, MapData, MapView, MapPreferences } from "./types";
import { divergencePoint, VehicleMotion } from "./motion";
import { topDownVehicle, VEHICLE_MARKER_SIZE } from "./vehicleArt";
import { framePadding, pinHtml, type PinKind } from "./pins";
import { hopVectorStyle, VECTOR_ATTRIBUTION, type HopMapMode } from "./vectorStyle";

// Hop's own vector style is the default. VITE_MAP_STYLE=raster (or a VITE_MAP_TILE_URL) keeps
// plain image tiles, and phones without WebGL, or a vector server that fails to load, fall back to them.
function vectorBaseEnabled() {
  if (import.meta.env.VITE_MAP_STYLE === "raster" || import.meta.env.VITE_MAP_TILE_URL) return false;
  try { return Boolean(document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl")); }
  catch { return false; }
}
type VectorLayer = L.Layer & { getMaplibreMap(): import("maplibre-gl").Map };
/**
 * The MapLibre-Leaflet plugin (0.1.3) redraws one animation frame after a zoom or resize without
 * checking that the map still exists, so leaving a map screen mid-animation threw
 * "Cannot read properties of null (reading 'getZoom')". This makes those callbacks skip a removed map.
 */
type GuardedProto = Record<string, unknown> & { __hopGuarded?: boolean };
function guardVectorLayer(layer: VectorLayer) {
  const proto = Object.getPrototypeOf(layer) as GuardedProto;
  if (proto.__hopGuarded) return;
  proto.__hopGuarded = true;
  type Self = { _map?: L.Map | null; _glMap?: unknown };
  const alive = (self: Self) => !!self._map && !!self._glMap;
  for (const name of ["_update", "_zoomEnd", "_animateZoom", "_zoomStart"]) {
    const orig = proto[name];
    if (typeof orig !== "function") continue;
    proto[name] = function (this: Self, ...args: unknown[]) {
      return alive(this) ? (orig as (...a: unknown[]) => unknown).apply(this, args) : undefined;
    };
  }
  const transitionEnd = proto._transitionEnd;
  if (typeof transitionEnd === "function") {
    // The original body runs inside requestAnimationFrame; check again when that frame comes.
    const raf = L.Util.requestAnimFrame;
    proto._transitionEnd = function (this: Self, e: unknown) {
      if (!alive(this)) return;
      const self = this;
      const util = L.Util as unknown as { requestAnimFrame: typeof raf };
      util.requestAnimFrame = ((fn: () => void, ctx?: object) =>
        raf(() => { if (alive(self)) fn.call(ctx); }, undefined)) as typeof raf;
      try { (transitionEnd as (e: unknown) => void).call(this, e); } finally { util.requestAnimFrame = raf; }
    };
  }
}
const VECTOR_LOAD_MS = 20_000; // a cold first load (fonts + tiles) can be slow on phones


function computeBearing(from: Coordinate, to: Coordinate): number {
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

function computeDistanceMeters(a: Coordinate, b: Coordinate): number {
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

function pinIcon(kind: PinKind, note: string | undefined, editable: boolean, waiting: boolean, callout: boolean, searching = false): L.DivIcon {
  // Zero-size icon: the pin draws itself above the point, so callouts of any width stay anchored.
  return L.divIcon({ className: "hop-custom-pin-icon", html: pinHtml(kind, note, { editable, waiting, searching, callout }), iconSize: [0, 0], iconAnchor: [0, 0] });
}

function createCurrentIcon(heading?: number): L.DivIcon {
  const hasHeading = heading != null && !Number.isNaN(heading);
  return L.divIcon({
    className: "hop-current-location-icon",
    html: `
      <div class="hop-current-marker">
        <div class="hop-current-pulse"></div>
        <div class="hop-current-halo"></div>
        <div class="hop-heading-cone" style="transform: rotate(${hasHeading ? heading : 0}deg); ${hasHeading ? "" : "display:none;"}">
          <div class="hop-heading-beam"></div>
        </div>
      </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function createVehicleIcon(category: string, heading?: number): L.DivIcon {
  const h = heading != null && !Number.isNaN(heading) ? heading : 0;
  return L.divIcon({
    className: "hop-vehicle-div-icon",
    html: `
      <div class="hop-vehicle-marker" style="transform: rotate(${h}deg);">
        <img src="${topDownVehicle(category)}" alt="Vehicle" class="hop-vehicle-icon" draggable="false" />
      </div>`,
    iconSize: [VEHICLE_MARKER_SIZE, VEHICLE_MARKER_SIZE],
    iconAnchor: [VEHICLE_MARKER_SIZE / 2, VEHICLE_MARKER_SIZE / 2],
  });
}

export class OSMMapView implements MapView {
  private map: L.Map;
  private tiles?: L.TileLayer;
  private vector?: VectorLayer;
  private look: { mode: HopMapMode; night: boolean } = { mode: "browse", night: false };
  private lowData = false;
  private nightPreferred = false;
  private night = () => this.nightPreferred || Boolean(this.host.closest(".app.dark"));
  private destroyed = false;
  private pinKeys: Record<PinKind, string> = { pickup: "", dropoff: "" };
  private walkLine?: L.Polyline;
  private flowLine?: L.Polyline;
  private routeKey = "";
  private drawTimer?: ReturnType<typeof setTimeout>;
  private host: HTMLElement;
  private vehicles = new Map<string, L.Marker>();
  private alternativeLines: L.Layer[] = [];
  private motion = new VehicleMotion((id, p, heading) => {
    const marker = this.vehicles.get(id);
    if (!marker) return;
    marker.setLatLng([p.lat, p.lng]);
    const el = marker.getElement()?.querySelector<HTMLElement>(".hop-vehicle-marker");
    if (el) el.style.transform = `rotate(${heading}deg)`;
  });
  private pickupMarker?: L.Marker;
  private dropoffMarker?: L.Marker;
  private currentMarker?: L.Marker;
  private currentCircle?: L.CircleMarker;
  private currentHeading?: number;
  private routeLine?: L.Polyline;
  private arrowMarkers: L.Marker[] = [];
  private previewMarker?: L.Marker;
  private resize: ResizeObserver;

  private status: (message: string) => void;

  constructor(
    host: HTMLElement,
    center: Coordinate,
    status: (message: string) => void,
  ) {
    this.host = host;
    this.map = L.map(host, { zoomControl: false }).setView(
      [center.lat, center.lng],
      14,
    );
    this.status = status;
    // The walking path gets its own pane so it never counts as a route line.
    this.map.createPane("hopWalk").style.zIndex = "390";
    // The travelling light along a planned route sits just above the route line.
    this.map.createPane("hopFlow").style.zIndex = "410";
    this.map.getPane("hopFlow")!.style.pointerEvents = "none";
    if (vectorBaseEnabled()) void this.useVector();
    else this.useRaster();

    this.map.on("click", (event) =>
      window.dispatchEvent(
        new CustomEvent("hop-map-pick", {
          detail: { lat: event.latlng.lat, lng: event.latlng.lng },
        }),
      ),
    );
    this.map.on("dragstart", () =>
      window.dispatchEvent(new Event("hop-map-drag")),
    );
    this.map.on("moveend zoomend resize", this.keepCalloutsInside);
    this.map.on("zoomend", () => requestAnimationFrame(this.measureFlow));
    this.resize = new ResizeObserver(() => this.map.invalidateSize());
    this.resize.observe(host);
  }

  private useRaster() {
    if (this.tiles || this.destroyed) return;
    this.host.classList.remove("hop-vector-base");
    this.tiles = L.tileLayer(
      import.meta.env.VITE_MAP_TILE_URL ||
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          import.meta.env.VITE_MAP_ATTRIBUTION ||
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    )
      .on("tileerror", () =>
        this.status("Map tiles unavailable · check your connection"),
      )
      .addTo(this.map);
    this.applyLowData();
  }

  // MapLibre draws Hop's vector style under Leaflet; pins, routes and vehicles stay in Leaflet.
  private async useVector() {
    try {
      const [maplibre] = await Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]);
      (globalThis as { maplibregl?: unknown }).maplibregl ??= maplibre.default ?? maplibre;
      await import("@maplibre/maplibre-gl-leaflet");
      const leaflet = L as unknown as { maplibreGL?: (o: object) => VectorLayer; default?: { maplibreGL?: (o: object) => VectorLayer } };
      const create = leaflet.maplibreGL ?? leaflet.default?.maplibreGL ?? (globalThis as { L?: typeof leaflet }).L?.maplibreGL;
      if (!create) throw new Error("MapLibre layer unavailable");
      if (this.destroyed) return;
      const layer = create({ style: hopVectorStyle(this.look.mode, this.look.night), attribution: VECTOR_ATTRIBUTION, interactive: false });
      guardVectorLayer(layer);
      layer.addTo(this.map);
      this.vector = layer;
      this.host.classList.add("hop-vector-base");
      const gl = layer.getMaplibreMap();
      let loaded = false;
      const giveUp = (reason: string) => {
        if (loaded || this.destroyed || this.vector !== layer) return;
        console.warn(`Hop vector map unavailable (${reason}); using image tiles`);
        layer.remove();
        this.vector = undefined;
        this.useRaster();
      };
      const timer = setTimeout(() => giveUp("timed out"), VECTOR_LOAD_MS);
      gl.once("load", () => { loaded = true; clearTimeout(timer); });
      gl.on("error", (e: { error?: { message?: string } }) => {
        if (loaded) this.status("Map tiles unavailable · check your connection");
        else { clearTimeout(timer); giveUp(e.error?.message || "load error"); }
      });
    } catch (e) {
      console.warn(`Hop vector map unavailable (${e instanceof Error ? e.message : e}); using image tiles`);
      this.useRaster();
    }
  }

  private restyle(mode: HopMapMode, night: boolean) {
    if (mode === this.look.mode && night === this.look.night) return;
    this.look = { mode, night };
    this.vector?.getMaplibreMap().setStyle(hopVectorStyle(mode, night), { diff: true });
  }

  private applyLowData() {
    if (!this.tiles) return;
    this.tiles.options.keepBuffer = this.lowData ? 0 : 2;
    this.tiles.options.updateWhenIdle = this.lowData;
    this.tiles.options.updateWhenZooming = !this.lowData;
  }

  setPreferences(preferences: MapPreferences) {
    this.lowData = preferences.lowdata;
    this.applyLowData();
    this.host.classList.toggle("hop-night-tiles", preferences.night);
    this.host.dataset.lowData = String(preferences.lowdata);
    this.nightPreferred = preferences.night;
    this.restyle(this.look.mode, this.night());
  }

  // Slide each callout sideways to stay inside the map, and drop it below the pin when the bars
  // over the top of the map would hide it.
  private keepCalloutsInside = () => {
    if (this.destroyed) return;
    const box = this.host.getBoundingClientRect();
    const top = box.top + Number(this.host.dataset.topInset || 0);
    for (const marker of [this.pickupMarker, this.dropoffMarker]) {
      const pin = marker?.getElement()?.querySelector<HTMLElement>(".hop-marker-pin");
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

  private placePin(kind: PinKind, marker: L.Marker | undefined, point: Coordinate | undefined, data: MapData) {
    const note = kind === "pickup" ? data.pickupNote : data.dropoffNote;
    const editable = Boolean(data.editable);
    const waiting = kind === "pickup" && data.phase === "accepted";
    // Rings ripple from the pickup while Hop looks for a captain.
    const searching = kind === "pickup" && data.phase === "requested";
    // Once the rider is in the car, the pickup no longer needs a callout.
    const callout = !(kind === "pickup" && data.phase === "in_progress");
    const key = `${note ?? ""}|${editable}|${waiting}|${searching}|${callout}`;
    if (!point) {
      marker?.remove();
      this.pinKeys[kind] = "";
      return undefined;
    }
    if (!marker) {
      marker = L.marker([point.lat, point.lng], {
        title: kind === "pickup" ? "Pickup location" : "Dropoff destination",
        draggable: editable,
        icon: pinIcon(kind, note, editable, waiting, callout, searching),
        zIndexOffset: 1000,
      }).addTo(this.map);
      const placed = marker;
      placed.on("dragend", () => {
        const at = placed.getLatLng();
        window.dispatchEvent(new CustomEvent("hop-map-pick", { detail: { lat: at.lat, lng: at.lng, target: kind } }));
      });
      placed.on("click", (e: L.LeafletMouseEvent) => {
        if ((e.originalEvent?.target as Element | null)?.closest?.("[data-pin-edit]"))
          window.dispatchEvent(new CustomEvent("hop-pin-edit", { detail: { target: kind } }));
      });
      this.pinKeys[kind] = key;
    } else {
      marker.setLatLng([point.lat, point.lng]);
      if (!this.map.hasLayer(marker)) marker.addTo(this.map);
      if (key !== this.pinKeys[kind]) {
        this.pinKeys[kind] = key;
        marker.setIcon(pinIcon(kind, note, editable, waiting, callout, searching));
      }
    }
    return marker;
  }

  update(data: MapData) {
    // 1. Vehicles: markers are placed by the motion engine so they glide and turn.
    const ids = new Set(data.vehicles.map((v) => v.id));
    for (const [id, marker] of this.vehicles) {
      if (!ids.has(id)) {
        this.motion.remove(id);
        marker.remove();
        this.vehicles.delete(id);
      }
    }
    for (const v of data.vehicles) {
      if (!this.vehicles.has(v.id)) {
        this.vehicles.set(v.id, L.marker([v.lat, v.lng], {
          title: "Live captain",
          icon: createVehicleIcon(v.category, v.heading),
          zIndexOffset: 900,
          interactive: false,
          keyboard: false,
        }).addTo(this.map));
      }
      this.motion.set(v.id, v, v.heading);
    }

    // 2. Pickup (round) and drop-off (square) pins with their callouts.
    this.restyle(data.phase ? "ride" : "browse", this.night());
    this.pickupMarker = this.placePin("pickup", this.pickupMarker, data.pickup, data);
    this.dropoffMarker = this.placePin("dropoff", this.dropoffMarker, data.dropoff, data);
    requestAnimationFrame(this.keepCalloutsInside);

    // 3. Dotted walking path from the rider to a nearby pickup while booking.
    const walk = data.editable && data.current && data.pickup && data.pickupNote ? [data.current, data.pickup] : undefined;
    if (walk) {
      const latLngs = walk.map((p) => [p.lat, p.lng] as L.LatLngTuple);
      if (!this.walkLine) {
        this.walkLine = L.polyline(latLngs, {
          pane: "hopWalk", renderer: L.svg({ pane: "hopWalk" }), color: "#2677df", weight: 3, opacity: 0.9,
          dashArray: "1 7", lineCap: "round", interactive: false, className: "hop-walk-path",
        }).addTo(this.map);
      } else this.walkLine.setLatLngs(latLngs);
    } else if (this.walkLine) {
      this.walkLine.remove();
      this.walkLine = undefined;
    }

    for (const marker of [this.pickupMarker, this.dropoffMarker]) {
      if (data.editable) marker?.dragging?.enable();
      else marker?.dragging?.disable();
    }

    // 4. Current Location Marker
    // Overlay pane path[fill="#2677df"] + Marker pane pulsing wave & heading beam
    if (data.current) {
      const heading = data.current.heading;
      if (!this.currentCircle) {
        this.currentCircle = L.circleMarker([data.current.lat, data.current.lng], {
          radius: 8,
          color: "#ffffff",
          weight: 3,
          fillColor: "#2677df",
          fillOpacity: 1,
        }).addTo(this.map);
      } else {
        this.currentCircle.setLatLng([data.current.lat, data.current.lng]);
        if (!this.map.hasLayer(this.currentCircle)) {
          this.currentCircle.addTo(this.map);
        }
      }

      if (!this.currentMarker) {
        this.currentHeading = heading;
        this.currentMarker = L.marker([data.current.lat, data.current.lng], {
          title: "Your location",
          icon: createCurrentIcon(heading),
          zIndexOffset: 850,
          interactive: false,
          keyboard: false,
        }).addTo(this.map);
      } else {
        this.currentMarker.setLatLng([data.current.lat, data.current.lng]);
        if (!this.map.hasLayer(this.currentMarker)) {
          this.currentMarker.addTo(this.map);
        }
        if (heading !== this.currentHeading) {
          this.currentHeading = heading;
          const cone = this.currentMarker.getElement()?.querySelector<HTMLElement>(".hop-heading-cone");
          if (cone) {
            if (heading != null && !Number.isNaN(heading)) {
              cone.style.display = "block";
              cone.style.transform = `rotate(${heading}deg)`;
            } else {
              cone.style.display = "none";
            }
          }
        }
      }
    } else {
      if (this.currentCircle) {
        this.currentCircle.remove();
        this.currentCircle = undefined;
      }
      if (this.currentMarker) {
        this.currentMarker.remove();
        this.currentMarker = undefined;
      }
    }

    // 5. Route Polyline with directional arrows
    // Exactly 1 polyline in overlay pane to maintain test contract
    if (data.route?.length) {
      const latLngs = data.route.map((p) => [p.lat, p.lng] as L.LatLngTuple);
      if (!this.routeLine) {
        this.routeLine = L.polyline(latLngs, {
          color: "#4b3fd1",
          weight: 5,
          opacity: 0.95,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(this.map);
      } else {
        this.routeLine.setLatLngs(latLngs);
        if (!this.map.hasLayer(this.routeLine)) {
          this.routeLine.addTo(this.map);
        }
      }

      this.animateRoute(data, latLngs);

      // Add direction arrows along the route in marker pane
      this.arrowMarkers.forEach((m) => m.remove());
      this.arrowMarkers = [];
      let accumMeters = 0;
      for (let i = 0; i < data.route.length - 1; i++) {
        const p1 = data.route[i];
        const p2 = data.route[i + 1];
        const segDist = computeDistanceMeters(p1, p2);
        accumMeters += segDist;
        if (accumMeters >= 250 || (segDist > 100 && accumMeters >= 100)) {
          accumMeters = 0;
          const brng = computeBearing(p1, p2);
          const midLat = (p1.lat + p2.lat) / 2;
          const midLng = (p1.lng + p2.lng) / 2;
          const arrowMarker = L.marker([midLat, midLng], {
            icon: L.divIcon({
              className: "hop-arrow-div",
              html: `<div class="hop-route-arrow" style="transform: rotate(${brng}deg);"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 7.5 L5 2.5 L8 7.5" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`,
              iconSize: [12, 12],
              iconAnchor: [6, 6],
            }),
            interactive: false,
            zIndexOffset: 700,
          }).addTo(this.map);
          this.arrowMarkers.push(arrowMarker);
        }
      }
    } else {
      this.routeKey = "";
      this.stopFlow();
      if (this.routeLine) {
        this.routeLine.remove();
        this.routeLine = undefined;
      }
      this.arrowMarkers.forEach((m) => m.remove());
      this.arrowMarkers = [];
    }
  }

  // While booking, a new route draws itself from pickup to drop-off (pins pop in at each end),
  // then a soft light keeps travelling along it to show the direction. Live trips skip this:
  // the captain's own movement shows the way. Off under reduced motion.
  private animateRoute(data: MapData, latLngs: L.LatLngTuple[]) {
    if (!data.editable || latLngs.length < 2) {
      this.routeKey = "";
      this.stopFlow();
      return;
    }
    const key = JSON.stringify([latLngs[0], latLngs[latLngs.length - 1], latLngs.length]);
    if (key === this.routeKey) {
      this.flowLine?.setLatLngs(latLngs);
      return;
    }
    this.routeKey = key;
    this.stopFlow();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const line = this.routeLine;
    if (!line) return;
    // Start once the camera has settled on the new route, so the drawing length stays right.
    let started = false;
    const start = () => {
      if (started || this.destroyed || line !== this.routeLine || key !== this.routeKey) return;
      started = true;
      const path = line.getElement() as SVGPathElement | undefined;
      if (!path?.getTotalLength) return;
      const length = path.getTotalLength();
      path.style.transition = "none";
      path.style.strokeDasharray = `${length}`;
      path.style.strokeDashoffset = `${length}`;
      path.getBoundingClientRect();
      path.style.transition = "stroke-dashoffset 1.2s cubic-bezier(.45,0,.25,1)";
      path.style.strokeDashoffset = "0";
      this.pop(this.pickupMarker);
      this.drawTimer = setTimeout(() => {
        path.style.transition = path.style.strokeDasharray = path.style.strokeDashoffset = "";
        this.pop(this.dropoffMarker);
        if (key !== this.routeKey || this.destroyed) return;
        this.flowLine = L.polyline(latLngs, {
          pane: "hopFlow", renderer: L.svg({ pane: "hopFlow" }), color: "#ffffff", weight: 3, opacity: 0.9,
          lineCap: "round", interactive: false, className: "hop-route-flow",
        }).addTo(this.map);
        requestAnimationFrame(this.measureFlow);
      }, 1250);
    };
    this.map.once("moveend", start);
    setTimeout(start, 450);
  }

  // The light's dash is sized from the route's drawn length, which changes with zoom.
  private measureFlow = () => {
    const path = this.flowLine?.getElement() as SVGPathElement | undefined;
    if (!path?.getTotalLength) return;
    const length = path.getTotalLength();
    path.style.setProperty("--len", `${Math.round(length)}px`);
    path.style.setProperty("--seg", `${Math.round(Math.min(90, Math.max(24, length * 0.12)))}px`);
    path.style.animationDuration = `${Math.min(4.5, Math.max(1.8, length / 260)).toFixed(2)}s`;
  };

  private pop(marker?: L.Marker) {
    const pin = marker?.getElement()?.querySelector<HTMLElement>(".hop-marker-pin");
    if (!pin) return;
    pin.classList.remove("hop-pin-pop");
    void pin.offsetWidth;
    pin.classList.add("hop-pin-pop");
  }

  private stopFlow() {
    clearTimeout(this.drawTimer);
    this.flowLine?.remove();
    this.flowLine = undefined;
    const path = this.routeLine?.getElement() as SVGPathElement | undefined;
    if (path) path.style.transition = path.style.strokeDasharray = path.style.strokeDashoffset = "";
  }

  setAlternatives(routes: AlternativeRoute[]) {
    this.alternativeLines.forEach((l) => l.remove());
    this.alternativeLines = [];
    for (const alt of routes) {
      if (alt.selected || alt.route.length < 2) continue;
      const line = L.polyline(alt.route.map((p) => [p.lat, p.lng] as L.LatLngTuple), {
        color: "#8b8fa3", weight: 6, opacity: 0.6, lineCap: "round", lineJoin: "round", className: "hop-route-alternative",
      }).addTo(this.map);
      line.bringToBack();
      const pick = () => window.dispatchEvent(new CustomEvent("hop-route-pick", { detail: { index: alt.index } }));
      line.on("click", (e) => { L.DomEvent.stop(e); pick(); });
      const mid = divergencePoint(alt.route, routes.find((r) => r.selected)?.route ?? []);
      const tag = L.marker([mid.lat, mid.lng], {
        icon: L.divIcon({ className: "hop-route-tag-icon", html: `<button type="button" class="hop-route-tag" aria-label="Use route: ${alt.label}">${alt.label}</button>`, iconSize: [0, 0] }),
        zIndexOffset: 650, keyboard: false,
      }).addTo(this.map);
      tag.on("click", pick);
      this.alternativeLines.push(line, tag);
    }
  }

  setRouteProgress(points: Coordinate[]) {
    if (!this.routeLine) {
      this.routeLine = L.polyline(
        points.map((p) => [p.lat, p.lng] as L.LatLngTuple),
        { color: "#4b3fd1", weight: 5, opacity: 0.95 },
      ).addTo(this.map);
    } else {
      this.routeLine.setLatLngs(
        points.map((p) => [p.lat, p.lng] as L.LatLngTuple),
      );
    }
  }

  setPreviewVehicle(pos: Coordinate | null, heading = 0, category = "auto") {
    if (!pos) {
      if (this.previewMarker) {
        this.previewMarker.remove();
        this.previewMarker = undefined;
      }
      return;
    }
    if (!this.previewMarker) {
      this.previewMarker = L.marker([pos.lat, pos.lng], {
        icon: createVehicleIcon(category, heading),
        zIndexOffset: 1200,
        interactive: false,
      }).addTo(this.map);
    } else {
      this.previewMarker.setLatLng([pos.lat, pos.lng]);
      this.previewMarker.setIcon(createVehicleIcon(category, heading));
    }
  }

  pulseDestination(active: boolean) {
    const el = this.dropoffMarker?.getElement();
    if (el) {
      el.querySelector(".hop-marker-pin")?.classList.toggle("pulse", active);
    }
  }

  center(point: Coordinate) {
    this.map.panTo([point.lat, point.lng], { animate: true });
  }

  fit(points: Coordinate[]) {
    if (!points.length) return;
    if (points.length === 1) {
      this.map.setView(
        [points[0].lat, points[0].lng],
        Math.max(this.map.getZoom(), 15),
        { animate: true },
      );
      return;
    }
    this.map.fitBounds(
      L.latLngBounds(points.map((p) => [p.lat, p.lng] as L.LatLngTuple)),
      (() => {
        const pad = framePadding(this.host);
        return { paddingTopLeft: [pad.left, pad.top] as L.PointTuple, paddingBottomRight: [pad.right, pad.bottom] as L.PointTuple, maxZoom: 17, animate: true };
      })(),
    );
  }

  camera() {
    const center = this.map.getCenter();
    return { center: { lat: center.lat, lng: center.lng }, zoom: this.map.getZoom() };
  }
  restore(camera: { center: Coordinate; zoom: number }) {
    this.map.setView([camera.center.lat, camera.center.lng], camera.zoom, { animate: false });
  }
  destroy() {
    this.destroyed = true;
    this.stopFlow();
    this.walkLine?.remove();
    this.motion.destroy();
    this.alternativeLines.forEach((l) => l.remove());
    this.resize.disconnect();
    this.previewMarker?.remove();
    this.vehicles.forEach((m) => m.remove());
    this.vehicles.clear();
    this.pickupMarker?.remove();
    this.dropoffMarker?.remove();
    this.currentMarker?.remove();
    this.currentCircle?.remove();
    this.routeLine?.remove();
    this.arrowMarkers.forEach((m) => m.remove());
    this.arrowMarkers = [];
    this.map.remove();
  }
}
