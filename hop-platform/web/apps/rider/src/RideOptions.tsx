import { useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import { t } from "@hop/shared/i18n";
import RideOptionCard from "./RideOptionCard";
import { money, type Estimate, type Nearby, type Point, type Quote, type TripType, type VehiclePricing } from "@hop/shared/types";

const blurb: Record<string, string> = {
  bike: "Fastest in traffic", auto: "Everyday city hops", mini: "Compact AC cab",
  sedan: "Comfort for 4", suv: "Room for 6",
};
// UI-only metadata from saved hubs is not part of the existing Point API contract.
const point = ({ lat, lng, label }: Point): Point => ({ lat, lng, label });
type EstimateState = { key: string; data?: Estimate; loading: boolean; error?: string };

export default function RideOptions({ area, pickup, dropoff, stops, vehicles, value, onChange, nearby, onRoute, tripType = "city", quote }: {
  area: string; pickup: Point | null; dropoff: Point | null; stops?: Point[];
  vehicles: VehiclePricing[]; value: string; onChange: (c: string) => void;
  nearby?: Nearby[] | null; onRoute?: (route: Estimate["route"]) => void;
  tripType?: TripType; quote?: Quote | null;
}) {
  const [result, setResult] = useState<EstimateState>({ key: "", loading: false });
  const [retry, setRetry] = useState(0);
  const key = tripType === "city" && pickup && dropoff
    ? JSON.stringify([area, point(pickup), point(dropoff), (stops ?? []).map(point)]) : "";
  useEffect(() => {
    if (!key || !pickup || !dropoff) return;
    let live = true;
    const abort = new AbortController();
    setResult({ key, loading: true });
    const timer = setTimeout(() => {
      api<Estimate>("/api/estimates", { area_id: area, pickup: point(pickup), dropoff: point(dropoff), stops: (stops ?? []).map(point) }, abort.signal)
        .then(data => {
          if (!live) return;
          setResult({ key, data, loading: false });
          onRoute?.(data.route);
        })
        .catch((error: Error) => { if (live) setResult({ key, loading: false, error: error.message }); });
    }, 400);
    return () => { live = false; clearTimeout(timer); abort.abort(); };
    // Request identity includes every location sent to the existing estimates endpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);
  const current = key && result.key === key ? result : undefined;
  const est = current?.data;
  const loading = !!key && (!current || current.loading);
  const fares = new Map(est?.options.map(option => [option.category, option]));
  const fastest = nearby?.length ? [...nearby].sort((a, b) => a.eta_minutes - b.eta_minutes)[0]?.category : undefined;
  const selected = vehicles.find(vehicle => vehicle.category === value);
  const selectedFare = fares.get(value);
  const specialQuote = tripType !== "city" && quote?.vehicle_category === value ? quote : undefined;
  return <div className="booking-ride-list">
    {est && <p className="trip-meta">{(est.meters / 1000).toFixed(1)} km <span aria-hidden="true">·</span> about {Math.max(1, Math.round(est.seconds / 60))} min on this route</p>}
    {loading && <p className="booking-estimate-status" role="status">Calculating fares for your route…</p>}
    {current?.error && <div className="booking-estimate-error" role="alert"><strong>We couldn’t estimate this route</strong><p>{current.error}</p><button type="button" className="ghost" onClick={() => setRetry(n => n + 1)}>Retry fare estimates</button><small>Route prices will appear when the estimate is available. Review a valid quote before booking.</small></div>}
    {tripType !== "city" && <p className="booking-estimate-status">{tripType === "rental" ? "Hourly rental" : "Outstation"} pricing is confirmed for your selected vehicle at review.</p>}
    <div className="ride-options" role="radiogroup" aria-label="Choose your ride" aria-busy={loading}>
      {vehicles.map(vehicle => {
        const fare = fares.get(vehicle.category);
        const near = nearby?.find(driver => driver.category === vehicle.category);
        const noDrivers = nearby != null && !near;
        const special = tripType !== "city" && quote?.vehicle_category === vehicle.category ? quote : undefined;
        return <RideOptionCard key={vehicle.category} category={vehicle.category} name={vehicle.name}
          description={blurb[vehicle.category]}
          selected={value === vehicle.category} loading={loading} unavailable={noDrivers}
          onSelect={() => onChange(vehicle.category)}
          availability={near ? `${near.eta_minutes} min away` : noDrivers ? "No drivers nearby" : "Driver availability not confirmed"}
          fare={fare ? `Est. ${money(fare.fare_paise)}` : special ? `Est. ${money(special.payable_paise ?? special.fare_paise)}` : tripType === "city" ? "Fare unavailable" : "Quote at review"}
          tags={<>
            {fare?.tag === "cheapest" && <em className="tag">Cheapest</em>}
            {fastest === vehicle.category && <em className="tag fast">Fastest arrival</em>}
            {fare?.surge_multiplier && <em className="tag surge" title={t("surge.label")}>⚡ {fare.surge_multiplier}×</em>}
          </>}
        />;
      })}
    </div>
    {selected && <div className="booking-selection-summary"><span><small>Selected ride</small><strong>{selected.name}</strong></span><strong>{loading ? "Calculating…" : selectedFare ? money(selectedFare.fare_paise) : specialQuote ? money(specialQuote.payable_paise ?? specialQuote.fare_paise) : "Review fare next"}</strong></div>}
    <p className="booking-estimate-note">Estimated fares may change with your route, demand and selected options. Your latest quote appears before you book.</p>
  </div>;
}
