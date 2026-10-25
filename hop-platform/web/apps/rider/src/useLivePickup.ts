import { useEffect, useRef, useState } from "react";
import { useReverseGeocode } from "./MapPicker";
import type { Area, Point } from "@hop/shared/types";

export type GpsState = "idle" | "locating" | "live" | "denied" | "outside" | "weak";

function metres(a: Point, b: Point) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, h)));
}

// Keeps the pickup on the rider's real position until they choose another place.
export function useLivePickup(enabled: boolean, area: Area | undefined, onFix: (p: Point) => void) {
  const [state, setState] = useState<GpsState>("idle");
  const reverse = useReverseGeocode();
  const last = useRef<Point | null>(null);
  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;
  useEffect(() => {
    if (!enabled || !area || !navigator.geolocation) {
      setState("idle");
      return;
    }
    let cancelled = false;
    last.current = null;
    setState("locating");
    const id = navigator.geolocation.watchPosition(
      async (p) => {
        const { latitude: lat, longitude: lng, accuracy } = p.coords;
        if (cancelled) return;
        if (accuracy > 150) return setState("weak");
        if (lat < area.min_lat || lat > area.max_lat || lng < area.min_lng || lng > area.max_lng) return setState("outside");
        const here = { lat, lng, label: "" };
        if (last.current && metres(last.current, here) < 25) return setState("live");
        last.current = here;
        const label = await reverse(lat, lng);
        if (cancelled) return;
        onFixRef.current({ lat, lng, label });
        setState("live");
      },
      (e) => !cancelled && setState(e.code === e.PERMISSION_DENIED ? "denied" : "weak"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(id);
    };
  }, [enabled, area?.id, reverse]);
  return state;
}
