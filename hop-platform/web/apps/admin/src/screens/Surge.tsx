import { useState } from "react";
import { api } from "@hop/shared/api";
import type { ScreenProps } from "../AdminApp";
import { CATS, clock, DAYS, useLoad } from "../lib";
import type { Finance, Operations } from "../types";
import { Badge, Field, Icon, NumberInput, Skeleton, Switch, useNotify } from "../ui";

export default function Surge(_: ScreenProps) {
  const notify = useNotify();
  const fin = useLoad<Finance>("/api/operator/finance", notify);
  const ops = useLoad<Operations>("/api/operator", notify);
  if (!fin.data || !ops.data) return <Skeleton rows={6} />;
  const f = fin.data, areas = ops.data.areas;
  async function post(path: string, body: unknown, ok: string) {
    try { await api(path, body); notify(ok); await fin.reload(); return true; } catch (e) { notify((e as Error).message); return false; }
  }
  return (
    <>
      <section className="grid g-2">
        <div className="card stack">
          <div className="card-head" style={{ margin: 0 }}><h3>Live overrides</h3>{f.surges.length > 0 && <Badge tone="warn">{f.surges.length} running</Badge>}</div>
          {f.surges.length ? <div className="list">{f.surges.map((s) => (
            <div key={s.id} className="li"><span className="li-icon warn"><Icon name="bolt" /></span>
              <span className="li-main"><strong>{s.area} · {s.multiplier}× · {s.category ? CATS[s.category] : "all vehicles"}</strong><small>{s.reason} · ends {clock(s.ends_at)}</small></span>
              <button type="button" className="btn sm secondary" onClick={() => void post(`/api/operator/surge/${s.id}/delete`, {}, "Override ended. Prices are back to normal.")}>End now</button></div>
          ))}</div> : <p className="muted">No overrides running.</p>}
          <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "4px 0", width: "100%" }} />
          <StartOverride areas={f.area_surge} live={areas.filter((a) => a.active).map((a) => a.id)} post={post} />
        </div>
        <div className="card stack">
          <h3>Area limits</h3>
          <p className="small muted">The cap is the highest multiplier riders can ever see in that area. Demand surge raises prices automatically when captains are short.</p>
          <div className="list">{f.area_surge.map((a) => <AreaLimit key={a.id} a={a} post={post} />)}</div>
        </div>
      </section>
      <PeakHours f={f} areas={areas} post={post} />
    </>
  );
}

type Post = (path: string, body: unknown, ok: string) => Promise<boolean>;

function StartOverride({ areas, live, post }: { areas: Finance["area_surge"]; live: string[]; post: Post }) {
  const options = areas.filter((a) => live.includes(a.id));
  const [area, setArea] = useState(options[0]?.id ?? ""), [mult, setMult] = useState<number | null>(1.5), [mins, setMins] = useState("60"), [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const capOf = options.find((a) => a.id === area)?.surge_cap ?? 3;
  async function start() {
    if (!area) return setErr("No area is taking bookings.");
    if (reason.trim().length < 3) return setErr("Give a reason (3+ characters). Riders see it.");
    if (!(mult != null && mult >= 1 && mult <= capOf)) return setErr(`Multiplier must be between 1 and this area's cap of ${capOf}×.`);
    setErr("");
    if (await post("/api/operator/surge", { area_id: area, multiplier: mult, reason: reason.trim(), minutes: Number(mins) }, `${mult}× override running.`)) setReason("");
  }
  return (
    <>
      <strong>Start an override</strong>
      <div className="form-grid" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
        <Field label="Area"><select value={area} onChange={(e) => setArea(e.target.value)}>{options.map((a) => <option key={a.id} value={a.id}>{a.name} (cap {a.surge_cap}×)</option>)}</select></Field>
        <Field label="Multiplier"><NumberInput min={1} max={3} step={0.05} value={mult} onValue={setMult} /></Field>
        <Field label="Duration"><select value={mins} onChange={(e) => setMins(e.target.value)}>{[["30", "30 minutes"], ["60", "1 hour"], ["120", "2 hours"], ["240", "4 hours"], ["480", "8 hours"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Reason" error={err}><input value={reason} maxLength={120} onChange={(e) => { setReason(e.target.value); setErr(""); }} placeholder="e.g. Heavy rain" /></Field>
      </div>
      <button type="button" className="btn primary" onClick={() => void start()}>Start override</button>
    </>
  );
}

function AreaLimit({ a, post }: { a: Finance["area_surge"][number]; post: Post }) {
  const [capV, setCap] = useState<number | null>(a.surge_cap), [auto, setAuto] = useState(a.surge_auto);
  const changed = capV !== a.surge_cap || auto !== a.surge_auto;
  return (
    <div className="li" style={{ flexWrap: "wrap" }}>
      <span className="li-main"><strong>{a.name}</strong></span>
      <Field label={<span className="sr">Surge cap for {a.name}</span>}><span className="row" style={{ gap: 6, flexWrap: "nowrap" }}><NumberInput min={1} max={3} step={0.1} value={capV} onValue={setCap} style={{ width: 80 }} /><span className="small muted">× cap</span></span></Field>
      <Switch checked={auto} onChange={setAuto} label="Demand surge" />
      <button type="button" className="btn sm secondary" disabled={!changed || capV == null || capV < 1 || capV > 3} onClick={() => void post(`/api/operator/areas/${a.id}/surge`, { surge_cap: capV, surge_auto: auto }, `${a.name} surge limits saved.`)}>Save</button>
    </div>
  );
}

function PeakHours({ f, areas, post }: { f: Finance; areas: Operations["areas"]; post: Post }) {
  const [area, setArea] = useState(areas[0]?.id ?? ""), [label, setLabel] = useState(""), [start, setStart] = useState("08:00"), [end, setEnd] = useState("10:30");
  const [mult, setMult] = useState<number | null>(1.3), [days, setDays] = useState([1, 2, 3, 4, 5]), [err, setErr] = useState("");
  async function add() {
    if (!label.trim()) return setErr("Add a label.");
    if (!days.length) return setErr("Pick at least one day.");
    if (!(mult != null && mult >= 1.05 && mult <= 3)) return setErr("Multiplier must be between 1.05 and 3.");
    setErr("");
    if (await post("/api/operator/peak-windows", { area_id: area, label: label.trim(), days, start_time: start, end_time: end, multiplier: mult }, "Peak hours added.")) setLabel("");
  }
  return (
    <section className="card stack">
      <div className="card-head" style={{ margin: 0 }}><h3>Peak hours</h3><p>Planned multipliers that repeat every week.</p></div>
      {f.peak_windows.length ? <div className="list">{f.peak_windows.map((p) => (
        <div key={p.id} className="li"><span className="li-icon info"><Icon name="clock" /></span>
          <span className="li-main"><strong>{p.label} · {p.multiplier}×</strong><small>{p.area} · {p.days.map((d) => DAYS[d - 1]).join(", ")} · {p.start_time}–{p.end_time}</small></span>
          <button type="button" className="btn sm ghost" onClick={() => void post(`/api/operator/peak-windows/${p.id}/delete`, {}, "Peak hours removed.")}>Remove</button></div>
      ))}</div> : <p className="muted">No peak hours set.</p>}
      <div className="form-grid">
        <Field label="Area"><select value={area} onChange={(e) => setArea(e.target.value)}>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Label" error={err}><input value={label} maxLength={60} onChange={(e) => { setLabel(e.target.value); setErr(""); }} placeholder="e.g. School run" /></Field>
        <Field label="Starts"><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Ends"><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label="Multiplier"><NumberInput min={1.05} max={3} step={0.05} value={mult} onValue={setMult} /></Field>
      </div>
      <div className="spread" style={{ flexWrap: "wrap" }}>
        <div className="chips" role="group" aria-label="Days">{DAYS.map((n, i) => <button type="button" key={n} className="chip" aria-pressed={days.includes(i + 1)} onClick={() => setDays((d) => (d.includes(i + 1) ? d.filter((x) => x !== i + 1) : [...d, i + 1].sort()))}>{n}</button>)}</div>
        <button type="button" className="btn primary" onClick={() => void add()}>Add peak hours</button>
      </div>
    </section>
  );
}
