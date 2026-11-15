/**
 * Round minimap that turns with the camera. The whole map is drawn once to an off-screen
 * canvas; each refresh only copies and rotates the part around the player.
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
  readonly chunks: ReadonlyArray<{ readonly buildings: ReadonlyArray<{ readonly outline: readonly MapPoint[] }> }>;
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

const STYLE = `
.cow-minimap{position:absolute;right:calc(14px + env(safe-area-inset-right));top:calc(64px + env(safe-area-inset-top));width:${SIZE}px;pointer-events:none}
.cow-minimap canvas{width:${SIZE}px;height:${SIZE}px;border-radius:50%;border:2px solid rgba(255,255,255,.75);background:#cdbf9c;display:block;box-shadow:0 2px 10px rgba(0,0,0,.35)}
.cow-minimap small{display:block;text-align:center;font:500 8px system-ui,sans-serif;color:#fff;opacity:.85;margin-top:2px;text-shadow:0 1px 2px #000}
`;

export class Minimap {
  private readonly context: CanvasRenderingContext2D;
  private readonly world: HTMLCanvasElement;
  private readonly ratio: number;
  private sinceDraw = 1;

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
    this.world = this.paintWorld();
  }

  /** Draw the whole map once. */
  private paintWorld(): HTMLCanvasElement {
    const { bounds } = this.source;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil((bounds.maxX - bounds.minX) * PIXELS_PER_METRE);
    canvas.height = Math.ceil((bounds.maxZ - bounds.minZ) * PIXELS_PER_METRE);
    const g = canvas.getContext("2d");
    if (!g) throw new Error("2D canvas is not available for the minimap.");
    g.scale(PIXELS_PER_METRE, PIXELS_PER_METRE);
    g.translate(-bounds.minX, -bounds.minZ);
    g.fillStyle = "#cdbf9c";
    g.fillRect(bounds.minX, bounds.minZ, bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);

    const trace = (outline: readonly MapPoint[]) => {
      g.beginPath();
      outline.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.z) : g.lineTo(p.x, p.z)));
      g.closePath();
    };
    for (const area of this.source.areas) {
      g.fillStyle = area.kind === "water" ? "#7fb2d0" : "#8fc07a";
      trace(area.outline);
      g.fill();
    }
    g.fillStyle = "#a89a80";
    for (const chunk of this.source.chunks) {
      for (const building of chunk.buildings) {
        trace(building.outline);
        g.fill();
      }
    }
    g.lineCap = g.lineJoin = "round";
    // Wide roads last so they sit on top of lanes that meet them.
    const order = [...this.source.roads].sort((a, b) => a.width - b.width);
    for (const road of order) {
      g.strokeStyle = road.kind === "footway" ? "#e6dcc6" : road.kind === "secondary" || road.kind === "tertiary" ? "#ffffff" : "#f3efe6";
      g.lineWidth = Math.max(2.5, road.width);
      g.beginPath();
      road.points.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.z) : g.lineTo(p.x, p.z)));
      g.stroke();
    }
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
    const { bounds } = this.source;
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
    g.drawImage(this.world, bounds.minX, bounds.minZ, bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);

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
