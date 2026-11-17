/**
 * The railway as drawn: ballast, sleepers and rails along every track, and platforms with
 * station name boards, built in 250 m cells and only near the player.
 *
 * Each cell is at most two draw calls: one merged mesh with vertex colours for ballast,
 * sleepers, rails and platforms, and one for the name boards (a shared atlas texture). Sleepers
 * are drawn only in cells close to the player. The look is estimated (OSM maps where tracks
 * run, not what they look like): grey ballast, concrete sleepers, platforms 0.9 m high with a
 * yellow safety edge and a short shelter, and an invented board design (blue with white
 * English and Tamil names and a yellow rule), not the real railway's signage.
 */
import * as THREE from "three";
import { PLATFORM_EDGE, PLATFORM_HEIGHT, PLATFORM_LENGTH, RailPath, platformOffset, type RailFile, type RailLineData, type RailStopData } from "@cow/rail";
import { MeshBuilder } from "./MeshBuilder";

export const RAIL_CELL = 250;
/** Height of the top of the rails above the ground (trains' wheels sit here). */
export const RAIL_TOP = 0.36;
const BALLAST_TOP = 0.16;
const GAUGE = 1.676; // Indian broad gauge, metres between rails
const SLEEPER_SPACING = 0.9; // estimated (real spacing is about 0.6 m; wider costs fewer triangles)
const PIECE = 20; // track is cut into pieces of at most this length before it is filed by cell
/** Name-board atlas: one row per station. */
const BOARD_W = 512;
const BOARD_H = 128;
/** Font family the station-name font is registered under (`loadStationFont`). */
export const STATION_FONT = "CowStationTamil";

const color = new THREE.Color();

function rgb(hex: number, shade = 1): [number, number, number] {
  color.setHex(hex);
  return [color.r * shade, color.g * shade, color.b * shade];
}

/** A box turned to `yaw` round its centre (cx, cz), from y0 to y1, with vertex colour. */
export function orientedBox(b: MeshBuilder, cx: number, cz: number, yaw: number, halfLength: number, halfWidth: number, y0: number, y1: number, hex: number, faces: "all" | "top-sides" = "all"): void {
  // Local +z runs along the length (backwards from yaw's forward), +x across.
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = -fz;
  const rz = fx;
  const at = (u: number, w: number): [number, number] => [cx + fx * u + rx * w, cz + fz * u + rz * w];
  const corners = [at(-halfLength, -halfWidth), at(-halfLength, halfWidth), at(halfLength, halfWidth), at(halfLength, -halfWidth)];
  const [r, g, bl] = rgb(hex);
  const quad = (pts: Array<[number, number, number]>, nx: number, ny: number, nz: number, shade: number) => {
    const ids = pts.map(([x, y, z]) => b.vertex(x, y, z, nx, ny, nz, 0.5, 0.5, r * shade, g * shade, bl * shade));
    b.quad(ids[0]!, ids[1]!, ids[2]!, ids[3]!);
  };
  const [c0, c1, c2, c3] = corners as [[number, number], [number, number], [number, number], [number, number]];
  quad([[c0[0], y1, c0[1]], [c1[0], y1, c1[1]], [c2[0], y1, c2[1]], [c3[0], y1, c3[1]]], 0, 1, 0, 1);
  const side = (a: [number, number], c: [number, number], shade: number) => {
    const nx = c[1] - a[1];
    const nz = -(c[0] - a[0]);
    const n = Math.hypot(nx, nz) || 1;
    quad([[a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], y1, c[1]], [a[0], y1, a[1]]], -nx / n, 0, -nz / n, shade);
  };
  side(c0, c3, 0.85);
  side(c2, c1, 0.85);
  if (faces === "all") {
    side(c3, c2, 0.92);
    side(c1, c0, 0.92);
  }
}

/** A strip along a run of points: cross-section from `left` to `right` (metres from the centre line), at height y0 (edges) to y1 (top). */
function strip(b: MeshBuilder, points: ReadonlyArray<{ x: number; z: number }>, half: number, top: number, y0: number, y1: number, hex: number): void {
  const [r, g, bl] = rgb(hex);
  let prev: number[] | null = null;
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)]!;
    const c = points[Math.min(points.length - 1, i + 1)]!;
    const dx = c.x - a.x;
    const dz = c.z - a.z;
    const n = Math.hypot(dx, dz) || 1;
    // Left of the direction (dz, -dx).
    const lx = dz / n;
    const lz = -dx / n;
    const p = points[i]!;
    const ids = [
      b.vertex(p.x + lx * half, y0, p.z + lz * half, lx, 0.6, lz, 0.5, 0.5, r * 0.8, g * 0.8, bl * 0.8),
      b.vertex(p.x + lx * top, y1, p.z + lz * top, 0, 1, 0, 0.5, 0.5, r, g, bl),
      b.vertex(p.x - lx * top, y1, p.z - lz * top, 0, 1, 0, 0.5, 0.5, r, g, bl),
      b.vertex(p.x - lx * half, y0, p.z - lz * half, -lx, 0.6, -lz, 0.5, 0.5, r * 0.8, g * 0.8, bl * 0.8),
    ];
    if (prev) {
      // Wound so the faces look up and out (counter-clockwise from above for +Z south).
      b.quad(prev[0]!, ids[0]!, ids[1]!, prev[1]!);
      b.quad(prev[1]!, ids[1]!, ids[2]!, prev[2]!);
      b.quad(prev[2]!, ids[2]!, ids[3]!, prev[3]!);
    }
    prev = ids;
  }
}

interface TrackPiece {
  readonly points: Array<{ x: number; z: number }>;
  /** Distance along the whole track of the piece's first point (keeps sleepers evenly spaced). */
  readonly s0: number;
  readonly kind: "main" | "service";
}

interface PlatformPiece {
  readonly line: RailLineData;
  readonly path: RailPath;
  readonly stop: RailStopData;
  /** Row of the station in the board atlas. */
  readonly row: number;
}

interface Cell {
  readonly key: string;
  readonly x: number;
  readonly z: number;
  readonly tracks: TrackPiece[];
  readonly platforms: PlatformPiece[];
  view: { group: THREE.Group; detailed: boolean } | null;
}

/** Cut a track into pieces of at most PIECE metres, each filed under the cell of its middle. */
function pieces(points: ReadonlyArray<{ x: number; z: number }>, kind: "main" | "service"): TrackPiece[] {
  const dense: Array<{ x: number; z: number; s: number }> = [];
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (i > 0) {
      const a = points[i - 1]!;
      const length = Math.hypot(p.x - a.x, p.z - a.z);
      const steps = Math.max(1, Math.ceil(length / PIECE));
      for (let k = 1; k <= steps; k++) dense.push({ x: a.x + ((p.x - a.x) * k) / steps, z: a.z + ((p.z - a.z) * k) / steps, s: s + (length * k) / steps });
      s += length;
    } else dense.push({ ...p, s: 0 });
  }
  const out: TrackPiece[] = [];
  for (let i = 0; i + 1 < dense.length; i++) out.push({ points: [dense[i]!, dense[i + 1]!], s0: dense[i]!.s, kind });
  return out;
}

function cellKey(x: number, z: number): string {
  return `${Math.floor(x / RAIL_CELL)},${Math.floor(z / RAIL_CELL)}`;
}

/** Draws the station names into one canvas (null where there is no DOM, as in unit tests). */
function boardAtlas(names: ReadonlyArray<{ name: string; nameTa: string }>, tamilFont: boolean): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = BOARD_W;
  canvas.height = BOARD_H * Math.max(1, names.length);
  const g = canvas.getContext("2d");
  if (!g) return null;
  names.forEach(({ name, nameTa }, row) => {
    const y = row * BOARD_H;
    g.fillStyle = "#1d3c78";
    g.fillRect(0, y, BOARD_W, BOARD_H);
    g.fillStyle = "#f2c230";
    g.fillRect(0, y + BOARD_H / 2 - 3, BOARD_W, 6);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 6;
    g.strokeRect(3, y + 3, BOARD_W - 6, BOARD_H - 6);
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const fit = (text: string, font: string, size: number, cy: number) => {
      let px = size;
      g.font = `700 ${px}px ${font}`;
      while (px > 14 && g.measureText(text).width > BOARD_W - 30) {
        px -= 2;
        g.font = `700 ${px}px ${font}`;
      }
      g.fillText(text, BOARD_W / 2, cy);
    };
    if (tamilFont && nameTa) fit(nameTa, `"${STATION_FONT}"`, 40, y + BOARD_H * 0.27);
    fit(name.toUpperCase(), "system-ui,sans-serif", 40, y + (tamilFont && nameTa ? BOARD_H * 0.75 : BOARD_H / 2));
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Registers the station-name font (a subset of Noto Sans Tamil Bold). Resolves false if it cannot load. */
export async function loadStationFont(url: string): Promise<boolean> {
  try {
    if (typeof FontFace === "undefined" || typeof document === "undefined") return false;
    const face = new FontFace(STATION_FONT, `url(${url})`, { weight: "700" });
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Station font timed out")), 4000));
    await Promise.race([face.load(), timeout]);
    document.fonts.add(face);
    return true;
  } catch (error) {
    console.warn("Tamil station font unavailable; boards are drawn in English only.", error);
    return false;
  }
}

export interface RailViewOptions {
  /** Cells whose centre is within this distance are drawn. */
  readonly drawDistance: number;
  /** Sleepers are drawn only in cells within this distance. */
  readonly detailDistance: number;
  /** Draw Tamil names (the station font loaded). */
  readonly tamil: boolean;
}

export class RailView {
  readonly object = new THREE.Group();
  private readonly cells = new Map<string, Cell>();
  private readonly material: THREE.MeshStandardMaterial;
  private readonly boardMaterial: THREE.MeshStandardMaterial | null;
  private readonly rows = new Map<string, number>();
  private readonly atlasRows: number;

  constructor(file: RailFile, private readonly options: RailViewOptions) {
    this.object.name = "railway";
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    const names = file.stations.map((s) => ({ name: s.name, nameTa: s.nameTa }));
    file.stations.forEach((s, i) => this.rows.set(s.id, i));
    this.atlasRows = Math.max(1, names.length);
    const atlas = boardAtlas(names, options.tamil);
    this.boardMaterial = atlas ? new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.6, side: THREE.DoubleSide }) : null;

    const cell = (x: number, z: number): Cell => {
      const key = cellKey(x, z);
      let c = this.cells.get(key);
      if (!c) {
        const [col, row] = key.split(",").map(Number) as [number, number];
        c = { key, x: (col + 0.5) * RAIL_CELL, z: (row + 0.5) * RAIL_CELL, tracks: [], platforms: [], view: null };
        this.cells.set(key, c);
      }
      return c;
    };
    for (const track of file.tracks) {
      const points: Array<{ x: number; z: number }> = [];
      for (let i = 0; i + 1 < track.points.length; i += 2) points.push({ x: track.points[i]!, z: track.points[i + 1]! });
      for (const piece of pieces(points, track.kind)) {
        const a = piece.points[0]!;
        const b = piece.points[1]!;
        cell((a.x + b.x) / 2, (a.z + b.z) / 2).tracks.push(piece);
      }
    }
    for (const line of file.lines) {
      const path = RailPath.fromFlat(line.points);
      for (const stop of line.stops) {
        // An island platform is drawn once, for the first direction's stop.
        if (stop.twin) continue;
        const centre = path.beside(stop.s, stop.side * platformOffset(stop));
        cell(centre.x, centre.z).platforms.push({ line, path, stop, row: this.rows.get(stop.id) ?? 0 });
      }
    }
  }

  /** Cells drawn now (for tests and the debug snapshot). */
  get drawnCells(): number {
    let n = 0;
    for (const c of this.cells.values()) if (c.view) n++;
    return n;
  }

  /** Build the cells near (x, z) and free the ones left behind. At most `budget` cells are built per call. */
  update(x: number, z: number, budget = 2): void {
    let built = 0;
    for (const c of this.cells.values()) {
      const d = Math.hypot(c.x - x, c.z - z);
      const wanted = d <= this.options.drawDistance;
      const detailed = d <= this.options.detailDistance;
      if (c.view && (!wanted || c.view.detailed !== detailed)) {
        if (!wanted || built < budget) {
          this.free(c);
          if (wanted) {
            this.build(c, detailed);
            built++;
          }
        }
        continue;
      }
      if (!c.view && wanted && built < budget) {
        this.build(c, detailed);
        built++;
      }
    }
  }

  private build(c: Cell, detailed: boolean): void {
    const group = new THREE.Group();
    const b = new MeshBuilder();
    for (const piece of c.tracks) this.track(b, piece, detailed);
    const boards = new MeshBuilder();
    for (const p of c.platforms) this.platform(b, boards, p);
    const geometry = b.build();
    if (geometry) {
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    const boardGeometry = this.boardMaterial ? boards.build() : null;
    if (boardGeometry && this.boardMaterial) {
      const mesh = new THREE.Mesh(boardGeometry, this.boardMaterial);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    group.matrixAutoUpdate = false;
    this.object.add(group);
    c.view = { group, detailed };
  }

  private free(c: Cell): void {
    if (!c.view) return;
    this.object.remove(c.view.group);
    for (const child of c.view.group.children) if (child instanceof THREE.Mesh) child.geometry.dispose();
    c.view = null;
  }

  private track(b: MeshBuilder, piece: TrackPiece, detailed: boolean): void {
    const [a, c] = piece.points as [{ x: number; z: number }, { x: number; z: number }];
    const service = piece.kind === "service";
    // Ballast bed: brown-grey stone, a little darker on sidings.
    strip(b, piece.points, 1.9, 1.35, -0.04, BALLAST_TOP, service ? 0x6f6658 : 0x847b70);
    const dx = c.x - a.x;
    const dz = c.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.01) return;
    const yaw = Math.atan2(-dx, -dz);
    if (detailed) {
      const first = Math.ceil(piece.s0 / SLEEPER_SPACING) * SLEEPER_SPACING - piece.s0;
      for (let u = first; u < length; u += SLEEPER_SPACING) {
        const t = u / length;
        orientedBox(b, a.x + dx * t, a.z + dz * t, yaw + Math.PI / 2, 1.3, 0.13, BALLAST_TOP, BALLAST_TOP + 0.06, 0x9a968e, "top-sides");
      }
    }
    // Two rails, steel grey; each a thin box along the piece.
    const rx = -dz / length;
    const rz = dx / length;
    for (const side of [-1, 1]) {
      const ox = rx * side * (GAUGE / 2);
      const oz = rz * side * (GAUGE / 2);
      orientedBox(b, (a.x + c.x) / 2 + ox, (a.z + c.z) / 2 + oz, yaw, length / 2 + 0.02, 0.04, BALLAST_TOP + 0.04, RAIL_TOP, 0x5d5953, "top-sides");
    }
  }

  private platform(b: MeshBuilder, boards: MeshBuilder, p: PlatformPiece): void {
    const { path, stop } = p;
    const pose = path.at(stop.s);
    const width = stop.width;
    const across = stop.side * platformOffset(stop);
    const centre = path.beside(stop.s, across);
    const half = PLATFORM_LENGTH / 2;
    // Concrete deck, then the yellow safety line along the track edge.
    orientedBox(b, centre.x, centre.z, pose.yaw, half, width / 2, -0.05, PLATFORM_HEIGHT, 0xb7b0a3);
    if (width > 6) {
      // An island platform: a safety line along the other track's edge too.
      const far = path.beside(stop.s, stop.side * (PLATFORM_EDGE + width - 0.25));
      orientedBox(b, far.x, far.z, pose.yaw, half, 0.22, PLATFORM_HEIGHT - 0.02, PLATFORM_HEIGHT + 0.01, 0xe8c12c, "top-sides");
    }
    const edge = path.beside(stop.s, stop.side * (PLATFORM_EDGE + 0.25));
    orientedBox(b, edge.x, edge.z, pose.yaw, half, 0.22, PLATFORM_HEIGHT - 0.02, PLATFORM_HEIGHT + 0.01, 0xe8c12c, "top-sides");
    // Steps down at both ends (three 0.3 m steps; the player climbs 0.35 m at a time).
    for (const end of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const along = stop.s + end * (half + 0.4 + k * 0.8);
        const step = path.beside(along, across);
        orientedBox(b, step.x, step.z, pose.yaw, 0.4, width / 2, -0.05, PLATFORM_HEIGHT - 0.3 * (k + 1), 0xa9a296);
      }
    }
    // A short shelter in the middle: posts on the far side, a sloping-looking flat roof.
    const roofCentre = path.beside(stop.s, across);
    for (const u of [-16, -8, 0, 8, 16]) {
      // On an island the posts stand down the middle; on a side platform at its back.
      const post = path.beside(stop.s + u, width > 6 ? across : stop.side * (PLATFORM_EDGE + width - 0.6));
      orientedBox(b, post.x, post.z, pose.yaw, 0.1, 0.1, PLATFORM_HEIGHT, PLATFORM_HEIGHT + 3.2, 0x4a6b5c);
    }
    orientedBox(b, roofCentre.x, roofCentre.z, pose.yaw, 18, width / 2 + 0.3, PLATFORM_HEIGHT + 3.2, PLATFORM_HEIGHT + 3.35, 0x6b8a7a);
    // Name boards on two posts, near each end, facing the track.
    for (const u of [-34, 34]) {
      const at = path.beside(stop.s + u, across);
      for (const w of [-1.1, 1.1]) {
        const leg = path.beside(stop.s + u + w, across);
        orientedBox(b, leg.x, leg.z, pose.yaw, 0.05, 0.05, PLATFORM_HEIGHT, PLATFORM_HEIGHT + 2.6, 0x30343a);
      }
      this.board(boards, at.x, at.z, pose.yaw, PLATFORM_HEIGHT + 1.9, p.row);
    }
  }

  /** A board 2.6 m × 0.65 m along the track at (x, z), its face showing the station's atlas row. */
  private board(b: MeshBuilder, x: number, z: number, yaw: number, y: number, row: number): void {
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const w = 1.3;
    const h = 0.65;
    const v0 = 1 - ((row + 1) * BOARD_H) / (BOARD_H * this.atlasRows);
    const v1 = 1 - (row * BOARD_H) / (BOARD_H * this.atlasRows);
    const nx = -fz;
    const nz = fx;
    // Readable from both faces: two quads back to back, each with the text the right way round.
    for (const facing of [1, -1]) {
      const ids = [
        b.vertex(x - fx * w * facing + nx * 0.02 * facing, y - h / 2, z - fz * w * facing + nz * 0.02 * facing, nx * facing, 0, nz * facing, 0, v0),
        b.vertex(x + fx * w * facing + nx * 0.02 * facing, y - h / 2, z + fz * w * facing + nz * 0.02 * facing, nx * facing, 0, nz * facing, 1, v0),
        b.vertex(x + fx * w * facing + nx * 0.02 * facing, y + h / 2, z + fz * w * facing + nz * 0.02 * facing, nx * facing, 0, nz * facing, 1, v1),
        b.vertex(x - fx * w * facing + nx * 0.02 * facing, y + h / 2, z - fz * w * facing + nz * 0.02 * facing, nx * facing, 0, nz * facing, 0, v1),
      ];
      b.quad(ids[0]!, ids[1]!, ids[2]!, ids[3]!);
    }
  }

  dispose(): void {
    for (const c of this.cells.values()) this.free(c);
    this.material.dispose();
    this.boardMaterial?.map?.dispose();
    this.boardMaterial?.dispose();
  }
}
