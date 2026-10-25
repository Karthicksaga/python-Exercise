import { useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import { t } from "@hop/shared/i18n";
import { money, type PayMethod } from "@hop/shared/types";

type Promo = { code: string; description: string };

// Payment method plus promo code entry for the Confirm step. The promo is applied by the quote itself,
// so the fare the rider sees is always what the server will charge.
export default function BookingMoney({
  area,
  payment,
  onPayment,
  promo,
  onPromo,
  promoError,
  discount,
}: {
  area: string;
  payment: PayMethod;
  onPayment: (p: PayMethod) => void;
  promo: string;
  onPromo: (code: string) => void;
  promoError: string;
  discount: number;
}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [draft, setDraft] = useState(promo);
  useEffect(() => {
    api<{ balance_paise: number }>("/api/wallet").then((w) => setBalance(w.balance_paise)).catch(() => setBalance(null));
  }, []);
  useEffect(() => {
    api<{ promos: Promo[] }>(`/api/promos?area_id=${area}`).then((p) => setPromos(p.promos ?? [])).catch(() => setPromos([]));
  }, [area]);
  const options: { id: PayMethod; label: string; hint: string }[] = [
    { id: "cash", label: t("pay.cash"), hint: "Pay the driver" },
    { id: "upi", label: t("pay.upi"), hint: "Direct to driver" },
    { id: "wallet", label: t("pay.wallet"), hint: balance == null ? "—" : money(balance) },
  ];
  return (
    <div className="money-box">
      <div className="pay-options" role="radiogroup" aria-label="Payment method">
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={payment === o.id} className={"pay-opt" + (payment === o.id ? " selected" : "")} onClick={() => onPayment(o.id)}>
            <strong>{o.label}</strong>
            <small>{o.hint}</small>
          </button>
        ))}
      </div>
      <div className="promo-row">
        <input
          aria-label={t("promo.placeholder")}
          placeholder={t("promo.placeholder")}
          value={draft}
          maxLength={20}
          onChange={(e) => setDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
        />
        {promo ? (
          <button type="button" className="ghost" onClick={() => { setDraft(""); onPromo(""); }}>{t("promo.remove")}</button>
        ) : (
          <button type="button" className="secondary" disabled={!draft} onClick={() => onPromo(draft)}>{t("promo.apply")}</button>
        )}
      </div>
      {promo && discount > 0 && <p className="promo-ok">🎉 {t("promo.applied", { code: promo, amount: money(discount) })}</p>}
      {promoError && <p className="promo-err">{promoError}</p>}
      {!promo && promos.length > 0 && (
        <div className="promo-chips">
          {promos.slice(0, 3).map((p) => (
            <button key={p.code} type="button" className="chip" title={p.description} onClick={() => { setDraft(p.code); onPromo(p.code); }}>
              {p.code}
            </button>
          ))}
        </div>
      )}
      {payment === "wallet" && balance != null && balance < 100 && <p className="promo-err">Your wallet is empty — add money in the Wallet tab or pick another method.</p>}
    </div>
  );
}
