import { applicationProblem, today } from "@hop/shared/validate";
import { driverAlert, goOfflineSound, goOnlineSound } from "@hop/shared/sounds";
import { useEffect, useRef, useState } from "react";
import { api } from "@hop/shared/api";
import { active, money, type Area, type Driver, type State, type VehicleChange as VehicleChangeRequest } from "@hop/shared/types";
import RideCard from "@hop/shared/RideCard";
import RideChat from "@hop/shared/RideChat";
import DriverMap from "./DriverMap";
import DriverTools from "./DriverTools";
import { t, useLang } from "@hop/shared/i18n";
import Icon from "@hop/shared/Icons";
import DriverInsights from "./DriverInsights";
import DriverMoney from "./DriverMoney";

type EarningsSummary = {
  today_completed_trips: number;
  today_fare_paise: number;
  today_reported_paid_paise: number;
  week_completed_trips: number;
  week_fare_paise: number;
  week_reported_paid_paise: number;
  month_completed_trips: number;
  month_fare_paise: number;
  month_reported_paid_paise: number;
  all_time_completed_trips: number;
  all_time_fare_paise: number;
  all_time_reported_paid_paise: number;
};
type EarningsRide = {
  id: string;
  completed_at: string;
  pickup_label: string;
  dropoff_label: string;
  vehicle_category: string;
  meters: number;
  seconds: number;
  fare_paise: number;
  payment_method: "cash" | "upi";
  payment_status: string;
  rider_name: string;
};
type Earnings = { summary: EarningsSummary; rides: EarningsRide[] };
function VehicleChange({
  current,
  change,
  busy,
  onSubmit,
}: {
  current: Driver;
  change?: VehicleChangeRequest;
  busy: boolean;
  onSubmit: (category: string, number: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pending = change?.status === "pending";
  return (
    <section className="panel vehicle-change">
      <div className="row">
        <strong>Change vehicle</strong>
        {!pending && (
          <button type="button" className="secondary" onClick={() => setOpen(!open)}>
            {open ? "Close" : "Switch vehicle"}
          </button>
        )}
      </div>
      {pending && (
        <p className="muted">
          Waiting for operator approval: {change.vehicle_category} · {change.vehicle_number}
        </p>
      )}
      {change && !pending && (
        <p className="muted">
          Last request {change.status}
          {change.review_note && ` — ${change.review_note}`}
        </p>
      )}
      {open && !pending && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await onSubmit(String(f.get("vehicle_category")), String(f.get("vehicle_number")));
            setOpen(false);
          }}
        >
          <label>
            Vehicle type
            <select name="vehicle_category" defaultValue={current.vehicle_category}>
              <option value="bike">Bike taxi</option>
              <option value="auto">Auto-rickshaw</option>
              <option value="mini">Mini cab</option>
              <option value="sedan">Sedan</option>
              <option value="suv">SUV</option>
            </select>
          </label>
          <label>
            Registration number
            <input name="vehicle_number" required minLength={6} maxLength={20} placeholder="TN 09 AB 1234" />
          </label>
          <button disabled={busy}>Request change</button>
          <p className="muted">An operator verifies the new vehicle. You will go offline once it is approved.</p>
        </form>
      )}
    </section>
  );
}

export default function DriverPanel({
  data,
  areas,
  refresh,
  notify,
  development = false,
}: {
  data: State;
  areas: Area[];
  development?: boolean;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  useLang();
  const d = data.driver[0],
    currents = data.rides.filter((r) => r.driving && active(r)),
    current = currents[0];
  const [chatOpen, setChatOpen] = useState(false),
    [sharing, setSharing] = useState(false),
    [burst, setBurst] = useState(""),
    [busy, setBusy] = useState(false),
    [locationStatus, setLocationStatus] = useState(""),
    [earnings, setEarnings] = useState<Earnings | null>(null),
    [earningsError, setEarningsError] = useState("");
  const inFlight = useRef(false);
  const seenOffers = useRef(0);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    const count = data.offers.length;
    if (count > seenOffers.current) {
      notify("New ride request nearby!");
      driverAlert();
    }
    seenOffers.current = count;
  }, [data.offers.length, notify]);
  const [simulate, setSimulate] = useState(false),
    home = areas.find((a) => a.id === d?.area_id),
    [simLat, setSimLat] = useState(home ? ((home.min_lat + home.max_lat) / 2).toFixed(4) : "12.9759"),
    [simLng, setSimLng] = useState(home ? ((home.min_lng + home.max_lng) / 2).toFixed(4) : "77.6060");
  const simRef = useRef<{ lat: number; lng: number } | null>(null);
  const [autoDrive, setAutoDrive] = useState(false);
  const driveRef = useRef<{ lat: number; lng: number } | null>(null);
  const myPosRef = useRef<{ lat: number; lng: number } | null>(null);
  myPosRef.current = myPos;
  const resumed = useRef(false);
  const lastRefresh = useRef(0);
  useEffect(() => {
    // After a page reload the server still has us online, so keep sending location instead of silently going stale.
    if (!resumed.current && d?.online && d.status === "approved") {
      resumed.current = true;
      setSharing(true);
    }
  }, [d?.online, d?.status]);
  simRef.current =
    development && simulate && Number.isFinite(Number(simLat)) && Number.isFinite(Number(simLng))
      ? { lat: Number(simLat), lng: Number(simLng) }
      : null;
  useEffect(() => {
    if (!d) {
      setEarnings(null);
      return;
    }
    let cancelled = false;
    async function loadEarnings() {
      try {
        const result = await api<Earnings>("/api/drivers/earnings");
        if (!cancelled) {
          setEarnings(result);
          setEarningsError("");
        }
      } catch (e) {
        if (!cancelled) setEarningsError((e as Error).message);
      }
    }
    void loadEarnings();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadEarnings();
    }, 30000);
    const visible = () => {
      if (document.visibilityState === "visible") void loadEarnings();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [d?.user_id]);
  useEffect(() => {
    if (!sharing) return;
    let cancelled = false;
    async function heartbeat() {
      if (inFlight.current || document.visibilityState !== "visible") return;
      inFlight.current = true;
      try {
        const fake = simRef.current ?? (autoDrive ? driveRef.current : null);
        const pos = fake
          ? { coords: { latitude: fake.lat, longitude: fake.lng, accuracy: 10 } }
          : await new Promise<GeolocationPosition>((resolve, reject) =>
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 12000,
              }),
            );
        if (cancelled) return;
        setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        await api("/api/drivers/location", {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.max(1, pos.coords.accuracy),
        });
        if (!cancelled) {
          setLocationStatus(
            "Location updated. You can receive nearby requests.",
          );
          if (Date.now() - lastRefresh.current > 5000) {
            lastRefresh.current = Date.now();
            await refresh();
          }
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
    const timer = setInterval(heartbeat, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sharing, refresh, autoDrive]);
  // Development only: the simulated driver starts ~1.6 km from the pickup and drives to it, then along the trip route.
  const currentRef = useRef(current);
  currentRef.current = current;
  const routeIdx = useRef(0);
  const navRoute = useRef<{ lat: number; lng: number }[]>([]);
  const navKey = current ? `${current.id}:${current.status}` : "";
  useEffect(() => {
    navRoute.current = [];
    if (!development || !sharing || !current || current.status === "arrived" || current.status === "requested") return;
    api<{ route: { lat: number; lng: number }[] }>(`/api/rides/${current.id}/nav`).then((n) => { navRoute.current = n.route; routeIdx.current = 0; }).catch(() => {});
  }, [navKey, sharing]);
  useEffect(() => {
    if (!sharing || !development || !(simulate || autoDrive)) return;
    const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const dy = (b.lat - a.lat) * 111320;
      const dx = (b.lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
      return Math.hypot(dx, dy);
    };
    const timer = setInterval(() => {
      const ride = currentRef.current,
        pos = driveRef.current ?? simRef.current ?? myPosRef.current;
      if (!ride || !pos || ride.status === "arrived") return;
      const pickup = { lat: ride.pickup_lat, lng: ride.pickup_lng };
      let from = pos;
      let target = pickup;
      const road = navRoute.current;
      if (road.length > 1) {
        // Follow the real road geometry returned by the navigation endpoint.
        if (routeIdx.current < 0) routeIdx.current = 0;
        while (routeIdx.current < road.length - 1 && metres(from, road[routeIdx.current]) < 40) routeIdx.current++;
        target = road[Math.min(routeIdx.current, road.length - 1)];
      } else if (ride.status === "in_progress") {
        const route = ride.route ?? [];
        if (routeIdx.current < 0) routeIdx.current = 0;
        while (routeIdx.current < route.length - 1 && metres(from, route[routeIdx.current]) < 120) routeIdx.current++;
        target = route.length ? route[Math.min(routeIdx.current, route.length - 1)] : { lat: ride.dropoff_lat, lng: ride.dropoff_lng };
      }
      const d = metres(from, target);
      const step = 18;
      const next = d <= step ? target : { lat: from.lat + ((target.lat - from.lat) * step) / d, lng: from.lng + ((target.lng - from.lng) * step) / d };
      driveRef.current = next;
      if (simulate) {
        setSimLat(next.lat.toFixed(5));
        setSimLng(next.lng.toFixed(5));
      }
      setMyPos(next);
      void api("/api/drivers/location", { lat: next.lat, lng: next.lng, accuracy: 10 }).catch(() => {});
    }, 1000);
    return () => clearInterval(timer);
  }, [sharing, development, simulate, autoDrive]);
  useEffect(() => {
    if (!current) {
      routeIdx.current = 0;
      driveRef.current = null;
    }
  }, [current?.id]);
  async function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = Object.fromEntries(new FormData(e.currentTarget));
    const problem = applicationProblem(form);
    if (problem) {
      setBusy(false);
      notify(problem);
      return;
    }
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
  async function savePreferences(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/api/drivers/preferences", {
        pickup_radius_meters: Number(form.get("pickup_radius_meters")),
        minimum_fare_paise: Math.round(
          Number(form.get("minimum_fare_rupees")) * 100,
        ),
      });
      await refresh();
      notify("Ride preferences saved. Matching now uses these limits.");
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
          <form onSubmit={apply} noValidate>
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
              Vehicle category
              <select name="vehicle_category" required defaultValue="bike">
                <option value="bike">Bike</option>
                <option value="auto">Auto-rickshaw</option>
                <option value="mini">Mini cab</option>
                <option value="sedan">Sedan</option>
                <option value="suv">SUV</option>
              </select>
            </label>
            <label>
              Vehicle registration
              <input
                name="vehicle_number"
                required
                maxLength={16}
                placeholder="KA01AB1234"
                autoCapitalize="characters"
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
              <input name="license_expires" type="date" required min={today()} />
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
              <input name="insurance_expires" type="date" required min={today()} />
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
              ? t("duty.title")
              : "Your application"}
          </h2>
          <p>
            {d.vehicle_category} · {d.vehicle_number}{" "}
            <span className="pill">{d.status}</span>
          </p>
          {d.review_note && <p className="muted">{d.review_note}</p>}
        </div>
        {d.status === "approved" && (
          <div className={"duty" + (sharing ? " on" : "")}>
            <button
              type="button"
              role="switch"
              aria-checked={sharing}
              className={"duty-switch" + (burst ? " burst-" + burst : "")}
              disabled={Boolean(current && current.status !== "requested")}
              onClick={() => {
                setBurst(sharing ? "off" : "on");
                if (sharing) goOfflineSound(); else goOnlineSound();
                setTimeout(() => setBurst(""), 900);
                if (!simRef.current && !navigator.geolocation) {
                  notify("This browser does not support location.");
                  return;
                }
                if (sharing) void api("/api/drivers/offline", {}).catch(() => {});
                setSharing(!sharing);
              }}
            >
              <span className="duty-knob" />
              {burst === "on" && <i className="duty-ripple" />}
              <span className="duty-label">{sharing ? t("duty.online") : t("duty.offline")}</span>
            </button>
            <p className="muted duty-status">
              {current && current.status !== "requested"
                ? t("duty.onTrip")
                : !sharing
                  ? t("duty.goOnline")
                  : fresh
                    ? t("duty.receiving")
                    : t("duty.locating")}
            </p>
            {development && (
              <details className="inset dev-tools">
                <summary>Developer tools</summary>
                <button
                  type="button"
                  className="secondary"
                  onClick={async () => {
                    try {
                      const p = await api<{ lat: number; lng: number }>("/api/dev/driver-near-request", {});
                      setSimulate(true);
                      setSimLat(p.lat.toFixed(5));
                      setSimLng(p.lng.toFixed(5));
                      setMyPos(p);
                      setSharing(true);
                      notify("Moved you about 500 m from the newest open request.");
                      void refresh();
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  Place me near the latest request
                </button>
                <label className="check">
                  <input type="checkbox" checked={autoDrive} onChange={(e) => setAutoDrive(e.target.checked)} />
                  Auto-drive the road route during a trip (demo)
                </label>
                <label className="check">
                  <input type="checkbox" checked={simulate} onChange={(e) => setSimulate(e.target.checked)} />
                  Use a fake location instead of my real GPS
                </label>
                {simulate && (
                  <div className="row">
                    <input aria-label="Latitude" value={simLat} onChange={(e) => setSimLat(e.target.value)} />
                    <input aria-label="Longitude" value={simLng} onChange={(e) => setSimLng(e.target.value)} />
                  </div>
                )}
              </details>
            )}
          </div>
        )}
      </section>
      {current ? (
        <>
          {["accepted", "arrived", "in_progress"].includes(current.status) && (
            <div className="driver-chat">
              <button type="button" onClick={() => setChatOpen((v) => !v)} aria-pressed={chatOpen}>
                💬 {chatOpen ? "Hide chat" : "Chat with rider"}
              </button>
              {chatOpen && <RideChat rideId={current.id} as="driver" onClose={() => setChatOpen(false)} notify={notify} />}
            </div>
          )}
          {currents.map((r) => (
            <RideCard key={r.id} ride={r} refresh={refresh} notify={notify} />
          ))}
        </>
      ) : (
        d.status === "approved" && (
          <section>
            <h3>Ride requests{data.offers.length ? ` (${data.offers.length})` : ""}</h3>
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
                No requests within {(d.pickup_radius_meters / 1000).toFixed(1)} km right now. Stay online with a fresh location and new
                requests appear here automatically.
              </div>
            )}
          </section>
        )
      )}
      <section className="panel vehicle-card">
        <span className="vehicle-badge">
          <Icon name={d.vehicle_category} size={30} />
        </span>
        <div>
          <p className="eyebrow">Your vehicle</p>
          <h3>
            {{ bike: "Bike taxi", auto: "Auto-rickshaw", mini: "Mini cab", sedan: "Sedan", suv: "SUV" }[d.vehicle_category as string] ??
              d.vehicle_category}
          </h3>
          <p className="plate">{d.vehicle_number}</p>
        </div>
        <dl>
          <div>
            <dt>Service area</dt>
            <dd>{areas.find((a) => a.id === d.area_id)?.name ?? "—"}</dd>
          </div>
          <div>
            <dt>Licence valid till</dt>
            <dd>{String(d.license_expires).slice(0, 10)}</dd>
          </div>
          <div>
            <dt>Insurance valid till</dt>
            <dd>{String(d.insurance_expires).slice(0, 10)}</dd>
          </div>
        </dl>
      </section>
      {d.status === "approved" && (
        <VehicleChange
          current={d}
          change={data.vehicle_change?.[0]}
          busy={busy || Boolean(current)}
          onSubmit={async (category, number) => {
            setBusy(true);
            try {
              await api("/api/drivers/vehicle", { vehicle_category: category, vehicle_number: number });
              await refresh();
              notify("Vehicle change sent for operator approval. You keep driving your current vehicle until it is approved.");
            } catch (e) {
              notify((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {d.status === "approved" && <DriverTools d={d} sharing={sharing} pos={myPos} notify={notify} refresh={refresh} />}
      {d.status === "approved" && home && !(current && current.status !== "requested") && (
        <DriverMap area={home} pos={myPos} rides={currents.length ? currents : data.offers} notify={notify} nudge={sharing && currents.length === 0} />
      )}
      {d.status === "approved" && (
        <div className="tip">
          Keep this screen open while driving. Location stops updating when your
          browser suspends the page. Drivers without a fresh location cannot
          accept new rides.
        </div>
      )}
      {locationStatus && (
        <p role="status" className="gps-line denied">
          {locationStatus}
        </p>
      )}
      {d.status === "approved" && (
        <section className="panel narrow">
          <h3>Ride request preferences</h3>
          <p className="muted">
            Requests outside these pickup-distance and minimum-fare limits
            won’t be offered to you.
          </p>
          <form onSubmit={savePreferences}>
            <label>
              Maximum pickup distance (metres)
              <input
                name="pickup_radius_meters"
                type="number"
                min="500"
                max="20000"
                step="100"
                defaultValue={d.pickup_radius_meters}
                required
              />
            </label>
            <label>
              Minimum acceptable fare (₹)
              <input
                name="minimum_fare_rupees"
                type="number"
                min="0"
                max="10000"
                step="1"
                defaultValue={d.minimum_fare_paise / 100}
                required
              />
            </label>
            <button disabled={busy}>Save preferences</button>
          </form>
        </section>
      )}
      {earningsError && (
        <div className="alert" role="alert">
          Could not load earnings: {earningsError}
        </div>
      )}
      {d && d.status === "approved" && <DriverMoney notify={notify} />}
      {earnings && (
        <section className="panel driver-earnings">
          <div className="section-heading">
            <div>
              <p className="eyebrow">YOUR COMPLETED RIDES</p>
              <h2>Fare and payment summary</h2>
            </div>
            <button
              className="secondary"
              onClick={() =>
                void api<Earnings>("/api/drivers/earnings")
                  .then(setEarnings)
                  .catch((e: Error) => setEarningsError(e.message))
              }
            >
              Refresh
            </button>
          </div>
          <p className="muted">
            Gross fares are not a payment confirmation. “Reported paid” means
            the driver marked a direct cash/UPI settlement as received; Hop does
            not verify it.
          </p>
          <div className="earnings-grid">
            {[
              {
                title: "Today",
                trips: earnings.summary.today_completed_trips,
                fare: earnings.summary.today_fare_paise,
                paid: earnings.summary.today_reported_paid_paise,
              },
              {
                title: "This week",
                trips: earnings.summary.week_completed_trips,
                fare: earnings.summary.week_fare_paise,
                paid: earnings.summary.week_reported_paid_paise,
              },
              {
                title: "This month",
                trips: earnings.summary.month_completed_trips,
                fare: earnings.summary.month_fare_paise,
                paid: earnings.summary.month_reported_paid_paise,
              },
              {
                title: "All time",
                trips: earnings.summary.all_time_completed_trips,
                fare: earnings.summary.all_time_fare_paise,
                paid: earnings.summary.all_time_reported_paid_paise,
              },
            ].map((period) => (
              <article className="earnings-card" key={period.title}>
                <span>{period.title}</span>
                <strong>{money(period.fare)}</strong>
                <small>
                  {period.trips} completed{" "}
                  {period.trips === 1 ? "ride" : "rides"}
                </small>
                <small>Reported paid: {money(period.paid)}</small>
              </article>
            ))}
          </div>
          <DriverInsights refreshKey={earnings} />
        </section>
      )}
    </>
  );
}
