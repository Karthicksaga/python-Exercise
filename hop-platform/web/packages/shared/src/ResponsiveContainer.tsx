import type { ReactNode } from "react";

export interface ResponsiveContainerProps {
  children: ReactNode;
  className?: string;
  maxWidth?: number | string;
}

export default function ResponsiveContainer({
  children,
  className = "",
  maxWidth = 1180,
}: ResponsiveContainerProps) {
  return (
    <div
      className={`responsive-container ${className}`}
      style={{ maxWidth: typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth }}
    >
      {children}
    </div>
  );
}
