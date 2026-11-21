/**
 * Browser tests, one run at a time per machine: `npm run test:e2e [-- <playwright args>]`.
 *
 * Software-rendered Chromium is CPU-heavy: two runs at once each slow to a fraction of real time,
 * and timing tests then fail for no reason in the code. When several agents or checkouts share a
 * machine, this script makes them take turns:
 * - a machine-wide lock (in the system temp folder, shared by every checkout); a second run waits,
 *   saying so, and starts when the first ends. A lock left by a run that died is cleared.
 * - a free port for the preview server, so one checkout never tests another checkout's build.
 * - `--trace off` unless you pass a --trace option (recording traces costs a third of the CPU).
 *
 * Examples:
 *   npm run test:e2e                              # the full suite
 *   npm run test:e2e -- tests/railway.spec.ts     # one spec
 *   COW_E2E_NO_LOCK=1 npm run test:e2e            # skip the lock (a CI runner with one job)
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lock = join(tmpdir(), "chennai-open-world-e2e.lock");
const args = process.argv.slice(2);
if (!args.some((a) => a.startsWith("--trace"))) args.push("--trace", "off");

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

/** Take the lock (a directory: creating one is atomic), waiting while another live run holds it. */
async function acquire() {
  let told = false;
  for (;;) {
    try {
      mkdirSync(lock);
      writeFileSync(join(lock, "owner"), JSON.stringify({ pid: process.pid, cwd: process.cwd(), started: new Date().toISOString() }));
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    let owner = null;
    try {
      owner = JSON.parse(readFileSync(join(lock, "owner"), "utf8"));
    } catch {
      // Being written right now, or left half-written: look again shortly.
    }
    if (owner && !alive(owner.pid)) {
      console.log(`e2e: clearing a lock left by a run that ended (pid ${owner.pid})`);
      rmSync(lock, { recursive: true, force: true });
      continue;
    }
    if (!told && owner) {
      console.log(`e2e: another browser test run is in progress (pid ${owner.pid}, ${owner.cwd}, since ${owner.started}); waiting for it to finish…`);
      told = true;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

function release() {
  try {
    const owner = JSON.parse(readFileSync(join(lock, "owner"), "utf8"));
    if (owner.pid === process.pid) rmSync(lock, { recursive: true, force: true });
  } catch {
    // Already gone.
  }
}

/** A port nothing listens on right now. */
function freePort() {
  return new Promise((ok, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => ok(port));
    });
  });
}

const useLock = process.env.COW_E2E_NO_LOCK !== "1";
if (useLock) await acquire();
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    release();
    process.exit(130);
  });
}
const port = process.env.PW_PORT ?? String(await freePort());
console.log(`e2e: running on port ${port}${useLock ? " (lock held)" : ""}: playwright test ${args.join(" ")}`);
const child = spawn("npx", ["playwright", "test", ...args], { cwd: join(root, "apps/game"), stdio: "inherit", env: { ...process.env, PW_PORT: port } });
child.on("exit", (code, signal) => {
  if (useLock) release();
  process.exit(code ?? (signal ? 1 : 0));
});
