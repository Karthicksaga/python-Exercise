import { useCallback, useEffect, useRef, useState } from "react";
import { api, APIError, setCSRF } from "./api";
import type { Area, State, User, VehiclePricing } from "./types";
import { unregisterWebPush, usePush } from "./usePush";
import useDarkMode from "./useDarkMode";
import { useMapPrefs } from "./mapPrefs";

export const emptyState: State = { rides: [], driver: [], offers: [], incidents: [], saved_locations: [] };

// Sign-in, live state polling, push and alert polling shared by the rider and captain apps.
export function useSession() {
  const { lowData } = useMapPrefs();
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [signingOut, setSigningOut] = useState(false),
    [areas, setAreas] = useState<Area[]>([]),
    [vehicles, setVehicles] = useState<VehiclePricing[]>([]),
    [data, setData] = useState<State>(emptyState),
    [notice, setNotice] = useState(""),
    [connection, setConnection] = useState(""),
    [development, setDevelopment] = useState(false),
    [phoneLogin, setPhoneLogin] = useState(false),
    // False until the first /api/state answer, so the wrong screen never flashes on refresh.
    [stateReady, setStateReady] = useState(false),
    [dark, toggleDark] = useDarkMode();
  const notify = useCallback((s: string) => setNotice(s), []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(id);
  }, [notice]);
  const refresh = useCallback(async () => {
    try {
      setData(await api<State>("/api/state"));
      setConnection("");
    } catch (e) {
      if (e instanceof APIError && e.status === 401) {
        setUser(null);
        setData(emptyState);
      }
      setConnection((e as Error).message);
    } finally {
      setStateReady(true);
    }
  }, []);
  useEffect(() => {
    let live = true;
    async function init() {
      try {
        const config = await api<{ areas: Area[]; vehicles: VehiclePricing[]; development: boolean; phone_login?: boolean }>("/api/config");
        if (!live) return;
        setAreas(config.areas);
        setVehicles(config.vehicles);
        setDevelopment(config.development);
        setPhoneLogin(Boolean(config.phone_login));
        try {
          const me = await api<{ user: User; csrf: string }>("/api/me");
          if (live) {
            setCSRF(me.csrf);
            setUser(me.user);
          }
        } catch (e) {
          if (!(e instanceof APIError && e.status === 401)) throw e;
        }
      } catch (e) {
        if (live) setConnection((e as Error).message);
      } finally {
        if (live) setLoading(false);
      }
    }
    void init();
    return () => {
      live = false;
    };
  }, []);
  const { permission, requestPermission, live } = usePush(Boolean(user), (message) => {
    setNotice(`${message.title} — ${message.body}`);
    void refresh();
  });
  useEffect(() => {
    if (!user) return;
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, lowData ? 12000 : 4000);
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [user, refresh, lowData]);
  const lastAlert = useRef(new Date().toISOString());
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await api<{ notifications: { title: string; body: string }[] | null; now: string }>(`/api/notifications/new?after=${encodeURIComponent(lastAlert.current)}`);
        lastAlert.current = r.now;
        const items = r.notifications ?? [];
        if (items.length) {
          const n = items[items.length - 1];
          setNotice(`${n.title} — ${n.body}`);
          void refresh();
        }
      } catch {
        /* next tick retries */
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [user, refresh]);
  async function logout() {
    setSigningOut(true);
    try {
      await unregisterWebPush();
      await api("/auth/logout", {});
      setCSRF("");
      setUser(null);
      setData(emptyState);
      setStateReady(false);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSigningOut(false);
    }
  }
  return { user, setUser, loading, signingOut, areas, vehicles, data, notice, setNotice, notify, connection, development, phoneLogin, stateReady, refresh, logout, dark, toggleDark, permission, requestPermission, live, lowData };
}

// The notification card: icon, title and body split on " — ", auto-dismissing.
export function Toast({ notice, onClose }: { notice: string; onClose: () => void }) {
  if (!notice) return null;
  const [head, ...rest] = notice.split(" — ");
  const title = rest.length ? head : "";
  const body = rest.length ? rest.join(" — ") : notice;
  const bad = /^(add your|could not|failed|error|invalid|not |provide|early finish)|cannot|can't|unable|denied|required/i.test(notice);
  const icon = bad ? "⚠️" : /complet/i.test(notice) ? "✅" : /cancel/i.test(notice) ? "🚫" : /accept|confirm|arriv/i.test(notice) ? "🚖" : /payment|paid|wallet|₹/i.test(notice) ? "💸" : "🔔";
  return (
    <div className={`toast ${bad ? "bad" : ""}`} role="status" aria-live="polite" key={notice}>
      <span className="toast-icon" aria-hidden>{icon}</span>
      <div className="toast-text">
        {title && <strong>{title}</strong>}
        <span>{body}</span>
      </div>
      <button className="toast-x" aria-label="Dismiss message" onClick={onClose}>×</button>
      <i className="toast-bar" />
    </div>
  );
}
