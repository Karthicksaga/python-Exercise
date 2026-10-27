import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/live",
  workers: 1,
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: process.env.HOP_LIVE_RIDER_URL,
    storageState: process.env.HOP_LIVE_STORAGE_STATE || undefined,
    trace: "retain-on-failure",
  },
  reporter: "list",
});
