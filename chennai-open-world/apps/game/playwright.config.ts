import { defineConfig } from "@playwright/test";

/** PW_PORT: serve the build on another port when 4173 is taken (another checkout's tests). */
const port = Number(process.env.PW_PORT ?? 4173);

/**
 * End-to-end tests run the production build (the exact files the Android app ships) in
 * Chromium with a phone-sized, touch-enabled landscape viewport.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  // One at a time: several software-rendered copies of the game slow each other below real time.
  workers: 1,
  reporter: "line",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 915, height: 412 },
    hasTouch: true,
    isMobile: true,
    // Software WebGL, so the tests also run on machines without a GPU.
    // PW_CHROMIUM: use an already installed Chromium instead of Playwright's own download.
    launchOptions: { ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  webServer: {
    command: `npm run build && npx vite preview --host --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
