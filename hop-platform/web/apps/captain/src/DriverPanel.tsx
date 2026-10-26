import CaptainOnboarding from "./CaptainOnboarding";
import { isAndroid, startTracking, stopTracking } from "@hop/shared/platform";
import { getCSRF } from "@hop/shared/api";
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
  activeTab = "driver",
  onNavigateTab,
}: {
  data: State;
  areas: Area[];
  development?: boolean;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  activeTab?: "driver" | "earnings" | "vehicle";
  onNavigateTab?: (tab: string) => void;
}) {
  useLang();
  const d = data.driver[0],
    currents = data.rides.filter((r) => r.driving && active(r)),
    current = currents[0];
  const [editingApplication,setEditingApplication]=useState(false);
  const [chatOpen, setChatOpen] = useState(false),
    [sharing, setSharing] = useState(false),
    [burst, setBurst] = useState(""),
    [busy, setBusy] = useState(false),
    [locationStatus, setLocationStatus] = useState(""),
    [earnings, setEarnings] = useState<Earnings | null>(null),
    [earningsError, setEarningsError] = useState("");
  const inFlight = useRef(false);
  const seenOffers = useRef(0);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(() => {
    if (d?.lat && d?.lng) return { lat: d.lat, lng: d.lng };
    return null;
  });
  useEffect(() => {
    if (!myPos && d?.lat && d?.lng) {
      setMyPos({ lat: d.lat, lng: d.lng });
    }
  }, [d?.lat, d?.lng, myPos]);
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    }
  }, []);
  useEffect(() => {
    const count = data.offers.length;
    if (count > seenOffers.current) {
      notify("New ride request nearby!");
      driverAlert();
    }
    seenOffers.current = count;
  }, [data.offers.length, notify]);
  const [simulate, setSimulate] = useState(false),
    home = areas.find((a) => a.id === d?.area_id) || areas[0] || {
      id: "default",
      name: "Bengaluru",
      state: "Karnataka",
      min_lat: 12.8,
      max_lat: 13.2,
      min_lng: 77.4,
      max_lng: 77.8,
    },
    [simLat, setSimLat] = useState(((home.min_lat + home.max_lat) / 2).toFixed(4)),
    [simLng, setSimLng] = useState(((home.min_lng + home.max_lng) / 2).toFixed(4));
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
  const prevStatus = useRef(d?.status);
  useEffect(() => {
    if (prevStatus.current && prevStatus.current !== "approved" && d?.status === "approved") {
      notify("🎉 Congratulations! Your driver application has been approved. You can now go online to receive rides!");
      driverAlert();
    }
    prevStatus.current = d?.status;
  }, [d?.status, notify]);
  useEffect(() => {
    if (d && !d.online) {
      setSharing(false);
      void stopTracking();
    }
  }, [d?.online]);
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
    if (!isAndroid) return;
    if (!sharing) { void stopTracking(); return; }
    let cancelled = false;
    void startTracking(getCSRF()).then(() => {
      if (cancelled) void stopTracking();
    }).catch(e => { if (!cancelled) { setLocationStatus((e as Error).message); setSharing(false); void api("/api/drivers/offline", {}).catch(() => {}); } });
    return () => { cancelled = true; };
  }, [sharing]);
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
  if (!d || editingApplication) return <CaptainOnboarding areas={areas} driver={d} notify={notify} refresh={refresh} onClose={d?()=>setEditingApplication(false):undefined}/>;
  const fresh = d.online && Date.now() - Date.parse(d.location_at) < 60000;
  return (
    <>
      {/* 1. DRIVE SCREEN */}
      <div hidden={activeTab !== "driver"} className="captain-subview">
        <section className="panel driver-heading">
          <div>
            <p className="eyebrow">CAPTAIN COCKPIT</p>
            <h2>{t("duty.title")}</h2>
            <p>
              {d.vehicle_category} · {d.vehicle_number}{" "}
              <span className="pill">{d.status}</span>
            </p>
            {d.review_note && <p className="muted">{d.review_note}</p>}
            {d.status === "pending" && <button type="button" className="secondary" onClick={()=>setEditingApplication(true)}>Review or correct application</button>}
            {d.status === "suspended" && <p className="muted">Contact support to resolve your suspension before driving.</p>}
          </div>
          <div className={"duty" + (sharing ? " on" : "")}>
            <button
              type="button"
              role="switch"
              aria-checked={sharing}
              className={"duty-switch" + (burst ? " burst-" + burst : "")}
              disabled={busy || Boolean(current && current.status !== "requested")}
              onClick={async () => {
                if (busy) return;
                if (!sharing && data.rides.some((r) => r.mine && active(r))) {
                  notify("Finish or cancel your rider trip before going online.");
                  return;
                }
                if (!simRef.current && !navigator.geolocation) {
                  notify("This browser does not support location.");
                  return;
                }
                setBusy(true);
                try {
                  await api(sharing ? "/api/drivers/offline" : "/api/drivers/online", {});
                  setBurst(sharing ? "off" : "on");
                  if (sharing) goOfflineSound();
                  else goOnlineSound();
                  setTimeout(() => setBurst(""), 900);
                  setSharing(!sharing);
                  await refresh();
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setBusy(false);
                }
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
        </section>

        <div className="captain-quick-ribbon" role="navigation" aria-label="Quick links">
          <button
            type="button"
            className="quick-chip"
            onClick={() => onNavigateTab?.("earnings")}
            title="Open Earnings screen"
          >
            <div className="chip-head">
              <span>💰</span>
              <span>Today's earnings</span>
            </div>
            <strong className="chip-value">{money(earnings?.summary?.today_fare_paise ?? 0)}</strong>
            <small className="chip-sub">
              {earnings?.summary?.today_completed_trips ?? 0} {((earnings?.summary?.today_completed_trips ?? 0) === 1) ? "trip" : "trips"} · Details →
            </small>
          </button>
          <button
            type="button"
            className="quick-chip"
            onClick={() => onNavigateTab?.("vehicle")}
            title="Open Vehicle screen"
          >
            <div className="chip-head">
              <span>🚗</span>
              <span>Vehicle</span>
            </div>
            <strong className="chip-value">{d.vehicle_number}</strong>
            <small className="chip-sub">
              {{ bike: "Bike taxi", auto: "Auto", mini: "Mini", sedan: "Sedan", suv: "SUV" }[d.vehicle_category] ?? d.vehicle_category} · Settings →
            </small>
          </button>
        </div>

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
          <section>
            <h3>Ride requests{data.offers.length ? ` (${data.offers.length})` : ""}</h3>
            {data.offers.length ? (
              <div className="ride-grid">
                {data.offers.map((r) => (
                  <RideCard key={r.id} ride={r} offer refresh={refresh} notify={notify} />
                ))}
              </div>
            ) : (
              <div className="empty">
                No requests within {(d.pickup_radius_meters / 1000).toFixed(1)} km right now. Stay online with a fresh location and new requests appear here automatically.
              </div>
            )}
          </section>
        )}

        {home && !(current && current.status !== "requested") && (
          <DriverMap area={home} pos={myPos} rides={currents.length ? currents : data.offers} notify={notify} nudge={sharing && currents.length === 0} />
        )}

        <div className="tip">
          Keep this screen open while driving. Location stops updating when your browser suspends the page. Drivers without a fresh location cannot accept new rides.
        </div>
        {locationStatus && (
          <p role="status" className="gps-line denied">
            {locationStatus}
          </p>
        )}
      </div>

      {/* 2. EARNINGS SCREEN */}
      <div hidden={activeTab !== "earnings"} className="captain-subview">
        <DriverMoney notify={notify} />
        {earningsError && (
          <div className="alert" role="alert">
            Could not load earnings: {earningsError}
          </div>
        )}
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
              Gross fares are not a payment confirmation. “Reported paid” means the driver marked a direct cash/UPI settlement as received; Hop does not verify it.
            </p>
            <div className="earnings-grid">
              {[
                { title: "Today", trips: earnings.summary.today_completed_trips, fare: earnings.summary.today_fare_paise, paid: earnings.summary.today_reported_paid_paise },
                { title: "This week", trips: earnings.summary.week_completed_trips, fare: earnings.summary.week_fare_paise, paid: earnings.summary.week_reported_paid_paise },
                { title: "This month", trips: earnings.summary.month_completed_trips, fare: earnings.summary.month_fare_paise, paid: earnings.summary.month_reported_paid_paise },
                { title: "All time", trips: earnings.summary.all_time_completed_trips, fare: earnings.summary.all_time_fare_paise, paid: earnings.summary.all_time_reported_paid_paise },
              ].map((period) => (
                <article className="earnings-card" key={period.title}>
                  <span>{period.title}</span>
                  <strong>{money(period.fare)}</strong>
                  <small>{period.trips} completed {period.trips === 1 ? "ride" : "rides"}</small>
                  <small>Reported paid: {money(period.paid)}</small>
                </article>
              ))}
            </div>
            <DriverInsights refreshKey={earnings} />
          </section>
        )}
      </div>

      {/* 3. VEHICLE & PREFERENCES SCREEN */}
      <div hidden={activeTab !== "vehicle"} className="captain-subview">
        <section className="panel vehicle-card">
          <span className="vehicle-badge">
            <Icon name={d.vehicle_category} size={30} />
          </span>
          <div>
            <p className="eyebrow">Your vehicle</p>
            <h3>
              {{ bike: "Bike taxi", auto: "Auto-rickshaw", mini: "Mini cab", sedan: "Sedan", suv: "SUV" }[d.vehicle_category as string] ?? d.vehicle_category}
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

        <section className="panel narrow">
          <h3>Ride request preferences</h3>
          <p className="muted">
            Requests outside these pickup-distance and minimum-fare limits won’t be offered to you.
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

        <DriverTools d={d} sharing={sharing} pos={myPos} notify={notify} refresh={refresh} />
      </div>
    </>
  );
}
