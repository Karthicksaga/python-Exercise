import { useRef, useState } from "react";
import VehicleArt from "./VehicleArt";

// Drag the taxi along the road to confirm. Releasing early springs back.
export default function SwipeButton({ label, onConfirm, disabled, tone = "go", icon = "🚖", vehicle }: { vehicle?: string; label: string; onConfirm: () => void; disabled?: boolean; tone?: "go" | "stop"; icon?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const [done, setDone] = useState(false);
  const position = useRef(0);
  const max = () => Math.max(0, (track.current?.clientWidth ?? 280) - (vehicle ? 60 : 54));
  const move = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    position.current = Math.max(0, Math.min(max(), clientX - r.left - 27));
    setX(position.current);
  };
  const end = () => {
    setDrag(false);
    if (!disabled && !done && drag && max() > 0 && position.current > max() * 0.85) {
      setX(max());
      setDone(true);
      navigator.vibrate?.(30);
      onConfirm();
      setTimeout(() => { setDone(false); setX(0); }, 1200);
    } else { position.current = 0; setX(0); }
  };
  const pct = max() ? x / max() : 0;
  return (
    <div ref={track} className={`swipe ${tone}${vehicle ? ` v-${vehicle}` : ""}${drag ? " dragging" : ""}${done ? " done" : ""}${disabled ? " off" : ""}`} aria-disabled={disabled || done}>
      <div className="swipe-fill" style={{ width: x + 54 }} />
      <span className="swipe-label" style={{ opacity: 1 - pct * 1.4 }}>{done ? "✓" : label}</span>
      <button
        type="button"
        className="swipe-knob"
        aria-label={label}
        disabled={disabled || done}
        style={{ transform: `translateX(${x}px)`, transition: drag ? "none" : "transform .35s cubic-bezier(.3,1.4,.5,1)" }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); }}
        onPointerMove={(e) => drag && move(e.clientX)}
        onPointerUp={end}
        onPointerCancel={() => { setDrag(false); position.current = 0; setX(0); }}
        onKeyDown={(e) => { if (!disabled && !done && !e.repeat && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onConfirm(); } }}
      >
        {vehicle ? <VehicleArt category={vehicle} width={40} /> : icon}
      </button>
    </div>
  );
}
