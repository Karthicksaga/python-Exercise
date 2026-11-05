import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { api, APIError, setCSRF } from "@hop/shared/api";
import { setMapPrefs } from "@hop/shared/mapPrefs";
import useDarkMode from "@hop/shared/useDarkMode";
import type { User } from "@hop/shared/types";
import { Icon, NotifyContext, Skeleton } from "./ui";
import { initials } from "./lib";
import type { Summary } from "./types";

const Overview = lazy(() => import("./screens/Overview"));
const Dispatch = lazy(() => import("./screens/Dispatch"));
const Rides = lazy(() => import("./screens/Rides"));
const Reviews = lazy(() => import("./screens/Reviews"));
const Scores = lazy(() => import("./screens/Scores"));
const Safety = lazy(() => import("./screens/Safety"));
const LostFound = lazy(() => import("./screens/LostFound"));
const Zones = lazy(() => import("./screens/Zones"));
const Fares = lazy(() => import("./screens/Fares"));
const Surge = lazy(() => import("./screens/Surge"));
const Payouts = lazy(() => import("./screens/Payouts"));
const Promos = lazy(() => import("./screens/Promos"));
const Passes = lazy(() => import("./screens/Passes"));
const Audit = lazy(() => import("./screens/Audit"));

export type View = "overview" | "dispatch" | "rides" | "reviews" | "scores" | "safety" | "lost" | "zones" | "fares" | "surge" | "payouts" | "promos" | "passes" | "audit";
export type ScreenProps = { sub: string; go: (route: string) => void; summary: Summary | null; refreshSummary: () => void };
const SCREENS: Record<View, React.ComponentType<ScreenProps>> = {
  overview: Overview, dispatch: Dispatch, rides: Rides, reviews: Reviews, scores: Scores, safety: Safety, lost: LostFound,
  zones: Zones, fares: Fares, surge: Surge, payouts: Payouts, promos: Promos, passes: Passes, audit: Audit,
};
// Bookmarks from the previous console keep working.
const LEGACY: Record<string, string> = {
  "live-map": "dispatch", analytics: "overview", drivers: "reviews", verification: "reviews", areas: "zones", pricing: "fares",
  sos: "safety", incidents: "safety/incidents", "lost-found": "lost", payments: "payouts",
};
const SUB: Record<View, string> = {
  overview: "Today across all service areas", dispatch: "Captains and active rides, refreshed every 6 seconds", rides: "Search, inspect, cancel and refund rides",
  reviews: "Applications, document expiry and change requests", scores: "Built from cancellations, incidents and ratings", safety: "Emergencies first, then rider and captain reports",
  lost: "Items riders left behind", zones: "Where riders can book and captains can work", fares: "Prices per area and vehicle", surge: "Demand multipliers, overrides and peak hours",
  payouts: "Captain payouts, refunds and balances", promos: "Discount codes for riders", passes: "Captain monthly passes, prices and zones that need one", audit: "Every operator action, written by the server",
};
type NavItem = [View, string, string, (s: Summary) => number, ((s: Summary) => boolean)?];
const NAV: [string | null, NavItem[]][] = [
  [null, [["overview", "Overview", "grid", () => 0]]],
  ["Operations", [["dispatch", "Live dispatch", "map", (s) => s.active_rides], ["rides", "Rides", "route", () => 0]]],
  ["Captains", [["reviews", "Captain reviews", "id", (s) => s.drivers_pending + s.changes_pending], ["scores", "Safety scores", "gauge", () => 0]]],
  ["Safety & care", [["safety", "SOS & incidents", "alert", (s) => s.sos_active + s.incidents_open, (s) => s.sos_active > 0], ["lost", "Lost & found", "box", (s) => s.lost_open]]],
  ["Network", [["zones", "Service areas", "zone", () => 0], ["fares", "Fares", "tag", () => 0], ["surge", "Surge & peak", "bolt", () => 0]]],
  ["Money", [["payouts", "Payouts & refunds", "wallet", (s) => s.payouts_requested], ["promos", "Promo codes", "ticket", () => 0], ["passes", "Captain passes", "id", () => 0]]],
  ["Records", [["audit", "Audit log", "list", () => 0]]],
];
const label = (v: View) => NAV.flatMap(([, items]) => items).find(([id]) => id === v)?.[1] ?? "Overview";

function parseHash(): [View, string] {
  let h = decodeURIComponent(location.hash.slice(1));
  const [head] = h.split("/");
  if (LEGACY[head]) h = LEGACY[head] + h.slice(head.length);
  const [v, ...rest] = h.split("/");
  return [(v in SCREENS ? v : "overview") as View, rest.join("/")];
}

export default function AdminApp() {
  const [dark, toggleDark] = useDarkMode();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState(parseHash);
  const [navOpen, setNavOpen] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const [view, sub] = route;

  const notify = useCallback((msg: string) => {
    if (!msg) return;
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  useEffect(() => setMapPrefs({ dark: dark ? "on" : "off" }), [dark]);
  useEffect(() => {
    let redirecting = false;
    api<{ user: User; csrf: string }>("/api/me")
      .then((me) => { setCSRF(me.csrf); setUser(me.user); })
      .catch((e) => {
        if (e instanceof APIError && e.status === 401) { redirecting = true; location.replace("/auth/login"); return; }
        notify((e as Error).message);
      })
      .finally(() => { if (!redirecting) setLoading(false); });
  }, [notify]);

  const isOperator = user?.role === "operator";
  const refreshSummary = useCallback(() => {
    api<{ summary: Summary }>("/api/operator/summary").then((r) => setSummary(r.summary)).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!isOperator) return;
    refreshSummary();
    const id = setInterval(() => { if (!document.hidden) refreshSummary(); }, 15000);
    return () => clearInterval(id);
  }, [isOperator, refreshSummary]);

  useEffect(() => {
    const onHash = () => { setRoute(parseHash()); setNavOpen(false); };
    addEventListener("hashchange", onHash);
    const onScroll = () => setScrolled(scrollY > 4);
    addEventListener("scroll", onScroll, { passive: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName)) { e.preventDefault(); search.current?.focus(); }
      if (e.key === "Escape") setNavOpen(false);
    };
    addEventListener("keydown", onKey);
    return () => { removeEventListener("hashchange", onHash); removeEventListener("scroll", onScroll); removeEventListener("keydown", onKey); };
  }, []);
  useEffect(() => { scrollTo(0, 0); }, [view]);
  useEffect(() => { document.title = `${label(view)} · Hop operations`; }, [view]);

  const go = useCallback((r: string) => {
    const next = "#" + r;
    if (location.hash === next) setRoute(parseHash()); else location.hash = r;
    setNavOpen(false);
  }, []);

  async function signOut() {
    await api("/auth/logout", {}).catch(() => undefined);
    setCSRF(""); setUser(null);
  }

  if (loading) return <div className="content"><Skeleton rows={6} /></div>;
  if (!isOperator) return <SignIn signedIn={Boolean(user)} onSignOut={() => void signOut()} />;

  const Screen = SCREENS[view];
  const sos = summary?.sos_active ?? 0;
  return (
    <NotifyContext.Provider value={notify}>
      <div className={`shell ${navOpen ? "nav-open" : ""}`}>
        <aside className="side" aria-label="Main navigation">
          <a className="brand" href="#overview">hop<i>.</i><small>Operations</small></a>
          {NAV.map(([group, items]) => (
            <nav className="nav-group" key={group ?? "home"} aria-label={group ?? "Home"}>
              {group && <small>{group}</small>}
              {items.map(([id, text, icon, count, danger]) => {
                const n = summary ? count(summary) : 0;
                return (
                  <a key={id} href={`#${id}`} className="nav-item" aria-current={view === id ? "page" : undefined} onClick={() => setNavOpen(false)}>
                    <Icon name={icon} /><span>{text}</span>
                    {n > 0 && <span className={`count ${summary && danger?.(summary) ? "danger" : ""}`} aria-label={`${n} waiting`}>{n}</span>}
                  </a>
                );
              })}
            </nav>
          ))}
          <div className="side-foot">
            <span className="avatar">{initials(user!.name || "Operator")}</span>
            <span><strong>{user!.name || "Operator"}</strong><small>Operator</small></span>
            <button type="button" className="icon-btn" onClick={() => void signOut()} aria-label="Sign out" style={{ marginLeft: "auto" }}><Icon name="out" /></button>
          </div>
        </aside>
        <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />
        <div className="main">
          <header className={`topbar ${scrolled ? "scrolled" : ""}`}>
            <button type="button" className="icon-btn menu-btn" onClick={() => setNavOpen((o) => !o)} aria-label="Open menu" aria-expanded={navOpen}><Icon name="menu" /></button>
            <div className="title"><h1>{label(view)}</h1><small>{SUB[view]}</small></div>
            <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); const q = search.current?.value.trim() ?? ""; go(`rides/${encodeURIComponent(q)}`); }}>
              <label className="sr" htmlFor="global-q">Search rides</label>
              <Icon name="search" size={16} />
              <input ref={search} id="global-q" type="search" placeholder="Ride ID, rider or captain" autoComplete="off" />
              <kbd>/</kbd>
            </form>
            <div className="row tb-actions" style={{ flexWrap: "nowrap" }}>
              {sos > 0
                ? <a className="sos-pill" href="#safety"><span className="dot" /><Icon name="alert" size={16} /><span className="label">{sos} active SOS</span></a>
                : <span className="live-pill">Network live</span>}
              <button type="button" className="icon-btn" onClick={toggleDark} aria-label={`Switch to ${dark ? "light" : "dark"} theme`}><Icon name={dark ? "sun" : "moon"} /></button>
            </div>
          </header>
          <main className="content">
            <Suspense fallback={<Skeleton rows={6} />}>
              <Screen key={view} sub={sub} go={go} summary={summary} refreshSummary={refreshSummary} />
            </Suspense>
          </main>
        </div>
      </div>
      <div className="toast-host" aria-live="polite">{toasts.map((t) => <div key={t.id} className="toast"><Icon name="info" size={16} /><span>{t.msg}</span></div>)}</div>
    </NotifyContext.Provider>
  );
}

function SignIn({ signedIn, onSignOut }: { signedIn: boolean; onSignOut: () => void }) {
  return (
    <div className="signin">
      <section className="signin-art">
        <span className="glow" style={{ width: 420, height: 420, background: "#4b3fd1", left: -80, top: -60 }} />
        <span className="glow" style={{ width: 360, height: 360, background: "#7a3fd1", right: -100, bottom: -80 }} />
        <a className="brand" href="/">hop<i>.</i><small>Operations</small></a>
        <div><h1>Keep every ride safe, fair and moving.</h1><p>Review captains, watch live trips, respond to SOS alerts and manage zones and fares from one place.</p></div>
        <ul><li>Live dispatch</li><li>Captain reviews</li><li>SOS response</li><li>Every action audited</li></ul>
      </section>
      <section className="signin-form">
        <div className="card">
          <h2>Operator sign in</h2>
          <p className="muted">{signedIn ? "This account doesn't have operator access. Sign out and use your operator account." : "Only for authorised Hop operators."}</p>
          {signedIn ? <button type="button" className="btn secondary block" onClick={onSignOut}>Sign out</button> : <a className="btn primary block" href="/auth/login">Sign in</a>}
        </div>
      </section>
    </div>
  );
}
