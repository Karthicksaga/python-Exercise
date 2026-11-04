// Formatting helpers and shared labels for the operations console.
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@hop/shared/api";

export const CATS: Record<string, string> = { bike: "Bike", auto: "Auto", mini: "Mini", sedan: "Sedan", suv: "SUV" };
export const CAT_ORDER = ["bike", "auto", "mini", "sedan", "suv"];
export const ACTIVE_RIDE = ["requested", "accepted", "arrived", "in_progress"];
export const RIDE_STATUS: Record<string, [string, Tone]> = {
  requested: ["Finding captain", "info"], accepted: ["Captain on the way", "info"], arrived: ["Captain arrived", "info"],
  in_progress: ["On trip", "info"], completed: ["Completed", "ok"], cancelled: ["Cancelled", "plain"], expired: ["Expired", "plain"],
};
export const DOC_LABEL: Record<string, string> = {
  identity: "ID · front", identity_back: "ID · back", license: "Driving licence · front", license_back: "Driving licence · back",
  rc: "RC · front", rc_back: "RC · back", insurance: "Insurance", police: "Police clearance",
};
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export type Tone = "" | "ok" | "warn" | "bad" | "info" | "plain";

export const rupee = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });
export const rupeeShort = (p: number) => {
  const r = p / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(2)} Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(2)} L`;
  return rupee(p);
};
export const num = (n: number) => Number(n || 0).toLocaleString("en-IN");
export const minutesSince = (iso?: string | null) => (iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)) : 0);
export function ago(iso?: string | null) {
  if (!iso) return "—";
  const m = minutesSince(iso);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""} ago`;
  return `${Math.floor(m / 1440)} d ago`;
}
export function waited(iso?: string | null) {
  const m = minutesSince(iso);
  if (m < 60) return `${m} min`;
  if (m < 2880) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${Math.floor(m / 1440)} d`;
}
export const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
export const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
export const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const daysUntil = (iso?: string | null) => (iso ? Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000) : Infinity);
export const initials = (n: string) => (n || "?").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const toPaise = (rupees: string) => (rupees.trim() === "" ? NaN : Math.round(Number(rupees) * 100));
export const fromPaise = (p: number | null | undefined) => (p == null ? "" : String(p / 100));

// Loads an endpoint, re-polls it on an interval, and exposes reload(). Errors go to notify.
export function useLoad<T>(path: string | null, notify: (m: string) => void, everyMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const tell = useRef(notify);
  tell.current = notify;
  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
    } catch (e) {
      tell.current((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void reload();
    if (!everyMs) return;
    const id = setInterval(() => { if (!document.hidden) void reload(); }, everyMs);
    return () => clearInterval(id);
  }, [reload, everyMs]);
  return { data, loading, reload, setData };
}
