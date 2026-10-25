import { useState } from "react";
import { api } from "./api";
import { money, type Ride } from "./types";

// Rider: choose a driver's counter-offer. Driver: send a counter-offer on a nearby request.
export default function RideNegotiation({
  ride: r,
  offer,
  refresh,
  notify,
}: {
  ride: Ride;
  offer: boolean;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(path: string, body: unknown, ok: string) {
    setBusy(true);
    try {
      await api(path, body);
      await refresh();
      notify(ok);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const base = r.quoted_fare_paise ?? r.fare_paise;
  if (offer) {
    return (
      <div className="inset">
        {r.negotiated && <p className="muted">Rider offered {money(r.fare_paise)} (quoted {money(base)}).</p>}
        <label>
          Counter-offer (₹)
          <input
            type="number"
            min={(base * 0.7) / 100}
            max={(base * 1.5) / 100}
            step="0.5"
            value={amount}
            placeholder={r.my_bid_paise ? String(r.my_bid_paise / 100) : String(r.fare_paise / 100)}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          />
        </label>
        <button
          className="secondary"
          disabled={busy || !(Number(amount) * 100 >= base * 0.7 && Number(amount) * 100 <= base * 1.5)}
          onClick={() => run(`/api/rides/${r.id}/bids`, { amount_paise: Math.round(Number(amount) * 100) }, "Counter-offer sent.")}
        >
          {r.my_bid_paise ? `Update offer (${money(r.my_bid_paise)})` : "Send counter-offer"}
        </button>
      </div>
    );
  }
  if (!r.mine || r.status !== "requested") return null;
  if (r.reserved_driver_name && r.reserved_until && Date.parse(r.reserved_until) > Date.now()) {
    return (
      <div className="inset">
        <strong>Waiting for {r.reserved_driver_name} to confirm</strong>
        <p className="muted">
          You chose their offer of {money(r.fare_paise)}. They have until {new Date(r.reserved_until).toLocaleTimeString()} to accept; otherwise other offers reopen.
        </p>
      </div>
    );
  }
  if (!r.bids?.length) return null;
  return (
    <div className="inset">
      <strong>Driver offers</strong>
      <ul className="plain">
        {r.bids.map((b) => (
          <li key={b.id} className="row">
            <span>
              {b.driver_name} · {b.vehicle_number} — {money(b.amount_paise)}
            </span>
            <button disabled={busy} onClick={() => run(`/api/rides/${r.id}/bids/${b.id}/accept`, {}, "Offer chosen. The driver has 60 seconds to confirm.")}>
              Choose
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
