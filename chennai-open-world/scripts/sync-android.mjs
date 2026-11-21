/**
 * Copies the built game (apps/game/dist) into the Android app's assets, so the APK carries the
 * game and plays with no network. Run through `npm run sync:android`.
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const from = resolve(root, "apps/game/dist");
const to = resolve(root, "apps/mobile/android/app/src/main/assets/game");

if (!existsSync(resolve(from, "index.html"))) {
  console.error("apps/game/dist is missing. Run `npm run build` first.");
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`Game copied to ${to}`);
