/**
 * Textures painted on a canvas at start-up. They cost no download and stand in for
 * photographed materials until an art pass replaces them.
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

/** Speckle a surface with light and dark grains. */
function grain(g: CanvasRenderingContext2D, size: number, count: number, strength: number, seed: number): void {
  const random = noise(seed);
  for (let i = 0; i < count; i++) {
    const shade = random() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${shade},${shade},${shade},${random() * strength})`;
    const s = 1 + random() * 2;
    g.fillRect(random() * size, random() * size, s, s);
  }
}

/** Weathered plaster: soft blotches and rain streaks. Drawn in greys so vertex colour tints it. */
function plaster(g: CanvasRenderingContext2D, size: number, seed: number): void {
  g.fillStyle = "#f4f4f2";
  g.fillRect(0, 0, size, size);
  const random = noise(seed);
  for (let i = 0; i < 26; i++) {
    const x = random() * size;
    const y = random() * size;
    const r = 14 + random() * 40;
    const blotch = g.createRadialGradient(x, y, 0, x, y, r);
    blotch.addColorStop(0, `rgba(90,80,70,${0.03 + random() * 0.05})`);
    blotch.addColorStop(1, "rgba(90,80,70,0)");
    g.fillStyle = blotch;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 10; i++) {
    const x = random() * size;
    const streak = g.createLinearGradient(0, 0, 0, size * (0.3 + random() * 0.5));
    streak.addColorStop(0, "rgba(60,55,50,0.10)");
    streak.addColorStop(1, "rgba(60,55,50,0)");
    g.fillStyle = streak;
    g.fillRect(x, 0, 2 + random() * 5, size);
  }
  grain(g, size, 900, 0.05, seed + 1);
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
export const FACADE_TILE_COUNT = 4;

/**
 * All wall variants in one texture, so every building in a chunk shares one material and one
 * draw call. Tiles sit side by side (U); V repeats once per floor. Drawn in near-white so the
 * building's own colour tints it.
 */
export function facadeAtlas(): THREE.CanvasTexture {
  const size = 256;
  const [element, g] = canvas(size * FACADE_TILE_COUNT, size);
  const tile = (index: number, seed: number, draw: () => void) => {
    g.save();
    g.translate(index * size, 0);
    g.beginPath();
    g.rect(0, 0, size, size);
    g.clip();
    plaster(g, size, seed);
    draw();
    g.restore();
  };
  const slab = () => {
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.fillRect(0, size - 12, size, 12);
    g.fillStyle = "rgba(255,255,255,0.25)";
    g.fillRect(0, size - 14, size, 2);
  };

  tile(FACADE_TILES.window, 11, () => {
    slab();
    windowPane(g, 70, 70, 116, 120);
  });
  tile(FACADE_TILES.balcony, 18, () => {
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
  tile(FACADE_TILES.door, 31, () => {
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
  tile(FACADE_TILES.shop, 47, () => {
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
  const texture = finish(element);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  return texture;
}

export function asphaltTexture(): THREE.CanvasTexture {
  const size = 256;
  const [element, g] = canvas(size, size);
  g.fillStyle = "#4a4c52";
  g.fillRect(0, 0, size, size);
  grain(g, size, 5000, 0.12, 5);
  const random = noise(9);
  // Patches and cracks.
  for (let i = 0; i < 5; i++) {
    g.fillStyle = `rgba(20,20,22,${0.08 + random() * 0.08})`;
    g.fillRect(random() * size, random() * size, 20 + random() * 50, 14 + random() * 40);
  }
  g.strokeStyle = "rgba(15,15,15,0.35)";
  g.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    let x = random() * size;
    let y = random() * size;
    g.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (random() - 0.5) * 40;
      y += (random() - 0.5) * 40;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return finish(element);
}

/** Interlocking paver blocks for footpaths. */
export function pavingTexture(): THREE.CanvasTexture {
  const size = 128;
  const [element, g] = canvas(size, size);
  g.fillStyle = "#b9b2a6";
  g.fillRect(0, 0, size, size);
  g.strokeStyle = "rgba(70,65,58,0.5)";
  g.lineWidth = 1.5;
  for (let y = 0; y <= size; y += 16) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(size, y);
    g.stroke();
    for (let x = (y / 16) % 2 === 0 ? 0 : 16; x <= size; x += 32) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + 16);
      g.stroke();
    }
  }
  grain(g, size, 900, 0.1, 21);
  return finish(element);
}

export function earthTexture(): THREE.CanvasTexture {
  const size = 256;
  const [element, g] = canvas(size, size);
  g.fillStyle = "#b9a37c";
  g.fillRect(0, 0, size, size);
  const random = noise(77);
  for (let i = 0; i < 40; i++) {
    const x = random() * size;
    const y = random() * size;
    const r = 10 + random() * 36;
    const blotch = g.createRadialGradient(x, y, 0, x, y, r);
    blotch.addColorStop(0, random() < 0.5 ? "rgba(120,100,70,0.22)" : "rgba(215,200,165,0.22)");
    blotch.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = blotch;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  grain(g, size, 3500, 0.1, 78);
  return finish(element);
}

export function grassTexture(): THREE.CanvasTexture {
  const size = 256;
  const [element, g] = canvas(size, size);
  g.fillStyle = "#5f9a4e";
  g.fillRect(0, 0, size, size);
  const random = noise(101);
  for (let i = 0; i < 2600; i++) {
    g.strokeStyle = random() < 0.5 ? `rgba(40,90,35,${0.25 + random() * 0.3})` : `rgba(150,195,105,${0.2 + random() * 0.3})`;
    const x = random() * size;
    const y = random() * size;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (random() - 0.5) * 3, y - 2 - random() * 4);
    g.stroke();
  }
  return finish(element);
}
