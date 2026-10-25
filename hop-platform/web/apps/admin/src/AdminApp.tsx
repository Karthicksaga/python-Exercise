import { useEffect, useState } from "react";
import { Button, Text } from "@mantine/core";
import { api, APIError, setCSRF } from "@hop/shared/api";
import OperatorPanel, { type OpsSection } from "./OperatorPanel";
import AdminConsole from "./AdminConsole";
import PageLoader from "@hop/shared/PageLoader";
import type { User } from "@hop/shared/types";

// Standalone operator/admin application: no rider or driver screens are loaded here.
export default function AdminApp() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [view, setView] = useState<OpsSection | "verification">(() => (location.hash.slice(1) as OpsSection) || "pricing"),
    [msg, setMsg] = useState("");
  useEffect(() => {
    let redirecting = false;
    api<{ user: User; csrf: string }>("/api/me")
      .then((me) => {
        setCSRF(me.csrf);
        setUser(me.user);
      })
      .catch((e) => {
        if (e instanceof APIError && e.status === 401) {
          redirecting = true;
          location.replace("/auth/login");
          return;
        }
        setMsg((e as Error).message);
      })
      .finally(() => {
        if (!redirecting) setLoading(false);
      });
  }, []);
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(""), 6000);
    return () => clearTimeout(id);
  }, [msg]);
  useEffect(() => {
    location.hash = view;
  }, [view]);
  async function signOut() {
    await api("/auth/logout", {}).catch(() => undefined);
    setCSRF("");
    setUser(null);
  }
  if (loading) return <PageLoader label="Loading admin…" />;
  if (!user || user.role !== "operator")
    return (
      <div className="ad-land">
        <section className="ad-hero">
          <span className="ad-tag">hop · operations</span>
          <h1>Run the network.<br /><em>See everything live.</em></h1>
          <p>Verify drivers and vehicles, watch active rides, handle disputes and tune fares and zones from one console.</p>
          <svg className="ad-spark" viewBox="0 0 240 64" aria-hidden="true">
            <polyline fill="none" stroke="var(--brand)" strokeWidth="2.5" points="0,52 20,46 40,50 60,34 80,38 100,22 120,30 140,16 160,24 180,10 200,18 240,6" />
            <polyline fill="none" stroke="#334155" strokeWidth="1.5" strokeDasharray="4 4" points="0,58 40,56 80,50 120,48 160,40 200,36 240,30" />
          </svg>
          <div className="ad-stats">
            <div><b>Live</b><small>Active rides</small></div>
            <div><b>KYC</b><small>Verification queue</small></div>
            <div><b>Audit</b><small>Every action logged</small></div>
          </div>
        </section>
        <section className="ad-panel">
          <div className="ad-card">
            <h2>Operator sign in</h2>
            <Text c="dimmed" size="sm">
              {user ? "This account does not have operator access." : "Restricted to authorised operators. Sign in with your operator account."}
            </Text>
            {msg && <Text c="red" size="sm">{msg}</Text>}
            {user ? <Button variant="default" onClick={() => void signOut()}>Sign out</Button> : <Button component="a" href="/auth/login">Sign in</Button>}
          </div>
        </section>
      </div>
    );
  const groups: [string, [OpsSection | "verification", string][]][] = [
    ["Fleet", [["drivers", "Driver reviews"], ["verification", "KYC & documents"], ["areas", "Service areas"]]],
    ["Pricing", [["pricing", "Fares & categories"], ["surge", "Surge & peak"], ["promos", "Promo codes"]]],
    ["Money", [["payments", "Payouts & refunds"]]],
    ["Safety", [["incidents", "Incidents"], ["safety", "Driver scores"], ["audit", "Audit log"]]],
  ];
  const title = groups.flatMap(([, items]) => items).find(([id]) => id === view)?.[1] ?? "";
  return (
    <div className="ad-shell">
      <aside className="ad-side">
        <div className="ad-brand"><span className="ad-dot" />hop admin</div>
        {groups.map(([g, items]) => (
          <nav key={g} aria-label={g}>
            <small>{g}</small>
            {items.map(([id, label]) => (
              <button key={id} className={view === id ? "on" : ""} onClick={() => setView(id)}>{label}</button>
            ))}
          </nav>
        ))}
        <button className="ad-out" onClick={() => void signOut()}>Sign out</button>
      </aside>
      <main className="ad-content">
        <header className="ad-head"><h1>{title}</h1></header>
        {msg && <Text c="red" mb="sm" role="alert">{msg}</Text>}
        {view === "verification" ? <AdminConsole notify={setMsg} onExit={() => setView("drivers")} /> : <OperatorPanel notify={setMsg} section={view} />}
      </main>
    </div>
  );
}
