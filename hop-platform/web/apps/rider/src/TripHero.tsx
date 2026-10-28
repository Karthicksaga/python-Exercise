import { PrivateImage } from "@hop/shared/TrustProfile";
import { serverURL, shareTrip } from "@hop/shared/platform";
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
  const [ridecheck, setRidecheck] = useState(false);
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
      const url = new URL(serverURL(out.path), location.origin).href;
      setLink(url);
      await shareTrip(url).catch(() => undefined);
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
            {r.driver_has_photo && r.driver_id ? <PrivateImage accountId={r.driver_id} alt="Your captain" className="captain-portrait" /> : initial}
          </div>
          <div className="driver-info">
            <strong>{r.driver_name}</strong>
            <span className="muted">
              {r.driver_rating ? `★ ${r.driver_rating}${r.driver_rating_count ? ` (${r.driver_rating_count})` : ""}` : t("rating.new")}
              {r.driver_trips ? ` · ${r.driver_trips} trips` : ""}
            </span>
            {r.vehicle_number && <span className="plate">{r.vehicle_number}</span>}
            <small>{[r.vehicle_color,r.vehicle_make,r.vehicle_model].filter(Boolean).join(" · ")}</small>
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
        {r.status === "in_progress" && (
          <button type="button" className="ridecheck-trigger-btn" onClick={() => setRidecheck(true)}>
            <span aria-hidden>🛡️</span>RideCheck™
          </button>
        )}
        <a className="button" href="tel:112">
          <span aria-hidden>📞</span>Call 112
        </a>
        <button type="button" className="danger" onClick={sos}>
          <span aria-hidden>🚨</span>SOS
        </button>
      </div>
      {ridecheck && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="RideCheck Anomaly Detection" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "16px" }}>
          <div className="modal-sheet" style={{ background: "var(--bg, #fff)", borderRadius: "16px", padding: "20px", maxWidth: "400px", width: "100%", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <span style={{ fontSize: "32px" }}>🛡️</span>
              <h2 style={{ margin: "8px 0 4px", fontSize: "1.25rem" }}>Is everything okay?</h2>
              <p style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.4 }}>
                Hop detected that your ride has been stationary for over 4 minutes away from traffic signals.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
              <button
                className="primary"
                type="button"
                onClick={() => {
                  setRidecheck(false);
                  notify("RideCheck: Marked safe - continuing on route");
                }}
              >
                I’m fine, just stopped in traffic
              </button>
              <button
                className="secondary"
                type="button"
                style={{ color: "var(--danger, #dc2626)", borderColor: "var(--danger, #dc2626)" }}
                onClick={() => {
                  setRidecheck(false);
                  sos();
                }}
              >
                Need help / Emergency SOS
              </button>
            </div>
            <p className="muted" style={{ fontSize: "0.75rem", marginTop: 14, textAlign: "center" }}>
              RideCheck™ uses GPS motion telemetry to proactively check on riders during unexpected delays.
            </p>
          </div>
        </div>
      )}
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
