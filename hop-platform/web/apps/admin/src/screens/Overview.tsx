import { useState } from "react";
import type { ScreenProps } from "../AdminApp";
import { ago, CATS, num, rupee, rupeeShort, useLoad, waited } from "../lib";
import type { Analytics, SOSEvent, SummaryArea } from "../types";
import { Badge, Empty, Icon, Skeleton, useNotify } from "../ui";

type Attention = { tone: "bad" | "warn" | "info" | ""; icon: string; title: string; sub: string; href: string; cta: string };

// Last 7 calendar days (today last), filling days with no rides.
function lastWeek(volume: Analytics["volume"]) {
  const byDay = new Map(volume.map((v) => [v.day, v]));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const v = byDay.get(key);
    return { label: d.toLocaleDateString("en-IN", { weekday: "short" }), count: v?.count ?? 0, completed: v?.completed ?? 0 };
  });
}

function RideChart({ rows }: { rows: ReturnType<typeof lastWeek> }) {
  const [hover, setHover] = useState(-1);
  const top = Math.max(10, ...rows.map((r) => r.completed));
  const step = top <= 10 ? 5 : top <= 50 ? 10 : top <= 200 ? 50 : top <= 1000 ? 250 : 500;
  const max = Math.ceil(top / step) * step, ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  const last = rows.length - 1;
  return (
    <div className="chart vchart" role="img" aria-label={`Completed rides per day, last 7 days: ${rows.map((r) => `${r.label} ${r.completed}`).join(", ")}`}>
      <div className="vplot">
        {ticks.map((t) => <span key={t} className="vtick" style={{ bottom: `${(t / max) * 100}%` }}><b>{num(t)}</b></span>)}
        {rows.map((r, i) => {
          const h = (r.completed / max) * 100, cancelled = r.count - r.completed;
          return (
            <div key={i} className="vcol" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(-1)}>
              {i === last && <em style={{ bottom: `calc(${h}% + 4px)` }}>{num(r.completed)}</em>}
              <i style={{ height: `${h}%` }} />
              {hover === i && <div className="tip" style={{ left: "50%", top: `${100 - h}%` }}><b>{r.label}{i === last ? " · today" : ""}</b>{num(r.completed)} completed<br />{num(cancelled)} not completed</div>}
            </div>
          );
        })}
      </div>
      <div className="vaxis">{rows.map((r, i) => <span key={i}>{r.label}</span>)}</div>
    </div>
  );
}

export default function Overview({ summary }: ScreenProps) {
  const notify = useNotify();
  const { data: a } = useLoad<Analytics>("/api/operator/analytics", notify, 60000);
  const { data: z } = useLoad<{ areas: SummaryArea[] }>("/api/operator/summary", notify, 30000);
  const { data: sos } = useLoad<{ sos_events: SOSEvent[] }>(summary?.sos_active ? "/api/operator/sos" : null, notify);
  if (!a || !summary) return <Skeleton rows={8} />;

  const week = lastWeek(a.volume ?? []);
  const today = week[6], yesterday = week[5];
  const delta = yesterday.completed ? Math.round(((today.completed - yesterday.completed) / yesterday.completed) * 100) : null;
  const cancelRate = a.total_rides ? ((a.cancelled_rides / a.total_rides) * 100).toFixed(1) : "0";
  const s = summary, areas = z?.areas ?? [];
  const items: Attention[] = [];
  for (const e of (sos?.sos_events ?? []).filter((x) => x.incident_status !== "closed"))
    items.push({ tone: "bad", icon: "alert", title: `SOS from ${e.rider_name}`, sub: `${e.pickup_label} → ${e.dropoff_label}${e.driver_name ? ` · captain ${e.driver_name}` : ""} · ${ago(e.created_at)}`, href: "#safety", cta: "Respond" });
  if (s.sos_active && !sos) items.push({ tone: "bad", icon: "alert", title: `${s.sos_active} active SOS`, sub: "Respond now", href: "#safety", cta: "Respond" });
  if (s.incidents_open) items.push({ tone: "warn", icon: "shield", title: `${s.incidents_open} open incident report${s.incidents_open > 1 ? "s" : ""}`, sub: "Riders and captains are waiting for a response", href: "#safety/incidents", cta: "Review" });
  if (s.drivers_pending) items.push({ tone: "info", icon: "id", title: `${s.drivers_pending} captain application${s.drivers_pending > 1 ? "s" : ""}`, sub: s.oldest_pending_at ? `Oldest waiting ${waited(s.oldest_pending_at)}` : "Waiting for review", href: "#reviews", cta: "Review" });
  if (s.changes_pending) items.push({ tone: "info", icon: "id", title: `${s.changes_pending} vehicle or area change request${s.changes_pending > 1 ? "s" : ""}`, sub: "Captains asked to change their vehicle or zone", href: "#reviews/vehicle", cta: "Review" });
  if (s.payouts_requested) items.push({ tone: "info", icon: "wallet", title: `${s.payouts_requested} payout request${s.payouts_requested > 1 ? "s" : ""}`, sub: `${rupee(s.payouts_requested_paise)} to pay out by UPI`, href: "#payouts", cta: "Pay" });
  if (s.expiring_7d) items.push({ tone: "warn", icon: "clock", title: `${s.expiring_7d} captain${s.expiring_7d > 1 ? "s have" : " has"} a document expiring within 7 days`, sub: "Captains are reminded automatically at 30, 7 and 1 days", href: "#reviews/expiring", cta: "View" });
  for (const ar of areas.filter((x) => x.active && x.categories.length < 5))
    items.push({ tone: "warn", icon: "tag", title: `${ar.name} offers only ${ar.categories.map((c) => CATS[c]).join(", ") || "no vehicles"}`, sub: `Set fares for ${5 - ar.categories.length} more vehicle type${5 - ar.categories.length > 1 ? "s" : ""} so riders can book them`, href: `#fares/${ar.id}`, cta: "Set fares" });
  if (s.lost_open) items.push({ tone: "", icon: "box", title: `${s.lost_open} lost item claim${s.lost_open > 1 ? "s" : ""} not started`, sub: "Contact the captain to arrange a return", href: "#lost", cta: "Open" });
  const payTotal = a.payments.reduce((t, p) => t + p.total_paise, 0), payMax = Math.max(1, ...a.payments.map((p) => p.total_paise));

  return (
    <>
      <section className="grid g-kpi" aria-label="Today">
        <div className="card kpi"><span className="eyebrow">Gross bookings today</span><strong>{rupeeShort(a.gmv_today_paise)}</strong><small>{rupeeShort(a.gmv_all_time_paise)} all time</small></div>
        <div className="card kpi"><span className="eyebrow">Completed rides today</span><strong>{num(today.completed)}</strong><small>{delta != null && <><span className={`delta ${delta >= 0 ? "up" : "down"}`}>{delta >= 0 ? "+" : ""}{delta}%</span> vs yesterday · </>}{cancelRate}% cancelled overall</small></div>
        <div className="card kpi"><span className="eyebrow">Captains online</span><strong>{num(a.active_drivers)}</strong><small>of {num(a.total_drivers)} approved captains</small></div>
        <div className="card kpi"><span className="eyebrow">Active rides now</span><strong>{num(s.active_rides)}</strong><small>{num(a.total_riders)} riders registered</small></div>
      </section>
      <section className="grid g-main">
        <div className="card">
          <div className="card-head"><h2>Needs attention</h2><Badge tone="plain">{items.length} item{items.length === 1 ? "" : "s"}</Badge><p>Most urgent first. Select an item to open it.</p></div>
          {items.length ? (
            <div className="list">
              {items.map((it, i) => (
                <a key={i} className="li attn" href={it.href} style={{ textDecoration: "none", color: "inherit" }}>
                  <span className={`li-icon ${it.tone}`}><Icon name={it.icon} /></span>
                  <span className="li-main"><strong>{it.title}</strong><small>{it.sub}</small></span>
                  <span className={`btn sm ${it.tone === "bad" ? "danger" : "secondary"}`}>{it.cta}</span>
                </a>
              ))}
            </div>
          ) : <Empty title="All clear">Nothing is waiting on an operator.</Empty>}
        </div>
        <div className="stack" style={{ gap: 18 }}>
          <div className="card"><div className="card-head"><h3>Completed rides, last 7 days</h3></div><RideChart rows={week} /></div>
          <div className="card">
            <div className="card-head"><h3>Completed rides by payment method</h3><p>All time</p></div>
            {a.payments.length ? a.payments.map((p) => (
              <div className="hbar" key={p.payment_method}>
                <span>{p.payment_method === "upi" ? "UPI" : p.payment_method.charAt(0).toUpperCase() + p.payment_method.slice(1)}</span>
                <span className="track"><span className="fill" style={{ display: "block", width: `${(p.total_paise / payMax) * 100}%` }} /></span>
                <span>{rupeeShort(p.total_paise)}<small>{Math.round((p.total_paise / Math.max(1, payTotal)) * 100)}% · {num(p.count)} rides</small></span>
              </div>
            )) : <p className="muted">No completed rides yet.</p>}
          </div>
        </div>
      </section>
      <section className="card">
        <div className="card-head"><h2>Service areas</h2><a className="btn sm secondary" href="#zones">Manage areas</a></div>
        <div className="table-wrap">
          <table className="tbl responsive">
            <thead><tr><th>Area</th><th>Status</th><th>Vehicle types</th><th>Surge override</th><th className="num">Captains online</th></tr></thead>
            <tbody>
              {areas.map((ar) => (
                <tr key={ar.id} className="clickable" tabIndex={0} onClick={() => (location.hash = `zones/${ar.id}`)} onKeyDown={(e) => e.key === "Enter" && (location.hash = `zones/${ar.id}`)}>
                  <td className="lead"><strong>{ar.name}</strong><small>{ar.state}</small></td>
                  <td data-label="Status">{ar.active ? <Badge tone="ok">Bookings open</Badge> : <Badge tone="plain">Inactive</Badge>}</td>
                  <td data-label="Vehicle types">{ar.categories.map((c) => CATS[c]).join(", ") || "—"}</td>
                  <td data-label="Surge override">{ar.surge_multiplier ? <Badge tone="warn">{ar.surge_multiplier}× · {ar.surge_reason}</Badge> : <span className="muted">None</span>}</td>
                  <td data-label="Captains online" className="num">{ar.active ? num(ar.captains_online) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
