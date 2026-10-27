import type { ReactNode } from "react";
import "./booking-workspace.css";

/** Stable workspace for every booking stage; the existing map stays mounted. */
export default function BookingWorkspace({ children, step }: { children: ReactNode; step: "where" | "choose" | "confirm" }) {
  return <div className="booking-workspace" data-step={step}>{children}</div>;
}
