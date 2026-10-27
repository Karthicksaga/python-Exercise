import { useEffect, useRef, type ReactNode } from "react";
import "./booking-workspace.css";

/** Stable workspace for every booking stage; the existing map stays mounted. */
export default function BookingWorkspace({
  children,
  step,
}: {
  children: ReactNode;
  step: "where" | "choose" | "confirm";
}) {
  const root = useRef<HTMLDivElement>(null);
  const initial = useRef(true);
  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    const heading = root.current?.querySelector<HTMLHeadingElement>(
      ".booking-stage-heading h2",
    );
    heading?.focus({ preventScroll: true });
    root.current?.querySelector(".booking-panel")?.scrollTo({ top: 0 });
  }, [step]);
  return (
    <div ref={root} className="booking-workspace" data-step={step}>
      {children}
    </div>
  );
}
