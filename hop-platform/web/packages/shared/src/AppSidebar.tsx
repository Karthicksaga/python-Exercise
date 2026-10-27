import React from "react";
import { IconLogout } from "@tabler/icons-react";
import Icon from "./Icons";

export interface SidebarItem {
  id: string;
  label: string;
  shortLabel?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }> | React.ReactNode;
  badge?: number | string;
}

export interface AppSidebarProps {
  mode?: string;
  homeHref?: string;
  brandTitle?: string;
  brandSubtitle?: string;
  items: SidebarItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onSignOut?: () => void;
  signOutLabel?: string;
  showBrand?: boolean;
  headerContent?: React.ReactNode;
  footerContent?: React.ReactNode;
  className?: string;
}

export default function AppSidebar({
  mode = "captain",
  homeHref,
  brandTitle = "hop",
  brandSubtitle,
  showBrand = false,
  items,
  activeId,
  onSelect,
  onSignOut,
  signOutLabel = "Sign out",
  headerContent,
  footerContent,
  className = "",
}: AppSidebarProps) {
  const defaultHome = homeHref || (mode === "captain" ? "/captain" : "/");
  const displaySubtitle = brandSubtitle !== undefined ? brandSubtitle : mode;

  return (
    <aside className={`app-sidebar app-sidebar-${mode} ${className}`} aria-label="Desktop application navigation">
      {/* Brand Header (only if explicitly enabled) */}
      {showBrand && (
        <div className="app-sidebar-brand">
          <a href={defaultHome} className="app-sidebar-logo">
            <span className="logo-mark" aria-hidden="true">
              h
            </span>
            <div className="app-sidebar-logo-text">
              <span className="logo-title">{brandTitle}</span>
              {displaySubtitle && <span className="logo-subtitle">{displaySubtitle}</span>}
            </div>
          </a>
        </div>
      )}

      {headerContent}

      {/* Navigation List */}
      <nav className="app-sidebar-nav">
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`app-sidebar-nav-btn ${isActive ? "active" : ""}`}
              onClick={() => onSelect(item.id)}
              aria-current={isActive ? "page" : undefined}
            >
              {typeof item.icon === "function" ? (
                <item.icon size={20} className="nav-icon" />
              ) : React.isValidElement(item.icon) ? (
                item.icon
              ) : (
                <Icon name={item.id} size={20} />
              )}
              <span className="nav-label">{item.label}</span>
              {Boolean(item.badge) && <span className="app-sidebar-badge">{item.badge}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer / Sign Out */}
      <div className="app-sidebar-footer">
        {footerContent}
        {onSignOut && (
          <button
            type="button"
            className="app-sidebar-signout-btn"
            onClick={onSignOut}
            aria-label={signOutLabel}
          >
            <IconLogout size={18} />
            <span>{signOutLabel}</span>
          </button>
        )}
      </div>
    </aside>
  );
}
