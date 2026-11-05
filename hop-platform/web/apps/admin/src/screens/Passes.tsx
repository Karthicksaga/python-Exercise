import { useState } from "react";
import { api } from "@hop/shared/api";
import type { ScreenProps } from "../AdminApp";
import { CATS, day, num, rupee, useLoad, when } from "../lib";
import type { PassData } from "../types";
import { Badge, Empty, Field, Note, NumberInput, Skeleton, Switch, useNotify } from "../ui";

// Captain monthly pass: prices per vehicle type, which zones need a pass, and passes added by hand.
export default function Passes(_: ScreenProps) {
  const notify = useNotify();
  const view = useLoad<PassData>("/api/operator/passes", notify);
  const d = view.data;
  if (!d) return <Skeleton rows={6} />;
  const reload = () => void view.reload();
  return (
    <>
      <div className="grid g-kpi">
        <div className="card kpi"><span className="eyebrow">Pass revenue this month</span><strong>{rupee(d.revenue_month_paise)}</strong><small>Paid from earnings plus cash collected by Hop</small></div>
        <div className="card kpi"><span className="eyebrow">Captains with a pass</span><strong>{num(d.active_passes)}</strong><small>Captains can renew in the last {d.renew_days} days</small></div>
      </div>
      <Zones areas={d.areas} onSaved={reload} />
      <Prices prices={d.prices} onSaved={reload} />
      <Grant captains={d.captains} onSaved={reload} />
      <section className="card flush">
        <div className="card-head"><h3>Recent passes</h3></div>
        {d.passes.length ? (
          <div className="table-wrap">
            <table className="tbl responsive">
              <thead><tr><th>Captain</th><th>Period</th><th>How</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {d.passes.map((p) => (
                  <tr key={p.id}>
                    <td className="lead"><strong>{p.captain_name}</strong><small>{p.vehicle_number} · {CATS[p.category] ?? p.category}</small></td>
                    <td data-label="Period">{day(p.starts_at)} – {day(p.ends_at)}</td>
                    <td data-label="How">{p.source === "operator" ? <>Added by Hop{p.note && <small style={{ display: "block" }}>{p.note}</small>}</> : "Paid from earnings"}</td>
                    <td data-label="Amount">{rupee(p.price_paise)}</td>
                    <td data-label="Status">{p.current ? <Badge tone="ok">Current</Badge> : Date.parse(p.starts_at) > Date.now() ? <Badge tone="info">Queued</Badge> : <Badge tone="plain">Ended</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No passes yet" icon="ticket" />}
      </section>
    </>
  );
}

function Zones({ areas, onSaved }: { areas: PassData["areas"]; onSaved: () => void }) {
  const notify = useNotify();
  const [busy, setBusy] = useState("");
  async function toggle(id: string, required: boolean) {
    setBusy(id);
    try {
      await api(`/api/operator/areas/${encodeURIComponent(id)}/pass`, { required });
      notify(required ? "Captains in this zone now need a pass to go online." : "Pass no longer needed in this zone.");
      onSaved();
    } catch (e) { notify((e as Error).message); } finally { setBusy(""); }
  }
  return (
    <section className="card stack">
      <h3>Zones that need a pass</h3>
      <Note>When this is on, captains in the zone without a current pass can't go online, see requests or be matched. Captains already online stop getting requests once their pass ends.</Note>
      {areas.length ? areas.map((a) => (
        <Switch key={a.id} checked={a.pass_required} disabled={busy === a.id} onChange={(v) => void toggle(a.id, v)}
          label={<>{a.name}{!a.active && <> <Badge tone="plain">Zone off</Badge></>}</>}
          hint={`${num(a.with_pass)} of ${num(a.captains)} approved captains have a pass`} />
      )) : <Empty title="No zones yet" icon="zone" />}
    </section>
  );
}

function Prices({ prices, onSaved }: { prices: PassData["prices"]; onSaved: () => void }) {
  const notify = useNotify();
  const [edit, setEdit] = useState<Record<string, { price: number | null; days: number | null }>>({});
  const [busy, setBusy] = useState("");
  async function save(category: string) {
    const row = edit[category];
    if (!row || row.price == null || row.days == null) return;
    if (!(row.days >= 1 && row.days <= 90)) return notify("The period must be 1 to 90 days.");
    setBusy(category);
    try {
      await api("/api/operator/pass-prices", { category, price_paise: Math.round(row.price * 100), days: Math.round(row.days) });
      notify(`${CATS[category] ?? category} pass price saved.`);
      setEdit(({ [category]: _, ...rest }) => rest);
      onSaved();
    } catch (e) { notify((e as Error).message); } finally { setBusy(""); }
  }
  return (
    <section className="card flush">
      <div className="card-head"><h3>Pass prices</h3><small className="muted">A new price applies to the next purchase, not to passes already bought.</small></div>
      <div className="table-wrap">
        <table className="tbl responsive">
          <thead><tr><th>Vehicle</th><th>Price</th><th>Days</th><th>Last changed</th><th className="actions" /></tr></thead>
          <tbody>
            {prices.map((p) => {
              const row = edit[p.category] ?? { price: p.price_paise / 100, days: p.days };
              const changed = row.price !== p.price_paise / 100 || row.days !== p.days;
              return (
                <tr key={p.category}>
                  <td className="lead"><strong>{CATS[p.category] ?? p.category}</strong></td>
                  <td data-label="Price"><NumberInput rupees min={0} value={row.price} aria-label={`${CATS[p.category]} pass price`} onValue={(n) => setEdit({ ...edit, [p.category]: { ...row, price: n } })} /></td>
                  <td data-label="Days"><NumberInput min={1} max={90} value={row.days} aria-label={`${CATS[p.category]} pass days`} onValue={(n) => setEdit({ ...edit, [p.category]: { ...row, days: n } })} /></td>
                  <td data-label="Last changed">{when(p.updated_at)}</td>
                  <td className="actions"><button type="button" className="btn sm primary" disabled={!changed || busy === p.category} onClick={() => void save(p.category)}>Save</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Grant({ captains, onSaved }: { captains: PassData["captains"]; onSaved: () => void }) {
  const notify = useNotify();
  const blank = { captain: "", days: 30 as number | null, collected: 0 as number | null, note: "" };
  const [f, setF] = useState(blank), [busy, setBusy] = useState(false), [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const shown = captains.filter((c) => !q || c.name.toLowerCase().includes(q) || c.vehicle_number.toLowerCase().includes(q));
  const chosen = captains.find((c) => c.id === f.captain);
  async function grant() {
    if (!chosen) return notify("Choose a captain.");
    if (!(Number(f.days) >= 1 && Number(f.days) <= 90)) return notify("Give 1 to 90 days.");
    if (f.note.trim().length < 3) return notify("Add a note, for example \"Cash at office\" or \"Free trial\".");
    setBusy(true);
    try {
      await api(`/api/operator/drivers/${encodeURIComponent(chosen.id)}/pass`, { days: Math.round(f.days ?? 0), collected_paise: Math.round((f.collected ?? 0) * 100), note: f.note.trim() });
      notify(`Pass added for ${chosen.name}.`);
      setF(blank); onSaved();
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <section className="card stack">
      <h3>Add a pass by hand</h3>
      <Note>Use this when a captain pays in cash, or for a free trial. It doesn't change their Hop balance. The pass starts when their current one ends.</Note>
      <div className="form-grid">
        <Field label="Find captain"><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Name or vehicle number" /></Field>
        <Field label="Captain" hint={chosen ? (chosen.paid_until ? `Paid until ${day(chosen.paid_until)}` : "No current pass") : `${num(shown.length)} approved captains`}>
          <select value={f.captain} onChange={(e) => setF({ ...f, captain: e.target.value })}>
            <option value="">Choose…</option>
            {shown.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.vehicle_number} · {CATS[c.category] ?? c.category}{c.area ? ` · ${c.area}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Days" hint="1 to 90"><NumberInput min={1} max={90} value={f.days} onValue={(n) => setF({ ...f, days: Math.round(n) })} /></Field>
        <Field label="Amount collected" hint="₹0 for a free pass"><NumberInput rupees min={0} value={f.collected} onValue={(n) => setF({ ...f, collected: n })} /></Field>
        <Field label="Note"><input value={f.note} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Cash at office, receipt 1042" /></Field>
      </div>
      <div className="spread"><span /><button type="button" className="btn primary" disabled={busy} onClick={() => void grant()}>Add pass</button></div>
    </section>
  );
}
