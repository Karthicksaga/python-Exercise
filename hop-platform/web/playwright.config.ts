import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', fullyParallel: true, timeout: 90000, workers: 2,
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{testName}/{arg}{ext}',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL || undefined, trace: 'retain-on-failure', reducedMotion: 'reduce' },
  webServer: [
    { command: 'npm run dev -w @hop/rider -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
    { command: 'npm run dev -w @hop/captain -- --host 127.0.0.1', url: 'http://127.0.0.1:5174', reuseExistingServer: !process.env.CI },
  ],
});
