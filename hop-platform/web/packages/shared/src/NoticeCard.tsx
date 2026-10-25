import type { ReactNode } from "react";
import { Button } from "@mantine/core";

// Reusable friendly block for errors/empty states (map blocked, offline, access denied...).
export default function NoticeCard({ icon = "⚠️", title, children, actionLabel, onAction, tone = "warn" }: { icon?: string; title: string; children?: ReactNode; actionLabel?: string; onAction?: () => void; tone?: "warn" | "info" | "danger" }) {
  return (
    <div className={`notice-card ${tone}`} role="alert">
      <span className="notice-icon" aria-hidden>{icon}</span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {actionLabel && <Button size="compact-sm" radius="xl" color="indigo" onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}
