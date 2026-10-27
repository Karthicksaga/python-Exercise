import { useEffect, useMemo, useRef, useState } from "react";
import { MapCanvas, MapFit, MapFollow, MapLine, MapMarker } from "./mapkit";
import { api } from "./api";
import type { Ride } from "./types";
import RealisticVehicleMarker from "./RealisticVehicleMarker";

type LL = { lat: number; lng: number };
type Step = { instruction: string; maneuver: string; meters: number; lat: number; lng: number };
type Nav = {
  phase: "pickup" | "destination";
  driver: LL;
  target: LL;
  route: LL[];
  steps: Step[];
  meters: number;
  seconds: number;
};

const arrows: Record<string, string> = { left: "↰", right: "↱", straight: "↑", uturn: "↶", arrive: "⚑" };

function metres(a: LL, b: LL) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, h)));
}
function bearing(a: LL, b: LL) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);

// Moves the marker smoothly between the 4s location samples.
export function useGlide(target?: LL) {
  const [pos, setPos] = useState<LL | undefined>(target);
  const current = useRef<LL | undefined>(target);
  useEffect(() => {
    if (!target) return;
    const from = current.current ?? target;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 1000);
      const next = { lat: from.lat + (target.lat - from.lat) * t, lng: from.lng + (target.lng - from.lng) * t };
      current.current = next;
      setPos(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target?.lat, target?.lng]);
  return pos;
}

const spoken = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} kilometres` : `${Math.max(10, Math.round(m / 10) * 10)} metres`);

// Speaks each manoeuvre once when it is ~250 m away and again right before it.
function useVoice(on: boolean, next?: { instruction: string; maneuver: string; away: number }) {
  const said = useRef("");
  useEffect(() => {
    if (!on || !next || !("speechSynthesis" in window)) return;
    const tag = next.instruction + "|" + next.maneuver;
    const stage = next.away <= 45 ? "now" : next.away <= 250 ? "soon" : "";
    if (!stage || said.current === tag + stage) return;
    said.current = tag + stage;
    const text = next.maneuver === "arrive" || stage === "now" ? next.instruction : `In ${spoken(next.away)}, ${next.instruction}`;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = document.documentElement.lang || "en-IN";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [on, next?.instruction, next?.maneuver, next && Math.floor(next.away / 10)]);
  useEffect(() => () => void window.speechSynthesis?.cancel(), []);
}

export default function LiveNavMap({ ride }: { ride: Ride }) {
  const [nav, setNav] = useState<Nav | null>(null);
  const [error, setError] = useState("");
  const [follow, setFollow] = useState(true);
  const [heading, setHeading] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [voice, setVoice] = useState(() => localStorage.getItem("hop.voice") === "1");
  const [fullscreen, setFullscreen] = useState(false);
  const sampled = useRef<{ p: LL; t: number } | undefined>(undefined);
  const [trail, setTrail] = useState<LL[]>([]);
  const last = useRef<LL | undefined>(undefined);
  const status = ride.status;

  const [pos, setPos] = useState<LL | undefined>();
  const [stale, setStale] = useState(false);
  useEffect(() => {
    let live = true;
    setTrail([]);
    last.current = undefined;
    const load = () =>
      api<Nav>(`/api/rides/${ride.id}/nav`)
        .then((n) => {
          if (!live) return;
          setNav(n);
          setError("");
        })
        .catch((e: Error) => live && setError(e.message));
    // The car position is polled every second; the route and turn list are recalculated every 3 seconds.
    const track = () =>
      api<{ lat: number; lng: number; speed?: number; heading?: number; stale?: boolean }>(
        `/api/rides/${ride.id}/position`
      )
        .then((p) => {
          if (!live) return;
          const here = { lat: p.lat, lng: p.lng };
          const prev = last.current;
          const now = performance.now();
          if (p.speed != null && p.speed >= 0) {
            setSpeed(Math.round(p.speed));
          } else if (sampled.current && now - sampled.current.t > 700) {
            const kmh = (metres(sampled.current.p, here) / ((now - sampled.current.t) / 1000)) * 3.6;
            setSpeed((v) => Math.round(v * 0.6 + Math.min(kmh, 140) * 0.4));
          }
          if (!sampled.current || now - sampled.current.t > 700) sampled.current = { p: here, t: now };
          if (p.heading != null && p.heading >= 0) {
            setHeading(Math.round(p.heading));
          } else if (prev && metres(prev, here) > 2) {
            setHeading((h) => h + ((((bearing(prev, here) - h) % 360) + 540) % 360) - 180);
          }
          if (prev && metres(prev, here) > 2) {
            setTrail((t) => [...t.slice(-400), here]);
          }
          if (!prev || metres(prev, here) > 2) last.current = here;
          setStale(Boolean(p.stale));
          setPos(here);
        })
        .catch(() => {});
    void load();
    void track();
    const routeTimer = setInterval(load, 3000);
    const posTimer = setInterval(track, 1000);
    return () => {
      live = false;
      clearInterval(routeTimer);
      clearInterval(posTimer);
    };
  }, [ride.id, status]);

  const car = useGlide(pos ?? nav?.driver);
  const next = useMemo(() => {
    if (!nav || !nav.steps || nav.steps.length === 0) return undefined;
    const currentPos = pos ?? nav.driver;
    let upcomingIndex = 0;
    for (let i = 0; i < nav.steps.length; i++) {
      const d = metres(currentPos, nav.steps[i]);
      if (d > 20) {
        upcomingIndex = i;
        break;
      }
      if (i === nav.steps.length - 1) {
        upcomingIndex = i;
      }
    }
    const step = nav.steps[upcomingIndex] ?? nav.steps[nav.steps.length - 1];
    return step ? { ...step, away: metres(currentPos, step) } : undefined;
  }, [nav, pos?.lat, pos?.lng]);

  // Auto-expand to full screen cockpit mode once the ride starts driving (in_progress)
  useEffect(() => {
    if (status === "in_progress" && ride.driving) {
      setFullscreen(true);
    }
  }, [status, ride.driving]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fullscreen) {
        setFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  useVoice(voice, next);
  if (!nav) {
    return (
      <section className={"live-nav" + (fullscreen ? " live-nav-fullscreen" : "")} aria-label="Live navigation">
        <div className="nav-wait">{error || "Starting live navigation…"}</div>
      </section>
    );
  }
  const goal = nav.phase === "pickup" ? "pickup" : "destination";
  const eta = new Date(Date.now() + nav.seconds * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <section className={"live-nav" + (fullscreen ? " live-nav-fullscreen" : "")} aria-label="Live navigation">
      {stale && (
        <div className="nav-stale-banner" role="status" style={{ background: "#fef3c7", color: "#92400e", padding: "6px 12px", fontSize: "12px", fontWeight: 600, textAlign: "center", borderBottom: "1px solid #fde68a" }}>
          <span>📡 Captain connection weak · Showing last known location</span>
        </div>
      )}
      <div className="nav-banner">
        <span className="nav-arrow" key={next?.instruction}>{arrows[next?.maneuver ?? "straight"]}</span>
        <div>
          <strong>{next ? `${next.maneuver === "arrive" ? "" : "In " + dist(next.away) + " · "}${next.instruction}` : "Follow the route"}</strong>
          <small>{ride.driving ? `Heading to ${goal}` : nav.phase === "pickup" ? "Your driver is heading to you" : "Heading to your destination"}</small>
        </div>
        <button
          type="button"
          className="fullscreen-toggle-btn"
          title={fullscreen ? "Exit full screen cockpit" : "Full screen cockpit view"}
          onClick={() => setFullscreen((f) => !f)}
          style={{
            marginLeft: "auto",
            background: "rgba(255,255,255,0.2)",
            border: "1px solid rgba(255,255,255,0.4)",
            color: "#fff",
            borderRadius: "10px",
            padding: "6px 12px",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "4px"
          }}
        >
          {fullscreen ? "✕ Exit" : "⛶ Fullscreen"}
        </button>
      </div>
      <div className="live-nav-map">
        <MapCanvas center={pos ?? nav.driver} zoom={16} onUserDrag={() => setFollow(false)}>
          {follow && car ? <MapFollow center={car} /> : <MapFit points={[...nav.route, ...(car ? [car] : [])]} padding={60} extra={`${nav.phase}|${follow}|${nav.route.length}`} />}
          <MapLine path={trail} color="#94a3b8" weight={6} opacity={0.9} />
          <MapLine path={nav.route} color="#ffffff" weight={12} />
          <MapLine path={nav.route} color="#2563eb" weight={7} />
          <MapMarker position={nav.target} title={goal}>
            <span className="pin-tag drop-tag">{nav.phase === "pickup" ? "Pickup" : "Drop"}</span>
            <span className={"map-pin " + (nav.phase === "pickup" ? "pickup-pin" : "destination-pin")} />
          </MapMarker>
          {car && (
            <MapMarker position={car} title="Driver" zIndex={1000} anchor="center">
              <div className="nav-car-realistic">
                <RealisticVehicleMarker
                  category={ride.vehicle_category}
                  heading={heading}
                  size={52}
                  showShadow
                />
              </div>
            </MapMarker>
          )}
        </MapCanvas>
        <div className="nav-tools">
          <button
            type="button"
            title={fullscreen ? "Exit full screen" : "Full screen"}
            onClick={() => setFullscreen((f) => !f)}
          >
            {fullscreen ? "✕" : "⛶"}
          </button>
          <button
            type="button"
            aria-pressed={voice}
            title={voice ? "Mute voice guidance" : "Turn on voice guidance"}
            onClick={() => {
              setVoice((v) => {
                localStorage.setItem("hop.voice", v ? "0" : "1");
                if (v) window.speechSynthesis?.cancel();
                return !v;
              });
            }}
          >
            {voice ? "🔊" : "🔇"}
          </button>
          <a
            className="button"
            title="Open in Google Maps"
            target="_blank"
            rel="noopener noreferrer"
            href={`https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${nav.target.lat},${nav.target.lng}`}
          >
            ↗
          </a>
        </div>
        <div className="speedo" aria-label="Current speed">
          <strong>{speed}</strong>
          <small>km/h</small>
        </div>
        {!follow && (
          <button type="button" className="recenter" onClick={() => setFollow(true)}>
            ◎ Re-center
          </button>
        )}
        <span className="live-chip"><i /> LIVE</span>
      </div>
      <div className="nav-foot">
        <div><small>Remaining</small><strong>{dist(nav.meters)}</strong></div>
        <div><small>Time</small><strong>{Math.max(1, Math.round(nav.seconds / 60))} min</strong></div>
        <div><small>Arrive</small><strong>{eta}</strong></div>
        <div style={{ display: "flex", gap: "6px" }}>
          <button type="button" className="secondary" onClick={() => setFollow((f) => !f)}>
            {follow ? "Overview" : "Follow"}
          </button>
          <button
            type="button"
            className="secondary"
            title={fullscreen ? "Exit full screen mode" : "Full screen mode"}
            onClick={() => setFullscreen((f) => !f)}
          >
            {fullscreen ? "✕" : "⛶"}
          </button>
        </div>
      </div>
    </section>
  );
}
