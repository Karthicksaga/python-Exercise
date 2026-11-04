import { useState } from "react";
import { api } from "@hop/shared/api";
import type { ScreenProps } from "../AdminApp";
import { day, daysUntil, num, rupee, useLoad } from "../lib";
import type { Finance, Operations } from "../types";
import { Badge, Empty, Field, NumberInput, Skeleton, Tabs, useNotify } from "../ui";

type Promo = Finance["promos"][number];

export default function Promos(_: ScreenProps) {
  const notify = useNotify();
  const fin = useLoad<Finance>("/api/operator/finance", notify);
  const ops = useLoad<Operations>("/api/operator", notify);
  if (!fin.data || !ops.data) return <Skeleton rows={6} />;
  const live = (p: Promo) => p.active && (p.valid_to == null || daysUntil(p.valid_to) >= 0);
  async function turnOff(p: Promo) {
    try {
      // Saving a promo replaces every field, so send its current settings with active off.
      await api("/api/operator/promos", {
        code: p.code, description: p.description, kind: p.kind, value: p.value, max_discount_paise: p.max_discount_paise ?? 0, min_fare_paise: p.min_fare_paise ?? 0,
        max_uses: p.max_uses ?? 0, per_user_limit: p.per_user_limit || 1, area_id: p.area_id ?? "", listed: p.listed, active: false,
        valid_days: Math.max(1, Math.min(730, p.valid_to ? daysUntil(p.valid_to) : 90)),
      });
      notify(`${p.code} turned off.`);
      void fin.reload();
    } catch (e) { notify((e as Error).message); }
  }
  return (
    <>
      <section className="card flush">
        {fin.data.promos.length ? (
          <div className="table-wrap">
            <table className="tbl responsive">
              <thead><tr><th>Code</th><th>Discount</th><th>Used</th><th>Valid until</th><th>Status</th><th className="actions" /></tr></thead>
              <tbody>
                {fin.data.promos.map((p) => (
                  <tr key={p.code}>
                    <td className="lead"><strong className="mono" style={{ fontSize: 13 }}>{p.code}</strong><small>{p.description}</small></td>
                    <td data-label="Discount">{p.kind === "percent" ? `${p.value}%` : `${rupee(p.value)} off`}</td>
                    <td data-label="Used">{num(p.redemptions)}{p.max_uses ? ` / ${num(p.max_uses)}` : ""}</td>
                    <td data-label="Valid until">{day(p.valid_to)}</td>
                    <td data-label="Status">{live(p) ? <Badge tone="ok">Active</Badge> : <Badge tone="plain">{p.active ? "Expired" : "Off"}</Badge>}</td>
                    <td className="actions">{p.active && <button type="button" className="btn sm ghost" onClick={() => void turnOff(p)}>Turn off</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No promo codes yet" icon="ticket" />}
      </section>
      <NewPromo areas={ops.data.areas} onSaved={() => void fin.reload()} />
    </>
  );
}

function NewPromo({ areas, onSaved }: { areas: Operations["areas"]; onSaved: () => void }) {
  const notify = useNotify();
  const blank = { code: "", description: "", value: 20 as number | null, maxDiscount: 7500 as number | null, minFare: 0 as number | null, area: "", perUser: 1 as number | null, maxUses: null as number | null, days: 30 as number | null, listed: true };
  const [kind, setKind] = useState<"percent" | "flat">("percent");
  const [f, setF] = useState(blank), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  async function create() {
    const code = f.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,20}$/.test(code)) return setErr("Use 3–20 letters or digits, no spaces.");
    const value = kind === "flat" ? Math.round((f.value ?? 0) * 100) : Math.round(f.value ?? 0);
    if (!(value > 0) || (kind === "percent" && value > 100)) return notify(kind === "percent" ? "Percent off must be 1 to 100." : "Enter the rupees off.");
    if (!(Number(f.perUser) >= 1)) return notify("Uses per rider must be at least 1.");
    if (!(Number(f.days) >= 1 && Number(f.days) <= 730)) return notify("Valid for must be 1 to 730 days.");
    setBusy(true);
    try {
      await api("/api/operator/promos", {
        code, description: f.description.trim() || code, kind, value, max_discount_paise: kind === "percent" ? Math.round((f.maxDiscount ?? 0) * 100) : 0,
        min_fare_paise: Math.round((f.minFare ?? 0) * 100), max_uses: f.maxUses ?? 0, per_user_limit: f.perUser, area_id: f.area, valid_days: f.days ?? 0, listed: f.listed, active: true,
      });
      notify(`${code} is live.`);
      setF(blank); onSaved();
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <section className="card stack">
      <h3>New promo code</h3>
      <div className="form-grid">
        <Field label="Code" error={err} hint="3–20 letters or digits"><input value={f.code} maxLength={20} style={{ textTransform: "uppercase" }} onChange={(e) => { setF({ ...f, code: e.target.value }); setErr(""); }} placeholder="e.g. MONSOON20" /></Field>
        <Field label="Description"><input value={f.description} maxLength={200} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Shown to riders" /></Field>
        <div className="field"><span>Type</span><Tabs value={kind} onChange={setKind} items={[["percent", "Percent"], ["flat", "Flat ₹"]]} /></div>
        <Field label={kind === "percent" ? "Percent off" : "Rupees off"}><NumberInput min={1} max={kind === "percent" ? 100 : undefined} value={f.value} onValue={(n) => setF({ ...f, value: n })} /></Field>
        {kind === "percent" && <Field label="Max discount" hint="0 = no cap"><NumberInput rupees min={0} value={f.maxDiscount} onValue={(n) => setF({ ...f, maxDiscount: n })} /></Field>}
        <Field label="Minimum fare"><NumberInput rupees min={0} value={f.minFare} onValue={(n) => setF({ ...f, minFare: n })} /></Field>
        <Field label="Area"><select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}><option value="">All areas</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Uses per rider"><NumberInput min={1} value={f.perUser} onValue={(n) => setF({ ...f, perUser: Math.round(n) })} /></Field>
        <Field label="Total uses" hint="Empty = no limit"><NumberInput min={0} value={f.maxUses} placeholder="No limit" onValue={(n) => setF({ ...f, maxUses: Math.round(n) })} /></Field>
        <Field label="Valid for (days)" hint="1 to 730 days"><NumberInput min={1} max={730} value={f.days} onValue={(n) => setF({ ...f, days: Math.round(n) })} /></Field>
      </div>
      <div className="spread" style={{ flexWrap: "wrap" }}>
        <label className="check"><input type="checkbox" checked={f.listed} onChange={(e) => setF({ ...f, listed: e.target.checked })} /><span>Show it on the rider's offers screen</span></label>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void create()}>Create promo</button>
      </div>
    </section>
  );
}
