import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Point, RoutePoint } from '../services/contracts';
export class LiveMap {
  private map: L.Map;
  private markers = L.layerGroup();
  private resize: ResizeObserver;
  constructor(host: HTMLElement, select: (point: Point) => void, status: (message: string) => void) {
    this.map = L.map(host, { zoomControl: false }).setView([13.0067, 80.2206], 12);
    L.control.zoom({ position: 'topright' }).addTo(this.map);
    L.tileLayer(import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: import.meta.env.VITE_MAP_ATTRIBUTION || '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).on('tileerror', () => status('Map tiles unavailable. Retry when connected; address search remains available.')).addTo(this.map);
    this.markers.addTo(this.map);
    this.map.on('click', e => select({ lat: e.latlng.lat, lng: e.latlng.lng, label: `Map pin ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}` }));
    this.resize = new ResizeObserver(() => this.map.invalidateSize());
    this.resize.observe(host);
  }
  update(pickup?: Point, dropoff?: Point, route?: RoutePoint[], driver?: RoutePoint, fit = false) {
    this.markers.clearLayers();
    const points: L.LatLngTuple[] = [];
    for (const [point, label, color] of [[pickup, 'Pickup', '#227659'], [dropoff, 'Destination', '#e73f31'], [driver, 'Captain', '#315bde']] as const) {
      if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
      const xy: L.LatLngTuple = [point.lat, point.lng]; points.push(xy);
      const text = document.createElement('span'); text.textContent = label;
      L.circleMarker(xy, { radius: 9, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1 }).bindTooltip(text).addTo(this.markers);
    }
    if (route?.length) L.polyline(route.map(p => [p.lat, p.lng] as L.LatLngTuple), { color: '#227659', weight: 5 }).addTo(this.markers);
    if (fit && points.length) this.map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 15 });
  }
  destroy() { this.resize.disconnect(); this.map.remove(); }
}
