// Scratch helper (not committed): open the preview, teleport, screenshot, print snapshot fields.
import { chromium } from "@playwright/test";
const [, , x, z, yaw, out, wait, hour] = process.argv;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 915, height: 412 }, hasTouch: true, isMobile: true });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") console.log("CONSOLE", m.text()); });
await page.goto("http://127.0.0.1:4183/?quality=lite");
await page.evaluate((h) => { localStorage.clear(); if (h) localStorage.setItem("cow-hour-v1", h); localStorage.setItem("cow-progress-v1", JSON.stringify({ completed: [], money: 100 })); }, hour ?? "");
await page.reload();
await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 90000 });
if (x !== "spawn") await page.evaluate(([px, pz, py]) => window.__cow.teleport(px, pz, py), [Number(x), Number(z), Number(yaw)]);
const from = await page.evaluate(() => window.__cow.snapshot().simTime);
await page.waitForFunction((f) => window.__cow.snapshot().simTime - f > Number(2.5), from, { timeout: 120000 });
const s = await page.evaluate(() => window.__cow.snapshot());
console.log(JSON.stringify({ x: s.x, z: s.z, y: s.y, drawCalls: s.drawCalls, triangles: s.triangles, fps: s.fps, rail: s.rail && { ...s.rail, stops: s.rail.stops.length } }));
if (out) await page.screenshot({ path: out });
await browser.close();
