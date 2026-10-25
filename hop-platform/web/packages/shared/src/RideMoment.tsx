import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@mantine/core";

export type MomentKind = "booked" | "rider-accepted" | "driver-accepted" | "completed";
export type MomentData = { kind: MomentKind; title?: string; sub?: string; plate?: string; vehicle?: string };

export function showMoment(detail: MomentData) {
  window.dispatchEvent(new CustomEvent("hop:moment", { detail }));
}

const rides: Record<string, { icon: string; cls: string }> = {
  bike: { icon: "🏍️", cls: "v-bike" },
  auto: { icon: "🛺", cls: "v-auto" },
  mini: { icon: "🚕", cls: "v-car" },
  sedan: { icon: "🚗", cls: "v-car" },
  suv: { icon: "🚙", cls: "v-suv" },
};

const colors = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9"];

function Check() {
  return (
    <div className="m-check"><svg viewBox="0 0 40 40"><path d="M9 21l8 8 14-17" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
  );
}

// Full-screen celebration cards for key ride moments; auto-dismiss, tap to close.
export default function RideMoment() {
  const [m, setM] = useState<MomentData | null>(null);
  useEffect(() => {
    let timer: number;
    const on = (e: Event) => {
      setM((e as CustomEvent<MomentData>).detail);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setM(null), 3200);
    };
    window.addEventListener("hop:moment", on);
    return () => {
      window.removeEventListener("hop:moment", on);
      window.clearTimeout(timer);
    };
  }, []);
  if (!m) return null;
  const party = m.kind === "rider-accepted" || m.kind === "completed";
  return createPortal(
    <div className="moment" role="status" aria-live="polite" onClick={() => setM(null)}>
      <div className="moment-card">
        {party && (
          <div className="m-confetti" aria-hidden="true">
            {Array.from({ length: 26 }, (_, i) => (
              <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 7) * 0.12}s` }} />
            ))}
          </div>
        )}
        {m.kind === "booked" ? <span className={"m-rocket " + (rides[m.vehicle ?? ""]?.cls ?? "")} aria-hidden="true">{rides[m.vehicle ?? ""]?.icon ?? "🚀"}</span> : <Check />}
        <h2>{m.title}</h2>
        {m.sub && <p>{m.sub}</p>}
        {(m.kind === "rider-accepted" || m.kind === "driver-accepted") && (
          <>
            <div className="m-road" aria-hidden="true"><span className={"m-car " + (rides[m.vehicle ?? ""]?.cls ?? "v-car")}>{rides[m.vehicle ?? ""]?.icon ?? "🚕"}</span></div>
            {m.plate && <span className="m-plate">{m.plate}</span>}
          </>
        )}
        <Button mt="md" variant="light" fullWidth onClick={() => setM(null)}>Continue</Button>
      </div>
    </div>,
    document.body,
  );
}
