import { useEffect, useState } from "react";
import type { ScreenProps } from "../AdminApp";
import { ACTIVE_RIDE, rupee, useLoad, when } from "../lib";
import type { RideRecord } from "../types";
import { Chips, Empty, Field, RideBadge, Skeleton, useNotify } from "../ui";
import { RideDrawer } from "./RideActions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function Rides({ sub }: ScreenProps) {
  const notify = useNotify();
  const [q, setQ] = useState(sub), [query, setQuery] = useState(sub);
  const [status, setStatus] = useState("all");
  const [openId, setOpenId] = useState(UUID.test(sub) ? sub : "");
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const { data, loading, reload } = useLoad<{ rides: RideRecord[] }>(`/api/operator/rides?q=${encodeURIComponent(query)}`, notify);
  const all = data?.rides ?? [];
  const rows = all.filter((r) => status === "all" || (status === "active" ? ACTIVE_RIDE.includes(r.status) : r.status === status));
  const count = (k: string) => all.filter((r) => (k === "active" ? ACTIVE_RIDE.includes(r.status) : r.status === k)).length;
  const open = all.find((r) => r.id === openId);

  return (
    <>
      <div className="spread" style={{ flexWrap: "wrap" }}>
        <Chips label="Status" value={status} onChange={setStatus} items={[["all", "All", all.length], ["active", "Active", count("active")], ["completed", "Completed", count("completed")], ["cancelled", "Cancelled", count("cancelled")]]} />
        <Field label={<span className="sr">Search rides</span>} className="grow-field"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ride ID, rider, captain, email or status" style={{ minWidth: "min(320px, 100%)" }} /></Field>
      </div>
      <section className="card flush">
        {loading && !data ? <div style={{ padding: 20 }}><Skeleton /></div> : rows.length ? (
          <div className="table-wrap">
            <table className="tbl responsive">
              <thead><tr><th>Ride</th><th>Rider → Captain</th><th>Route</th><th>Status</th><th>Payment</th><th className="num">Fare</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="clickable" tabIndex={0} onClick={() => setOpenId(r.id)} onKeyDown={(e) => e.key === "Enter" && setOpenId(r.id)}>
                    <td className="lead"><span className="mono">{r.id.slice(0, 8)}</span><small>{when(r.created_at)}</small></td>
                    <td data-label="People">{r.rider} → {r.driver || "—"}</td>
                    <td data-label="Route">{r.pickup_label} → {r.dropoff_label}</td>
                    <td data-label="Status"><RideBadge status={r.status} /></td>
                    <td data-label="Payment">{r.payment_method.toUpperCase()} · {r.payment_status.replace(/_/g, " ")}</td>
                    <td data-label="Fare" className="num"><strong>{rupee(r.payable_paise)}</strong>{r.refunded_paise > 0 && <small>refunded {rupee(r.refunded_paise)}</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title={query ? `No rides match “${query}”` : "No rides yet"} icon="route">The 30 most recent matches are shown. Search by ride ID prefix, name, email or status.</Empty>}
      </section>
      {open && <RideDrawer ride={open} onClose={() => setOpenId("")} onChanged={() => { setOpenId(""); void reload(); }} />}
    </>
  );
}
