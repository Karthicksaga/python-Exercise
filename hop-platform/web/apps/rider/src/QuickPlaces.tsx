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
    <div className="chips quick-places" aria-label="Quick destinations">
      {saved.map((s) => (
        <button key={s.id} type="button" className="chip" onClick={() => onPick({ lat: s.lat, lng: s.lng, label: s.place_label })}>
          {icon[s.kind]} {s.label}
        </button>
      ))}
      {recent.map((p) => (
        <button key={p.label} type="button" className="chip" onClick={() => onPick(p)} title={p.label}>
          🕘 {p.label.split(",")[0]}
        </button>
      ))}
      {hubList.map((h) => (
        <button key={h.label} type="button" className="chip" onClick={() => onPick(h)} title={h.note}>
          {h.kind === "airport" ? "✈️" : "🚆"} {h.label.split(",")[0].replace(/ International| Railway Station| \(.*\)/g, "")}
        </button>
      ))}
    </div>
  );
}
