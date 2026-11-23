/**
 * The facade kit's texture: painted shop signboards, rolling shutters, shop interiors and a
 * balcony railing in one 1024 px canvas, so every kit piece of a chunk is one draw call. Its
 * emissive partner lights the open shops' interiors (and the signs, faintly) after dark, the
 * same way `facadeGlowAtlas` lights windows.
 *
 * Tamil text needs a font the device may not have, so a small subset of Noto Sans Tamil is
 * embedded (`loadSignFont`, assets/README.md). Without it the signs are drawn in English only.
 */
import * as THREE from "three";
import { NARROW_SIGNS, SHOP_SIGNS, WIDE_SIGNS, type ShopSign } from "./shopSigns";

export const KIT_SIZE = 1024;
const SIGN_ROW = 112;
/** Rows 0–3 hold one wide sign each, rows 4–6 two narrow signs each. */
const WIDE_ROWS = 4;
const NARROW_ROWS = 3;
const CELL_Y = SIGN_ROW * (WIDE_ROWS + NARROW_ROWS);
const CELL_H = KIT_SIZE - CELL_Y;

/** Pixel rectangle in the kit canvas: x, y (from the top), width, height. */
export type KitRect = readonly [number, number, number, number];

export const KIT_CELLS = {
  shutter: [0, CELL_Y, 256, CELL_H],
  litInterior: [256, CELL_Y, 256, CELL_H],
  darkInterior: [512, CELL_Y, 256, CELL_H],
  railing: [768, CELL_Y, 256, CELL_H / 2],
  plain: [768, CELL_Y + CELL_H / 2, 256, CELL_H / 2],
} as const satisfies Record<string, KitRect>;

export function signRect(index: number): KitRect {
  const sign = SHOP_SIGNS[index];
  if (!sign) throw new Error(`No shop sign ${index}`);
  if (sign.wide) {
    const k = WIDE_SIGNS.indexOf(index);
    if (k >= WIDE_ROWS) throw new Error("Too many wide signs for the kit atlas");
    return [0, k * SIGN_ROW, KIT_SIZE, SIGN_ROW];
  }
  const k = NARROW_SIGNS.indexOf(index);
  if (k >= NARROW_ROWS * 2) throw new Error("Too many narrow signs for the kit atlas");
  return [(k % 2) * (KIT_SIZE / 2), (WIDE_ROWS + Math.floor(k / 2)) * SIGN_ROW, KIT_SIZE / 2, SIGN_ROW];
}

/** Texture coordinates of a rectangle (the canvas is flipped on upload, so v counts from the bottom), inset 2 px against bleeding. */
export function kitUV(rect: KitRect): { u0: number; u1: number; v0: number; v1: number } {
  const [x, y, w, h] = rect;
  return { u0: (x + 2) / KIT_SIZE, u1: (x + w - 2) / KIT_SIZE, v0: 1 - (y + h - 2) / KIT_SIZE, v1: 1 - (y + 2) / KIT_SIZE };
}

export const SIGN_FONT = "COW Sign Tamil";
const LATIN_FONT = "Arial, Helvetica, 'Liberation Sans', 'DejaVu Sans', sans-serif";
let tamilReady = false;

/**
 * Load the embedded Tamil font (a data URL) before the kit atlas is drawn. Resolves false, and
 * the signs fall back to English, if the font fails or takes more than a few seconds: the game
 * starts either way.
 */
export async function loadSignFont(url: string): Promise<boolean> {
  try {
    if (typeof FontFace === "undefined" || typeof document === "undefined") return false;
    const face = new FontFace(SIGN_FONT, `url(${url})`, { weight: "700" });
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Sign font timed out")), 4000));
    await Promise.race([face.load(), timeout]);
    document.fonts.add(face);
    tamilReady = document.fonts.check(`700 48px "${SIGN_FONT}"`, SHOP_SIGNS[0]!.tamil);
  } catch (error) {
    console.warn("Tamil sign font unavailable; signs are drawn in English only.", error);
    tamilReady = false;
  }
  return tamilReady;
}

/** Draw text centred at (cx, baseline), squeezed horizontally to fit `maxWidth`. */
function fitText(g: CanvasRenderingContext2D, text: string, cx: number, baseline: number, maxWidth: number): void {
  const width = g.measureText(text).width;
  const squeeze = width > maxWidth ? maxWidth / width : 1;
  g.save();
  g.translate(cx, baseline);
  g.scale(squeeze, 1);
  g.fillText(text, 0, 0);
  g.restore();
}

function drawSign(g: CanvasRenderingContext2D, rect: KitRect, sign: ShopSign, tamil: boolean): void {
  const [x, y, w, h] = rect;
  g.fillStyle = sign.board;
  g.fillRect(x, y, w, h);
  // Painted trim bands and a thin frame.
  g.fillStyle = sign.trim;
  g.fillRect(x, y, w, 7);
  g.fillRect(x, y + h - 7, w, 7);
  g.strokeStyle = sign.trim;
  g.lineWidth = 3;
  g.strokeRect(x + 10, y + 12, w - 20, h - 24);
  // A little sun-fading towards the top.
  const fade = g.createLinearGradient(0, y, 0, y + h);
  fade.addColorStop(0, "rgba(255,255,255,0.12)");
  fade.addColorStop(1, "rgba(0,0,0,0.08)");
  g.fillStyle = fade;
  g.fillRect(x, y, w, h);
  g.fillStyle = sign.ink;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  const cx = x + w / 2;
  if (tamil) {
    g.font = `700 46px "${SIGN_FONT}", ${LATIN_FONT}`;
    fitText(g, sign.tamil, cx, y + 64, w - 44);
    g.font = `700 22px ${LATIN_FONT}`;
    fitText(g, sign.english, cx, y + 92, w - 60);
  } else {
    g.font = `700 50px ${LATIN_FONT}`;
    fitText(g, sign.english, cx, y + 74, w - 44);
  }
}

/** Corrugated rolling shutter, near white so vertex colour paints it. */
function drawShutter(g: CanvasRenderingContext2D, rect: KitRect): void {
  const [x, y, w, h] = rect;
  g.fillStyle = "#ecebe6";
  g.fillRect(x, y, w, h);
  g.fillStyle = "rgba(0,0,0,0.42)";
  g.fillRect(x, y, w, 16); // shutter box
  for (let row = y + 18; row < y + h - 12; row += 9) {
    g.fillStyle = "rgba(0,0,0,0.22)";
    g.fillRect(x, row, w, 3);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(x, row + 4, w, 1);
  }
  g.fillStyle = "rgba(0,0,0,0.5)";
  g.fillRect(x, y + h - 12, w, 12); // bottom bar
  g.fillStyle = "#555";
  g.fillRect(x + w / 2 - 14, y + h - 24, 28, 6); // handle
  g.fillStyle = "#8a6d2a";
  g.fillRect(x + 30, y + h - 26, 10, 14); // padlocks
  g.fillRect(x + w - 40, y + h - 26, 10, 14);
  // Rust and dust streaks.
  g.fillStyle = "rgba(110,70,40,0.12)";
  for (let i = 0; i < 6; i++) g.fillRect(x + 20 + i * 39, y + 20, 5, h * (0.3 + (i % 3) * 0.15));
}

/** An open shop: rolled-up shutter, tube light, shelves of goods and a counter. */
function drawInterior(g: CanvasRenderingContext2D, rect: KitRect, seed: number): void {
  const [x, y, w, h] = rect;
  g.fillStyle = "#d9cdb0";
  g.fillRect(x, y, w, h);
  g.fillStyle = "#3b3b3b";
  g.fillRect(x, y, w, 16); // rolled shutter
  g.fillStyle = "#fbfbf2";
  g.fillRect(x + 40, y + 22, w - 80, 6); // tube light
  let state = seed;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const goods = ["#c62828", "#f9a825", "#2e7d32", "#1565c0", "#ef6c00", "#6a1b9a", "#f5f5f5", "#00838f"];
  for (let shelf = 0; shelf < 3; shelf++) {
    const top = y + 38 + shelf * 52;
    g.fillStyle = "#7b5a3a";
    g.fillRect(x + 8, top + 42, w - 16, 5);
    for (let px = x + 10; px < x + w - 16; ) {
      const bw = 10 + Math.floor(random() * 18);
      const bh = 18 + Math.floor(random() * 22);
      g.fillStyle = goods[Math.floor(random() * goods.length)]!;
      g.fillRect(px, top + 42 - bh, bw, bh);
      px += bw + 2;
    }
  }
  // Counter at the front.
  g.fillStyle = "#6d4c2f";
  g.fillRect(x + 10, y + h - 54, w - 20, 54);
  g.fillStyle = "rgba(255,255,255,0.18)";
  g.fillRect(x + 10, y + h - 54, w - 20, 5);
}

function drawRailing(g: CanvasRenderingContext2D, rect: KitRect): void {
  const [x, y, w, h] = rect;
  g.clearRect(x, y, w, h);
  g.fillStyle = "#34363a";
  g.fillRect(x, y + 4, w, 9); // hand rail
  g.fillRect(x, y + h - 12, w, 8); // bottom rail
  g.fillRect(x, y + h / 2 - 2, w, 4);
  for (let px = x + 4; px < x + w; px += 16) g.fillRect(px, y + 4, 4, h - 8);
}

export interface KitTextures {
  readonly map: THREE.CanvasTexture;
  readonly glow: THREE.CanvasTexture;
}

function texture(element: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(element);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement("canvas");
  element.width = element.height = KIT_SIZE;
  const g = element.getContext("2d");
  if (!g) throw new Error("2D canvas is not available for texture generation.");
  return [element, g];
}

/** Draw the kit atlas and its glow partner. Call after `loadSignFont` has settled. */
export function kitTextures(): KitTextures {
  const [element, g] = canvas();
  g.fillStyle = "#bdb8ae";
  g.fillRect(0, 0, KIT_SIZE, KIT_SIZE);
  SHOP_SIGNS.forEach((sign, i) => drawSign(g, signRect(i), sign, tamilReady));
  drawShutter(g, KIT_CELLS.shutter);
  drawInterior(g, KIT_CELLS.litInterior, 7);
  drawInterior(g, KIT_CELLS.darkInterior, 19);
  const [dx, dy, dw, dh] = KIT_CELLS.darkInterior;
  g.fillStyle = "rgba(12,10,8,0.62)";
  g.fillRect(dx, dy + 16, dw, dh - 16);
  drawRailing(g, KIT_CELLS.railing);
  const [px, py, pw, ph] = KIT_CELLS.plain;
  g.fillStyle = "#c9c4ba";
  g.fillRect(px, py, pw, ph);

  // Glow: the open, lit shops at full strength; the signboards faintly, as if lit by the
  // tube lights under them.
  const [glowElement, glow] = canvas();
  glow.fillStyle = "#000";
  glow.fillRect(0, 0, KIT_SIZE, KIT_SIZE);
  glow.globalAlpha = 0.3;
  glow.drawImage(element, 0, 0, KIT_SIZE, CELL_Y, 0, 0, KIT_SIZE, CELL_Y);
  glow.globalAlpha = 1;
  const [lx, ly, lw, lh] = KIT_CELLS.litInterior;
  glow.globalAlpha = 0.7;
  glow.drawImage(element, lx, ly, lw, lh, lx, ly, lw, lh);
  glow.globalAlpha = 1;
  glow.fillStyle = "rgba(255,214,150,0.2)";
  glow.fillRect(lx, ly + 16, lw, lh - 16);
  return { map: texture(element), glow: texture(glowElement) };
}
