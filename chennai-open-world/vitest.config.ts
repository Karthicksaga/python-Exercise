import { defineConfig } from "vitest/config";

// Unit tests live beside the code in packages/, plus the game's content checks against the real
// world files (apps/game/src). Browser tests (apps/game/tests) run with Playwright.
export default defineConfig({ test: { include: ["packages/*/src/**/*.test.ts", "apps/game/src/**/*.test.ts"] } });
