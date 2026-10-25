import React from "react";
import { createRoot } from "react-dom/client";
import { APIProvider } from "@vis.gl/react-google-maps";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { theme } from "./theme";
import App from "./RiderApp";
const ShareView = lazyPanel(() => import("./ShareView"), "Loading trip…");
import { lazyPanel } from "@hop/shared/lazy";
import "@hop/shared/style.css";
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
const shareToken = new URLSearchParams(location.search).get("share");
const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light" getStyleNonce={() => document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content ?? ""}>
    {shareToken ? (
      <ShareView token={shareToken} />
    ) : apiKey && import.meta.env.VITE_MAP_PROVIDER === "google" ? (
      <APIProvider apiKey={apiKey} libraries={["places"]}>
        <App />
      </APIProvider>
    ) : (
      <App />
    )}
    </MantineProvider>
  </React.StrictMode>,
);
