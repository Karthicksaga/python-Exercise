import { useEffect, useRef, useState } from "react";
import { MapMarker } from "@hop/shared/mapkit";
import type { NearbyDriver } from "@hop/shared/types";

const colors: Record<string, string> = {
  bike: "#0ea5e9",
  auto: "#f59e0b",
  mini: "#10b981",
  sedan: "#6366f1",
  suv: "#ec4899",
};
const names: Record<string, string> = { bike: "Bike", auto: "Auto", mini: "Mini", sedan: "Sedan", suv: "SUV" };

// Top-down vehicle silhouettes; the nose points up so rotation matches the heading.
function Shape({ category }: { category: string }) {
  switch (category) {
    case "bike":
      return (
        <g fill="#fff">
          <rect x="11" y="3" width="2" height="5" rx="1" />
          <rect x="9" y="8" width="6" height="2" rx="1" />
          <rect x="10.5" y="10" width="3" height="8" rx="1.5" />
          <rect x="11" y="18" width="2" height="4" rx="1" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
        </g>
      );
    case "auto":
      return (
        <g fill="#fff">
          <path d="M12 3c3 0 5 2 5 5v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8c0-3 2-5 5-5z" />
          <path d="M8.8 8.5c0-1.7 1.5-3 3.2-3s3.2 1.3 3.2 3z" fill="currentColor" opacity=".55" />
          <rect x="8.5" y="12" width="7" height="5" rx="1" fill="currentColor" opacity=".25" />
        </g>
      );
    case "suv":
      return (
        <g fill="#fff">
          <rect x="7" y="2.5" width="10" height="19" rx="3.2" />
          <rect x="8.5" y="6" width="7" height="3" rx="1" fill="currentColor" opacity=".55" />
          <rect x="8.5" y="10.5" width="7" height="6" rx="1" fill="currentColor" opacity=".22" />
          <rect x="8.5" y="18" width="7" height="1.6" rx=".8" fill="currentColor" opacity=".55" />
        </g>
      );
    default:
      return (
        <g fill="#fff">
          <path d="M12 2.5c2.8 0 4.5 1.6 4.5 4.2v10.6c0 2.6-1.7 4.2-4.5 4.2s-4.5-1.6-4.5-4.2V6.7c0-2.6 1.7-4.2 4.5-4.2z" />
          <rect x="8.8" y="6.2" width="6.4" height="2.8" rx="1" fill="currentColor" opacity=".55" />
          <rect x="8.8" y="10.5" width="6.4" height="5" rx="1" fill="currentColor" opacity=".2" />
          <rect x="9" y="17.6" width="6" height="1.6" rx=".8" fill="currentColor" opacity=".55" />
        </g>
      );
  }
}

function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

// Glides between polls and turns to face the direction of travel.
export function NearbyCar({ driver }: { driver: NearbyDriver }) {
  const target = { lat: driver.lat, lng: driver.lng };
  const [pos, setPos] = useState(target);
  const [heading, setHeading] = useState(0);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (from.lat === target.lat && from.lng === target.lng) return;
    if (Math.abs(from.lat - target.lat) + Math.abs(from.lng - target.lng) > 0.00002) {
      setHeading((h) => {
        const next = bearing(from, target);
        const delta = ((next - h + 540) % 360) - 180;
        return h + delta;
      });
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 5000);
      const next = { lat: from.lat + (target.lat - from.lat) * t, lng: from.lng + (target.lng - from.lng) * t };
      current.current = next;
      setPos(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target.lat, target.lng]);
  const color = colors[driver.category] ?? "#6366f1";
  const label = `${names[driver.category] ?? "Cab"} available`;
  return (
    <MapMarker position={pos} title={label} anchor="center">
      <div className="nearby-car" aria-label={label} style={{ ["--c" as string]: color }}>
        <span className="nearby-halo" />
        <svg viewBox="0 0 24 24" width="34" height="34" style={{ color, transform: `rotate(${heading}deg)` }}>
          <circle cx="12" cy="12" r="11" fill={color} />
          <Shape category={driver.category} />
        </svg>
      </div>
    </MapMarker>
  );
}
