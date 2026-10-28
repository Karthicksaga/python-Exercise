import { defineConfig } from "../../web/node_modules/@playwright/test/index.mjs";
export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  workers: 3,
  reporter: "list",
  outputDir: "/private/tmp/hop-mobile-prototype-results",
  use: {
    baseURL: "http://localhost:5280",
    browserName: "chromium",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
});
