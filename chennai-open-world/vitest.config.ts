import { defineConfig } from "vitest/config";

// Unit tests live beside the code in packages/. Browser tests (apps/game/tests) run with Playwright.
export default defineConfig({ test: { include: ["packages/*/src/**/*.test.ts"] } });
