import { useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import { t } from "@hop/shared/i18n";
import { money, type PayMethod } from "@hop/shared/types";

type Promo = { code: string; description: string };

// Streamlined payment pre-selection and promo entry for the booking step.
// Payment is not a mandatory hurdle — it defaults cleanly to the rider's preference
// and is completed/settled at drop-off.
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
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    api<{ balance_paise: number }>("/api/wallet")
      .then((w) => setBalance(w.balance_paise))
      .catch(() => setBalance(null));
  }, []);

  useEffect(() => {
    api<{ promos: Promo[] }>(`/api/promos?area_id=${area}`)
      .then((p) => setPromos(p.promos ?? []))
      .catch(() => setPromos([]));
  }, [area]);

  const options: { id: PayMethod; label: string; icon: string; hint: string }[] = [
    { id: "upi", label: t("pay.upi"), icon: "⚡", hint: "Direct QR / UPI at drop-off" },
    { id: "cash", label: t("pay.cash"), icon: "💵", hint: "Pay driver directly at drop-off" },
    { id: "wallet", label: t("pay.wallet"), icon: "👛", hint: balance == null ? "Auto-settle" : `Balance: ${money(balance)}` },
  ];

  const currentOpt = options.find((o) => o.id === payment) || options[0];

  return (
    <div className="money-box">
      {/* Zero-friction Pre-selected Payment Pill */}
      <div className="payment-summary-pill" onClick={() => setExpanded(!expanded)}>
        <div className="pill-left">
          <span className="pill-icon">{currentOpt.icon}</span>
          <div className="pill-text">
            <span className="pill-title">{currentOpt.label}</span>
            <small className="pill-desc">{currentOpt.hint}</small>
          </div>
        </div>
        <button
          type="button"
          className="text-button change-pay-toggle"
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {expanded ? "Done" : "Change ▾"}
        </button>
      </div>

      {/* Expandable Options (only shown if user wants to change) */}
      {expanded && (
        <div className="pay-options expanded-options" role="radiogroup" aria-label="Payment method">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={payment === o.id}
              className={"pay-opt" + (payment === o.id ? " selected" : "")}
              onClick={() => {
                onPayment(o.id);
                setExpanded(false);
              }}
            >
              <div className="opt-title-row">
                <span>{o.icon}</span>
                <strong>{o.label}</strong>
              </div>
              <small>{o.hint}</small>
            </button>
          ))}
        </div>
      )}

      <p className="pay-at-end-reassurance">
        💡 Settle directly at trip end via UPI, Cash, or Wallet.
      </p>

      {/* Promo Code Section */}
      <div className="promo-row">
        <input
          aria-label={t("promo.placeholder")}
          placeholder={t("promo.placeholder")}
          value={draft}
          maxLength={20}
          onChange={(e) => setDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
        />
        {promo ? (
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setDraft("");
              onPromo("");
            }}
          >
            {t("promo.remove")}
          </button>
        ) : (
          <button
            type="button"
            className="secondary"
            disabled={!draft}
            onClick={() => onPromo(draft)}
          >
            {t("promo.apply")}
          </button>
        )}
      </div>

      {promo && discount > 0 && (
        <p className="promo-ok">
          🎉 {t("promo.applied", { code: promo, amount: money(discount) })}
        </p>
      )}
      {promoError && <p className="promo-err">{promoError}</p>}
      {!promo && promos.length > 0 && (
        <div className="promo-chips">
          {promos.slice(0, 3).map((p) => (
            <button
              key={p.code}
              type="button"
              className="chip"
              title={p.description}
              onClick={() => {
                setDraft(p.code);
                onPromo(p.code);
              }}
            >
              {p.code}
            </button>
          ))}
        </div>
      )}

      {payment === "wallet" && balance != null && balance < 100 && (
        <p className="promo-err">
          Your wallet balance is low ({money(balance)}) — you can still switch to UPI or Cash at drop-off.
        </p>
      )}
    </div>
  );
}
