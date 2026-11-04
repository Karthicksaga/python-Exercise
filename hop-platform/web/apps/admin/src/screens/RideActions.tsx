import { useState } from "react";
import { api } from "@hop/shared/api";
import { ACTIVE_RIDE, RIDE_STATUS, rupee, toPaise, when } from "../lib";
import type { RideRecord } from "../types";
import { Badge, Drawer, Field, Icon, Modal, RideBadge, Rupees, useNotify } from "../ui";

const STEPS = ["requested", "accepted", "arrived", "in_progress", "completed"];
const CANCEL_REASONS = ["Rider asked support to cancel", "Captain can't reach the pickup", "Safety concern", "Duplicate booking", "Payment problem"];

export function RideDrawer({ ride, onClose, onChanged }: { ride: RideRecord; onClose: () => void; onChanged: () => void }) {
  const [dialog, setDialog] = useState<"" | "cancel" | "refund">("");
  const at = STEPS.indexOf(ride.status), remaining = ride.payable_paise - ride.refunded_paise;
  return (
    <>
      <Drawer narrow onClose={onClose} title={`${ride.pickup_label} → ${ride.dropoff_label}`} subtitle={<span className="mono">{ride.id} · {when(ride.created_at)}</span>}
        footer={<>
          {ACTIVE_RIDE.includes(ride.status) && <button type="button" className="btn danger-soft" onClick={() => setDialog("cancel")}>Cancel ride</button>}
          {ride.status === "completed" && remaining > 0 && <button type="button" className="btn secondary" onClick={() => setDialog("refund")}>Refund</button>}
          <span className="grow" /><button type="button" className="btn ghost" onClick={onClose}>Close</button>
        </>}>
        <div className="row"><RideBadge status={ride.status} /><Badge tone={ride.payment_status === "paid" ? "ok" : "plain"}>{ride.payment_method.toUpperCase()} · {ride.payment_status.replace(/_/g, " ")}</Badge></div>
        <div className="card">
          <ul className="blockers">
            {ride.status === "cancelled" || ride.status === "expired"
              ? <li className="todo"><Icon name="x" size={16} /><span>{ride.status === "expired" ? "Expired before a captain accepted" : "Cancelled before completion"}</span></li>
              : STEPS.map((s, i) => <li key={s} className={i <= at ? "done" : "todo"}><Icon name={i <= at ? "check" : "circle"} size={16} /><span>{RIDE_STATUS[s][0]}</span></li>)}
          </ul>
        </div>
        <div className="card">
          <dl className="kv">
            <dt>Rider</dt><dd>{ride.rider}</dd><dt>Captain</dt><dd>{ride.driver || "Not assigned"}</dd>
            <dt>Fare</dt><dd>{rupee(ride.fare_paise)}</dd><dt>Discount</dt><dd>{rupee(ride.discount_paise)}</dd>
            <dt>Rider paid</dt><dd>{rupee(ride.payable_paise)}</dd>{ride.refunded_paise > 0 && <><dt>Refunded</dt><dd>{rupee(ride.refunded_paise)}</dd></>}
          </dl>
        </div>
      </Drawer>
      {dialog === "cancel" && <CancelModal ride={ride} onClose={() => setDialog("")} onDone={() => { setDialog(""); onChanged(); }} />}
      {dialog === "refund" && <RefundModal ride={ride} onClose={() => setDialog("")} onDone={() => { setDialog(""); onChanged(); }} />}
    </>
  );
}

function CancelModal({ ride, onClose, onDone }: { ride: RideRecord; onClose: () => void; onDone: () => void }) {
  const notify = useNotify();
  const [reason, setReason] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit() {
    if (!reason) return setError("Choose a reason. The rider and captain both see it.");
    setBusy(true);
    try {
      await api(`/api/operator/rides/${ride.id}/cancel`, { reason });
      notify("Ride cancelled. The rider and captain were notified.");
      onDone();
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal title="Cancel this ride?" onClose={onClose} footer={<><button type="button" className="btn ghost" onClick={onClose}>Keep ride</button><button type="button" className="btn danger" disabled={busy} onClick={() => void submit()}>Cancel ride</button></>}>
      <p className="muted">{ride.rider} and {ride.driver || "the captain"} are told straight away. Use this only when the ride can't continue.</p>
      <Field label="Reason" error={error}>
        <select value={reason} onChange={(e) => { setReason(e.target.value); setError(""); }}>
          <option value="">Choose a reason…</option>{CANCEL_REASONS.map((r) => <option key={r}>{r}</option>)}
        </select>
      </Field>
    </Modal>
  );
}

export function RefundModal({ ride, onClose, onDone }: { ride: Pick<RideRecord, "id" | "rider" | "payable_paise" | "refunded_paise">; onClose: () => void; onDone: () => void }) {
  const notify = useNotify();
  const max = ride.payable_paise - ride.refunded_paise;
  const [amount, setAmount] = useState(String(max / 100)), [reason, setReason] = useState(""), [claw, setClaw] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({}), [busy, setBusy] = useState(false);
  async function submit() {
    const paise = toPaise(amount), e: typeof errors = {};
    if (!(paise > 0) || paise > max) e.amount = `Enter between ₹1 and ${rupee(max)}.`;
    if (reason.trim().length < 3) e.reason = "Give a short reason. The rider sees it.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await api("/api/operator/refunds", { ride_id: ride.id, amount_paise: paise, reason: reason.trim(), clawback_driver: claw });
      notify(`${rupee(paise)} refunded to ${ride.rider}'s wallet.`);
      onDone();
    } catch (err) { notify((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal title="Refund to rider wallet" onClose={onClose} footer={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={() => void submit()}>Refund</button></>}>
      <p className="muted">{ride.rider} paid {rupee(ride.payable_paise)}{ride.refunded_paise > 0 && `, ${rupee(ride.refunded_paise)} already refunded`}. Up to {rupee(max)} can be refunded.</p>
      <Field label="Amount" error={errors.amount}><Rupees value={amount} max={max / 100} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="Reason" error={errors.reason}><input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Charged for a longer route" /></Field>
      <label className="check"><input type="checkbox" checked={claw} onChange={(e) => setClaw(e.target.checked)} /><span>Recover this amount from the captain's earnings<small>Only when the captain caused the problem.</small></span></label>
    </Modal>
  );
}
