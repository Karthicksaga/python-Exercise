/**
 * The streamed world's files (TD-16): a small JSON index, one binary file with every road's
 * centre line, and one small binary file per chunk (buildings, trees and areas cut to it).
 *
 * Binary files are little-endian. Coordinates are quantised to 5 cm: road lines as a 32-bit
 * start and 16-bit steps, chunk contents as 16-bit offsets from the chunk's centre. Decoding is
 * a single pass over a DataView and allocates only the objects the game uses.
 *
 * Pure data: no Three.js, no Rapier, no file or network access (the game's loader fetches the
 * bytes; the build script writes them).
 */
import type { LatLng } from "@cow/map-data";
import { WALL_COLORS } from "./buildWorldMap";
import type { Area, AreaKind, Bounds, Building, BuildingKind, ChunkData, ChunkRef, District, Landmark, NamedPoint, Point, Poi, Road, RoadKind, Sea, Tree, WorldMap } from "./types";

export const WORLD_FORMAT = 1;
/** Quantisation steps per metre. */
const Q = 20;
const CHUNK_MAGIC = 0x43574f43; // "COWC"
const ROADS_MAGIC = 0x52574f43; // "COWR"

const ROAD_KINDS: readonly RoadKind[] = ["primary", "secondary", "tertiary", "residential", "service", "footway"];
const BUILDING_KINDS: readonly BuildingKind[] = ["house", "apartments", "commercial"];
const HEIGHT_FROM: ReadonlyArray<NonNullable<Building["heightFrom"]>> = ["estimated", "levels", "height"];
const AREA_KINDS: readonly AreaKind[] = ["park", "water", "beach"];

/** The index file: everything that is always loaded, and the table of chunk files. */
export interface WorldIndexFile {
  readonly format: number;
  readonly name: string;
  readonly origin: LatLng;
  readonly attribution: string;
  readonly dataDate: string;
  readonly bounds: Bounds;
  readonly chunkSize: number;
  /** Chunks that have a file: column, row, file size in bytes. */
  readonly chunks: ReadonlyArray<readonly [number, number, number]>;
  /** File name of the roads file, relative to the index. */
  readonly roads: string;
  readonly areas: readonly Area[];
  /** Kind, x, z, and a name for the kinds content looks names up for. */
  readonly pois: ReadonlyArray<readonly [string, number, number, string?]>;
  readonly landmarks: readonly Landmark[];
  readonly busStops: readonly NamedPoint[];
  readonly signals: readonly Point[];
  readonly districts: readonly District[];
  readonly sea?: Sea;
}

/** Chunk files live next to the index under this name. */
export const chunkFile = (col: number, row: number) => `c/${col}_${row}.bin`;

const round = (v: number) => Math.round(v * 100) / 100;

/** A growable little-endian byte writer. */
class Writer {
  private bytes = new Uint8Array(1024);
  private view = new DataView(this.bytes.buffer);
  length = 0;

  private room(n: number): void {
    if (this.length + n <= this.bytes.length) return;
    let size = this.bytes.length * 2;
    while (size < this.length + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.bytes);
    this.bytes = next;
    this.view = new DataView(next.buffer);
  }
  u8(v: number) {
    this.room(1);
    this.view.setUint8(this.length, v);
    this.length += 1;
  }
  u16(v: number) {
    this.room(2);
    this.view.setUint16(this.length, v, true);
    this.length += 2;
  }
  i16(v: number) {
    if (v < -32768 || v > 32767) throw new RangeError(`Value ${v} does not fit 16 bits.`);
    this.room(2);
    this.view.setInt16(this.length, v, true);
    this.length += 2;
  }
  u32(v: number) {
    this.room(4);
    this.view.setUint32(this.length, v, true);
    this.length += 4;
  }
  i32(v: number) {
    this.room(4);
    this.view.setInt32(this.length, v, true);
    this.length += 4;
  }
  f64(v: number) {
    this.room(8);
    this.view.setFloat64(this.length, v, true);
    this.length += 8;
  }
  done(): Uint8Array {
    return this.bytes.slice(0, this.length);
  }
}

class Reader {
  private readonly view: DataView;
  at = 0;
  constructor(buffer: ArrayBuffer | Uint8Array) {
    this.view = buffer instanceof Uint8Array ? new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength) : new DataView(buffer);
  }
  u8() {
    return this.view.getUint8(this.at++);
  }
  u16() {
    const v = this.view.getUint16(this.at, true);
    this.at += 2;
    return v;
  }
  i16() {
    const v = this.view.getInt16(this.at, true);
    this.at += 2;
    return v;
  }
  u32() {
    const v = this.view.getUint32(this.at, true);
    this.at += 4;
    return v;
  }
  i32() {
    const v = this.view.getInt32(this.at, true);
    this.at += 4;
    return v;
  }
  f64() {
    const v = this.view.getFloat64(this.at, true);
    this.at += 8;
    return v;
  }
}

/** Centre of a chunk square, the origin of its quantised coordinates. */
export function chunkCentre(bounds: Bounds, chunkSize: number, col: number, row: number): Point {
  return { x: bounds.minX + (col + 0.5) * chunkSize, z: bounds.minZ + (row + 0.5) * chunkSize };
}

export function encodeChunk(chunk: ChunkData, bounds: Bounds, chunkSize: number): Uint8Array {
  const centre = chunkCentre(bounds, chunkSize, chunk.col, chunk.row);
  const w = new Writer();
  const point = (p: Point) => {
    w.i16(Math.round((p.x - centre.x) * Q));
    w.i16(Math.round((p.z - centre.z) * Q));
  };
  w.u32(CHUNK_MAGIC);
  w.u16(WORLD_FORMAT);
  w.i16(chunk.col);
  w.i16(chunk.row);
  w.u16(chunk.buildings.length);
  w.u16(chunk.trees.length);
  w.u16(chunk.areas.length);
  for (const b of chunk.buildings) {
    w.u32(b.id);
    w.u16(Math.round(b.height * 10));
    w.u8(b.floors);
    w.u8(BUILDING_KINDS.indexOf(b.kind) | (HEIGHT_FROM.indexOf(b.heightFrom ?? "estimated") << 2));
    w.u8(Math.max(0, WALL_COLORS.indexOf(b.color)));
    w.u16(b.outline.length);
    for (const p of b.outline) point(p);
  }
  for (const t of chunk.trees) {
    point(t);
    w.u8(Math.round(t.scale * 100));
    w.u8(t.source === "osm" ? 1 : 0);
  }
  for (const a of chunk.areas) {
    w.u32(a.id);
    w.u8(AREA_KINDS.indexOf(a.kind));
    w.u16(a.outline.length);
    for (const p of a.outline) point(p);
  }
  return w.done();
}

export function decodeChunk(buffer: ArrayBuffer | Uint8Array, bounds: Bounds, chunkSize: number): ChunkData {
  const r = new Reader(buffer);
  if (r.u32() !== CHUNK_MAGIC) throw new Error("Not a chunk file.");
  const format = r.u16();
  if (format !== WORLD_FORMAT) throw new Error(`Chunk file format ${format}, expected ${WORLD_FORMAT}: run npm run build:world.`);
  const col = r.i16();
  const row = r.i16();
  const centre = chunkCentre(bounds, chunkSize, col, row);
  const point = (): Point => ({ x: round(centre.x + r.i16() / Q), z: round(centre.z + r.i16() / Q) });
  const nb = r.u16();
  const nt = r.u16();
  const na = r.u16();
  const buildings: Building[] = [];
  for (let i = 0; i < nb; i++) {
    const id = r.u32();
    const height = r.u16() / 10;
    const floors = r.u8();
    const packed = r.u8();
    const color = WALL_COLORS[r.u8()] ?? WALL_COLORS[0]!;
    const n = r.u16();
    const outline: Point[] = [];
    for (let k = 0; k < n; k++) outline.push(point());
    buildings.push({ id, outline, height, floors, kind: BUILDING_KINDS[packed & 3] ?? "house", heightFrom: HEIGHT_FROM[(packed >> 2) & 3] ?? "estimated", color });
  }
  const trees: Tree[] = [];
  for (let i = 0; i < nt; i++) {
    const p = point();
    const scale = r.u8() / 100;
    trees.push({ ...p, scale, source: r.u8() === 1 ? "osm" : "generated" });
  }
  const areas: Area[] = [];
  for (let i = 0; i < na; i++) {
    const id = r.u32();
    const kind = AREA_KINDS[r.u8()] ?? "park";
    const n = r.u16();
    const outline: Point[] = [];
    for (let k = 0; k < n; k++) outline.push(point());
    areas.push({ id, kind, outline });
  }
  return { key: `${col},${row}`, col, row, buildings, trees, areas };
}

/** Longest step between two quantised road points that fits 16 bits, metres. */
const MAX_STEP = 32767 / Q - 1;

export function encodeRoads(roads: readonly Road[]): { bytes: Uint8Array; names: string[] } {
  const names: string[] = [];
  const nameIndex = new Map<string, number>();
  const w = new Writer();
  w.u32(ROADS_MAGIC);
  w.u16(WORLD_FORMAT);
  w.u32(roads.length);
  for (const road of roads) {
    // Long straight segments are split so every step fits 16 bits.
    const points: Point[] = [];
    road.points.forEach((p, i) => {
      if (i > 0) {
        const q = road.points[i - 1]!;
        const steps = Math.ceil(Math.max(Math.abs(p.x - q.x), Math.abs(p.z - q.z)) / MAX_STEP);
        for (let s = 1; s < steps; s++) points.push({ x: q.x + ((p.x - q.x) * s) / steps, z: q.z + ((p.z - q.z) * s) / steps });
      }
      points.push(p);
    });
    let name = 0;
    if (road.name) {
      let index = nameIndex.get(road.name);
      if (index === undefined) {
        index = names.length;
        names.push(road.name);
        nameIndex.set(road.name, index);
      }
      name = index + 1;
    }
    w.u8(ROAD_KINDS.indexOf(road.kind));
    w.u8((road.oneway ? 1 : 0) | (road.lanes !== undefined ? 2 : 0));
    w.u16(Math.round(road.width * 100));
    w.u8(road.lanes ?? 0);
    w.u16(name);
    w.f64(road.id);
    w.u16(points.length);
    let x = Math.round(points[0]!.x * Q);
    let z = Math.round(points[0]!.z * Q);
    w.i32(x);
    w.i32(z);
    for (let i = 1; i < points.length; i++) {
      const nx = Math.round(points[i]!.x * Q);
      const nz = Math.round(points[i]!.z * Q);
      w.i16(nx - x);
      w.i16(nz - z);
      x = nx;
      z = nz;
    }
  }
  return { bytes: w.done(), names };
}

export function decodeRoads(buffer: ArrayBuffer | Uint8Array, names: readonly string[]): Road[] {
  const r = new Reader(buffer);
  if (r.u32() !== ROADS_MAGIC) throw new Error("Not a roads file.");
  const format = r.u16();
  if (format !== WORLD_FORMAT) throw new Error(`Roads file format ${format}, expected ${WORLD_FORMAT}: run npm run build:world.`);
  const count = r.u32();
  const roads: Road[] = [];
  for (let i = 0; i < count; i++) {
    const kind = ROAD_KINDS[r.u8()] ?? "residential";
    const flags = r.u8();
    const width = r.u16() / 100;
    const lanes = r.u8();
    const name = r.u16();
    const id = r.f64();
    const n = r.u16();
    let x = r.i32();
    let z = r.i32();
    const points: Point[] = [{ x: x / Q, z: z / Q }];
    for (let k = 1; k < n; k++) {
      x += r.i16();
      z += r.i16();
      points.push({ x: x / Q, z: z / Q });
    }
    roads.push({
      id,
      kind,
      ...(name > 0 ? { name: names[name - 1]! } : {}),
      width,
      ...(flags & 2 ? { lanes } : {}),
      oneway: (flags & 1) === 1,
      points,
    });
  }
  return roads;
}

/** POI kinds whose names the game reads (to leave out eye clinics, for example). */
const NAMED_POIS = new Set(["hospital", "clinic"]);

/** The index file for a built world (chunk sizes are filled in by the caller once written). */
export function worldIndex(map: WorldMap, chunkSizes: ReadonlyMap<string, number>, roadsFile: string, roadNames: readonly string[]): WorldIndexFile & { readonly roadNames: readonly string[] } {
  return {
    format: WORLD_FORMAT,
    name: map.name,
    origin: map.origin,
    attribution: map.attribution,
    dataDate: map.dataDate,
    bounds: map.bounds,
    chunkSize: map.chunkSize,
    chunks: map.chunks.map((c: ChunkRef) => [c.col, c.row, chunkSizes.get(c.key) ?? 0] as const),
    roads: roadsFile,
    roadNames,
    areas: map.areas,
    pois: map.pois.map((p) => (p.name && NAMED_POIS.has(p.kind) ? ([p.kind, p.x, p.z, p.name] as const) : ([p.kind, p.x, p.z] as const))),
    landmarks: map.landmarks ?? [],
    busStops: map.busStops ?? [],
    signals: map.signals ?? [],
    districts: map.districts ?? [],
    ...(map.sea ? { sea: map.sea } : {}),
  };
}

/** The always-loaded world from its index and decoded roads. */
export function worldFromIndex(index: WorldIndexFile, roads: readonly Road[]): WorldMap {
  if (index.format !== WORLD_FORMAT) throw new Error(`World index format ${index.format}, expected ${WORLD_FORMAT}: run npm run build:world.`);
  const pois: Poi[] = index.pois.map(([kind, x, z, name]) => ({ kind, x, z, ...(name ? { name } : {}) }));
  return {
    name: index.name,
    origin: index.origin,
    attribution: index.attribution,
    dataDate: index.dataDate,
    bounds: index.bounds,
    chunkSize: index.chunkSize,
    roads,
    areas: index.areas,
    pois,
    chunks: index.chunks.map(([col, row]) => ({ key: `${col},${row}`, col, row })),
    landmarks: index.landmarks,
    busStops: index.busStops,
    signals: index.signals,
    districts: index.districts,
    ...(index.sea ? { sea: index.sea } : {}),
  };
}
