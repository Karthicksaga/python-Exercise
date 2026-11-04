import { useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import type { VehiclePricing } from "@hop/shared/types";
import type { ScreenProps } from "../AdminApp";
import { CATS, CAT_ORDER, rupee, useLoad } from "../lib";
import type { Operations, Pricing, ZoneArea } from "../types";
import { Badge, Chips, Field, Note, NumberInput, Skeleton, Switch, useNotify } from "../ui";

type Row = Pick<Pricing, "base_paise" | "per_km_paise" | "minimum_paise" | "enabled"> & { pricing_version?: number };
const fareAt = (p: Row, km: number) => Math.max(p.minimum_paise, p.base_paise + p.per_km_paise * km);

export default function Fares({ sub, refreshSummary }: ScreenProps) {
  const notify = useNotify();
  const ops = useLoad<Operations>("/api/operator", notify);
  const cfg = useLoad<{ vehicles: VehiclePricing[] }>("/api/config", notify);
  const [areaId, setAreaId] = useState(sub);
  const areas = ops.data?.areas ?? [];
  const area = areas.find((a) => a.id === areaId) ?? areas[0];
  if (!ops.data || !area) return <Skeleton rows={6} />;
  const reload = () => { void ops.reload(); void cfg.reload(); refreshSummary(); };
  return (
    <>
      <div className="spread" style={{ flexWrap: "wrap" }}>
        <Chips label="Service area" value={area.id} onChange={(v) => { setAreaId(v); history.replaceState(null, "", `#fares/${v}`); }} items={areas.map((a) => [a.id, a.active ? a.name : `${a.name} (inactive)`] as [string, string])} />
        <span className="small muted">Prices in rupees. Saved quotes keep their price until they expire.</span>
      </div>
      {!area.active && <Note tone="warn">{area.name} isn't taking bookings yet. You can set fares now; turning a vehicle on needs bookings open on the Service areas page first.</Note>}
      <section className="grid g-3">
        <FareCard key={`bike-${area.id}`} area={area} category="bike" row={{ base_paise: area.base_paise, per_km_paise: area.per_km_paise, minimum_paise: area.minimum_paise, enabled: area.active }} onSaved={reload} />
        {CAT_ORDER.slice(1).map((c) => {
          const p = ops.data!.pricing.find((x) => x.area_id === area.id && x.category === c);
          return <FareCard key={`${c}-${area.id}-${p?.pricing_version ?? 0}`} area={area} category={c} row={p ?? null} onSaved={reload} />;
        })}
        <TripOptions area={area} vehicles={cfg.data?.vehicles ?? []} onSaved={reload} />
      </section>
    </>
  );
}

function FareCard({ area, category, row, onSaved }: { area: ZoneArea; category: string; row: Row | null; onSaved: () => void }) {
  const notify = useNotify();
  const bike = category === "bike";
  const [p, setP] = useState<Row>(row ?? { base_paise: 0, per_km_paise: 0, minimum_paise: 0, enabled: false });
  const [busy, setBusy] = useState(false);
  const set = row != null || p.per_km_paise > 0;
  const ready = p.per_km_paise > 0 && p.minimum_paise > 0;
  async function save() {
    if (!ready) return notify("Enter a per-km rate and a minimum fare.");
    if (!bike && p.enabled && !area.active) return notify(`Open bookings in ${area.name} before offering ${CATS[category]}.`);
    setBusy(true);
    try {
      if (bike) {
        // Bike fares live on the zone itself, so this re-saves the zone with the new fares.
        await api("/api/operator/areas", {
          id: area.id, catalog_id: area.catalog_id || "", name: area.name, state: area.state, active: area.active, approval_reference: area.approval_reference ?? "",
          min_lat: area.min_lat, max_lat: area.max_lat, min_lng: area.min_lng, max_lng: area.max_lng,
          base_paise: p.base_paise, per_km_paise: p.per_km_paise, minimum_paise: p.minimum_paise,
        });
      } else {
        await api("/api/operator/pricing", { area_id: area.id, category, base_paise: p.base_paise, per_km_paise: p.per_km_paise, minimum_paise: p.minimum_paise, enabled: p.enabled });
      }
      notify(`${CATS[category]} fares saved for ${area.name}.`);
      onSaved();
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="card fare-card">
      <header>
        <img src={`/vehicles/${category}.png`} alt="" />
        <div className="li-main"><h3>{CATS[category]}</h3><small>{bike ? "The zone's own fares" : row ? `Pricing version ${row.pricing_version ?? 1}` : "Not set up yet"}</small></div>
        {(bike ? area.active : row?.enabled) ? <Badge tone="ok">Offered</Badge> : set ? <Badge tone="plain">Off</Badge> : <Badge tone="warn">Needs fares</Badge>}
      </header>
      <div className="form-grid" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
        {([["base_paise", "Base"], ["per_km_paise", "Per km"], ["minimum_paise", "Minimum"]] as const).map(([k, l]) => (
          <Field key={k} label={l}><NumberInput rupees min={0} step={0.5} scale={100} value={p[k] || (row ? p[k] : null)} onValue={(n) => setP({ ...p, [k]: Math.round(n) })} /></Field>
        ))}
      </div>
      <div className="preview" aria-label="Example fares">{ready ? [3, 8, 15].map((km) => <span key={km}>{km} km <b>{rupee(fareAt(p, km))}</b></span>) : <span className="muted">Enter fares to see example prices</span>}</div>
      {bike ? <span className="small muted">Bike is offered whenever the zone is taking bookings.</span>
        : <Switch checked={p.enabled} disabled={!area.active && !p.enabled} onChange={(v) => setP({ ...p, enabled: v })} label={`Offer ${CATS[category]} in ${area.name}`} hint={!area.active ? "Open bookings in this zone first." : undefined} />}
      <button type="button" className={`btn ${p.enabled || bike ? "primary" : "secondary"} block`} disabled={busy} onClick={() => void save()}>Save {CATS[category]} fares</button>
    </div>
  );
}

const TRIP_FIELDS = [
  ["stop_fee_paise", "Per extra stop", "money0"], ["hourly_paise", "Rental per hour", "moneyOff"], ["included_km_per_hour", "Km included per hour", "km"],
  ["extra_km_paise", "Rental extra km", "money0"], ["outstation_per_km_paise", "Outstation per km", "moneyOff"], ["outstation_allowance_paise", "Captain allowance per day", "money0"],
] as const;
type TripKey = (typeof TRIP_FIELDS)[number][0];

function TripOptions({ area, vehicles, onSaved }: { area: ZoneArea; vehicles: VehiclePricing[]; onSaved: () => void }) {
  const notify = useNotify();
  const [cat, setCat] = useState("bike");
  const v = vehicles.find((x) => x.area_id === area.id && x.category === cat);
  const [vals, setVals] = useState<Record<TripKey, number | null>>({} as Record<TripKey, number | null>);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setVals(Object.fromEntries(TRIP_FIELDS.map(([k]) => [k, v ? ((v as unknown as Record<string, number | null>)[k] ?? null) : null])) as Record<TripKey, number | null>);
  }, [v?.area_id, v?.category, v?.pricing_version]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    if (!(Number(vals.included_km_per_hour) >= 1)) return notify("Km included per hour must be at least 1.");
    setBusy(true);
    try {
      await api("/api/operator/trip-pricing", {
        area_id: area.id, category: cat, stop_fee_paise: vals.stop_fee_paise ?? 0, hourly_paise: vals.hourly_paise || null,
        included_km_per_hour: vals.included_km_per_hour, extra_km_paise: vals.extra_km_paise ?? 0,
        outstation_per_km_paise: vals.outstation_per_km_paise || null, outstation_allowance_paise: vals.outstation_allowance_paise ?? 0,
      });
      notify(`${CATS[cat]} trip options saved for ${area.name}.`);
      onSaved();
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="card stack">
      <h3>Trip options</h3>
      <p className="small muted">Stops, hourly rentals and outstation trips in {area.name}. Leave a rental or outstation rate empty to switch it off.</p>
      <Chips label="Vehicle" value={cat} onChange={setCat} items={CAT_ORDER.map((c) => [c, CATS[c]] as [string, string])} />
      {v ? <>
        <div className="form-grid" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
          {TRIP_FIELDS.map(([k, l, kind]) => (
            <Field key={k} label={l}>
              {kind === "km"
                ? <NumberInput min={1} max={100} value={vals[k]} onValue={(n) => setVals({ ...vals, [k]: Math.round(n) })} />
                : <NumberInput rupees min={0} step={0.5} scale={100} value={vals[k]} placeholder={kind === "moneyOff" ? "Off" : "0"} onValue={(n) => setVals({ ...vals, [k]: Math.round(n) })} />}
            </Field>
          ))}
        </div>
        <button type="button" className="btn secondary block" disabled={busy} onClick={() => void save()}>Save trip options</button>
      </> : <Note>Save {CATS[cat]} fares for {area.name} first{area.active ? "" : " and open bookings"}; trip options build on them.</Note>}
    </div>
  );
}
