import { createPortal } from "react-dom";
import { Loader } from "@mantine/core";

// Branded loading screen. `overlay` covers the page (sign-in/out); otherwise it fills its container (first load).
export default function PageLoader({ label, overlay = false }: { label: string; overlay?: boolean }) {
  const body = (
    <div className={"page-loader" + (overlay ? " overlay" : "")} role="status" aria-live="polite">
      <div className="pl-logo">h</div>
      <Loader color="indigo" type="dots" size="md" />
      <span>{label}</span>
    </div>
  );
  return overlay ? createPortal(body, document.body) : body;
}
