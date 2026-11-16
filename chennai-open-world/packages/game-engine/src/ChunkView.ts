/**
 * Meshes of one streamed chunk: every building merged into one mesh for walls and one for
 * roofs, and trees and palms drawn with instancing. Disposing a view frees its GPU memory.
 *
 * Renderer-only variety, chosen deterministically from ids and positions (the world data is
 * untouched): about a third of the low houses get a red clay-tile hip roof, a share of the
 * trees are coconut palms, and a scatter of windows light up after dark. The facade kit
 * (`FacadeKit.ts`) adds sunshades, balconies and shop fronts with Tamil signboards.
 */
import * as THREE from "three";
import { buildingBoxes, inBuilding, type Building, type ChunkData, type ChunkFurniture, type PropPlacement, type RoadSpan, type ShopFront, type StreetLife, type Tree } from "@cow/game-world";
import { applyGroundLook, buildGround, createGroundAssets, type GroundAssets } from "./GroundMeshes";
import type { Look } from "./lighting";
import { addBalcony, addChajja, addShopFronts, chunkShopFronts, createKitMaterial, planFacade, shopAwnings, type FacadePlan } from "./FacadeKit";
import { hash } from "./hash";
import { MeshBuilder } from "./MeshBuilder";
import { applyFurnitureLook, buildStreetFurniture, createFurnitureAssets, type FurnitureAssets } from "./StreetFurniture";
import { applyPropLook, buildStreetProps, buildingFixtures, pavementInstances, type PropAssets, type PropInstance } from "./StreetProps";
import { applyKolamLook, buildKolams, cableGeometry, createKolamAssets, lifeInstances, type KolamAssets } from "./StreetLife";
import { FACADE_LIT, FACADE_TILES, FACADE_TILE_COUNT, ROOF_PLAIN_UV, facadeGlowAtlas, roofTileTexture } from "./textures";

const BAY = 3.2; // metres of wall per window bay
const GROUND_FLOOR = 3.3;
const PARAPET = 0.9;
/** Keep samples away from tile edges so neighbouring tiles don't bleed in at a distance. */
const INSET = 0.004;

/** Share of low houses with a clay-tile roof, of trees drawn as palms, and of windows lit at night. */
const TILED_ROOFS = 0.32;
const PALMS = 0.4;
const LIT_WINDOWS = 0.35;
/** Clay-tile roofs: eave overhang, pitch (rise over half-span) and metres per texture repeat. */
const OVERHANG = 0.35;
const PITCH = 0.55;
const TILE_REPEAT = 2.4;

/** Materials and geometries shared by every chunk; created once. */
export interface ChunkAssets {
  readonly walls: THREE.MeshStandardMaterial;
  readonly roofs: THREE.MeshStandardMaterial;
  /** Shutters, signboards and balcony railings (`FacadeKit`). */
  readonly kit: THREE.MeshStandardMaterial;
  readonly trunk: THREE.BufferGeometry;
  readonly crown: THREE.BufferGeometry;
  readonly trunkMaterial: THREE.Material;
  readonly crownMaterial: THREE.Material;
  readonly tank: THREE.BufferGeometry;
  readonly tankMaterial: THREE.Material;
  /** Coconut palm: trunk and fronds in one geometry with vertex colours, so one draw call. */
  readonly palm: THREE.BufferGeometry;
  readonly palmMaterial: THREE.Material;
  /** Road surface, markings, parks, water and sand. */
  readonly ground: GroundAssets;
  /** Bus shelters, street-light poles and kerbs. */
  readonly furniture: FurnitureAssets;
  /** Blender street props (`StreetProps`); without them chunks have no props. */
  readonly props?: PropAssets;
  /** Kolam decals (`StreetLife`); created with the props. */
  readonly kolams?: KolamAssets;
}

const scratch = new THREE.Color();

/** Low houses that get a clay-tile hip roof instead of a flat terrace. */
export function hasTiledRoof(b: Building): boolean {
  return b.kind === "house" && b.floors <= 2 && b.outline.length >= 4 && b.outline.length <= 8 && hash(b.id, 41) < TILED_ROOFS && convex(b.outline);
}

/** Heights `addBuilding` draws a building with, for the fixtures on its walls and roof. */
function buildingFrame(b: Building): { groundFloor: number; upperTop: number; bay: number; tiled: boolean; roofY: number } {
  const upperTop = b.height - PARAPET;
  const tiled = hasTiledRoof(b);
  return { groundFloor: GROUND_FLOOR, upperTop, bay: BAY, tiled, roofY: tiled ? upperTop - 0.05 : b.height - 0.35 };
}

function convex(outline: Building["outline"]): boolean {
  let sign = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const c = outline[(i + 2) % outline.length]!;
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

/** Stable [0, 1) from a tree's position, so a tree is a palm every time its chunk loads. */
function treeHash(tree: Tree, salt: number): number {
  return hash((Math.round(tree.x * 10) * 73856093) ^ (Math.round(tree.z * 10) * 19349663), salt);
}

type P3 = { x: number; y: number; z: number };

/**
 * Hip roof of clay tiles over a convex footprint: a ridge along the long axis of a four-sided
 * house (a point for other shapes), sloping faces down to eaves that overhang the walls.
 * Returns false when the footprint is too small, so the caller keeps the flat terrace.
 */
function addTiledRoof(roofs: MeshBuilder, b: Building, baseY: number): boolean {
  const o = b.outline;
  const n = o.length;
  let cx = 0;
  let cz = 0;
  for (const p of o) {
    cx += p.x;
    cz += p.z;
  }
  cx /= n;
  cz /= n;
  let ax = 1;
  let az = 0;
  let half = 0;
  let span: number;
  if (n === 4) {
    const edge = (i: number) => Math.hypot(o[(i + 1) % 4]!.x - o[i]!.x, o[(i + 1) % 4]!.z - o[i]!.z);
    const longFirst = edge(0) + edge(2) >= edge(1) + edge(3);
    const [a0, a1, b0, b1] = longFirst ? [o[0]!, o[1]!, o[3]!, o[2]!] : [o[1]!, o[2]!, o[0]!, o[3]!];
    ax = a1.x - a0.x + (b1.x - b0.x);
    az = a1.z - a0.z + (b1.z - b0.z);
    const length = Math.hypot(ax, az) || 1;
    ax /= length;
    az /= length;
    const long = longFirst ? (edge(0) + edge(2)) / 2 : (edge(1) + edge(3)) / 2;
    span = longFirst ? (edge(1) + edge(3)) / 2 : (edge(0) + edge(2)) / 2;
    half = Math.max(0, (long - span) / 2);
  } else {
    let radius = 0;
    for (const p of o) radius += Math.hypot(p.x - cx, p.z - cz);
    span = (radius / n) * 1.4;
  }
  if (span < 3) return false;
  const rise = Math.min(2.4, (span / 2) * PITCH);
  const ridge = (sign: number): P3 => ({ x: cx + ax * half * sign, y: baseY + rise, z: cz + az * half * sign });
  const ends = o.map((p) => ((p.x - cx) * ax + (p.z - cz) * az < 0 ? -1 : 1));
  // A skewed quad whose corners don't split two and two along the axis gets a pyramid instead.
  if (half > 0 && ends.filter((e) => e < 0).length !== 2) half = 0;
  const eaves: P3[] = o.map((p) => {
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d = Math.hypot(dx, dz) || 1;
    return { x: p.x + (dx / d) * OVERHANG, y: baseY, z: p.z + (dz / d) * OVERHANG };
  });

  // Terracotta, a little different on every house.
  scratch.setHex(0xb0553a).lerp(new THREE.Color(hash(b.id, 43) < 0.5 ? 0x8f4630 : 0xc4704a), hash(b.id, 44) * 0.6);
  const { r, g, b: blue } = scratch;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const e0 = eaves[i]!;
    const e1 = eaves[j]!;
    const r0 = ridge(half > 0 ? ends[i]! : 0);
    const r1 = ridge(half > 0 ? ends[j]! : 0);
    const face: P3[] = r0.x === r1.x && r0.z === r1.z ? [e0, e1, r0] : [e0, e1, r1, r0];
    // Texture courses run along the eave; v climbs the slope.
    const ex = e1.x - e0.x;
    const ez = e1.z - e0.z;
    const el = Math.hypot(ex, ez) || 1;
    const ux = ex / el;
    const uz = ez / el;
    let inX = -uz;
    let inZ = ux;
    if ((cx - e0.x) * inX + (cz - e0.z) * inZ < 0) {
      inX = -inX;
      inZ = -inZ;
    }
    const a = face[0]!;
    const bb = face[1]!;
    const c = face[2]!;
    let nx = (bb.y - a.y) * (c.z - a.z) - (bb.z - a.z) * (c.y - a.y);
    let ny = (bb.z - a.z) * (c.x - a.x) - (bb.x - a.x) * (c.z - a.z);
    let nz = (bb.x - a.x) * (c.y - a.y) - (bb.y - a.y) * (c.x - a.x);
    const flip = ny < 0;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx = (flip ? -nx : nx) / nl;
    ny = (flip ? -ny : ny) / nl;
    nz = (flip ? -nz : nz) / nl;
    const shade = 0.9 + 0.1 * hash(b.id, 50 + i);
    const ids = face.map((p) => {
      const along = (p.x - e0.x) * ux + (p.z - e0.z) * uz;
      const inward = (p.x - e0.x) * inX + (p.z - e0.z) * inZ;
      return roofs.vertex(p.x, p.y, p.z, nx, ny, nz, along / TILE_REPEAT, Math.hypot(inward, p.y - baseY) / TILE_REPEAT, r * shade, g * shade, blue * shade);
    });
    const order = flip ? [...ids].reverse() : ids;
    if (order.length === 3) roofs.triangle(order[0]!, order[1]!, order[2]!);
    else roofs.quad(order[0]!, order[1]!, order[2]!, order[3]!);
  }
  return true;
}

/** Plain plaster in the facade atlas (a blank corner of the window tile), for parapets and slabs. */
const PLASTER = { u: (FACADE_TILES.window + 0.04) / FACADE_TILE_COUNT, v: 0.86 } as const;

function addBuilding(walls: MeshBuilder, roofs: MeshBuilder, b: Building, kit: MeshBuilder, plan: FacadePlan, awnings?: PropInstance[]): void {
  scratch.setHex(b.color);
  const { r, g, b: blue } = scratch;
  const { outline, floors, height } = b;
  const upperTop = height - PARAPET;
  const upperFloors = floors - 1;
  const tiled = hasTiledRoof(b);

  for (let i = 0; i < outline.length; i++) {
    const p = outline[i]!;
    const q = outline[(i + 1) % outline.length]!;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) continue;
    // Outline is anticlockwise, so this is the outward normal.
    const nx = dz / length;
    const nz = -dx / length;
    // Slightly different brightness per wall gives the block some form in flat light.
    const shade = 0.92 + 0.08 * hash(b.id, i);
    const cr = r * shade;
    const cg = g * shade;
    const cb = blue * shade;

    const bays = Math.max(1, Math.round(length / BAY));
    // Facade kit (FacadeKit.ts): shop fronts on walls facing a road, sunshades and balconies.
    const frame = { x: p.x, z: p.z, ux: dx / length, uz: dz / length, nx, nz };
    const shopWall = plan.shopWalls.has(i);
    if (shopWall) {
      addShopFronts(kit, b, i, frame, length, bays);
      awnings?.push(...shopAwnings(b, i, frame, length, bays));
    }
    const slab = [Math.min(1, cr * 1.06), Math.min(1, cg * 1.06), Math.min(1, cb * 1.06)] as const;
    for (let bay = 0; bay < bays; bay++) {
      const t0 = bay / bays;
      const t1 = (bay + 1) / bays;
      const x0 = p.x + dx * t0;
      const z0 = p.z + dz * t0;
      const x1 = p.x + dx * t1;
      const z1 = p.z + dz * t1;
      const pick = hash(b.id, i * 97 + bay);

      // Narrow leftovers of wall get plain plaster instead of a squeezed window.
      const plain = length / bays < 1.6;
      const band = (y0: number, y1: number, tile: number, v0: number, v1: number, flat = plain) => {
        const u0 = flat ? (tile + 0.03) / FACADE_TILE_COUNT : tile / FACADE_TILE_COUNT + INSET;
        const u1 = flat ? (tile + 0.06) / FACADE_TILE_COUNT : (tile + 1) / FACADE_TILE_COUNT - INSET;
        const a = walls.vertex(x0, y0, z0, nx, 0, nz, u0, v0, cr, cg, cb);
        const c = walls.vertex(x1, y0, z1, nx, 0, nz, u1, v0, cr, cg, cb);
        const d = walls.vertex(x1, y1, z1, nx, 0, nz, u1, v1, cr, cg, cb);
        const e = walls.vertex(x0, y1, z0, nx, 0, nz, u0, v1, cr, cg, cb);
        walls.quad(a, e, d, c);
      };

      const groundTop = upperFloors > 0 ? GROUND_FLOOR : upperTop;
      // The "lit" copy of a tile glows after dark; chosen per bay and floor.
      const lit = (floor: number) => (hash(b.id, i * 7919 + bay * 61 + floor * 13 + 5) < LIT_WINDOWS ? FACADE_LIT : 0);
      const groundTile = b.kind === "commercial" ? (pick < 0.75 ? FACADE_TILES.shop : FACADE_TILES.window) : pick < 0.3 ? FACADE_TILES.door : FACADE_TILES.window;
      // Behind a shop front the ground floor is plain plaster: the shutters and sign cover it.
      band(0, groundTop, shopWall ? FACADE_TILES.window : groundTile + lit(0), 0, 1, plain || shopWall);
      const bayFrame = { ...frame, x: x0, z: z0 };
      const bayWidth = length / bays;
      if (plan.chajjas && !plain && !shopWall && groundTile === FACADE_TILES.window) addChajja(walls, bayFrame, bayWidth, 0, groundTop, PLASTER, slab);
      if (upperFloors > 0) {
        const upperTile = hash(b.id, i * 131 + bay + 7) < (b.kind === "house" ? 0.25 : 0.45) ? FACADE_TILES.balcony : FACADE_TILES.window;
        // One band per floor, so each floor's window can be lit on its own.
        const storey = (upperTop - GROUND_FLOOR) / upperFloors;
        for (let floor = 0; floor < upperFloors; floor++) {
          const y0 = GROUND_FLOOR + floor * storey;
          band(y0, y0 + storey, upperTile + lit(floor + 1), 0, 1);
          if (plain) continue;
          if (upperTile === FACADE_TILES.window && plan.chajjas) addChajja(walls, bayFrame, bayWidth, y0, storey, PLASTER, slab);
          else if (upperTile === FACADE_TILES.balcony && plan.balconies) addBalcony(walls, kit, bayFrame, bayWidth, y0, PLASTER, slab);
        }
      }
    }

    // A tiled roof sits on the wall tops, so there is no parapet.
    if (tiled) continue;
    // Parapet: plain plaster, sampled from a blank corner of the window tile.
    const u = PLASTER.u;
    const a = walls.vertex(p.x, upperTop, p.z, nx, 0, nz, u, 0.86, cr, cg, cb);
    const c = walls.vertex(q.x, upperTop, q.z, nx, 0, nz, u + 0.01, 0.86, cr, cg, cb);
    const d = walls.vertex(q.x, height, q.z, nx, 0, nz, u + 0.01, 0.9, cr, cg, cb);
    const e = walls.vertex(p.x, height, p.z, nx, 0, nz, u, 0.9, cr, cg, cb);
    walls.quad(a, e, d, c);
  }

  if (tiled && addTiledRoof(roofs, b, upperTop)) return;
  // Roof slab a little below the parapet top (shows the roof material's plain texel); on the
  // wall tops for a tiny house that was meant to be tiled but has no parapet.
  const roofY = tiled ? upperTop - 0.05 : height - 0.35;
  const contour = outline.map((p) => new THREE.Vector2(p.x, p.z));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const base = roofs.vertexCount;
  const tone = 0.55 + hash(b.id, 3) * 0.2;
  const [pu, pv] = ROOF_PLAIN_UV;
  for (const p of outline) roofs.vertex(p.x, roofY, p.z, 0, 1, 0, pu, pv, tone, tone * 0.98, tone * 0.95);
  for (const face of faces) {
    const [i0, i1, i2] = face as [number, number, number];
    const p0 = outline[i0]!;
    const p1 = outline[i1]!;
    const p2 = outline[i2]!;
    // Keep the triangle facing up whichever way the triangulator wound it.
    const up = (p1.z - p0.z) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.z - p0.z) > 0;
    if (up) roofs.triangle(base + i0, base + i1, base + i2);
    else roofs.triangle(base + i0, base + i2, base + i1);
  }
}

/**
 * A coconut palm about 8 m tall: a gently curving trunk and nine drooping, folded fronds, with
 * vertex colours. Non-indexed with flat normals; drawn double-sided so the fronds read from below.
 */
function palmGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();
  const tri = (a: P3, b: P3, c: P3, hex: number) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    color.setHex(hex);
    for (let k = 0; k < 3; k++) colors.push(color.r, color.g, color.b);
  };
  // Trunk: six-sided rings, thinner and bending away as it rises.
  const HEIGHT = 7.2;
  const RINGS = 5;
  const SIDES = 6;
  const bend = (y: number) => 0.55 * (y / HEIGHT) ** 2;
  const ring = (k: number): P3[] => {
    const y = (k / (RINGS - 1)) * HEIGHT;
    const radius = 0.24 - 0.09 * (k / (RINGS - 1));
    return Array.from({ length: SIDES }, (_, s) => {
      const angle = (s / SIDES) * Math.PI * 2;
      return { x: bend(y) + Math.cos(angle) * radius, y, z: Math.sin(angle) * radius };
    });
  };
  for (let k = 0; k < RINGS - 1; k++) {
    const lower = ring(k);
    const upper = ring(k + 1);
    for (let s = 0; s < SIDES; s++) {
      const t = (s + 1) % SIDES;
      const bark = k % 2 === 0 ? 0x7f6c57 : 0x736250;
      tri(lower[s]!, upper[s]!, upper[t]!, bark);
      tri(lower[s]!, upper[t]!, lower[t]!, bark);
    }
  }
  // Fronds radiating from the crown, rising a little and then drooping.
  const top: P3 = { x: bend(HEIGHT), y: HEIGHT, z: 0 };
  const FRONDS = 9;
  const SEGMENTS = 4;
  for (let f = 0; f < FRONDS; f++) {
    const angle = (f / FRONDS) * Math.PI * 2 + (f % 3) * 0.21;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const length = 3.1 + (f % 2) * 0.5;
    const spine: P3[] = [];
    const left: P3[] = [];
    const right: P3[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const reach = length * t;
      const p = { x: top.x + dx * reach, y: top.y + 0.7 * t - 2.1 * t * t, z: top.z + dz * reach };
      const width = 0.6 * Math.sin(Math.PI * (0.12 + 0.88 * t));
      spine.push(p);
      // The two halves of the leaf fold down a little from the midrib.
      left.push({ x: p.x - dz * width, y: p.y - width * 0.35, z: p.z + dx * width });
      right.push({ x: p.x + dz * width, y: p.y - width * 0.35, z: p.z - dx * width });
    }
    for (let i = 0; i < SEGMENTS; i++) {
      const leaf = i < SEGMENTS - 1 ? 0x3f7a2e : 0x6f9436;
      tri(spine[i]!, left[i]!, left[i + 1]!, leaf);
      tri(spine[i]!, left[i + 1]!, spine[i + 1]!, leaf);
      tri(spine[i]!, spine[i + 1]!, right[i + 1]!, leaf);
      tri(spine[i]!, right[i + 1]!, right[i]!, leaf);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createChunkAssets(facade: THREE.Texture, props?: PropAssets): ChunkAssets {
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 4, 6);
  trunk.translate(0, 2, 0);
  // Three overlapping blobs read as a leafy canopy from every side.
  const crown = new THREE.IcosahedronGeometry(2.3, 1);
  crown.scale(1, 0.75, 1);
  crown.translate(0, 5.1, 0);
  const tank = new THREE.CylinderGeometry(0.75, 0.75, 1.5, 10);
  tank.translate(0, 0.75, 0);
  return {
    // The glow atlas lights the "lit" window tiles; its strength follows the night (applyChunkLook).
    walls: new THREE.MeshStandardMaterial({ map: facade, vertexColors: true, roughness: 0.93, emissiveMap: facadeGlowAtlas(), emissive: 0xffffff, emissiveIntensity: 0 }),
    // Clay tiles on the pitched roofs; flat terraces sample a plain white texel of the same map.
    // Double-sided so the eaves' undersides aren't see-through from the street.
    roofs: new THREE.MeshStandardMaterial({ map: roofTileTexture(), vertexColors: true, roughness: 1, side: THREE.DoubleSide }),
    // Drawn after `loadSignFont` has settled, so the signs have their Tamil text.
    kit: createKitMaterial(),
    trunk,
    crown,
    trunkMaterial: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.95 }),
    crownMaterial: new THREE.MeshStandardMaterial({ color: 0x3f8f4a, roughness: 0.95, flatShading: true }),
    tank,
    // The black rooftop water tanks seen on almost every Chennai house.
    tankMaterial: new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.6 }),
    palm: palmGeometry(),
    palmMaterial: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
    ground: createGroundAssets(),
    furniture: createFurnitureAssets(),
    ...(props ? { props, kolams: createKolamAssets() } : {}),
  };
}

/** Follow the time of day and weather: windows glow after dark, roofs and walls darken and shine when wet. */
export function applyChunkLook(assets: ChunkAssets, look: Look): void {
  assets.walls.emissiveIntensity = look.night * 1.15;
  assets.kit.emissiveIntensity = look.night * 1.15;
  assets.walls.color.setScalar(1 - 0.12 * look.rain);
  assets.roofs.color.setScalar(1 - 0.18 * look.rain);
  assets.roofs.roughness = 1 - 0.45 * look.rain;
  applyGroundLook(assets.ground, look);
  applyFurnitureLook(assets.furniture, look);
  if (assets.props) applyPropLook(assets.props, look);
  if (assets.kolams) applyKolamLook(assets.kolams, look);
}

export class ChunkView {
  readonly object = new THREE.Group();
  private readonly owned: THREE.BufferGeometry[] = [];
  /** Small ground detail (kolams) that is only drawn near the player (`setDetail`). */
  private readonly detail: THREE.Object3D[] = [];

  /** Show or hide the small ground detail; the chunk manager hides it in far chunks. */
  setDetail(visible: boolean): void {
    for (const node of this.detail) node.visible = visible;
  }

  /**
   * @param roads the stretches of road whose segments lie in this chunk (`roadSpansByChunk`)
   * @param furniture the chunk's bus shelters, poles and kerbs (`chunkFurniture`)
   * @param props the chunk's pavement props (`chunkProps`); drawn only when `assets.props` is set
   * @param life works out the chunk's street life from its shop fronts (`chunkStreetLife`); needs `assets.props`
   */
  constructor(chunk: ChunkData, assets: ChunkAssets, roads: readonly RoadSpan[] = [], furniture?: ChunkFurniture, props: readonly PropPlacement[] = [], life?: (shops: readonly ShopFront[]) => StreetLife) {
    this.object.name = `chunk:${chunk.key}`;
    const ground = buildGround(roads, chunk.areas, assets.ground);
    this.owned.push(...ground.owned);
    for (const mesh of ground.meshes) this.object.add(mesh);
    if (furniture) {
      const street = buildStreetFurniture(furniture, assets.furniture);
      this.owned.push(...street.owned);
      for (const mesh of street.meshes) this.object.add(mesh);
    }
    const walls = new MeshBuilder();
    const roofs = new MeshBuilder();
    // Shutter bottoms carry their shop's hours (`aShop`), so they roll on the GPU.
    const kit = new MeshBuilder("aShop");
    // Wall AC units and rooftop dishes follow each building's facade plan (`buildingFixtures`).
    const fixtures: PropInstance[] = [];
    const boxes = assets.props ? buildingBoxes(chunk.buildings) : [];
    const free = (x: number, z: number) => !inBuilding(chunk.buildings, boxes, { x, z }, 0);
    const plans = new Map<number, FacadePlan>();
    for (const building of chunk.buildings) {
      const plan = planFacade(building, roads);
      plans.set(building.id, plan);
      addBuilding(walls, roofs, building, kit, plan, assets.props ? fixtures : undefined);
      if (assets.props) fixtures.push(...buildingFixtures(building, plan, buildingFrame(building), free));
    }
    if (assets.props) {
      const street = life?.(chunkShopFronts(chunk, plans));
      const pavement = [...pavementInstances(props), ...(street ? lifeInstances(street) : [])];
      const cables = street ? cableGeometry(street.cables) : undefined;
      for (const mesh of [buildStreetProps(pavement, assets.props), buildStreetProps(fixtures, assets.props, false, cables)]) {
        if (!mesh) continue;
        this.owned.push(mesh.geometry);
        this.object.add(mesh);
      }
      const kolams = street && assets.kolams ? buildKolams(street.kolams, assets.kolams) : null;
      if (kolams) {
        this.owned.push(kolams.geometry);
        this.object.add(kolams);
        this.detail.push(kolams);
      }
    }

    for (const [builder, material] of [[walls, assets.walls], [roofs, assets.roofs], [kit, assets.kit]] as const) {
      const geometry = builder.build();
      if (!geometry) continue;
      this.owned.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      // Shutters and signs sit flat on the walls; their shadows would cost a draw call for little.
      mesh.castShadow = material !== assets.kit;
      mesh.receiveShadow = true;
      this.object.add(mesh);
    }

    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);

    // Water tanks on most roofs, placed at the footprint's centre of mass.
    const tanked = chunk.buildings.filter((b) => hash(b.id, 21) < 0.7 && !hasTiledRoof(b));
    if (tanked.length > 0) {
      const tanks = new THREE.InstancedMesh(assets.tank, assets.tankMaterial, tanked.length);
      tanked.forEach((b, i) => {
        let x = 0;
        let z = 0;
        for (const p of b.outline) {
          x += p.x;
          z += p.z;
        }
        matrix.makeTranslation(x / b.outline.length, b.height - 0.35, z / b.outline.length);
        tanks.setMatrixAt(i, matrix);
      });
      tanks.castShadow = true;
      tanks.computeBoundingSphere();
      this.object.add(tanks);
    }

    const palms = chunk.trees.filter((tree) => treeHash(tree, 51) < PALMS);
    const trees = chunk.trees.filter((tree) => treeHash(tree, 51) >= PALMS);
    const tint = new THREE.Color();
    if (palms.length > 0) {
      const mesh = new THREE.InstancedMesh(assets.palm, assets.palmMaterial, palms.length);
      palms.forEach((tree, i) => {
        rotation.setFromAxisAngle(up, treeHash(tree, 52) * Math.PI * 2);
        const size = tree.scale * (0.85 + treeHash(tree, 53) * 0.35);
        matrix.compose(new THREE.Vector3(tree.x, 0, tree.z), rotation, new THREE.Vector3(size, size, size));
        mesh.setMatrixAt(i, matrix);
        const v = 0.85 + treeHash(tree, 54) * 0.3;
        mesh.setColorAt(i, tint.setRGB(v, v, v * 0.92));
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.object.add(mesh);
    }

    if (trees.length > 0) {
      const trunks = new THREE.InstancedMesh(assets.trunk, assets.trunkMaterial, trees.length);
      const crowns = new THREE.InstancedMesh(assets.crown, assets.crownMaterial, trees.length);
      trees.forEach((tree, i) => {
        rotation.setFromAxisAngle(up, (tree.x * 13.7 + tree.z * 7.3) % 6.28);
        matrix.compose(new THREE.Vector3(tree.x, 0, tree.z), rotation, new THREE.Vector3(tree.scale, tree.scale, tree.scale));
        trunks.setMatrixAt(i, matrix);
        crowns.setMatrixAt(i, matrix);
        // Slightly different greens so a row of trees isn't uniform.
        const v = 0.85 + (((tree.x * 3.1 + tree.z * 5.7) % 1) + 1) % 1 * 0.3;
        crowns.setColorAt(i, tint.setRGB(v, v, v * 0.9));
      });
      for (const mesh of [trunks, crowns]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        this.object.add(mesh);
      }
    }
  }

  /** Free this chunk's own GPU buffers. Shared assets stay. Remove `object` from the scene first. */
  dispose(): void {
    for (const geometry of this.owned) geometry.dispose();
    this.object.traverse((node) => {
      if (node instanceof THREE.InstancedMesh) node.dispose();
    });
  }
}
