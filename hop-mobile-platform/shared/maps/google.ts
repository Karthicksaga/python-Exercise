import type { AlternativeRoute, Coordinate, MapData, MapView, MapPreferences } from "./types";
import { divergencePoint, VehicleMotion } from "./motion";
import { topDownVehicle, VEHICLE_MARKER_SIZE } from "./vehicleArt";
import { framePadding, pinSvg, type PinKind } from "./pins";

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

function routeTagSvg(label: string) {
  const w = Math.round(label.length * 6.6 + 22);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="28" viewBox="0 0 ${w} 28"><rect x="1" y="1" width="${w - 2}" height="26" rx="13" fill="#ffffff" stroke="#c9cbd8"/><text x="${w / 2}" y="18" text-anchor="middle" font-family="'Plus Jakarta Sans',-apple-system,sans-serif" font-size="12" font-weight="700" fill="#3b3d4f">${label.replace(/[<&>"]/g, "")}</text></svg>`)}`;
}

function currentSvg(heading?: number) {
  const hasHeading = heading != null && !Number.isNaN(heading);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="22" cy="22" r="18" fill="#2677df" fill-opacity="0.2"/>
  <circle cx="22" cy="22" r="12" fill="#2677df" fill-opacity="0.3"/>
  <circle cx="22" cy="22" r="7" fill="#2677df" stroke="#ffffff" stroke-width="2.5"/>
  ${hasHeading ? `
  <g transform="rotate(${heading} 22 22)">
    <polygon points="22,2 16,14 28,14" fill="#2677df"/>
  </g>` : ""}
</svg>
`)}`;
}

let GooglePreviewVehicleOverlayClass: any;
let DestinationPulseOverlayClass: any;

function getPreviewVehicleOverlayClass() {
  if (!GooglePreviewVehicleOverlayClass && typeof google !== "undefined" && google.maps?.OverlayView) {
    GooglePreviewVehicleOverlayClass = class extends google.maps.OverlayView {
      private div: HTMLElement;
      constructor(
        private position: google.maps.LatLng,
        private heading: number,
        private category: string,
      ) {
        super();
        this.div = document.createElement("div");
        this.div.className = "hop-preview-vehicle-overlay";
        this.div.innerHTML = `<img src="${topDownVehicle(category)}" alt="Preview vehicle" draggable="false" style="transform: rotate(${heading}deg);" />`;
      }
      onAdd() {
        this.getPanes()?.overlayMouseTarget.appendChild(this.div);
      }
      draw() {
        const projection = this.getProjection();
        if (!projection) return;
        const point = projection.fromLatLngToDivPixel(this.position);
        if (point) {
          this.div.style.left = `${point.x - VEHICLE_MARKER_SIZE / 2}px`;
          this.div.style.top = `${point.y - VEHICLE_MARKER_SIZE / 2}px`;
        }
      }
      update(pos: Coordinate, heading: number, category: string) {
        this.position = new google.maps.LatLng(pos.lat, pos.lng);
        const img = this.div.querySelector<HTMLImageElement>("img");
        if (img) img.style.transform = `rotate(${heading}deg)`;
        if (img && category !== this.category) {
          this.category = category;
          img.src = topDownVehicle(category);
        }
        this.draw();
      }
      onRemove() {
        this.div.remove();
      }
    };
  }
  return GooglePreviewVehicleOverlayClass;
}

// A live vehicle drawn as a rotated top-down image, so it can face its direction of travel.
let VehicleOverlayClass: any;
function getVehicleOverlayClass() {
  if (!VehicleOverlayClass && typeof google !== "undefined" && google.maps?.OverlayView) {
    VehicleOverlayClass = class extends google.maps.OverlayView {
      private div: HTMLElement;
      private img: HTMLImageElement;
      private position: google.maps.LatLng;
      constructor(position: Coordinate, category: string) {
        super();
        this.position = new google.maps.LatLng(position.lat, position.lng);
        this.div = document.createElement("div");
        this.div.className = "hop-vehicle-overlay";
        this.div.title = "Live captain";
        this.img = document.createElement("img");
        this.img.src = topDownVehicle(category);
        this.img.alt = "Vehicle";
        this.img.draggable = false;
        this.div.append(this.img);
      }
      onAdd() { this.getPanes()?.markerLayer.appendChild(this.div); }
      draw() {
        const point = this.getProjection()?.fromLatLngToDivPixel(this.position);
        if (point) {
          this.div.style.left = `${point.x - VEHICLE_MARKER_SIZE / 2}px`;
          this.div.style.top = `${point.y - VEHICLE_MARKER_SIZE / 2}px`;
        }
      }
      move(pos: Coordinate, heading: number) {
        this.position = new google.maps.LatLng(pos.lat, pos.lng);
        this.img.style.transform = `rotate(${heading}deg)`;
        this.draw();
      }
      onRemove() { this.div.remove(); }
    };
  }
  return VehicleOverlayClass;
}

function getDestinationPulseOverlayClass() {
  if (!DestinationPulseOverlayClass && typeof google !== "undefined" && google.maps?.OverlayView) {
    DestinationPulseOverlayClass = class extends google.maps.OverlayView {
      private div: HTMLElement;
      constructor(private position: google.maps.LatLng) {
        super();
        this.div = document.createElement("div");
        this.div.className = "hop-destination-pulse-halo";
        this.div.innerHTML = `<div class="hop-destination-pulse-ring"></div>`;
      }
      onAdd() {
        this.getPanes()?.overlayLayer.appendChild(this.div);
      }
      draw() {
        const projection = this.getProjection();
        if (!projection) return;
        const point = projection.fromLatLngToDivPixel(this.position);
        if (point) {
          this.div.style.left = `${point.x - 24}px`;
          this.div.style.top = `${point.y - 24}px`;
        }
      }
      onRemove() {
        this.div.remove();
      }
    };
  }
  return DestinationPulseOverlayClass;
}

// Hop's muted Google map style (design 03), shared by the web map and the native Android map.
export function hopMapStyles(preferences: MapPreferences): google.maps.MapTypeStyle[] {
    const styles: google.maps.MapTypeStyle[] = [];
    if (preferences.lowdata) styles.push({ featureType: "poi", stylers: [{ visibility: "off" }] }, { featureType: "transit", stylers: [{ visibility: "off" }] });
    // Muted base map so Hop's indigo route and markers carry the colour (design 03).
    if (preferences.night) styles.push(
      { elementType: "geometry", stylers: [{ color: "#1a1c26" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#9a9eb2" }] },
      { elementType: "labels.text.stroke", stylers: [{ color: "#1a1c26" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#2e3244" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#16243b" }] },
      { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1c2e25" }] },
    );
    else if (!preferences.satellite) styles.push(
      { elementType: "geometry", stylers: [{ color: "#eef0f4" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#6b6f80" }] },
      { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
      { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#e3e5ed" }] },
      { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#d9dce6" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#cde0f5" }] },
      { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#d6ecd8" }] },
      { featureType: "poi.business", stylers: [{ visibility: "off" }] },
    );
    return styles;
}

export class GoogleMapView implements MapView {
  private map: google.maps.Map;
  private traffic?: google.maps.TrafficLayer;
  private vehicles = new Map<string, any>();
  private alternatives: (google.maps.Polyline | google.maps.Marker)[] = [];
  private motion = new VehicleMotion((id, p, heading) => this.vehicles.get(id)?.move(p, heading));
  private pickupMarker?: google.maps.Marker;
  private dropoffMarker?: google.maps.Marker;
  private currentMarker?: google.maps.Marker;
  private route: google.maps.Polyline;
  private previewOverlay?: any;
  private destinationPulse?: any;
  private lastDropoffPos?: Coordinate;
  private tileTimeout?: ReturnType<typeof setTimeout>;

  private host: HTMLElement;
  constructor(host: HTMLElement, center: Coordinate, failed: () => void) {
    this.host = host;
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
      zIndex: 5,
      strokeColor: "#4b3fd1",
      strokeWeight: 5,
      strokeOpacity: 0.95,
      icons: [
        {
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 2.5,
            strokeColor: "#ffffff",
            fillColor: "#ffffff",
            fillOpacity: 1,
            strokeWeight: 1,
          },
          offset: "30px",
          repeat: "70px",
        },
      ],
    });
  }

  setPreferences(preferences: MapPreferences) {
    this.map.setMapTypeId(preferences.satellite && !preferences.lowdata ? "hybrid" : "roadmap");
    if (preferences.traffic && !preferences.lowdata) {
      this.traffic ||= new google.maps.TrafficLayer();
      this.traffic.setMap(this.map);
    } else this.traffic?.setMap(null);
    const styles = hopMapStyles(preferences);
    this.map.setOptions({ styles });
  }

  private pinKeys: Record<PinKind, string> = { pickup: "", dropoff: "" };
  private editable = false;
  private placePin(kind: PinKind, marker: google.maps.Marker | undefined, point: Coordinate | undefined, data: MapData) {
    if (!point) {
      marker?.setMap(null);
      this.pinKeys[kind] = "";
      return undefined;
    }
    const note = kind === "pickup" ? data.pickupNote : data.dropoffNote;
    const icon = () => {
      const pin = pinSvg(kind, note);
      return { url: pin.url, scaledSize: new google.maps.Size(pin.width, pin.height), anchor: new google.maps.Point(pin.anchorX, pin.anchorY) };
    };
    this.editable = Boolean(data.editable);
    if (!marker) {
      marker = new google.maps.Marker({
        map: this.map, position: point, title: kind === "pickup" ? "Pickup" : "Destination",
        draggable: Boolean(data.editable), icon: icon(), zIndex: 1000,
      });
      marker.addListener("dragend", (event: google.maps.MapMouseEvent) => {
        if (event.latLng) window.dispatchEvent(new CustomEvent("hop-map-pick", { detail: { ...event.latLng.toJSON(), target: kind } }));
      });
      // While booking, tapping the pin opens the edit control for that stop.
      marker.addListener("click", () => {
        if (this.editable) window.dispatchEvent(new CustomEvent("hop-pin-edit", { detail: { target: kind } }));
      });
      this.pinKeys[kind] = note ?? "";
    } else {
      marker.setPosition(point);
      marker.setMap(this.map);
      if ((note ?? "") !== this.pinKeys[kind]) {
        this.pinKeys[kind] = note ?? "";
        marker.setIcon(icon());
      }
    }
    return marker;
  }

  update(data: MapData) {
    // 1. Vehicles: placed by the motion engine so they glide and face their direction.
    const ids = new Set(data.vehicles.map((v) => v.id));
    for (const [id, overlay] of this.vehicles) {
      if (!ids.has(id)) {
        this.motion.remove(id);
        overlay.setMap(null);
        this.vehicles.delete(id);
      }
    }
    const Overlay = getVehicleOverlayClass();
    for (const v of data.vehicles) {
      if (!this.vehicles.has(v.id) && Overlay) {
        const overlay = new Overlay(v, v.category);
        overlay.setMap(this.map);
        this.vehicles.set(v.id, overlay);
      }
      this.motion.set(v.id, v, v.heading);
    }

    // 2. Pickup (round) and drop-off (square) pins with their callouts.
    this.pickupMarker = this.placePin("pickup", this.pickupMarker, data.pickup, data);
    if (data.dropoff) this.lastDropoffPos = data.dropoff;
    this.dropoffMarker = this.placePin("dropoff", this.dropoffMarker, data.dropoff, data);

    this.pickupMarker?.setDraggable(Boolean(data.editable));
    this.dropoffMarker?.setDraggable(Boolean(data.editable));

    // 4. Current Location Marker
    if (data.current) {
      const heading = data.current.heading;
      if (!this.currentMarker) {
        this.currentMarker = new google.maps.Marker({
          map: this.map,
          position: data.current,
          title: "Your location",
          icon: {
            url: currentSvg(heading),
            scaledSize: new google.maps.Size(44, 44),
            anchor: new google.maps.Point(22, 22),
          },
          zIndex: 850,
        });
      } else {
        this.currentMarker.setPosition(data.current);
        this.currentMarker.setIcon({
          url: currentSvg(heading),
          scaledSize: new google.maps.Size(44, 44),
          anchor: new google.maps.Point(22, 22),
        });
        this.currentMarker.setMap(this.map);
      }
    } else if (this.currentMarker) {
      this.currentMarker.setMap(null);
      this.currentMarker = undefined;
    }

    // 5. Route
    this.route.setPath(data.route || []);
  }

  setAlternatives(routes: AlternativeRoute[]) {
    this.alternatives.forEach((l) => l.setMap(null));
    this.alternatives = [];
    for (const alt of routes) {
      if (alt.selected || alt.route.length < 2) continue;
      const pick = () => window.dispatchEvent(new CustomEvent("hop-route-pick", { detail: { index: alt.index } }));
      const line = new google.maps.Polyline({ map: this.map, path: alt.route, strokeColor: "#8b8fa3", strokeOpacity: 0.65, strokeWeight: 6, zIndex: 1, clickable: true });
      line.addListener("click", pick);
      const mid = divergencePoint(alt.route, routes.find((r) => r.selected)?.route ?? []);
      const tag = new google.maps.Marker({
        map: this.map, position: mid, zIndex: 650, title: `Use route: ${alt.label}`,
        icon: { url: routeTagSvg(alt.label), anchor: new google.maps.Point(0, 14) },
      });
      tag.addListener("click", pick);
      this.alternatives.push(line, tag);
    }
  }

  setRouteProgress(points: Coordinate[]) {
    this.route.setPath(points || []);
  }

  setPreviewVehicle(pos: Coordinate | null, heading = 0, category = "auto") {
    if (!pos) {
      if (this.previewOverlay) {
        this.previewOverlay.setMap(null);
        this.previewOverlay = undefined;
      }
      return;
    }
    const OverlayClass = getPreviewVehicleOverlayClass();
    if (!OverlayClass) return;
    if (!this.previewOverlay) {
      this.previewOverlay = new OverlayClass(
        new google.maps.LatLng(pos.lat, pos.lng),
        heading,
        category,
      );
      this.previewOverlay.setMap(this.map);
    } else {
      this.previewOverlay.update(pos, heading, category);
    }
  }

  pulseDestination(active: boolean) {
    if (!active || !this.lastDropoffPos) {
      if (this.destinationPulse) {
        this.destinationPulse.setMap(null);
        this.destinationPulse = undefined;
      }
      return;
    }
    const PulseClass = getDestinationPulseOverlayClass();
    if (!PulseClass) return;
    if (!this.destinationPulse) {
      this.destinationPulse = new PulseClass(
        new google.maps.LatLng(this.lastDropoffPos.lat, this.lastDropoffPos.lng),
      );
      this.destinationPulse.setMap(this.map);
    }
  }

  center(point: Coordinate) {
    this.map.panTo(point);
  }

  fit(points: Coordinate[]) {
    if (!points.length) return;
    if (points.length === 1) {
      this.map.panTo(points[0]);
      if (this.map.getZoom()! < 15) this.map.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    this.map.fitBounds(bounds, framePadding(this.host));
  }

  camera() {
    return { center: this.map.getCenter()!.toJSON(), zoom: this.map.getZoom()! };
  }
  restore(camera: { center: Coordinate; zoom: number }) {
    this.map.setOptions({ center: camera.center, zoom: camera.zoom });
  }
  destroy() {
    clearTimeout(this.tileTimeout);
    this.previewOverlay?.setMap(null);
    this.destinationPulse?.setMap(null);
    this.motion.destroy();
    this.vehicles.forEach((m) => m.setMap(null));
    this.alternatives.forEach((l) => l.setMap(null));
    this.pickupMarker?.setMap(null);
    this.dropoffMarker?.setMap(null);
    this.currentMarker?.setMap(null);
    this.route.setMap(null);
    this.traffic?.setMap(null);
    google.maps.event.clearInstanceListeners(this.map);
  }
}
