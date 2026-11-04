// Renders the live-map artwork to PNGs for the native Android map (it can't draw SVG or rotate
// markers): every vehicle at each 15° of heading, plus the pickup, drop-off and location pins.
// Run after changing shared/maps/vehicleArt.ts:  node scripts/map-sprites.mjs
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = await build({ entryPoints: [path.join(root, "shared/maps/vehicleArt.ts")], bundle: true, format: "esm", write: false, platform: "neutral" });
const { topDownVehicle } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

export const SPRITE_STEP = 15;
const pins = {
  pickup: `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg"><path d="M16 1C7.716 1 1 7.716 1 16c0 11.5 15 25 15 25s15-13.5 15-25c0-8.284-6.716-15-15-15Z" fill="#4b3fd1" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="6" fill="#fff"/></svg>`,
  dropoff: `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg"><path d="M16 1C7.716 1 1 7.716 1 16c0 11.5 15 25 15 25s15-13.5 15-25c0-8.284-6.716-15-15-15Z" fill="#14151f" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="6" fill="#fff"/><circle cx="16" cy="16" r="3" fill="#14151f"/></svg>`,
  current: `<svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg"><circle cx="22" cy="22" r="18" fill="#2677df" fill-opacity=".2"/><circle cx="22" cy="22" r="7" fill="#2677df" stroke="#fff" stroke-width="2.5"/></svg>`,
};
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 3 });
// Each sprite is captured from a fixed frame, so every heading has the same size and centre.
const shoot = async (html, w, h, file) => {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent;overflow:hidden"><div style="width:${w}px;height:${h}px;display:grid;place-items:center">${html}</div></body></html>`);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
};
for (const app of ["rider", "captain"]) {
  const dir = path.join(root, "apps", app, "public", "assets", "map");
  mkdirSync(dir, { recursive: true });
  for (const cat of ["bike", "auto", "mini", "sedan", "suv"])
    for (let deg = 0; deg < 360; deg += SPRITE_STEP)
      await shoot(`<img src="${topDownVehicle(cat)}" style="display:block;width:46px;height:46px;transform:rotate(${deg}deg)">`, 46, 46, path.join(dir, `${cat}-${String(deg).padStart(3, "0")}.png`));
  await shoot(pins.pickup, 32, 42, path.join(dir, "pickup.png"));
  await shoot(pins.dropoff, 32, 42, path.join(dir, "dropoff.png"));
  await shoot(pins.current, 44, 44, path.join(dir, "current.png"));
}
await browser.close();
console.log("Map sprites written to apps/*/public/assets/map");
