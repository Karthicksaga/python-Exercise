import { useMemo, useState } from "react";
import { MapCanvas, MapFit, MapLine, MapMarker, MapRect } from "@hop/shared/mapkit";
import type { ScreenProps } from "../AdminApp";
import { ago, CATS, CAT_ORDER, rupee, useLoad } from "../lib";
import type { ActiveRide, LiveData, LiveDriver, SOSEvent } from "../types";
import { Badge, Chips, Empty, Icon, RideBadge, Switch, useNotify } from "../ui";

type Sel = { kind: "ride"; id: string } | { kind: "cap"; id: string } | null;
const capState = (d: LiveDriver, busy: Set<string>) => (!d.online ? "offline" : busy.has(d.user_id) ? "on_trip" : "available");

export default function Dispatch({ go }: ScreenProps) {
  const notify = useNotify();
  const [auto, setAuto] = useState(true);
  const { data, reload } = useLoad<LiveData>("/api/operator/live-map", notify, auto ? 6000 : 0);
  const { data: sosData } = useLoad<{ sos_events: SOSEvent[] }>("/api/operator/sos", notify, 15000);
  const [cat, setCat] = useState("all");
  const [onlineOnly, setOnlineOnly] = useState(true);
  const [sel, setSel] = useState<Sel>(null);
  const [updated, setUpdated] = useState(0);

  const busy = useMemo(() => new Set((data?.active_rides ?? []).map((r) => r.driver_id).filter(Boolean) as string[]), [data]);
  const drivers = (data?.drivers ?? []).filter((d) => (cat === "all" || d.vehicle_category === cat) && (!onlineOnly || d.online));
  const rides = (data?.active_rides ?? []).filter((r) => cat === "all" || r.vehicle_category === cat);
  const sos = (sosData?.sos_events ?? []).filter((s) => s.incident_status !== "closed");
  const counts = Object.fromEntries(CAT_ORDER.map((c) => [c, (data?.drivers ?? []).filter((d) => d.vehicle_category === c && (!onlineOnly || d.online)).length]));
  const live = (data?.areas ?? []).filter((a) => a.active);
  // Start on the busiest live zone; fall back to Chennai.
  const start = useMemo(() => {
    const a = live[0];
    return a ? { lat: (a.min_lat + a.max_lat) / 2, lng: (a.min_lng + a.max_lng) / 2 } : { lat: 13.0827, lng: 80.2707 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(data)]);
  const ride = sel?.kind === "ride" ? data?.active_rides.find((r) => r.id === sel.id) : undefined;
  const cap = sel?.kind === "cap" ? data?.drivers.find((d) => d.user_id === sel.id) : undefined;
  const fit = ride ? [{ lat: ride.pickup_lat, lng: ride.pickup_lng }, { lat: ride.dropoff_lat, lng: ride.dropoff_lng }] : cap ? [{ lat: cap.lat, lng: cap.lng }] : [];

  return (
    <>
      <div className="spread" style={{ flexWrap: "wrap" }}>
        <Chips label="Vehicle type" value={cat} onChange={(v) => { setCat(v); setSel(null); }} items={[["all", "All"], ...CAT_ORDER.map((c) => [c, CATS[c], counts[c]] as [string, string, number])]} />
        <div className="row">
          <Switch checked={onlineOnly} onChange={setOnlineOnly} label="Online captains only" />
          <Switch checked={auto} onChange={setAuto} label="Auto-refresh" />
          {!auto && <button type="button" className="btn sm secondary" onClick={() => { void reload(); setUpdated(Date.now()); }}><Icon name="refresh" size={14} />Refresh</button>}
        </div>
      </div>
      <section className="grid g-main">
        <div className="card flush">
          <div className="map-box dispatch-map" style={{ border: 0, borderRadius: 0 }}>
            <MapCanvas center={start} zoom={12}>
              {fit.length > 0 && <MapFit points={fit} padding={80} extra={sel ? sel.kind + sel.id : ""} />}
              {live.map((a) => <MapRect key={a.id} bounds={a} color="#0f7a4f" fillOpacity={0.03} weight={1.5} dashed />)}
              {rides.map((r) => <RideLayer key={r.id} ride={r} dim={Boolean(sel) && !(sel?.kind === "ride" && sel.id === r.id)} onSelect={() => setSel({ kind: "ride", id: r.id })} />)}
              {drivers.map((d) => {
                const st = capState(d, busy);
                return (
                  <MapMarker key={d.user_id} position={{ lat: d.lat, lng: d.lng }} anchor="center" title={`${d.name} · ${CATS[d.vehicle_category] ?? d.vehicle_category} · ${st.replace("_", " ")}`} zIndex={st === "on_trip" ? 3 : 2}>
                    <span role="button" tabIndex={0} aria-label={`Captain ${d.name}`} className={`dot-marker ${st} ${sel?.kind === "cap" && sel.id === d.user_id ? "sel" : ""}`} onClick={() => setSel({ kind: "cap", id: d.user_id })} onKeyDown={(e) => e.key === "Enter" && setSel({ kind: "cap", id: d.user_id })} />
                  </MapMarker>
                );
              })}
              {sos.map((s) => (
                <MapMarker key={s.id} position={{ lat: s.lat, lng: s.lng }} anchor="center" title={`SOS from ${s.rider_name}`} zIndex={10}>
                  <span role="button" tabIndex={0} aria-label={`SOS from ${s.rider_name}`} className="sos-marker" onClick={() => go("safety")} onKeyDown={(e) => e.key === "Enter" && go("safety")}>!</span>
                </MapMarker>
              ))}
            </MapCanvas>
            {(ride || cap) && (
              <div className="map-card">
                <div className="spread"><strong>{ride ? `${ride.rider_name} → ${ride.dropoff_label}` : cap!.name}</strong><button type="button" className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setSel(null)} aria-label="Close"><Icon name="x" size={16} /></button></div>
                {ride && <>
                  <RideBadge status={ride.status} />
                  <dl className="kv"><dt>Captain</dt><dd>{ride.driver_name || "Not assigned yet"}</dd><dt>Vehicle</dt><dd>{CATS[ride.vehicle_category]}{ride.vehicle_number && ` · ${ride.vehicle_number}`}</dd><dt>Fare</dt><dd>{rupee(ride.fare_paise)} · {ride.payment_method.toUpperCase()}</dd><dt>Requested</dt><dd>{ago(ride.created_at)}</dd></dl>
                  <a className="btn sm secondary" href={`#rides/${ride.id}`}>Open ride</a>
                </>}
                {cap && <>
                  {(() => { const st = capState(cap, busy); return <Badge tone={st === "available" ? "ok" : st === "on_trip" ? "info" : "plain"}>{st === "on_trip" ? "On a trip" : st === "available" ? "Available" : "Offline"}</Badge>; })()}
                  <dl className="kv"><dt>Vehicle</dt><dd>{CATS[cap.vehicle_category]} · {cap.vehicle_number}</dd><dt>Location</dt><dd>{cap.lat.toFixed(4)}, {cap.lng.toFixed(4)}</dd><dt>Last ping</dt><dd>{ago(cap.location_at)}</dd></dl>
                </>}
              </div>
            )}
            <div className="map-legend" style={{ zIndex: 500 }}><span><i style={{ background: "var(--success)" }} />Available</span><span><i style={{ background: "var(--primary)" }} />On trip</span>{!onlineOnly && <span><i style={{ background: "var(--muted)" }} />Offline</span>}<span><i style={{ background: "var(--danger)" }} />SOS</span></div>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Active rides</h3><span className="live-pill">{auto ? "Live" : updated ? `Updated ${ago(new Date(updated).toISOString())}` : "Paused"}</span></div>
          {!data ? <p className="muted">Loading…</p> : rides.length ? (
            <div className="list">
              {rides.map((r) => (
                <button type="button" key={r.id} className="li attn" onClick={() => setSel({ kind: "ride", id: r.id })} style={sel?.kind === "ride" && sel.id === r.id ? { background: "var(--primary-soft)" } : undefined}>
                  <span className="li-main"><strong>{r.pickup_label} → {r.dropoff_label}</strong><small>{r.rider_name} · {r.driver_name ? `captain ${r.driver_name}` : "no captain yet"} · {CATS[r.vehicle_category]}</small></span>
                  <RideBadge status={r.status} />
                </button>
              ))}
            </div>
          ) : <Empty title="No active rides" icon="route">{cat === "all" ? "Nothing in progress right now." : "None for this vehicle type."}</Empty>}
        </div>
      </section>
    </>
  );
}

function RideLayer({ ride, dim, onSelect }: { ride: ActiveRide; dim: boolean; onSelect: () => void }) {
  const p = { lat: ride.pickup_lat, lng: ride.pickup_lng }, d = { lat: ride.dropoff_lat, lng: ride.dropoff_lng };
  const path = useMemo(() => [p, d], [p.lat, p.lng, d.lat, d.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <MapLine path={path} color="#4b3fd1" weight={4} opacity={dim ? 0.35 : 0.95} />
      <MapMarker position={p} anchor="center" title={`Pickup: ${ride.pickup_label}`}><span className="pin-pick" onClick={onSelect} /></MapMarker>
      <MapMarker position={d} anchor="center" title={`Drop-off: ${ride.dropoff_label}`}><span className="pin-drop" onClick={onSelect} /></MapMarker>
    </>
  );
}
