import { useEffect, useState } from "react";
import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { t, useLang } from "@hop/shared/i18n";
import Icon from "@hop/shared/Icons";
import PageLoader from "@hop/shared/PageLoader";
import RideCard from "@hop/shared/RideCard";
import RideMoment from "@hop/shared/RideMoment";
import ProfilePanel, { avatarColors } from "@hop/shared/ProfilePanel";
import CaptainLanding from "./CaptainLanding";
import { lazyPanel } from "@hop/shared/lazy";
import { Toast, useSession } from "@hop/shared/session";

const DriverPanel = lazyPanel(() => import("./DriverPanel"), "Loading driver tools…");
const TABS = ["driver", "history", "support", "profile"];

// The captain (driver) app: duty, ride offers, trips, support and profile. No rider booking screens.
export default function CaptainApp() {
  useLang();
  const s = useSession();
  const { user, data } = s;
  const [tab, setTab] = useState("driver"),
    [logoutAsk, setLogoutAsk] = useState(false),
    [avatarColor, setAvatarColor] = useState("indigo");
  const dutyDriver = data.driver.find((d) => d.status === "approved");
  const dutyOn = dutyDriver ? dutyDriver.online : null;
  const isOperator = user?.role === "operator";
  useEffect(() => {
    if (isOperator) location.replace(import.meta.env.VITE_ADMIN_URL || "/admin");
  }, [isOperator]);
  if (isOperator) return <PageLoader label="Opening admin…" />;
  const navItems: [string, string][] = [["driver", "Drive"], ["history", "My trips"], ["support", t("nav.support")], ["profile", t("nav.profile")]];
  const heads: Record<string, [string, string]> = {
    driver: ["Captain mode", "Ready to earn?"],
    history: ["Captain mode", "Your trips"],
    support: ["Captain mode", "Help & support"],
    profile: ["Captain mode", "Your profile"],
  };
  const [eyebrow, title] = heads[tab] ?? heads.driver;
  const done = data.rides.filter((r) => r.status === "completed");

  return (
    <div className={`${user ? "shell has-nav" : "shell"} driver-mode captain`}>
      <header className={"topbar" + (dutyOn === null ? "" : dutyOn ? " duty-on" : " duty-off")}>
        <a href="/captain" className="logo">
          <span className="logo-mark" aria-hidden="true">h</span>
          hop <small className="logo-sub">captain</small>
        </a>
        <div className="header-right">
          <button type="button" className="theme-toggle" onClick={s.toggleDark} aria-label={s.dark ? "Switch to light mode" : "Switch to dark mode"}>
            <span className="emoji-keep">{s.dark ? "☀️" : "🌙"}</span>
          </button>
          <span className="commission">Keep 100% of fares</span>
          {user && dutyOn !== null && (
            <span className={"duty-pill" + (dutyOn ? " on" : "")} role="status" title={dutyOn ? "You are online and visible to riders" : "You are offline. Go online to get requests"}>
              <i /> {dutyOn ? "Online" : "Offline"}
            </span>
          )}
          {user && dutyOn === null && (
            <span className={"live-pill" + (s.live ? " on" : "")}><i /> {s.live ? "Live" : "Connecting"}</span>
          )}
          {user && s.permission === "default" && (
            <button type="button" className="alerts-btn" onClick={() => void s.requestPermission()}>Enable alerts</button>
          )}
          {user && <span className="avatar" title={user.name} style={{ background: avatarColors[avatarColor] }}>{(user.name[0] || "?").toUpperCase()}</span>}
        </div>
      </header>
      <main>
        {s.development && user && <div className="dev-banner">Development environment — no real rides or payments.</div>}
        {s.connection && (
          <div className="alert" role="alert">
            {s.connection} <button className="text-button" onClick={() => location.reload()}>Reconnect</button>
          </div>
        )}
        <Toast notice={s.notice} onClose={() => s.setNotice("")} />
        {s.loading || (user && !s.stateReady) ? (
          <PageLoader label="Connecting to hop captain…" />
        ) : !user ? (
          <CaptainLanding phoneLogin={s.phoneLogin} />
        ) : (
          <>
            <nav className="nav" aria-label="Main navigation">
              {navItems.map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined} className={tab === id ? "selected" : ""}>
                  <Icon name={id} />
                  <span>{label}</span>
                  {id === "driver" && data.offers.length > 0 && <em className="badge">{data.offers.length}</em>}
                </button>
              ))}
              <button className="nav-out" onClick={() => setLogoutAsk(true)}>
                <Icon name="logout" />
                <span>Sign out</span>
              </button>
            </nav>
            <div className="page-title">
              <div>
                <p className="eyebrow">{eyebrow}</p>
                <h1>{title}</h1>
              </div>
              <span className="verified">Verified</span>
            </div>
            <div hidden={tab !== "driver"}>
              {!data.driver.length && (
                <div className="notice">
                  New to hop? Fill in the form below to apply. You can add your licence, RC and insurance details.
                </div>
              )}
              <DriverPanel data={data} areas={s.areas} refresh={s.refresh} notify={s.notify} development={s.development} />
            </div>
            {tab === "history" && (
              <section>
                <div className="stat-strip">
                  <div><strong>{data.rides.length}</strong><span>Total trips</span></div>
                  <div><strong>{done.length}</strong><span>Completed</span></div>
                  <div><strong>₹{(done.reduce((a, r) => a + r.fare_paise, 0) / 100).toFixed(0)}</strong><span>Total fares</span></div>
                </div>
                {!data.rides.length ? (
                  <div className="empty">Your driven trips will appear here.</div>
                ) : (
                  <div className="ride-grid">
                    {data.rides.map((r) => <RideCard key={r.id} ride={r} refresh={s.refresh} notify={s.notify} />)}
                  </div>
                )}
              </section>
            )}
            {tab === "support" && (
              <section className="support-page">
                <div className="support-actions">
                  <a className="support-card danger" href="tel:112"><span>📞</span><strong>Call 112</strong><small>Immediate danger</small></a>
                  <button className="support-card" onClick={() => setTab("history")}><span>🧾</span><strong>Report a trip issue</strong><small>Open a trip in My trips</small></button>
                </div>
                <div className="panel">
                  <h2>Captain support</h2>
                  <p>Use “Report a ride issue” on a trip to send a message to the operator team.</p>
                  <div className="safety-note">
                    <strong>Immediate danger? Call 112.</strong>
                    <p>Reports are reviewed by operators; they do not dispatch emergency services.</p>
                    <a href="tel:112">Call 112</a>
                  </div>
                  <h3>Your reports</h3>
                  {data.incidents.length ? (
                    data.incidents.map((i) => (
                      <article key={i.id} className="inset">
                        <span className="pill">{i.status}</span>
                        <p>{i.message}</p>
                        {i.resolution && <p><strong>Operator response:</strong> {i.resolution}</p>}
                      </article>
                    ))
                  ) : (
                    <p className="muted">No reports yet.</p>
                  )}
                </div>
              </section>
            )}
            {tab === "profile" && (
              <ProfilePanel
                name={user.name}
                driving
                saved={[]}
                busy={false}
                notify={s.notify}
                onName={(name) => s.setUser((c) => (c ? { ...c, name } : c))}
                onDetails={(d) => setAvatarColor(d.avatar_color)}
                onDeleteSaved={() => undefined}
                goTo={(id) => setTab(TABS.includes(id) ? id : "profile")}
                becomeDriver={() => setTab("driver")}
                logout={() => setLogoutAsk(true)}
              />
            )}
          </>
        )}
        {s.signingOut && <PageLoader overlay label="Signing you out…" />}
        <RideMoment />
        <Modal opened={logoutAsk} onClose={() => setLogoutAsk(false)} title="Sign out of hop captain?" centered radius="lg">
          <Stack gap="sm">
            <Alert color="orange" icon={<IconAlertTriangle size={16} />}>Signing out stops new ride requests. Make sure you've finished any active trip.</Alert>
            <Text size="sm" c="dimmed">You'll need to sign in again.</Text>
            <Group grow>
              <Button variant="default" onClick={() => setLogoutAsk(false)}>Stay signed in</Button>
              <Button color="red" onClick={() => { setLogoutAsk(false); void s.logout(); }}>Sign out</Button>
            </Group>
          </Stack>
        </Modal>
        <footer>
          <strong>hop captain</strong>
          <span>India · Cash, UPI & online · Zero platform commission</span>
        </footer>
      </main>
    </div>
  );
}
