import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { active, type Area, type State } from "./types";
import RideCard from "./RideCard";
export default function DriverPanel({
  data,
  areas,
  refresh,
  notify,
}: {
  data: State;
  areas: Area[];
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const d = data.driver[0],
    current = data.rides.find((r) => r.driving && active(r));
  const [sharing, setSharing] = useState(false),
    [busy, setBusy] = useState(false),
    [locationStatus, setLocationStatus] = useState("");
  const inFlight = useRef(false);
  useEffect(() => {
    if (!sharing) return;
    let cancelled = false;
    async function heartbeat() {
      if (inFlight.current || document.visibilityState !== "visible") return;
      inFlight.current = true;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 12000,
          }),
        );
        if (cancelled) return;
        await api("/api/drivers/location", {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.max(1, pos.coords.accuracy),
        });
        if (!cancelled) {
          setLocationStatus(
            "Location updated. You can receive nearby requests.",
          );
          await refresh();
        }
      } catch (e) {
        if (!cancelled) {
          setLocationStatus((e as Error).message);
          setSharing(false);
          void api("/api/drivers/offline", {}).catch(() => {});
        }
      } finally {
        inFlight.current = false;
      }
    }
    void heartbeat();
    const timer = setInterval(heartbeat, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      void api("/api/drivers/offline", {}).catch(() => {});
    };
  }, [sharing, refresh]);
  async function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api("/api/drivers/apply", form);
      await refresh();
      notify(
        "Application submitted. An operator must verify and approve your documents before you can drive.",
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!d)
    return (
      <section className="panel narrow">
        <p className="eyebrow">DRIVE WITH HOP</p>
        <h2>Your work. Your fare.</h2>
        <p className="muted">
          Apply to drive in an active service area. An operator reviews your
          licence, vehicle and insurance before approval.
        </p>
        {!areas.length ? (
          <div className="empty">
            Driver applications open when service areas become available.
          </div>
        ) : (
          <form onSubmit={apply}>
            <label>
              Service area
              <select name="area_id" required>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}, {a.state}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Vehicle registration
              <input
                name="vehicle_number"
                required
                minLength={6}
                maxLength={20}
              />
            </label>
            <label>
              UPI ID (optional)
              <input name="upi_id" placeholder="yourname@bank" />
            </label>
            <p className="muted">
              Use the verification references supplied by your operator after
              sharing documents through their approved private process. Do not
              paste document images or public file links here.
            </p>
            <label>
              Driving licence verification reference
              <input
                name="license_reference"
                required
                minLength={5}
                maxLength={160}
              />
            </label>
            <label>
              Licence expiry
              <input name="license_expires" type="date" required />
            </label>
            <label>
              Insurance verification reference
              <input
                name="insurance_reference"
                required
                minLength={5}
                maxLength={160}
              />
            </label>
            <label>
              Insurance expiry
              <input name="insurance_expires" type="date" required />
            </label>
            <button disabled={busy}>Submit for review</button>
          </form>
        )}
      </section>
    );
  const fresh = d.online && Date.now() - Date.parse(d.location_at) < 60000;
  return (
    <>
      <section className="panel driver-heading">
        <div>
          <p className="eyebrow">DRIVER WORKSPACE</p>
          <h2>
            {d.status === "approved"
              ? "Ready for your next ride?"
              : "Your application"}
          </h2>
          <p>
            {d.vehicle_number} <span className="pill">{d.status}</span>
          </p>
          {d.review_note && <p className="muted">{d.review_note}</p>}
        </div>
        {d.status === "approved" && (
          <div>
            <button
              className={sharing ? "secondary" : ""}
              onClick={() => {
                if (!navigator.geolocation) {
                  notify("This browser does not support location.");
                  return;
                }
                setSharing(!sharing);
              }}
            >
              {sharing ? "Go offline" : "Go online & share location"}
            </button>
            <p className="muted">
              {fresh ? "● Location is fresh" : "○ Not receiving requests yet"}
            </p>
          </div>
        )}
      </section>
      {d.status === "approved" && (
        <div className="tip">
          Keep this screen open while driving. Location stops updating when your
          browser suspends the page. Drivers without a fresh location cannot
          accept new rides.
        </div>
      )}
      {locationStatus && (
        <p role="status" className="muted">
          {locationStatus}
        </p>
      )}
      {current ? (
        <RideCard ride={current} refresh={refresh} notify={notify} />
      ) : (
        d.status === "approved" && (
          <section>
            <h3>Nearby requests</h3>
            {data.offers.length ? (
              <div className="ride-grid">
                {data.offers.map((r) => (
                  <RideCard
                    key={r.id}
                    ride={r}
                    offer
                    refresh={refresh}
                    notify={notify}
                  />
                ))}
              </div>
            ) : (
              <div className="empty">
                No available requests within 3 km. You must be online with a
                recent, accurate location.
              </div>
            )}
          </section>
        )
      )}
    </>
  );
}
