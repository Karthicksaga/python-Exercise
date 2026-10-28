import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import type { Coordinate } from "./types";
export async function watchLocation(
  onPoint: (point: Coordinate) => void,
  onError: () => void,
): Promise<() => void> {
  if (Capacitor.isNativePlatform()) {
    const permission = await Geolocation.requestPermissions();
    if (permission.location === "denied")
      throw new Error("Allow location access to follow your position.");
    const id = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
      (p, error) => {
        if (error) onError();
        else if (p)
          onPoint({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
    );
    return () => {
      void Geolocation.clearWatch({ id });
    };
  }
  const id = navigator.geolocation.watchPosition(
    (p) => onPoint({ lat: p.coords.latitude, lng: p.coords.longitude }),
    onError,
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
