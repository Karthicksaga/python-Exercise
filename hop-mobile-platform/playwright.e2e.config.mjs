// Rider + Captain end-to-end test against a real local Hop API (see e2e/README.md).
// Not part of `npm run test:design`, which uses mocked responses.
import { defineConfig } from "@playwright/test";
// OpenStreetMap, as the mobile apps use when Google isn't available, so the pin callouts are
// real page elements the test can read.
const env = { BACKEND_URL: process.env.BACKEND_URL || "http://127.0.0.1:8081", VITE_MAP_PROVIDER: "osm" };
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.mjs/,
  timeout: 240000,
  workers: 1,
  reporter: "list",
  outputDir: "test-results/e2e",
  webServer: [
    { command: "npm run dev:rider", url: "http://127.0.0.1:5183", reuseExistingServer: false, env },
    { command: "npm run dev:captain", url: "http://127.0.0.1:5184", reuseExistingServer: false, env },
  ],
  use: { browserName: "chromium", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
});
