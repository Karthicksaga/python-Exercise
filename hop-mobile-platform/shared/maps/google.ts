import type { Coordinate, MapData, MapView, MapPreferences } from "./types";
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

const pickupSvg = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M16 1C7.716 1 1 7.716 1 16c0 11.5 15 25 15 25s15-13.5 15-25c0-8.284-6.716-15-15-15Z" fill="#167b5b" stroke="#ffffff" stroke-width="2"/>
  <circle cx="16" cy="16" r="6" fill="#ffffff"/>
  <text x="16" y="19.5" font-family="'Outfit', 'Inter', -apple-system, sans-serif" font-weight="700" font-size="10" fill="#167b5b" text-anchor="middle">P</text>
</svg>
`)}`;

const dropoffSvg = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
<svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M16 1C7.716 1 1 7.716 1 16c0 11.5 15 25 15 25s15-13.5 15-25c0-8.284-6.716-15-15-15Z" fill="#e54d36" stroke="#ffffff" stroke-width="2"/>
  <circle cx="16" cy="16" r="6" fill="#ffffff"/>
  <circle cx="16" cy="16" r="3" fill="#e54d36"/>
</svg>
`)}`;

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
      ) {
        super();
        this.div = document.createElement("div");
        this.div.className = "hop-preview-vehicle-overlay";
        this.div.innerHTML = `<img src="./assets/sedan.png" alt="Preview vehicle" style="transform: rotate(${heading}deg);" />`;
      }
      onAdd() {
        this.getPanes()?.overlayMouseTarget.appendChild(this.div);
      }
      draw() {
        const projection = this.getProjection();
        if (!projection) return;
        const point = projection.fromLatLngToDivPixel(this.position);
        if (point) {
          this.div.style.left = `${point.x - 22}px`;
          this.div.style.top = `${point.y - 15}px`;
        }
      }
      update(pos: Coordinate, heading: number) {
        this.position = new google.maps.LatLng(pos.lat, pos.lng);
        const img = this.div.querySelector<HTMLImageElement>("img");
        if (img) img.style.transform = `rotate(${heading}deg)`;
        this.draw();
      }
      onRemove() {
        this.div.remove();
      }
    };
  }
  return GooglePreviewVehicleOverlayClass;
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

export class GoogleMapView implements MapView {
  private map: google.maps.Map;
  private traffic?: google.maps.TrafficLayer;
  private vehicles = new Map<string, google.maps.Marker>();
  private pickupMarker?: google.maps.Marker;
  private dropoffMarker?: google.maps.Marker;
  private currentMarker?: google.maps.Marker;
  private route: google.maps.Polyline;
  private previewOverlay?: any;
  private destinationPulse?: any;
  private lastDropoffPos?: Coordinate;
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
    const styles: google.maps.MapTypeStyle[] = [];
    if (preferences.lowdata) styles.push({ featureType: "poi", stylers: [{ visibility: "off" }] }, { featureType: "transit", stylers: [{ visibility: "off" }] });
    if (preferences.night) styles.push(
      { elementType: "geometry", stylers: [{ color: "#24312d" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#dce5df" }] },
      { elementType: "labels.text.stroke", stylers: [{ color: "#24312d" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#45554b" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#142d3b" }] },
    );
    this.map.setOptions({ styles });
  }

  update(data: MapData) {
    // 1. Vehicles
    const ids = new Set(data.vehicles.map((v) => v.id));
    for (const [id, marker] of this.vehicles) {
      if (!ids.has(id)) {
        marker.setMap(null);
        this.vehicles.delete(id);
      }
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
          zIndex: 900,
        });
        this.vehicles.set(v.id, marker);
      }
      marker.setPosition({ lat: v.lat, lng: v.lng });
    }

    // 2. Pickup Marker
    if (data.pickup) {
      if (!this.pickupMarker) {
        this.pickupMarker = new google.maps.Marker({
          map: this.map,
          position: data.pickup,
          title: "Pickup",
          draggable: Boolean(data.editable),
          icon: {
            url: pickupSvg,
            scaledSize: new google.maps.Size(32, 42),
            anchor: new google.maps.Point(16, 42),
          },
          zIndex: 1000,
        });
        this.pickupMarker.addListener("dragend", (event: google.maps.MapMouseEvent) => {
          if (event.latLng) window.dispatchEvent(new CustomEvent("hop-map-pick", {
            detail: { ...event.latLng.toJSON(), target: "pickup" },
          }));
        });
      } else {
        this.pickupMarker.setPosition(data.pickup);
        this.pickupMarker.setMap(this.map);
      }
    } else if (this.pickupMarker) {
      this.pickupMarker.setMap(null);
      this.pickupMarker = undefined;
    }

    // 3. Dropoff Marker
    if (data.dropoff) {
      this.lastDropoffPos = data.dropoff;
      if (!this.dropoffMarker) {
        this.dropoffMarker = new google.maps.Marker({
          map: this.map,
          position: data.dropoff,
          title: "Destination",
          draggable: Boolean(data.editable),
          icon: {
            url: dropoffSvg,
            scaledSize: new google.maps.Size(32, 42),
            anchor: new google.maps.Point(16, 42),
          },
          zIndex: 1000,
        });
        this.dropoffMarker.addListener("dragend", (event: google.maps.MapMouseEvent) => {
          if (event.latLng) window.dispatchEvent(new CustomEvent("hop-map-pick", {
            detail: { ...event.latLng.toJSON(), target: "dropoff" },
          }));
        });
      } else {
        this.dropoffMarker.setPosition(data.dropoff);
        this.dropoffMarker.setMap(this.map);
      }
    } else if (this.dropoffMarker) {
      this.dropoffMarker.setMap(null);
      this.dropoffMarker = undefined;
    }

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

  setRouteProgress(points: Coordinate[]) {
    this.route.setPath(points || []);
  }

  setPreviewVehicle(pos: Coordinate | null, heading = 0) {
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
      );
      this.previewOverlay.setMap(this.map);
    } else {
      this.previewOverlay.update(pos, heading);
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
    this.map.fitBounds(bounds, 45);
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
    this.vehicles.forEach((m) => m.setMap(null));
    this.pickupMarker?.setMap(null);
    this.dropoffMarker?.setMap(null);
    this.currentMarker?.setMap(null);
    this.route.setMap(null);
    this.traffic?.setMap(null);
    google.maps.event.clearInstanceListeners(this.map);
  }
}
