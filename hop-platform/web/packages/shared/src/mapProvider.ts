import { useSyncExternalStore } from "react";

export type MapProvider = "google" | "osm";

// Google when a key is configured and accepted; OpenStreetMap otherwise (no key, billing off, quota hit).
let current: MapProvider = import.meta.env.VITE_GOOGLE_MAPS_API_KEY && import.meta.env.VITE_MAP_PROVIDER === "google" ? "google" : "osm";
const listeners = new Set<() => void>();

let forced = false;
// Low-data mode uses OpenStreetMap so tiles can be cached for offline use.
export function forceOsm(on: boolean) {
  if (forced === on) return;
  forced = on;
  listeners.forEach((l) => l());
}

export function fallBackToOsm() {
  if (current === "osm") return;
  current = "osm";
  listeners.forEach((l) => l());
}

// Google calls this global for invalid keys, disabled billing and exhausted quota.
(window as unknown as { gm_authFailure: () => void }).gm_authFailure = fallBackToOsm;

export function useMapProvider(): MapProvider {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => (forced ? "osm" : current),
  );
}
