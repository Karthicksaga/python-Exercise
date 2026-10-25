import { useCallback, useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import { loadCheckout } from "@hop/shared/OnlinePay";
import { t } from "@hop/shared/i18n";
import { money } from "@hop/shared/types";

type Entry = { id: number; amount_paise: number; kind: string; note: string; created_at: string };
type Wallet = { balance_paise: number; entries: Entry[]; gateway: boolean; dev_topup: boolean };
type Promo = { code: string; description: string; valid_to: string };

const kindLabel: Record<string, string> = { topup: "Added money", ride_payment: "Ride payment", refund: "Refund", adjustment: "Adjustment" };
const presets = [100, 200, 500, 1000];

// Rider wallet: balance, top-up (gateway when configured, dev credit otherwise), history and live offers.
export default function WalletPanel({ notify }: { notify: (s: string) => void }) {
  const [w, setW] = useState<Wallet | null>(null);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [amount, setAmount] = useState(500);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setW(await api<Wallet>("/api/wallet"));
      setPromos((await api<{ promos: Promo[] }>("/api/promos")).promos ?? []);
    } catch (e) {
      notify((e as Error).message);
    }
  }, [notify]);
  useEffect(() => void load(), [load]);

  async function topup() {
    setBusy(true);
    try {
      const out = await api<{ balance_paise?: number; order_id?: string; key_id?: string; amount_paise?: number }>("/api/wallet/topup", { amount_paise: amount * 100 });
      if (out.order_id) {
        await loadCheckout();
        if (!window.Razorpay) throw new Error("Payment window unavailable");
        new window.Razorpay({
          key: out.key_id,
          order_id: out.order_id,
          amount: out.amount_paise,
          currency: "INR",
          name: "hop wallet",
          handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            await api("/api/wallet/verify", r);
            notify("Money added to your wallet.");
            void load();
          },
        }).open();
      } else {
        notify(`Added ${money(amount * 100)} to your wallet.`);
        await load();
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="wallet-grid">
      <section className="panel wallet-card">
        <p className="eyebrow">{t("wallet.balance")}</p>
        <strong className="wallet-balance">{w ? money(w.balance_paise) : "—"}</strong>
        <p className="muted">Pay rides in one tap and receive refunds instantly.</p>
        <div className="chip-row">
          {presets.map((p) => (
            <button key={p} type="button" className={"chip" + (amount === p ? " selected" : "")} onClick={() => setAmount(p)}>₹{p}</button>
          ))}
        </div>
        <label>
          Amount (₹)
          <input type="number" min={10} max={10000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </label>
        <button disabled={busy || amount < 10 || amount > 10000} onClick={topup}>{t("wallet.add")} {money(Math.max(0, amount) * 100)}</button>
        {w?.dev_topup && <p className="muted">Development build: this credits test money, nothing is charged.</p>}
      </section>
      <section className="panel">
        <p className="eyebrow">OFFERS</p>
        <h2>{t("wallet.offers")}</h2>
        {!promos.length ? <p className="muted">No offers right now. Check back soon.</p> : (
          <ul className="plain-list">
            {promos.map((p) => (
              <li key={p.code}>
                <strong className="promo-code">{p.code}</strong>
                <span>{p.description || "Discount on your next ride"}</span>
                <small>Valid till {new Date(p.valid_to).toLocaleDateString("en-IN")}</small>
              </li>
            ))}
          </ul>
        )}
        <p className="muted">Enter a code on the Confirm step when you book.</p>
      </section>
      <section className="panel wide">
        <p className="eyebrow">ACTIVITY</p>
        <h2>{t("wallet.history")}</h2>
        {!w?.entries.length ? <p className="muted">Top-ups, ride payments and refunds appear here.</p> : (
          <ul className="plain-list ledger">
            {w.entries.map((e) => (
              <li key={e.id}>
                <span>
                  <strong>{kindLabel[e.kind] ?? e.kind}</strong>
                  <small>{e.note} · {new Date(e.created_at).toLocaleString("en-IN")}</small>
                </span>
                <b className={e.amount_paise < 0 ? "neg" : "pos"}>{e.amount_paise < 0 ? "−" : "+"}{money(Math.abs(e.amount_paise))}</b>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
