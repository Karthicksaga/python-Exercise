import { useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import type { VehiclePricing } from "@hop/shared/types";

const categories = ["bike", "auto", "mini", "sedan", "suv"];

// Operator controls for multi-stop fees, hourly rental and outstation rates (leave blank to switch a product off).
export default function TripPricingForm({ area, notify }: { area: string; notify: (s: string) => void }) {
  const [vehicles, setVehicles] = useState<VehiclePricing[]>([]);
  const [category, setCategory] = useState("bike");
  const [busy, setBusy] = useState(false);
  const load = () => api<{ vehicles: VehiclePricing[] }>("/api/config").then((c) => setVehicles(c.vehicles)).catch(() => undefined);
  useEffect(() => void load(), []);
  const v = vehicles.find((x) => x.area_id === area && x.category === category);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const rupees = (k: string) => (f.get(k) === "" ? null : Math.round(Number(f.get(k)) * 100));
    setBusy(true);
    try {
      await api("/api/operator/trip-pricing", {
        area_id: area,
        category,
        stop_fee_paise: rupees("stop_fee") ?? 0,
        hourly_paise: rupees("hourly"),
        included_km_per_hour: Number(f.get("included_km")),
        extra_km_paise: rupees("extra_km") ?? 0,
        outstation_per_km_paise: rupees("outstation_km"),
        outstation_allowance_paise: rupees("allowance") ?? 0,
      });
      await load();
      notify("Trip pricing saved.");
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const r = (p: number | null | undefined) => (p == null ? "" : String(p / 100));
  return (
    <section className="panel">
      <h3>Stops, rental and outstation pricing</h3>
      <p className="muted">The category must already be configured and enabled for this area. Amounts are in ₹.</p>
      <label>
        Category
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      {v ? (
        <form key={area + category + v.pricing_version} onSubmit={save}>
          <label>Fee per extra stop<input name="stop_fee" type="number" step="0.5" min="0" max="100" defaultValue={r(v.stop_fee_paise)} /></label>
          <label>Rental ₹ per hour (blank = off)<input name="hourly" type="number" step="1" min="0" defaultValue={r(v.hourly_paise)} /></label>
          <label>Included km per hour<input name="included_km" type="number" min="1" max="100" defaultValue={v.included_km_per_hour} required /></label>
          <label>Extra km rate (rental)<input name="extra_km" type="number" step="0.5" min="0" defaultValue={r(v.extra_km_paise)} /></label>
          <label>Outstation ₹ per km (blank = off)<input name="outstation_km" type="number" step="0.5" min="0" defaultValue={r(v.outstation_per_km_paise)} /></label>
          <label>Outstation driver allowance per day<input name="allowance" type="number" step="1" min="0" defaultValue={r(v.outstation_allowance_paise)} /></label>
          <button disabled={busy}>Save trip pricing</button>
        </form>
      ) : (
        <p className="muted">Enable this category for the selected area first.</p>
      )}
    </section>
  );
}
