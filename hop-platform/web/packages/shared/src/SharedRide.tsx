import { useEffect, useState } from "react";
import { Switch } from "@mantine/core";
import { api } from "./api";
import { money, type Quote, type Ride } from "./types";

export type StopPlan = { ride_id: string; kind: "pickup" | "drop"; label: string; rider: string };

export function ShareToggle({ quote, value, onChange }: { quote: Quote; value: boolean; onChange: (v: boolean) => void }) {
  if (!quote.shared_fare_paise) return null;
  const saving = quote.fare_paise - quote.shared_fare_paise;
  return (
    <div className="share-toggle">
      <Switch
        checked={value}
        onChange={(e) => onChange(e.currentTarget.checked)}
        label={`Share this ride and save ${money(saving)}`}
        description={`Ride with one other rider heading the same way. You pay ${money(quote.shared_fare_paise)} and keep your own pickup code. If nobody matches within ${Math.round((quote.share_wait_seconds ?? 180) / 60)} min you still get a normal ride at the shared price.`}
      />
    </div>
  );
}

// The ordered stops of a shared trip. Drivers see every address; riders only see their own.
export function StopList({ plan, rideId }: { plan: StopPlan[]; rideId?: string }) {
  return (
    <ol className="stop-list">
      {plan.map((s, i) => (
        <li key={i} className={`${s.kind}${rideId && s.ride_id === rideId ? " mine" : ""}`}>
          <b>{i + 1}</b>
          <span>
            {s.kind === "pickup" ? "Pick up" : "Drop"} {s.rider || ""}
            <small>{s.label}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function SharedRide({ ride, offer, refresh, notify }: { ride: Ride; offer?: boolean; refresh: () => Promise<void>; notify: (s: string) => void }) {
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (ride.share_state !== "waiting") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ride.share_state]);
  if (!ride.share_state || ride.share_state === "none") return null;
  async function act(action: string) {
    setBusy(true);
    try {
      await api(`/api/rides/${ride.id}/actions`, { action, version: ride.version });
      await refresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const mineWaiting = ride.mine && ride.status === "requested";
  const left = Math.max(0, Math.ceil((Date.parse(ride.share_until ?? "") - now) / 1000));
  return (
    <div className="shared-ride" role="status">
      <span className="chip shared-chip">👥 Shared ride</span>
      {offer && ride.stop_plan && (
        <>
          <p><strong>2 riders · total {money(ride.fare_paise)}</strong> <small className="muted">(both fares, more than a single ride)</small></p>
          <StopList plan={ride.stop_plan} />
        </>
      )}
      {!offer && ride.stop_plan && ride.status !== "requested" && <StopList plan={ride.stop_plan} rideId={ride.id} />}
      {mineWaiting && ride.share_state === "waiting" && (
        <>
          <p>Looking for a rider going your way… <strong>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</strong></p>
          <div className="share-actions">
            <button type="button" className="secondary" disabled={busy} onClick={() => act("stop_waiting")}>Ride now at {money(ride.fare_paise)}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => act("pay_full_fare")}>Pay full fare {money(ride.quoted_fare_paise ?? ride.fare_paise)}</button>
          </div>
        </>
      )}
      {mineWaiting && ride.share_state === "matched" && <p>Matched{ride.co_rider ? ` with ${ride.co_rider.name}` : ""}. You pay only your {money(ride.payable_paise ?? ride.fare_paise)}; the driver is being alerted.</p>}
      {mineWaiting && ride.share_state === "solo_shared" && (
        <>
          <p>No match yet, so this is a normal ride at the shared price {money(ride.fare_paise)}. A rider may still join.</p>
          <div className="share-actions">
            <button type="button" className="secondary" disabled={busy} onClick={() => act("pay_full_fare")}>Pay full fare {money(ride.quoted_fare_paise ?? ride.fare_paise)}</button>
          </div>
        </>
      )}
      {!offer && ride.mine && ride.status !== "requested" && ride.co_rider && <p className="muted">Sharing with {ride.co_rider.name}. Use only your own pickup code.</p>}
      {!offer && ride.driving && ride.co_rider && <p className="muted">Co-rider: {ride.co_rider.name} ({ride.co_rider.status.replace("_", " ")}). Each rider has their own code and fare.</p>}
    </div>
  );
}
