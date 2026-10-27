import type { ReactNode } from "react";
import {
  IconCar,
  IconClock,
  IconHeadset,
  IconHome,
  IconUser,
  IconWallet,
} from "@tabler/icons-react";
import AppHeader from "./AppHeader";
import AppSidebar, { SidebarItem } from "./AppSidebar";
import MobileNavigation from "./MobileNavigation";

export interface DashboardLayoutProps {
  currentTab: string;
  onNavigateTab: (tabId: string) => void;
  onSignOut: () => void;
  user?: { name: string; role?: string } | null;
  dutyOn?: boolean | null;
  live?: boolean;
  dark?: boolean;
  toggleDark?: () => void;
  avatarColor?: string;
  children: ReactNode;
}

const navConfig: SidebarItem[] = [
  { id: "driver", label: "Drive", icon: IconHome },
  { id: "earnings", label: "Earnings", icon: IconWallet },
  { id: "vehicle", label: "Vehicle", icon: IconCar },
  { id: "history", label: "My trips", shortLabel: "Trips", icon: IconClock },
  { id: "support", label: "Support", icon: IconHeadset },
  { id: "profile", label: "Profile", icon: IconUser },
];

export default function DashboardLayout({
  currentTab,
  onNavigateTab,
  onSignOut,
  user,
  dutyOn = null,
  live = true,
  dark = false,
  toggleDark,
  avatarColor = "#4f46e5",
  children,
}: DashboardLayoutProps) {
  const statusState = dutyOn ? "online" : live ? "live" : "offline";

  return (
    <div className={`captain-dashboard-layout shell ${user ? "has-nav" : ""} driver-mode captain`}>
      {/* 1. Unified Desktop Left Sidebar */}
      {user && (
        <AppSidebar
          mode="captain"
          items={navConfig}
          activeId={currentTab}
          onSelect={onNavigateTab}
          onSignOut={onSignOut}
        />
      )}

      {/* 2. Unified AppHeader */}
      <AppHeader
        mode="captain"
        user={user}
        statusState={statusState}
        statusLabel={dutyOn ? "Online" : live ? "Live" : "Offline"}
        statusTitle={dutyOn ? "You are online and visible to riders" : "Live connection"}
        showStatusChevron={true}
        dark={dark}
        onToggleDark={toggleDark}
        avatarColor={avatarColor}
        onAvatarClick={() => onNavigateTab("profile")}
      />

      {/* 3. Mobile Dock Navigation */}
      {user && (
        <MobileNavigation
          items={navConfig.map((n) => ({
            id: n.id,
            label: n.label,
            shortLabel: n.shortLabel,
          }))}
          primary={["driver", "earnings", "vehicle", "history"]}
          value={currentTab}
          onChange={onNavigateTab}
          onSignOut={onSignOut}
        />
      )}

      {/* 4. Main Viewport Content Area */}
      <main className="captain-main-viewport">
        {children}
      </main>
    </div>
  );
}
