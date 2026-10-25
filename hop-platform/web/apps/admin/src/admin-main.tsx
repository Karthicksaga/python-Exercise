import React from "react";
import { createRoot } from "react-dom/client";
import { APIProvider } from "@vis.gl/react-google-maps";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { theme } from "./theme";
import AdminApp from "./AdminApp";
import "@hop/shared/style.css";
import "./admin.css";

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider
      theme={theme}
      defaultColorScheme="light"
      getStyleNonce={() => document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content ?? ""}
    >
      {apiKey && import.meta.env.VITE_MAP_PROVIDER === "google" ? (
        <APIProvider apiKey={apiKey} libraries={["places"]}>
          <AdminApp />
        </APIProvider>
      ) : (
        <AdminApp />
      )}
    </MantineProvider>
  </React.StrictMode>,
);
