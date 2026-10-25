import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconArrowsMaximize, IconArrowsMinimize, IconBookmark, IconFlame, IconPlaneDeparture, IconRuler2, IconCurrentLocation } from "@tabler/icons-react";
import { api } from "./api";
import { hubs } from "./hubs";
import { MapCircle, MapLine, MapMarker, MapPan, type LatLng } from "./mapkit";
import type { Point } from "./types";

export type Poi = Point & { icon: string };

export function meters(a: LatLng, b: LatLng) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}
export const kmText = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);

// Typical (not live) congestion for the hour, used to colour the route and pad the ETA.
export function trafficNow(now = new Date()) {
  const h = now.getHours();
  const weekday = now.getDay() !== 0 && now.getDay() !== 6;
  if (weekday && ((h >= 8 && h < 11) || (h >= 17 && h < 21))) return { label: "Heavy", factor: 1.35, color: "#dc2626" };
  if ((h >= 7 && h < 8) || (h >= 11 && h < 12) || (h >= 21 && h < 22) || (!weekday && h >= 11 && h < 20)) return { label: "Moderate", factor: 1.15, color: "#f59e0b" };
  return { label: "Light", factor: 1, color: "#16a34a" };
}

export type MapTools = ReturnType<typeof useMapTools>;
export function useMapTools(opts: { demand?: boolean } = {}) {
  const [full, setFull] = useState(false);
  const [ruler, setRuler] = useState(false);
  const [rulerPts, setRulerPts] = useState<LatLng[]>([]);
  const [showHubs, setShowHubs] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showDemand, setShowDemand] = useState(Boolean(opts.demand));
  const [pan, setPan] = useState<{ p: LatLng; n: number } | null>(null);
  const [me, setMe] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!full) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", esc);
    document.body.classList.add("map-full-open");
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.classList.remove("map-full-open");
    };
  }, [full]);
  const goTo = (p: LatLng) => setPan((c) => ({ p, n: (c?.n ?? 0) + 1 }));
  function locate() {
    if (!navigator.geolocation) return setError("Location isn't available on this device");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (g) => {
        const p = { lat: g.coords.latitude, lng: g.coords.longitude };
        setMe(p);
        goTo(p);
        setLocating(false);
        setError("");
      },
      () => {
        setLocating(false);
        setError("Allow location access to centre the map on you");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }
  // Map clicks while measuring add points; returns true when the click was used.
  const onMapClick = (p: LatLng) => {
    if (!ruler) return false;
    setRulerPts((pts) => (pts.length >= 2 ? [p] : [...pts, p]));
    return true;
  };
  return { full, setFull, ruler, setRuler, rulerPts, setRulerPts, showHubs, setShowHubs, showSaved, setShowSaved, showDemand, setShowDemand, pan, goTo, me, locate, locating, error, onMapClick };
}

export type Cell = { lat: number; lng: number; requests: number; drivers?: number };
export function useDemand(on: boolean) {
  const [cells, setCells] = useState<Cell[]>([]);
  useEffect(() => {
    if (!on) return;
    let live = true;
    const load = () => api<{ cells: Cell[] }>("/api/drivers/demand").then((r) => live && setCells(r.cells ?? [])).catch(() => undefined);
    void load();
    const id = setInterval(load, 60000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [on]);
  return cells;
}

// Everything that draws on the map itself; render inside <MapCanvas>.
export function MapToolLayers({ tools, area, pois = [], onPick, demand, cells = [] }: { tools: MapTools; area?: string; pois?: Poi[]; onPick?: (p: Point) => void; demand?: boolean; cells?: Cell[] }) {
  const max = Math.max(1, ...cells.map((c) => c.requests));
  const hubList = (area && hubs[area]) || [];
  const [a, b] = tools.rulerPts;
  const pick = (p: Point) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onPick?.(p);
  };
  return (
    <>
      {tools.pan && <MapPan point={tools.pan.p} extra={tools.pan.n} />}
      {tools.me && (
        <MapMarker position={tools.me} anchor="center" title="You">
          <span className="me-dot-sm" aria-label="Your location" />
        </MapMarker>
      )}
      {demand && tools.showDemand && cells.map((c, i) => {
        const w = c.requests / max;
        return <MapCircle key={i} center={c} radius={380 + 320 * w} color={w > 0.66 ? "#dc2626" : w > 0.33 ? "#f59e0b" : "#fbbf24"} opacity={0.25 + 0.3 * w} />;
      })}
      {demand && tools.showDemand && cells.map((c, i) => (
        <MapMarker key={"n" + i} position={c} anchor="center"><span className="heat-count">{c.requests}</span></MapMarker>
      ))}
      {tools.showHubs && hubList.map((h) => (
        <MapMarker key={h.label} position={h} title={h.label}>
          <button type="button" className="poi" aria-label={h.label} title={h.note} onClick={pick(h)}>{h.kind === "airport" ? "✈️" : "🚆"}</button>
        </MapMarker>
      ))}
      {tools.showSaved && pois.map((p) => (
        <MapMarker key={p.label + p.lat} position={p} title={p.label}>
          <button type="button" className="poi" aria-label={p.label} title={p.label} onClick={pick(p)}>{p.icon}</button>
        </MapMarker>
      ))}
      {a && (
        <MapMarker position={a} anchor="center"><span className="ruler-dot">A</span></MapMarker>
      )}
      {a && b && (
        <>
          <MapLine path={[a, b]} color="#111827" weight={4} opacity={0.85} />
          <MapMarker position={b} anchor="center"><span className="ruler-dot">B</span></MapMarker>
          <MapMarker position={{ lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }} anchor="center"><span className="ruler-label">{kmText(meters(a, b))}</span></MapMarker>
        </>
      )}
    </>
  );
}

function Tool({ label, on, onClick, children }: { label: string; on?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip label={label} position="left">
      <ActionIcon size="lg" radius="xl" variant="filled" color={on ? "indigo" : "dark"} aria-pressed={on} aria-label={label} onClick={onClick}>{children}</ActionIcon>
    </Tooltip>
  );
}

type Result = Point;
// Search box with voice input that pans the map (and optionally picks the result).
function MapSearch({ areaId, tools, onPick }: { areaId?: string; tools: MapTools; onPick?: (p: Point) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const n = useRef(0);
  const SR = (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any });
  const Ctor = SR.SpeechRecognition || SR.webkitSpeechRecognition;
  async function search(text: string) {
    const v = ++n.current;
    if (text.trim().length < 3 || !areaId) return setRes([]);
    setBusy(true);
    try {
      const r = await api<Result[]>(`/api/places?area_id=${encodeURIComponent(areaId)}&q=${encodeURIComponent(text)}`);
      if (v === n.current) setRes(r.slice(0, 5));
    } catch {
      if (v === n.current) setRes([]);
    } finally {
      if (v === n.current) setBusy(false);
    }
  }
  useEffect(() => {
    const id = setTimeout(() => void search(q), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  function listen() {
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.onresult = (e: any) => setQ(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }
  return (
    <div className="map-search">
      <div className="map-search-row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a street or place" aria-label="Search map" />
        {Ctor && <button type="button" className={"mic" + (listening ? " on" : "")} aria-label="Search by voice" onClick={listen}>🎙</button>}
      </div>
      {(busy || res.length > 0) && (
        <ul>
          {busy && !res.length && <li className="muted">Searching…</li>}
          {res.map((p) => (
            <li key={p.label + p.lat}>
              <button type="button" onClick={() => { tools.goTo(p); onPick?.(p); setRes([]); setQ(""); }}>{p.label}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Floating tool column, plus search and (in fullscreen) a pull-up trip sheet.
export function MapToolbar({ tools, areaId, area, demand, hasPois, onPick, sheet, traffic }: { tools: MapTools; areaId?: string; area?: string; demand?: boolean; hasPois?: boolean; onPick?: (p: Point) => void; sheet?: ReactNode; traffic?: boolean }) {
  const hubList = (area && hubs[area]) || [];
  const t = trafficNow();
  return (
    <>
      <div className="map-tools" role="toolbar" aria-label="Map tools">
        <Tool label={tools.full ? "Exit fullscreen" : "Fullscreen map"} on={tools.full} onClick={() => tools.setFull(!tools.full)}>{tools.full ? <IconArrowsMinimize size={18} /> : <IconArrowsMaximize size={18} />}</Tool>
        <Tool label="Centre on me" on={tools.locating} onClick={tools.locate}><IconCurrentLocation size={18} /></Tool>
        <Tool label={tools.ruler ? "Stop measuring" : "Measure distance"} on={tools.ruler} onClick={() => { tools.setRuler(!tools.ruler); tools.setRulerPts([]); }}><IconRuler2 size={18} /></Tool>
        {hubList.length > 0 && <Tool label="Airports & stations" on={tools.showHubs} onClick={() => tools.setShowHubs(!tools.showHubs)}><IconPlaneDeparture size={18} /></Tool>}
        {hasPois && <Tool label="Saved & recent places" on={tools.showSaved} onClick={() => tools.setShowSaved(!tools.showSaved)}><IconBookmark size={18} /></Tool>}
        {demand && <Tool label="Demand heatmap" on={tools.showDemand} onClick={() => tools.setShowDemand(!tools.showDemand)}><IconFlame size={18} /></Tool>}
      </div>
      <MapSearch areaId={areaId} tools={tools} onPick={onPick} />
      {tools.ruler && (
        <div className="map-hint" role="status">
          {tools.rulerPts.length === 2 ? "Tap the map to start a new measurement" : tools.rulerPts.length === 1 ? "Tap a second point" : "Tap two points to measure"}
        </div>
      )}
      {tools.error && <div className="map-hint bad" role="alert">{tools.error}</div>}
      {demand && tools.showDemand && <div className="map-legend"><i style={{ background: "#fbbf24" }} /> Low <i style={{ background: "#f59e0b" }} /> Busy <i style={{ background: "#dc2626" }} /> Hot · last 45 min</div>}
      {traffic && <div className="traffic-chip" style={{ borderColor: t.color }}><i style={{ background: t.color }} /> {t.label} traffic (typical)</div>}
      {tools.full && sheet && <div className="map-sheet">{sheet}</div>}
    </>
  );
}

// The busiest nearby cell worth driving to, or null when the driver is already in it or demand is thin.
export function hotZone(cells: Cell[], me: LatLng | null) {
  if (!me) return null;
  const best = cells.filter((c) => c.requests - (c.drivers ?? 0) >= 2).sort((a, b) => (b.requests - (b.drivers ?? 0)) / (1 + meters(me, b) / 2000) - (a.requests - (a.drivers ?? 0)) / (1 + meters(me, a) / 2000))[0];
  if (!best) return null;
  const distance = meters(me, best);
  return distance < 500 ? null : { ...best, distance };
}
