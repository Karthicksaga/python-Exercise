import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "./api";
import { money, type PayMethod, type Ride } from "./types";
import OnlinePay from "./OnlinePay";

export default function PaymentSettlementSheet({
  ride,
  refresh,
  notify,
  busy,
  action,
  onlineOK,
}: {
  ride: Ride;
  refresh: () => Promise<void>;
  notify: (msg: string) => void;
  busy: boolean;
  action: (act: string, confirm?: boolean, finalFare?: number) => Promise<void> | void;
  onlineOK: boolean;
}) {
  const [method, setMethod] = useState<PayMethod>(ride.payment_method);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [reportedPaid, setReportedPaid] = useState(false);

  const payable = ride.payable_paise ?? Math.max(0, ride.fare_paise - (ride.discount_paise ?? 0));
  const payableRupees = (payable / 100).toFixed(2).replace(/\.00$/, "");

  // Update local method if ride updates
  useEffect(() => {
    setMethod(ride.payment_method);
  }, [ride.payment_method]);

  // Fetch wallet balance when relevant
  useEffect(() => {
    if (ride.mine) {
      api<{ balance_paise: number }>("/api/wallet")
        .then((w) => setWalletBalance(w.balance_paise))
        .catch(() => setWalletBalance(null));
    }
  }, [ride.mine]);

  // Generate UPI QR Code and deep link when method is upi and driver_upi exists
  const upiId = ride.driver_upi || "";
  const driverName = ride.driver_name || "Hop Driver";
  const upiUri = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(driverName)}&am=${payableRupees}&cu=INR&tn=${encodeURIComponent("HopRide-" + ride.id.slice(0, 8))}`
    : "";

  useEffect(() => {
    if (method === "upi" && upiUri) {
      QRCode.toDataURL(upiUri, {
        width: 220,
        margin: 1,
        color: {
          dark: "#1e1e24",
          light: "#ffffff",
        },
      })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(""));
    } else {
      setQrDataUrl("");
    }
  }, [method, upiUri]);

  const handleMethodSwitch = async (newMethod: PayMethod) => {
    if (newMethod === method || busy) return;
    try {
      await api(`/api/rides/${ride.id}/actions`, {
        action: "change_payment_method",
        version: ride.version,
        payment_method: newMethod,
      });
      setMethod(newMethod);
      await refresh();
      notify(`Switched payment to ${newMethod.toUpperCase()}`);
    } catch (err: any) {
      notify(err.message || "Could not switch payment method");
    }
  };

  const handleNotifyPaid = async () => {
    try {
      await api(`/api/rides/${ride.id}/actions`, {
        action: "notify_driver_paid",
        version: ride.version,
      });
      setReportedPaid(true);
      notify("Driver notified that payment was sent!");
    } catch (err: any) {
      notify(err.message || "Failed to notify driver");
    }
  };

  const copyUpi = () => {
    if (!upiId) return;
    navigator.clipboard.writeText(upiId).then(() => {
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2500);
    });
  };

  const isConfirmed =
    ride.payment_status === "paid_online" ||
    ride.payment_status === "driver_reported_received";

  const isDisputed = ride.payment_status === "rider_disputed";

  return (
    <div className="payment-settlement-sheet">
      <div className="settlement-header">
        <div className="settlement-title-row">
          <div>
            <span className="settlement-badge">Trip Completed · Pay at Drop-off</span>
            <h3 className="settlement-amount">{money(payable)}</h3>
          </div>
          {isConfirmed ? (
            <span className="payment-status-pill success">
              <span className="status-dot green" /> Paid & Confirmed
            </span>
          ) : isDisputed ? (
            <span className="payment-status-pill danger">
              <span className="status-dot red" /> Under Dispute
            </span>
          ) : (
            <span className="payment-status-pill pending">
              <span className="status-dot yellow" /> Payment Pending
            </span>
          )}
        </div>

        {ride.discount_paise ? (
          <p className="settlement-fare-note">
            Includes discount of {money(ride.discount_paise)}
            {ride.promo_code ? ` (${ride.promo_code})` : ""}
          </p>
        ) : null}
      </div>

      {/* Driver View */}
      {ride.driving && (
        <div className="driver-settlement-view">
          <p className="driver-payment-instruction">
            Rider chose to pay with:{" "}
            <strong>
              {method === "wallet"
                ? "Hop Wallet (Settled automatically)"
                : method === "upi"
                ? `Direct UPI (${ride.driver_upi || "your UPI"})`
                : "Cash directly to you"}
            </strong>
          </p>
          {ride.payment_status === "unconfirmed" && (
            <button
              className="primary large-btn confirm-received-btn"
              disabled={busy}
              onClick={() => action("payment_received")}
            >
              ✅ I Received {money(payable)}
            </button>
          )}
        </div>
      )}

      {/* Rider View */}
      {ride.mine && !isConfirmed && (
        <div className="rider-settlement-content">
          {/* Method Switcher Header */}
          <div className="method-switcher-bar">
            <span className="method-label">Pay via:</span>
            <div className="method-pills">
              <button
                type="button"
                className={`method-pill ${method === "upi" ? "active" : ""}`}
                disabled={busy}
                onClick={() => handleMethodSwitch("upi")}
              >
                ⚡ UPI
              </button>
              <button
                type="button"
                className={`method-pill ${method === "cash" ? "active" : ""}`}
                disabled={busy}
                onClick={() => handleMethodSwitch("cash")}
              >
                💵 Cash
              </button>
              <button
                type="button"
                className={`method-pill ${method === "wallet" ? "active" : ""}`}
                disabled={busy}
                onClick={() => handleMethodSwitch("wallet")}
              >
                👛 Wallet {walletBalance != null ? `(${money(walletBalance)})` : ""}
              </button>
            </div>
          </div>

          {/* UPI Method Details */}
          {method === "upi" && (
            <div className="upi-settlement-card">
              {upiId ? (
                <>
                  <p className="upi-prompt">
                    Scan with any UPI App (GPay, PhonePe, Paytm, BHIM) to pay driver:
                  </p>
                  {qrDataUrl && (
                    <div className="upi-qr-wrapper">
                      <img src={qrDataUrl} alt="UPI Payment QR Code" className="upi-qr-img" />
                      <span className="qr-caption">Scan to pay {money(payable)}</span>
                    </div>
                  )}

                  <div className="upi-actions">
                    <a
                      href={upiUri}
                      className="primary button upi-deeplink-btn"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      🚀 Open UPI App ({money(payable)})
                    </a>

                    <div className="upi-id-box">
                      <span className="upi-id-text">{upiId}</span>
                      <button
                        type="button"
                        className="copy-upi-btn"
                        onClick={copyUpi}
                        title="Copy UPI ID"
                      >
                        {copiedUpi ? "✓ Copied" : "Copy"}
                      </button>
                    </div>

                    {!reportedPaid ? (
                      <button
                        type="button"
                        className="secondary notify-paid-btn"
                        disabled={busy}
                        onClick={handleNotifyPaid}
                      >
                        I have transferred {money(payable)}
                      </button>
                    ) : (
                      <div className="paid-waiting-banner">
                        ⏳ Driver notified. Waiting for driver confirmation...
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="no-upi-fallback">
                  <p className="muted">
                    Driver has not provided a UPI ID. Please pay in Cash or using Hop Wallet.
                  </p>
                  <div className="fallback-buttons">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => handleMethodSwitch("cash")}
                    >
                      Switch to Cash
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleMethodSwitch("wallet")}
                    >
                      Switch to Wallet
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cash Method Details */}
          {method === "cash" && (
            <div className="cash-settlement-card">
              <div className="cash-icon-row">
                <span className="big-cash-emoji">💵</span>
                <div>
                  <h4>Hand {money(payable)} in cash</h4>
                  <p className="muted">
                    Give exact cash to {ride.driver_name || "your driver"}. Driver will confirm receipt.
                  </p>
                </div>
              </div>

              {/* Quick Change Assistant */}
              <div className="change-assistant">
                <span className="assistant-title">Need change?</span>
                <div className="change-chips">
                  {payable < 50000 && (
                    <span className="change-chip">
                      Pay ₹500 → Return <strong>{money(50000 - payable)}</strong>
                    </span>
                  )}
                  {payable < 20000 && (
                    <span className="change-chip">
                      Pay ₹200 → Return <strong>{money(20000 - payable)}</strong>
                    </span>
                  )}
                </div>
              </div>

              {!reportedPaid ? (
                <button
                  type="button"
                  className="secondary notify-paid-btn"
                  disabled={busy}
                  onClick={handleNotifyPaid}
                >
                  I have handed {money(payable)} cash to driver
                </button>
              ) : (
                <div className="paid-waiting-banner">
                  ⏳ Driver notified of cash handover.
                </div>
              )}
            </div>
          )}

          {/* Wallet Method Details */}
          {method === "wallet" && (
            <div className="wallet-settlement-card">
              {walletBalance != null && walletBalance >= payable ? (
                <div className="wallet-sufficient">
                  <p>
                    Wallet Balance: <strong>{money(walletBalance)}</strong>
                  </p>
                  <p className="muted">
                    {ride.payment_status === "paid_online"
                      ? "This trip was paid automatically from your Hop Wallet."
                      : "Deduct trip fare directly from your available balance."}
                  </p>
                  {ride.payment_status !== "paid_online" && (
                    <button
                      type="button"
                      className="primary button"
                      disabled={busy}
                      onClick={() => handleMethodSwitch("wallet")}
                    >
                      Pay {money(payable)} from Wallet
                    </button>
                  )}
                </div>
              ) : (
                <div className="wallet-shortfall">
                  <p className="danger-text">
                    ⚠️ Insufficient balance in Hop Wallet:{" "}
                    <strong>{walletBalance != null ? money(walletBalance) : "₹0"}</strong> (Needed:{" "}
                    <strong>{money(payable)}</strong>)
                  </p>
                  <p className="muted">Please switch to UPI or Cash to settle with your driver:</p>
                  <div className="fallback-buttons">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => handleMethodSwitch("upi")}
                    >
                      ⚡ Pay with UPI
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleMethodSwitch("cash")}
                    >
                      💵 Pay with Cash
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Online Gateway Option (Razorpay) */}
          {onlineOK && ride.payment_status === "unconfirmed" && (
            <div className="online-pay-subcard">
              <span className="or-divider">── OR ──</span>
              <OnlinePay rideId={ride.id} refresh={refresh} notify={notify} />
            </div>
          )}
        </div>
      )}

      {/* Confirmation Banner */}
      {isConfirmed && (
        <div className="settlement-confirmed-banner">
          <span className="success-icon">🎉</span>
          <div>
            <strong>Payment Confirmed!</strong>
            <p className="muted">
              {ride.payment_status === "paid_online"
                ? "Paid online / wallet."
                : "Driver confirmed payment received."}
            </p>
          </div>
        </div>
      )}

      {/* Dispute Link for Rider */}
      {ride.mine && !isDisputed && ride.payment_status !== "paid_online" && (
        <div className="settlement-footer">
          <button
            type="button"
            className="text-button dispute-link"
            disabled={busy}
            onClick={() => action("payment_disputed")}
          >
            Dispute payment record
          </button>
        </div>
      )}
    </div>
  );
}
