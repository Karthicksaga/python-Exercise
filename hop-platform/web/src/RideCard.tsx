import { useState } from "react";
import { api } from "./api";
import { active, money, statuses, type Ride } from "./types";
export default function RideCard({
  ride: r,
  refresh,
  notify,
  offer = false,
}: {
  ride: Ride;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  offer?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [code, setCode] = useState(""),
    [reason, setReason] = useState(""),
    [cancel, setCancel] = useState(false),
    [report, setReport] = useState(false),
    [message, setMessage] = useState("");
  async function action(name: string) {
    setBusy(true);
    try {
      await api(`/api/rides/${r.id}/actions`, {
        action: name,
        version: r.version,
        code,
        reason,
      });
      await refresh();
      notify(
        name === "complete"
          ? "Trip completed. Payment remains unconfirmed until reported."
          : "Ride updated.",
      );
    } catch (e) {
      notify((e as Error).message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function incident() {
    setBusy(true);
    try {
      await api("/api/incidents", { ride_id: r.id, message });
      setReport(false);
      setMessage("");
      await refresh();
      notify("Report saved for operator review.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="ride-card">
      <div className="card-top">
        <span className="pill">
          {offer ? "Nearby request" : statuses[r.status] || r.status}
        </span>
        <strong>{money(r.fare_paise)}</strong>
      </div>
      <div className="stops">
        <p>
          <i className="stop-dot" />
          {r.pickup_label}
        </p>
        <p>
          <i className="stop-dot destination" />
          {r.dropoff_label}
        </p>
      </div>
      <p className="muted">
        {(r.meters / 1000).toFixed(1)} km · about {Math.ceil(r.seconds / 60)}{" "}
        min · {r.payment_method === "upi" ? "Direct UPI" : "Cash"} · ₹0 platform
        fee
      </p>
      {r.driver_name && (
        <p>
          <strong>{r.driver_name}</strong> · {r.vehicle_number}
        </p>
      )}
      {r.rider_name && <p>Rider: {r.rider_name}</p>}
      {r.pickup_code && (
        <div className="pickup-code">
          <small>Share only when you meet your driver</small>
          <strong>{r.pickup_code}</strong>
        </div>
      )}
      {r.driving && active(r) && (
        <a
          className="navigation"
          target="_blank"
          rel="noreferrer"
          href={`https://www.google.com/maps/dir/?api=1&destination=${r.status === "in_progress" ? r.dropoff_lat : r.pickup_lat},${r.status === "in_progress" ? r.dropoff_lng : r.pickup_lng}&travelmode=driving`}
        >
          Open navigation
        </a>
      )}
      {r.mine && ["accepted", "arrived", "in_progress"].includes(r.status) && (
        <p className="muted">
          {r.driver_lat != null
            ? "Driver location updated recently."
            : "Waiting for a fresh driver location."}
        </p>
      )}
      <div className="actions">
        {offer && (
          <button disabled={busy} onClick={() => action("accept")}>
            Accept ride
          </button>
        )}
        {r.driving && r.status === "accepted" && (
          <button disabled={busy} onClick={() => action("arrive")}>
            I’m at pickup
          </button>
        )}
        {r.driving && r.status === "arrived" && (
          <>
            <label>
              Rider’s pickup code
              <input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            <button
              disabled={busy || code.length !== 6}
              onClick={() => action("start")}
            >
              Start ride
            </button>
          </>
        )}
        {r.driving && r.status === "in_progress" && (
          <button disabled={busy} onClick={() => action("complete")}>
            Complete ride
          </button>
        )}
        {!offer &&
          (r.mine || r.driving) &&
          ["requested", "accepted", "arrived"].includes(r.status) && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setCancel(!cancel)}
            >
              Cancel ride
            </button>
          )}
      </div>
      {cancel && (
        <div className="inset">
          <label>
            Cancellation reason
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
            />
          </label>
          <button
            className="danger"
            disabled={busy || reason.trim().length < 3}
            onClick={() => action("cancel")}
          >
            Confirm cancellation
          </button>
        </div>
      )}
      {r.status === "completed" && (
        <div className="settlement">
          <strong>Pay your driver directly</strong>
          {r.driver_upi && (
            <p>
              Driver’s UPI ID: <strong>{r.driver_upi}</strong>
            </p>
          )}
          <p className="muted">
            {r.payment_status === "unconfirmed"
              ? "Payment has not been confirmed."
              : r.payment_status === "driver_reported_received"
                ? "Driver reported receiving payment."
                : "Payment disputed — operator review needed."}
          </p>
          {r.driving && r.payment_status === "unconfirmed" && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => action("payment_received")}
            >
              I received payment
            </button>
          )}
          {r.mine && r.payment_status !== "rider_disputed" && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => action("payment_disputed")}
            >
              Dispute payment record
            </button>
          )}
        </div>
      )}
      {!offer && (
        <button className="text-button" onClick={() => setReport(!report)}>
          Report a ride issue
        </button>
      )}
      {report && (
        <div className="inset">
          <label>
            What happened?
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
            />
          </label>
          <p className="muted">
            For immediate danger, call 112. This report is not an emergency
            dispatch service.
          </p>
          <button
            disabled={busy || message.trim().length < 5}
            onClick={incident}
          >
            Send report
          </button>
        </div>
      )}
    </article>
  );
}
