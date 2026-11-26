// Render the prototype with the pre-installed Chromium and fail on any page error.
//   NODE_PATH=/opt/node-tools/node_modules node tools/imagery/prototype/screenshot.mjs OUT.png [width]
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const require = createRequire("/opt/node-tools/node_modules/");
const { chromium } = require("playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? "prototype.png";
const width = Number(process.argv[3] ?? 1200);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("request", (r) => { if (!r.url().startsWith("file:")) errors.push("external request: " + r.url()); });
await page.goto(pathToFileURL(path.join(here, "index.html")).href);
const n = await page.locator("section.cat svg").count();
const rows = await page.locator("section.cat tbody tr").count();
console.log(`swatches=${n} rows=${rows} banner="${(await page.locator("#banner").textContent())?.slice(0, 80)}"`);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
if (errors.length || n !== 21 || rows !== 56) { console.error("FAILED", errors, n, rows); process.exit(1); }
