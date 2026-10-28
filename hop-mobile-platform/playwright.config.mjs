import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 120000,
  workers: 1,
  reporter: "list",
  outputDir: "test-results",
  webServer: [
    {
      command:
        "python3 -m http.server 5290 --bind 127.0.0.1 --directory ../hop-platform/prototypes/mobile-first",
      url: "http://127.0.0.1:5290",
      reuseExistingServer: true,
    },
    {
      command: "npm run dev:rider",
      url: "http://127.0.0.1:5183",
      reuseExistingServer: true,
    },
    {
      command: "npm run dev:captain",
      url: "http://127.0.0.1:5184",
      reuseExistingServer: true,
    },
  ],
  use: { browserName: "chromium", reducedMotion: "reduce" },
});
