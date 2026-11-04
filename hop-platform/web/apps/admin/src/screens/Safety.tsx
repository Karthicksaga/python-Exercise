import { useState } from "react";
import { api } from "@hop/shared/api";
import { MapCanvas, MapMarker } from "@hop/shared/mapkit";
import type { ScreenProps } from "../AdminApp";
import { ago, cap, clock, useLoad, when } from "../lib";
import type { Incident, Operations, SOSEvent } from "../types";
import { Badge, Empty, Field, Icon, Modal, Note, RideBadge, Skeleton, Tabs, useNotify } from "../ui";

export default function Safety({ sub, refreshSummary }: ScreenProps) {
  const notify = useNotify();
  const [tab, setTab] = useState<"sos" | "incidents">(sub === "incidents" ? "incidents" : "sos");
  const sos = useLoad<{ sos_events: SOSEvent[] }>("/api/operator/sos", notify, 10000);
  const ops = useLoad<Operations>("/api/operator", notify);
  const [resolving, setResolving] = useState<SOSEvent | null>(null);
  const events = sos.data?.sos_events ?? [];
  const open = events.filter((s) => s.incident_status !== "closed"), closed = events.filter((s) => s.incident_status === "closed");
  const incidents = ops.data?.incidents ?? [];
  const openIncidents = incidents.filter((i) => i.status !== "closed").length;

  return (
    <>
      <Tabs value={tab} onChange={(t) => { setTab(t); history.replaceState(null, "", `#safety${t === "incidents" ? "/incidents" : ""}`); }}
        items={[["sos", "SOS alerts", open.length, true], ["incidents", "Incident reports", openIncidents]]} />
      {tab === "sos" ? (
        !sos.data ? <Skeleton /> : <>
          {open.length ? open.map((s) => <SOSCard key={s.id} s={s} onResolve={() => setResolving(s)} />) : <div className="card"><Empty title="No active SOS alerts">New alerts appear here within 10 seconds and in the top bar.</Empty></div>}
          <section className="card">
            <div className="card-head"><h3>Resolved</h3></div>
            {closed.length ? <div className="list">{closed.map((s) => (
              <div key={s.id} className="li"><span className="li-icon ok"><Icon name="check" /></span><span className="li-main"><strong>{s.rider_name} · {s.pickup_label} → {s.dropoff_label}</strong><small>{when(s.created_at)} · {s.resolution || "Closed"}</small></span></div>
            ))}</div> : <p className="muted">None yet.</p>}
          </section>
        </>
      ) : !ops.data ? <Skeleton /> : incidents.length ? (
        <section className="grid g-2">{incidents.map((i) => <IncidentCard key={i.id} i={i} onSaved={() => { void ops.reload(); refreshSummary(); }} />)}</section>
      ) : <div className="card"><Empty title="No incident reports" /></div>}
      {resolving && <ResolveModal s={resolving} onClose={() => setResolving(null)} onDone={() => { setResolving(null); void sos.reload(); refreshSummary(); }} />}
    </>
  );
}

function SOSCard({ s, onResolve }: { s: SOSEvent; onResolve: () => void }) {
  return (
    <div className="card stack" style={{ borderColor: "var(--danger)", boxShadow: "0 0 0 3px var(--danger-soft)" }}>
      <div className="row">
        <span className="li-icon bad"><Icon name="alert" /></span>
        <div className="li-main"><h2>SOS from {s.rider_name}</h2><small>Raised {ago(s.created_at)} at {clock(s.created_at)}</small></div>
        <RideBadge status={s.ride_status} />
        <button type="button" className="btn danger" onClick={onResolve}>Resolve</button>
      </div>
      <div className="grid g-2" style={{ gap: 14, alignItems: "start" }}>
        <div className="map-box" style={{ height: 220 }}>
          <MapCanvas center={{ lat: s.lat, lng: s.lng }} zoom={15}>
            <MapMarker position={{ lat: s.lat, lng: s.lng }} anchor="center" title="SOS location"><span className="sos-marker">!</span></MapMarker>
          </MapCanvas>
        </div>
        <dl className="kv">
          <dt>Rider</dt><dd>{s.rider_name} · {s.rider_email}</dd>
          <dt>Captain</dt><dd>{s.driver_name || "Not assigned"}{s.vehicle_number && <> · <span className="mono">{s.vehicle_number}</span></>}</dd>
          <dt>Trip</dt><dd>{s.pickup_label} → {s.dropoff_label}</dd>
          <dt>Location</dt><dd className="mono">{Number(s.lat).toFixed(5)}, {Number(s.lng).toFixed(5)}</dd>
          <dt>Ride</dt><dd><a href={`#rides/${s.ride_id}`}>{s.ride_id.slice(0, 8)}</a></dd>
        </dl>
      </div>
      <Note tone="bad" icon="phone"><b>Call the rider first,</b> then the captain. If you can't reach the rider, call 112 with the location above, and note what you did when you resolve.</Note>
    </div>
  );
}

function ResolveModal({ s, onClose, onDone }: { s: SOSEvent; onClose: () => void; onDone: () => void }) {
  const notify = useNotify();
  const [text, setText] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  async function submit() {
    if (text.trim().length < 5) return setErr("Write at least 5 characters about what you did.");
    setBusy(true);
    try {
      await api(`/api/operator/sos/${s.id}/resolve`, { resolution: text.trim(), status: "closed" });
      notify("SOS resolved and recorded.");
      onDone();
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal title={`Resolve SOS from ${s.rider_name}`} onClose={onClose} footer={<><button type="button" className="btn ghost" onClick={onClose}>Not yet</button><button type="button" className="btn danger" disabled={busy} onClick={() => void submit()}>Resolve SOS</button></>}>
      <p className="muted">Record what happened and what you did. This closes the alert for every operator.</p>
      <Field label="Action taken" error={err}><textarea value={text} onChange={(e) => { setText(e.target.value); setErr(""); }} placeholder="e.g. Called rider at 10:31, confirmed safe. Captain had stopped for fuel." /></Field>
    </Modal>
  );
}

function IncidentCard({ i, onSaved }: { i: Incident; onSaved: () => void }) {
  const notify = useNotify();
  const [status, setStatus] = useState(i.status === "closed" ? "closed" : "reviewing"), [text, setText] = useState(i.resolution || "");
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  async function save() {
    if (text.trim().length < 5) return setErr("Write at least 5 characters.");
    setBusy(true);
    try {
      await api(`/api/operator/incidents/${i.id}`, { status, resolution: text.trim() });
      notify("Response saved and sent to the reporter.");
      onSaved();
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="card stack">
      <div className="spread"><Badge tone={i.status === "open" ? "warn" : i.status === "closed" ? "ok" : "info"}>{cap(i.status)}</Badge><span className="small muted">{ago(i.created_at)}</span></div>
      <p style={{ fontSize: 15, fontWeight: 600 }}>“{i.message}”</p>
      <span className="small muted">Ride <a href={`#rides/${i.ride_id}`}>{i.ride_id.slice(0, 8)}</a></span>
      <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="reviewing">Reviewing</option><option value="closed">Closed</option></select></Field>
      <Field label="Response to the reporter" error={err}><textarea value={text} maxLength={2000} onChange={(e) => { setText(e.target.value); setErr(""); }} placeholder="What you found and what happens next" /></Field>
      <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>Save response</button></div>
    </div>
  );
}
