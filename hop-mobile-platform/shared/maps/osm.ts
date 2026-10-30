import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Coordinate, MapData, MapView, MapPreferences } from "./types";
import { vehicleCategory } from "./types";

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

function createPickupIcon(): L.DivIcon {
  return L.divIcon({
    className: "hop-custom-pin-icon",
    html: `
      <div class="hop-marker-pin hop-pickup-pin">
        <div class="hop-pin-badge hop-pickup-badge">PICKUP</div>
        <svg class="hop-pin-svg" width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 1C7.716 1 1 7.716 1 16c0 11.5 15 25 15 25s15-13.5 15-25c0-8.284-6.716-15-15-15Z" fill="#167b5b" stroke="#ffffff" stroke-width="2"/>
          <circle cx="16" cy="16" r="6" fill="#ffffff"/>
          <text x="16" y="19.5" font-family="'Outfit', 'Inter', -apple-system, sans-serif" font-weight="700" font-size="10" fill="#167b5b" text-anchor="middle">P</text>
        </svg>
      </div>`,
    iconSize: [32, 42],
    iconAnchor: [16, 41],
  });
}

function createDropoffIcon(): L.DivIcon {
  return L.divIcon({
    className: "hop-custom-pin-icon",
    html: `
      <div class="hop-marker-pin hop-dropoff-pin">
        <div class="hop-pin-badge hop-dropoff-badge">DROPOFF</div>
        <svg class="hop-pin-svg" width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 1C7.716 1 1 7.716 1 16c0 11.5 15 25 15 25s15-13.5 15-25c0-8.284-6.716-15-15-15Z" fill="#e54d36" stroke="#ffffff" stroke-width="2"/>
          <circle cx="16" cy="16" r="6" fill="#ffffff"/>
          <circle cx="16" cy="16" r="3" fill="#e54d36"/>
        </svg>
      </div>`,
    iconSize: [32, 42],
    iconAnchor: [16, 41],
  });
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
        <img src="./assets/${vehicleCategory(category)}.png" alt="Vehicle" class="hop-vehicle-icon" />
      </div>`,
    iconSize: [42, 30],
    iconAnchor: [21, 15],
  });
}

export class OSMMapView implements MapView {
  private map: L.Map;
  private tiles: L.TileLayer;
  private host: HTMLElement;
  private vehicles = new Map<string, L.Marker>();
  private pickupMarker?: L.Marker;
  private dropoffMarker?: L.Marker;
  private currentMarker?: L.Marker;
  private currentCircle?: L.CircleMarker;
  private currentHeading?: number;
  private routeLine?: L.Polyline;
  private arrowMarkers: L.Marker[] = [];
  private resize: ResizeObserver;

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
        status("Map tiles unavailable · check your connection"),
      )
      .addTo(this.map);

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
    this.resize = new ResizeObserver(() => this.map.invalidateSize());
    this.resize.observe(host);
  }

  setPreferences(preferences: MapPreferences) {
    this.tiles.options.keepBuffer = preferences.lowdata ? 0 : 2;
    this.tiles.options.updateWhenIdle = preferences.lowdata;
    this.tiles.options.updateWhenZooming = !preferences.lowdata;
    this.host.classList.toggle("hop-night-tiles", preferences.night);
    this.host.dataset.lowData = String(preferences.lowdata);
  }

  update(data: MapData) {
    // 1. Vehicles
    const ids = new Set(data.vehicles.map((v) => v.id));
    for (const [id, marker] of this.vehicles) {
      if (!ids.has(id)) {
        marker.remove();
        this.vehicles.delete(id);
      }
    }
    for (const v of data.vehicles) {
      let marker = this.vehicles.get(v.id);
      if (!marker) {
        marker = L.marker([v.lat, v.lng], {
          title: "Live captain",
          icon: createVehicleIcon(v.category, v.heading),
          zIndexOffset: 900,
        }).addTo(this.map);
        this.vehicles.set(v.id, marker);
      } else {
        marker.setLatLng([v.lat, v.lng]);
        const el = marker.getElement()?.querySelector<HTMLElement>(".hop-vehicle-marker");
        if (el && v.heading != null && !Number.isNaN(v.heading)) {
          el.style.transform = `rotate(${v.heading}deg)`;
        }
      }
    }

    // 2. Pickup Pin (Green teardrop with "PICKUP")
    if (data.pickup) {
      if (!this.pickupMarker) {
        this.pickupMarker = L.marker([data.pickup.lat, data.pickup.lng], {
          title: "Pickup location",
          draggable: Boolean(data.editable),
          icon: createPickupIcon(),
          zIndexOffset: 1000,
        }).addTo(this.map);
        this.pickupMarker.on("dragend", () => {
          const point = this.pickupMarker!.getLatLng();
          window.dispatchEvent(new CustomEvent("hop-map-pick", {
            detail: { lat: point.lat, lng: point.lng, target: "pickup" },
          }));
        });
      } else {
        this.pickupMarker.setLatLng([data.pickup.lat, data.pickup.lng]);
        if (!this.map.hasLayer(this.pickupMarker)) {
          this.pickupMarker.addTo(this.map);
        }
      }
    } else if (this.pickupMarker) {
      this.pickupMarker.remove();
      this.pickupMarker = undefined;
    }

    // 3. Dropoff Pin (Coral/Red teardrop with "DROPOFF")
    if (data.dropoff) {
      if (!this.dropoffMarker) {
        this.dropoffMarker = L.marker([data.dropoff.lat, data.dropoff.lng], {
          title: "Dropoff destination",
          draggable: Boolean(data.editable),
          icon: createDropoffIcon(),
          zIndexOffset: 1000,
        }).addTo(this.map);
        this.dropoffMarker.on("dragend", () => {
          const point = this.dropoffMarker!.getLatLng();
          window.dispatchEvent(new CustomEvent("hop-map-pick", {
            detail: { lat: point.lat, lng: point.lng, target: "dropoff" },
          }));
        });
      } else {
        this.dropoffMarker.setLatLng([data.dropoff.lat, data.dropoff.lng]);
        if (!this.map.hasLayer(this.dropoffMarker)) {
          this.dropoffMarker.addTo(this.map);
        }
      }
    } else if (this.dropoffMarker) {
      this.dropoffMarker.remove();
      this.dropoffMarker = undefined;
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
          color: "#167b5b",
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
      if (this.routeLine) {
        this.routeLine.remove();
        this.routeLine = undefined;
      }
      this.arrowMarkers.forEach((m) => m.remove());
      this.arrowMarkers = [];
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
      { padding: [45, 45], maxZoom: 17, animate: true },
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
    this.resize.disconnect();
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
