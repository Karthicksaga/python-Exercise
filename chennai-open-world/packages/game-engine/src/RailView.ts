/**
 * The railway as drawn: ballast, sleepers and rails along every track, overhead electric wires
 * on masts along the running lines, and the stations (`StationKit`), built in 250 m cells and
 * only near the player.
 *
 * Each cell is at most two draw calls: one merged mesh with vertex colours for the track, wires
 * and stations, and one for the boards and signs (a shared atlas texture). Sleepers and the
 * stations' small parts are drawn only in cells close to the player. The look is estimated (OSM
 * maps where tracks run, not what they look like): grey ballast, concrete sleepers, overhead
 * wires on masts, platforms 0.9 m high, and invented board designs in the style of Chennai's
 * yellow three-language name boards, not the real railway's signage.
 */
import * as THREE from "three";
import { RailNetwork, RailPath, stationPlatforms, type RailFile, type StationPlatform } from "@cow/rail";
import { MeshBuilder } from "./MeshBuilder";
import { buildStation, type AtlasRows } from "./StationKit";

export const RAIL_CELL = 250;
/** Height of the top of the rails above the ground (trains' wheels sit here). */
export const RAIL_TOP = 0.36;
const BALLAST_TOP = 0.16;
const GAUGE = 1.676; // Indian broad gauge, metres between rails
const SLEEPER_SPACING = 0.9; // estimated (real spacing is about 0.6 m; wider costs fewer triangles)
const PIECE = 20; // track is cut into pieces of at most this length before it is filed by cell
/** Board atlas: one row per station, then the shared signs. */
const BOARD_W = 512;
const BOARD_H = 192;
/** Font families the station-name fonts are registered under (`loadStationFont`). */
export const STATION_FONT = "CowStationTamil";
export const STATION_FONT_HI = "CowStationHindi";

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


interface Cell {
  readonly key: string;
  readonly x: number;
  readonly z: number;
  readonly tracks: TrackPiece[];
  readonly platforms: StationPlatform[];
  readonly masts: Mast[];
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

/** Draws the station boards and shared signs into one canvas (null where there is no DOM, as in unit tests). */
function stationAtlas(names: ReadonlyArray<{ id: string; name: string; nameTa: string; nameHi?: string }>, fonts: { tamil: boolean; hindi: boolean }): { texture: THREE.CanvasTexture; rows: AtlasRows } | null {
  if (typeof document === "undefined") return null;
  const extra = ["pf1", "pf2", "clock", "office", "tea", "exit"] as const;
  const count = names.length + extra.length;
  const canvas = document.createElement("canvas");
  canvas.width = BOARD_W;
  canvas.height = BOARD_H * count;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const fit = (text: string, font: string, size: number, cx: number, cy: number, width: number) => {
    let px = size;
    g.font = `700 ${px}px ${font}`;
    while (px > 12 && g.measureText(text).width > width) {
      px -= 2;
      g.font = `700 ${px}px ${font}`;
    }
    g.fillText(text, cx, cy);
  };
  const sans = "system-ui,sans-serif";
  // Station name boards: yellow with black lettering, Tamil above Hindi above English (as in Chennai).
  names.forEach(({ name, nameTa, nameHi }, row) => {
    const y = row * BOARD_H;
    g.fillStyle = "#f1c40f";
    g.fillRect(0, y, BOARD_W, BOARD_H);
    g.strokeStyle = "#151515";
    g.lineWidth = 8;
    g.strokeRect(4, y + 4, BOARD_W - 8, BOARD_H - 8);
    g.fillStyle = "#111111";
    const lines: Array<[string, string]> = [];
    if (fonts.tamil && nameTa) lines.push([nameTa, `"${STATION_FONT}"`]);
    if (fonts.hindi && nameHi) lines.push([nameHi, `"${STATION_FONT_HI}"`]);
    lines.push([name.toUpperCase(), sans]);
    const band = (BOARD_H - 20) / lines.length;
    lines.forEach(([text, font], i) => fit(text, font, Math.min(52, band * 0.8), BOARD_W / 2, y + 10 + band * (i + 0.5), BOARD_W - 36));
  });
  const rowOf = (k: (typeof extra)[number]) => names.length + extra.indexOf(k);
  // Platform numbers: a white figure on blue in the left square of the row (the board uses that part).
  for (const n of [1, 2]) {
    const y = rowOf(n === 1 ? "pf1" : "pf2") * BOARD_H;
    g.fillStyle = "#1f3f8f";
    g.fillRect(0, y, BOARD_H, BOARD_H);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 6;
    g.strokeRect(6, y + 6, BOARD_H - 12, BOARD_H - 12);
    g.fillStyle = "#ffffff";
    fit("PLATFORM", sans, 22, BOARD_H / 2, y + 34, BOARD_H - 24);
    fit(String(n), sans, 110, BOARD_H / 2, y + 118, BOARD_H - 24);
  }
  {
    // A clock face (the hands are drawn live, `StationLife`).
    const y = rowOf("clock") * BOARD_H;
    const r = BOARD_H / 2;
    g.fillStyle = "#2a2a2a";
    g.fillRect(0, y, BOARD_H, BOARD_H);
    g.fillStyle = "#fbfaf4";
    g.beginPath();
    g.arc(r, y + r, r - 8, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#202020";
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      g.lineWidth = k % 3 === 0 ? 8 : 4;
      g.beginPath();
      g.moveTo(r + Math.sin(a) * (r - 14), y + r - Math.cos(a) * (r - 14));
      g.lineTo(r + Math.sin(a) * (r - 34), y + r - Math.cos(a) * (r - 34));
      g.stroke();
    }
  }
  const sign = (k: (typeof extra)[number], bg: string, fg: string, text: string) => {
    const y = rowOf(k) * BOARD_H;
    g.fillStyle = bg;
    g.fillRect(0, y, BOARD_W, BOARD_H);
    g.fillStyle = fg;
    fit(text, sans, 96, BOARD_W / 2, y + BOARD_H / 2, BOARD_W - 40);
  };
  sign("office", "#1f3f8f", "#ffffff", "BOOKING OFFICE");
  sign("tea", "#f6e7c1", "#7a1f12", "TEA · COFFEE · SNACKS");
  sign("exit", "#1d6b3a", "#ffffff", "WAY OUT");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const ids = new Map(names.map((n, i) => [n.id, i]));
  const rows: AtlasRows = {
    count,
    station: (id) => ids.get(id) ?? 0,
    platform: [rowOf("pf1"), rowOf("pf2")],
    clock: rowOf("clock"),
    office: rowOf("office"),
    tea: rowOf("tea"),
    exit: rowOf("exit"),
  };
  return { texture, rows };
}

/** An overhead-wire mast beside a running line: where it stands, and the way to the track it carries. */
interface Mast {
  readonly x: number;
  readonly z: number;
  /** Unit vector from the mast to the track's centre. */
  readonly toX: number;
  readonly toZ: number;
}

/** Overhead wires: contact wire and catenary heights above the ground, mast spacing and offset from the track (estimated). */
const CONTACT_Y = RAIL_TOP + 5.5;
const MESSENGER_Y = RAIL_TOP + 6.4;
const MAST_SPACING = 54;
const MAST_OFFSET = 3.1;
/** A mast needs this much room from any other track's centre, metres (clear of passing trains). */
const MAST_CLEAR = 2.6;

/**
 * Masts every `MAST_SPACING` metres along each running line, on whichever side has room (no
 * other track within reach); where both sides are crowded (a middle track in a yard), none: the
 * wires there hang from the neighbours' masts in reality.
 */
function mastSpots(file: RailFile): Mast[] {
  // Every track sampled every 2 m into a 10 m grid, to find neighbours fast.
  const grid = new Map<string, Array<{ x: number; z: number; id: number }>>();
  const key = (x: number, z: number) => `${Math.floor(x / 10)},${Math.floor(z / 10)}`;
  const paths = file.tracks.map((t) => ({ track: t, path: RailPath.fromFlat(t.points) }));
  for (const { track, path } of paths) {
    for (let s = 0; s <= path.length; s += 2) {
      const p = path.at(s);
      const k = key(p.x, p.z);
      let list = grid.get(k);
      if (!list) grid.set(k, (list = []));
      list.push({ x: p.x, z: p.z, id: track.id });
    }
  }
  const clear = (x: number, z: number, own: number) => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const q of grid.get(key(x + dx * 10, z + dz * 10)) ?? []) {
          if (q.id !== own && Math.hypot(q.x - x, q.z - z) < MAST_CLEAR) return false;
        }
      }
    }
    return true;
  };
  const out: Mast[] = [];
  for (const { track, path } of paths) {
    if (track.kind !== "main") continue;
    for (let s = MAST_SPACING / 2; s < path.length; s += MAST_SPACING) {
      const centre = path.at(s);
      for (const side of [1, -1]) {
        const p = path.beside(s, side * MAST_OFFSET);
        if (!clear(p.x, p.z, track.id)) continue;
        const d = Math.hypot(centre.x - p.x, centre.z - p.z) || 1;
        out.push({ x: p.x, z: p.z, toX: (centre.x - p.x) / d, toZ: (centre.z - p.z) / d });
        break;
      }
    }
  }
  return out;
}

/** A mast: a tall steel post with two cantilever arms out over the track. */
function drawMast(b: MeshBuilder, mast: Mast, detailed: boolean): void {
  const yaw = Math.atan2(-mast.toX, -mast.toZ);
  orientedBox(b, mast.x, mast.z, yaw, 0.14, 0.11, 0, MESSENGER_Y + 0.5, 0x6a6e70, detailed ? "all" : "top-sides");
  const reach = MAST_OFFSET + 0.2;
  const cx = mast.x + mast.toX * (reach / 2);
  const cz = mast.z + mast.toZ * (reach / 2);
  orientedBox(b, cx, cz, yaw, reach / 2, 0.04, MESSENGER_Y + 0.05, MESSENGER_Y + 0.15, 0x6a6e70, "top-sides");
  if (detailed) {
    orientedBox(b, cx, cz, yaw, reach / 2, 0.03, CONTACT_Y + 0.08, CONTACT_Y + 0.14, 0x6a6e70, "top-sides");
    // Insulators where the arms meet the post (brown porcelain).
    for (const y of [MESSENGER_Y + 0.1, CONTACT_Y + 0.11]) orientedBox(b, mast.x + mast.toX * 0.35, mast.z + mast.toZ * 0.35, yaw, 0.12, 0.07, y - 0.07, y + 0.07, 0x7b4a2c, "top-sides");
  }
}

/** Registers a station-name font (subsets of Noto Sans Tamil / Devanagari Bold). Resolves false if it cannot load. */
export async function loadStationFont(url: string, family = STATION_FONT): Promise<boolean> {
  try {
    if (typeof FontFace === "undefined" || typeof document === "undefined") return false;
    const face = new FontFace(family, `url(${url})`, { weight: "700" });
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Station font timed out")), 4000));
    await Promise.race([face.load(), timeout]);
    document.fonts.add(face);
    return true;
  } catch (error) {
    console.warn(`Station font ${family} unavailable; boards are drawn without it.`, error);
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
  /** Draw Hindi names (the Devanagari station font loaded). */
  readonly hindi?: boolean;
}

export class RailView {
  readonly object = new THREE.Group();
  private readonly cells = new Map<string, Cell>();
  private readonly material: THREE.MeshStandardMaterial;
  private readonly boardMaterial: THREE.MeshStandardMaterial | null;
  private readonly atlas: AtlasRows | null;
  /** Every drawn platform and the station round it (the game's crowds and boards use the same layout). */
  readonly platforms: readonly StationPlatform[];

  constructor(file: RailFile, private readonly options: RailViewOptions) {
    this.object.name = "railway";
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    const atlas = stationAtlas(file.stations, { tamil: options.tamil, hindi: options.hindi ?? false });
    this.atlas = atlas?.rows ?? null;
    this.boardMaterial = atlas ? new THREE.MeshStandardMaterial({ map: atlas.texture, roughness: 0.6, side: THREE.DoubleSide }) : null;
    this.platforms = stationPlatforms(new RailNetwork(file));

    const cell = (x: number, z: number): Cell => {
      const key = cellKey(x, z);
      let c = this.cells.get(key);
      if (!c) {
        const [col, row] = key.split(",").map(Number) as [number, number];
        c = { key, x: (col + 0.5) * RAIL_CELL, z: (row + 0.5) * RAIL_CELL, tracks: [], platforms: [], masts: [], view: null };
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
    // An island platform is drawn once, for the first direction's stop (`stationPlatforms`).
    for (const platform of this.platforms) {
      const centre = platform.line.path.beside(platform.stop.s, (platform.near + platform.far) / 2);
      cell(centre.x, centre.z).platforms.push(platform);
    }
    for (const mast of mastSpots(file)) cell(mast.x, mast.z).masts.push(mast);
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
    for (const mast of c.masts) drawMast(b, mast, detailed);
    for (const p of c.platforms) buildStation(b, this.boardMaterial ? boards : null, p, this.atlas, detailed);
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
    if (service) return;
    // Overhead wires over the running lines: the contact wire the pantographs touch, and the catenary above it.
    orientedBox(b, (a.x + c.x) / 2, (a.z + c.z) / 2, yaw, length / 2 + 0.02, 0.014, CONTACT_Y - 0.012, CONTACT_Y + 0.012, 0x2e2a26, "top-sides");
    orientedBox(b, (a.x + c.x) / 2, (a.z + c.z) / 2, yaw, length / 2 + 0.02, 0.012, MESSENGER_Y - 0.01, MESSENGER_Y + 0.01, 0x2e2a26, "top-sides");
  }

  dispose(): void {
    for (const c of this.cells.values()) this.free(c);
    this.material.dispose();
    this.boardMaterial?.map?.dispose();
    this.boardMaterial?.dispose();
  }
}
