import { useCallback, useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import { money } from "@hop/shared/types";

type Ledger = { id: number; kind: string; amount_paise: number; note: string; created_at: string };
type Payout = { id: string; amount_paise: number; upi_id: string; status: string; reference: string; note: string; requested_at: string };
type DriverWallet = {
  balance_paise: number;
  upi_id: string;
  min_payout_paise: number;
  ledger: Ledger[];
  payouts: Payout[];
  daily: { day: string; label: string; fare_paise: number; trips: number }[];
  safety: { score: number; label: string; cancellations: number; incidents: number; rating_avg: number; ratings: number; completed_trips: number };
};
const kinds: Record<string, string> = { online_fare: "Fare collected by hop", promo_subsidy: "Promo reimbursed", payout: "Payout", adjustment: "Adjustment" };

// Driver money: weekly earnings chart, withdrawable balance, payout requests and the safety score.
export default function DriverMoney({ notify }: { notify: (s: string) => void }) {
  const [w, setW] = useState<DriverWallet | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<DriverWallet>("/api/drivers/wallet").then(setW).catch((e: Error) => notify(e.message)), [notify]);
  useEffect(() => void load(), [load]);
  if (!w) return null;
  const max = Math.max(1, ...w.daily.map((d) => d.fare_paise));
  const week = w.daily.reduce((a, d) => a + d.fare_paise, 0);
  const open = w.payouts.some((p) => p.status === "requested");
  async function payout() {
    setBusy(true);
    try {
      await api("/api/drivers/payouts", { amount_paise: 0 });
      notify("Payout requested. It will be sent to " + w?.upi_id);
      await load();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const s = w.safety;
  return (
    <section className="panel driver-money">
      <div className="section-heading">
        <div>
          <p className="eyebrow">EARNINGS & PAYOUTS</p>
          <h2>Last 7 days · {money(week)}</h2>
        </div>
        <div className={"safety-badge s" + (s.score >= 80 ? "ok" : s.score >= 60 ? "mid" : "low")} title={`${s.cancellations} cancellations, ${s.incidents} incidents in 90 days`}>
          <strong>{s.score}</strong>
          <small>Safety · {s.label}</small>
        </div>
      </div>
      <div className="bar-chart" role="img" aria-label="Fares for the last 7 days">
        {w.daily.map((d) => (
          <div key={d.day} className="bar-col" title={`${d.trips} trips · ${money(d.fare_paise)}`}>
            <span className="bar-val">{d.fare_paise ? money(d.fare_paise).replace(".00", "") : ""}</span>
            <i style={{ height: `${Math.max(4, (d.fare_paise / max) * 100)}%` }} />
            <small>{d.label}</small>
          </div>
        ))}
      </div>
      <div className="payout-box">
        <div>
          <small>Available to withdraw</small>
          <strong className="wallet-balance">{money(w.balance_paise)}</strong>
          <small>{w.upi_id ? `Paid to ${w.upi_id}` : "Add your UPI ID in preferences to withdraw"}</small>
        </div>
        <button disabled={busy || open || !w.upi_id || w.balance_paise < w.min_payout_paise} onClick={payout}>
          {open ? "Payout pending" : `Withdraw ${money(w.balance_paise)}`}
        </button>
      </div>
      <p className="muted">Online and wallet fares, plus promo discounts hop funds, are credited here. Cash and direct UPI fares go straight to you. Minimum payout {money(w.min_payout_paise)}.</p>
      {!!w.payouts.length && (
        <>
          <h3>Payouts</h3>
          <ul className="plain-list ledger">
            {w.payouts.map((p) => (
              <li key={p.id}>
                <span>
                  <strong>{money(p.amount_paise)} · {p.status}</strong>
                  <small>{new Date(p.requested_at).toLocaleDateString("en-IN")}{p.reference ? ` · Ref ${p.reference}` : ""}{p.note ? ` · ${p.note}` : ""}</small>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {!!w.ledger.length && (
        <>
          <h3>Ledger</h3>
          <ul className="plain-list ledger">
            {w.ledger.slice(0, 8).map((l) => (
              <li key={l.id}>
                <span>
                  <strong>{kinds[l.kind] ?? l.kind}</strong>
                  <small>{l.note} · {new Date(l.created_at).toLocaleString("en-IN")}</small>
                </span>
                <b className={l.amount_paise < 0 ? "neg" : "pos"}>{l.amount_paise < 0 ? "−" : "+"}{money(Math.abs(l.amount_paise))}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
