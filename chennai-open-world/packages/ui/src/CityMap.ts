/**
 * Full-screen city map, opened by tapping the minimap: north up, centred on the player, with
 * pinch / drag / double-tap zoom and pan, +/− and "centre on me" buttons, and a close button.
 *
 * Why a 2D canvas and not WebGL: the 3D renderer is idle while the map is open (the game is
 * held), and a flat map of lines and labels is what canvas 2D is good at, without a second GL
 * context on a phone that already struggles to keep one.
 *
 * Why it stays smooth: the map is only redrawn when something changed (a gesture, a button, a
 * resize), never every frame. Roads and areas are filed by 1 km grid cell, and for each zoom
 * band a cell's lines are simplified and baked into Path2D objects the first time they are
 * needed; a redraw then strokes the ready-made paths of the cells on screen and nothing else.
 * The "you are here" marker is a DOM element with a CSS pulse, so the pulse needs no redraws.
 *
 * The road network (`roads.bin`) covers the whole city and is always in memory, so roads are
 * drawn everywhere. Buildings only exist where chunks are loaded (near the player); they are
 * drawn there when zoomed in, and nowhere else.
 */

import { drawPlaceIcon, type PlaceIcon } from "./placeIcons";
import {
  ZOOM_BANDS,
  bandFor,
  boxOf,
  boxesOverlap,
  cellsIn,
  chainLines,
  straightRuns,
  clampCentre,
  clampScale,
  fitScale,
  panBy,
  pinToEdge,
  pinchView,
  scaleBar,
  screenToWorld,
  simplify,
  visibleBox,
  worldToScreen,
  zoomAbout,
  type MapBounds,
  type MapPoint,
  type MapRoadKind,
  type CityView,
  type ScreenPoint,
  type ZoomLimits,
} from "./cityMapMath";

/** The parts of the world map the city map draws (structurally matches the game's `WorldMap`). */
export interface CityMapSource {
  readonly bounds: MapBounds;
  readonly attribution: string;
  readonly dataDate?: string;
  readonly roads: ReadonlyArray<{ readonly kind: string; readonly width: number; readonly name?: string | undefined; readonly points: readonly MapPoint[] }>;
  readonly areas: ReadonlyArray<{ readonly kind: string; readonly outline: readonly MapPoint[] }>;
  readonly sea?: { readonly outline: readonly MapPoint[] } | undefined;
  readonly districts?: ReadonlyArray<{ readonly name: string; readonly kind: string; readonly x: number; readonly z: number }> | undefined;
  readonly landmarks?: ReadonlyArray<{ readonly name: string; readonly x: number; readonly z: number; readonly radius?: number | undefined }> | undefined;
}

/** Railway tracks and stations (from `world/rail.json`). */
export interface CityMapRail {
  readonly tracks: ReadonlyArray<{ readonly points: readonly MapPoint[] }>;
  readonly stations: ReadonlyArray<{ readonly name: string; readonly x: number; readonly z: number }>;
}

export type CityMapMarker =
  /** The current objective or job stop: a flag, pinned to the screen edge when off screen. */
  | { readonly kind: "target"; readonly x: number; readonly z: number }
  /** A vehicle the player can take (car, auto, bike, ambulance, bus). */
  | { readonly kind: "vehicle"; readonly x: number; readonly z: number; readonly vehicle: string; readonly color: string }
  /** A place the player can go into. */
  | { readonly kind: "place"; readonly x: number; readonly z: number; readonly icon: PlaceIcon }
  /** A small coloured dot (share auto passengers waiting or their drops). */
  | { readonly kind: "dot"; readonly x: number; readonly z: number; readonly color: string };

export interface CityMapPlayer {
  readonly x: number;
  readonly z: number;
  /** Facing, the game's yaw (0 faces north, as on the minimap). */
  readonly heading: number;
}

/** What tests and the debug snapshot read about the map. */
export interface CityMapState {
  readonly open: boolean;
  /** CSS pixels per metre. */
  readonly zoom: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly centre: { x: number; z: number };
  /** The player marker: world position, heading, and where it is drawn on screen (CSS px, page coordinates). */
  readonly marker: { x: number; z: number; heading: number; screenX: number; screenY: number } | null;
  /** Detail band in use (0 = whole city … 4 = street level). */
  readonly band: number;
  /** Times the canvas was redrawn since the page loaded (redraws happen only on change). */
  readonly draws: number;
  /** How long the last redraw took, ms (to watch performance on a phone). */
  readonly drawMs: number;
}

export interface CityMapOpen {
  readonly player: CityMapPlayer;
  readonly markers: readonly CityMapMarker[];
  /** A job's route, drawn as a line. */
  readonly route?: readonly MapPoint[] | null;
  /** Building outlines of the loaded chunks. */
  readonly buildings?: Iterable<{ readonly key: string; readonly buildings: ReadonlyArray<{ readonly outline: readonly MapPoint[] }> }>;
  /** Shown in the header ("Mylapore", "Luz Church Road"). */
  readonly district?: string;
  readonly street?: string;
}

const CELL = 1000; // metres per culling cell
const OPEN_SCALE = 0.5; // px per metre when first opened: about 1.8 km across a phone held sideways
const MAX_SCALE = 6; // street level: a 7 m lane is 42 px
const BUTTON_ZOOM = 2;
const DOUBLE_TAP_MS = 320;
const TAP_SLOP = 10; // px a finger may wander and still count as a tap

const KIND_ORDER: readonly MapRoadKind[] = ["footway", "service", "residential", "tertiary", "secondary", "primary"];
interface RoadStyle {
  readonly fill: string;
  readonly casing: string;
  /** Narrowest the line is drawn, px, however far out. */
  readonly minPx: number;
}
// Muted land, white streets, yellow arterials: an original style in the spirit of printed city maps.
const ROAD_STYLE: Record<MapRoadKind, RoadStyle> = {
  primary: { fill: "#f6c75a", casing: "#c2902c", minPx: 2.4 },
  secondary: { fill: "#fbe49a", casing: "#c9ad63", minPx: 1.8 },
  tertiary: { fill: "#ffffff", casing: "#bdb3a2", minPx: 1.3 },
  residential: { fill: "#ffffff", casing: "#cfc6b6", minPx: 0.9 },
  service: { fill: "#fbf9f4", casing: "#d6cfc2", minPx: 0.7 },
  footway: { fill: "#a99d89", casing: "#a99d89", minPx: 0.8 },
};
const AREA_FILL: Record<string, string> = { park: "#cfe2b5", water: "#a9cde4", beach: "#f2e5c2" };
const COLORS = {
  outside: "#d8d2c5",
  land: "#efe9dd",
  sea: "#9fc6e0",
  coast: "#86b3d1",
  building: "#dcd3c4",
  buildingEdge: "#c8bda9",
  landmark: "#e7d5bd",
  rail: "#5d6069",
  station: "#1d3c78",
  district: "#5c5346",
  street: "#3d382f",
  target: "#ff9f1c",
};

const VEHICLE_LETTER: Record<string, string> = { car: "C", auto: "A", bike: "B", ambulance: "+", bus: "Bus" };

const STYLE = `
.cow-citymap{position:absolute;inset:0;z-index:30;pointer-events:auto;background:${COLORS.outside};touch-action:none;user-select:none;-webkit-user-select:none;font-family:system-ui,sans-serif;color:#2b2823;overflow:hidden}
.cow-citymap[hidden]{display:none}
.cow-citymap canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.cow-cm-you{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none}
.cow-cm-you i{position:absolute;left:-22px;top:-22px;width:44px;height:44px;border-radius:50%;background:rgba(30,111,224,.25);border:2px solid rgba(30,111,224,.7);box-sizing:border-box;animation:cow-cm-pulse 1.6s ease-out infinite}
.cow-cm-you svg{position:absolute;left:-14px;top:-14px;width:28px;height:28px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}
@keyframes cow-cm-pulse{0%{transform:scale(.45);opacity:1}100%{transform:scale(1.35);opacity:0}}
@media (prefers-reduced-motion:reduce){.cow-cm-you i{animation:none;opacity:.6}}
.cow-cm-head{position:absolute;top:calc(10px + env(safe-area-inset-top));left:calc(12px + env(safe-area-inset-left));max-width:calc(100% - 200px);
  background:rgba(255,255,255,.9);border-radius:12px;padding:6px 12px;box-shadow:0 1px 6px rgba(0,0,0,.18);pointer-events:none}
.cow-cm-head b{display:block;font-size:14px}
.cow-cm-head span{display:block;font-size:12px;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cow-cm-north{position:absolute;top:calc(68px + env(safe-area-inset-top));left:calc(12px + env(safe-area-inset-left));width:36px;height:36px;border-radius:50%;
  background:rgba(255,255,255,.9);box-shadow:0 1px 6px rgba(0,0,0,.18);pointer-events:none}
.cow-cm-north svg{width:36px;height:36px;display:block}
.cow-cm-btn{position:absolute;width:48px;height:48px;border-radius:12px;border:0;background:rgba(255,255,255,.94);color:#2b2823;box-shadow:0 1px 6px rgba(0,0,0,.25);
  display:flex;align-items:center;justify-content:center;padding:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.cow-cm-btn:active{background:#e8e2d6}
.cow-cm-btn svg{width:24px;height:24px;display:block}
.cow-cm-close{top:calc(10px + env(safe-area-inset-top));right:calc(12px + env(safe-area-inset-right))}
.cow-cm-zoom{position:absolute;right:calc(12px + env(safe-area-inset-right));bottom:calc(12px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px}
.cow-cm-zoom .cow-cm-btn{position:static}
.cow-cm-scale{position:absolute;left:calc(12px + env(safe-area-inset-left));bottom:calc(12px + env(safe-area-inset-bottom));pointer-events:none;
  background:rgba(255,255,255,.85);border-radius:8px;padding:4px 8px 5px;font:600 11px system-ui,sans-serif}
.cow-cm-scale i{display:block;height:5px;border:2px solid #2b2823;border-top:0;margin-top:2px}
.cow-cm-credit{position:absolute;right:calc(72px + env(safe-area-inset-right));bottom:calc(8px + env(safe-area-inset-bottom));pointer-events:none;
  background:rgba(255,255,255,.8);border-radius:6px;padding:2px 6px;font:500 10px system-ui,sans-serif;color:#3d382f}
`;

const ICONS = {
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>',
  me: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5" stroke="currentColor" stroke-width="2.2" fill="none"/><circle cx="12" cy="12" r="2.6" fill="#1e6fe0"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  north: '<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M18 5l6 16-6-3.5-6 3.5z" fill="#c8372d"/><path d="M18 31l6-10-6 3.5-6-3.5z" fill="#8d877c"/><text x="18" y="18.6" text-anchor="middle" font-size="7.5" font-weight="800" fill="#fff" font-family="system-ui,sans-serif">N</text></svg>',
  you: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="10" fill="#ffffff"/><path d="M14 5.5l6 13.5-6-3.4-6 3.4z" fill="#1e6fe0" stroke="#0b3f8a" stroke-width="1" stroke-linejoin="round"/></svg>',
};

interface CellPaths {
  readonly roads: Map<MapRoadKind, Path2D>;
  readonly areas: Map<string, Path2D>;
}

interface StreetLabel {
  readonly name: string;
  readonly rank: number; // 0 primary, 1 secondary, 2 tertiary, 3 residential
  readonly x: number;
  readonly z: number;
  readonly angle: number;
  readonly length: number;
}

/** Road classes that get their names written along them, most important first, and the scale each starts at. */
const STREET_RANK: Record<string, number> = { primary: 0, secondary: 1, tertiary: 2, residential: 3 };
const STREET_LABEL_FROM = [0.2, 0.45, 1, 2.2];
/** Scale from which each kind of district name is shown (suburbs always). */
function districtFrom(kind: string): number {
  return kind === "suburb" ? 0 : kind === "locality" ? 0.12 : 0.3;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}

function isRoadKind(kind: string): kind is MapRoadKind {
  return (KIND_ORDER as readonly string[]).includes(kind);
}

export class CityMap {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly you: HTMLDivElement;
  private readonly youArrow: HTMLElement;
  private readonly headTitle: HTMLElement;
  private readonly headDetail: HTMLElement;
  private readonly scaleLabel: HTMLElement;
  private readonly scaleBarEl: HTMLElement;
  /** The header, buttons and scale bar: labels keep out from under them. */
  private readonly panels: readonly HTMLElement[];
  /** The OSM credit, written only while the map is shown (so a page search finds just the minimap's while it is closed). */
  private readonly credit: HTMLElement;
  private readonly creditText: string;
  private ratio = 1;
  private view: CityView = { cx: 0, cz: 0, scale: OPEN_SCALE, width: 1, height: 1 };
  private limits: ZoomLimits = { min: 0.02, max: MAX_SCALE };
  private shown = false;
  private zoomChosen = false;
  private player: CityMapPlayer = { x: 0, z: 0, heading: 0 };
  private markers: readonly CityMapMarker[] = [];
  private route: readonly MapPoint[] | null = null;
  private frameRequested = 0;
  private draws = 0;
  private drawMs = 0;

  /** Road indices and area indices by culling cell. */
  private readonly roadCells = new Map<string, number[]>();
  private readonly areaCells = new Map<string, number[]>();
  /** Baked paths, by `${band}:${cell}`. */
  private readonly cellPaths = new Map<string, CellPaths>();
  /** Simplified lines, per band, per road (and per area). */
  private readonly simplifiedRoads: Array<Map<number, MapPoint[]>> = ZOOM_BANDS.map(() => new Map());
  private readonly simplifiedAreas: Array<Map<number, MapPoint[]>> = ZOOM_BANDS.map(() => new Map());
  /** A representative width per road class (the median), so one path per class can be stroked at once. */
  private readonly kindWidth = new Map<MapRoadKind, number>();
  private readonly streetCells = new Map<string, StreetLabel[]>();
  private seaPath: Path2D | null = null;
  private railPath: Path2D | null = null;
  private stations: CityMapRail["stations"] = [];
  private buildingPath: Path2D | null = null;
  private buildingKeys = "";
  private readonly textWidths = new Map<string, number>();

  /** Fingers on the map, in CSS px relative to the map. */
  private readonly pointers = new Map<number, ScreenPoint>();
  private drag: { view: CityView; from: ScreenPoint; id: number } | null = null;
  private pinch: { view: CityView; a: ScreenPoint; b: ScreenPoint; ids: [number, number] } | null = null;
  private tapStart: { at: ScreenPoint; time: number; moved: boolean } | null = null;
  private lastTap: { at: ScreenPoint; time: number } | null = null;

  constructor(parent: HTMLElement, private readonly source: CityMapSource, private readonly onClose: () => void) {
    if (!document.getElementById("cow-citymap-style")) {
      const style = document.createElement("style");
      style.id = "cow-citymap-style";
      style.textContent = STYLE;
      document.head.append(style);
    }
    this.root = document.createElement("div");
    this.root.className = "cow-citymap";
    this.root.dataset.testid = "citymap";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", "City map");
    this.root.hidden = true;
    parent.append(this.root);

    this.canvas = element("canvas", "", this.root);
    this.canvas.dataset.testid = "citymap-canvas";
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "Map of Chennai");
    const g = this.canvas.getContext("2d");
    if (!g) throw new Error("2D canvas is not available for the city map.");
    this.g = g;

    this.you = element("div", "cow-cm-you", this.root);
    this.you.dataset.testid = "citymap-marker";
    element("i", "", this.you);
    const arrow = element("div", "", this.you);
    arrow.innerHTML = ICONS.you;
    this.youArrow = arrow;

    const head = element("div", "cow-cm-head", this.root);
    this.headTitle = element("b", "", head);
    this.headDetail = element("span", "", head);
    const north = element("div", "cow-cm-north", this.root);
    north.innerHTML = ICONS.north;
    north.setAttribute("aria-label", "North is up");

    const close = this.button("cow-cm-close", "Close map", ICONS.close, "citymap-close", this.root, () => this.close());
    const zoom = element("div", "cow-cm-zoom", this.root);
    this.button("", "Zoom in", ICONS.plus, "citymap-zoom-in", zoom, () => this.zoomBy(BUTTON_ZOOM));
    this.button("", "Zoom out", ICONS.minus, "citymap-zoom-out", zoom, () => this.zoomBy(1 / BUTTON_ZOOM));
    this.button("", "Centre on me", ICONS.me, "citymap-centre", zoom, () => this.centreOnMe());

    const scale = element("div", "cow-cm-scale", this.root);
    this.scaleLabel = element("span", "", scale);
    this.scaleBarEl = element("i", "", scale);
    this.credit = element("small", "cow-cm-credit", this.root);
    // The extract's date (the day): OSM data needs the credit and when it was taken.
    this.creditText = source.dataDate ? `${source.attribution} · ${source.dataDate.slice(0, 10)}` : source.attribution;
    this.panels = [head, north, close, zoom, scale, this.credit];

    this.index();
    this.listen();
  }

  private button(extra: string, label: string, icon: string, testid: string, parent: HTMLElement, run: () => void): HTMLButtonElement {
    const button = element("button", `cow-cm-btn ${extra}`.trim(), parent);
    button.type = "button";
    button.innerHTML = icon;
    button.setAttribute("aria-label", label);
    button.dataset.testid = testid;
    // Buttons sit over the canvas: their touches must not also start a drag.
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      run();
    });
    return button;
  }

  /** File roads, areas and street-name spots by culling cell (once, at start-up: a few ms). */
  private index(): void {
    const widths = new Map<MapRoadKind, number[]>();
    const named = new Map<string, Array<readonly MapPoint[]>>();
    this.source.roads.forEach((road, i) => {
      if (!isRoadKind(road.kind) || road.points.length < 2) return;
      for (const [c, r] of cellsIn(boxOf(road.points), CELL)) {
        const key = `${c},${r}`;
        const list = this.roadCells.get(key);
        if (list) list.push(i);
        else this.roadCells.set(key, [i]);
      }
      const w = widths.get(road.kind);
      if (w) w.push(road.width);
      else widths.set(road.kind, [road.width]);
      const rank = STREET_RANK[road.kind] ?? -1;
      if (rank < 0 || !road.name) return;
      const key = `${rank}|${road.name}`;
      const list = named.get(key);
      if (list) list.push(road.points);
      else named.set(key, [road.points]);
    });
    // Street names are written along the long straight stretches of named roads, the pieces
    // between junctions joined up first.
    for (const [key, lines] of named) {
      const bar = key.indexOf("|");
      const rank = Number(key.slice(0, bar));
      const name = key.slice(bar + 1);
      for (const chain of chainLines(lines)) {
        for (const run of straightRuns(chain, 0.2, 40)) {
          // A long straight avenue gets a spot every 300 m or so: one in the middle could be
          // hidden under a marker, or be off screen when zoomed in.
          const pieces = Math.ceil(run.length / 300);
          const piece = run.length / pieces;
          for (let k = 0; k < pieces; k++) {
            const t = -run.length / 2 + piece * (k + 0.5);
            const x = run.x + Math.cos(run.angle) * t;
            const z = run.z + Math.sin(run.angle) * t;
            const label: StreetLabel = { name, rank, x, z, angle: run.angle, length: piece };
            const cell = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
            const list = this.streetCells.get(cell);
            if (list) list.push(label);
            else this.streetCells.set(cell, [label]);
          }
        }
      }
    }
    for (const [kind, list] of widths) {
      list.sort((a, b) => a - b);
      this.kindWidth.set(kind, list[Math.floor(list.length / 2)] ?? 6);
    }
    this.source.areas.forEach((area, i) => {
      if (area.outline.length < 3) return;
      for (const [c, r] of cellsIn(boxOf(area.outline), CELL)) {
        const key = `${c},${r}`;
        const list = this.areaCells.get(key);
        if (list) list.push(i);
        else this.areaCells.set(key, [i]);
      }
    });
    if (this.source.sea) this.seaPath = this.polygon(this.source.sea.outline);
  }

  /** The railway: tracks and stations. Call once, when the rail file has loaded. */
  setRail(rail: CityMapRail): void {
    const path = new Path2D();
    for (const track of rail.tracks) this.line(path, track.points);
    this.railPath = path;
    this.stations = rail.stations;
    this.invalidate();
  }

  private polygon(points: readonly MapPoint[], path = new Path2D()): Path2D {
    points.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.z) : path.lineTo(p.x, p.z)));
    path.closePath();
    return path;
  }

  private line(path: Path2D, points: readonly MapPoint[]): void {
    points.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.z) : path.lineTo(p.x, p.z)));
  }

  /** A cell's baked paths for a band, made the first time they are drawn. */
  private paths(band: number, key: string): CellPaths {
    const id = `${band}:${key}`;
    const cached = this.cellPaths.get(id);
    if (cached) return cached;
    const spec = ZOOM_BANDS[band]!;
    const roads = new Map<MapRoadKind, Path2D>();
    for (const i of this.roadCells.get(key) ?? []) {
      const road = this.source.roads[i]!;
      const kind = road.kind as MapRoadKind;
      if (!spec.kinds.has(kind)) continue;
      const memo = this.simplifiedRoads[band]!;
      let points = memo.get(i);
      if (!points) memo.set(i, (points = simplify(road.points, spec.tolerance)));
      let path = roads.get(kind);
      if (!path) roads.set(kind, (path = new Path2D()));
      this.line(path, points);
    }
    const areas = new Map<string, Path2D>();
    for (const i of this.areaCells.get(key) ?? []) {
      const area = this.source.areas[i]!;
      const memo = this.simplifiedAreas[band]!;
      let points = memo.get(i);
      if (!points) memo.set(i, (points = simplify(area.outline, spec.tolerance)));
      if (points.length < 3) continue;
      let path = areas.get(area.kind);
      if (!path) areas.set(area.kind, (path = new Path2D()));
      this.polygon(points, path);
    }
    const made = { roads, areas };
    this.cellPaths.set(id, made);
    return made;
  }

  get isOpen(): boolean {
    return this.shown;
  }

  /** Show the map centred on the player. */
  open(what: CityMapOpen): void {
    this.player = what.player;
    this.markers = what.markers;
    this.route = what.route ?? null;
    this.headTitle.textContent = what.district ? `You are in ${what.district}` : "Chennai";
    this.headDetail.textContent = what.street ?? "";
    this.headDetail.hidden = !what.street;
    if (what.buildings) this.setBuildings(what.buildings);
    this.root.hidden = false;
    this.credit.textContent = this.creditText;
    this.shown = true;
    this.pointers.clear();
    this.drag = this.pinch = this.tapStart = this.lastTap = null;
    this.resize();
    const scale = this.zoomChosen ? this.view.scale : OPEN_SCALE;
    this.setView({ ...this.view, scale: clampScale(scale, this.limits), cx: what.player.x, cz: what.player.z });
  }

  /** Hide the map (the close button, Android Back or Escape) and tell the game. */
  close(): void {
    if (!this.shown) return;
    this.shown = false;
    this.root.hidden = true;
    this.credit.textContent = "";
    this.pointers.clear();
    this.drag = this.pinch = null;
    if (this.frameRequested) cancelAnimationFrame(this.frameRequested);
    this.frameRequested = 0;
    this.onClose();
  }

  centreOnMe(): void {
    this.setView({ ...this.view, cx: this.player.x, cz: this.player.z });
  }

  /** Zoom about the middle of the screen (the +/− buttons). */
  zoomBy(factor: number): void {
    this.zoomChosen = true;
    this.setView(zoomAbout(this.view, factor, this.view.width / 2, this.view.height / 2, this.limits));
  }

  state(): CityMapState {
    const rect = this.shown ? this.root.getBoundingClientRect() : { left: 0, top: 0 };
    const p = worldToScreen(this.view, this.player.x, this.player.z);
    return {
      open: this.shown,
      zoom: this.view.scale,
      minZoom: this.limits.min,
      maxZoom: this.limits.max,
      centre: { x: this.view.cx, z: this.view.cz },
      marker: this.shown ? { x: this.player.x, z: this.player.z, heading: this.player.heading, screenX: rect.left + p.x, screenY: rect.top + p.y } : null,
      band: bandFor(this.view.scale),
      draws: this.draws,
      drawMs: this.drawMs,
    };
  }

  private setBuildings(chunks: NonNullable<CityMapOpen["buildings"]>): void {
    const list = [...chunks];
    const keys = list.map((c) => c.key).sort().join(";");
    if (keys === this.buildingKeys) return;
    this.buildingKeys = keys;
    const path = new Path2D();
    for (const chunk of list) for (const b of chunk.buildings) if (b.outline.length >= 3) this.polygon(b.outline, path);
    this.buildingPath = path;
  }

  private setView(next: CityView): void {
    this.view = clampCentre(next, this.source.bounds);
    this.invalidate();
  }

  private resize(): void {
    const width = Math.max(1, this.root.clientWidth);
    const height = Math.max(1, this.root.clientHeight);
    this.ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * this.ratio);
    this.canvas.height = Math.round(height * this.ratio);
    // Zoomed all the way out, the whole city fits on screen.
    this.limits = { min: Math.min(MAX_SCALE, fitScale(this.source.bounds, width, height, 12)), max: MAX_SCALE };
    this.view = { ...this.view, width, height, scale: clampScale(this.view.scale, this.limits) };
  }

  private invalidate(): void {
    if (!this.shown || this.frameRequested) return;
    this.frameRequested = requestAnimationFrame(() => {
      this.frameRequested = 0;
      if (this.shown) this.draw();
    });
  }

  private local(event: PointerEvent | WheelEvent | MouseEvent): ScreenPoint {
    const rect = this.root.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private listen(): void {
    const c = this.canvas;
    c.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      try {
        c.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic pointers (tests) cannot be captured; moves still reach the canvas.
      }
      const at = this.local(event);
      this.pointers.set(event.pointerId, at);
      if (this.pointers.size === 1) {
        this.drag = { view: this.view, from: at, id: event.pointerId };
        this.tapStart = { at, time: performance.now(), moved: false };
      } else if (this.pointers.size === 2) {
        const [[ia, a], [ib, b]] = [...this.pointers.entries()] as [[number, ScreenPoint], [number, ScreenPoint]];
        this.pinch = { view: this.view, a, b, ids: [ia, ib] };
        this.drag = null;
        this.tapStart = null;
        this.lastTap = null;
      }
    });
    c.addEventListener("pointermove", (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      const at = this.local(event);
      this.pointers.set(event.pointerId, at);
      if (this.pinch) {
        const a = this.pointers.get(this.pinch.ids[0]);
        const b = this.pointers.get(this.pinch.ids[1]);
        if (a && b) {
          this.zoomChosen = true;
          this.setView(pinchView(this.pinch.view, this.pinch.a, this.pinch.b, a, b, this.limits));
        }
      } else if (this.drag && this.drag.id === event.pointerId) {
        const dx = at.x - this.drag.from.x;
        const dy = at.y - this.drag.from.y;
        if (this.tapStart && Math.hypot(dx, dy) > TAP_SLOP) this.tapStart.moved = true;
        if (!this.tapStart || this.tapStart.moved) this.setView(panBy(this.drag.view, dx, dy));
      }
    });
    const up = (event: PointerEvent) => {
      if (!this.pointers.has(event.pointerId)) return;
      const at = this.local(event);
      this.pointers.delete(event.pointerId);
      if (this.pinch) {
        this.pinch = null;
        // One finger left after a pinch carries on as a drag, from where the map is now.
        const [rest] = [...this.pointers.entries()];
        this.drag = rest ? { view: this.view, from: rest[1], id: rest[0] } : null;
        return;
      }
      const tap = this.tapStart;
      this.tapStart = null;
      this.drag = null;
      if (event.type !== "pointerup" || !tap || tap.moved) return;
      const now = performance.now();
      const last = this.lastTap;
      if (last && now - last.time < DOUBLE_TAP_MS && Math.hypot(at.x - last.at.x, at.y - last.at.y) < 40) {
        this.lastTap = null;
        this.zoomChosen = true;
        this.setView(zoomAbout(this.view, 2, at.x, at.y, this.limits));
      } else this.lastTap = { at, time: now };
    };
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const at = this.local(event);
        this.zoomChosen = true;
        this.setView(zoomAbout(this.view, Math.exp(-event.deltaY * 0.0015), at.x, at.y, this.limits));
      },
      { passive: false },
    );
    window.addEventListener("keydown", (event) => {
      if (!this.shown) return;
      if (event.key === "Escape") this.close();
      else if (event.key === "+" || event.key === "=") this.zoomBy(BUTTON_ZOOM);
      else if (event.key === "-") this.zoomBy(1 / BUTTON_ZOOM);
    });
    window.addEventListener("resize", () => {
      if (!this.shown) return;
      this.resize();
      this.setView(this.view);
    });
  }

  private measure(font: string, text: string): number {
    const key = `${font}|${text}`;
    let w = this.textWidths.get(key);
    if (w === undefined) {
      this.g.font = font;
      w = this.g.measureText(text).width;
      this.textWidths.set(key, w);
    }
    return w;
  }

  /** Paint everything on screen. Called at most once per animation frame, and only after a change. */
  private draw(): void {
    this.draws++;
    const began = performance.now();
    const g = this.g;
    const v = this.view;
    const r = this.ratio;
    const s = v.scale;
    const band = bandFor(s);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = COLORS.outside;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // World space: one transform for every path; line widths are divided by the scale to stay in px.
    g.setTransform(r * s, 0, 0, r * s, r * (v.width / 2 - v.cx * s), r * (v.height / 2 - v.cz * s));
    const px = (n: number) => n / s;
    const b = this.source.bounds;
    g.fillStyle = COLORS.land;
    g.fillRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
    if (this.seaPath) {
      g.fillStyle = COLORS.sea;
      g.fill(this.seaPath);
      g.strokeStyle = COLORS.coast;
      g.lineWidth = px(1.5);
      g.stroke(this.seaPath);
    }

    const box = visibleBox(v, 40);
    const cells = cellsIn(box, CELL).map(([c, row]) => this.paths(band, `${c},${row}`));
    for (const kind of ["park", "beach", "water"]) {
      g.fillStyle = AREA_FILL[kind] ?? AREA_FILL.park!;
      for (const cell of cells) {
        const path = cell.areas.get(kind);
        if (path) g.fill(path);
      }
    }
    if (s >= 0.45) {
      g.fillStyle = COLORS.landmark;
      for (const l of this.source.landmarks ?? []) {
        if (!l.radius || l.x < box.minX || l.x > box.maxX || l.z < box.minZ || l.z > box.maxZ) continue;
        g.beginPath();
        g.arc(l.x, l.z, l.radius, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (this.buildingPath && s >= 0.9) {
      g.fillStyle = COLORS.building;
      g.fill(this.buildingPath);
      if (s >= 2) {
        g.strokeStyle = COLORS.buildingEdge;
        g.lineWidth = px(0.8);
        g.stroke(this.buildingPath);
      }
    }

    g.lineCap = g.lineJoin = "round";
    const width = (kind: MapRoadKind) => Math.max(ROAD_STYLE[kind].minPx, (this.kindWidth.get(kind) ?? 6) * s);
    // Footpaths: thin dashes, no casing.
    if (ZOOM_BANDS[band]!.kinds.has("footway")) {
      g.strokeStyle = ROAD_STYLE.footway.fill;
      g.lineWidth = px(Math.max(1, Math.min(2, 2 * s * 0.5)));
      g.setLineDash([px(3), px(3)]);
      for (const cell of cells) {
        const path = cell.roads.get("footway");
        if (path) g.stroke(path);
      }
      g.setLineDash([]);
    }
    const drawn = KIND_ORDER.filter((k) => k !== "footway" && ZOOM_BANDS[band]!.kinds.has(k));
    // Casings first, then fills, so junctions join cleanly. Zoomed far out, casings would only blur.
    if (s >= 0.15) {
      for (const kind of drawn) {
        g.strokeStyle = ROAD_STYLE[kind].casing;
        g.lineWidth = px(width(kind) + (s >= 1 ? 2 : 1.4));
        for (const cell of cells) {
          const path = cell.roads.get(kind);
          if (path) g.stroke(path);
        }
      }
    }
    for (const kind of drawn) {
      // Far out, the white streets are drawn a little darker than the land would hide them.
      g.strokeStyle = s < 0.15 && (kind === "tertiary" || kind === "residential") ? "#cbbfa8" : ROAD_STYLE[kind].fill;
      g.lineWidth = px(width(kind));
      for (const cell of cells) {
        const path = cell.roads.get(kind);
        if (path) g.stroke(path);
      }
    }

    if (this.route && this.route.length > 1) {
      const path = new Path2D();
      this.line(path, this.route);
      g.strokeStyle = "rgba(245, 160, 0, 0.85)";
      g.lineWidth = px(5);
      g.stroke(path);
    }

    if (this.railPath) {
      g.strokeStyle = COLORS.rail;
      g.lineWidth = px(s >= 0.3 ? 4 : 2.4);
      g.stroke(this.railPath);
      if (s >= 0.3) {
        g.strokeStyle = "#f4f4f4";
        g.lineWidth = px(1.6);
        g.setLineDash([px(6), px(6)]);
        g.stroke(this.railPath);
        g.setLineDash([]);
      }
    }

    // Screen space: labels and markers, at a fixed size whatever the zoom.
    g.setTransform(r, 0, 0, r, 0, 0);
    const taken: MapBounds[] = [];
    const free = (rect: MapBounds) => {
      for (const t of taken) if (boxesOverlap(t, rect)) return false;
      taken.push(rect);
      return true;
    };
    const you = worldToScreen(v, this.player.x, this.player.z);
    taken.push({ minX: you.x - 24, maxX: you.x + 24, minZ: you.y - 24, maxZ: you.y + 24 });
    const markerSpots = this.markers.map((m) => ({ m, p: worldToScreen(v, m.x, m.z) }));
    for (const { m, p } of markerSpots) if (m.kind !== "target") taken.push({ minX: p.x - 10, maxX: p.x + 10, minZ: p.y - 10, maxZ: p.y + 10 });
    // No label is written under the buttons, the header or the scale bar, where it couldn't be read.
    const origin = this.root.getBoundingClientRect();
    for (const panel of this.panels) {
      const rect = panel.getBoundingClientRect();
      if (rect.width > 0) taken.push({ minX: rect.left - origin.left - 4, maxX: rect.right - origin.left + 4, minZ: rect.top - origin.top - 4, maxZ: rect.bottom - origin.top + 4 });
    }

    this.drawStations(v, free);
    this.drawStreetNames(v, box, free);
    this.drawDistricts(v, free);
    this.drawMarkers(v, markerSpots);

    this.you.style.transform = `translate(${you.x}px, ${you.y}px)`;
    this.youArrow.style.transform = `rotate(${-this.player.heading}rad)`;
    const bar = scaleBar(s, 110);
    this.scaleLabel.textContent = bar.label;
    this.scaleBarEl.style.width = `${Math.round(bar.px)}px`;
    this.drawMs = performance.now() - began;
  }

  private halo(text: string, x: number, y: number): void {
    const g = this.g;
    g.lineJoin = "round";
    g.strokeStyle = "rgba(255,255,255,0.92)";
    g.lineWidth = 3;
    g.strokeText(text, x, y);
    g.fillText(text, x, y);
  }

  private drawStations(v: CityView, free: (rect: MapBounds) => boolean): void {
    const g = this.g;
    const font = "600 11px system-ui,sans-serif";
    for (const st of this.stations) {
      const p = worldToScreen(v, st.x, st.z);
      if (p.x < -20 || p.y < -20 || p.x > v.width + 20 || p.y > v.height + 20) continue;
      const rad = v.scale >= 0.3 ? 5 : 3.5;
      g.fillStyle = "#ffffff";
      g.strokeStyle = COLORS.station;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.x, p.y, rad, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (v.scale < 0.12) continue;
      const w = this.measure(font, st.name);
      const rect = { minX: p.x + 7, maxX: p.x + 9 + w, minZ: p.y - 7, maxZ: p.y + 7 };
      if (!free(rect)) continue;
      g.font = font;
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.fillStyle = COLORS.station;
      this.halo(st.name, p.x + 8, p.y);
    }
  }

  private drawStreetNames(v: CityView, box: MapBounds, free: (rect: MapBounds) => boolean): void {
    const candidates: StreetLabel[] = [];
    for (const [c, row] of cellsIn(box, CELL)) {
      for (const label of this.streetCells.get(`${c},${row}`) ?? []) {
        if (v.scale < STREET_LABEL_FROM[label.rank]!) continue;
        if (label.x < box.minX || label.x > box.maxX || label.z < box.minZ || label.z > box.maxZ) continue;
        candidates.push(label);
      }
    }
    candidates.sort((a, b) => a.rank - b.rank || b.length - a.length);
    const g = this.g;
    const placed = new Map<string, ScreenPoint[]>();
    let count = 0;
    for (const label of candidates) {
      if (count >= 28) break;
      const font = `${label.rank === 0 ? 700 : 600} ${label.rank <= 1 ? 12 : 11}px system-ui,sans-serif`;
      const w = this.measure(font, label.name);
      // The text may run a little past the straight stretch it sits on, not much more.
      if (w > label.length * v.scale + 30) continue;
      const p = worldToScreen(v, label.x, label.z);
      if (p.x < 0 || p.y < 0 || p.x > v.width || p.y > v.height) continue;
      const near = placed.get(label.name);
      if (near?.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 320)) continue;
      const cos = Math.abs(Math.cos(label.angle));
      const sin = Math.abs(Math.sin(label.angle));
      const hw = (w * cos + 14 * sin) / 2;
      const hh = (w * sin + 14 * cos) / 2;
      // A name cut off by the screen's edge can't be read: wait for a spot fully on screen.
      if (p.x - hw < 2 || p.y - hh < 2 || p.x + hw > v.width - 2 || p.y + hh > v.height - 2) continue;
      if (!free({ minX: p.x - hw, maxX: p.x + hw, minZ: p.y - hh, maxZ: p.y + hh })) continue;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(label.angle);
      g.font = font;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = COLORS.street;
      this.halo(label.name, 0, 0);
      g.restore();
      if (near) near.push(p);
      else placed.set(label.name, [p]);
      count++;
    }
  }

  private drawDistricts(v: CityView, free: (rect: MapBounds) => boolean): void {
    const g = this.g;
    const order = [...(this.source.districts ?? [])].filter((d) => v.scale >= districtFrom(d.kind));
    const rank = (kind: string) => (kind === "suburb" ? 0 : kind === "locality" ? 1 : 2);
    order.sort((a, b) => rank(a.kind) - rank(b.kind));
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const d of order) {
      const p = worldToScreen(v, d.x, d.z);
      if (p.x < -60 || p.y < -20 || p.x > v.width + 60 || p.y > v.height + 20) continue;
      const big = d.kind === "suburb";
      const text = big ? d.name.toUpperCase() : d.name;
      const font = big ? "700 12px system-ui,sans-serif" : "500 11px system-ui,sans-serif";
      const w = this.measure(font, text);
      if (p.x - w / 2 < 2 || p.x + w / 2 > v.width - 2 || p.y < 9 || p.y > v.height - 9) continue;
      if (!free({ minX: p.x - w / 2 - 3, maxX: p.x + w / 2 + 3, minZ: p.y - 8, maxZ: p.y + 8 })) continue;
      g.font = font;
      g.fillStyle = COLORS.district;
      this.halo(text, p.x, p.y);
    }
  }

  private drawMarkers(v: CityView, spots: ReadonlyArray<{ m: CityMapMarker; p: ScreenPoint }>): void {
    const g = this.g;
    const off = (p: ScreenPoint, pad: number) => p.x < -pad || p.y < -pad || p.x > v.width + pad || p.y > v.height + pad;
    for (const { m, p } of spots) {
      if (m.kind === "target" || off(p, 16)) continue;
      if (m.kind === "place") drawPlaceIcon(g, m.icon, p.x, p.y, 10);
      else if (m.kind === "dot") {
        g.fillStyle = m.color;
        g.strokeStyle = "#1a1a1a";
        g.lineWidth = 1.2;
        g.beginPath();
        g.arc(p.x, p.y, 5, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      } else {
        // A vehicle: a rounded tag in its minimap colour with its initial.
        const letter = VEHICLE_LETTER[m.vehicle] ?? m.vehicle.charAt(0).toUpperCase();
        const w = letter.length > 1 ? 26 : 18;
        g.fillStyle = m.color;
        g.strokeStyle = "#1f1d1a";
        g.lineWidth = 1.5;
        g.beginPath();
        g.roundRect(p.x - w / 2, p.y - 9, w, 18, 5);
        g.fill();
        g.stroke();
        g.fillStyle = m.vehicle === "ambulance" || m.vehicle === "bus" ? "#ffffff" : "#1f1d1a";
        g.font = "800 11px system-ui,sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(letter, p.x, p.y + 0.5);
      }
    }
    // The objective last, on top; off screen it waits at the edge, pointing the way.
    for (const { m, p } of spots) {
      if (m.kind !== "target") continue;
      const pin = pinToEdge(v, p, 34);
      g.save();
      g.translate(pin.x, pin.y);
      if (!pin.inside) {
        g.rotate(pin.angle);
        g.fillStyle = COLORS.target;
        g.strokeStyle = "#5a3500";
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(22, 0);
        g.lineTo(8, -8);
        g.lineTo(8, 8);
        g.closePath();
        g.fill();
        g.stroke();
        g.rotate(-pin.angle);
      }
      g.fillStyle = COLORS.target;
      g.strokeStyle = "#ffffff";
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(0, 0, 10, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      // A small flag inside the disc.
      g.strokeStyle = "#3a2400";
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(-3, 6);
      g.lineTo(-3, -6);
      g.stroke();
      g.fillStyle = "#3a2400";
      g.beginPath();
      g.moveTo(-3, -6);
      g.lineTo(5, -3.5);
      g.lineTo(-3, -1);
      g.closePath();
      g.fill();
      g.restore();
    }
  }

  /** World point under a screen point (CSS px relative to the map), for tests and debugging. */
  worldAt(x: number, y: number): MapPoint {
    return screenToWorld(this.view, x, y);
  }
}
