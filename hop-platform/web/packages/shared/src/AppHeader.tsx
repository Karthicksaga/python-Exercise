import type { ReactNode } from "react";
import StatusBadge, { StatusState } from "./StatusBadge";
import ThemeToggle from "./ThemeToggle";
import UserAvatar from "./UserAvatar";

export type AppMode = "rider" | "captain" | "admin" | (string & {});

export interface AppHeaderProps {
  /** Application mode: "rider", "captain", etc. */
  mode?: AppMode;
  /** Custom destination for the logo link */
  homeHref?: string;
  /** Brand title (defaults to "hop") */
  brandTitle?: string;
  /** Subtitle or mode badge text (defaults to mode) */
  brandSubtitle?: string;
  /** Show or hide the mode badge next to the brand */
  showModeBadge?: boolean;
  /** Current authenticated user */
  user?: { name: string; role?: string } | null;
  /** User initial for avatar fallback */
  userInitial?: string;
  /** Avatar background color */
  avatarColor?: string;
  /** Callback when user clicks their avatar */
  onAvatarClick?: () => void;
  /** Full custom status element */
  status?: ReactNode;
  /** Quick status state ("online", "live", "connecting", "offline") */
  statusState?: StatusState;
  /** Custom label for status */
  statusLabel?: string;
  /** Tooltip for status */
  statusTitle?: string;
  /** Show chevron dropdown icon on status */
  showStatusChevron?: boolean;
  /** Callback when status is clicked */
  onStatusClick?: () => void;
  /** Position of status pill on desktop: "center" (Rider style) or "right" (Captain style) */
  statusPosition?: "center" | "right";
  /** Current theme dark state */
  dark?: boolean;
  /** Callback to toggle dark/light theme */
  onToggleDark?: () => void;
  /** Show notification alerts button */
  alertsActive?: boolean;
  /** Callback when alerts button is clicked */
  onAlertsClick?: () => void;
  /** Custom left content next to logo */
  leftContent?: ReactNode;
  /** Custom center content */
  centerContent?: ReactNode;
  /** Custom right content / actions */
  rightActions?: ReactNode;
  /** Extra CSS classes */
  className?: string;
}

export default function AppHeader({
  mode = "rider",
  homeHref,
  brandTitle = "hop",
  brandSubtitle,
  showModeBadge = true,
  user = null,
  userInitial,
  avatarColor,
  onAvatarClick,
  status,
  statusState,
  statusLabel,
  statusTitle,
  showStatusChevron = false,
  onStatusClick,
  statusPosition = mode === "captain" ? "right" : "center",
  dark = false,
  onToggleDark,
  alertsActive = false,
  onAlertsClick,
  leftContent,
  centerContent,
  rightActions,
  className = "",
}: AppHeaderProps) {
  const defaultHome = homeHref || (mode === "captain" ? "/captain" : "/");
  const displaySubtitle = brandSubtitle !== undefined ? brandSubtitle : mode;
  const isAuthenticated = Boolean(user);

  // Status renderer
  const renderStatus = () => {
    if (status) return status;
    if (statusState && isAuthenticated) {
      return (
        <StatusBadge
          state={statusState}
          label={statusLabel}
          title={statusTitle}
          showChevron={showStatusChevron}
          onClick={onStatusClick}
        />
      );
    }
    return null;
  };

  const statusNode = renderStatus();

  return (
    <header className={`app-header app-header-${mode} ${isAuthenticated ? "is-authenticated" : "is-unauthenticated"} ${className}`}>
      {/* 1. Left Section: Logo & Brand */}
      <div className="app-header-left">
        <a href={defaultHome} className="app-header-logo" aria-label={`${brandTitle} ${displaySubtitle}`}>
          <span className="logo-mark" aria-hidden="true">
            h
          </span>
          <span className="app-header-brand-name">
            {brandTitle}
            {showModeBadge && displaySubtitle && (
              <span className={`app-header-mode-badge badge-${displaySubtitle}`}>
                {displaySubtitle}
              </span>
            )}
          </span>
        </a>
        {leftContent}
      </div>

      {/* 2. Center Section: Optional status or center content */}
      <div className="app-header-center">
        {centerContent}
        {statusPosition === "center" && statusNode}
      </div>

      {/* 3. Right Section: Status (if on right), Alerts, ThemeToggle, Avatar */}
      <div className="app-header-right">
        {statusPosition === "right" && statusNode}

        {/* Optional Alerts button for Rider */}
        {isAuthenticated && alertsActive && onAlertsClick && (
          <button
            type="button"
            className="app-header-alerts-btn"
            aria-label="Enable notifications"
            title="Enable notifications"
            onClick={onAlertsClick}
          >
            <span aria-hidden="true">🔔</span>
            <span className="alerts-btn-label">Alerts</span>
          </button>
        )}

        {/* Theme Switcher */}
        {onToggleDark && <ThemeToggle dark={dark} onToggle={onToggleDark} />}

        {/* Right extra actions */}
        {rightActions}

        {/* User Avatar */}
        {isAuthenticated && (
          <UserAvatar
            name={user?.name}
            initial={userInitial}
            color={avatarColor}
            onClick={onAvatarClick}
          />
        )}
      </div>
    </header>
  );
}
