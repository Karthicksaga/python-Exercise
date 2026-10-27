import TripReceipt from "./TripReceipt";
import { PrivateImage } from "./TrustProfile";
import { acceptSound } from "./sounds";
import { showMoment } from "./RideMoment";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@mantine/core";
import { api } from "./api";
import { active, money, statuses, type Ride } from "./types";
import MapBoundary from "./MapBoundary";
import RideRouteMap from "./RideRouteMap";
import LiveNavMap from "./LiveNavMap";
import RideNegotiation from "./RideNegotiation";
import { t, useLang } from "./i18n";
import MaskedCall from "./MaskedCall";
import SharedRide from "./SharedRide";
import SwipeButton from "./SwipeButton";
import PaymentSettlementSheet from "./PaymentSettlementSheet";

let onlinePaymentsCache: Promise<boolean> | null = null;
const onlinePaymentsEnabled = () =>
  (onlinePaymentsCache ??= api<{ online_payments?: boolean }>("/api/config")
    .then((c) => Boolean(c.online_payments))
    .catch(() => false));
const steps = [
  ["requested", "Finding driver"],
  ["accepted", "On the way"],
  ["arrived", "Arrived"],
  ["in_progress", "In trip"],
] as const;

function RideProgress({ status }: { status: string }) {
  useLang();
  const index = Math.max(0, steps.findIndex(([key]) => key === status));
  return (
    <ol className="stepper" aria-label="Ride progress" style={{ ["--done" as string]: index / (steps.length - 1) }}>
      {steps.map(([key], i) => (
        <li key={key} className={i < index ? "done" : i === index ? "current" : ""}>
          <span>{i < index ? "✓" : i + 1}</span>
          <small>{t(`step.${key}`)}</small>
        </li>
      ))}
    </ol>
  );
}

function SearchingDrivers({ ride }: { ride: Ride }) {
  useLang();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, Math.round((Date.parse(ride.expires_at) - now) / 1000));
  const n = ride.notified_drivers ?? 0;
  return (
    <div className="searching" role="status">
      <div className="radar" aria-hidden="true">
        <i />
        <i />
        <i />
        <b />
      </div>
      <div>
        <strong>{n ? t("ride.searching") : t("ride.noDrivers")}</strong>
        <p>
          {n
            ? `${n} ${n === 1 ? "driver" : "drivers"} nearby ${n === 1 ? "has" : "have"} been notified. The first to accept is assigned to you.`
            : "We'll keep looking. Try a different vehicle type or a nearby pickup point if this takes long."}
        </p>
        <small>{t("ride.expires", { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` })}</small>
      </div>
    </div>
  );
}

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
  useLang();
  const vehicleNames: Record<string, string> = {
    bike: "Bike",
    auto: "Auto-rickshaw",
    mini: "Mini cab",
    sedan: "Sedan",
    suv: "SUV",
  };
  const offerRef=useRef<HTMLElement>(null);
  useEffect(() => {
    if (!offer || !offerRef.current) return;
    let visible=false,sent=false;
    const seen=()=>{
      if (!visible || sent || document.visibilityState!=="visible") return;
      sent=true;void api(`/api/rides/${r.id}/offer-seen`,{}).catch(()=>{sent=false;});
    };
    const observer=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting && e.intersectionRatio>=0.1);seen();},{threshold:[0,0.1]});
    observer.observe(offerRef.current);document.addEventListener("visibilitychange",seen);
    return()=>{observer.disconnect();document.removeEventListener("visibilitychange",seen);};
  }, [offer, r.id]);
  const [onlineOK, setOnlineOK] = useState(false);
  useEffect(() => {
    void onlinePaymentsEnabled().then(setOnlineOK);
  }, []);
  const [busy, setBusy] = useState(false),
    [code, setCode] = useState(""),
    [reason, setReason] = useState(""),
    [cancel, setCancel] = useState(false),
    [early, setEarly] = useState<string | null>(null),
    [report, setReport] = useState(false),
    [message, setMessage] = useState(""),
    [rating, setRating] = useState(5),
    [ratingComment, setRatingComment] = useState(""),
    [switchingPay, setSwitchingPay] = useState(false);
  async function changePay(newMethod: "cash" | "upi" | "wallet") {
    if (newMethod === r.payment_method || busy) return;
    setBusy(true);
    try {
      await api(`/api/rides/${r.id}/actions`, {
        action: "change_payment_method",
        version: r.version,
        payment_method: newMethod,
      });
      setSwitchingPay(false);
      await refresh();
      notify(`Payment method updated to ${newMethod.toUpperCase()}`);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pass() {
    setBusy(true);
    try {
      await api(`/api/rides/${r.id}/decline`, {});
      await refresh();
      notify("Ride cancelled. You won't see it again.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(name: string, confirm = false, finalFare = r.fare_paise) {
    setBusy(true);
    try {
      await api(`/api/rides/${r.id}/actions`, {
        action: name,
        version: r.version,
        code,
        reason,
        ...(confirm && { confirm }),
      });
      await refresh();
      if (name === "accept") acceptSound();
      if (name === "accept") showMoment({ vehicle: r.vehicle_category, kind: "driver-accepted", title: "Ride accepted", sub: `Head to ${r.pickup_label.split(",")[0]} · ₹${(r.fare_paise / 100).toFixed(0)}` });
      if (name === "complete") showMoment({ vehicle: r.vehicle_category, kind: "completed", title: "Trip completed", sub: `₹${(finalFare / 100).toFixed(2)} fare` });
      notify(
        name === "complete"
          ? "Trip completed. Payment remains unconfirmed until reported."
          : "Ride updated.",
      );
    } catch (e) {
      const msg = (e as Error).message;
      if (name === "complete" && !confirm && msg.startsWith("Early finish")) {
        setBusy(false);
        setEarly(msg);
        return;
      }
      notify(msg);
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
  async function rate() {
    setBusy(true);
    try {
      await api(`/api/rides/${r.id}/rating`, {
        score: rating,
        comment: ratingComment,
      });
      await refresh();
      notify("Thanks for sharing ride feedback.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="ride-card" ref={offerRef}>
      <Modal opened={early !== null} onClose={() => setEarly(null)} title="End trip early?" centered>
        <p>{early}</p>
        <div className="actions">
          <button
            className="danger"
            disabled={busy}
            onClick={() => {
              const fare = Number(early?.match(/becomes ₹(\d+)/)?.[1]);
              setEarly(null);
              void action("complete", true, Number.isFinite(fare) ? fare * 100 : r.fare_paise);
            }}
          >
            End trip anyway
          </button>
          <button className="secondary" onClick={() => setEarly(null)}>Keep driving</button>
        </div>
      </Modal>
      <div className="card-top">
        <span className="pill">
          {offer ? "Nearby request" : statuses[r.status] || r.status}
        </span>
        <strong>
          {!!r.discount_paise && <s className="was">{money(r.fare_paise)}</s>}
          {money(r.payable_paise ?? r.fare_paise)}
        </strong>
      </div>
      {active(r) && !offer && <RideProgress status={r.status} />}
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
        {vehicleNames[r.vehicle_category] || "Ride"} ·{" "}
        {(r.meters / 1000).toFixed(1)} km · about{" "}
        {Math.ceil(r.seconds / 60)} min ·{" "}
        {r.payment_method === "upi" ? "Direct UPI" : r.payment_method === "wallet" ? "Wallet" : "Cash"}{r.promo_code ? ` · ${r.promo_code}` : ""}{(r.surge_multiplier ?? 1) > 1 ? ` · ⚡×${r.surge_multiplier}` : ""} · ₹0 platform fee
      </p>
      {r.mine && active(r) && (
        <div className="in-ride-pay-pill">
          <span>
            Payment: <strong>{r.payment_method === "upi" ? "⚡ Direct UPI" : r.payment_method === "wallet" ? "👛 Hop Wallet" : "💵 Cash"}</strong>
          </span>
          <button
            type="button"
            className="text-button in-ride-switch-btn"
            disabled={busy}
            onClick={() => setSwitchingPay(!switchingPay)}
          >
            {switchingPay ? "Done" : "Change"}
          </button>
        </div>
      )}
      {r.mine && active(r) && switchingPay && (
        <div className="in-ride-pay-switcher">
          <button
            type="button"
            className={`pill-opt ${r.payment_method === "upi" ? "selected" : ""}`}
            disabled={busy}
            onClick={() => changePay("upi")}
          >
            ⚡ UPI
          </button>
          <button
            type="button"
            className={`pill-opt ${r.payment_method === "cash" ? "selected" : ""}`}
            disabled={busy}
            onClick={() => changePay("cash")}
          >
            💵 Cash
          </button>
          <button
            type="button"
            className={`pill-opt ${r.payment_method === "wallet" ? "selected" : ""}`}
            disabled={busy}
            onClick={() => changePay("wallet")}
          >
            👛 Wallet
          </button>
        </div>
      )}
      <SharedRide ride={r} offer={offer} refresh={refresh} notify={notify} />
      {r.trip_type && r.trip_type !== "city" && (
        <p className="muted">
          {r.trip_type === "rental"
            ? `Hourly rental · ${r.rental_hours} h`
            : `Outstation${r.round_trip ? ` round trip · ${r.trip_days} day(s)` : " one way"}`}
        </p>
      )}
      {!!r.stops?.length && (
        <p className="muted">Stops: {r.stops.map((s) => s.label).join(" → ")}</p>
      )}
      {(offer || r.mine) && (!r.share_state || r.share_state === "none" || r.share_state === "solo_full") && (
        <RideNegotiation ride={r} offer={offer} refresh={refresh} notify={notify} />
      )}
      {r.trip_type !== "rental" && (!offer && ["accepted", "arrived", "in_progress"].includes(r.status) ? <MapBoundary><LiveNavMap ride={r} /></MapBoundary> : (offer || active(r)) && <MapBoundary><RideRouteMap ride={r} /></MapBoundary>)}
      {r.mine && r.status === "requested" && <SearchingDrivers ride={r} />}
      {r.mine && r.eta_seconds != null && r.eta_target && (
        <div className="eta-banner" role="status">
          <strong>
            {r.eta_target === "pickup"
              ? r.eta_seconds < 60 ? t("ride.arrivingNow") : t("ride.arrivesIn", { n: Math.ceil(r.eta_seconds / 60) })
              : t("ride.reachIn", { n: Math.max(1, Math.ceil(r.eta_seconds / 60)) })}
          </strong>
          <span>
            {((r.eta_meters ?? 0) / 1000).toFixed(1)} km away
            {r.eta_at && ` · ${r.eta_target === "pickup" ? "pickup" : "arrive"} by ${new Date(r.eta_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`}
          </span>
        </div>
      )}
      {r.driver_has_photo && r.driver_id && <PrivateImage accountId={r.driver_id} alt="Captain portrait" className="captain-portrait" />}
      {r.driver_name && (
        <p>
          <strong>{r.driver_name}</strong> · {r.vehicle_number}<small className="muted">{[r.vehicle_color,r.vehicle_make,r.vehicle_model].filter(Boolean).join(" · ")}</small>
        </p>
      )}
      {(r.mine || r.driving) && ["accepted", "arrived", "in_progress"].includes(r.status) && r.driver_name && <MaskedCall rideId={r.id} notify={notify} />}
      {r.driving && r.status !== "completed" && r.payment_method !== "wallet" && active(r) && (
        <p className="collect">{t("collect.from")}: <strong>{money(r.payable_paise ?? r.fare_paise)}</strong>{!!r.discount_paise && <small> (promo of {money(r.discount_paise)} is reimbursed by hop)</small>}</p>
      )}
      {r.circle_invitation && <p className="muted">Hop Circle · preferred invitation</p>}
      {r.pickup_instructions && <p><strong>Pickup instructions:</strong> {r.pickup_instructions}</p>}
      {r.rider_name && <p>Rider: {r.rider_name}</p>}
      {r.passenger_name && (
        <p>
          Passenger: {r.passenger_name}
          {r.passenger_phone && ` · ${r.passenger_phone}`}
        </p>
      )}
      {r.driving && r.status === "in_progress" && r.full_fare_status && r.full_fare_status !== "none" && (
        <p className="muted">Full fare: {r.full_fare_status === "requested" ? "waiting for the rider to answer" : r.full_fare_status === "approved" ? "approved by the rider" : "declined, so the fare follows the distance covered"}.</p>
      )}
      {!!r.wait_charge_paise && <p className="fare-adjusted">Includes waiting charge {money(r.wait_charge_paise)} (free for the first 3 minutes, then ₹2 a minute).</p>}
      {r.status === "completed" && r.adjusted_from_paise && (
        <p className="fare-adjusted">
          Ended before the destination, so the fare is {money(r.fare_paise)} for {((r.covered_meters ?? 0) / 1000).toFixed(1)} km covered (was {money(r.adjusted_from_paise)}).
        </p>
      )}
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
          <>
            <SwipeButton vehicle={r.vehicle_category} label="Swipe to accept ride →" disabled={busy} onConfirm={() => action("accept")} />
            <button className="secondary cancel-offer" disabled={busy} onClick={pass}>Cancel ride</button>
          </>
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
            <SwipeButton vehicle={r.vehicle_category} label="Swipe to start ride →" disabled={busy || code.length !== 6} onConfirm={() => action("start")} />
          </>
        )}
        {r.driving && r.status === "in_progress" && (
          <>
            <SwipeButton vehicle={r.vehicle_category} tone="stop" label="Swipe to end ride →" disabled={busy} onConfirm={() => action("complete")} />
            {r.full_fare_status !== "requested" && r.full_fare_status !== "approved" && (
              <button type="button" className="secondary" disabled={busy} onClick={() => action("request_full_fare")}>
                Ask rider for full fare
              </button>
            )}
          </>
        )}
        {r.mine && r.status === "in_progress" && r.full_fare_status === "requested" && (
          <div className="fare-ask" role="alert">
            <strong>Driver asks for the full fare ({money(r.fare_paise)})</strong>
            <small>If the trip ends before the destination you would otherwise pay only for the distance covered.</small>
            <div className="actions">
              <button disabled={busy} onClick={() => action("approve_full_fare")}>Approve full fare</button>
              <button className="secondary" disabled={busy} onClick={() => action("decline_full_fare")}>Pay by distance</button>
            </div>
          </div>
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
        <TripReceipt rideId={r.id} notify={notify} />
      )}
      {r.status === "completed" && (
        <PaymentSettlementSheet
          ride={r}
          refresh={refresh}
          notify={notify}
          busy={busy}
          action={action}
          onlineOK={onlineOK}
        />
      )}
      {!offer && (r.mine || r.driving) && r.status === "completed" && (
        <div className="inset">
          {r.my_rating ? (
            <p>
              Your rating: <strong>{r.my_rating}/5</strong>
              {r.my_rating_comment && ` · ${r.my_rating_comment}`}
            </p>
          ) : (
            <>
              <label>
                Rate your ride
                <select
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                >
                  {[5, 4, 3, 2, 1].map((score) => (
                    <option key={score} value={score}>
                      {score} {score === 1 ? "star" : "stars"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Feedback (optional)
                <textarea
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  maxLength={1000}
                />
              </label>
              <button disabled={busy} onClick={() => void rate()}>
                Submit rating
              </button>
            </>
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
