import React from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { theme } from "./theme";
import AdminApp from "./AdminApp";
import "@hop/shared/style.css";
import "./admin.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light" getStyleNonce={() => document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content ?? ""}>
      <AdminApp />
    </MantineProvider>
  </React.StrictMode>,
);
