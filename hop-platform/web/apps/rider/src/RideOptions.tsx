import { useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import { t } from "@hop/shared/i18n";
import RideOptionCard from "./RideOptionCard";
import {
  money,
  type Estimate,
  type Nearby,
  type Point,
  type VehiclePricing,
} from "@hop/shared/types";

const blurb: Record<string, string> = {
  bike: "Fastest in traffic",
  auto: "Everyday city hops",
  mini: "Compact AC cab",
  sedan: "Comfort for 4",
  suv: "Room for 6",
};

// Uber-style ride list: every vehicle priced for the same route, with ETA and best-value tags.
export default function RideOptions({
  area,
  pickup,
  dropoff,
  stops,
  vehicles,
  value,
  onChange,
  nearby,
  availabilityStatus = nearby ? "ready" : "loading",
  onRetryAvailability,
  onRoute,
}: {
  area: string;
  pickup: Point | null;
  dropoff: Point | null;
  stops?: Point[];
  vehicles: VehiclePricing[];
  value: string;
  onChange: (c: string) => void;
  nearby?: Nearby[] | null;
  availabilityStatus?: "loading" | "ready" | "error";
  onRetryAvailability?: () => void;
  onRoute?: (route: Estimate["route"]) => void;
}) {
  const [est, setEst] = useState<Estimate | null>(null);
  const [estimateError, setEstimateError] = useState(false);
  const [estimateRetry, setEstimateRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const key =
    pickup && dropoff
      ? `${area}|${pickup.lat},${pickup.lng}|${dropoff.lat},${dropoff.lng}|${JSON.stringify(stops ?? [])}`
      : "";
  useEffect(() => {
    if (!key || !pickup || !dropoff) {
      setEst(null);
      return;
    }
    let live = true;
    setLoading(true);
    setEst(null);
    setEstimateError(false);
    const timer = setTimeout(() => {
      api<Estimate>("/api/estimates", {
        area_id: area,
        pickup,
        dropoff,
        stops: stops ?? [],
      })
        .then((e) => {
          if (!live) return;
          setEst(e);
          onRoute?.(e.route);
        })
        .catch(() => {
          if (live) {
            setEst(null);
            setEstimateError(true);
          }
        })
        .finally(() => live && setLoading(false));
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, estimateRetry]);

  const fastest = nearby?.length
    ? [...nearby].sort((a, b) => a.eta_minutes - b.eta_minutes)[0]?.category
    : undefined;
  const fares = new Map(est?.options.map((o) => [o.category, o]));
  return (
    <div
      className="ride-options"
      role="radiogroup"
      aria-label="Choose your ride"
      onKeyDown={(e) => {
        if (
          ![
            "ArrowDown",
            "ArrowUp",
            "ArrowLeft",
            "ArrowRight",
            "Home",
            "End",
          ].includes(e.key)
        )
          return;
        const radios = Array.from(
          e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
        );
        const current = radios.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (current < 0 || !radios.length) return;
        e.preventDefault();
        const index =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? radios.length - 1
              : (current +
                  (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1) +
                  radios.length) %
                radios.length;
        radios[index].focus();
        radios[index].click();
      }}
    >
      <div className="booking-availability" role="status" aria-live="polite">
        {availabilityStatus === "loading" ? (
          "Checking nearby drivers…"
        ) : availabilityStatus === "error" ? (
          <>
            Driver availability unavailable.{" "}
            <button
              type="button"
              className="text-button"
              onClick={onRetryAvailability}
            >
              Retry availability
            </button>
          </>
        ) : nearby?.length ? (
          "Nearby driver availability updated."
        ) : (
          "No drivers nearby right now. You can retry availability."
        )}
        {availabilityStatus === "ready" && !nearby?.length && (
          <button
            type="button"
            className="text-button"
            onClick={onRetryAvailability}
          >
            Retry availability
          </button>
        )}
      </div>
      {estimateError && (
        <p role="alert">
          Fare estimates unavailable. Starting fares are shown.{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => setEstimateRetry((n) => n + 1)}
          >
            Retry estimates
          </button>
        </p>
      )}
      {est && (
        <p className="trip-meta">
          {(est.meters / 1000).toFixed(1)} km · about{" "}
          {Math.max(1, Math.round(est.seconds / 60))} min
        </p>
      )}
      {vehicles.map((v) => {
        const opt = fares.get(v.category);
        const near = nearby?.find((n) => n.category === v.category);
        return (
          <RideOptionCard
            key={v.category}
            category={v.category}
            name={v.name}
            selected={value === v.category}
            loading={loading}
            tabbable={
              value === v.category ||
              (!vehicles.some((v) => v.category === value) && vehicles[0] === v)
            }
            onSelect={() => onChange(v.category)}
            availability={
              availabilityStatus === "loading"
                ? "Checking drivers…"
                : availabilityStatus === "error"
                  ? "Availability unavailable"
                  : near
                    ? `${near.eta_minutes} min away · ${blurb[v.category] ?? ""}`
                    : nearby
                      ? "No drivers nearby"
                      : (blurb[v.category] ??
                        "Availability updates when drivers are nearby")
            }
            fare={
              opt
                ? `Est. ${money(opt.fare_paise)}`
                : `From ${money(v.minimum_paise)}`
            }
            tags={
              <>
                {opt?.tag === "cheapest" && <em className="tag">Cheapest</em>}
                {fastest === v.category && (
                  <em className="tag fast">Fastest</em>
                )}
                {opt?.surge_multiplier && (
                  <em className="tag surge" title={t("surge.label")}>
                    ⚡ {opt.surge_multiplier}×
                  </em>
                )}
              </>
            }
          />
        );
      })}
    </div>
  );
}
