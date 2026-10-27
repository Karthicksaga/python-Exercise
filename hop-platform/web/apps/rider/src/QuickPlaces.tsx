import { hubs } from "@hop/shared/hubs";
import type { Point, Ride, SavedLocation } from "@hop/shared/types";

const icon = { home: "🏠", work: "💼", favorite: "⭐" } as const;

// One-tap destinations: saved places first, then the most recent distinct drop-offs.
export default function QuickPlaces({ saved, rides, onPick, area }: { saved: SavedLocation[]; rides: Ride[]; onPick: (p: Point) => void; area?: string }) {
  const seen = new Set(saved.map((s) => s.place_label.split(",")[0]));
  const recent: Point[] = [];
  for (const r of rides) {
    if (recent.length >= 4) break;
    const short = r.dropoff_label.split(",")[0];
    if (seen.has(short) || r.status === "cancelled") continue;
    seen.add(short);
    recent.push({ lat: r.dropoff_lat, lng: r.dropoff_lng, label: r.dropoff_label });
  }
  const hubList = (area && hubs[area]) || [];
  if (!saved.length && !recent.length && !hubList.length) return null;
  return (
    <div className="quick-places" aria-label="Quick destinations">
      <h3>Saved & recent places</h3>
      <div className="quick-place-grid">
      {saved.map((s) => (
        <button key={s.id} type="button" className="quick-place" onClick={() => onPick({ lat: s.lat, lng: s.lng, label: s.place_label })}>
          <span aria-hidden="true">{icon[s.kind]}</span><span><strong>{s.label}</strong><small>{s.place_label}</small></span>
        </button>
      ))}
      {recent.map((p) => (
        <button key={p.label} type="button" className="quick-place" onClick={() => onPick(p)} title={p.label}>
          <span aria-hidden="true">🕘</span><span><strong>{p.label.split(",")[0]}</strong><small>Recent destination</small></span>
        </button>
      ))}
      {hubList.map((h) => (
        <button key={h.label} type="button" className="quick-place" onClick={() => onPick({ lat: h.lat, lng: h.lng, label: h.label })} title={h.note}>
          <span aria-hidden="true">{h.kind === "airport" ? "✈️" : "🚆"}</span><span><strong>{h.label.split(",")[0].replace(/ International| Railway Station| \(.*\)/g, "")}</strong><small>{h.note}</small></span>
        </button>
      ))}
      </div>
    </div>
  );
}
