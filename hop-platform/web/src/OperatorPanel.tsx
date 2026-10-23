import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Area, Driver, Incident } from "./types";
type Operations = {
  areas: Area[];
  drivers: Driver[];
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
}: {
  notify: (s: string) => void;
}) {
  const [data, setData] = useState<Operations | null>(null),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Area | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api<Operations>("/api/operator"));
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
    type: "drivers" | "incidents",
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
  if (!data) return <div className="empty">Loading operations…</div>;
  return (
    <div className="operations">
      <div className="section-heading">
        <h2>Operations</h2>
        <button className="secondary" onClick={load}>
          Refresh
        </button>
      </div>
      <div className="tip">
        Activation records an operator decision. Confirm state-specific
        authority, support coverage and driver verification before opening real
        bookings. This interface does not verify regulatory approval.
      </div>
      <div className="operator-grid">
        <section className="panel">
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
        </section>
        <section>
          <h3>Driver reviews</h3>
          {!data.drivers.length && (
            <div className="empty">Driver applications will appear here.</div>
          )}
          {data.drivers.map((d) => (
            <article className="panel" key={d.user_id}>
              <span className="pill">{d.status}</span>
              <h3>
                {d.name} · {d.vehicle_number}
              </h3>
              <p className="muted">{d.email}</p>
              <dl>
                <dt>Licence reference</dt>
                <dd>{d.license_reference}</dd>
                <dt>Insurance reference</dt>
                <dd>{d.insurance_reference}</dd>
                <dt>Expiry dates</dt>
                <dd>
                  {d.license_expires} / {d.insurance_expires}
                </dd>
              </dl>
              <form onSubmit={(e) => review(e, d.user_id, "drivers")}>
                <label>
                  Decision
                  <select name="status">
                    <option value="suspended">
                      Suspend / keep unavailable
                    </option>
                    <option value="approved">Approve verified driver</option>
                  </select>
                </label>
                <label>
                  Evidence reviewed and decision note
                  <textarea
                    name="note"
                    required
                    minLength={10}
                    maxLength={1000}
                  />
                </label>
                <button disabled={busy}>Save review</button>
              </form>
            </article>
          ))}
        </section>
      </div>
      <section>
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
      </section>
      <section className="panel">
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
      </section>
    </div>
  );
}
