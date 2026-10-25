import { useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import { t } from "@hop/shared/i18n";
import VehicleArt from "@hop/shared/VehicleArt";
import { money, type Estimate, type Nearby, type Point, type VehiclePricing } from "@hop/shared/types";

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
  onRoute?: (route: Estimate["route"]) => void;
}) {
  const [est, setEst] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(false);
  const key = pickup && dropoff ? `${area}|${pickup.lat},${pickup.lng}|${dropoff.lat},${dropoff.lng}|${JSON.stringify(stops ?? [])}` : "";
  useEffect(() => {
    if (!key || !pickup || !dropoff) {
      setEst(null);
      return;
    }
    let live = true;
    setLoading(true);
    const timer = setTimeout(() => {
      api<Estimate>("/api/estimates", { area_id: area, pickup, dropoff, stops: stops ?? [] })
        .then((e) => {
          if (!live) return;
          setEst(e);
          onRoute?.(e.route);
        })
        .catch(() => live && setEst(null))
        .finally(() => live && setLoading(false));
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const fastest = nearby?.length ? [...nearby].sort((a, b) => a.eta_minutes - b.eta_minutes)[0]?.category : undefined;
  const fares = new Map(est?.options.map((o) => [o.category, o]));
  return (
    <div className="ride-options" role="radiogroup" aria-label="Choose your ride">
      {est && (
        <p className="trip-meta">
          {(est.meters / 1000).toFixed(1)} km · about {Math.max(1, Math.round(est.seconds / 60))} min
        </p>
      )}
      {vehicles.map((v) => {
        const opt = fares.get(v.category);
        const near = nearby?.find((n) => n.category === v.category);
        return (
          <button
            key={v.category}
            type="button"
            role="radio"
            aria-checked={value === v.category}
            className={"ride-row" + (value === v.category ? " selected" : "") + (loading ? " loading" : "")}
            onClick={() => onChange(v.category)}
          >
            <VehicleArt category={v.category} width={72} />
            <span className="ride-main">
              <strong>
                {v.name}
                {opt?.tag === "cheapest" && <em className="tag">Cheapest</em>}
                {fastest === v.category && <em className="tag fast">Fastest</em>}
                {opt?.surge_multiplier && <em className="tag surge" title={t("surge.label")}>⚡ {opt.surge_multiplier}×</em>}
              </strong>
              <small>
                {near ? `${near.eta_minutes} min away` : nearby ? "No drivers nearby" : blurb[v.category]}
                {near ? ` · ${blurb[v.category] ?? ""}` : ""}
              </small>
            </span>
            <span className="ride-fare">{opt ? money(opt.fare_paise) : <small>from {money(v.minimum_paise)}</small>}</span>
          </button>
        );
      })}
    </div>
  );
}
