import { useEffect, useState } from "react";
import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import {
  IconAlertTriangle,
  IconCalendar,
  IconCar,
  IconCheck,
  IconClock,
  IconCurrencyRupee,
  IconFilter,
  IconHeadset,
  IconHome,
  IconPhone,
  IconReceipt,
  IconUser,
  IconWallet,
  IconChevronDown,
} from "@tabler/icons-react";
import { useLang } from "@hop/shared/i18n";
import PageLoader from "@hop/shared/PageLoader";
import RideCard from "@hop/shared/RideCard";
import RideMoment from "@hop/shared/RideMoment";
import ProfilePanel, { avatarColors } from "@hop/shared/ProfilePanel";
import CaptainLanding from "./CaptainLanding";
import { lazyPanel } from "@hop/shared/lazy";
import { Toast, useSession } from "@hop/shared/session";
import MetricCard from "@hop/shared/MetricCard";
import EmptyState from "@hop/shared/EmptyState";
import { NavigationItem } from "@hop/shared/ResponsiveNav";
import AppHeader from "@hop/shared/AppHeader";
import AppSidebar from "@hop/shared/AppSidebar";
import MobileNavigation from "@hop/shared/MobileNavigation";

const DriverPanel = lazyPanel(() => import("./DriverPanel"), "Loading driver tools…");
const TABS = ["driver", "earnings", "vehicle", "history", "support", "profile"];

const navConfig: { id: string; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "driver", label: "Drive", icon: IconHome },
  { id: "earnings", label: "Earnings", icon: IconWallet },
  { id: "vehicle", label: "Vehicle", icon: IconCar },
  { id: "history", label: "My trips", icon: IconClock },
  { id: "support", label: "Support", icon: IconHeadset },
  { id: "profile", label: "Profile", icon: IconUser },
];

export default function CaptainApp() {
  useLang();
  const s = useSession();
  const { user, data } = s;
  const [tab, setTab] = useState("driver");
  const [logoutAsk, setLogoutAsk] = useState(false);
  const [avatarColor, setAvatarColor] = useState("indigo");

  const navigateTab = (nextTab: string, push = true) => {
    if (push && nextTab !== tab) {
      window.history.pushState({ tab: nextTab }, "", `#${nextTab}`);
    }
    setTab(nextTab);
  };

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (e.state?.tab && TABS.includes(e.state.tab)) {
        setTab(e.state.tab);
      } else {
        setTab("driver");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const dutyDriver = data.driver.find((d) => d.status === "approved");
  const dutyOn = dutyDriver ? dutyDriver.online : null;
  const isOperator = user?.role === "operator";

  useEffect(() => {
    if (isOperator) location.replace(import.meta.env.VITE_ADMIN_URL || "/admin");
  }, [isOperator]);

  if (isOperator) return <PageLoader label="Opening admin…" />;

  const navItems: NavigationItem[] = navConfig.map((n) => ({
    id: n.id,
    label: n.label,
    shortLabel: n.id === "history" ? "Trips" : n.label,
    badge: n.id === "driver" ? data.offers.length : undefined,
  }));

  const heads: Record<string, [string, string, string]> = {
    driver: ["Captain cockpit", "Ready to earn?", "Manage duty status and view incoming ride offers."],
    earnings: ["Captain finance", "Earnings & payouts", "Track daily fares, payment methods, and cash receipts."],
    vehicle: ["Fleet & settings", "Your vehicle & preferences", "Configure vehicle details and manage captain credentials."],
    history: ["Trip ledger", "Your trips", "View your trip history, earnings, and trip details in one place."],
    support: ["Captain mode", "Help & support", "Emergency response, trip complaints, and driver assistance."],
    profile: ["Captain mode", "Your profile", "Manage your personal details, app preferences, and account settings."],
  };

  const [eyebrow, title, subtitle] = heads[tab] ?? heads.driver;
  const driverRides = data.rides.filter((r) => r.driving);
  const done = driverRides.filter((r) => r.status === "completed");
  const totalFaresFormatted = `₹${(done.reduce((a, r) => a + r.fare_paise, 0) / 100).toFixed(0)}`;

  return (
    <div className={`captain-shell shell ${user ? "has-nav" : ""} driver-mode captain`}>
      {/* 1. Desktop Left Sidebar */}
      {user && (
        <AppSidebar
          mode="captain"
          items={navItems}
          activeId={tab}
          onSelect={navigateTab}
          onSignOut={() => setLogoutAsk(true)}
        />
      )}

      {/* 2. Unified AppHeader */}
      <AppHeader
        mode="captain"
        user={user}
        statusState={dutyOn ? "online" : s.live ? "live" : "offline"}
        statusLabel={dutyOn ? "Online" : s.live ? "Live" : "Offline"}
        statusTitle={dutyOn ? "You are online and visible to riders" : "Live connection"}
        showStatusChevron={true}
        statusPosition="right"
        dark={s.dark}
        onToggleDark={s.toggleDark}
        avatarColor={avatarColors[avatarColor] || avatarColors.indigo}
        onAvatarClick={() => navigateTab("profile")}
      />

      {/* 3. Mobile Dock Navigation */}
      {user && (
        <MobileNavigation
          items={navItems}
          primary={["driver", "earnings", "vehicle", "history"]}
          value={tab}
          onChange={navigateTab}
          onSignOut={() => setLogoutAsk(true)}
        />
      )}

      {/* 4. Main Viewport */}
      <main className="captain-main-viewport">
        {s.development && user && (
          <div className="onboarding-info-banner dev-environment-banner mb-4">
            <span className="info-banner-icon" aria-hidden="true">ⓘ</span>
            <div className="info-banner-content">
              <span className="info-banner-text">
                Development environment — no real rides or payments.
              </span>
            </div>
          </div>
        )}

        {s.connection && (
          <div className="alert alert-connection mb-4" role="alert">
            <span>{s.connection}</span>
            <button type="button" className="text-button" onClick={() => location.reload()}>
              Reconnect
            </button>
          </div>
        )}

        <Toast notice={s.notice} onClose={() => s.setNotice("")} />

        {s.loading || (user && !s.stateReady) ? (
          <PageLoader label="Connecting to hop captain…" />
        ) : !user ? (
          <CaptainLanding phoneLogin={s.phoneLogin} />
        ) : (
          <div className="captain-content-container">
            {/* Standard Dashboard Page Title Header */}
            <div className="dashboard-page-header page-title">
              <div className="header-titles">
                <p className="eyebrow">{eyebrow}</p>
                <h1 className="header-main-title">{title}</h1>
                <p className="header-subtitle">{subtitle}</p>
              </div>
              <div className="header-badge-wrap">
                <span className="captain-account-badge">
                  <IconUser size={14} />
                  <span>Captain account</span>
                </span>
              </div>
            </div>

            {/* TAB 1: Driver / Duty Cockpit */}
            <div hidden={tab !== "driver"}>
              <DriverPanel
                data={data}
                areas={s.areas}
                refresh={s.refresh}
                notify={s.notify}
                development={s.development}
                activeTab="driver"
                onNavigateTab={navigateTab}
              />
            </div>

            {/* TAB 2: Earnings */}
            <div hidden={tab !== "earnings"}>
              <DriverPanel
                data={data}
                areas={s.areas}
                refresh={s.refresh}
                notify={s.notify}
                development={s.development}
                activeTab="earnings"
                onNavigateTab={navigateTab}
              />
            </div>

            {/* TAB 3: Vehicle & preferences */}
            <div hidden={tab !== "vehicle"}>
              <DriverPanel
                data={data}
                areas={s.areas}
                refresh={s.refresh}
                notify={s.notify}
                development={s.development}
                activeTab="vehicle"
                onNavigateTab={navigateTab}
              />
            </div>

            {/* TAB 4: My trips (Matching Desktop Reference 2) */}
            {tab === "history" && (
              <section className="trips-ledger-section">
                {/* 3 Metric Cards Grid */}
                <div className="trips-metrics-grid">
                  <MetricCard
                    title="Total trips"
                    value={driverRides.length}
                    icon={<IconCar size={24} />}
                    iconBg="#e6f7f0"
                    iconColor="#059669"
                  />
                  <MetricCard
                    title="Completed"
                    value={done.length}
                    icon={<IconCheck size={24} stroke={3} />}
                    iconBg="#eff6ff"
                    iconColor="#2563eb"
                  />
                  <MetricCard
                    title="Total fares"
                    value={totalFaresFormatted}
                    icon={<IconCurrencyRupee size={24} />}
                    iconBg="#fffbeb"
                    iconColor="#d97706"
                  />
                </div>

                {/* Trip History Card */}
                <div className="panel trip-history-main-card">
                  <div className="trip-history-header">
                    <div className="history-header-left">
                      <div className="history-header-icon">
                        <IconCalendar size={20} />
                      </div>
                      <div>
                        <h3 className="history-card-title">Trip history</h3>
                        <p className="history-card-subtitle">
                          Your completed and ongoing trips will appear here.
                        </p>
                      </div>
                    </div>

                    <div className="history-header-actions">
                      <div className="history-filter-pill">
                        <IconCalendar size={14} />
                        <span>All time</span>
                        <IconChevronDown size={14} />
                      </div>
                      <button type="button" className="button secondary filter-btn">
                        <IconFilter size={14} />
                        <span>Filters</span>
                      </button>
                    </div>
                  </div>

                  {/* Empty state or Ride cards list */}
                  {!driverRides.length ? (
                    <EmptyState
                      title="No trips yet"
                      description="Your driven trips will appear here. Start driving to see your trip history, earnings, and more."
                      actionLabel="Go online and start driving"
                      onAction={() => navigateTab("driver")}
                    />
                  ) : (
                    <div className="ride-grid trip-cards-grid mt-4">
                      {driverRides.map((r) => (
                        <RideCard
                          key={r.id}
                          ride={r}
                          refresh={s.refresh}
                          notify={s.notify}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* TAB 5: Support */}
            {tab === "support" && (
              <section className="support-page-redesign">
                <div className="support-quick-actions">
                  <a className="support-action-card danger" href="tel:112">
                    <div className="support-card-icon danger">
                      <IconPhone size={22} />
                    </div>
                    <div className="support-card-info">
                      <strong>Call 112</strong>
                      <small>Immediate danger or emergency</small>
                    </div>
                  </a>

                  <button
                    type="button"
                    className="support-action-card"
                    onClick={() => navigateTab("history")}
                  >
                    <div className="support-card-icon">
                      <IconReceipt size={22} />
                    </div>
                    <div className="support-card-info">
                      <strong>Report a trip issue</strong>
                      <small>Open a trip from your trip ledger</small>
                    </div>
                  </button>
                </div>

                <div className="panel support-overview-card">
                  <h2 className="support-title">Captain support</h2>
                  <p className="support-desc">
                    Use “Report a ride issue” on a specific trip to send an audited message to the operator team.
                  </p>

                  <div className="safety-note-box">
                    <strong>Immediate danger? Call 112.</strong>
                    <p>Reports submitted here are reviewed by local operators; they do not dispatch emergency services.</p>
                    <a href="tel:112" className="emergency-call-link">
                      Emergency Call 112
                    </a>
                  </div>

                  <h3 className="incident-reports-title mt-4">Your incident reports</h3>
                  {data.incidents.length ? (
                    <div className="incident-reports-list mt-3">
                      {data.incidents.map((i) => (
                        <article key={i.id} className="inset incident-card">
                          <div className="incident-card-top">
                            <span className="pill incident-status-pill">{i.status}</span>
                            <small className="muted">ID: {i.id.slice(0, 8)}</small>
                          </div>
                          <p className="incident-msg">{i.message}</p>
                          {i.resolution && (
                            <div className="incident-resolution">
                              <strong>Operator response:</strong>
                              <p>{i.resolution}</p>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="muted text-sm mt-2">No safety incidents or support reports filed.</p>
                  )}
                </div>
              </section>
            )}

            {/* TAB 6: Profile (Matching Desktop Reference 3) */}
            {tab === "profile" && (
              <ProfilePanel
                name={user.name}
                driving
                role="captain"
                saved={[]}
                busy={false}
                notify={s.notify}
                onName={(name) => s.setUser((c) => (c ? { ...c, name } : c))}
                onDetails={(d) => setAvatarColor(d.avatar_color)}
                onDeleteSaved={() => undefined}
                goTo={(id) => navigateTab(TABS.includes(id) ? id : "profile")}
                becomeDriver={() => navigateTab("driver")}
                logout={() => setLogoutAsk(true)}
              />
            )}
          </div>
        )}

        {s.signingOut && <PageLoader overlay label="Signing you out…" />}
        <RideMoment />

        <Modal
          opened={logoutAsk}
          onClose={() => setLogoutAsk(false)}
          title="Sign out of hop captain?"
          centered
          radius="lg"
        >
          <Stack gap="sm">
            <Alert color="orange" icon={<IconAlertTriangle size={16} />}>
              Signing out stops new ride requests. Make sure you've finished any active trip.
            </Alert>
            <Text size="sm" c="dimmed">
              You'll need to sign in again to receive captain offers.
            </Text>
            <Group grow>
              <Button variant="default" onClick={() => setLogoutAsk(false)}>
                Stay signed in
              </Button>
              <Button
                color="red"
                onClick={() => {
                  setLogoutAsk(false);
                  void s.logout();
                }}
              >
                Sign out
              </Button>
            </Group>
          </Stack>
        </Modal>

        <footer className="captain-page-footer">
          <strong>hop captain</strong>
          <span>Your everyday earnings and trip management.</span>
        </footer>
      </main>
    </div>
  );
}
