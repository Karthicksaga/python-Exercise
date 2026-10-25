import { useCallback, useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import { money, type Area } from "@hop/shared/types";

type Finance = {
  totals: { driver_liability_paise: number; promo_funded_paise: number; refunded_paise: number; wallet_held_paise: number };
  promos: { code: string; description: string; kind: string; value: number; active: boolean; valid_to: string; redemptions: number; max_uses: number | null }[];
  peak_windows: { id: string; area: string; label: string; days: number[]; start_time: string; end_time: string; multiplier: number }[];
  surges: { id: string; area: string; category: string | null; multiplier: number; reason: string; ends_at: string }[];
  payouts: { id: string; name: string; amount_paise: number; upi_id: string; status: string; reference: string; requested_at: string }[];
  refunds: { id: string; rider: string; amount_paise: number; reason: string; created_at: string }[];
  area_surge: { id: string; name: string; surge_cap: number; surge_auto: boolean }[];
  driver_safety: { driver_id: string; name: string; score: number; label: string; cancellations: number; incidents: number; completed_trips: number }[];
};
type RideRow = { id: string; status: string; rider: string; driver: string; pickup_label: string; dropoff_label: string; payable_paise: number; refunded_paise: number; payment_method: string; created_at: string };
const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Operator money tools: payout queue, refunds with ride search, promos, surge controls and driver safety scores.
export type FinancePart = "payments" | "promos" | "surge" | "safety";
export default function OperatorFinance({ notify, areas, part }: { notify: (s: string) => void; areas: Area[]; part: FinancePart }) {
  const [f, setF] = useState<Finance | null>(null);
  const [q, setQ] = useState("");
  const [rides, setRides] = useState<RideRow[]>([]);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const load = useCallback(async () => {
    try {
      setF(await api<Finance>("/api/operator/finance"));
    } catch (e) {
      notify((e as Error).message);
    }
  }, [notify]);
  useEffect(() => void load(), [load]);
  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    try {
      setRides((await api<{ rides: RideRow[] }>(`/api/operator/rides?q=${encodeURIComponent(q)}`)).rides ?? []);
    } catch (er) {
      notify((er as Error).message);
    }
  }
  async function post(path: string, body: unknown, ok: string) {
    try {
      await api(path, body);
      notify(ok);
      await load();
    } catch (er) {
      notify((er as Error).message);
    }
  }
  function form(handler: (d: FormData) => void) {
    return (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      handler(new FormData(e.currentTarget));
    };
  }
  if (!f) return <p className="muted">Loading finance…</p>;
  const areaOptions = areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>);
  const pending = f.payouts.filter((p) => p.status === "requested");
  return (
    <section className="op-finance">
      {part === "payments" && <div className="earnings-grid">
        <article className="earnings-card"><span>Owed to drivers</span><strong>{money(f.totals.driver_liability_paise)}</strong></article>
        <article className="earnings-card"><span>Promo funded</span><strong>{money(f.totals.promo_funded_paise)}</strong></article>
        <article className="earnings-card"><span>Refunded</span><strong>{money(f.totals.refunded_paise)}</strong></article>
        <article className="earnings-card"><span>Rider wallets</span><strong>{money(f.totals.wallet_held_paise)}</strong></article>
      </div>}
      {part === "payments" && <>

      <h3>Payout requests {pending.length > 0 && <em className="badge">{pending.length}</em>}</h3>
      {!f.payouts.length ? <p className="muted">No payout requests yet.</p> : (
        <ul className="plain-list ledger">
          {f.payouts.slice(0, 10).map((p) => (
            <li key={p.id}>
              <span>
                <strong>{p.name} · {money(p.amount_paise)} · {p.status}</strong>
                <small>{p.upi_id} · {new Date(p.requested_at).toLocaleString("en-IN")}{p.reference && ` · Ref ${p.reference}`}</small>
              </span>
              {p.status === "requested" && (
                <form className="inline-form" onSubmit={form((d) => void post(`/api/operator/payouts/${p.id}`, { decision: "paid", reference: d.get("ref") }, "Payout marked paid."))}>
                  <input name="ref" placeholder="UPI reference" required minLength={4} />
                  <button>Mark paid</button>
                  <button type="button" className="danger" onClick={() => { const note = prompt("Reason for rejecting this payout?"); if (note) void post(`/api/operator/payouts/${p.id}`, { decision: "rejected", note }, "Payout rejected; funds returned."); }}>Reject</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3>Refunds</h3>
      <form className="inline-form" onSubmit={(e) => void search(e)}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ride id, rider, driver or status" />
        <button className="secondary">Search rides</button>
      </form>
      {rides.length > 0 && (
        <ul className="plain-list ledger">
          {rides.map((r) => (
            <li key={r.id}>
              <span>
                <strong>{r.rider} → {r.pickup_label.split(",")[0]} to {r.dropoff_label.split(",")[0]}</strong>
                <small>{r.id.slice(0, 8)} · {r.status} · {r.payment_method} · paid {money(r.payable_paise)}{r.refunded_paise > 0 && ` · refunded ${money(r.refunded_paise)}`}</small>
              </span>
              {r.status === "completed" && r.payable_paise - r.refunded_paise > 0 && (
                <button className="secondary" onClick={() => {
                  const amount = Number(prompt(`Refund amount in ₹ (max ${(r.payable_paise - r.refunded_paise) / 100})`, String((r.payable_paise - r.refunded_paise) / 100)));
                  const reason = amount ? prompt("Reason for the refund?") : null;
                  if (amount && reason) void post("/api/operator/refunds", { ride_id: r.id, amount_paise: Math.round(amount * 100), reason, clawback_driver: false }, "Refund sent to the rider's wallet.").then(() => search());
                }}>Refund</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!!f.refunds.length && <p className="muted">Recent: {f.refunds.slice(0, 3).map((r) => `${r.rider} ${money(r.amount_paise)}`).join(" · ")}</p>}

      </>}
      {part === "promos" && <>
      <h3>Promo codes</h3>
      <form className="form-grid" onSubmit={form((d) => void post("/api/operator/promos", {
        code: d.get("code"), description: d.get("description"), kind: d.get("kind"),
        value: d.get("kind") === "flat" ? Math.round(Number(d.get("value")) * 100) : Number(d.get("value")),
        max_discount_paise: Math.round(Number(d.get("max") || 0) * 100), min_fare_paise: Math.round(Number(d.get("min") || 0) * 100),
        max_uses: Number(d.get("uses") || 0), per_user_limit: Number(d.get("per") || 1), valid_days: Number(d.get("days") || 30),
        area_id: d.get("area") || "", listed: d.get("listed") === "on", active: true,
      }, "Promo saved."))}>
        <label>Code<input name="code" required pattern="[A-Za-z0-9]{3,20}" placeholder="WELCOME50" /></label>
        <label>Description<input name="description" placeholder="50% off your first ride" maxLength={200} /></label>
        <label>Type<select name="kind"><option value="percent">Percent off</option><option value="flat">Flat ₹ off</option></select></label>
        <label>Value (% or ₹)<input name="value" type="number" min="1" step="1" required /></label>
        <label>Max discount (₹)<input name="max" type="number" min="0" placeholder="no cap" /></label>
        <label>Min fare (₹)<input name="min" type="number" min="0" /></label>
        <label>Total uses<input name="uses" type="number" min="0" placeholder="unlimited" /></label>
        <label>Per rider<input name="per" type="number" min="1" defaultValue={1} /></label>
        <label>Valid for (days)<input name="days" type="number" min="1" max="730" defaultValue={30} /></label>
        <label>Area<select name="area"><option value="">All areas</option>{areaOptions}</select></label>
        <label className="check"><input name="listed" type="checkbox" defaultChecked /> Show to riders</label>
        <button>Save promo</button>
      </form>
      <ul className="plain-list">
        {f.promos.map((p) => (
          <li key={p.code}>
            <span><strong className="promo-code">{p.code}</strong> <small>{p.kind === "percent" ? `${p.value}%` : money(p.value)} off · {p.redemptions}{p.max_uses ? `/${p.max_uses}` : ""} used · till {new Date(p.valid_to).toLocaleDateString("en-IN")}</small></span>
            {p.active && <button className="secondary" onClick={() => void post("/api/operator/promos", { code: p.code, kind: p.kind, value: p.value, per_user_limit: 1, active: false, description: p.description }, "Promo disabled.")}>Disable</button>}
          </li>
        ))}
      </ul>

      </>}
      {part === "surge" && <>
      <h3>Surge & peak pricing</h3>
      <ul className="plain-list">
        {f.area_surge.map((a) => (
          <li key={a.id}>
            <span><strong>{a.name}</strong> <small>cap {a.surge_cap}× · demand surge {a.surge_auto ? "on" : "off"}</small></span>
            <form className="inline-form" onSubmit={form((d) => void post(`/api/operator/areas/${a.id}/surge`, { surge_cap: Number(d.get("cap")), surge_auto: d.get("auto") === "on" }, "Area surge settings saved."))}>
              <input name="cap" type="number" min="1" max="3" step="0.1" defaultValue={a.surge_cap} aria-label="Surge cap" />
              <label className="check"><input name="auto" type="checkbox" defaultChecked={a.surge_auto} /> Auto</label>
              <button className="secondary">Save</button>
            </form>
          </li>
        ))}
      </ul>
      <form className="form-grid" onSubmit={form((d) => void post("/api/operator/peak-windows", { area_id: d.get("area"), label: d.get("label"), days, start_time: d.get("start"), end_time: d.get("end"), multiplier: Number(d.get("mult")) }, "Peak window added."))}>
        <label>Area<select name="area" required>{areaOptions}</select></label>
        <label>Label<input name="label" required placeholder="Office rush" /></label>
        <label>Start<input name="start" type="time" defaultValue="08:00" required /></label>
        <label>End<input name="end" type="time" defaultValue="10:30" required /></label>
        <label>Multiplier<input name="mult" type="number" min="1.05" max="3" step="0.05" defaultValue={1.3} required /></label>
        <div className="day-pick">
          {dayNames.map((n, i) => (
            <button type="button" key={n} className={"chip" + (days.includes(i + 1) ? " selected" : "")} onClick={() => setDays((cur) => cur.includes(i + 1) ? cur.filter((x) => x !== i + 1) : [...cur, i + 1])}>{n}</button>
          ))}
        </div>
        <button>Add peak window</button>
      </form>
      <ul className="plain-list">
        {f.peak_windows.map((p) => (
          <li key={p.id}>
            <span><strong>{p.label}</strong> <small>{p.area} · {p.days.map((d) => dayNames[d - 1]).join(" ")} {p.start_time}–{p.end_time} · {p.multiplier}×</small></span>
            <button className="secondary" onClick={() => void post(`/api/operator/peak-windows/${p.id}/delete`, {}, "Peak window removed.")}>Remove</button>
          </li>
        ))}
      </ul>
      <form className="form-grid" onSubmit={form((d) => void post("/api/operator/surge", { area_id: d.get("area"), multiplier: Number(d.get("mult")), reason: d.get("reason"), minutes: Number(d.get("mins")) }, "Surge override active."))}>
        <label>Area<select name="area" required>{areaOptions}</select></label>
        <label>Multiplier (1.0 = no surge)<input name="mult" type="number" min="1" max="3" step="0.05" defaultValue={1.5} required /></label>
        <label>Minutes<input name="mins" type="number" min="5" max="1440" defaultValue={60} required /></label>
        <label>Reason<input name="reason" required minLength={3} placeholder="Heavy rain" /></label>
        <button>Apply override</button>
      </form>
      <ul className="plain-list">
        {f.surges.map((s) => (
          <li key={s.id}>
            <span><strong>{s.area} · {s.multiplier}×</strong> <small>{s.reason} · until {new Date(s.ends_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</small></span>
            <button className="secondary" onClick={() => void post(`/api/operator/surge/${s.id}/delete`, {}, "Override ended.")}>End</button>
          </li>
        ))}
      </ul>

      </>}
      {part === "safety" && <>
      <h3>Driver safety scores</h3>
      <ul className="plain-list">
        {f.driver_safety.map((d) => (
          <li key={d.driver_id}>
            <span><strong>{d.name}</strong> <small>{d.completed_trips} trips · {d.cancellations} cancellations · {d.incidents} incidents</small></span>
            <b className={d.score >= 80 ? "pos" : d.score >= 60 ? "" : "neg"}>{d.score} · {d.label}</b>
          </li>
        ))}
      </ul>
      </>}
    </section>
  );
}
