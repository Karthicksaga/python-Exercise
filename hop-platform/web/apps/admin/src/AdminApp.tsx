import { useEffect, useState } from "react";
import { Button, Text } from "@mantine/core";
import { api, APIError, setCSRF } from "@hop/shared/api";
import OperatorPanel, { type OpsSection } from "./OperatorPanel";
import AdminConsole from "./AdminConsole";
import OperatorLiveMap from "./OperatorLiveMap";
import OperatorRides from "./OperatorRides";
import OperatorAnalytics from "./OperatorAnalytics";
import OperatorSafety from "./OperatorSafety";
import OperatorLostFound from "./OperatorLostFound";
import PageLoader from "@hop/shared/PageLoader";
import type { User } from "@hop/shared/types";

export type AdminView =
  | OpsSection
  | "verification"
  | "live-map"
  | "rides"
  | "analytics"
  | "sos"
  | "lost-found";

export default function AdminApp() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<AdminView>(
    () => (location.hash.slice(1) as AdminView) || "live-map"
  );
  const [msg, setMsg] = useState("");
  const [activeSOSCount, setActiveSOSCount] = useState(0);

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

  // Poll for active SOS emergencies
  useEffect(() => {
    if (!user || user.role !== "operator") return;
    const checkSOS = async () => {
      try {
        const res = await api<{ sos_events: { incident_status: string }[] }>("/api/operator/sos");
        const active = (res.sos_events || []).filter((s) => s.incident_status !== "closed").length;
        setActiveSOSCount(active);
      } catch {
        // silent catch
      }
    };
    void checkSOS();
    const interval = setInterval(checkSOS, 15000);
    return () => clearInterval(interval);
  }, [user]);

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
          <h1>
            Run the network.<br />
            <em>See everything live.</em>
          </h1>
          <p>
            Verify drivers and vehicles, watch active rides, handle disputes and tune fares and zones from one console.
          </p>
          <svg className="ad-spark" viewBox="0 0 240 64" aria-hidden="true">
            <polyline
              fill="none"
              stroke="var(--brand)"
              strokeWidth="2.5"
              points="0,52 20,46 40,50 60,34 80,38 100,22 120,30 140,16 160,24 180,10 200,18 240,6"
            />
            <polyline
              fill="none"
              stroke="#334155"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              points="0,58 40,56 80,50 120,48 160,40 200,36 240,30"
            />
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
              {user
                ? "This account does not have operator access."
                : "Restricted to authorised operators. Sign in with your operator account."}
            </Text>
            {msg && <Text c="red" size="sm">{msg}</Text>}
            {user ? (
              <Button variant="default" onClick={() => void signOut()}>
                Sign out
              </Button>
            ) : (
              <Button component="a" href="/auth/login">
                Sign in
              </Button>
            )}
          </div>
        </section>
      </div>
    );

  const groups: [string, [AdminView, string][]][] = [
    [
      "Operations",
      [
        ["live-map", "Live Dispatch Map"],
        ["rides", "Rides Management"],
        ["analytics", "Executive Analytics"],
      ],
    ],
    [
      "Fleet",
      [
        ["drivers", "Driver reviews"],
        ["verification", "KYC & documents"],
        ["areas", "Service areas"],
      ],
    ],
    [
      "Safety & Care",
      [
        ["sos", activeSOSCount > 0 ? `Emergency SOS (${activeSOSCount})` : "Emergency SOS"],
        ["lost-found", "Lost & Found"],
        ["incidents", "Incidents"],
        ["safety", "Driver scores"],
        ["audit", "Audit log"],
      ],
    ],
    [
      "Pricing & Money",
      [
        ["pricing", "Fares & categories"],
        ["surge", "Surge & peak"],
        ["promos", "Promo codes"],
        ["payments", "Payouts & refunds"],
      ],
    ],
  ];

  const title = groups.flatMap(([, items]) => items).find(([id]) => id === view)?.[1] ?? "";

  return (
    <div className="ad-shell">
      <aside className="ad-side">
        <div className="ad-brand">
          <span className="ad-dot" />hop admin
        </div>
        {groups.map(([g, items]) => (
          <nav key={g} aria-label={g}>
            <small>{g}</small>
            {items.map(([id, label]) => (
              <button
                key={id}
                className={view === id ? "on" : ""}
                onClick={() => setView(id)}
                style={id === "sos" && activeSOSCount > 0 ? { color: "#f87171", fontWeight: 700 } : undefined}
              >
                {label}
              </button>
            ))}
          </nav>
        ))}
        <button className="ad-out" onClick={() => void signOut()}>
          Sign out
        </button>
      </aside>
      <main className="ad-content">
        {/* Global Emergency Alert Banner */}
        {activeSOSCount > 0 && view !== "sos" && (
          <div
            onClick={() => setView("sos")}
            style={{
              background: "#ef4444",
              color: "#fff",
              padding: "10px 16px",
              borderRadius: 6,
              margin: "12px 0 6px",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              boxShadow: "0 2px 10px rgba(239, 68, 68, 0.4)",
              fontWeight: 600,
            }}
          >
            <span>🚨 {activeSOSCount} Active SOS Emergency Signal(s) Received!</span>
            <span style={{ textDecoration: "underline", fontSize: 13 }}>Click to Inspect & Dispatch →</span>
          </div>
        )}

        <header className="ad-head">
          <h1>{title}</h1>
        </header>

        {msg && <Text c="red" mb="sm" role="alert">{msg}</Text>}

        {view === "live-map" && <OperatorLiveMap notify={setMsg} />}
        {view === "rides" && <OperatorRides notify={setMsg} />}
        {view === "analytics" && <OperatorAnalytics notify={setMsg} />}
        {view === "sos" && <OperatorSafety notify={setMsg} />}
        {view === "lost-found" && <OperatorLostFound notify={setMsg} />}
        {view === "verification" && <AdminConsole notify={setMsg} onExit={() => setView("drivers")} />}
        {["pricing", "areas", "drivers", "incidents", "audit", "surge", "promos", "payments", "safety"].includes(view) && (
          <OperatorPanel notify={setMsg} section={view as OpsSection} />
        )}
      </main>
    </div>
  );
}
