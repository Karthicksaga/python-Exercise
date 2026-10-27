import { useCallback, useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import { loadCheckout } from "@hop/shared/OnlinePay";
import { t } from "@hop/shared/i18n";
import { money } from "@hop/shared/types";
import { Modal, Stack, Group, Button, Text } from "@mantine/core";
import {
  IconWallet,
  IconPercentage,
  IconHistory,
  IconBolt,
  IconShieldCheck,
  IconRotateClockwise,
  IconChevronRight,
  IconCar,
  IconPlus,
  IconCopy,
  IconCheck,
} from "@tabler/icons-react";

type Entry = { id: number; amount_paise: number; kind: string; note: string; created_at: string };
type Wallet = { balance_paise: number; entries: Entry[]; gateway: boolean; dev_topup: boolean };
type Promo = { code: string; description: string; valid_to: string };

const kindLabel: Record<string, string> = {
  topup: "Added money",
  ride_payment: "Ride payment",
  refund: "Refund",
  adjustment: "Adjustment",
};
const presets = [100, 200, 500, 1000];

function formatLedgerDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const timeStr = d
      .toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
      .toUpperCase();

    if (isToday) return `Today, ${timeStr}`;
    if (isYesterday) return `Yesterday, ${timeStr}`;

    const day = d.getDate().toString().padStart(2, "0");
    const month = d.toLocaleDateString("en-IN", { month: "short" });
    const year = d.getFullYear();
    return `${day} ${month} ${year}, ${timeStr}`;
  } catch {
    return iso;
  }
}

function WalletHeroArt() {
  return (
    <svg
      className="wallet-hero-art"
      viewBox="0 0 160 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="walletGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fed7aa" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#fed7aa" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="walletBody" x1="25" y1="55" x2="130" y2="120" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fca58e" />
          <stop offset="100%" stopColor="#f46c52" />
        </linearGradient>
        <linearGradient id="walletFlap" x1="25" y1="55" x2="130" y2="78" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffbba8" />
          <stop offset="100%" stopColor="#fb8872" />
        </linearGradient>
        <linearGradient id="goldCoin" x1="0" y1="0" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fde047" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      {/* Background glow */}
      <circle cx="95" cy="75" r="55" fill="url(#walletGlow)" />

      {/* Sparkles / Stars */}
      <path d="M128 32L130 38L136 40L130 42L128 48L126 42L120 40L126 38Z" fill="#fbbf24" opacity="0.9" />
      <path d="M42 62L43 66L47 67L43 68L42 72L41 68L37 67L41 66Z" fill="#fca58e" opacity="0.8" />
      <circle cx="140" cy="65" r="2.5" fill="#fca58e" opacity="0.8" />

      {/* Floating Gold Coin 1 */}
      <g transform="translate(68, 22)">
        <circle cx="12" cy="12" r="11" fill="url(#goldCoin)" stroke="#d97706" strokeWidth="1.2" />
        <path d="M12 7V17M7 12H17" stroke="#92400e" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* Floating Gold Coin 2 */}
      <g transform="translate(100, 30)">
        <circle cx="10" cy="10" r="9" fill="url(#goldCoin)" stroke="#d97706" strokeWidth="1" />
        <path d="M10 6V14M6 10H14" stroke="#92400e" strokeWidth="1.8" strokeLinecap="round" />
      </g>

      {/* Wallet Body */}
      <rect x="25" y="55" width="105" height="65" rx="14" fill="url(#walletBody)" />
      {/* Flap accent */}
      <rect x="25" y="55" width="105" height="20" rx="10" fill="url(#walletFlap)" opacity="0.75" />

      {/* Wallet Clasp / Strap */}
      <rect x="88" y="74" width="28" height="20" rx="6" fill="#f46c52" stroke="#d64a2b" strokeWidth="1" />
      <circle cx="102" cy="84" r="5" fill="#fde047" stroke="#d97706" strokeWidth="1.5" />
    </svg>
  );
}

function GiftBoxArt() {
  return (
    <svg
      className="promo-gift-art"
      viewBox="0 0 120 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="giftGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fed7aa" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#fed7aa" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="giftBox" x1="26" y1="59" x2="88" y2="101" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fca58e" />
          <stop offset="100%" stopColor="#f46c52" />
        </linearGradient>
        <linearGradient id="giftLid" x1="22" y1="44" x2="92" y2="59" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffbba8" />
          <stop offset="100%" stopColor="#fb8872" />
        </linearGradient>
      </defs>
      {/* Glow */}
      <circle cx="60" cy="55" r="48" fill="url(#giftGlow)" />

      {/* Sparkles */}
      <path d="M18 40L20 44L24 45L20 46L18 50L16 46L12 45L16 44Z" fill="#fbbf24" />
      <path d="M102 32L103 36L107 37L103 38L102 42L101 38L97 37L101 36Z" fill="#fbbf24" />
      <circle cx="28" cy="74" r="2.5" fill="#fca58e" />
      <circle cx="94" cy="68" r="2.5" fill="#fbbf24" />

      {/* Bow loops */}
      <path d="M46 36C40 30 36 34 42 42C48 45 54 44 54 44C54 44 52 38 46 36Z" fill="#f59e0b" />
      <path d="M68 36C74 30 78 34 72 42C66 45 60 44 60 44C60 44 62 38 68 36Z" fill="#f59e0b" />
      <circle cx="57" cy="43" r="4.5" fill="#d97706" />

      {/* Lid */}
      <rect x="22" y="44" width="70" height="15" rx="5" fill="url(#giftLid)" />
      <rect x="52" y="44" width="10" height="15" fill="#f59e0b" />

      {/* Box */}
      <rect x="26" y="59" width="62" height="42" rx="6" fill="url(#giftBox)" />
      <rect x="52" y="59" width="10" height="42" fill="#f59e0b" />

      {/* Discount tag badge */}
      <g transform="translate(68, 62) rotate(12)">
        <rect x="0" y="0" width="22" height="26" rx="4" fill="#cc472b" stroke="#ffffff" strokeWidth="1" />
        <circle cx="11" cy="5" r="2" fill="#ffffff" />
        <text x="11" y="20" fill="#ffffff" fontSize="12" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">%</text>
      </g>
    </svg>
  );
}

export default function WalletPanel({ notify }: { notify: (s: string) => void }) {
  const [w, setW] = useState<Wallet | null>(null);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [amount, setAmount] = useState(500);
  const [busy, setBusy] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [filter, setFilter] = useState("all");
  const [showOffersModal, setShowOffersModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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
      const out = await api<{
        balance_paise?: number;
        order_id?: string;
        key_id?: string;
        amount_paise?: number;
        test_mode?: boolean;
      }>("/api/wallet/topup", { amount_paise: amount * 100 });
      if (out.order_id) {
        if (out.key_id === "rzp_test_mock") {
          await api("/api/wallet/verify", {
            razorpay_order_id: out.order_id,
            razorpay_payment_id: "pay_test_" + Math.random().toString(36).substring(2, 10),
            razorpay_signature: "test_signature",
          });
          notify("Money added to your wallet (Test Mode).");
          void load();
          return;
        }
        await loadCheckout();
        if (!window.Razorpay) throw new Error("Payment window unavailable");
        new window.Razorpay({
          key: out.key_id,
          order_id: out.order_id,
          amount: out.amount_paise,
          currency: "INR",
          name: "hop wallet",
          handler: async (r: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
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

  function handleApplyPromo() {
    const trimmed = promoInput.trim();
    if (!trimmed) {
      notify("Please enter a promo code.");
      return;
    }
    const matched = promos.find((p) => p.code.toUpperCase() === trimmed.toUpperCase());
    if (matched) {
      notify(`Promo code ${matched.code} is available! Enter it on the Confirm step when you book your ride to redeem discount.`);
    } else {
      notify(`Code "${trimmed}" noted. Enter it on the Confirm step when you book your ride.`);
    }
    setPromoInput("");
  }

  function handleCopyPromo(code: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopiedCode(code);
    notify(`Copied promo code "${code}" to clipboard!`);
    setTimeout(() => setCopiedCode(null), 2500);
  }

  const filteredEntries = (w?.entries ?? []).filter((e) => {
    if (filter === "topup") return e.kind === "topup" || (e.kind === "adjustment" && e.amount_paise > 0);
    if (filter === "ride_payment") return e.kind === "ride_payment" || (e.kind === "adjustment" && e.amount_paise < 0);
    if (filter === "refund") return e.kind === "refund";
    return true;
  });

  return (
    <div className="wallet-page-container">
      {/* Active Offers Modal */}
      <Modal
        opened={showOffersModal}
        onClose={() => setShowOffersModal(false)}
        title="Active Offers & Discounts"
        centered
        radius="lg"
      >
        <Stack gap="md">
          {!promos.length ? (
            <Text c="dimmed" size="sm">
              No active offers right now. Check back soon for exciting ride discounts!
            </Text>
          ) : (
            <ul className="promo-modal-list">
              {promos.map((p) => (
                <li key={p.code} className="promo-modal-item">
                  <div className="promo-modal-info">
                    <strong className="promo-code">{p.code}</strong>
                    <span className="promo-modal-desc">{p.description || "Discount on your next ride"}</span>
                    <small className="promo-modal-valid">
                      Valid till {new Date(p.valid_to).toLocaleDateString("en-IN")}
                    </small>
                  </div>
                  <Button
                    size="xs"
                    variant={copiedCode === p.code ? "filled" : "light"}
                    color={copiedCode === p.code ? "teal" : "orange"}
                    leftSection={copiedCode === p.code ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    onClick={() => handleCopyPromo(p.code)}
                  >
                    {copiedCode === p.code ? "Copied" : "Copy"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setShowOffersModal(false)}>
              Close
            </Button>
          </Group>
        </Stack>
      </Modal>

      <div className="wallet-page-layout">
        {/* Left Column on Desktop */}
        <div className="wallet-col wallet-col-left">
          {/* 1. Hop wallet Card */}
          <section className="wallet-card hop-wallet-card">
            <div className="wallet-card-header">
              <div className="wallet-icon-box">
                <IconWallet size={22} className="wallet-primary-icon" />
              </div>
              <div className="wallet-card-titles">
                <h3>{t("wallet.balance")}</h3>
                <p>Pay rides in one tap and receive refunds instantly.</p>
              </div>
            </div>

            <div className="wallet-body-with-art">
              <div className="wallet-main-controls">
                <div className="wallet-balance-row">
                  <strong className="wallet-balance-val">
                    {w ? money(w.balance_paise) : "₹0.00"}
                  </strong>
                </div>

                <div className="wallet-chip-group">
                  {presets.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={"wallet-preset-chip" + (amount === p ? " selected" : "")}
                      onClick={() => setAmount(p)}
                    >
                      ₹{p}
                    </button>
                  ))}
                </div>

                <div className="wallet-custom-input-group">
                  <label htmlFor="custom-amount-input">Other amount (₹)</label>
                  <input
                    id="custom-amount-input"
                    type="number"
                    min={10}
                    max={10000}
                    value={amount || ""}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    placeholder="Enter amount"
                  />
                </div>

                <button
                  type="button"
                  className="wallet-add-btn"
                  disabled={busy || amount < 10 || amount > 10000}
                  onClick={topup}
                >
                  <span>
                    {t("wallet.add")} {money(Math.max(0, amount) * 100)}
                  </span>
                  <IconChevronRight size={18} />
                </button>

                {w?.dev_topup && (
                  <p className="wallet-dev-note">
                    Development build: this credits test money, nothing is charged.
                  </p>
                )}
              </div>

              <div className="wallet-art-wrapper">
                <WalletHeroArt />
              </div>
            </div>
          </section>

          {/* 2. Wallet history Card */}
          <section className="wallet-card wallet-history-card">
            <div className="wallet-history-header">
              <div className="wallet-history-header-left">
                <div className="wallet-icon-box history">
                  <IconHistory size={22} />
                </div>
                <div className="wallet-card-titles">
                  <h3>{t("wallet.history")}</h3>
                  <p>Top-ups, ride payments and instant refunds appear here.</p>
                </div>
              </div>

              <div className="wallet-filter-wrapper">
                <select
                  aria-label="Filter transactions"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="wallet-filter-select"
                >
                  <option value="all">All transactions</option>
                  <option value="topup">Added money</option>
                  <option value="ride_payment">Ride payments</option>
                  <option value="refund">Refunds</option>
                </select>
              </div>
            </div>

            {/* List of transactions or empty state */}
            {!filteredEntries.length ? (
              <div className="wallet-empty-history">
                <IconHistory size={36} className="wallet-empty-icon" />
                <p>
                  {filter === "all"
                    ? "Top-ups, ride payments and instant refunds appear here."
                    : "No transactions found for this filter."}
                </p>
              </div>
            ) : (
              <ul className="wallet-ledger-list">
                {filteredEntries.map((e) => {
                  const isCredit = e.amount_paise > 0;
                  return (
                    <li key={e.id} className="wallet-ledger-item">
                      <div className="ledger-left">
                        <div className={"ledger-icon-badge " + (isCredit ? "credit" : "debit")}>
                          {isCredit ? (
                            <IconPlus size={18} strokeWidth={2.5} />
                          ) : (
                            <IconCar size={18} strokeWidth={2} />
                          )}
                        </div>
                        <div className="ledger-meta">
                          <strong className="ledger-title">{kindLabel[e.kind] ?? e.kind}</strong>
                          <span className="ledger-time">{formatLedgerDate(e.created_at)}</span>
                        </div>
                      </div>
                      <div className="ledger-right">
                        <span className={"ledger-amount " + (isCredit ? "credit" : "debit")}>
                          {isCredit ? "+ " : "- "}
                          {money(Math.abs(e.amount_paise))}
                        </span>
                        <IconChevronRight size={16} className="ledger-chevron" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Right Column on Desktop */}
        <div className="wallet-col wallet-col-right">
          {/* 3. Promo codes Card */}
          <section className="wallet-card promo-codes-card">
            <div className="wallet-card-header">
              <div className="wallet-icon-box promo">
                <IconPercentage size={22} />
              </div>
              <div className="wallet-card-titles">
                <h3>Promo codes</h3>
                <p>Enter a promo code on the Confirm step when you book.</p>
              </div>
            </div>

            <form
              className="promo-input-row"
              onSubmit={(e) => {
                e.preventDefault();
                handleApplyPromo();
              }}
            >
              <input
                type="text"
                className="promo-input"
                placeholder="Enter promo code"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                aria-label="Enter promo code"
              />
              <button type="submit" className="promo-apply-btn">
                Apply
              </button>
            </form>
          </section>

          {/* 4. WHY ADD MONEY? Card */}
          <section className="wallet-card why-add-money-card">
            <span className="why-add-eyebrow">WHY ADD MONEY?</span>
            <div className="why-add-grid">
              <div className="why-add-item">
                <div className="why-icon-badge">
                  <IconBolt size={20} strokeWidth={2.2} />
                </div>
                <strong>Faster checkout</strong>
                <span>Pay in one tap</span>
              </div>

              <div className="why-add-item">
                <div className="why-icon-badge">
                  <IconShieldCheck size={20} strokeWidth={2.2} />
                </div>
                <strong>Safe & secure</strong>
                <span>Powered by trusted partners</span>
              </div>

              <div className="why-add-item">
                <div className="why-icon-badge">
                  <IconRotateClockwise size={20} strokeWidth={2.2} />
                </div>
                <strong>Instant refunds</strong>
                <span>Unspent balance is refunded instantly</span>
              </div>
            </div>
          </section>

          {/* 5. Save more with promo codes Card */}
          <section className="wallet-card save-more-card">
            <div className="save-more-art">
              <GiftBoxArt />
            </div>
            <div className="save-more-content">
              <h4>Save more with promo codes</h4>
              <p>Get discounts, offers and rewards on your rides.</p>
              <button
                type="button"
                className="save-more-btn"
                onClick={() => setShowOffersModal(true)}
              >
                <span>View active offers</span>
                <IconChevronRight size={16} />
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
