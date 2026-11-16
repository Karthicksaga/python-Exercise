/**
 * Round minimap that turns with the camera. The map is painted in square tiles around the
 * player, each to its own small off-screen canvas, kept while it is near and repainted when a
 * chunk's buildings arrive or leave; each refresh only copies and rotates the tiles in view. A
 * whole-city canvas would be far beyond phone memory (12 km at 1.5 px a metre).
 */

interface MapPoint {
  readonly x: number;
  readonly z: number;
}

/** The parts of the world the minimap draws (structurally matches the game's world map). */
export interface MinimapSource {
  readonly bounds: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };
  readonly attribution: string;
  readonly roads: ReadonlyArray<{ readonly kind: string; readonly width: number; readonly points: readonly MapPoint[] }>;
  readonly areas: ReadonlyArray<{ readonly kind: string; readonly outline: readonly MapPoint[] }>;
  /** The sea's outline, drawn under everything else. */
  readonly sea?: { readonly outline: readonly MapPoint[] } | undefined;
  /** Landmarks get their footprint drawn and an upright initial. */
  readonly landmarks?: ReadonlyArray<{ readonly name: string; readonly x: number; readonly z: number; readonly radius?: number | undefined }> | undefined;
}

export interface MinimapMarker extends MapPoint {
  readonly color: string;
  /** Markers outside the view are pinned to the rim when true (the objective). */
  readonly pinned?: boolean;
  readonly size?: number;
}

const SIZE = 132; // CSS pixels
const PIXELS_PER_METRE = 1.5; // resolution of the off-screen map
const VIEW_RADIUS = 110; // metres shown from centre to rim
const TILE = 250; // metres per off-screen tile
const KEEP_TILES = 16;

interface Box {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}
function boxOf(points: readonly MapPoint[]): Box {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX, maxX, minZ, maxZ };
}

/** Lists of things by the tiles their boxes touch. */
class TileIndex<T> {
  readonly tiles = new Map<string, T[]>();
  add(item: T, box: Box): string[] {
    const keys: string[] = [];
    for (let c = Math.floor(box.minX / TILE); c <= Math.floor(box.maxX / TILE); c++) {
      for (let r = Math.floor(box.minZ / TILE); r <= Math.floor(box.maxZ / TILE); r++) {
        const key = `${c},${r}`;
        const list = this.tiles.get(key);
        if (list) list.push(item);
        else this.tiles.set(key, [item]);
        keys.push(key);
      }
    }
    return keys;
  }
  remove(item: T, keys: readonly string[]): void {
    for (const key of keys) {
      const list = this.tiles.get(key);
      if (!list) continue;
      const i = list.indexOf(item);
      if (i >= 0) list.splice(i, 1);
      if (list.length === 0) this.tiles.delete(key);
    }
  }
  get(key: string): readonly T[] {
    return this.tiles.get(key) ?? [];
  }
}

const STYLE = `
.cow-minimap{position:absolute;right:calc(14px + env(safe-area-inset-right));top:calc(64px + env(safe-area-inset-top));width:${SIZE}px;pointer-events:none}
.cow-minimap canvas{width:${SIZE}px;height:${SIZE}px;border-radius:50%;border:2px solid rgba(255,255,255,.75);background:#cdbf9c;display:block;box-shadow:0 2px 10px rgba(0,0,0,.35)}
.cow-minimap small{display:block;text-align:center;font:500 8px system-ui,sans-serif;color:#fff;opacity:.85;margin-top:2px;text-shadow:0 1px 2px #000}
`;

export class Minimap {
  private readonly context: CanvasRenderingContext2D;
  private readonly ratio: number;
  private sinceDraw = 1;
  private readonly roads = new TileIndex<MinimapSource["roads"][number]>();
  private readonly areas = new TileIndex<MinimapSource["areas"][number]>();
  private readonly buildings = new TileIndex<readonly MapPoint[]>();
  /** Buildings of each loaded chunk and the tiles they were filed under, to take them out again. */
  private readonly chunkBuildings = new Map<string, Array<{ outline: readonly MapPoint[]; keys: string[] }>>();
  /** Painted tiles, most recently used last. */
  private readonly painted = new Map<string, HTMLCanvasElement>();
  private readonly lines = new TileIndex<{ readonly points: readonly MapPoint[]; readonly width: number }>();

  constructor(parent: HTMLElement, private readonly source: MinimapSource) {
    if (!document.getElementById("cow-minimap-style")) {
      const style = document.createElement("style");
      style.id = "cow-minimap-style";
      style.textContent = STYLE;
      document.head.append(style);
    }
    const root = document.createElement("div");
    root.className = "cow-minimap";
    const canvas = document.createElement("canvas");
    canvas.dataset.testid = "minimap";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Minimap");
    this.ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = canvas.height = SIZE * this.ratio;
    const credit = document.createElement("small");
    credit.textContent = source.attribution;
    root.append(canvas, credit);
    parent.append(root);

    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas is not available for the minimap.");
    this.context = context;
    for (const road of source.roads) this.roads.add(road, boxOf(road.points));
    for (const area of source.areas) this.areas.add(area, boxOf(area.outline));
  }

  /** Lines drawn over the roads on every tile they cross (railway tracks). Call once. */
  addLines(lines: ReadonlyArray<{ readonly points: readonly MapPoint[]; readonly width: number }>): void {
    for (const line of lines) for (const k of this.lines.add(line, boxOf(line.points))) this.painted.delete(k);
  }

  /** A chunk's buildings arrived: draw them on the tiles they touch. */
  addBuildings(key: string, outlines: ReadonlyArray<{ readonly outline: readonly MapPoint[] }>): void {
    this.removeBuildings(key);
    const filed = outlines.map(({ outline }) => ({ outline, keys: this.buildings.add(outline, boxOf(outline)) }));
    this.chunkBuildings.set(key, filed);
    for (const f of filed) for (const k of f.keys) this.painted.delete(k);
  }

  /** A chunk was unloaded: forget its buildings. */
  removeBuildings(key: string): void {
    const filed = this.chunkBuildings.get(key);
    if (!filed) return;
    for (const f of filed) {
      this.buildings.remove(f.outline, f.keys);
      for (const k of f.keys) this.painted.delete(k);
    }
    this.chunkBuildings.delete(key);
  }

  /** The tile's canvas, painted now if it isn't cached. */
  private tile(col: number, row: number): HTMLCanvasElement {
    const key = `${col},${row}`;
    const cached = this.painted.get(key);
    if (cached) {
      this.painted.delete(key);
      this.painted.set(key, cached);
      return cached;
    }
    const canvas = this.painted.size >= KEEP_TILES ? this.recycle() : document.createElement("canvas");
    canvas.width = canvas.height = Math.ceil(TILE * PIXELS_PER_METRE);
    const g = canvas.getContext("2d");
    if (!g) throw new Error("2D canvas is not available for the minimap.");
    g.setTransform(PIXELS_PER_METRE, 0, 0, PIXELS_PER_METRE, -col * TILE * PIXELS_PER_METRE, -row * TILE * PIXELS_PER_METRE);
    const { bounds } = this.source;
    g.fillStyle = "#b9ab8a";
    g.fillRect(col * TILE, row * TILE, TILE, TILE);
    g.fillStyle = "#cdbf9c";
    g.fillRect(bounds.minX, bounds.minZ, bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    const trace = (outline: readonly MapPoint[]) => {
      g.beginPath();
      outline.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.z) : g.lineTo(p.x, p.z)));
      g.closePath();
    };
    if (this.source.sea) {
      g.fillStyle = "#6fa6c6";
      trace(this.source.sea.outline);
      g.fill();
    }
    for (const area of this.areas.get(key)) {
      g.fillStyle = area.kind === "water" ? "#7fb2d0" : area.kind === "beach" ? "#eedcae" : "#8fc07a";
      trace(area.outline);
      g.fill();
    }
    g.fillStyle = "#a89a80";
    for (const outline of this.buildings.get(key)) {
      trace(outline);
      g.fill();
    }
    g.fillStyle = "#e9dfc9";
    g.strokeStyle = "#8c7b5d";
    g.lineWidth = 1.2;
    for (const landmark of this.source.landmarks ?? []) {
      if (landmark.radius === undefined) continue;
      g.beginPath();
      g.arc(landmark.x, landmark.z, landmark.radius, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.lineCap = g.lineJoin = "round";
    const order = [...this.roads.get(key)].sort((a, b) => a.width - b.width);
    for (const road of order) {
      g.strokeStyle = road.kind === "footway" ? "#e6dcc6" : road.kind === "primary" ? "#ffe9a8" : road.kind === "secondary" || road.kind === "tertiary" ? "#ffffff" : "#f3efe6";
      g.lineWidth = Math.max(2.5, road.width);
      g.beginPath();
      road.points.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.z) : g.lineTo(p.x, p.z)));
      g.stroke();
    }
    // Railway tracks: a grey line with white dashes, over the roads.
    for (const line of this.lines.get(key)) {
      g.beginPath();
      line.points.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.z) : g.lineTo(p.x, p.z)));
      g.strokeStyle = "#5b5e66";
      g.lineWidth = line.width;
      g.setLineDash([]);
      g.stroke();
      g.strokeStyle = "#f4f4f4";
      g.lineWidth = line.width * 0.4;
      g.setLineDash([line.width * 2, line.width * 2]);
      g.stroke();
      g.setLineDash([]);
    }
    this.painted.set(key, canvas);
    return canvas;
  }

  /** Reuse the least recently used tile's canvas. */
  private recycle(): HTMLCanvasElement {
    const [oldest, canvas] = this.painted.entries().next().value as [string, HTMLCanvasElement];
    this.painted.delete(oldest);
    return canvas;
  }

  /**
   * @param dt seconds since the last call; the map redraws about 15 times a second
   * @param heading direction the player or vehicle faces
   * @param cameraYaw the map is turned so the camera's forward is up
   */
  update(dt: number, x: number, z: number, heading: number, cameraYaw: number, markers: readonly MinimapMarker[]): void {
    this.sinceDraw += dt;
    if (this.sinceDraw < 1 / 15) return;
    this.sinceDraw = 0;

    const g = this.context;
    const size = SIZE * this.ratio;
    const scale = size / 2 / VIEW_RADIUS; // canvas pixels per metre on screen
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, size, size);
    g.save();
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = "#b9ab8a";
    g.fillRect(0, 0, size, size);

    g.translate(size / 2, size / 2);
    g.rotate(cameraYaw);
    g.scale(scale, scale);
    g.translate(-x, -z);
    // The view is a circle of VIEW_RADIUS turned any way: the tiles its square covers.
    for (let c = Math.floor((x - VIEW_RADIUS) / TILE); c <= Math.floor((x + VIEW_RADIUS) / TILE); c++) {
      for (let r = Math.floor((z - VIEW_RADIUS) / TILE); r <= Math.floor((z + VIEW_RADIUS) / TILE); r++) {
        // A hair over size, so the seams between tiles never show.
        g.drawImage(this.tile(c, r), c * TILE, r * TILE, TILE + 0.4, TILE + 0.4);
      }
    }

    for (const marker of markers) {
      let mx = marker.x;
      let mz = marker.z;
      const distance = Math.hypot(mx - x, mz - z);
      const rim = VIEW_RADIUS - 8;
      if (distance > rim) {
        if (!marker.pinned) continue;
        mx = x + ((mx - x) / distance) * rim;
        mz = z + ((mz - z) / distance) * rim;
      }
      const r = (marker.size ?? 5) / scale;
      g.fillStyle = marker.color;
      g.strokeStyle = "#1a1a1a";
      g.lineWidth = 1.2 / scale;
      g.beginPath();
      g.arc(mx, mz, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }

    // Landmarks in view: a small badge with the name's initial, kept upright as the map turns.
    for (const landmark of this.source.landmarks ?? []) {
      if (Math.hypot(landmark.x - x, landmark.z - z) > VIEW_RADIUS - 6) continue;
      g.save();
      g.translate(landmark.x, landmark.z);
      g.rotate(-cameraYaw);
      g.scale(1 / scale, 1 / scale);
      const r = 7 * this.ratio;
      g.fillStyle = "#7a3f2e";
      g.strokeStyle = "#ffffff";
      g.lineWidth = 1.4 * this.ratio;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = "#ffffff";
      g.font = `700 ${Math.round(9 * this.ratio)}px system-ui,sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(landmark.name.charAt(0).toUpperCase(), 0, 0.5 * this.ratio);
      g.restore();
    }

    // The player: an arrow pointing the way they face.
    g.translate(x, z);
    g.rotate(-heading);
    const a = 7 / scale;
    g.fillStyle = "#1e6fe0";
    g.strokeStyle = "#ffffff";
    g.lineWidth = 1.6 / scale;
    g.beginPath();
    g.moveTo(0, -a);
    g.lineTo(a * 0.7, a * 0.8);
    g.lineTo(0, a * 0.35);
    g.lineTo(-a * 0.7, a * 0.8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
