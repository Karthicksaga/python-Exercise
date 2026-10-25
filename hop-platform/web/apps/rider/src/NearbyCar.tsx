import { useEffect, useRef, useState } from "react";
import { MapMarker } from "@hop/shared/mapkit";
import type { NearbyDriver } from "@hop/shared/types";
import RealisticVehicleMarker from "@hop/shared/RealisticVehicleMarker";

const names: Record<string, string> = { bike: "Bike", auto: "Auto", mini: "Mini", sedan: "Sedan", suv: "SUV" };

function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

// Glides between polls and turns to face the direction of travel with realistic vehicle art.
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

  const label = `${names[driver.category] ?? "Cab"} available`;
  return (
    <MapMarker position={pos} title={label} anchor="center">
      <div className="nearby-car-realistic" aria-label={label} style={{ cursor: "pointer" }}>
        <RealisticVehicleMarker
          category={driver.category}
          heading={heading}
          size={38}
          showShadow
        />
      </div>
    </MapMarker>
  );
}
