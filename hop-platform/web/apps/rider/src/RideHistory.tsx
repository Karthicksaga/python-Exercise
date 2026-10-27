import { useEffect, useState } from "react";
import RideCard from "@hop/shared/RideCard";
import VehicleArt from "@hop/shared/VehicleArt";
import { active, money, type Ride } from "@hop/shared/types";
import { api } from "@hop/shared/api";
import "./ride-history.css";

type ScheduledRide = { id: string; category: string; pickup_label: string; dropoff_label: string; scheduled_for: string; status: string };
export default function RideHistory({ rides, refresh, notify, onBook }: {
  rides: Ride[]; refresh: () => Promise<void>; notify: (message: string) => void; onBook: () => void;
}) {
  const [tab, setTab] = useState<"ongoing" | "upcoming" | "past">("ongoing");
  const [scheduled, setScheduled] = useState<ScheduledRide[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (tab !== "upcoming") return;
    let live = true;
    setLoading(true); setError("");
    api<{ scheduled_rides: ScheduledRide[] }>("/api/companion")
      .then(data => { if (live) setScheduled(data.scheduled_rides); })
      .catch((e: Error) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [tab, revision]);
  const visible = rides.filter(ride => tab === "ongoing" ? active(ride) : !active(ride));
  const upcoming = scheduled.filter(ride => ride.status === "scheduled");
  const empty = tab === "upcoming" ? !upcoming.length : !visible.length;
  return <section className="rider-history" aria-label="My rides">
    <div className="history-tabs" role="tablist" aria-label="Ride history">
      {(["ongoing", "upcoming", "past"] as const).map(id => <button key={id} id={`rides-${id}`} role="tab" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} aria-controls="rides-panel" onKeyDown={event => {
        const tabs = ["ongoing", "upcoming", "past"] as const;
        const index = tabs.indexOf(id);
        const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : -1;
        if (next < 0) return;
        event.preventDefault(); setTab(tabs[next]);
        document.getElementById(`rides-${tabs[next]}`)?.focus();
      }} onClick={() => setTab(id)}>{id[0].toUpperCase() + id.slice(1)}</button>)}
    </div>
    <div className="stat-strip">
      <div><strong>{rides.length}</strong><span>Total rides</span></div>
      <div><strong>{rides.filter(r => r.status === "completed").length}</strong><span>Completed</span></div>
      <div><strong>{money(rides.filter(r => r.status === "completed").reduce((sum, r) => sum + r.fare_paise, 0))}</strong><span>Total fares</span></div>
    </div>
    <div id="rides-panel" role="tabpanel" aria-labelledby={`rides-${tab}`} aria-busy={tab === "upcoming" && loading}>
      {tab === "upcoming" && loading ? <p role="status">Loading scheduled rides…</p> : error && tab === "upcoming" ? <div role="alert"><p>{error}</p><button onClick={() => setRevision(v => v + 1)}>Try again</button></div> : empty ? <div className="history-empty">
        <div className="history-illustration" aria-hidden="true"><span>●</span><VehicleArt category="mini" width={160} /></div>
        <h2>{tab === "ongoing" ? "No active rides" : tab === "upcoming" ? "No upcoming rides" : "No past rides"}</h2>
        <p>{tab === "past" ? "Your completed and cancelled rides will appear here." : "Book a ride to get started."}</p>
        <div className="history-empty-actions"><button onClick={onBook}>Book a ride</button>{tab !== "past" && <button className="ghost" onClick={() => setTab("past")}>View past rides</button>}</div>
      </div> : tab === "upcoming" ? <div className="ride-grid">{upcoming.map(ride => <article className="history-scheduled" key={ride.id}>
        <strong>{ride.category}</strong><span>{new Date(ride.scheduled_for).toLocaleString()}</span><p>{ride.pickup_label} → {ride.dropoff_label}</p><small>{ride.status}</small>
        <button disabled={!!cancelling} className="ghost" onClick={async () => {
          setCancelling(ride.id);
          try { await api(`/api/scheduled-rides/${ride.id}/cancel`, {}); notify("Cancelled"); setRevision(v => v + 1); }
          catch (e) { notify((e as Error).message); }
          finally { setCancelling(""); }
        }}>{cancelling === ride.id ? "Cancelling…" : "Cancel"}</button>
      </article>)}</div> : <div className="ride-grid">{visible.map(ride => <RideCard key={ride.id} ride={ride} refresh={refresh} notify={notify} />)}</div>}
    </div>
  </section>;
}
