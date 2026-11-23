/**
 * The pure geometry behind the full-screen city map (`CityMap.ts`): world ↔ screen projection,
 * zoom limits, pinch and zoom-about-a-point, culling to the visible area, the zoom bands that
 * decide how much detail is drawn, line simplification and the scale bar. Kept free of the DOM
 * so it can be unit tested.
 *
 * The map is north up. World +X is east and -Z is north, so a world point maps to the screen
 * with no flip: screen x grows with world x and screen y grows with world z.
 */

export interface MapPoint {
  readonly x: number;
  readonly z: number;
}

export interface MapBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** What is on screen: the world point at the centre, CSS pixels per metre, and the screen size. */
export interface CityView {
  readonly cx: number;
  readonly cz: number;
  readonly scale: number;
  readonly width: number;
  readonly height: number;
}

export interface ZoomLimits {
  readonly min: number;
  readonly max: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export function worldToScreen(view: CityView, x: number, z: number): ScreenPoint {
  return { x: (x - view.cx) * view.scale + view.width / 2, y: (z - view.cz) * view.scale + view.height / 2 };
}

export function screenToWorld(view: CityView, sx: number, sy: number): MapPoint {
  return { x: view.cx + (sx - view.width / 2) / view.scale, z: view.cz + (sy - view.height / 2) / view.scale };
}

export function clampScale(scale: number, limits: ZoomLimits): number {
  if (!Number.isFinite(scale)) return limits.min;
  return Math.min(limits.max, Math.max(limits.min, scale));
}

/** The scale at which the whole of `bounds` fits on a screen of this size, with a margin each side. */
export function fitScale(bounds: MapBounds, width: number, height: number, margin = 16): number {
  const w = Math.max(1, width - 2 * margin);
  const h = Math.max(1, height - 2 * margin);
  return Math.min(w / (bounds.maxX - bounds.minX), h / (bounds.maxZ - bounds.minZ));
}

/**
 * Keep the centre over the city, so a drag can't lose the map off the screen: the city's edge
 * may come in as far as the middle of the screen, no further. When the whole city fits across
 * an axis, the centre is held at the city's middle on that axis.
 */
export function clampCentre(view: CityView, bounds: MapBounds): CityView {
  const along = (c: number, min: number, max: number, screen: number) => (screen / view.scale >= max - min ? (min + max) / 2 : Math.min(max, Math.max(min, c)));
  const cx = along(view.cx, bounds.minX, bounds.maxX, view.width);
  const cz = along(view.cz, bounds.minZ, bounds.maxZ, view.height);
  return cx === view.cx && cz === view.cz ? view : { ...view, cx, cz };
}

/** Zoom by `factor` keeping the world point under screen point (sx, sy) where it is. */
export function zoomAbout(view: CityView, factor: number, sx: number, sy: number, limits: ZoomLimits): CityView {
  const anchor = screenToWorld(view, sx, sy);
  const scale = clampScale(view.scale * factor, limits);
  return { ...view, scale, cx: anchor.x - (sx - view.width / 2) / scale, cz: anchor.z - (sy - view.height / 2) / scale };
}

/** Move the map with a finger: the world follows the drag. */
export function panBy(view: CityView, dx: number, dy: number): CityView {
  return { ...view, cx: view.cx - dx / view.scale, cz: view.cz - dy / view.scale };
}

/**
 * Two fingers moved from (a0, b0) to (a1, b1), starting from view `start`. The map scales by
 * the change in the fingers' distance, and the world point that was under their midpoint stays
 * under it (so a pinch also pans when both fingers slide).
 */
export function pinchView(start: CityView, a0: ScreenPoint, b0: ScreenPoint, a1: ScreenPoint, b1: ScreenPoint, limits: ZoomLimits): CityView {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  const factor = d0 < 1 ? 1 : d1 / d0;
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const anchor = screenToWorld(start, m0.x, m0.y);
  const scale = clampScale(start.scale * factor, limits);
  return { ...start, scale, cx: anchor.x - (m1.x - start.width / 2) / scale, cz: anchor.z - (m1.y - start.height / 2) / scale };
}

/** The world box on screen, grown by `pad` CSS pixels each side (so wide lines at the edge still draw). */
export function visibleBox(view: CityView, pad = 0): MapBounds {
  const halfW = (view.width / 2 + pad) / view.scale;
  const halfH = (view.height / 2 + pad) / view.scale;
  return { minX: view.cx - halfW, maxX: view.cx + halfW, minZ: view.cz - halfH, maxZ: view.cz + halfH };
}

export function boxesOverlap(a: MapBounds, b: MapBounds): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minZ <= b.maxZ && b.minZ <= a.maxZ;
}

export function boxOf(points: readonly MapPoint[]): MapBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

/** Grid cells (column, row) of side `cell` metres that a world box touches. */
export function cellsIn(box: MapBounds, cell: number): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let c = Math.floor(box.minX / cell); c <= Math.floor(box.maxX / cell); c++) {
    for (let r = Math.floor(box.minZ / cell); r <= Math.floor(box.maxZ / cell); r++) cells.push([c, r]);
  }
  return cells;
}

export type MapRoadKind = "primary" | "secondary" | "tertiary" | "residential" | "service" | "footway";

/**
 * Detail by zoom. Zoomed out, only the main roads are drawn and their lines are simplified
 * (a 25 m wiggle is under a pixel at city scale); zoomed in, every lane and footpath. Each band
 * has its own precomputed paths, so a pan draws ready-made shapes instead of re-walking points.
 */
export interface ZoomBand {
  /** The band applies from this scale (CSS px per metre) up to the next band's. */
  readonly from: number;
  /** Simplification tolerance, metres (about half a pixel at the band's lowest scale). */
  readonly tolerance: number;
  readonly kinds: ReadonlySet<MapRoadKind>;
}

export const ZOOM_BANDS: readonly ZoomBand[] = [
  { from: 0, tolerance: 20, kinds: new Set<MapRoadKind>(["primary", "secondary"]) },
  { from: 0.08, tolerance: 6, kinds: new Set<MapRoadKind>(["primary", "secondary", "tertiary"]) },
  { from: 0.22, tolerance: 2, kinds: new Set<MapRoadKind>(["primary", "secondary", "tertiary", "residential"]) },
  { from: 0.7, tolerance: 0.7, kinds: new Set<MapRoadKind>(["primary", "secondary", "tertiary", "residential", "service"]) },
  { from: 1.8, tolerance: 0, kinds: new Set<MapRoadKind>(["primary", "secondary", "tertiary", "residential", "service", "footway"]) },
];

export function bandFor(scale: number): number {
  let band = 0;
  for (let i = 0; i < ZOOM_BANDS.length; i++) if (scale >= ZOOM_BANDS[i]!.from) band = i;
  return band;
}

/** Douglas–Peucker: drop points that lie within `tolerance` metres of the line kept. Ends are kept. */
export function simplify(points: readonly MapPoint[], tolerance: number): MapPoint[] {
  if (tolerance <= 0 || points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  const t2 = tolerance * tolerance;
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    const a = points[first]!;
    const b = points[last]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    let worst = -1;
    let worstD = t2;
    for (let i = first + 1; i < last; i++) {
      const p = points[i]!;
      let d: number;
      if (len2 === 0) d = (p.x - a.x) ** 2 + (p.z - a.z) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
        d = (p.x - a.x - t * dx) ** 2 + (p.z - a.z - t * dz) ** 2;
      }
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([first, worst], [worst, last]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** A scale bar about `maxPx` long at most: a round distance (1, 2 or 5 × 10ⁿ metres) and its length. */
export function scaleBar(scale: number, maxPx: number): { metres: number; px: number; label: string } {
  const most = maxPx / scale;
  const power = 10 ** Math.floor(Math.log10(most));
  const step = [5, 2, 1].map((m) => m * power).find((m) => m <= most) ?? power;
  const label = step >= 1000 ? `${step / 1000} km` : `${step} m`;
  return { metres: step, px: step * scale, label };
}

/** Where a marker outside the screen is pinned: on the edge inset by `inset`, along the line from the centre. */
export function pinToEdge(view: CityView, p: ScreenPoint, inset: number): { x: number; y: number; inside: boolean; angle: number } {
  const cx = view.width / 2;
  const cy = view.height / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const angle = Math.atan2(dy, dx);
  const halfW = view.width / 2 - inset;
  const halfH = view.height / 2 - inset;
  if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) return { x: p.x, y: p.y, inside: true, angle };
  const t = Math.min(halfW / Math.max(1e-9, Math.abs(dx)), halfH / Math.max(1e-9, Math.abs(dy)));
  return { x: cx + dx * t, y: cy + dy * t, inside: false, angle };
}

/**
 * Join road pieces that meet end to end into longer lines. OSM splits a street at every
 * junction, so one avenue arrives as dozens of block-long pieces; a name can only be written
 * along it once they are joined. Ends closer than about half a metre count as meeting.
 */
export function chainLines(lines: ReadonlyArray<readonly MapPoint[]>): MapPoint[][] {
  const key = (p: MapPoint) => `${Math.round(p.x * 2)},${Math.round(p.z * 2)}`;
  const ends = new Map<string, number[]>();
  lines.forEach((line, i) => {
    if (line.length < 2) return;
    for (const p of [line[0]!, line[line.length - 1]!]) {
      const k = key(p);
      const list = ends.get(k);
      if (list) list.push(i);
      else ends.set(k, [i]);
    }
  });
  const used = new Uint8Array(lines.length);
  const next = (at: MapPoint): MapPoint[] | null => {
    for (const j of ends.get(key(at)) ?? []) {
      if (used[j]) continue;
      used[j] = 1;
      const line = lines[j]!;
      return key(line[0]!) === key(at) ? [...line] : [...line].reverse();
    }
    return null;
  };
  const chains: MapPoint[][] = [];
  lines.forEach((line, i) => {
    if (used[i] || line.length < 2) return;
    used[i] = 1;
    let chain = [...line];
    for (let more = next(chain[chain.length - 1]!); more; more = next(chain[chain.length - 1]!)) chain = chain.concat(more.slice(1));
    for (let more = next(chain[0]!); more; more = next(chain[0]!)) chain = more.reverse().concat(chain.slice(1));
    chains.push(chain);
  });
  return chains;
}

/** A straight stretch of a line: its middle, direction (kept upright for text) and length. */
export interface StraightRun {
  readonly x: number;
  readonly z: number;
  /** Radians from +x, between −π/2 and π/2, so text along it is never upside down. */
  readonly angle: number;
  readonly length: number;
}

/**
 * Split a line into stretches that stay within `maxTurn` radians of their first edge's
 * direction, and keep those at least `minLength` long (places to write a street's name).
 */
export function straightRuns(points: readonly MapPoint[], maxTurn: number, minLength: number): StraightRun[] {
  const runs: StraightRun[] = [];
  let start = 0;
  while (start < points.length - 1) {
    const a = points[start]!;
    const first = Math.atan2(points[start + 1]!.z - a.z, points[start + 1]!.x - a.x);
    let end = start + 1;
    while (end + 1 < points.length) {
      const p = points[end]!;
      const q = points[end + 1]!;
      let turn = Math.abs(Math.atan2(q.z - p.z, q.x - p.x) - first);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      if (turn > maxTurn) break;
      end++;
    }
    const b = points[end]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length >= minLength) {
      let angle = Math.atan2(b.z - a.z, b.x - a.x);
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      runs.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, angle, length });
    }
    start = end;
  }
  return runs;
}
