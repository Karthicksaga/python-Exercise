import ResponsiveNav from "@hop/shared/ResponsiveNav";
import { ShareToggle } from "@hop/shared/SharedRide";
import { useEffect, useRef, useState } from "react";
import { api, APIError } from "@hop/shared/api";
import {
  active,
  money,
  type Nearby,
  type PayMethod,
  type NearbyDriver,
  type Point,
  type Quote,
  type SavedLocation,
} from "@hop/shared/types";
import PlaceInput from "./PlaceInput";
const MapPicker = lazyPanel(() => import("./MapPicker"), "Loading map…", true);
import RideCard from "@hop/shared/RideCard";
const CompanionPanel = lazyPanel(() => import("./CompanionPanel"), "Loading…");
const VoiceBooking = lazyPanel(() => import("./VoiceBooking"), "Loading…");
import RideOptions from "./RideOptions";
import QuickPlaces from "./QuickPlaces";
import TripHero from "./TripHero";
import LocationGate from "./LocationGate";
import MapBoundary from "@hop/shared/MapBoundary";
import Landing from "./Landing";
import TripOptions, { defaultTrip, type TripValue } from "./TripOptions";
const WalletPanel = lazyPanel(() => import("./WalletPanel"), "Loading wallet…");
import ProfilePanel, { avatarColors, type ProfileDetails } from "@hop/shared/ProfilePanel";
import BookingMoney from "./BookingMoney";
import BookingExtras, { type BookingExtrasValue } from "./BookingExtras";
import { t, useLang } from "@hop/shared/i18n";
import { Toast, useSession } from "@hop/shared/session";
import { useLivePickup } from "./useLivePickup";
import RightRail from "./RightRail";
import RouteChoice from "./RouteChoice";
import PageLoader from "@hop/shared/PageLoader";
import { lazyPanel } from "@hop/shared/lazy";
import RideMoment, { showMoment } from "@hop/shared/RideMoment";
import { Alert, Button, Group, Modal, Stack, Switch, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";

// The API rejects unknown fields, so strip extras such as hub notes before sending a place.
const pt = (p: Point | null) => p && ({ lat: p.lat, lng: p.lng, label: p.label });

// Rider access is available to every account, including approved drivers.
export default function RiderApp() {
  useLang();
  const s = useSession();
  const { user, data, areas, vehicles, notify, setNotice, refresh, lowData, loading, signingOut, dark, toggleDark, development, phoneLogin, connection, notice, stateReady, permission, requestPermission, live, setUser } = s;
  const [placesOpen, setPlacesOpen] = useState(false);
  const [extras, setExtras] = useState<BookingExtrasValue>({});
  const [gender, setGender] = useState("");
  const [logoutAsk, setLogoutAsk] = useState(false);
  const [goOfflineAsk, setGoOfflineAsk] = useState(false);
  const [pink, setPink] = useState(false);
  const [share, setShare] = useState(false);
  const [routeIndex, setRouteIndex] = useState(0);
  const [tab, setTab] = useState("ride"),
    [busy, setBusy] = useState(false);
  const [area, setArea] = useState(""),
    [pickup, setPickup] = useState<Point | null>(null),
    [followGps, setFollowGps] = useState(true),
    [dropoff, setDropoff] = useState<Point | null>(null),
    [step, setStep] = useState<"where" | "choose" | "confirm">("where"),
    [mapTarget, setMapTarget] = useState<"pickup" | "dropoff">("pickup"),
    [quote, setQuote] = useState<Quote | null>(null),
    [payment, setPayment] = useState<PayMethod>("cash"),
    [avatarColor, setAvatarColor] = useState("indigo"),
    [promo, setPromo] = useState(""),
    [promoError, setPromoError] = useState(""),
    [vehicleCategory, setVehicleCategory] = useState("bike"),
    [trip, setTrip] = useState<TripValue>(defaultTrip),
    [offer, setOffer] = useState(""),
    [nearby, setNearby] = useState<Nearby[] | null>(null),
    [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]),
    [now, setNow] = useState(Date.now());
  const bookingKey = useRef(""),
    bookingAttempt = useRef<{
      quote_id: string;
      request_key: string;
      payment_method: PayMethod;
      offer_paise?: number;
    } | null>(null);

  const changeTab = (nextTab: string, replace = false) => {
    if (nextTab === tab) return;
    setTab(nextTab);
    const state = { tab: nextTab, step };
    if (replace) {
      window.history.replaceState(state, "");
    } else {
      window.history.pushState(state, "");
    }
  };

  const changeStep = (nextStep: "where" | "choose" | "confirm", replace = false) => {
    if (nextStep === step) return;
    setStep(nextStep);
    const state = { tab, step: nextStep };
    if (replace) {
      window.history.replaceState(state, "");
    } else {
      window.history.pushState(state, "");
    }
  };

  useEffect(() => {
    if (!window.history.state) {
      window.history.replaceState({ tab: "ride", step: "where" }, "");
    }
    const onPop = (e: PopStateEvent) => {
      if (e.state) {
        if (e.state.tab) setTab(e.state.tab);
        if (e.state.step) setStep(e.state.step);
      } else {
        setTab("ride");
        setStep("where");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (!areas.length || area) return;
    setArea(areas[0].id);
    const first = vehicles.find((v) => v.area_id === areas[0].id);
    if (first) setVehicleCategory(first.category);
  }, [areas, vehicles, area]);
  useEffect(() => {
    if (!user || !pickup) {
      setNearby(null);
      return;
    }
    let live = true;
    const load = () =>
      api<{ nearby: Nearby[]; drivers: NearbyDriver[] }>(`/api/nearby?lat=${pickup.lat}&lng=${pickup.lng}${pink ? "&pink=1" : ""}`)
        .then((r) => {
          if (!live) return;
          setNearby(r.nearby ?? []);
          setNearbyDrivers(r.drivers ?? []);
        })
        .catch(() => live && setNearby(null));
    void load();
    const timer = setInterval(load, lowData ? 20000 : 6000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [user, pickup?.lat, pickup?.lng, pink, lowData]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setQuote(null);
    bookingKey.current = "";
    bookingAttempt.current = null;
    setOffer("");
  }, [area, pickup, dropoff, payment, vehicleCategory, trip, promo, pink, routeIndex]);
  useEffect(() => {
    // Show the fare and road route as soon as both places are chosen, like a ride-hailing app.
    if (!user || !area || !pickup || !vehicleCategory) return;
    if (trip.trip_type !== "rental" && !dropoff) return;
    const timer = setTimeout(() => void estimate(), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, area, pickup, dropoff, vehicleCategory, trip, promo, pink, routeIndex]);
  const areaVehicles = vehicles.filter((item) => item.area_id === area);
  const myRides = data.rides.filter((r) => r.mine);
  const current = myRides.find((r) => active(r));
  const drivingTrip = data.rides.find((r) => r.driving && active(r));
  useEffect(() => setRouteIndex(0), [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng]);
  const prevRide = useRef<{ id: string; status: string } | null>(null);
  useEffect(() => {
    const p = prevRide.current;
    if (current && p && p.id === current.id && p.status === "requested" && current.status === "accepted") {
      showMoment({ vehicle: current.vehicle_category, kind: "rider-accepted", title: `${current.driver_name || "Your driver"} accepted!`, sub: current.eta_seconds ? `Arriving in about ${Math.max(1, Math.round(current.eta_seconds / 60))} min` : "Your driver is on the way", plate: current.vehicle_number });
    }
    prevRide.current = current ? { id: current.id, status: current.status } : null;
  }, [current?.id, current?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  async function estimate() {
    setBusy(true);
    setNotice("");
    try {
      const q = await api<Quote>("/api/quotes", {
        area_id: area,
        vehicle_category: vehicleCategory,
        ...(pink && { pink: true }),
        ...(routeIndex > 0 && trip.trip_type === "city" && { route_index: routeIndex }),
        ...(promo && { promo_code: promo }),
        pickup: pt(pickup),
        dropoff: pt(trip.trip_type === "rental" ? pickup : dropoff),
        trip_type: trip.trip_type,
        ...(trip.trip_type === "city" && { stops: trip.stops.filter((s) => s.label).map((s) => pt(s)) }),
        ...(trip.trip_type === "rental" && { rental_hours: trip.rental_hours }),
        ...(trip.trip_type === "outstation" && { round_trip: trip.round_trip, trip_days: trip.round_trip ? trip.trip_days : 1 }),
      });
      setQuote(q);
      if (!q.shared_fare_paise) setShare(false);
      setPromoError("");
      bookingKey.current = crypto.randomUUID();
    } catch (e) {
      if (promo) {
        setPromoError((e as Error).message);
        setPromo("");
      } else notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const offerPaise = offer ? Math.round(Number(offer) * 100) : 0;
  const offerBad =
    !!offer && !!quote && (!(offerPaise > 0) || offerPaise < quote.fare_paise * 0.7 || offerPaise > quote.fare_paise * 1.5);
  async function book(goOffline = false) {
    if (!quote) return;
    if (drivingTrip) {
      notify("Finish or cancel your driver trip in Captain before booking a ride.");
      return;
    }
    if (!goOffline && data.driver.some(d => d.online)) {
      setGoOfflineAsk(true);
      return;
    }
    setGoOfflineAsk(false);
    setBusy(true);
    const body = bookingAttempt.current ?? {
      quote_id: quote.id,
      request_key: bookingKey.current,
      payment_method: payment,
      ...extras,
      ...(share && { favorite_first: false }),
      ...(share && quote.shared_fare_paise ? { share: true } : offerPaise && offerPaise !== quote.fare_paise && { offer_paise: offerPaise }),
    };
    bookingAttempt.current = body;
    try {
      await api("/api/rides", { ...body, ...(goOffline && { go_offline: true }) });
      setQuote(null);
      changeStep("where", true);
      bookingAttempt.current = null;
      await refresh();
      showMoment({ vehicle: vehicleCategory, kind: "booked", title: "Ride requested!", sub: "Alerting drivers near you…" });
      notify("Ride requested. Waiting for a nearby approved driver.");
    } catch (e) {
      if (e instanceof APIError && e.code === "driver_online") setGoOfflineAsk(true);
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const signedIn = Boolean(user);
  useEffect(() => {
    if (!signedIn) return;
    api<{ details: ProfileDetails[] }>("/api/profile")
      .then(({ details: [d] }) => {
        setAvatarColor(d.avatar_color);
        setGender(d.gender);
        if (d.default_payment === "upi" || d.default_payment === "wallet") setPayment(d.default_payment);
        if (d.default_vehicle) setVehicleCategory(d.default_vehicle);
      })
      .catch(() => undefined);
  }, [signedIn]);

  async function saveLocation(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const source = form.get("source") === "pickup" ? pickup : dropoff;
    if (!source) {
      notify("Choose a pickup or destination before saving a location.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/locations", {
        label: form.get("label"),
        kind: form.get("kind"),
        lat: source.lat,
        lng: source.lng,
        place_label: source.label,
      });
      await refresh();
      notify("Saved location updated.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteLocation(location: SavedLocation) {
    setBusy(true);
    try {
      await api(`/api/locations/${location.id}/delete`, {});
      await refresh();
      notify("Saved location removed.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function becomeDriver() {
    location.assign(import.meta.env.VITE_CAPTAIN_URL || "/captain");
  }
  const [locState, setLocState] = useState<"detecting" | "ready" | "unsupported" | "denied">("detecting");
  const [detectTick, setDetectTick] = useState(0);
  const locationRequest = useRef(0);
  useEffect(() => {
    if (!user || !areas.length) return;
    if (!navigator.geolocation) return setLocState("denied");
    let live = true;
    const request = ++locationRequest.current;
    setLocState("detecting");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!live || request !== locationRequest.current) return;
        const { latitude: lat, longitude: lng } = p.coords;
        const hit = areas.find((a) => lat >= a.min_lat && lat <= a.max_lat && lng >= a.min_lng && lng <= a.max_lng);
        if (!hit) return setLocState("unsupported");
        if (hit.id !== area) {
          setArea(hit.id);
          setPickup(null);
          setDropoff(null);
          setVehicleCategory(vehicles.find((v) => v.area_id === hit.id)?.category || "");
        }
        setFollowGps(true);
        setLocState("ready");
      },
      (e) => live && request === locationRequest.current && setLocState(e.code === e.PERMISSION_DENIED ? "denied" : "unsupported"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, areas, detectTick]);
  const choosePickup = (point: Point | null) => {
    setFollowGps(false);
    setPickup(point);
  };
  const gps = useLivePickup(
    Boolean(user) && tab === "ride" && followGps && locState === "ready",
    areas.find((item) => item.id === area),
    setPickup,
  );
  const isOperator = user?.role === "operator";
  useEffect(() => {
    if (isOperator) location.replace(import.meta.env.VITE_ADMIN_URL || "/admin");
  }, [isOperator]);
  const navItems: string[][] = [
    ["ride", t("nav.ride")],
    ["history", t("nav.history")],
    ["support", t("nav.support")],
    ["profile", t("nav.profile")],
    ["wallet", t("nav.wallet")],
    ["more", t("nav.more")],
  ];
  const firstName = user?.name.split(" ")[0] || "there";
  const pageHead = ({ ride: [`Hello, ${firstName}`, "Let’s get you moving"], history: ["Your activity", "Your rides"], support: ["We’re here to help", "Help & support"], profile: ["Your account", "Your profile"], wallet: ["Your money", "Wallet & offers"], more: ["Stay protected", "Safety & more"] } as Record<string, [string, string]>)[tab] ?? [`Hello, ${firstName}`, "Let’s get you moving"];
  const pageHeadView = { eyebrow: pageHead[0], title: pageHead[1] };

  const isApprovedDriver = data.driver.some((d) => d.status === "approved");
  const prevApproved = useRef(isApprovedDriver);
  useEffect(() => {
    if (!prevApproved.current && isApprovedDriver) {
      notify("🎉 Your driver application has been approved! Tap 'Drive' to start receiving rides.");
    }
    prevApproved.current = isApprovedDriver;
  }, [isApprovedDriver, notify]);

  if (isOperator) return <PageLoader label="Opening admin…" />;
  return (
    <div className={user ? "shell has-nav" : "shell"}>
      <header className="topbar floating-pill-bar">
        <a href="/" className="logo">
          <span className="logo-mark" aria-hidden="true">h</span>
          hop
        </a>
        <div className="topbar-center">
          {user && (
            <span className={"topbar-status-chip" + (live ? " on" : "")} title={live ? "Real-time updates connected" : "Reconnecting…"}>
              <span className="status-dot" />
              <span>{live ? "Live" : "Connecting"}</span>
            </span>
          )}
        </div>
        <div className="header-right">
          <button type="button" className="theme-toggle" onClick={toggleDark} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}>
            <span className="emoji-keep">{dark ? "☀️" : "🌙"}</span>
          </button>
          {user && permission === "default" && (
            <button type="button" className="alerts-btn" aria-label="Enable alerts" title="Enable alerts" onClick={() => void requestPermission()}>
              <span aria-hidden="true">🔔</span><span className="alerts-label">Alerts</span>
            </button>
          )}
          {user && (
            <button
              type="button"
              className="avatar-btn"
              onClick={() => setTab("profile")}
              title={`${user.name} · View Profile`}
            >
              <span className="avatar" style={{ background: avatarColors[avatarColor] }}>
                {(user.name[0] || "?").toUpperCase()}
              </span>
            </button>
          )}
        </div>
      </header>
      <main>
        {development && user && (
          <div className="dev-banner">
            Development environment — no real rides or payments.
          </div>
        )}
        {connection && (
          <div className="alert" role="alert">
            {connection}{" "}
            <button className="text-button" onClick={() => location.reload()}>
              Reconnect
            </button>
          </div>
        )}
        <Toast notice={notice} onClose={() => setNotice("")} />
        {user && drivingTrip && <Alert color="yellow">You’re driving a trip. Finish or cancel it in Captain before booking a ride here.</Alert>}
        {loading || (user && !stateReady) ? (
          <PageLoader label="Connecting to hop…" />
        ) : !user ? (
          <Landing phoneLogin={phoneLogin} />
        ) : (
          <>
            <ResponsiveNav items={navItems.map(([id, label]) => ({ id, label, shortLabel: ({ ride: "Book", history: "Rides", wallet: "Wallet", profile: "Account" } as Record<string, string>)[id] }))}
              primary={["ride", "history", "wallet", "profile"]} value={tab} onChange={changeTab} onSignOut={() => setLogoutAsk(true)} />
            <div className="page-title">
              <div>
                <p className="eyebrow">{pageHeadView.eyebrow}</p>
                <h1>{pageHeadView.title}</h1>
              </div>
              <span className="verified">Verified</span>
            </div>
            {tab === "ride" && (
              <div className={"booking-grid" + (!current && locState === "ready" ? " staged" : "")}>
                <section className={"panel" + (!current && locState === "ready" ? " stage-panel" : "")}>
                  <p className="eyebrow">Book a ride</p>
                  <h2>Where to?</h2>
                  {current ? (
                    <>
                      {current.mine && ["accepted", "arrived", "in_progress"].includes(current.status) && (
                        <TripHero ride={current} notify={notify} />
                      )}
                      <RideCard
                        ride={current}
                        refresh={refresh}
                        notify={notify}
                      />
                    </>
                  ) : areas.length === 0 ? (
                    <div className="empty">
                      <strong>We’re preparing your service areas.</strong>
                      <p>
                        Bookings will open after local operations and driver
                        availability are confirmed.
                      </p>
                    </div>
                  ) : locState !== "ready" ? (
                    <LocationGate
                      state={locState === "unsupported" ? "unsupported" : locState}
                      areas={areas}
                      onRetry={() => setDetectTick((n) => n + 1)}
                      onPick={(a) => {
                        locationRequest.current += 1;
                        setArea(a.id);
                        setPickup(null);
                        setDropoff(null);
                        setFollowGps(false);
                        setVehicleCategory(vehicles.find((v) => v.area_id === a.id)?.category || "");
                        setLocState("ready");
                      }}
                    />
                  ) : (
                    <>
                      <div className="stage">
                        <div className="stage-map">
                      {locState === "ready" && areas.find((item) => item.id === area) && (
                        <MapBoundary>
                        <MapPicker
                          area={areas.find((item) => item.id === area)!}
                          pickup={pickup}
                          dropoff={dropoff}
                          route={quote?.route}
                          drivers={nearbyDrivers}
                          pois={[
                            ...(data.saved_locations ?? []).map((l) => ({ lat: l.lat, lng: l.lng, label: l.place_label, icon: l.kind === "home" ? "🏠" : l.kind === "work" ? "💼" : "⭐" })),
                            ...data.rides.filter((r) => r.status !== "cancelled").slice(0, 5).map((r) => ({ lat: r.dropoff_lat, lng: r.dropoff_lng, label: r.dropoff_label, icon: "🕘" })),
                          ]}
                          summary={quote ? { meters: quote.meters, seconds: quote.seconds, fare_paise: quote.fare_paise } : undefined}
                          vehicleCategory={vehicleCategory}
                          target={mapTarget}
                          onTargetChange={setMapTarget}
                          notify={notify}
                          onPinStart={() => setFollowGps(false)}
                          onSelect={(kind, point) =>
                            kind === "pickup" ? choosePickup(point) : setDropoff(point)
                          }
                        />
                        </MapBoundary>
                      )}
                        </div>
                        <div className="sheet">
                          <ol className="steps" aria-label="Booking steps">
                            {(["where", "choose", "confirm"] as const).map((id, i) => (
                              <li key={id} className={(step === id ? "on " : "") + (["where", "choose", "confirm"].indexOf(step) > i ? "done" : "")} aria-current={step === id ? "step" : undefined}>
                                <i>{i + 1}</i>
                                {["Where to", "Choose ride", "Confirm"][i]}
                              </li>
                            ))}
                          </ol>
                          {step === "where" && (
                            <>
                              <fieldset disabled={busy}>
                        <div className="map-target-strip">
                          <span>Tap map sets:</span>
                          <div className="segmented" role="group" aria-label="Choose map location">
                            <button
                              type="button"
                              aria-pressed={mapTarget === "pickup"}
                              className={mapTarget === "pickup" ? "selected" : ""}
                              onClick={() => setMapTarget("pickup")}
                            >
                              Pickup
                            </button>
                            <button
                              type="button"
                              aria-pressed={mapTarget === "dropoff"}
                              className={mapTarget === "dropoff" ? "selected" : ""}
                              onClick={() => setMapTarget("dropoff")}
                            >
                              Destination
                            </button>
                          </div>
                        </div>
                        <div className={"gps-line " + (followGps ? gps : "manual")} role="status">
                          {followGps ? (
                            gps === "live" ? (
                              <span><i /> Pickup follows your live location</span>
                            ) : gps === "denied" ? (
                              <span>Location is blocked — allow it in site settings, or search below.</span>
                            ) : gps === "outside" ? (
                              <span>You are outside this service area — search for a pickup.</span>
                            ) : gps === "weak" ? (
                              <span>Waiting for a precise GPS fix…</span>
                            ) : (
                              <span>Finding your location…</span>
                            )
                          ) : (
                            <>
                              <span>Pickup set manually (e.g. booking for someone else)</span>
                              <button type="button" className="text-button" onClick={() => setFollowGps(true)}>
                                ◎ Back to my live location
                              </button>
                            </>
                          )}
                        </div>
                        <PlaceInput
                          key={area + "pickup"}
                          label="Pickup"
                          area={area}
                          value={pickup}
                          onChange={choosePickup}
                          current
                        />
                        {trip.trip_type !== "rental" && (
                          <PlaceInput
                            key={area + "dropoff" + trip.trip_type}
                            label={trip.trip_type === "outstation" ? "Outstation destination" : "Destination"}
                            area={area}
                            scope={trip.trip_type === "outstation" ? "india" : undefined}
                            value={dropoff}
                            onChange={setDropoff}
                          />
                        )}
                        {trip.trip_type !== "rental" && (
                          <QuickPlaces saved={data.saved_locations ?? []} rides={data.rides} onPick={setDropoff} area={areas.find((a) => a.id === area)?.name} />
                        )}
                        <VoiceBooking
                          area={area}
                          categories={vehicles.map((v) => v.category)}
                          notify={notify}
                          onResult={(r) => {
                            if (r.category) setVehicleCategory(r.category);
                            if (r.pickup) choosePickup(r.pickup);
                            if (r.dropoff) setDropoff(r.dropoff);
                          }}
                        />
                        <TripOptions
                          area={area}
                          vehicle={areaVehicles.find((v) => v.category === vehicleCategory)}
                          value={trip}
                          onChange={setTrip}
                        />
                              </fieldset>
                      <Button variant="light" radius="xl" size="compact-md" onClick={() => setPlacesOpen(true)}>⭐ Manage saved places</Button>
                      <Modal opened={placesOpen} onClose={() => setPlacesOpen(false)} title="⭐ Saved places" centered radius="lg" size="md" scrollAreaComponent={undefined}>
                      {!!data.saved_locations?.length && (
                        <section className="inset">
                          <strong>Saved locations</strong>
                          {data.saved_locations.map((location) => (
                            <div className="saved-location" key={location.id}>
                              <button
                                type="button"
                                className="text-button"
                                onClick={() =>
                                  choosePickup({
                                    lat: location.lat,
                                    lng: location.lng,
                                    label: location.place_label,
                                  })
                                }
                              >
                                {location.label} · {location.place_label}
                              </button>
                              <div className="actions">
                                <button
                                  type="button"
                                  className="text-button"
                                  onClick={() =>
                                    choosePickup({
                                      lat: location.lat,
                                      lng: location.lng,
                                      label: location.place_label,
                                    })
                                  }
                                >
                                  Use pickup
                                </button>
                                <button
                                  type="button"
                                  className="text-button"
                                  onClick={() =>
                                    setDropoff({
                                      lat: location.lat,
                                      lng: location.lng,
                                      label: location.place_label,
                                    })
                                  }
                                >
                                  Use destination
                                </button>
                                <button
                                  type="button"
                                  className="text-button"
                                  disabled={busy}
                                  onClick={() => void deleteLocation(location)}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </section>
                      )}
                      <form className="saved-location-form" onSubmit={saveLocation}>
                        <h3>Save a place</h3>
                        <div className="form-grid">
                          <label>
                            Save current
                            <select name="source" defaultValue="pickup">
                              <option value="pickup">Pickup location</option>
                              <option value="dropoff">Destination</option>
                            </select>
                          </label>
                          <label>
                            Type
                            <select name="kind" defaultValue="favorite">
                              <option value="home">Home</option>
                              <option value="work">Work</option>
                              <option value="favorite">Favorite</option>
                            </select>
                          </label>
                        </div>
                        <label>
                          Label
                          <input
                            name="label"
                            required
                            minLength={1}
                            maxLength={40}
                            placeholder="e.g. Home, Office, Gym"
                          />
                        </label>
                        <button disabled={busy || (!pickup && !dropoff)}>
                          Save location
                        </button>
                      </form>
                      </Modal>
                              <div className="step-footer">
                                <button
                                  className="full"
                                  disabled={!pickup || (!dropoff && trip.trip_type !== "rental")}
                                  onClick={() => changeStep("choose")}
                                >
                                  Choose a ride <span className="arrow" aria-hidden="true" />
                                </button>
                              </div>
                            </>
                          )}
                          {step === "choose" && (
                            <>
                              <fieldset disabled={busy}>
                        <RideOptions
                          area={area}
                          pickup={pickup}
                          dropoff={trip.trip_type === "rental" ? null : dropoff}
                          stops={trip.trip_type === "city" ? trip.stops.filter((x) => x.label) : []}
                          vehicles={areaVehicles}
                          value={vehicleCategory}
                          onChange={setVehicleCategory}
                          nearby={nearby}
                        />
                              </fieldset>
                              <div className="step-actions">
                                <button type="button" className="ghost" onClick={() => changeStep("where")}>← Back</button>
                                <button className="grow" disabled={!vehicleCategory} onClick={() => changeStep("confirm")}>
                                  Continue <span className="arrow" aria-hidden="true" />
                                </button>
                              </div>
                            </>
                          )}
                          {step === "confirm" && (
                            <>
                              <button type="button" className="text-button back" onClick={() => changeStep("choose")}>← Change ride</button>
                              <fieldset disabled={busy}>
                        {gender === "female" && !pink && (new Date().getHours() >= 21 || new Date().getHours() < 5) && (
                          <Alert color="pink" mb="sm" icon={<IconAlertTriangle size={16} />}>Travelling late? Switch on Pink ride to be matched with a verified woman driver.</Alert>
                        )}
                        <Switch color="pink" mb="sm" checked={pink} disabled={gender !== "female"} onChange={(e) => setPink(e.currentTarget.checked)}
                          label="Pink ride — women drivers only"
                          description={gender === "female" ? "Matched only with verified, pink-certified women drivers." : "Set your gender to female in Profile to use pink rides."} />
                        <BookingExtras onChange={setExtras} />
                        <BookingMoney area={area} payment={payment} onPayment={setPayment} promo={promo} onPromo={setPromo} promoError={promoError} discount={quote?.discount_paise ?? 0} />
                              </fieldset>
                      {trip.trip_type === "city" && pickup && dropoff && (
                        <RouteChoice pickup={pickup} dropoff={dropoff} stops={trip.stops.filter((s) => s.label)} value={routeIndex} onChange={setRouteIndex} fare={quote?.fare_paise} />
                      )}
                      {quote ? (
                        <>
                        <div className="quote">
                          <div className="quote-top">
                            <div>
                              <strong>{quote.vehicle_name} ride</strong>
                              <small>
                                {(quote.meters / 1000).toFixed(1)} km · about{" "}
                                {Math.ceil(quote.seconds / 60)} min
                              </small>
                            </div>
                            <dl className="fare-breakdown">
                              {quote.fare_breakdown.hourly_paise != null && (
                                <div>
                                  <dt>
                                    Rental · {quote.fare_breakdown.hours} h (
                                    {quote.fare_breakdown.included_km} km incl.)
                                  </dt>
                                  <dd>
                                    {money(
                                      quote.fare_breakdown.hourly_paise *
                                        (quote.fare_breakdown.hours ?? 1),
                                    )}
                                  </dd>
                                </div>
                              )}
                              {quote.fare_breakdown.base_paise != null && (
                              <div>
                                <dt>Base fare</dt>
                                <dd>{money(quote.fare_breakdown.base_paise)}</dd>
                              </div>
                              )}
                              {!!quote.fare_breakdown.stops_paise && (
                                <div>
                                  <dt>Extra stops</dt>
                                  <dd>{money(quote.fare_breakdown.stops_paise)}</dd>
                                </div>
                              )}
                              {!!quote.fare_breakdown.driver_allowance_paise && (
                                <div>
                                  <dt>Driver allowance ({quote.fare_breakdown.days} day)</dt>
                                  <dd>{money(quote.fare_breakdown.driver_allowance_paise)}</dd>
                                </div>
                              )}
                              {quote.fare_breakdown.distance_paise != null && (
                              <div>
                                <dt>Distance charge</dt>
                                <dd>
                                  {money(quote.fare_breakdown.distance_paise)}
                                </dd>
                              </div>
                              )}
                              {(quote.fare_breakdown.minimum_adjustment_paise ?? 0) >
                                0 && (
                                <div>
                                  <dt>Minimum fare adjustment</dt>
                                  <dd>
                                    {money(
                                      quote.fare_breakdown
                                        .minimum_adjustment_paise,
                                    )}
                                  </dd>
                                </div>
                              )}
                              {!!quote.fare_breakdown.surge_paise && (
                                <div className="surge-row">
                                  <dt>⚡ High demand ×{(quote.surge_multiplier ?? 1).toFixed(2)}</dt>
                                  <dd>+{money(quote.fare_breakdown.surge_paise)}</dd>
                                </div>
                              )}
                              {!!quote.discount_paise && (
                                <div className="discount-row">
                                  <dt>Promo {quote.promo_code}</dt>
                                  <dd>−{money(quote.discount_paise)}</dd>
                                </div>
                              )}
                              <div>
                                <dt>Platform fee</dt>
                                <dd>
                                  {money(
                                    quote.fare_breakdown.platform_fee_paise,
                                  )}
                                </dd>
                              </div>
                            </dl>
                            <strong className="fare">
                              {money(share && quote.shared_fare_paise ? quote.shared_payable_paise ?? quote.shared_fare_paise : quote.payable_paise ?? quote.fare_paise)}
                            </strong>
                          </div>
                          <ShareToggle quote={quote} value={share} onChange={setShare} />
                          {!share && <label>
                            Your fare offer (₹, optional — drivers can accept or counter)
                            <input
                              type="number"
                              inputMode="decimal"
                              min={(quote.fare_paise * 0.7) / 100}
                              max={(quote.fare_paise * 1.5) / 100}
                              step="0.5"
                              value={offer}
                              placeholder={String(quote.fare_paise / 100)}
                              onChange={(e) => setOffer(e.target.value.replace(/[^0-9.]/g, ""))}
                            />
                          </label>}
                          {!share && offerBad && quote && (
                            <p className="error" role="alert">
                              Offer must be between {money(Math.ceil(quote.fare_paise * 0.7))} and {money(Math.floor(quote.fare_paise * 1.5))}.
                            </p>
                          )}
                          <p className="muted">
                            ₹0 platform fee · Quote valid for{" "}
                            {Math.max(
                              0,
                              Math.ceil(
                                (Date.parse(quote.expires_at) - now) / 1000,
                              ),
                            )}
                            s
                          </p>
                        </div>
                          <div className="step-footer">
                          <button
                            className="full"
                            disabled={
                              busy || (!share && offerBad) || Date.parse(quote.expires_at) <= now
                            }
                            onClick={() => void book()}
                          >
                            {busy
                              ? "Requesting…"
                              : `Request ${quote.vehicle_name}`}{" "}
                            <span className="arrow" aria-hidden="true" />
                          </button>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={estimate}
                          >
                            Refresh quote
                          </button>
                          </div>
                        </>
                      ) : (
                        <div className="step-footer">
                          <button
                            className="full"
                            disabled={
                              busy ||
                              !pickup ||
                              (!dropoff && trip.trip_type !== "rental") ||
                              !vehicleCategory ||
                              !areaVehicles.length
                            }
                            onClick={estimate}
                          >
                            {busy ? "Finding a road route…" : "See fare"}{" "}
                            <span className="arrow" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                      <p className="muted">
                        Your fare is calculated from road distance. No money is
                        collected by Hop.
                      </p>
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </section>
                {!current && locState === "ready" && (
                  <RightRail rides={data.rides} saved={data.saved_locations ?? []} onPick={setDropoff} />
                )}
                {!current && step === "where" && (
                  <aside className="side-info">
                    <div className="info-card">
                      <h3>How it works</h3>
                      <ol>
                        <li><b>Know your fare</b><span>Route and price shown before you book.</span></li>
                        <li><b>Meet with confidence</b><span>Check the vehicle, share your pickup code in person.</span></li>
                        <li><b>Pay your way</b><span>Choose an available payment method for your trip.</span></li>
                      </ol>
                    </div>
                    <div className="safety-note">
                      <strong>Ride safe</strong>
                      <p>Wear a fastened helmet and verify the vehicle before starting. Emergency? Call 112.</p>
                    </div>
                  </aside>
                )}
              </div>
            )}
            {tab === "history" && (
              <section>
                <div className="stat-strip">
                  <div><strong>{myRides.length}</strong><span>Total rides</span></div>
                  <div><strong>{myRides.filter((r) => r.status === "completed").length}</strong><span>Completed</span></div>
                  <div><strong>₹{(myRides.filter((r) => r.status === "completed").reduce((a, r) => a + r.fare_paise, 0) / 100).toFixed(0)}</strong><span>Total fares</span></div>
                </div>
                {!myRides.length ? (
                  <div className="empty">
                    Your booked rides will appear here.
                  </div>
                ) : (
                  <div className="ride-grid">
                    {myRides.map((r) => (
                      <RideCard
                        key={r.id}
                        ride={r}
                        refresh={refresh}
                        notify={notify}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
            {tab === "support" && (
              <section className="support-page">
                <div className="support-actions">
                  <a className="support-card danger" href="tel:112"><span>📞</span><strong>Call 112</strong><small>Immediate danger</small></a>
                  <button className="support-card" onClick={() => changeTab("history")}><span>🧾</span><strong>Report a ride issue</strong><small>Open a trip in Your rides</small></button>
                  <button className="support-card" onClick={() => changeTab("more")}><span>🛡️</span><strong>Safety tools</strong><small>SOS and live trip sharing</small></button>
                </div>
                <div className="panel">
                <h2>Ride support</h2>
                <p>
                  Use “Report a ride issue” on a trip to send a message to the
                  operator team.
                </p>
                <div className="safety-note">
                  <strong>Immediate danger? Call 112.</strong>
                  <p>
                    Reports in this app are reviewed by operators; they do not
                    dispatch emergency services.
                  </p>
                  <a href="tel:112">Call 112</a>
                </div>
                <h3>Your reports</h3>
                {data.incidents.length ? (
                  data.incidents.map((i) => (
                    <article key={i.id} className="inset">
                      <span className="pill">{i.status}</span>
                      <p>{i.message}</p>
                      {i.resolution && (
                        <p>
                          <strong>Operator response:</strong> {i.resolution}
                        </p>
                      )}
                    </article>
                  ))
                ) : (
                  <p className="muted">No reports yet.</p>
                )}
                </div>
              </section>
            )}
            {tab === "profile" && (
              <ProfilePanel
                name={user.name}
                driving={isApprovedDriver}
                saved={data.saved_locations}
                busy={busy}
                notify={notify}
                onName={(name) => setUser((c) => (c ? { ...c, name } : c))}
                onDetails={(d) => setAvatarColor(d.avatar_color)}
                onDeleteSaved={(l) => void deleteLocation(l)}
                role="rider"
                goTo={(id) => changeTab(id)}
                becomeDriver={becomeDriver}
                logout={() => setLogoutAsk(true)}
              />
            )}
            {tab === "wallet" && <WalletPanel notify={notify} />}
            {tab === "more" && (
              <CompanionPanel rides={data.rides} saved={data.saved_locations} notify={notify} />
            )}
          </>
        )}
        {signingOut && <PageLoader overlay label="Signing you out…" />}
        <RideMoment />
        <Modal opened={goOfflineAsk} onClose={() => !busy && setGoOfflineAsk(false)} title="Go offline and book a ride?" centered radius="lg">
          <Stack gap="sm">
            <Text>You’re online in Captain. Booking this ride will take you offline so you won’t receive driver requests. You can go online again after your rider trip ends.</Text>
            <Group grow>
              <Button variant="default" disabled={busy} onClick={() => setGoOfflineAsk(false)}>Keep driving</Button>
              <Button loading={busy} onClick={() => void book(true)}>Go offline and book</Button>
            </Group>
          </Stack>
        </Modal>
        <Modal opened={logoutAsk} onClose={() => setLogoutAsk(false)} title="Sign out of hop?" centered radius="lg">
          <Stack gap="sm">
            {current && <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>You have a ride in progress. It keeps running, but you won't see live updates or driver messages until you sign in again.</Alert>}
            <Text size="sm" c="dimmed">You'll need to sign in with your mobile number again.</Text>
            <Group grow>
              <Button variant="default" onClick={() => setLogoutAsk(false)}>Stay signed in</Button>
              <Button color="red" onClick={() => { setLogoutAsk(false); void s.logout(); }}>Sign out</Button>
            </Group>
          </Stack>
        </Modal>
        <footer>
          <strong>hop</strong>
          <span>Plan your trip. Follow your ride.</span>
        </footer>
      </main>
    </div>
  );
}
