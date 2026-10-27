import type { ReactNode } from "react";
import { IconSteeringWheel } from "@tabler/icons-react";

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
  className?: string;
}

export default function EmptyState({
  title,
  description,
  actionLabel = "Go online and start driving",
  onAction,
  icon,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`empty-state-card ${className}`}>
      <div className="empty-state-art" aria-hidden="true">
        {icon ? (
          icon
        ) : (
          <div className="empty-car-illustration">
            {/* Soft decorative cloud elements */}
            <svg
              className="empty-clouds"
              width="240"
              height="80"
              viewBox="0 0 240 80"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <ellipse cx="60" cy="50" rx="35" ry="18" fill="var(--line, #e2e8f0)" opacity="0.6" />
              <ellipse cx="180" cy="35" rx="45" ry="22" fill="var(--line, #e2e8f0)" opacity="0.5" />
              <circle cx="90" cy="40" r="24" fill="var(--line, #e2e8f0)" opacity="0.4" />
              <circle cx="150" cy="28" r="28" fill="var(--line, #e2e8f0)" opacity="0.4" />
            </svg>
            <div className="empty-car-badge">
              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="empty-car-svg"
              >
                <path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
                <path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
                <path d="M5 17h-2v-6l2 -5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0h-6" />
                <path d="M9 5l1 5" />
                <path d="M14 5l-1 5" />
              </svg>
            </div>
          </div>
        )}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-desc">{description}</p>
      {onAction && actionLabel && (
        <button
          type="button"
          className="empty-state-btn"
          onClick={onAction}
        >
          <IconSteeringWheel size={18} />
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  );
}
