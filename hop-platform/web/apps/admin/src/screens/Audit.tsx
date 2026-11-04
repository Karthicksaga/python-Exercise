import { useState } from "react";
import type { ScreenProps } from "../AdminApp";
import { useLoad, when } from "../lib";
import type { Operations } from "../types";
import { Chips, Field, Note, Skeleton, useNotify } from "../ui";

const GROUPS: [string, string, RegExp][] = [
  ["all", "All", /./], ["captain", "Captains", /driver|captain|document|vehicle_change|area_change|payout/i], ["ride", "Rides", /ride|cancel|sos|incident|lost/i],
  ["money", "Money", /refund|payout|promo|wallet|payment/i], ["network", "Areas & fares", /area|pricing|surge|peak|trip/i],
];
const detailText = (d: unknown) => (d == null ? "" : typeof d === "string" ? d : JSON.stringify(d));

export default function Audit(_: ScreenProps) {
  const notify = useNotify();
  const { data } = useLoad<Operations>("/api/operator", notify);
  const [group, setGroup] = useState("all"), [q, setQ] = useState("");
  if (!data) return <Skeleton rows={8} />;
  const re = GROUPS.find(([k]) => k === group)![2], needle = q.trim().toLowerCase();
  const rows = data.events.filter((e) => re.test(e.action) && (!needle || `${e.action} ${detailText(e.detail)} ${e.ride_id ?? ""}`.toLowerCase().includes(needle)));
  return (
    <>
      <div className="spread" style={{ flexWrap: "wrap" }}>
        <Chips label="Kind" value={group} onChange={setGroup} items={GROUPS.map(([k, l]) => [k, l] as [string, string])} />
        <Field label={<span className="sr">Search the audit log</span>}><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search actions, IDs or details" /></Field>
      </div>
      <section className="card flush">
        <div className="table-wrap">
          <table className="tbl responsive">
            <thead><tr><th>Action</th><th>Details</th><th>Ride</th><th>When</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="lead"><span className="mono">{e.action}</span></td>
                  <td data-label="Details"><span className="small" style={{ overflowWrap: "anywhere" }}>{detailText(e.detail).slice(0, 160) || "—"}</span></td>
                  <td data-label="Ride">{e.ride_id ? <a href={`#rides/${e.ride_id}`} className="mono">{e.ride_id.slice(0, 8)}</a> : "—"}</td>
                  <td data-label="When">{when(e.created_at)}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={4} className="muted">No matching events.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <Note icon="shield">The 100 most recent events. The server writes each record in the same transaction as the change, and they can't be edited or deleted from the console.</Note>
    </>
  );
}
