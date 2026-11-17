import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests run the production build (the exact files the Android app ships) in
 * Chromium with a phone-sized, touch-enabled landscape viewport.
 */
/** PW_PORT: serve on another port, so checkouts tested side by side never test each other's build. */
const PORT = Number(process.env.PW_PORT ?? 4173);

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  // One at a time: several software-rendered copies of the game slow each other below real time.
  workers: 1,
  reporter: "line",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 915, height: 412 },
    hasTouch: true,
    isMobile: true,
    // Software WebGL, so the tests also run on machines without a GPU.
    // PW_CHROMIUM: use an already installed Chromium instead of Playwright's own download.
    launchOptions: { ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  webServer: {
    command: PORT === 4173 ? "npm run build && npm run preview -- --strictPort" : `npm run build && npx vite preview --host --strictPort --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
