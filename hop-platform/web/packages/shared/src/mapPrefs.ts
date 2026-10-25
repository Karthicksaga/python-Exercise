import { useSyncExternalStore } from "react";
import { forceOsm } from "./mapProvider";

export type MapPrefs = { traffic: boolean; dark: "auto" | "on" | "off"; tilt: boolean; lowData: boolean };

const KEY = "hop.mapPrefs";
const saveData = Boolean((navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData);
let prefs: MapPrefs = { traffic: false, dark: "auto", tilt: false, lowData: saveData };
try {
  prefs = { ...prefs, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
} catch {
  /* keep defaults */
}
const listeners = new Set<() => void>();

function apply() {
  document.body.classList.toggle("low-data", prefs.lowData);
  forceOsm(prefs.lowData);
}
apply();

export function setMapPrefs(patch: Partial<MapPrefs>) {
  prefs = { ...prefs, ...patch };
  if (prefs.lowData) prefs = { ...prefs, traffic: false, tilt: false };
  localStorage.setItem(KEY, JSON.stringify(prefs));
  apply();
  listeners.forEach((l) => l());
}

export function useMapPrefs(): MapPrefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => prefs,
  );
}

// Night map between 7pm and 6am when set to auto; never in low-data mode.
export function isDark(p: MapPrefs, now = new Date()) {
  if (p.lowData) return false;
  const h = now.getHours();
  return p.dark === "on" || (p.dark === "auto" && (h >= 19 || h < 6));
}

export function lowDataEnabled() {
  return prefs.lowData;
}
