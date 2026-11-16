/**
 * Kolam patterns, drawn procedurally at start-up into one small atlas (1024 x 512, eight 256 px
 * cells). Original patterns in the traditional styles seen at Chennai doorsteps (no copied
 * designs): white rice-flour line kolams (sikku / interlaced loops round a dot grid, a lotus, a
 * looping rosette, a star, a dotted flower grid) and two coloured festival ones with filled
 * petals, like the bigger Margazhi kolams on temple streets. Each sits on a darker damp patch:
 * the ground is swept and sprinkled with water before the kolam is drawn. Lines are given a
 * powdery, broken edge so they read as flour on the ground rather than paint.
 */
import * as THREE from "three";
import { KOLAM_VARIANTS } from "@cow/game-world";

export const KOLAM_CELL = 256;
const COLUMNS = 4;
const ROWS = KOLAM_VARIANTS / COLUMNS;

/** Texture coordinates of a variant's cell: u0, v0, u1, v1 (v up, as three.js samples canvas textures). */
export function kolamUV(variant: number): readonly [number, number, number, number] {
  const col = variant % COLUMNS;
  const row = Math.floor(variant / COLUMNS);
  const inset = 2 / (KOLAM_CELL * COLUMNS);
  const u0 = col / COLUMNS + inset;
  const u1 = (col + 1) / COLUMNS - inset;
  // Canvas rows run down; with flipY the texture's v runs up.
  const v1 = 1 - row / ROWS - inset;
  const v0 = 1 - (row + 1) / ROWS + inset;
  return [u0, v0, u1, v1];
}

type Ctx = CanvasRenderingContext2D;
const FLOUR = "rgba(248, 246, 238, 1)";

function dots(ctx: Ctx, points: ReadonlyArray<readonly [number, number]>, r = 3.2): void {
  ctx.fillStyle = FLOUR;
  for (const [x, y] of points) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Sikku (interlaced) kolam on an n x n dot grid: diagonal lines run between the dots and turn
 * round the edge dots in loops, so one weave encloses every dot.
 */
function sikku(ctx: Ctx, n: number, spacing: number): void {
  const half = ((n - 1) * spacing) / 2;
  const at = (i: number, j: number): [number, number] => [i * spacing - half, j * spacing - half];
  ctx.beginPath();
  // Lines x - y = k + 0.5 and x + y = k + 0.5 (grid units), clipped to the square round the dots.
  for (const sign of [1, -1]) {
    for (let k = -n; k <= 2 * n; k++) {
      const c = k + 0.5;
      const pts: Array<[number, number]> = [];
      for (let t = -0.5; t <= n - 0.5 + 1e-6; t += 0.5) {
        const i = t;
        const j = sign > 0 ? i - c : c - i;
        if (j < -0.5 - 1e-6 || j > n - 0.5 + 1e-6) continue;
        pts.push(at(i, j));
      }
      if (pts.length < 2) continue;
      ctx.moveTo(pts[0]![0], pts[0]![1]);
      ctx.lineTo(pts[pts.length - 1]![0], pts[pts.length - 1]![1]);
    }
  }
  ctx.stroke();
  // Loops round the edge dots, closing the lines that meet at the border.
  ctx.beginPath();
  for (let j = 0; j < n; j++) {
    for (const [i, dir] of [[0, -1], [n - 1, 1]] as const) {
      const [x, y] = at(i, j);
      ctx.moveTo(x, y - spacing / 2);
      ctx.bezierCurveTo(x + dir * spacing * 0.75, y - spacing / 2, x + dir * spacing * 0.75, y + spacing / 2, x, y + spacing / 2);
    }
  }
  for (let i = 0; i < n; i++) {
    for (const [j, dir] of [[0, -1], [n - 1, 1]] as const) {
      const [x, y] = at(i, j);
      ctx.moveTo(x - spacing / 2, y);
      ctx.bezierCurveTo(x - spacing / 2, y + dir * spacing * 0.75, x + spacing / 2, y + dir * spacing * 0.75, x + spacing / 2, y);
    }
  }
  ctx.stroke();
  const grid: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) grid.push(at(i, j));
  dots(ctx, grid);
}

function lotus(ctx: Ctx, petals: number, inner: number, outer: number): void {
  ctx.beginPath();
  for (let k = 0; k < petals; k++) {
    const a = (k / petals) * Math.PI * 2;
    const w = Math.PI / petals;
    const p0 = [Math.cos(a - w) * inner, Math.sin(a - w) * inner];
    const p1 = [Math.cos(a + w) * inner, Math.sin(a + w) * inner];
    const tip = [Math.cos(a) * outer, Math.sin(a) * outer];
    const c0 = [Math.cos(a - w * 0.9) * outer * 0.85, Math.sin(a - w * 0.9) * outer * 0.85];
    const c1 = [Math.cos(a + w * 0.9) * outer * 0.85, Math.sin(a + w * 0.9) * outer * 0.85];
    ctx.moveTo(p0[0]!, p0[1]!);
    ctx.quadraticCurveTo(c0[0]!, c0[1]!, tip[0]!, tip[1]!);
    ctx.quadraticCurveTo(c1[0]!, c1[1]!, p1[0]!, p1[1]!);
  }
  ctx.moveTo(inner, 0);
  ctx.arc(0, 0, inner, 0, Math.PI * 2);
  ctx.stroke();
}

/** A continuous looping line (a hypotrochoid), like the free-hand looped kolams. */
function rosette(ctx: Ctx, R: number, r: number, d: number, scale: number): void {
  ctx.beginPath();
  const turns = r / gcd(R, r);
  for (let i = 0; i <= 720 * turns; i++) {
    const t = (i / 720) * Math.PI * 2;
    const x = ((R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t)) * scale;
    const y = ((R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t)) * scale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function star(ctx: Ctx, r: number): void {
  for (const turn of [0, Math.PI / 4]) {
    ctx.beginPath();
    for (let k = 0; k <= 4; k++) {
      const a = turn + (k / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  const tips: Array<[number, number]> = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    tips.push([Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82]);
    // A small loop beyond each point of the star.
    ctx.beginPath();
    ctx.arc(Math.cos(a + Math.PI / 8) * r * 1.05, Math.sin(a + Math.PI / 8) * r * 1.05, r * 0.12, 0, Math.PI * 2);
    ctx.stroke();
  }
  dots(ctx, tips);
  dots(ctx, [[0, 0]], 5);
}

/** A diamond of dots (rows 1-3-5-7-5-3-1), each with four small petals round it. */
function dottedFlowers(ctx: Ctx, spacing: number): void {
  const pts: Array<[number, number]> = [];
  for (let row = -3; row <= 3; row++) {
    const count = 7 - 2 * Math.abs(row);
    for (let k = 0; k < count; k++) pts.push([(k - (count - 1) / 2) * spacing, row * spacing]);
  }
  ctx.beginPath();
  for (const [x, y] of pts) {
    for (let q = 0; q < 4; q++) {
      const a = (q / 4) * Math.PI * 2 + Math.PI / 4;
      const px = x + Math.cos(a) * spacing * 0.32;
      const py = y + Math.sin(a) * spacing * 0.32;
      ctx.moveTo(px + spacing * 0.16, py);
      ctx.arc(px, py, spacing * 0.16, 0, Math.PI * 2);
    }
  }
  // The diamond's outline with a loop at each corner.
  const e = spacing * 3.6;
  ctx.moveTo(0, -e);
  ctx.lineTo(e, 0);
  ctx.lineTo(0, e);
  ctx.lineTo(-e, 0);
  ctx.closePath();
  ctx.stroke();
  dots(ctx, pts, 2.6);
}

/** Filled petals in powder colours with white outlines (coloured festival kolam). */
function rangoliRing(ctx: Ctx, petals: number, inner: number, outer: number, fill: string, turn = 0): void {
  for (let k = 0; k < petals; k++) {
    const a = turn + (k / petals) * Math.PI * 2;
    const w = Math.PI / petals;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - w) * inner, Math.sin(a - w) * inner);
    ctx.quadraticCurveTo(Math.cos(a - w * 0.8) * outer * 0.9, Math.sin(a - w * 0.8) * outer * 0.9, Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.quadraticCurveTo(Math.cos(a + w * 0.8) * outer * 0.9, Math.sin(a + w * 0.8) * outer * 0.9, Math.cos(a + w) * inner, Math.sin(a + w) * inner);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  }
}

function disc(ctx: Ctx, r: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
}

const PATTERNS: ReadonlyArray<(ctx: Ctx) => void> = [
  (ctx) => sikku(ctx, 5, 40),
  (ctx) => {
    ctx.rotate(Math.PI / 4);
    sikku(ctx, 4, 44);
  },
  (ctx) => {
    lotus(ctx, 8, 30, 92);
    lotus(ctx, 8, 14, 44);
    const ring: Array<[number, number]> = [];
    for (let k = 0; k < 16; k++) ring.push([Math.cos((k / 16) * Math.PI * 2 + Math.PI / 16) * 104, Math.sin((k / 16) * Math.PI * 2 + Math.PI / 16) * 104]);
    dots(ctx, ring);
  },
  (ctx) => {
    rosette(ctx, 8, 3, 5, 11);
    dots(ctx, [[0, 0]], 5);
  },
  (ctx) => star(ctx, 96),
  (ctx) => dottedFlowers(ctx, 31),
  // Coloured: marigold, magenta and green petals round a yellow heart.
  (ctx) => {
    rangoliRing(ctx, 12, 62, 112, "#c2185b");
    rangoliRing(ctx, 8, 30, 78, "#ef7d0b", Math.PI / 8);
    disc(ctx, 32, "#f2c230");
    disc(ctx, 14, "#2e7d32");
  },
  // Coloured: a square of four coloured quarters inside a petal border.
  (ctx) => {
    const quarters = ["#c62828", "#2e7d32", "#f2c230", "#1e5aa8"];
    for (let q = 0; q < 4; q++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 70, (q / 4) * Math.PI * 2, ((q + 1) / 4) * Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = quarters[q]!;
      ctx.fill();
      ctx.stroke();
    }
    rangoliRing(ctx, 16, 72, 112, "#ef7d0b");
    disc(ctx, 22, "#f6f2e6");
    lotus(ctx, 8, 8, 22);
  },
];

/** A darker damp patch: the swept, water-sprinkled ground under the kolam. */
function dampPatch(ctx: Ctx): void {
  const gradient = ctx.createRadialGradient(0, 0, 40, 0, 0, 126);
  gradient.addColorStop(0, "rgba(58, 50, 42, 0.42)");
  gradient.addColorStop(0.75, "rgba(58, 50, 42, 0.3)");
  gradient.addColorStop(1, "rgba(58, 50, 42, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(-128, -128, 256, 256);
}

/** Rice flour on rough ground: grainy, thinner in places, with small gaps. */
function powder(ctx: Ctx, width: number, height: number): void {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  let seed = 12345;
  const random = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < data.length; i += 4) {
    const bright = data[i]! > 200 && data[i + 1]! > 200;
    if (!bright) continue;
    const r = random();
    data[i + 3] = Math.round(data[i + 3]! * (r < 0.07 ? 0.25 : 0.72 + 0.28 * random()));
  }
  ctx.putImageData(image, 0, 0);
}

let atlas: THREE.CanvasTexture | null = null;

/** The kolam atlas (created once, shared by every chunk). */
export function kolamAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const canvas = document.createElement("canvas");
  canvas.width = KOLAM_CELL * COLUMNS;
  canvas.height = KOLAM_CELL * ROWS;
  const ctx = canvas.getContext("2d")!;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  PATTERNS.forEach((draw, variant) => {
    ctx.save();
    ctx.translate((variant % COLUMNS) * KOLAM_CELL + KOLAM_CELL / 2, Math.floor(variant / COLUMNS) * KOLAM_CELL + KOLAM_CELL / 2);
    if (variant < 6) dampPatch(ctx);
    ctx.strokeStyle = FLOUR;
    ctx.lineWidth = variant < 6 ? 4.2 : 3.2;
    draw(ctx);
    ctx.restore();
  });
  powder(ctx, canvas.width, canvas.height);
  atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}
