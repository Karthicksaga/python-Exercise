/**
 * Android smoke test (CI job `android-smoke`): installs a test APK on a running emulator, opens
 * the game and checks, through Chrome DevTools, that it reached `data-ready="true"` on the
 * WebViewAssetLoader origin and streamed at least one chunk (TD-16).
 *
 *   node scripts/android-smoke.mjs <path/to/app.apk> [out-dir]
 *
 * The APK must be built with `-PcowTestHooks=true`: that turns on WebView debugging (the DevTools
 * socket this script reads) and the TEST_AUTOPLAY launch extra (opens the game without tapping
 * PLAY). The device log is written to `<out-dir>/logcat.txt` (default `android-smoke/`).
 * Needs `adb` on PATH and Node 22 or later (built-in fetch and WebSocket); no npm packages.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PACKAGE = "com.chennaiopenworld";
const ACTIVITY = `${PACKAGE}/.MainActivity`;
const AUTOPLAY_EXTRA = `${PACKAGE}.TEST_AUTOPLAY`;
const GAME_URL_PREFIX = "https://appassets.androidplatform.net/assets/game/";
const PORT = 9222;
const TIMEOUT_MS = 120_000;
const POLL_MS = 2_000;

const [apk, outArg] = process.argv.slice(2);
if (!apk) {
  console.error("Usage: node scripts/android-smoke.mjs <app.apk> [out-dir]");
  process.exit(2);
}
const outDir = resolve(outArg ?? "android-smoke");
mkdirSync(outDir, { recursive: true });

const adb = (...args) => execFileSync("adb", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const log = (message) => console.log(`[smoke ${new Date().toISOString().slice(11, 19)}] ${message}`);

/** The WebView's DevTools socket, `webview_devtools_remote_<pid>`, once the app has created it. */
function devtoolsSocket() {
  let pid = "";
  try {
    pid = adb("shell", "pidof", PACKAGE).split(/\s+/)[0] ?? "";
  } catch {
    return null; // `pidof` fails while the app is not running yet
  }
  if (!pid) return null;
  const sockets = adb("shell", "cat", "/proc/net/unix");
  const name = `webview_devtools_remote_${pid}`;
  return sockets.includes(`@${name}`) ? name : null;
}

/** Evaluates one expression in the page through the DevTools protocol and returns its value. */
function evaluate(webSocketUrl, expression) {
  return new Promise((resolveValue, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("DevTools did not answer in 10 s"));
    }, 10_000);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      if (message.error) reject(new Error(message.error.message));
      else if (message.result.exceptionDetails) reject(new Error(message.result.exceptionDetails.text));
      else resolveValue(message.result.result.value);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`Could not connect to ${webSocketUrl}`));
    });
  });
}

const PROBE = `JSON.stringify({
  url: location.href,
  ready: document.documentElement.dataset.ready ?? null,
  chunksLoaded: window.__cow ? window.__cow.snapshot().chunksLoaded : null,
  message: document.getElementById("loading")?.textContent ?? null,
})`;

class GameError extends Error {}

async function run() {
  log(`installing ${apk}`);
  adb("install", "-r", apk);
  adb("logcat", "-c");
  adb("shell", "am", "force-stop", PACKAGE);
  log("launching the game");
  adb("shell", "am", "start", "-W", "-n", ACTIVITY, "--ez", AUTOPLAY_EXTRA, "true");

  const deadline = Date.now() + TIMEOUT_MS;
  let forwarded = null;
  let last = "nothing yet";
  /** One look at the page: true once it passed, else `last` says what is missing. */
  const check = async () => {
    const socket = devtoolsSocket();
    if (!socket) {
      last = "no WebView DevTools socket yet (is the APK built with -PcowTestHooks=true?)";
      return false;
    }
    if (socket !== forwarded) {
      adb("forward", `tcp:${PORT}`, `localabstract:${socket}`);
      forwarded = socket;
      log(`forwarded tcp:${PORT} to ${socket}`);
    }
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    const page = targets.find((target) => target.type === "page" && String(target.url).startsWith(GAME_URL_PREFIX));
    if (!page) {
      last = `no game page among targets: ${targets.map((target) => target.url).join(", ") || "none"}`;
      return false;
    }
    // The URL the WebView reports may name another host; the forwarded port is what works.
    const webSocketUrl = String(page.webSocketDebuggerUrl).replace(/^ws:\/\/[^/]+/, `ws://127.0.0.1:${PORT}`);
    const state = JSON.parse(await evaluate(webSocketUrl, PROBE));
    last = JSON.stringify(state);
    if (state.ready === "error") throw new GameError(`The game reported an error: ${state.message}`);
    return state.ready === "true" && typeof state.chunksLoaded === "number" && state.chunksLoaded > 0;
  };
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    try {
      if (await check()) {
        log(`pass: ${last}`);
        return;
      }
    } catch (error) {
      if (error instanceof GameError) throw error;
      last = error instanceof Error ? error.message : String(error);
    }
    log(`waiting: ${last}`);
  }
  throw new Error(`Timed out after ${TIMEOUT_MS / 1000} s. Last state: ${last}`);
}

let failed = false;
try {
  await run();
} catch (error) {
  failed = true;
  console.error(`[smoke] FAIL: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  try {
    writeFileSync(resolve(outDir, "logcat.txt"), adb("logcat", "-d"));
    log(`device log written to ${resolve(outDir, "logcat.txt")}`);
  } catch (error) {
    console.error(`[smoke] could not save logcat: ${error instanceof Error ? error.message : String(error)}`);
  }
}
process.exit(failed ? 1 : 0);
