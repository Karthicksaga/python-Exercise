import { useEffect } from "react";
import PlaceInput from "./PlaceInput";
import type { Point, TripType, VehiclePricing } from "@hop/shared/types";

export type TripValue = {
  trip_type: TripType;
  stops: Point[];
  rental_hours: number;
  round_trip: boolean;
  trip_days: number;
};
export const defaultTrip: TripValue = { trip_type: "city", stops: [], rental_hours: 2, round_trip: false, trip_days: 1 };

// Trip type (city with extra stops, hourly rental, outstation), limited to what the chosen vehicle offers.
export default function TripOptions({
  area,
  vehicle,
  value,
  onChange,
}: {
  area: string;
  vehicle?: VehiclePricing;
  value: TripValue;
  onChange: (v: TripValue) => void;
}) {
  const rental = vehicle?.hourly_paise != null;
  const outstation = vehicle?.outstation_per_km_paise != null;
  useEffect(() => {
    if ((value.trip_type === "rental" && !rental) || (value.trip_type === "outstation" && !outstation))
      onChange({ ...defaultTrip });
  }, [rental, outstation, value.trip_type, onChange]);
  const set = (patch: Partial<TripValue>) => onChange({ ...value, ...patch });
  return (
    <>
      {(rental || outstation) && (
        <label>
          Trip type
          <select value={value.trip_type} onChange={(e) => set({ trip_type: e.target.value as TripType, stops: [] })}>
            <option value="city">City ride</option>
            {rental && <option value="rental">Hourly rental</option>}
            {outstation && <option value="outstation">Outstation</option>}
          </select>
        </label>
      )}
      {value.trip_type === "rental" && (
        <label>
          Hours (1–12) — includes {vehicle?.included_km_per_hour} km per hour
          <input type="number" min={1} max={12} value={value.rental_hours} onChange={(e) => set({ rental_hours: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })} />
        </label>
      )}
      {value.trip_type === "outstation" && (
        <>
          <label className="check">
            <input type="checkbox" checked={value.round_trip} onChange={(e) => set({ round_trip: e.target.checked })} />
            Round trip
          </label>
          {value.round_trip && (
            <label>
              Days (1–10)
              <input type="number" min={1} max={10} value={value.trip_days} onChange={(e) => set({ trip_days: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} />
            </label>
          )}
        </>
      )}
      {value.trip_type === "city" && (
        <>
          {value.stops.map((stop, i) => (
            <div key={i} className="row">
              <PlaceInput
                label={`Stop ${i + 1}`}
                area={area}
                value={stop}
                onChange={(p) => set({ stops: value.stops.map((s, j) => (j === i ? (p ?? s) : s)) })}
              />
              <button type="button" className="text-button" onClick={() => set({ stops: value.stops.filter((_, j) => j !== i) })}>
                Remove
              </button>
            </div>
          ))}
          {value.stops.length < 3 && (
            <button
              type="button"
              className="text-button"
              onClick={() => set({ stops: [...value.stops, { lat: 0, lng: 0, label: "" }] })}
            >
              + Add a stop{vehicle?.stop_fee_paise ? ` (₹${vehicle.stop_fee_paise / 100} each)` : ""}
            </button>
          )}
        </>
      )}
    </>
  );
}
