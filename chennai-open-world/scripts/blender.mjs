/**
 * Runs a Blender Python script headless: `node scripts/blender.mjs <script.py> [-- args]`.
 * Blender is found through the BLENDER environment variable (path to the `blender` binary),
 * else `blender` on the PATH. Blender is a build tool only; the game never needs it.
 */
import { spawnSync } from "node:child_process";

const [script, ...rest] = process.argv.slice(2);
if (!script) {
  console.error("Usage: node scripts/blender.mjs <script.py> [-- args]");
  process.exit(2);
}
const blender = process.env.BLENDER || "blender";
const run = spawnSync(blender, ["-b", "--factory-startup", "--python", script, ...rest], { stdio: "inherit" });
if (run.error) {
  console.error(`Could not start Blender (${blender}): ${run.error.message}. Install Blender 5.2 LTS or set BLENDER to its path.`);
  process.exit(1);
}
process.exit(run.status ?? 1);
