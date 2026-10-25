import type { Area } from "@hop/shared/types";

// Shown instead of the booking form until we know the rider is inside a service area.
export default function LocationGate({ state, areas, onRetry, onPick }: { state: "detecting" | "unsupported" | "denied"; areas: Area[]; onRetry: () => void; onPick: (a: Area) => void }) {
  if (state === "detecting")
    return (
      <div className="gate" role="status">
        <div className="radar" aria-hidden><i /><i /><i /></div>
        <strong>Finding your location…</strong>
        <p className="muted">We use your GPS to pick the right city and set your pickup.</p>
      </div>
    );
  return (
    <div className="gate" role="status">
      <div className="gate-icon" aria-hidden>{state === "denied" ? "📍" : "🚫"}</div>
      <strong>{state === "denied" ? "Turn on location to book" : "Service isn’t available in your area yet"}</strong>
      <p className="muted">
        {state === "denied"
          ? "Allow location access in your browser, or choose a city we serve."
          : "hop isn’t live where you are right now. We’re growing — check back soon."}
      </p>
      <button type="button" onClick={onRetry}>◎ Try my location again</button>
      {areas.length > 0 && (
        <>
          <p className="eyebrow">{state === "denied" ? "CHOOSE A CITY" : "CHOOSE A CITY TO EXPLORE"}</p>
          <div className="chips">
            {areas.map((a) => (
              <button key={a.id} type="button" className="chip" onClick={() => onPick(a)}>
                📍 {a.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
