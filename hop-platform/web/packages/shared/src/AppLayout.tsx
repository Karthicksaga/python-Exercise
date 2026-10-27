import type { ReactNode } from "react";
import AppHeader, { AppHeaderProps, AppMode } from "./AppHeader";
import AppSidebar, { SidebarItem } from "./AppSidebar";
import MobileNavigation from "./MobileNavigation";
import { Toast } from "./session";

export interface AppLayoutProps {
  /** Mode: "rider" or "captain" */
  mode: AppMode;
  /** Authenticated user details */
  user?: { name: string; role?: string } | null;
  /** Header configuration */
  headerProps?: Partial<AppHeaderProps>;
  /** Navigation items */
  navItems?: SidebarItem[];
  /** Primary mobile tab IDs */
  primaryNavIds?: string[];
  /** Currently active tab ID */
  activeTab?: string;
  /** Navigation tab switch handler */
  onNavigateTab?: (tabId: string) => void;
  /** Sign out request handler */
  onSignOut?: () => void;
  /** Show desktop left sidebar */
  showSidebar?: boolean;
  /** Development mode indicator */
  development?: boolean;
  /** Connection issue notice */
  connection?: string;
  /** Toast notice message */
  notice?: string;
  /** Toast close callback */
  onCloseNotice?: () => void;
  /** Main page content */
  children: ReactNode;
  /** Container CSS class */
  className?: string;
}

export default function AppLayout({
  mode,
  user,
  headerProps,
  navItems,
  primaryNavIds,
  activeTab,
  onNavigateTab,
  onSignOut,
  showSidebar = Boolean(user && navItems && navItems.length > 0),
  development = false,
  connection = "",
  notice = "",
  onCloseNotice,
  children,
  className = "",
}: AppLayoutProps) {
  const isAuthenticated = Boolean(user);

  return (
    <div
      className={`app-layout app-layout-${mode} shell ${
        isAuthenticated ? "has-nav" : ""
      } ${mode === "captain" ? "driver-mode captain" : ""} ${className}`}
    >
      {/* 1. Desktop Left Sidebar */}
      {showSidebar && navItems && activeTab && onNavigateTab && (
        <AppSidebar
          mode={mode}
          items={navItems}
          activeId={activeTab}
          onSelect={onNavigateTab}
          onSignOut={onSignOut}
        />
      )}

      {/* 2. Unified Header */}
      <AppHeader
        mode={mode}
        user={user}
        {...headerProps}
      />

      {/* 3. Mobile Navigation Dock */}
      {isAuthenticated && navItems && activeTab && onNavigateTab && onSignOut && (
        <MobileNavigation
          items={navItems.map((n) => ({
            id: n.id,
            label: n.label,
            shortLabel: n.shortLabel,
            badge: typeof n.badge === "number" ? n.badge : undefined,
          }))}
          primary={primaryNavIds}
          value={activeTab}
          onChange={onNavigateTab}
          onSignOut={onSignOut}
        />
      )}

      {/* 4. Main Content Area */}
      <main className={`app-layout-main main-${mode}`}>
        {development && isAuthenticated && (
          <div className="dev-banner" role="status">
            Development environment — no real rides or payments.
          </div>
        )}

        {connection && (
          <div className="alert alert-connection" role="alert">
            <span>{connection}</span>
            <button
              type="button"
              className="text-button"
              onClick={() => window.location.reload()}
            >
              Reconnect
            </button>
          </div>
        )}

        {notice && onCloseNotice && (
          <Toast notice={notice} onClose={onCloseNotice} />
        )}

        {children}
      </main>
    </div>
  );
}
