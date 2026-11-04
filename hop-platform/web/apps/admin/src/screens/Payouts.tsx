import { useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import type { ScreenProps } from "../AdminApp";
import { ago, rupee, rupeeShort, useLoad } from "../lib";
import type { Finance, RideRecord } from "../types";
import { Badge, Empty, Field, Modal, Skeleton, useNotify } from "../ui";
import { RefundModal } from "./RideActions";

type Payout = Finance["payouts"][number];

export default function Payouts({ refreshSummary }: ScreenProps) {
  const notify = useNotify();
  const fin = useLoad<Finance>("/api/operator/finance", notify);
  const [deciding, setDeciding] = useState<{ p: Payout; paid: boolean } | null>(null);
  const [q, setQ] = useState(""), [query, setQuery] = useState("");
  const [refunding, setRefunding] = useState<RideRecord | null>(null);
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const rides = useLoad<{ rides: RideRecord[] }>(query ? `/api/operator/rides?q=${encodeURIComponent(query)}` : null, notify);
  if (!fin.data) return <Skeleton rows={6} />;
  const f = fin.data, t = f.totals, waiting = f.payouts.filter((p) => p.status === "requested");
  const done = () => { void fin.reload(); refreshSummary(); };
  const completed = (rides.data?.rides ?? []).filter((r) => r.status === "completed");

  return (
    <>
      <section className="grid g-kpi">
        {([["Owed to captains", t.driver_liability_paise, "Earned but not paid out"], ["Rider wallets", t.wallet_held_paise, "Balance held for riders"], ["Promos funded", t.promo_funded_paise, "Paid by Hop, all time"], ["Refunded", t.refunded_paise, "To rider wallets, all time"]] as const).map(([l, v, s]) => (
          <div key={l} className="card kpi"><span className="eyebrow">{l}</span><strong>{rupeeShort(v)}</strong><small>{s}</small></div>
        ))}
      </section>
      <section className="card flush">
        <div className="card-head" style={{ padding: "18px 20px 0" }}><h2>Payout requests</h2>{waiting.length > 0 && <Badge tone="info">{waiting.length} waiting · {rupee(waiting.reduce((s, p) => s + p.amount_paise, 0))}</Badge>}<p>Pay by UPI first, then record the UPI reference here.</p></div>
        {f.payouts.length ? (
          <div className="table-wrap">
            <table className="tbl responsive">
              <thead><tr><th>Captain</th><th>UPI ID</th><th>Requested</th><th>Status</th><th className="num">Amount</th><th className="actions" /></tr></thead>
              <tbody>
                {f.payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="lead"><strong>{p.name}</strong></td>
                    <td data-label="UPI ID" className="mono">{p.upi_id}</td>
                    <td data-label="Requested">{ago(p.requested_at)}</td>
                    <td data-label="Status">{p.status === "requested" ? <Badge tone="warn">Waiting</Badge> : p.status === "paid" ? <Badge tone="ok">Paid</Badge> : <Badge tone="bad">Rejected</Badge>}{p.reference && <small className="mono">{p.reference}</small>}</td>
                    <td data-label="Amount" className="num"><strong>{rupee(p.amount_paise)}</strong></td>
                    <td className="actions">{p.status === "requested" && <><button type="button" className="btn sm ghost" onClick={() => setDeciding({ p, paid: false })}>Reject</button> <button type="button" className="btn sm primary" onClick={() => setDeciding({ p, paid: true })}>Mark paid</button></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No payout requests yet" icon="wallet" />}
      </section>
      <section className="card stack">
        <div className="card-head" style={{ margin: 0 }}><h2>Refund a ride</h2><p>Find a completed ride, then refund all or part of it to the rider's wallet.</p></div>
        <Field label={<span className="sr">Find a ride</span>}><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ride ID, rider or captain" /></Field>
        {query && (rides.loading ? <p className="muted">Searching…</p> : completed.length ? (
          <div className="list">{completed.map((r) => (
            <div key={r.id} className="li"><span className="li-main"><strong>{r.rider} · {r.pickup_label} → {r.dropoff_label}</strong><small><span className="mono">{r.id.slice(0, 8)}</span> · paid {rupee(r.payable_paise)}{r.refunded_paise > 0 && ` · refunded ${rupee(r.refunded_paise)}`}</small></span>
              {r.payable_paise > r.refunded_paise ? <button type="button" className="btn sm secondary" onClick={() => setRefunding(r)}>Refund</button> : <Badge tone="plain">Fully refunded</Badge>}</div>
          ))}</div>
        ) : <p className="muted">No completed rides match.</p>)}
        {f.refunds.length > 0 && <span className="small muted">Recent: {f.refunds.slice(0, 3).map((r) => `${r.rider} ${rupee(r.amount_paise)} (${r.reason})`).join(" · ")}</span>}
      </section>
      {deciding && <PayoutModal {...deciding} onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); done(); }} />}
      {refunding && <RefundModal ride={refunding} onClose={() => setRefunding(null)} onDone={() => { setRefunding(null); done(); void rides.reload(); }} />}
    </>
  );
}

function PayoutModal({ p, paid, onClose, onDone }: { p: Payout; paid: boolean; onClose: () => void; onDone: () => void }) {
  const notify = useNotify();
  const [text, setText] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  async function submit() {
    if (paid && text.trim().length < 4) return setErr("Enter the UPI reference (at least 4 characters).");
    if (!paid && text.trim().length < 3) return setErr("Give a reason the captain can act on.");
    setBusy(true);
    try {
      await api(`/api/operator/payouts/${p.id}`, paid ? { decision: "paid", reference: text.trim() } : { decision: "rejected", note: text.trim() });
      notify(paid ? `${rupee(p.amount_paise)} to ${p.name} recorded as paid.` : `Payout rejected. The amount is back in ${p.name}'s balance.`);
      onDone();
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal title={paid ? `Mark ${rupee(p.amount_paise)} as paid` : "Reject payout"} onClose={onClose}
      footer={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className={`btn ${paid ? "success" : "danger"}`} disabled={busy} onClick={() => void submit()}>{paid ? "Mark paid" : "Reject payout"}</button></>}>
      {paid ? <p className="muted">Send {rupee(p.amount_paise)} to <span className="mono">{p.upi_id}</span> in your UPI app first, then enter its reference.</p>
        : <p className="muted">The amount goes back to {p.name}'s balance and they can request again.</p>}
      <Field label={paid ? "UPI reference" : "Reason shown to the captain"} error={err}>
        <input value={text} maxLength={120} className={paid ? "mono" : ""} onChange={(e) => { setText(e.target.value); setErr(""); }} placeholder={paid ? "12-digit UTR" : "e.g. UPI ID doesn't match the account name"} />
      </Field>
    </Modal>
  );
}
