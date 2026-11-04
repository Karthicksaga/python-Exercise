import NoticeCard from "./NoticeCard";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AdvancedMarker, AdvancedMarkerAnchorPoint, Map as GoogleMap, useMap } from "@vis.gl/react-google-maps";
import { useMapProvider } from "./mapProvider";
import { isDark, lowDataEnabled, useMapPrefs } from "./mapPrefs";

export type LatLng = { lat: number; lng: number };
type Anchor = "bottom" | "center";

const TILE_URL = import.meta.env.VITE_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OsmContext = createContext<L.Map | null>(null);

type MapProps = {
  center: LatLng;
  zoom: number;
  restriction?: { north: number; south: number; east: number; west: number };
  onClick?: (p: LatLng) => void;
  onUserDrag?: () => void;
  // Fires with the map centre while the user drags (moving=true) and once it settles (moving=false).
  onCenterChange?: (p: LatLng, moving: boolean) => void;
  children?: ReactNode;
};

function OsmMap({ center, zoom, restriction, onClick, onUserDrag, onCenterChange, children }: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const [tileFails, setTileFails] = useState(0);
  const handlers = useRef({ onClick, onUserDrag, onCenterChange });
  handlers.current = { onClick, onUserDrag, onCenterChange };
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { center, zoom, zoomControl: false, attributionControl: true, zoomSnap: 0.5, zoomAnimation: false, fadeAnimation: false });
    L.control.zoom({ position: "bottomright" }).addTo(m);
    const street = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: "© OpenStreetMap contributors", referrerPolicy: "origin" });
    const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" });
    street.on("tileerror", () => setTileFails((n) => n + 1));
    street.on("tileload", () => setTileFails(0));
    (lowDataEnabled() || localStorage.getItem("hop.mapLayer") === "satellite" ? satellite : street).addTo(m);
    L.control.layers({ Map: street, Satellite: satellite }, undefined, { position: "topright", collapsed: true }).addTo(m);
    m.on("baselayerchange", (e) => localStorage.setItem("hop.mapLayer", e.name === "Satellite" ? "satellite" : "map"));
    if (restriction) m.setMaxBounds(L.latLngBounds([restriction.south - 0.2, restriction.west - 0.2], [restriction.north + 0.2, restriction.east + 0.2]));
    m.on("click", (e) => handlers.current.onClick?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    let dragged = false;
    m.on("dragstart", () => {
      dragged = true;
      handlers.current.onUserDrag?.();
      const c = m.getCenter();
      handlers.current.onCenterChange?.({ lat: c.lat, lng: c.lng }, true);
    });
    m.on("moveend", () => {
      if (!dragged) return;
      dragged = false;
      const c = m.getCenter();
      handlers.current.onCenterChange?.({ lat: c.lat, lng: c.lng }, false);
    });
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(el.current);
    setMap(m);
    return () => {
      resize.disconnect();
      m.stop();
      m.remove();
      setMap(null);
    };
    // The map is created once; later center/zoom changes go through MapFit and MapFollow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="booking-map osm-map" ref={el}>
      <OsmContext.Provider value={map}>{map && children}</OsmContext.Provider>
      {tileFails >= 4 && (
        <div className="map-blocked">
          <NoticeCard icon="🗺️" title="Map tiles couldn't load" actionLabel="Try again" onAction={() => { setTileFails(0); map?.eachLayer((l) => (l as L.TileLayer).redraw?.()); }}>
            The map server refused or didn't answer. You're offline or the provider is blocking requests. Search and booking still work.
          </NoticeCard>
        </div>
      )}
    </div>
  );
}

function OsmMarker({ position, draggable, onDragEnd, title, anchor = "bottom", zIndex, children }: MarkerProps) {
  const map = useContext(OsmContext)!;
  const [host, setHost] = useState<HTMLElement | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const drag = useRef(onDragEnd);
  drag.current = onDragEnd;
  useEffect(() => {
    const m = L.marker(position, {
      draggable: Boolean(draggable),
      title,
      zIndexOffset: zIndex ?? 0,
      icon: L.divIcon({ className: "osm-marker", html: "", iconSize: [0, 0] }),
    }).addTo(map);
    m.on("dragend", () => {
      const p = m.getLatLng();
      drag.current?.(p.lat, p.lng);
    });
    marker.current = m;
    setHost(m.getElement() ?? null);
    return () => {
      m.remove();
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, draggable]);
  useEffect(() => {
    marker.current?.setLatLng(position);
  }, [position.lat, position.lng]);
  if (!host) return null;
  return createPortal(<div className={"osm-anchor " + anchor}>{children}</div>, host);
}

function OsmLine({ path, color, weight, opacity = 1 }: LineProps) {
  const map = useContext(OsmContext)!;
  useEffect(() => {
    if (path.length < 2) return;
    const line = L.polyline(path, { color, weight, opacity, lineCap: "round", lineJoin: "round", interactive: false }).addTo(map);
    return () => {
      line.remove();
    };
  }, [map, path, color, weight, opacity]);
  return null;
}

function OsmFit({ points, padding = 56, extra }: FitProps) {
  const map = useContext(OsmContext)!;
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], 16);
    else map.fitBounds(L.latLngBounds(points), { padding: [padding, padding], maxZoom: 17 });
    // Callers pass `extra` to say when to refit; point identity alone would refit on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, extra]);
  return null;
}

function OsmFollow({ center, minZoom = 16 }: FollowProps) {
  const map = useContext(OsmContext)!;
  useEffect(() => {
    map.setView(center, Math.max(map.getZoom(), minZoom), { animate: false });
  }, [map, center.lat, center.lng, minZoom]);
  return null;
}

type MarkerProps = { position: LatLng; draggable?: boolean; onDragEnd?: (lat: number, lng: number) => void; title?: string; anchor?: Anchor; zIndex?: number; children?: ReactNode };
type LineProps = { path: LatLng[]; color: string; weight: number; opacity?: number };
type FitProps = { points: LatLng[]; padding?: number; extra?: unknown };
type FollowProps = { center: LatLng; minZoom?: number };

function GoogleLine({ path, color, weight, opacity = 1 }: LineProps) {
  const map = useMap();
  useEffect(() => {
    if (!map || path.length < 2) return;
    const line = new google.maps.Polyline({ map, path, strokeColor: color, strokeOpacity: opacity, strokeWeight: weight });
    return () => line.setMap(null);
  }, [map, path, color, weight, opacity]);
  return null;
}
function GoogleFit({ points, padding = 56, extra }: FitProps) {
  const map = useMap();
  useEffect(() => {
    if (!map || !points.length) return;
    if (points.length === 1) {
      map.panTo(points[0]);
      map.setZoom(16);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, padding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, extra]);
  return null;
}
function GoogleFollow({ center, minZoom = 16 }: FollowProps) {
  const map = useMap();
  useEffect(() => {
    if (map) map.moveCamera({ center, zoom: Math.max(map.getZoom() ?? 0, minZoom) });
  }, [map, center.lat, center.lng, minZoom]);
  return null;
}

// Traffic overlay and tilted 3D view (3D buildings need a vector Map ID).
function GoogleLayers() {
  const map = useMap();
  const { traffic, tilt, lowData } = useMapPrefs();
  useEffect(() => {
    if (!map || !traffic || lowData) return;
    const layer = new google.maps.TrafficLayer();
    layer.setMap(map);
    return () => layer.setMap(null);
  }, [map, traffic, lowData]);
  useEffect(() => {
    if (!map) return;
    const on = tilt && !lowData;
    map.setTilt(on ? 60 : 0);
    if (on) map.setZoom(Math.max(map.getZoom() ?? 0, 17));
  }, [map, tilt, lowData]);
  return null;
}

function OsmPan({ point, extra }: { point: LatLng; extra?: unknown }) {
  const map = useContext(OsmContext)!;
  useEffect(() => {
    map.setView(point, Math.max(map.getZoom(), 16), { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, extra]);
  return null;
}
function GooglePan({ point, extra }: { point: LatLng; extra?: unknown }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.panTo(point);
    if ((map.getZoom() ?? 0) < 16) map.setZoom(16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, extra]);
  return null;
}
// Re-centres the map on `point` whenever `extra` changes.
export function MapPan(props: { point: LatLng; extra?: unknown }) {
  return useMapProvider() === "osm" ? <OsmPan {...props} /> : <GooglePan {...props} />;
}

export function MapCanvas(props: MapProps) {
  const provider = useMapProvider();
  const dragged = useRef(false);
  const prefs = useMapPrefs();
  if (provider === "osm") return <OsmMap {...props} />;
  const { center, zoom, restriction, onClick, onUserDrag, onCenterChange, children } = props;
  return (
    <GoogleMap
      colorScheme={isDark(prefs) ? "DARK" : "LIGHT"}
      onIdle={(e) => {
        if (!dragged.current) return;
        dragged.current = false;
        const c = e.map.getCenter();
        if (c) onCenterChange?.({ lat: c.lat(), lng: c.lng() }, false);
      }}
      className="booking-map"
      defaultCenter={center}
      defaultZoom={zoom}
      gestureHandling="greedy"
      disableDefaultUI
      zoomControl
      mapId={import.meta.env.VITE_GOOGLE_MAP_ID || "DEMO_MAP_ID"}
      restriction={restriction && { latLngBounds: restriction, strictBounds: false }}
      onClick={(e) => e.detail.latLng && onClick?.({ lat: e.detail.latLng.lat, lng: e.detail.latLng.lng })}
      onDragstart={(e) => {
        dragged.current = true;
        onUserDrag?.();
        const c = e.map.getCenter();
        if (c) onCenterChange?.({ lat: c.lat(), lng: c.lng() }, true);
      }}
    >
      <GoogleLayers />
      {children}
    </GoogleMap>
  );
}

export function MapMarker(props: MarkerProps) {
  const provider = useMapProvider();
  if (provider === "osm") return <OsmMarker {...props} />;
  const { position, draggable, onDragEnd, title, anchor, zIndex, children } = props;
  return (
    <AdvancedMarker
      position={position}
      title={title}
      // The library makes any marker with a drag handler draggable, so only attach one when asked.
      draggable={Boolean(draggable)}
      zIndex={zIndex}
      anchorPoint={anchor === "center" ? AdvancedMarkerAnchorPoint.CENTER : undefined}
      onDragEnd={draggable && onDragEnd ? (e) => e.latLng && onDragEnd(e.latLng.lat(), e.latLng.lng()) : undefined}
    >
      {children}
    </AdvancedMarker>
  );
}

export function MapLine(props: LineProps) {
  return useMapProvider() === "osm" ? <OsmLine {...props} /> : <GoogleLine {...props} />;
}
export function MapFit(props: FitProps) {
  return useMapProvider() === "osm" ? <OsmFit {...props} /> : <GoogleFit {...props} />;
}
export function MapFollow(props: FollowProps) {
  return useMapProvider() === "osm" ? <OsmFollow {...props} /> : <GoogleFollow {...props} />;
}

type CircleProps = { center: LatLng; radius: number; color: string; opacity?: number };
function OsmCircle({ center, radius, color, opacity = 0.35 }: CircleProps) {
  const map = useContext(OsmContext)!;
  useEffect(() => {
    const c = L.circle(center, { radius, color, weight: 0, fillColor: color, fillOpacity: opacity, interactive: false }).addTo(map);
    return () => {
      c.remove();
    };
  }, [map, center.lat, center.lng, radius, color, opacity]);
  return null;
}
function GoogleCircle({ center, radius, color, opacity = 0.35 }: CircleProps) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const c = new google.maps.Circle({ map, center, radius, strokeWeight: 0, fillColor: color, fillOpacity: opacity, clickable: false });
    return () => c.setMap(null);
  }, [map, center.lat, center.lng, radius, color, opacity]);
  return null;
}
// Filled circle in metres, used for the demand heatmap.
export function MapCircle(props: CircleProps) {
  return useMapProvider() === "osm" ? <OsmCircle {...props} /> : <GoogleCircle {...props} />;
}

// ---------- Zone rectangles (operator console) ----------
export type Bounds = { min_lat: number; max_lat: number; min_lng: number; max_lng: number };
type RectProps = { bounds: Bounds; color: string; fillOpacity?: number; weight?: number; dashed?: boolean; label?: string };
type RectEditorProps = { bounds: Bounds; color: string; onChange: (b: Bounds, done: boolean) => void };
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const MIN_SPAN = 0.01; // about 1 km

function OsmRect({ bounds: b, color, fillOpacity = 0.08, weight = 2, dashed, label }: RectProps) {
  const map = useContext(OsmContext)!;
  useEffect(() => {
    const rect = L.rectangle([[b.min_lat, b.min_lng], [b.max_lat, b.max_lng]], {
      color, weight, fillColor: color, fillOpacity, dashArray: dashed ? "6 6" : undefined, interactive: false,
    }).addTo(map);
    if (label) rect.bindTooltip(label, { permanent: true, direction: "center", className: "zone-label" });
    return () => {
      rect.remove();
    };
  }, [map, b.min_lat, b.max_lat, b.min_lng, b.max_lng, color, fillOpacity, weight, dashed, label]);
  return null;
}
function GoogleRect({ bounds: b, color, fillOpacity = 0.08, weight = 2 }: RectProps) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const rect = new google.maps.Rectangle({
      map, bounds: { north: b.max_lat, south: b.min_lat, east: b.max_lng, west: b.min_lng },
      strokeColor: color, strokeWeight: weight, fillColor: color, fillOpacity, clickable: false,
    });
    return () => rect.setMap(null);
  }, [map, b.min_lat, b.max_lat, b.min_lng, b.max_lng, color, fillOpacity, weight]);
  return null;
}
// A fixed rectangle, used for other zones, district outlines and overlaps.
export function MapRect(props: RectProps) {
  return useMapProvider() === "osm" ? <OsmRect {...props} /> : <GoogleRect {...props} />;
}

function OsmRectEditor({ bounds, color, onChange }: RectEditorProps) {
  const map = useContext(OsmContext)!;
  const change = useRef(onChange);
  change.current = onChange;
  const parts = useRef<{ rect: L.Rectangle; corners: Record<string, L.Marker>; move: L.Marker } | null>(null);
  const live = useRef(bounds);
  live.current = bounds;
  useEffect(() => {
    const handle = (cls: string, label: string) =>
      L.divIcon({ className: "zone-handle-wrap", html: `<span class="zone-handle ${cls}" role="img" aria-label="${label}"></span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
    const b = live.current;
    const rect = L.rectangle([[b.min_lat, b.min_lng], [b.max_lat, b.max_lng]], { color, weight: 2.5, fillColor: color, fillOpacity: 0.13, interactive: false }).addTo(map);
    const corners: Record<string, L.Marker> = {};
    const place = (nb: Bounds) => {
      rect.setBounds([[nb.min_lat, nb.min_lng], [nb.max_lat, nb.max_lng]]);
      corners.nw.setLatLng([nb.max_lat, nb.min_lng]); corners.ne.setLatLng([nb.max_lat, nb.max_lng]);
      corners.sw.setLatLng([nb.min_lat, nb.min_lng]); corners.se.setLatLng([nb.min_lat, nb.max_lng]);
      move.setLatLng([(nb.min_lat + nb.max_lat) / 2, (nb.min_lng + nb.max_lng) / 2]);
    };
    for (const k of ["nw", "ne", "sw", "se"]) {
      const lat = k[0] === "n" ? b.max_lat : b.min_lat, lng = k[1] === "w" ? b.min_lng : b.max_lng;
      const m = L.marker([lat, lng], { draggable: true, icon: handle("corner " + k, `Resize from the ${k.toUpperCase()} corner`), zIndexOffset: 1000, keyboard: false }).addTo(map);
      const update = (done: boolean) => {
        const p = m.getLatLng(), c = live.current, nb = { ...c };
        if (k[0] === "n") nb.max_lat = r4(Math.max(p.lat, c.min_lat + MIN_SPAN)); else nb.min_lat = r4(Math.min(p.lat, c.max_lat - MIN_SPAN));
        if (k[1] === "e") nb.max_lng = r4(Math.max(p.lng, c.min_lng + MIN_SPAN)); else nb.min_lng = r4(Math.min(p.lng, c.max_lng - MIN_SPAN));
        live.current = nb; place(nb); change.current(nb, done);
      };
      m.on("drag", () => update(false)); m.on("dragend", () => update(true));
      corners[k] = m;
    }
    const move = L.marker([(b.min_lat + b.max_lat) / 2, (b.min_lng + b.max_lng) / 2], { draggable: true, icon: handle("move", "Move the zone"), zIndexOffset: 1000, keyboard: false }).addTo(map);
    let start = live.current, from = move.getLatLng();
    move.on("dragstart", () => { start = live.current; from = move.getLatLng(); });
    const shift = (done: boolean) => {
      const p = move.getLatLng(), dLat = p.lat - from.lat, dLng = p.lng - from.lng;
      const nb = { min_lat: r4(start.min_lat + dLat), max_lat: r4(start.max_lat + dLat), min_lng: r4(start.min_lng + dLng), max_lng: r4(start.max_lng + dLng) };
      live.current = nb; place(nb); change.current(nb, done);
    };
    move.on("drag", () => shift(false)); move.on("dragend", () => shift(true));
    parts.current = { rect, corners, move };
    return () => {
      rect.remove(); move.remove(); Object.values(corners).forEach((m) => m.remove());
      parts.current = null;
    };
    // Built once per map; outside changes are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, color]);
  useEffect(() => {
    const p = parts.current;
    if (!p) return;
    const b = bounds;
    p.rect.setBounds([[b.min_lat, b.min_lng], [b.max_lat, b.max_lng]]);
    p.corners.nw.setLatLng([b.max_lat, b.min_lng]); p.corners.ne.setLatLng([b.max_lat, b.max_lng]);
    p.corners.sw.setLatLng([b.min_lat, b.min_lng]); p.corners.se.setLatLng([b.min_lat, b.max_lng]);
    p.move.setLatLng([(b.min_lat + b.max_lat) / 2, (b.min_lng + b.max_lng) / 2]);
  }, [bounds.min_lat, bounds.max_lat, bounds.min_lng, bounds.max_lng]);
  return null;
}
function GoogleRectEditor({ bounds, color, onChange }: RectEditorProps) {
  const map = useMap();
  const change = useRef(onChange);
  change.current = onChange;
  const rect = useRef<google.maps.Rectangle | null>(null);
  useEffect(() => {
    if (!map) return;
    const r = new google.maps.Rectangle({
      map, editable: true, draggable: true, strokeColor: color, strokeWeight: 2.5, fillColor: color, fillOpacity: 0.13,
      bounds: { north: bounds.max_lat, south: bounds.min_lat, east: bounds.max_lng, west: bounds.min_lng },
    });
    const read = (): Bounds => {
      const b = r.getBounds()!, ne = b.getNorthEast(), sw = b.getSouthWest();
      return { min_lat: r4(sw.lat()), max_lat: r4(ne.lat()), min_lng: r4(sw.lng()), max_lng: r4(ne.lng()) };
    };
    let dragging = false;
    const ls = [
      r.addListener("bounds_changed", () => change.current(read(), !dragging)),
      r.addListener("dragstart", () => { dragging = true; }),
      r.addListener("dragend", () => { dragging = false; change.current(read(), true); }),
      r.addListener("mouseup", () => change.current(read(), true)),
    ];
    rect.current = r;
    return () => { ls.forEach((l) => l.remove()); r.setMap(null); rect.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, color]);
  useEffect(() => {
    const r = rect.current, b = r?.getBounds();
    if (!r || !b) return;
    const ne = b.getNorthEast(), sw = b.getSouthWest();
    // Only push outside changes; echoing the rectangle's own edits back would fight the drag.
    if (r4(ne.lat()) === bounds.max_lat && r4(sw.lat()) === bounds.min_lat && r4(ne.lng()) === bounds.max_lng && r4(sw.lng()) === bounds.min_lng) return;
    r.setBounds({ north: bounds.max_lat, south: bounds.min_lat, east: bounds.max_lng, west: bounds.min_lng });
  }, [bounds.min_lat, bounds.max_lat, bounds.min_lng, bounds.max_lng]);
  return null;
}
// An editable zone: drag the corners to resize and the centre (or the box on Google) to move it.
// onChange fires while dragging (done=false) and once when the drag ends (done=true).
export function MapRectEditor(props: RectEditorProps) {
  return useMapProvider() === "osm" ? <OsmRectEditor {...props} /> : <GoogleRectEditor {...props} />;
}
