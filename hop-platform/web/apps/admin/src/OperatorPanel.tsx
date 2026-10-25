import { useCallback, useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import OperatorFinance, { type FinancePart } from "./OperatorFinance";

export type OpsSection = "pricing" | "areas" | "drivers" | "incidents" | "audit" | FinancePart;
import TripPricingForm from "./TripPricingForm";
import AdminConsole from "./AdminConsole";
import type { Area, Driver, Incident } from "@hop/shared/types";
type Operations = {
  areas: Area[];
  pricing: {
    area_id: string;
    category: string;
    base_paise: number;
    per_km_paise: number;
    minimum_paise: number;
    pricing_version: number;
    enabled: boolean;
  }[];
  drivers: Driver[];
  vehicle_changes: {
    id: string;
    name: string;
    current_category: string;
    current_number: string;
    vehicle_category: string;
    vehicle_number: string;
  }[];
  incidents: Incident[];
  events: {
    id: number;
    action: string;
    created_at: string;
    ride_id?: string;
  }[];
};
export default function OperatorPanel({
  notify,
  section,
}: {
  notify: (s: string) => void;
  section: OpsSection;
}) {
  const [data, setData] = useState<Operations | null>(null),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Area | null>(null),
    [pricingArea, setPricingArea] = useState("");
  const load = useCallback(async () => {
    try {
      const next = await api<Operations>("/api/operator");
      setData(next);
      setPricingArea((current) => current || next.areas[0]?.id || "");
    } catch (e) {
      notify((e as Error).message);
    }
  }, [notify]);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const fields: Record<string, unknown> = {
      id: selected?.id || "",
      name: f.get("name"),
      state: f.get("state"),
      active: f.get("active") === "on",
      approval_reference: f.get("approval_reference"),
    };
    for (const key of [
      "min_lat",
      "max_lat",
      "min_lng",
      "max_lng",
      "base_paise",
      "per_km_paise",
      "minimum_paise",
    ])
      fields[key] = Number(f.get(key));
    try {
      await api("/api/operator/areas", fields);
      setSelected(null);
      await load();
      notify(
        "Service area saved. Existing quotes retain their original price until expiry.",
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function review(
    e: React.FormEvent<HTMLFormElement>,
    id: string,
    type: "drivers" | "incidents" | "vehicle-changes",
  ) {
    e.preventDefault();
    setBusy(true);
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(`/api/operator/${type}/${id}`, fields);
      await load();
      notify("Review saved to the audit trail.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function savePricing(
    e: React.FormEvent<HTMLFormElement>,
    category: string,
  ) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/api/operator/pricing", {
        area_id: pricingArea,
        category,
        base_paise: Number(form.get("base_paise")),
        per_km_paise: Number(form.get("per_km_paise")),
        minimum_paise: Number(form.get("minimum_paise")),
        enabled: form.get("enabled") === "on",
      });
      await load();
      notify(`${category} pricing saved. Existing quotes keep their snapshot.`);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <div className="empty">Loading operations…</div>;
  return (
    <div className="operations">
      {section === "pricing" && <div className="tip">
        Activation records an operator decision. Confirm state-specific
        authority, support coverage and driver verification before opening real
        bookings. This interface does not verify regulatory approval.
      </div>}
      {section === "pricing" && <>
      <section className="panel">
        <h3>Vehicle categories and pricing</h3>
        <p className="muted">
          Configure rates before enabling a category. Bike rates follow the
          service-area fare settings above.
        </p>
        <label>
          Service area
          <select
            value={pricingArea}
            onChange={(e) => setPricingArea(e.target.value)}
          >
            {data.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}, {a.state}
              </option>
            ))}
          </select>
        </label>
        <div className="pricing-grid">
          {[
            ["auto", "Auto-rickshaw"],
            ["mini", "Mini cab"],
            ["sedan", "Sedan"],
            ["suv", "SUV"],
          ].map(([category, label]) => {
            const current = data.pricing.find(
              (row) =>
                row.area_id === pricingArea && row.category === category,
            );
            return (
              <form
                className="inset"
                key={category}
                onSubmit={(e) => void savePricing(e, category)}
              >
                <h4>{label}</h4>
                <div className="form-grid">
                  {[
                    ["base_paise", "Base fare (paise)"],
                    ["per_km_paise", "Per km (paise)"],
                    ["minimum_paise", "Minimum fare (paise)"],
                  ].map(([field, title]) => (
                    <label key={field}>
                      {title}
                      <input
                        name={field}
                        type="number"
                        min={field === "base_paise" ? 0 : 1}
                        max={field === "per_km_paise" ? 10000 : 100000}
                        step="1"
                        defaultValue={
                          field === "base_paise"
                            ? (current?.base_paise ?? 0)
                            : field === "per_km_paise"
                              ? (current?.per_km_paise ?? 0)
                              : (current?.minimum_paise ?? 0)
                        }
                        required
                      />
                    </label>
                  ))}
                </div>
                <label className="check">
                  <input
                    name="enabled"
                    type="checkbox"
                    defaultChecked={current?.enabled ?? false}
                  />
                  Offer this category
                </label>
                <button disabled={busy || !pricingArea}>Save pricing</button>
              </form>
            );
          })}
        </div>
      </section>
      <TripPricingForm area={pricingArea} notify={notify} />
      </>}
      <div className="operator-grid">
        {section === "areas" && <section className="panel">
          <h3>Service areas</h3>
          {data.areas.map((a) => (
            <div className="area-row" key={a.id}>
              <span>
                {a.name}, {a.state}
                <small>{a.active ? "Active" : "Inactive"}</small>
              </span>
              <button className="text-button" onClick={() => setSelected(a)}>
                Edit
              </button>
            </div>
          ))}
          <h3>{selected ? "Edit area" : "New service area"}</h3>
          <form key={selected?.id || "new"} onSubmit={save}>
            <div className="form-grid">
              <label>
                Area name
                <input
                  name="name"
                  defaultValue={selected?.name}
                  required
                  maxLength={100}
                />
              </label>
              <label>
                State / territory
                <input
                  name="state"
                  defaultValue={selected?.state}
                  required
                  maxLength={100}
                />
              </label>
              {[
                ["min_lat", "South latitude"],
                ["max_lat", "North latitude"],
                ["min_lng", "West longitude"],
                ["max_lng", "East longitude"],
                ["base_paise", "Base fare (paise)"],
                ["per_km_paise", "Per km (paise)"],
                ["minimum_paise", "Minimum fare (paise)"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    name={key}
                    type="number"
                    step={
                      key.includes("lat") || key.includes("lng")
                        ? "0.000001"
                        : "1"
                    }
                    defaultValue={
                      selected?.[key as keyof Area] as number | undefined
                    }
                    required
                  />
                </label>
              ))}
            </div>
            <label>
              Operational approval reference
              <input
                name="approval_reference"
                defaultValue={selected?.approval_reference}
                maxLength={500}
              />
            </label>
            <label className="check">
              <input
                name="active"
                type="checkbox"
                defaultChecked={selected?.active}
              />
              Activate bookings in this area
            </label>
            <div className="actions">
              <button disabled={busy}>Save area</button>
              {selected && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setSelected(null)}
                >
                  New area
                </button>
              )}
            </div>
          </form>
        </section>}
        {section === "drivers" && <section>
          <h3>Vehicle change requests</h3>
          {!data.vehicle_changes?.length && <div className="empty">No pending vehicle changes.</div>}
          {data.vehicle_changes?.map((v) => (
            <article className="panel" key={v.id}>
              <h3>{v.name}</h3>
              <p className="muted">
                {v.current_category} · {v.current_number} → <strong>{v.vehicle_category} · {v.vehicle_number}</strong>
              </p>
              <form onSubmit={(e) => review(e, v.id, "vehicle-changes")}>
                <label>
                  Decision
                  <select name="status" defaultValue="approved">
                    <option value="approved">Approve</option>
                    <option value="rejected">Reject</option>
                  </select>
                </label>
                <label>
                  Note to driver
                  <textarea name="note" required minLength={5} maxLength={1000} placeholder="e.g. RC verified for the new vehicle" />
                </label>
                <button disabled={busy}>Save decision</button>
              </form>
            </article>
          ))}
        </section>}
        {section === "drivers" && <section>
          <h3>Driver reviews</h3>
          <AdminConsole notify={notify} />
        </section>}
      </div>
      {section === "incidents" && <section>
        <h3>Incident queue</h3>
        {!data.incidents.length ? (
          <div className="empty">No incidents reported.</div>
        ) : (
          <div className="ride-grid">
            {data.incidents.map((i) => (
              <article className="panel" key={i.id}>
                <span className="pill">{i.status}</span>
                <p>{i.message}</p>
                <small>Ride {i.ride_id}</small>
                <form onSubmit={(e) => review(e, i.id, "incidents")}>
                  <label>
                    Status
                    <select
                      name="status"
                      defaultValue={
                        i.status === "closed" ? "closed" : "reviewing"
                      }
                    >
                      <option value="reviewing">Reviewing</option>
                      <option value="closed">Closed</option>
                    </select>
                  </label>
                  <label>
                    Response to reporter
                    <textarea
                      name="resolution"
                      defaultValue={i.resolution}
                      minLength={5}
                      maxLength={2000}
                      required
                    />
                  </label>
                  <button disabled={busy}>Save response</button>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>}
      {section === "audit" && <section className="panel">
        <h3>Recent audit events</h3>
        <p className="muted">
          Most recent 100 events. Records are created by server transactions.
        </p>
        {data.events.map((e) => (
          <div className="audit-row" key={e.id}>
            <code>{e.action}</code>
            <time>{new Date(e.created_at).toLocaleString("en-IN")}</time>
          </div>
        ))}
      </section>}
      {section !== "pricing" && section !== "areas" && section !== "drivers" && section !== "incidents" && section !== "audit" && (
        <OperatorFinance notify={notify} areas={data?.areas ?? []} part={section} />
      )}
    </div>
  );
}
