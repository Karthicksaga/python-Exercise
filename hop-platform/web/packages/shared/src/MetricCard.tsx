import type { ReactNode } from "react";
import { IconChevronRight } from "@tabler/icons-react";

export interface MetricCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  iconBg?: string;
  iconColor?: string;
  onClick?: () => void;
  className?: string;
}

export default function MetricCard({
  title,
  value,
  icon,
  iconBg = "#e6f7f0",
  iconColor = "#059669",
  onClick,
  className = "",
}: MetricCardProps) {
  return (
    <div
      className={`metric-card ${onClick ? "clickable" : ""} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div
        className="metric-icon-badge"
        style={{ backgroundColor: iconBg, color: iconColor }}
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="metric-info">
        <strong className="metric-value">{value}</strong>
        <span className="metric-title">{title}</span>
      </div>
      <div className="metric-action" aria-hidden="true">
        <span className="metric-arrow">
          <IconChevronRight size={18} />
        </span>
      </div>
    </div>
  );
}
