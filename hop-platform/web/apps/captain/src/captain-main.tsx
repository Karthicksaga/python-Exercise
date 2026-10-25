import { initAndroid, isAndroid } from "@hop/shared/platform";
import React from "react";
import { createRoot } from "react-dom/client";
import { APIProvider } from "@vis.gl/react-google-maps";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { theme } from "./theme";
import App from "./CaptainApp";
import "@hop/shared/style.css";
import "./captain.css";
if (!isAndroid && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const app = <App />;
void initAndroid().then(() => createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light" getStyleNonce={() => document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content ?? ""}>
      {apiKey && import.meta.env.VITE_MAP_PROVIDER === "google" ? <APIProvider apiKey={apiKey} libraries={["places"]}>{app}</APIProvider> : app}
    </MantineProvider>
  </React.StrictMode>,
));
