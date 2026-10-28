import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Coordinate, MapData, MapView } from "./types";
import { vehicleCategory } from "./types";
export class OSMMapView implements MapView {
  private map: L.Map;
  private vehicles = new Map<string, L.Marker>();
  private shapes = L.layerGroup();
  private resize: ResizeObserver;
  constructor(
    host: HTMLElement,
    center: Coordinate,
    status: (message: string) => void,
  ) {
    this.map = L.map(host, { zoomControl: false }).setView(
      [center.lat, center.lng],
      14,
    );
    L.tileLayer(
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
    this.shapes.addTo(this.map);
    this.resize = new ResizeObserver(() => this.map.invalidateSize());
    this.resize.observe(host);
  }
  update(data: MapData) {
    const ids = new Set(data.vehicles.map((v) => v.id));
    for (const [id, marker] of this.vehicles)
      if (!ids.has(id)) {
        marker.remove();
        this.vehicles.delete(id);
      }
    for (const v of data.vehicles) {
      let marker = this.vehicles.get(v.id);
      if (!marker) {
        marker = L.marker([v.lat, v.lng], {
          title: "Live captain",
          icon: L.icon({
            iconUrl: `./assets/${vehicleCategory(v.category)}.png`,
            iconSize: [42, 30],
            iconAnchor: [21, 15],
          }),
        }).addTo(this.map);
        this.vehicles.set(v.id, marker);
      } else marker.setLatLng([v.lat, v.lng]);
    }
    this.shapes.clearLayers();
    for (const [point, color] of [
      [data.pickup, "#167b5b"],
      [data.dropoff, "#e54d36"],
      [data.current, "#2677df"],
    ] as const)
      if (point)
        L.circleMarker([point.lat, point.lng], {
          radius: 8,
          color: "#fff",
          weight: 3,
          fillColor: color,
          fillOpacity: 1,
        }).addTo(this.shapes);
    if (data.route?.length)
      L.polyline(
        data.route.map((p) => [p.lat, p.lng] as L.LatLngTuple),
        { color: "#167b5b", weight: 5 },
      ).addTo(this.shapes);
  }
  center(point: Coordinate) {
    this.map.panTo([point.lat, point.lng]);
  }
  fit(points: Coordinate[]) {
    if (points.length)
      this.map.fitBounds(
        L.latLngBounds(points.map((p) => [p.lat, p.lng] as L.LatLngTuple)),
        { padding: [35, 35], maxZoom: 17 },
      );
  }
  destroy() {
    this.resize.disconnect();
    this.map.remove();
  }
}
