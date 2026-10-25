import { useState } from "react";
import { api } from "@hop/shared/api";
import RideChat from "@hop/shared/RideChat";
import VehicleArt from "@hop/shared/VehicleArt";
import { money, type Ride } from "@hop/shared/types";
import { t } from "@hop/shared/i18n";

const headline: Record<string, string> = {
  accepted: "Your driver is on the way",
  arrived: "Your driver has arrived",
  in_progress: "You're on your trip",
};

// Rider-facing summary of an active trip: driver, plate, PIN and one-tap safety/communication actions.
export default function TripHero({ ride: r, notify }: { ride: Ride; notify: (s: string) => void }) {
  const [chat, setChat] = useState(false);
  const [link, setLink] = useState("");
  const minutes = r.eta_seconds ? Math.max(1, Math.round(r.eta_seconds / 60)) : null;
  const initial = (r.driver_name || "D").trim().charAt(0).toUpperCase();

  const sos = () => {
    if (!confirm("Send an SOS alert to hop operators? If you are in danger call 112.")) return;
    const send = (lat?: number, lng?: number) =>
      api(`/api/rides/${r.id}/sos`, lat === undefined ? {} : { lat, lng })
        .then(() => notify("SOS sent. Call 112 if you are in danger."))
        .catch((e: Error) => notify(e.message));
    if (!navigator.geolocation) return send();
    navigator.geolocation.getCurrentPosition((p) => send(p.coords.latitude, p.coords.longitude), () => send(), { timeout: 4000 });
  };
  const share = async () => {
    try {
      const out = await api<{ path: string }>(`/api/rides/${r.id}/share`, {});
      const url = location.origin + out.path;
      setLink(url);
      if (navigator.share) await navigator.share({ title: "Follow my hop trip", url }).catch(() => undefined);
      else await navigator.clipboard?.writeText(url).catch(() => undefined);
      notify("Trip link ready to share");
    } catch (e) {
      notify((e as Error).message);
    }
  };

  return (
    <section className={"trip-hero " + r.status} aria-label="Current trip">
      <div className="hero-top">
        <div>
          <p className="eyebrow">{r.status === "in_progress" ? "LIVE TRIP" : "YOUR RIDE"}</p>
          <h2>{headline[r.status] ?? "Trip"}</h2>
        </div>
        {minutes !== null && (
          <div className="hero-eta">
            <strong>{minutes}</strong>
            <span>min</span>
          </div>
        )}
      </div>
      {r.driver_name && (
        <div className="driver-card">
          <div className="avatar" aria-hidden>
            {initial}
          </div>
          <div className="driver-info">
            <strong>{r.driver_name}</strong>
            <span className="muted">
              {r.driver_rating ? `★ ${r.driver_rating}${r.driver_rating_count ? ` (${r.driver_rating_count})` : ""}` : t("rating.new")}
              {r.driver_trips ? ` · ${r.driver_trips} trips` : ""}
            </span>
            {r.vehicle_number && <span className="plate">{r.vehicle_number}</span>}
          </div>
          <VehicleArt category={r.vehicle_category} width={84} />
        </div>
      )}
      {r.pickup_code && r.status !== "in_progress" && (
        <div className="pin-box">
          <span>Share this PIN to start your ride</span>
          <strong>{r.pickup_code}</strong>
        </div>
      )}
      <div className="quick-actions">
        <button type="button" onClick={() => setChat((v) => !v)} aria-pressed={chat}>
          <span aria-hidden>💬</span>Chat
        </button>
        <button type="button" onClick={share}>
          <span aria-hidden>📍</span>Share trip
        </button>
        <a className="button" href="tel:112">
          <span aria-hidden>📞</span>Call 112
        </a>
        <button type="button" className="danger" onClick={sos}>
          <span aria-hidden>🚨</span>SOS
        </button>
      </div>
      {link && (
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Trip share link" />
      )}
      {chat && <RideChat rideId={r.id} as="rider" onClose={() => setChat(false)} notify={notify} />}
      <p className="muted hero-fare">
        {r.pickup_label} → {r.dropoff_label} · {money(r.fare_paise)}
      </p>
    </section>
  );
}
