/**
 * Textures painted on a canvas at start-up: the facade atlas (windows, doors and shop fronts
 * over a photographed plaster), the roof tiles' canvas copy, and light shapes. The ground's
 * photographed textures are used as they are (`surfaces.ts`).
 */
import * as THREE from "three";

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  const context = element.getContext("2d");
  if (!context) throw new Error("2D canvas is not available for texture generation.");
  return [element, context];
}

function finish(source: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Deterministic noise so textures look the same on every run. */
function noise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Weathered plaster: the photographed plaster (neutral grey, so vertex colour tints it), with a
 * few faint rain streaks from the sunshades and parapet, as on most Chennai walls.
 */
function plaster(g: CanvasRenderingContext2D, size: number, photo: CanvasImageSource, seed: number): void {
  g.drawImage(photo, 0, 0, size, size);
  const random = noise(seed);
  for (let i = 0; i < 8; i++) {
    const x = random() * size;
    const streak = g.createLinearGradient(0, 0, 0, size * (0.3 + random() * 0.5));
    streak.addColorStop(0, "rgba(60,55,50,0.10)");
    streak.addColorStop(1, "rgba(60,55,50,0)");
    g.fillStyle = streak;
    g.fillRect(x, 0, 2 + random() * 5, size);
  }
}

function windowPane(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // Sunshade slab and its shadow.
  g.fillStyle = "#d8d5cf";
  g.fillRect(x - 10, y - 14, w + 20, 8);
  g.fillStyle = "rgba(0,0,0,0.28)";
  g.fillRect(x - 6, y - 6, w + 12, 7);
  // Frame, glass with a sky reflection, grille.
  g.fillStyle = "#4b3a2c";
  g.fillRect(x, y, w, h);
  const glass = g.createLinearGradient(0, y, 0, y + h);
  glass.addColorStop(0, "#5f8194");
  glass.addColorStop(1, "#1f3442");
  g.fillStyle = glass;
  g.fillRect(x + 5, y + 5, w - 10, h - 10);
  g.fillStyle = "rgba(255,255,255,0.16)";
  g.beginPath();
  g.moveTo(x + 5, y + h - 5);
  g.lineTo(x + 5, y + 5);
  g.lineTo(x + w * 0.55, y + 5);
  g.fill();
  g.fillStyle = "#4b3a2c";
  g.fillRect(x + w / 2 - 2, y, 4, h);
  g.fillStyle = "rgba(20,20,20,0.55)";
  for (let bar = y + 14; bar < y + h - 6; bar += 12) g.fillRect(x + 5, bar, w - 10, 2);
  // Sill.
  g.fillStyle = "#cfcbc3";
  g.fillRect(x - 6, y + h, w + 12, 5);
}

/** Tiles of the facade atlas, left to right. Each is one bay (about 3.2 m) of one floor. */
export const FACADE_TILES = { window: 0, balcony: 1, door: 2, shop: 3 } as const;
/**
 * The atlas holds every tile twice: tile `t + FACADE_LIT` looks the same by day, but its glass
 * (or shop sign) glows after dark through `facadeGlowAtlas`. Picking one copy or the other per
 * bay and floor gives a random scatter of lit windows with no extra draw call.
 */
export const FACADE_LIT = 4;
export const FACADE_TILE_COUNT = 8;
/** Glass rectangles of each tile, in pixels of a 256 px tile: x, y, width, height. */
const GLASS: Record<number, readonly [number, number, number, number]> = {
  [FACADE_TILES.window]: [75, 75, 106, 110],
  [FACADE_TILES.balcony]: [91, 55, 74, 160],
  [FACADE_TILES.door]: [33, 75, 74, 100],
  // The shop's blank name board, lit like a sign.
  [FACADE_TILES.shop]: [14, 18, 228, 32],
};

/**
 * All wall variants in one texture, so every building in a chunk shares one material and one
 * draw call. Tiles sit side by side (U); V repeats once per floor. The background of every tile
 * is the same photographed plaster (`plasterPhoto`, tileable and neutral grey), so neighbouring
 * bays join without a seam and the building's own colour tints it.
 */
export function facadeAtlas(plasterPhoto: CanvasImageSource): THREE.CanvasTexture {
  const size = 256;
  const [element, g] = canvas(size * FACADE_TILE_COUNT, size);
  const tile = (index: number, seed: number, draw: () => void) => {
    g.save();
    g.translate(index * size, 0);
    g.beginPath();
    g.rect(0, 0, size, size);
    g.clip();
    plaster(g, size, plasterPhoto, seed);
    draw();
    g.restore();
  };
  const slab = () => {
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.fillRect(0, size - 12, size, 12);
    g.fillStyle = "rgba(255,255,255,0.25)";
    g.fillRect(0, size - 14, size, 2);
  };

  for (const lit of [0, FACADE_LIT]) {
    tile(lit + FACADE_TILES.window, 11, () => {
      slab();
      windowPane(g, 70, 70, 116, 120);
    });
    tile(lit + FACADE_TILES.balcony, 18, () => {
      slab();
      windowPane(g, 86, 50, 84, 170);
      g.fillStyle = "#d9d6d0";
      g.fillRect(40, 210, 176, 10);
      g.fillStyle = "rgba(40,40,40,0.75)";
      for (let x = 46; x < 214; x += 12) g.fillRect(x, 150, 3, 62);
      g.fillRect(40, 148, 176, 4);
      // Split AC outdoor unit.
      g.fillStyle = "#e9e9e6";
      g.fillRect(196, 84, 44, 30);
      g.fillStyle = "#9a9a96";
      g.beginPath();
      g.arc(218, 99, 10, 0, Math.PI * 2);
      g.fill();
    });
    tile(lit + FACADE_TILES.door, 31, () => {
      windowPane(g, 28, 70, 84, 110);
      g.fillStyle = "#3d2b1f";
      g.fillRect(146, 60, 78, 196);
      g.fillStyle = "#5a4130";
      g.fillRect(152, 66, 66, 86);
      g.fillRect(152, 160, 66, 90);
      g.fillStyle = "#c9a44a";
      g.fillRect(160, 156, 6, 12);
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(0, size - 18, size, 18); // plinth
    });
    tile(lit + FACADE_TILES.shop, 47, () => {
      g.fillStyle = "#6c7780";
      g.fillRect(14, 62, 228, 186);
      g.fillStyle = "rgba(0,0,0,0.22)";
      for (let y = 66; y < 246; y += 9) g.fillRect(14, y, 228, 3);
      g.fillStyle = "rgba(255,255,255,0.10)";
      for (let y = 70; y < 246; y += 9) g.fillRect(14, y, 228, 1);
      g.fillStyle = "#2b2f33";
      g.fillRect(14, 244, 228, 12);
      // Blank name board above the shutter (no business names).
      g.fillStyle = "#b9482f";
      g.fillRect(10, 14, 236, 40);
      g.strokeStyle = "rgba(255,255,255,0.7)";
      g.lineWidth = 2;
      g.strokeRect(14, 18, 228, 32);
    });
  }
  const texture = finish(element);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * Emissive partner of `facadeAtlas`: black except the glass of the "lit" tile copies, painted
 * as warm room light behind the grille and a half-drawn curtain. The walls material scales it
 * by how dark it is, so by day it adds nothing.
 */
export function facadeGlowAtlas(): THREE.CanvasTexture {
  const size = 256;
  const [element, g] = canvas(size * FACADE_TILE_COUNT, size);
  g.fillStyle = "#000";
  g.fillRect(0, 0, element.width, element.height);
  for (const [tile, rect] of Object.entries(GLASS)) {
    const [x, y, w, h] = rect;
    const left = (Number(tile) + FACADE_LIT) * size + x;
    const light = g.createLinearGradient(0, y, 0, y + h);
    const shop = Number(tile) === FACADE_TILES.shop;
    light.addColorStop(0, shop ? "#fff1c8" : "#ffd28a");
    light.addColorStop(1, shop ? "#ffe0a0" : "#e89a4a");
    g.fillStyle = light;
    g.fillRect(left, y, w, h);
    if (shop) continue;
    // Window grille and the frame's centre bar block some of the light.
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillRect(left + w / 2 - 4, y, 8, h);
    for (let bar = y + 9; bar < y + h - 1; bar += 12) g.fillRect(left, bar, w, 2);
    // A drawn curtain on one side.
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(left + w * 0.62, y, w * 0.38, h);
  }
  const texture = finish(element);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  return texture;
}

const ROOF_PLAIN_TEXELS = 4;
/**
 * The photographed clay tiles (`roof` surface) copied to a canvas with a small white square in
 * one corner: flat concrete roofs share the roof material and put all their UVs on that square
 * (`ROOF_PLAIN_UV`), so they show their vertex colour unchanged. On the tiled roofs the square
 * is 2 cm across, once per 2.4 m, too small to see.
 */
export function roofTileTexture(photo: HTMLImageElement): THREE.CanvasTexture {
  const size = photo.naturalWidth;
  const [element, g] = canvas(size, size);
  g.drawImage(photo, 0, 0);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, ROOF_PLAIN_TEXELS, ROOF_PLAIN_TEXELS);
  return finish(element);
}
/**
 * The middle of the white square, as a UV (the canvas's top row is v = 1). Valid for the
 * 512 px roof photo; constant UVs sample the full-size texture, so mipmaps don't blur it.
 */
export const ROOF_PLAIN_UV = [ROOF_PLAIN_TEXELS / 2 / 512, 1 - ROOF_PLAIN_TEXELS / 2 / 512] as const;

/** Soft cone of light on the road ahead of a car at night: bright near the lamps, fading out. */
export function headlightTexture(): THREE.CanvasTexture {
  const width = 64;
  const height = 128;
  const [element, g] = canvas(width, height);
  const image = g.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    // v = 0 at the lamps (bottom of the canvas), 1 at the far end.
    const v = 1 - y / (height - 1);
    const spread = 0.25 + 0.75 * v;
    for (let x = 0; x < width; x++) {
      const u = Math.abs((x + 0.5) / width - 0.5) * 2;
      const across = Math.max(0, 1 - (u / spread) ** 2);
      const along = Math.min(1, v * 6) * (1 - v) ** 1.4;
      const value = Math.round(255 * across * along);
      const i = (y * width + x) * 4;
      image.data[i] = value;
      image.data[i + 1] = Math.round(value * 0.93);
      image.data[i + 2] = Math.round(value * 0.78);
      image.data[i + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
