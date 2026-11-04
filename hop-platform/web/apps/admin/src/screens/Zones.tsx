import { useMemo, useState } from "react";
import { api } from "@hop/shared/api";
import { MapCanvas, MapFit, MapRect, MapRectEditor, type Bounds } from "@hop/shared/mapkit";
import type { ScreenProps } from "../AdminApp";
import { CATS, CAT_ORDER, rupee, useLoad } from "../lib";
import type { Operations, Region, ZoneArea } from "../types";
import { Badge, Empty, Field, Icon, Note, NumberInput, Skeleton, Switch, useNotify } from "../ui";

// Service areas are lat/lng rectangles. Operators drag the box on the map, or start from a
// catalogue district and shrink it to the city in one click. The server repeats every check.

type Draft = ZoneArea;
const REF_MIN = 6; // saveArea: activation needs an approval reference of 6+ characters
const overlap = (a: Bounds, b: Bounds): Bounds | null => {
  const r = { min_lat: Math.max(a.min_lat, b.min_lat), max_lat: Math.min(a.max_lat, b.max_lat), min_lng: Math.max(a.min_lng, b.min_lng), max_lng: Math.min(a.max_lng, b.max_lng) };
  return r.min_lat < r.max_lat && r.min_lng < r.max_lng ? r : null;
};
const km = (b: Bounds) => [(b.max_lng - b.min_lng) * 111.32 * Math.cos(((b.min_lat + b.max_lat) / 2) * Math.PI / 180), (b.max_lat - b.min_lat) * 110.57];
const cityOf = (r?: Region): Bounds | null => (r && r.city_min_lat != null ? { min_lat: r.city_min_lat, max_lat: r.city_max_lat!, min_lng: r.city_min_lng!, max_lng: r.city_max_lng! } : null);
const boundsOf = (b: Bounds): Bounds => ({ min_lat: b.min_lat, max_lat: b.max_lat, min_lng: b.min_lng, max_lng: b.max_lng });
const same = (a: Bounds, b: Bounds) => a.min_lat === b.min_lat && a.max_lat === b.max_lat && a.min_lng === b.min_lng && a.max_lng === b.max_lng;

export default function Zones({ sub, refreshSummary }: ScreenProps) {
  const notify = useNotify();
  const ops = useLoad<Operations>("/api/operator", notify);
  const reg = useLoad<{ regions: Region[] }>("/api/operator/regions", notify);
  const [sel, setSel] = useState(sub || "");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [picking, setPicking] = useState(false), [state, setState] = useState("Tamil Nadu");
  const [busy, setBusy] = useState(false), [refError, setRefError] = useState("");
  const areas = ops.data?.areas ?? [], regions = reg.data?.regions ?? [];

  // Open the zone from the link, or the first zone, once data arrives.
  const current = areas.find((a) => a.id === sel) ?? (!draft && !picking ? areas[0] : undefined);
  if (current && (!draft || (draft.id && draft.id !== current.id)) && !picking) {
    setSel(current.id); setDraft({ ...current }); setFitKey((k) => k + 1);
  }
  const region = regions.find((r) => r.id === draft?.catalog_id);
  const city = cityOf(region);
  const saved = draft?.id ? areas.find((a) => a.id === draft.id) : undefined;
  const dirty = Boolean(draft && (!saved || JSON.stringify({ ...saved, ...draft }) !== JSON.stringify(saved)));
  const categories = (id: string) => ["bike", ...CAT_ORDER.slice(1).filter((c) => ops.data?.pricing.some((p) => p.area_id === id && p.category === c && p.enabled))];

  // The map view: the whole district around a large zone, or close in on a city-sized one.
  const view = useMemo(() => {
    if (!draft) return [];
    const z = boundsOf(draft);
    const big = region && (z.max_lat - z.min_lat) * (z.max_lng - z.min_lng) > 0.3 * (region.max_lat - region.min_lat) * (region.max_lng - region.min_lng);
    const b = big ? { min_lat: Math.min(z.min_lat, region!.min_lat), max_lat: Math.max(z.max_lat, region!.max_lat), min_lng: Math.min(z.min_lng, region!.min_lng), max_lng: Math.max(z.max_lng, region!.max_lng) } : z;
    return [{ lat: b.min_lat, lng: b.min_lng }, { lat: b.max_lat, lng: b.max_lng }];
    // Only refit on purpose (fitKey), not on every drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  if (!ops.data || !reg.data) return <Skeleton rows={6} />;

  function pick(id: string) {
    setPicking(false); setRefError(""); setSel(id);
    const a = areas.find((x) => x.id === id);
    if (a) { setDraft({ ...a }); setFitKey((k) => k + 1); history.replaceState(null, "", `#zones/${id}`); }
  }
  function startFromDistrict(id: string) {
    const r = regions.find((x) => x.id === id);
    if (!r) return;
    const c = cityOf(r) ?? boundsOf(r);
    // New zones copy fares from a live zone in the same state, so operators start from known prices.
    const sib = areas.find((a) => a.state === r.state && a.active) ?? areas.find((a) => a.state === r.state);
    setDraft({ id: "", catalog_id: r.id, name: r.district, state: r.state, ...c, base_paise: sib?.base_paise ?? 2500, per_km_paise: sib?.per_km_paise ?? 1200, minimum_paise: sib?.minimum_paise ?? 3000, active: false, approval_reference: "" } as Draft);
    setSel(""); setFitKey((k) => k + 1);
  }
  const set = (patch: Partial<Draft>) => { setDraft((d) => (d ? { ...d, ...patch } : d)); setRefError(""); };
  const setBounds = (b: Bounds) => set(boundsOf(b));

  const list = (
    <div className="card stack zone-list">
      <div className="spread"><h3>Zones</h3><button type="button" className="btn sm soft" onClick={() => { setPicking(true); setDraft(null); setSel(""); }}><Icon name="plus" size={14} />New zone</button></div>
      <div className="queue">
        {areas.map((a) => {
          const n = categories(a.id).length;
          return (
            <button type="button" key={a.id} className="q-item" aria-current={draft?.id === a.id} onClick={() => pick(a.id)}>
              <span className={`li-icon ${a.active ? "ok" : ""}`}><Icon name="zone" /></span>
              <span className="li-main"><strong>{a.name}</strong><small>{a.state} · {n} vehicle type{n > 1 ? "s" : ""}</small></span>
              {a.active ? <Badge tone="ok">Live</Badge> : <Badge tone="plain">Off</Badge>}
            </button>
          );
        })}
      </div>
      {(picking || (draft && !draft.id)) && (() => {
        const states = [...new Set(regions.map((r) => r.state))];
        const inState = regions.filter((r) => r.state === state);
        return (
          <div className="card stack" style={{ background: "var(--surface-2)", boxShadow: "none" }}>
            <strong>Start from a district</strong>
            <Field label="State" hint={states.length < 2 ? "Add a state with backend/scripts/fetch_districts.py." : undefined}><select value={state} onChange={(e) => setState(e.target.value)}>{states.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="District"><select value={draft && !draft.id ? draft.catalog_id ?? "" : ""} onChange={(e) => startFromDistrict(e.target.value)}>
              <option value="">Choose a district…</option>
              {inState.map((r) => <option key={r.id} value={r.id} disabled={Boolean(r.area_id)}>{r.district}{r.area_id ? ` — already a zone (${r.area_name})` : ""}</option>)}
            </select></Field>
            <span className="small muted">{inState.filter((r) => r.area_id).length} of {inState.length} districts have a zone. New zones start inactive at the city limits.</span>
          </div>
        );
      })()}
    </div>
  );
  if (!draft) return <section className="grid g-split">{list}<div className="card"><Empty title="Choose a district" icon="zone">The zone starts at the city limits, so you rarely need to type coordinates.</Empty></div></section>;

  const others = areas.filter((a) => a.id !== draft.id);
  const clashes = others.map((o) => [o, overlap(draft, o)] as const).filter(([, r]) => r);
  const liveClash = clashes.filter(([o]) => o.active);
  const valid = draft.min_lat < draft.max_lat && draft.min_lng < draft.max_lng && draft.max_lat - draft.min_lat >= 0.01 && draft.max_lng - draft.min_lng >= 0.01
    && draft.min_lat >= 6 && draft.max_lat <= 38 && draft.min_lng >= 68 && draft.max_lng <= 98;
  const fares = draft.base_paise >= 0 && draft.per_km_paise > 0 && draft.minimum_paise > 0;
  const refOk = draft.approval_reference.trim().length >= REF_MIN;
  const cats = draft.id ? categories(draft.id) : ["bike"];
  const [w, h] = km(draft);
  const blocked = draft.active && (!refOk || !valid || liveClash.length > 0 || !fares);
  const checks: ["done" | "todo" | "bad", string, string][] = [
    [valid ? "done" : "bad", "Boundary is a valid rectangle", valid ? `${w.toFixed(1)} × ${h.toFixed(1)} km` : "Inside India, north above south, east right of west, at least 1 km each way"],
    [liveClash.length ? "bad" : clashes.length ? "todo" : "done", liveClash.length ? `Overlaps ${liveClash.map(([o]) => o.name).join(", ")}, which is taking bookings` : clashes.length ? `Overlaps ${clashes.map(([o]) => o.name).join(", ")} (inactive)` : "No overlap with other zones", clashes.length ? "Riders inside the red area would match two zones." : ""],
    [refOk ? "done" : draft.active ? "bad" : "todo", "Operational approval reference", refOk ? draft.approval_reference : `Needed before bookings can open (${REF_MIN}+ characters)`],
    [fares ? "done" : "bad", "Bike fares set", fares ? `${rupee(draft.base_paise)} base · ${rupee(draft.per_km_paise)}/km · ${rupee(draft.minimum_paise)} minimum` : "Enter a per-km rate and a minimum fare"],
    [cats.length > 1 ? "done" : "todo", cats.length > 1 ? `${cats.length} vehicle types priced` : "Only Bike is priced", cats.length > 1 ? cats.map((c) => CATS[c]).join(", ") : "Set Auto, Mini, Sedan and SUV fares on the Fares page after saving"],
  ];

  async function save() {
    if (!draft) return;
    if (draft.name.trim().length < 2 || draft.state.trim().length < 2) return notify("Give the zone a name and a state.");
    if (draft.active && !refOk) { setRefError(`Add the approval reference (${REF_MIN}+ characters) to open bookings. You can still save the zone as inactive.`); return; }
    if (blocked) return notify("Fix the items marked ✕ before opening bookings.");
    if (!valid) return notify("The boundary isn't valid yet.");
    setBusy(true);
    try {
      const out = await api<{ id: string }>("/api/operator/areas", {
        id: draft.id, catalog_id: draft.catalog_id || "", name: draft.name.trim(), state: draft.state.trim(), active: draft.active, approval_reference: draft.approval_reference.trim(),
        min_lat: draft.min_lat, max_lat: draft.max_lat, min_lng: draft.min_lng, max_lng: draft.max_lng,
        base_paise: draft.base_paise, per_km_paise: draft.per_km_paise, minimum_paise: draft.minimum_paise,
      });
      notify(`${draft.name} saved. Existing quotes keep their price until they expire.`);
      await Promise.all([ops.reload(), reg.reload()]);
      refreshSummary();
      setSel(out.id); setDraft(null); setPicking(false);
      history.replaceState(null, "", `#zones/${out.id}`);
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <section className="grid g-split">
      {list}
      <div className="card stack" style={{ gap: 16 }}>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <Field label="Zone name" className="grow"><input value={draft.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="State" className="grow"><input value={draft.state} maxLength={100} onChange={(e) => set({ state: e.target.value })} /></Field>
          {saved ? (saved.active ? <Badge tone="ok">Bookings open</Badge> : <Badge tone="plain">Inactive</Badge>) : <Badge tone="info">New zone</Badge>}
        </div>
        <div className="row">
          {city && <button type="button" className="btn sm secondary" disabled={same(draft, city)} onClick={() => { setBounds(city); setFitKey((k) => k + 1); notify(`Zone set to ${region!.city} ${region!.city_source === "approx" ? "city area (approximate)" : "city limits"}.`); }}><Icon name="city" size={16} />{region!.city_source === "approx" ? "City area (approx.)" : "City limits"}</button>}
          {region && <button type="button" className="btn sm secondary" disabled={same(draft, region)} onClick={() => { setBounds(region); setFitKey((k) => k + 1); }}><Icon name="expand" size={16} />Whole district</button>}
          {saved && dirty && <button type="button" className="btn sm secondary" onClick={() => { setDraft({ ...saved }); setFitKey((k) => k + 1); }}><Icon name="reset" size={16} />Undo changes</button>}
          {region && <span className="small muted" style={{ marginLeft: "auto" }}>District bounds: {region.source}</span>}
        </div>
        <div className="map-box zone-map">
          <MapCanvas center={{ lat: (draft.min_lat + draft.max_lat) / 2, lng: (draft.min_lng + draft.max_lng) / 2 }} zoom={11}>
            <MapFit points={view} padding={40} extra={fitKey} />
            {others.map((o) => <MapRect key={o.id} bounds={o} color={o.active ? "#0f7a4f" : "#6b6f80"} fillOpacity={0.05} weight={1.5} dashed label={`${o.name}${o.active ? "" : " (inactive)"}`} />)}
            {region && <MapRect bounds={region} color="#3b3d4f" fillOpacity={0} weight={1.5} dashed />}
            {city && !same(draft, city) && <MapRect bounds={city} color="#4b3fd1" fillOpacity={0} weight={1.5} dashed />}
            {clashes.map(([o, r]) => <MapRect key={"x" + o.id} bounds={r!} color="#c62f2f" fillOpacity={0.25} weight={1.5} />)}
            <MapRectEditor bounds={boundsOf(draft)} color="#4b3fd1" onChange={(b) => setBounds(b)} />
          </MapCanvas>
          <div className="map-legend" style={{ zIndex: 500 }}>
            <span><i className="sq" style={{ background: "var(--primary)", opacity: 0.6 }} />This zone ({w.toFixed(1)} × {h.toFixed(1)} km)</span>
            {city && <span><i className="sq" style={{ border: "1.5px dashed var(--primary)" }} />{region!.city_source === "approx" ? "City area" : "City limits"}</span>}
            {region && <span><i className="sq" style={{ border: "1.5px dashed var(--ink-2)" }} />District</span>}
            {clashes.length > 0 && <span><i className="sq" style={{ background: "var(--danger)", opacity: 0.5 }} />Overlap</span>}
          </div>
        </div>
        <span className="small muted">Drag a corner to resize the zone, or the centre dot to move it. Type exact values below for precision.</span>
        <div className="coord-grid">
          {([["max_lat", "North latitude"], ["min_lat", "South latitude"], ["min_lng", "West longitude"], ["max_lng", "East longitude"]] as const).map(([k, l]) => (
            <Field key={k} label={l}><NumberInput value={draft[k]} step={0.0001} onValue={(n) => set({ [k]: n } as Partial<Draft>)} /></Field>
          ))}
        </div>
        {clashes.length > 0 && <Note tone={liveClash.length ? "bad" : "warn"} icon="alert"><b>Overlaps {clashes.map(([o]) => o.name).join(", ")}.</b> A rider in the red area would match two zones.{city ? " Use City limits to fix it in one click." : " Shrink the box."}</Note>}
        {region?.city_source === "approx" && same(draft, city!) && <Note>OpenStreetMap has no boundary for {region.city}, so this box is drawn around the city centre (about {Math.round(km(city!)[0])} km across). Adjust it to the area you serve.</Note>}
        <div className="grid g-2" style={{ gap: 16, alignItems: "start" }}>
          <div className="stack">
            <strong>Bike fares</strong>
            <div className="form-grid" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
              {([["base_paise", "Base"], ["per_km_paise", "Per km"], ["minimum_paise", "Minimum"]] as const).map(([k, l]) => (
                <Field key={k} label={l}><NumberInput rupees min={0} step={0.5} scale={100} value={draft[k]} onValue={(n) => set({ [k]: Math.round(n) } as Partial<Draft>)} /></Field>
              ))}
            </div>
            <Field label="Operational approval reference" error={refError} hint="Permit or approval number. Required to open bookings.">
              <input value={draft.approval_reference} maxLength={500} onChange={(e) => set({ approval_reference: e.target.value })} placeholder="e.g. TN-TPT/2026/0977" />
            </Field>
            <Switch checked={draft.active} onChange={(v) => set({ active: v })} label="Open bookings in this zone" hint="Existing quotes keep their price until they expire." />
          </div>
          <div className="card" style={{ background: "var(--surface-2)", boxShadow: "none", padding: "14px 16px" }}>
            <strong className="small">Ready to open bookings?</strong>
            <ul className="checklist" style={{ marginTop: 10 }}>
              {checks.map(([s, t, d], i) => <li key={i} className={s}><Icon name={s === "done" ? "check" : s === "bad" ? "x" : "circle"} size={16} /><span>{t}{d && <small>{d}</small>}</span></li>)}
            </ul>
          </div>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {blocked && <span className="small" style={{ color: "var(--danger)", fontWeight: 600, marginRight: "auto" }}>{!refOk ? "Add the approval reference, or turn off “Open bookings” to save as inactive." : liveClash.length ? "Fix the overlap with a live zone before opening bookings." : "Fix the items marked ✕ before opening bookings."}</span>}
          <button type="button" className="btn secondary" disabled={!dirty || busy} onClick={() => (saved ? setDraft({ ...saved }) : (setDraft(null), setPicking(true)))}>Discard</button>
          <button type="button" className="btn primary" disabled={busy} aria-disabled={blocked || (!dirty && Boolean(saved))} onClick={() => void save()}>{draft.active ? (saved?.active ? "Save changes" : "Save and open bookings") : "Save zone"}</button>
        </div>
      </div>
    </section>
  );
}
