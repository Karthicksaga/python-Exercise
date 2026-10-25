import { useRef, useState } from "react";
import VehicleArt from "./VehicleArt";

// Drag the taxi along the road to confirm. Releasing early springs back.
export default function SwipeButton({ label, onConfirm, disabled, tone = "go", icon = "🚖", vehicle }: { vehicle?: string; label: string; onConfirm: () => void; disabled?: boolean; tone?: "go" | "stop"; icon?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const [done, setDone] = useState(false);
  const max = () => (track.current?.clientWidth ?? 280) - 54;
  const move = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    setX(Math.max(0, Math.min(max(), clientX - r.left - 27)));
  };
  const end = () => {
    setDrag(false);
    if (x > max() * 0.85) {
      setX(max());
      setDone(true);
      navigator.vibrate?.(30);
      onConfirm();
      setTimeout(() => { setDone(false); setX(0); }, 1200);
    } else setX(0);
  };
  const pct = max() ? x / max() : 0;
  return (
    <div ref={track} className={`swipe ${tone}${vehicle ? ` v-${vehicle}` : ""}${drag ? " dragging" : ""}${done ? " done" : ""}${disabled ? " off" : ""}`} aria-disabled={disabled}>
      <div className="swipe-fill" style={{ width: x + 54 }} />
      <span className="swipe-label" style={{ opacity: 1 - pct * 1.4 }}>{done ? "✓" : label}</span>
      <button
        type="button"
        className="swipe-knob"
        aria-label={label}
        disabled={disabled}
        style={{ transform: `translateX(${x}px)`, transition: drag ? "none" : "transform .35s cubic-bezier(.3,1.4,.5,1)" }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); }}
        onPointerMove={(e) => drag && move(e.clientX)}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onConfirm(); } }}
      >
        {vehicle ? <VehicleArt category={vehicle} width={40} /> : icon}
      </button>
    </div>
  );
}
