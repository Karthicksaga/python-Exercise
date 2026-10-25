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
      draggable,
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
      draggable={draggable}
      zIndex={zIndex}
      anchorPoint={anchor === "center" ? AdvancedMarkerAnchorPoint.CENTER : undefined}
      onDragEnd={(e) => e.latLng && onDragEnd?.(e.latLng.lat(), e.latLng.lng())}
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
