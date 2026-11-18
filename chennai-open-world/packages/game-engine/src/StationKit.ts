/**
 * A Chennai suburban station built in code around each drawn platform: the raised deck with its
 * yellow edge line and tactile strip, a sheet-roof shelter on columns (a single slope on a side
 * platform, a ridge down an island's middle), benches, lamp posts, dustbins, a tea stall, the
 * three-language name boards (Tamil, Hindi, English, as on Chennai's platforms), platform
 * number boards, a clock and a departure board frame, a foot-over-bridge with stairs over every
 * track nearby, and the booking office at its outer landing.
 *
 * Everything is boxes and quads with vertex colours, merged into the railway cell's one mesh
 * (boards and signs into the cell's one atlas mesh), so a whole station costs no extra draw
 * calls. Stations repeat, but each follows its own curve, width and yard, so they are built per
 * station rather than instanced. Far stations get only their big shapes (`detailed` false).
 * The design is original and the sizes are estimates, not surveyed: no railway company's logo,
 * livery or signage is copied.
 */
import { FOB_HALF_WIDTH, FOB_HEIGHT, FOB_STAIR_RUN, PLATFORM_HEIGHT, PLATFORM_LENGTH, platformMiddle, type StationPlatform } from "@cow/rail";
import * as THREE from "three";
import type { MeshBuilder } from "./MeshBuilder";
import { orientedBox } from "./RailView";

/** Atlas rows the station kit draws from (`stationAtlas`). */
export interface AtlasRows {
  /** Rows in the atlas (to turn a row into texture coordinates). */
  readonly count: number;
  /** A station's three-language name board. */
  station(id: string): number;
  /** "1", "2": platform numbers. */
  readonly platform: readonly number[];
  readonly clock: number;
  readonly office: number;
  readonly tea: number;
  readonly exit: number;
}

/** Shelter roof: from this far either side of the stop's centre (metres along), and its heights above the deck. */
export const CANOPY_HALF = 36;
const CANOPY_LOW = 3.9;
const CANOPY_HIGH = 4.7;
const COLUMN_SPACING = 9;
/** Where along the platform the boards hang (from the stop's centre), metres. */
export const DEPARTURE_BOARD_AT = 6;
export const CLOCK_AT = -6;
/** Departure board size, metres (wide and short, hung under the roof). */
export const DEPARTURE_BOARD_W = 2.4;
export const DEPARTURE_BOARD_H = 1.0;
/** Height of the boards' middle above the deck. */
export const HANGING_Y = 2.95;

const CONCRETE = 0xb4ad9f;
const COPING = 0xd8d2c4;
const YELLOW = 0xe9c22a;
const TACTILE = 0xd3a51f;
const TACTILE_DARK = 0xb98d18;
const COLUMN = 0x35594e;
const ROOF = 0x7f8d86;
const ROOF_DARK = 0x6c7a73;
const FASCIA = 0xc9b78e;
const BENCH = 0x6d6f73;
const STEEL = 0x55585c;
const LAMP = 0xfff3cf;
const BIN = 0x2f6b3c;
const STALL = 0x9a3b2a;
const FOB_CONCRETE = 0xa7a196;
const FOB_RAIL = 0x2f4f6a;
const WALL = 0xe6d7b4;
const TILE_ROOF = 0xa4553a;
const WINDOW = 0x2a3238;

/** Places in a platform's frame: `u` along the line from the stop's centre, `w` to its left. */
class Frame {
  constructor(private readonly p: StationPlatform) {}

  at(u: number, w: number): { x: number; z: number } {
    return this.p.line.path.beside(this.p.stop.s + u, w);
  }

  yaw(u: number): number {
    return this.p.line.path.at(this.p.stop.s + u).yaw;
  }

  /** A box centred at (u, w), `hu` half along and `hw` half across. */
  box(b: MeshBuilder, u: number, w: number, hu: number, hw: number, y0: number, y1: number, hex: number, faces: "all" | "top-sides" = "all"): void {
    const c = this.at(u, w);
    orientedBox(b, c.x, c.z, this.yaw(u), hu, hw, y0, y1, hex, faces);
  }

  /** A box across the line (its length runs across): centred at (u, w), `hw` half across, `hu` half along. */
  crossBox(b: MeshBuilder, u: number, w: number, hw: number, hu: number, y0: number, y1: number, hex: number, faces: "all" | "top-sides" = "all"): void {
    const c = this.at(u, w);
    orientedBox(b, c.x, c.z, this.yaw(u) + Math.PI / 2, hw, hu, y0, y1, hex, faces);
  }

  /** A quad through four (u, w, y) corners; its normal points up (roofs, slabs) or as given by the winding. */
  quad(b: MeshBuilder, corners: ReadonlyArray<readonly [number, number, number]>, hex: number, shade = 1): void {
    const pts = corners.map(([u, w, y]) => {
      const p = this.at(u, w);
      return new THREE.Vector3(p.x, y, p.z);
    });
    const [a, c1, , d] = pts as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
    const n = new THREE.Vector3().subVectors(c1, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    if (n.y < -0.2) n.negate();
    color.setHex(hex);
    const ids = pts.map((p) => b.vertex(p.x, p.y, p.z, n.x, n.y, n.z, 0.5, 0.5, color.r * shade, color.g * shade, color.b * shade));
    b.quad(ids[0]!, ids[1]!, ids[2]!, ids[3]!);
  }
}

const color = new THREE.Color();

/**
 * A two-faced board from the atlas: centred at (x, y, z), its face spanning `halfW` along
 * (rx, rz) and `halfH` up, each face with the text the right way round.
 */
export function atlasBoard(b: MeshBuilder, x: number, y: number, z: number, rx: number, rz: number, halfW: number, halfH: number, rows: number, front: number, back: number, u1 = 1): void {
  const nx = rz;
  const nz = -rx;
  for (const [facing, row] of [[1, front], [-1, back]] as const) {
    const v0 = 1 - (row + 1) / rows;
    const v1 = 1 - row / rows;
    const ox = nx * 0.02 * facing;
    const oz = nz * 0.02 * facing;
    const ax = rx * halfW * facing;
    const az = rz * halfW * facing;
    const ids = [
      b.vertex(x - ax + ox, y - halfH, z - az + oz, nx * facing, 0, nz * facing, 0, v0),
      b.vertex(x + ax + ox, y - halfH, z + az + oz, nx * facing, 0, nz * facing, u1, v0),
      b.vertex(x + ax + ox, y + halfH, z + az + oz, nx * facing, 0, nz * facing, u1, v1),
      b.vertex(x - ax + ox, y + halfH, z - az + oz, nx * facing, 0, nz * facing, 0, v1),
    ];
    b.quad(ids[0]!, ids[1]!, ids[2]!, ids[3]!);
  }
}

/** Where the departure board and the clock hang at a platform: world position and the board's along-direction. */
export function hangingBoard(p: StationPlatform, at: number): { x: number; y: number; z: number; rx: number; rz: number; yaw: number } {
  const f = new Frame(p);
  const w = boardLateral(p);
  const c = f.at(at, w);
  const yaw = f.yaw(at);
  // Hung across the platform, readable along it.
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  return { x: c.x, y: PLATFORM_HEIGHT + HANGING_Y, z: c.z, rx, rz, yaw };
}

/** Across-position of things hung under the roof: an island's middle, a side platform's middle. */
function boardLateral(p: StationPlatform): number {
  return platformMiddle(p);
}

/** Build one station into the cell's colour mesh `b` and atlas mesh `boards`. */
export function buildStation(b: MeshBuilder, boards: MeshBuilder | null, p: StationPlatform, atlas: AtlasRows | null, detailed: boolean): void {
  const f = new Frame(p);
  const half = PLATFORM_LENGTH / 2;
  const side = p.stop.side;
  const top = PLATFORM_HEIGHT;
  const mid = platformMiddle(p);
  const width = p.stop.width;
  // The deck: concrete, a pale coping along each track edge, the yellow line and the tactile strip inboard of it.
  f.box(b, 0, mid, half, width / 2, -0.05, top, CONCRETE);
  const edges = p.island ? [p.near, p.far] : [p.near];
  for (const edge of edges) {
    const inward = edge === p.near ? side : -side;
    f.box(b, 0, edge + inward * 0.18, half, 0.2, top - 0.02, top + 0.012, COPING, "top-sides");
    f.box(b, 0, edge + inward * 0.5, half, 0.12, top - 0.02, top + 0.014, YELLOW, "top-sides");
    if (detailed) {
      // Tactile paving: a strip of studded tiles, drawn as alternating shades.
      const w = edge + inward * 0.95;
      for (let u = -half + 0.3; u < half; u += 0.6) f.box(b, u, w, 0.3, 0.2, top - 0.02, top + 0.016, Math.round((u + half) / 0.6) % 2 ? TACTILE : TACTILE_DARK, "top-sides");
    }
  }
  // Ramps down at both ends (three 0.3 m steps; the player climbs 0.35 m at a time).
  for (const end of [-1, 1]) {
    for (let k = 0; k < 3; k++) f.box(b, end * (half + 0.4 + k * 0.8), mid, 0.4, width / 2, -0.05, top - 0.3 * (k + 1), 0xa9a296);
  }

  shelter(b, f, p, detailed);
  if (detailed) furniture(b, f, p);
  footBridge(b, f, p, detailed);
  bookingOffice(b, f, p, detailed);

  if (!boards || !atlas) return;
  const rows = atlas.count;
  const row = atlas.station(p.station.id);
  // Name boards on two legs near each end, and one at the middle of the roof: along the track, readable from the trains.
  for (const u of [-44, 44]) {
    const legs = [-1.5, 1.5];
    for (const l of legs) f.box(b, u + l, mid, 0.06, 0.06, top, top + 3.1, 0x2b2d30);
    const c = f.at(u, mid);
    const yaw = f.yaw(u);
    atlasBoard(boards, c.x, top + 2.4, c.z, -Math.sin(yaw), -Math.cos(yaw), 1.7, 0.66, rows, row, row);
  }
  if (detailed) {
    const c = f.at(18, mid);
    const yaw = f.yaw(18);
    atlasBoard(boards, c.x, top + HANGING_Y + 0.15, c.z, -Math.sin(yaw), -Math.cos(yaw), 1.4, 0.54, rows, row, row);
    f.box(b, 18 - 1.2, mid, 0.02, 0.02, top + HANGING_Y + 0.7, top + CANOPY_LOW, STEEL, "top-sides");
    f.box(b, 18 + 1.2, mid, 0.02, 0.02, top + HANGING_Y + 0.7, top + CANOPY_LOW, STEEL, "top-sides");
  }
  // Platform numbers hang across the platform, readable along it: each face shows the number of the edge it is nearer.
  const numbers = p.services.map((s) => atlas.platform[Math.min(atlas.platform.length - 1, s.number - 1)]!);
  for (const u of [-12, 26]) {
    const at = hangingBoard(p, u);
    const front = numbers[0]!;
    const back = numbers[numbers.length - 1]!;
    atlasBoard(boards, at.x, at.y + 0.35, at.z, at.rx, at.rz, 0.42, 0.42, rows, front, back, 192 / 512);
    hangers(b, f, u, mid, 0.3);
  }
  // The clock: a face on each side (hands are drawn live at the nearest platform, `StationLife`).
  const clock = hangingBoard(p, CLOCK_AT);
  atlasBoard(boards, clock.x, clock.y, clock.z, clock.rx, clock.rz, 0.38, 0.38, rows, atlas.clock, atlas.clock, 192 / 512);
  hangers(b, f, CLOCK_AT, mid, 0.2);
  // The departure board's housing (its screen is drawn live at the nearest platform).
  const board = hangingBoard(p, DEPARTURE_BOARD_AT);
  f.crossBox(b, DEPARTURE_BOARD_AT, mid, DEPARTURE_BOARD_W / 2 + 0.08, 0.07, board.y - DEPARTURE_BOARD_H / 2 - 0.08, board.y + DEPARTURE_BOARD_H / 2 + 0.08, 0x1c1e21);
  hangers(b, f, DEPARTURE_BOARD_AT, mid, DEPARTURE_BOARD_W / 2 - 0.2);
  if (detailed) {
    // Way out signs at the ramps and the FOB stairs; the tea stall's sign; the booking office's.
    for (const u of [-half + 3, half - 3]) {
      const at = hangingBoard(p, u);
      f.box(b, u, mid, 0.04, 0.04, top, top + 2.6, STEEL, "top-sides");
      atlasBoard(boards, at.x, top + 2.75, at.z, at.rx, at.rz, 0.7, 0.26, rows, atlas.exit, atlas.exit);
    }
    const tea = stallAt(p);
    const yaw = f.yaw(tea.u);
    const out = tea.facing;
    // Above the counter, facing the platform's middle.
    const n = f.at(tea.u, tea.w + out * 1.0);
    atlasBoard(boards, n.x, top + 2.55, n.z, -Math.sin(yaw), -Math.cos(yaw), 1.1, 0.3, rows, atlas.tea, atlas.tea);
    const office = officeFront(p);
    atlasBoard(boards, office.x, office.y, office.z, office.rx, office.rz, 2.2, 0.42, rows, atlas.office, atlas.office);
    const name = f.at(p.office.u, p.office.w + p.office.facing * 3.62);
    atlasBoard(boards, name.x, 5.6, name.z, -Math.sin(f.yaw(p.office.u)), -Math.cos(f.yaw(p.office.u)), 2.6, 1.0, rows, row, row);
  }
}

/** Two thin rods from the roof to a hanging board. */
function hangers(b: MeshBuilder, f: Frame, u: number, w: number, spread: number): void {
  const yaw = f.yaw(u);
  for (const s of [-spread, spread]) {
    // Spread across the platform (the board hangs across it).
    const c = f.at(u, w + s);
    orientedBox(b, c.x, c.z, yaw, 0.015, 0.015, PLATFORM_HEIGHT + HANGING_Y + 0.4, PLATFORM_HEIGHT + CANOPY_LOW + (CANOPY_HIGH - CANOPY_LOW) * 0.5, STEEL, "top-sides");
  }
}

/** The shelter: columns, a sheet roof in ribbed bands, and its fascia. */
function shelter(b: MeshBuilder, f: Frame, p: StationPlatform, detailed: boolean): void {
  const top = PLATFORM_HEIGHT;
  const side = p.stop.side;
  const mid = platformMiddle(p);
  // Roof edges over the decks' track edges (stopping 0.25 m short: trains' pantographs pass beside).
  const nearEdge = p.near + side * 0.25;
  const farEdge = p.island ? p.far - side * 0.25 : p.far + side * 0.3;
  const columnsAt = p.island ? mid : p.far - side * 0.55;
  const step = detailed ? 1.2 : CANOPY_HALF;
  for (let u = -CANOPY_HALF; u <= CANOPY_HALF + 0.01; u += COLUMN_SPACING) {
    // No column where the FOB's stairs come down onto the platform.
    if (onStair(p, u, 0.3)) continue;
    f.box(b, u, columnsAt, 0.14, 0.14, top, top + (p.island ? CANOPY_HIGH : CANOPY_HIGH) - 0.05, COLUMN, detailed ? "all" : "top-sides");
    if (detailed) {
      // A bracket under the roof towards each edge it carries.
      for (const edge of p.island ? [nearEdge, farEdge] : [nearEdge]) {
        const w = (columnsAt + edge) / 2;
        f.box(b, u, w, 0.06, Math.abs(edge - columnsAt) / 2 - 0.2, top + CANOPY_LOW - 0.35, top + CANOPY_LOW - 0.15, COLUMN, "top-sides");
      }
    }
  }
  // Roof slopes: corrugated sheets as alternating bands.
  const slopes: Array<[number, number, number, number]> = p.island
    ? [
        [columnsAt, top + CANOPY_HIGH, nearEdge, top + CANOPY_LOW],
        [columnsAt, top + CANOPY_HIGH, farEdge, top + CANOPY_LOW],
      ]
    : [[farEdge, top + CANOPY_HIGH, nearEdge, top + CANOPY_LOW]];
  for (const [w0, y0, w1, y1] of slopes) {
    let k = 0;
    for (let u = -CANOPY_HALF - 0.6; u < CANOPY_HALF + 0.6 - 1e-6; u += step) {
      const u1 = Math.min(CANOPY_HALF + 0.6, u + step);
      f.quad(b, [[u, w0, y0], [u1, w0, y0], [u1, w1, y1], [u, w1, y1]], k++ % 2 ? ROOF : ROOF_DARK);
    }
    // Fascia board along the low edge.
    f.box(b, 0, w1, CANOPY_HALF + 0.6, 0.04, y1 - 0.32, y1 + 0.02, FASCIA, "top-sides");
  }
  if (p.island) f.box(b, 0, columnsAt, CANOPY_HALF + 0.6, 0.12, top + CANOPY_HIGH - 0.05, top + CANOPY_HIGH + 0.12, ROOF_DARK, "top-sides");
  else f.box(b, 0, farEdge, CANOPY_HALF + 0.6, 0.05, top + CANOPY_HIGH - 0.3, top + CANOPY_HIGH + 0.03, FASCIA, "top-sides");
  if (!detailed) return;
  // Tube lights under the roof, between the columns.
  for (let u = -CANOPY_HALF + COLUMN_SPACING / 2; u < CANOPY_HALF; u += COLUMN_SPACING) {
    for (const edge of p.island ? [nearEdge, farEdge] : [nearEdge]) {
      const w = columnsAt + (edge - columnsAt) * 0.55;
      f.box(b, u, w, 0.6, 0.04, top + CANOPY_LOW + (CANOPY_HIGH - CANOPY_LOW) * 0.4 - 0.1, top + CANOPY_LOW + (CANOPY_HIGH - CANOPY_LOW) * 0.4 - 0.04, LAMP, "top-sides");
    }
  }
}

/** True when `u` (give or take `margin`) is under the FOB's stairs onto the platform. */
function onStair(p: StationPlatform, u: number, margin: number): boolean {
  const [u0, u1] = platformStair(p);
  return u > u0 - margin && u < u1 + margin;
}

/** Along-range of the FOB's stairs on the platform. */
export function platformStair(p: StationPlatform): [number, number] {
  return [p.fob.u + FOB_HALF_WIDTH, p.fob.u + FOB_HALF_WIDTH + FOB_STAIR_RUN];
}

/** Where the tea stall stands: under the roof's end, on the deck's back half, its counter facing the middle. */
export function stallAt(p: StationPlatform): { u: number; w: number; facing: 1 | -1 } {
  const side = p.stop.side;
  if (p.island) return { u: CANOPY_HALF - 6, w: platformMiddle(p) + side * 1.1, facing: -side as 1 | -1 };
  return { u: CANOPY_HALF - 6, w: p.far - side * 0.9, facing: -side as 1 | -1 };
}

/** Benches, lamp posts beyond the roof, dustbins and the tea stall. */
function furniture(b: MeshBuilder, f: Frame, p: StationPlatform): void {
  const top = PLATFORM_HEIGHT;
  const side = p.stop.side;
  const mid = platformMiddle(p);
  const half = PLATFORM_LENGTH / 2;
  // Benches between the columns, backs to the columns, facing the track.
  const rowsAt: Array<{ w: number; facing: number }> = p.island
    ? [
        { w: mid + side * 0.9, facing: side },
        { w: mid - side * 0.9, facing: -side },
      ]
    : [{ w: p.far - side * 1.25, facing: -side }];
  for (let u = -CANOPY_HALF + COLUMN_SPACING / 2; u < CANOPY_HALF; u += COLUMN_SPACING) {
    if (Math.abs(u - DEPARTURE_BOARD_AT) < 2 || Math.abs(u - stallAt(p).u) < 3 || onStair(p, u, 1.2)) continue;
    for (const row of rowsAt) {
      f.box(b, u, row.w, 1.0, 0.22, top + 0.42, top + 0.48, BENCH);
      f.box(b, u, row.w - row.facing * 0.22, 1.0, 0.03, top + 0.5, top + 0.9, BENCH, "top-sides");
      for (const l of [-0.8, 0.8]) f.box(b, u + l, row.w, 0.04, 0.18, top, top + 0.42, STEEL, "top-sides");
    }
  }
  // Lamp posts along the open ends, at the deck's back (or middle of an island).
  const lampW = p.island ? mid : p.far - side * 0.4;
  for (const end of [-1, 1]) {
    for (let u = CANOPY_HALF + 5; u < half - 1; u += 9) {
      const at = end * u;
      f.box(b, at, lampW, 0.07, 0.07, top, top + 4.6, STEEL, "top-sides");
      const arms = p.island ? [1, -1] : [-side];
      for (const a of arms) {
        f.box(b, at, lampW + a * 0.5, 0.05, 0.5, top + 4.5, top + 4.58, STEEL, "top-sides");
        f.box(b, at, lampW + a * 0.95, 0.22, 0.12, top + 4.36, top + 4.52, LAMP);
      }
    }
  }
  // Dustbins by every other column (green drums with a dark lid).
  for (let u = -CANOPY_HALF; u <= CANOPY_HALF; u += COLUMN_SPACING * 2) {
    if (onStair(p, u, 0.4)) continue;
    const w = (p.island ? mid : p.far - side * 0.55) - side * 0.45;
    f.box(b, u, w, 0.2, 0.2, top, top + 0.75, BIN);
    f.box(b, u, w, 0.22, 0.22, top + 0.75, top + 0.82, 0x1e2a22, "top-sides");
  }
  // The tea stall: a red kiosk open at the front (the seller stands inside, `Railway`), with a
  // counter, an urn and a striped awning.
  const tea = stallAt(p);
  const out = tea.facing;
  f.box(b, tea.u, tea.w - out * 0.62, 1.3, 0.08, top, top + 2.3, STALL);
  for (const e of [-1, 1]) f.box(b, tea.u + e * 1.25, tea.w, 0.05, 0.7, top, top + 2.3, STALL);
  f.box(b, tea.u, tea.w, 1.3, 0.7, top + 2.2, top + 2.3, STALL);
  f.box(b, tea.u - 0.7, tea.w - out * 0.4, 0.45, 0.15, top + 1.2, top + 1.25, 0xd9c9a3, "top-sides");
  f.box(b, tea.u, tea.w + out * 0.85, 1.35, 0.18, top, top + 1.05, 0xd9c9a3);
  f.box(b, tea.u + 0.6, tea.w + out * 0.85, 0.16, 0.16, top + 1.05, top + 1.5, 0xb9bcc0);
  f.box(b, tea.u - 0.3, tea.w + out * 0.85, 0.35, 0.12, top + 1.05, top + 1.12, 0xf0ead8, "top-sides");
  for (let k = 0; k < 5; k++) {
    const u0 = tea.u - 1.4 + k * 0.56;
    f.quad(b, [[u0, tea.w + out * 0.6, top + 2.35], [u0 + 0.56, tea.w + out * 0.6, top + 2.35], [u0 + 0.56, tea.w + out * 1.4, top + 2.05], [u0, tea.w + out * 1.4, top + 2.05]], k % 2 ? 0xf2efe6 : 0x2f7d5b);
  }
}

/** The foot-over-bridge: deck and parapets across the tracks, stairs onto the platform and down at both landings. */
function footBridge(b: MeshBuilder, f: Frame, p: StationPlatform, detailed: boolean): void {
  const { u, from, to } = p.fob;
  const deck = FOB_HEIGHT;
  const hw = FOB_HALF_WIDTH;
  const length = (to - from) / 2;
  const centre = (from + to) / 2;
  f.crossBox(b, u, centre, length, hw, deck - 0.45, deck, FOB_CONCRETE);
  // Parapets with a blue-painted rail, and a light roof on posts.
  for (const s of [-1, 1]) {
    f.crossBox(b, u + s * (hw - 0.08), centre, length, 0.08, deck, deck + 1.05, FOB_CONCRETE, "top-sides");
    f.crossBox(b, u + s * (hw - 0.08), centre, length, 0.06, deck + 1.05, deck + 1.15, FOB_RAIL, "top-sides");
  }
  f.crossBox(b, u, centre, length + 0.3, hw + 0.35, deck + 3.0, deck + 3.12, ROOF_DARK);
  if (detailed) {
    for (let w = from + 0.5; w <= to - 0.5 + 1e-6; w += Math.max(4, (to - from - 1) / Math.max(1, Math.round((to - from) / 6)))) {
      for (const s of [-1, 1]) f.box(b, u + s * (hw - 0.08), w, 0.06, 0.06, deck + 1.15, deck + 3.0, FOB_RAIL, "top-sides");
    }
  }
  // Piers: at both landings, and on the platform under the stair head.
  const piers = [from + 1, to - 1, platformMiddle(p)];
  for (const w of piers) f.box(b, u, w, 0.35, 0.35, 0, deck - 0.45, FOB_CONCRETE);

  // Stairs: from the deck along the platform down to it; at the landings, down to the ground.
  const stairW = p.island ? platformMiddle(p) : p.far - p.stop.side * 1.25;
  stair(b, f, u + hw, stairW, deck, PLATFORM_HEIGHT, detailed, p.island ? 1.3 : 1.0);
  for (const w of [from + 1.3, to - 1.3]) stair(b, f, u + hw, w, deck, 0, detailed, 1.1);
}

/** A straight stair along +u from (u0, w) at height `high` down to `low`. */
function stair(b: MeshBuilder, f: Frame, u0: number, w: number, high: number, low: number, detailed: boolean, hw: number): void {
  const run = FOB_STAIR_RUN * ((high - low) / (FOB_HEIGHT - PLATFORM_HEIGHT));
  const u1 = u0 + run;
  // The sloping slab under the steps and its side walls.
  f.quad(b, [[u0, w - hw, high - 0.35], [u0, w + hw, high - 0.35], [u1, w + hw, low], [u1, w - hw, low]], FOB_CONCRETE, 0.8);
  for (const s of [-1, 1]) {
    const e = w + s * hw;
    f.quad(b, [[u0, e, high + 1.0], [u1, e, low + 1.0], [u1, e, low], [u0, e, high - 0.35]], FOB_CONCRETE, 0.9);
    f.quad(b, [[u0, e, high + 1.1], [u1, e, low + 1.1], [u1, e, low + 1.0], [u0, e, high + 1.0]], FOB_RAIL);
  }
  const steps = detailed ? Math.max(1, Math.round(run / 0.3)) : 1;
  const going = run / steps;
  const rise = (high - low) / steps;
  for (let k = 0; k < steps; k++) {
    const y = high - k * rise;
    f.box(b, u0 + (k + 0.5) * going, w, going / 2, hw - 0.02, y - rise, y, k % 2 ? 0xb3ada2 : 0xa49e94, "top-sides");
  }
}

/** Where the booking office's sign is, on its front wall facing the platform. */
function officeFront(p: StationPlatform): { x: number; y: number; z: number; rx: number; rz: number } {
  const f = new Frame(p);
  const c = f.at(p.office.u, p.office.w + p.office.facing * 3.56);
  const yaw = f.yaw(p.office.u);
  return { x: c.x, y: 3.7, z: c.z, rx: -Math.sin(yaw), rz: -Math.cos(yaw) };
}

/** The booking office: a cream building with a red tiled roof, ticket windows and a porch facing the station. */
function bookingOffice(b: MeshBuilder, f: Frame, p: StationPlatform, detailed: boolean): void {
  const { u, w, facing } = p.office;
  const hu = 7;
  const hw = 3.5;
  f.box(b, u, w, hu, hw, 0, 4.4, WALL);
  f.box(b, u, w, hu + 0.1, hw + 0.1, 0, 0.45, 0x8d8478, "top-sides");
  // Hipped-looking tiled roof: two slopes from a ridge along its length.
  for (const s of [-1, 1]) f.quad(b, [[u - hu - 0.6, w, 6.0], [u + hu + 0.6, w, 6.0], [u + hu + 0.6, w + s * (hw + 0.7), 4.3], [u - hu - 0.6, w + s * (hw + 0.7), 4.3]], TILE_ROOF);
  for (const e of [-1, 1]) f.quad(b, [[u + e * hu, w - hw, 4.4], [u + e * hu, w + hw, 4.4], [u + e * hu, w + hw, 4.4], [u + e * hu, w, 6.0]], WALL, 0.95);
  if (!detailed) return;
  // Ticket windows along the front and the doorway at one end; a porch roof over them.
  const front = w + facing * (hw + 0.02);
  for (const k of [-4.5, -2.5, -0.5, 1.5]) f.box(b, u + k, front, 0.6, 0.03, 1.0, 2.1, WINDOW, "top-sides");
  f.box(b, u + 4.4, front, 0.9, 0.03, 0, 2.8, 0x3a2c22, "top-sides");
  f.quad(b, [[u - hu, w + facing * hw, 3.3], [u + hu, w + facing * hw, 3.3], [u + hu, w + facing * (hw + 2.0), 2.9], [u - hu, w + facing * (hw + 2.0), 2.9]], ROOF);
  for (const k of [-hu + 0.3, 0, hu - 0.3]) f.box(b, u + k, w + facing * (hw + 1.9), 0.08, 0.08, 0, 2.9, COLUMN, "top-sides");
}
