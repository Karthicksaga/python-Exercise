import { useEffect, useRef, useState } from "react";
import { api } from "@hop/shared/api";
import { money, type Driver } from "@hop/shared/types";

type LatLng = { lat: number; lng: number };
const BREAK_AFTER_MIN = 240;

export default function DriverTools({ d, sharing, pos, notify, refresh }: { d: Driver; sharing: boolean; pos: LatLng | null; notify: (s: string) => void; refresh: () => Promise<void> }) {
  const [today, setToday] = useState(0),
    [trips, setTrips] = useState(0),
    [goal, setGoal] = useState(""),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now()),
    since = useRef<number | null>(null),
    nagged = useRef(false);

  useEffect(() => {
    let live = true;
    const load = () =>
      api<{ summary: { today_fare_paise: number; today_completed_trips: number } }>("/api/drivers/earnings")
        .then((r) => live && (setToday(r.summary.today_fare_paise), setTrips(r.summary.today_completed_trips)))
        .catch(() => undefined);
    void load();
    const id = setInterval(load, 30000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (sharing) since.current ??= Date.now();
    else {
      since.current = null;
      nagged.current = false;
    }
  }, [sharing]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const online = since.current && sharing ? Math.floor((now - since.current) / 60000) : 0;
  useEffect(() => {
    if (online >= BREAK_AFTER_MIN && !nagged.current) {
      nagged.current = true;
      notify("Time for a break — You have been online for 4 hours. A short rest keeps you and your riders safe.");
    }
  }, [online, notify]);

  const target = d.daily_goal_paise ?? 0,
    pct = target ? Math.min(100, Math.round((today / target) * 100)) : 0,
    homeOn = Boolean(d.home_until && new Date(d.home_until).getTime() > now),
    usedToday = d.home_uses_on === new Date(now + 19800000).toISOString().slice(0, 10) ? (d.home_uses ?? 0) : 0;

  async function saveGoal() {
    setBusy(true);
    try {
      await api("/api/drivers/goal", { daily_goal_paise: Math.round(Number(goal || 0) * 100) });
      setEditing(false);
      await refresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleHome() {
    if (!homeOn && !pos) {
      notify("Turn on location first so hop knows where home is. Go home — Stand at home or tap it while you are heading there.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/drivers/go-home", homeOn ? { off: true } : { lat: pos!.lat, lng: pos!.lng });
      notify(homeOn ? "Go-home mode off — You will get all nearby rides again." : "Go-home mode on — For 90 minutes you only get rides that lead toward home.");
      await refresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel driver-tools">
      <div className="goal">
        <div className="goal-head">
          <strong>Today {money(today)}</strong>
          <small>{trips} trip{trips === 1 ? "" : "s"}{target ? ` · goal ${money(target)}` : ""}</small>
        </div>
        {target > 0 && (
          <div className="goal-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: pct + "%" }} />
          </div>
        )}
        {target > 0 && <small className="muted">{pct >= 100 ? "Goal reached 🎉" : `${money(target - today)} to go`}</small>}
        {editing ? (
          <div className="goal-edit">
            <input type="number" min="0" max="100000" inputMode="numeric" placeholder="Daily goal in ₹" value={goal} onChange={(e) => setGoal(e.target.value)} aria-label="Daily goal in rupees" />
            <button type="button" disabled={busy} onClick={() => void saveGoal()}>Save</button>
          </div>
        ) : (
          <button type="button" className="secondary chip-btn" onClick={() => { setGoal(target ? String(target / 100) : ""); setEditing(true); }}>{target ? "Change goal" : "Set daily goal"}</button>
        )}
      </div>
      <div className={"go-home" + (homeOn ? " on" : "")}>
        <div>
          <strong>🏠 Go home</strong>
          <small>{homeOn ? "On — only rides toward home" : `Only rides toward home for 90 min · ${Math.max(0, 2 - usedToday)} left today`}</small>
        </div>
        <button type="button" className="secondary" disabled={busy || (!homeOn && usedToday >= 2)} onClick={() => void toggleHome()}>{homeOn ? "Turn off" : "Start"}</button>
      </div>
      {sharing && online >= 60 && <small className="muted online-for">Online for {Math.floor(online / 60)}h {online % 60}m{online >= BREAK_AFTER_MIN ? " — consider a break" : ""}</small>}
    </section>
  );
}
