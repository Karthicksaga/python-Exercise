import { IconChevronDown } from "@tabler/icons-react";

export type StatusState = "online" | "live" | "connecting" | "offline";

export interface StatusBadgeProps {
  state?: StatusState;
  label?: string;
  title?: string;
  showChevron?: boolean;
  onClick?: () => void;
  className?: string;
}

const defaultLabels: Record<StatusState, string> = {
  online: "Online",
  live: "Live",
  connecting: "Connecting",
  offline: "Offline",
};

export default function StatusBadge({
  state = "live",
  label,
  title,
  showChevron = false,
  onClick,
  className = "",
}: StatusBadgeProps) {
  const displayLabel = label ?? defaultLabels[state];
  const Component = onClick ? "button" : "div";

  return (
    <Component
      type={onClick ? "button" : undefined}
      className={`status-badge status-badge-${state} ${onClick ? "is-clickable" : ""} ${className}`}
      role="status"
      title={title || displayLabel}
      onClick={onClick}
    >
      <span className={`status-pulse-dot dot-${state}`} aria-hidden="true" />
      <span className="status-badge-text">{displayLabel}</span>
      {showChevron && (
        <IconChevronDown size={14} className="status-badge-chevron" aria-hidden="true" />
      )}
    </Component>
  );
}
