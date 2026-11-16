/**
 * The flat layers of one chunk: road surface, verges and footpaths, lane markings, and the
 * parks, water and sand cut to the chunk. Built when a chunk loads and freed with it, so the
 * city's roads cost only what is near the player (one mesh per material per chunk).
 *
 * Markings follow the road class (invented, as OSM does not map paint): a dashed centre line on
 * two-way main roads, dashed lane lines where there is more than one lane each way, and solid
 * edge lines on primary roads. Lanes come from OSM `lanes` where mapped, else from the width.
 */
import * as THREE from "three";
import { MAIN_ROADS, laneCount, type Area, type Point, type RoadSpan } from "@cow/game-world";
import type { Look } from "./lighting";
import { MeshBuilder } from "./MeshBuilder";
import { surfaceMaps, type Surface, type Surfaces } from "./surfaces";

/** Heights of the flat layers above the ground plane, far enough apart not to shimmer. */
export const LAYER_Y = { park: 0.02, verge: 0.035, road: 0.06, marking: 0.08 } as const;

/** A surface that darkens and shines when wet: its dry roughness is kept to return to. */
interface WetSurface {
  readonly material: THREE.MeshStandardMaterial;
  readonly dry: number;
  readonly wet: number;
  readonly darken: number;
}

/** Materials shared by every chunk's ground layers. */
export interface GroundAssets {
  readonly paving: THREE.MeshStandardMaterial;
  readonly asphalt: THREE.MeshStandardMaterial;
  readonly paint: THREE.MeshStandardMaterial;
  readonly grass: THREE.MeshStandardMaterial;
  readonly water: THREE.MeshStandardMaterial;
  readonly sand: THREE.MeshStandardMaterial;
  /** A 1 m square of paint, scaled per instance. */
  readonly stripe: THREE.BufferGeometry;
  readonly wet: readonly WetSurface[];
}

/** Metres per UV unit of the layers: road ribbons, verges and footpaths, and area polygons. */
const UV_METRES = { tarmac: 9, verge: 3, area: 6 } as const;

/**
 * A flat layer showing a photographed surface. `metres` is how wide one repeat of the photo is
 * on the ground: about its real size up close, larger where repeats would show (roads).
 */
function flatMaterial(surface: Surface, uvMetres: number, metres: number, roughness: number, offset: number): THREE.MeshStandardMaterial {
  const { map, normalMap } = surfaceMaps(surface, uvMetres / metres);
  return new THREE.MeshStandardMaterial({ map, normalMap, roughness, polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset });
}

export function createGroundAssets(surfaces: Surfaces): GroundAssets {
  const paving = flatMaterial(surfaces.paving, UV_METRES.verge, 1.92, 0.9, 2);
  const asphalt = flatMaterial(surfaces.asphalt, UV_METRES.tarmac, 4.5, 0.92, 3);
  const sand = flatMaterial(surfaces.sand, UV_METRES.area, 2.5, 1, 1);
  return {
    paving,
    asphalt,
    paint: new THREE.MeshStandardMaterial({ color: 0xf0efe6, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    grass: flatMaterial(surfaces.grass, UV_METRES.area, 3, 0.95, 1),
    water: new THREE.MeshStandardMaterial({ color: 0x3f7fa6, roughness: 0.2, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    sand,
    stripe: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    // Wet tarmac goes dark and glossy and picks up the sky; paving and sand less so.
    wet: [
      { material: paving, dry: 0.9, wet: 0.5, darken: 0.25 },
      { material: asphalt, dry: 0.92, wet: 0.28, darken: 0.4 },
      { material: sand, dry: 1, wet: 0.85, darken: 0.2 },
    ],
  };
}

export function applyGroundLook(assets: GroundAssets, look: Look): void {
  for (const surface of assets.wet) {
    surface.material.roughness = surface.dry + (surface.wet - surface.dry) * look.rain;
    surface.material.color.setScalar(1 - surface.darken * look.rain);
  }
}

/** Add a flat ribbon following a polyline, with a disc at every vertex to close joints and junctions. */
export function ribbon(builder: MeshBuilder, points: readonly Point[], width: number, y: number, uvScale: number): void {
  const half = width / 2;
  const v = (x: number, z: number) => builder.vertex(x, y, z, 0, 1, 0, x / uvScale, z / uvScale);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 0.01) continue;
    const ox = (-(b.z - a.z) / length) * half;
    const oz = ((b.x - a.x) / length) * half;
    builder.quad(v(a.x + ox, a.z + oz), v(b.x + ox, b.z + oz), v(b.x - ox, b.z - oz), v(a.x - ox, a.z - oz));
  }
  // Fewer sides on narrow roads: the joint disc is barely seen.
  const sides = width > 8 ? 10 : 8;
  for (const p of points) {
    const centre = v(p.x, p.z);
    const rim: number[] = [];
    for (let s = 0; s < sides; s++) {
      const angle = (s / sides) * Math.PI * 2;
      rim.push(v(p.x + Math.cos(angle) * half, p.z + Math.sin(angle) * half));
    }
    for (let s = 0; s < sides; s++) builder.triangle(centre, rim[(s + 1) % sides]!, rim[s]!);
  }
}

/** One painted stripe: centre, direction angle, width across and length along. */
interface Stripe {
  readonly x: number;
  readonly z: number;
  readonly angle: number;
  readonly across: number;
  readonly along: number;
}

/** Lines painted on a road: offsets from the centre line and whether each is dashed. */
export function laneLines(road: RoadSpan["road"]): Array<{ offset: number; dashed: boolean }> {
  if (!MAIN_ROADS.has(road.kind)) return [];
  const lanes = laneCount(road);
  const lines: Array<{ offset: number; dashed: boolean }> = [];
  const laneWidth = road.width / lanes;
  if (road.oneway) {
    for (let k = 1; k < lanes; k++) lines.push({ offset: -road.width / 2 + k * laneWidth, dashed: true });
  } else {
    lines.push({ offset: 0, dashed: true });
    const perSide = Math.floor(lanes / 2);
    for (let k = 1; k < perSide; k++) lines.push({ offset: k * laneWidth, dashed: true }, { offset: -k * laneWidth, dashed: true });
  }
  if (road.kind === "primary" && road.width >= 7) lines.push({ offset: road.width / 2 - 0.35, dashed: false }, { offset: -road.width / 2 + 0.35, dashed: false });
  return lines;
}

const DASH = 3.2;
const PITCH = 9;
/** No paint this close to a road's ends, where junctions usually are. */
const END_CLEAR = 8;

function addStripes(out: Stripe[], span: RoadSpan): void {
  const lines = laneLines(span.road);
  if (lines.length === 0) return;
  const pts = span.road.points;
  let travelled = span.offset;
  for (let i = span.start; i < span.end; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 0.01) continue;
    const ux = (b.x - a.x) / length;
    const uz = (b.z - a.z) / length;
    const angle = Math.atan2(ux, uz);
    for (const line of lines) {
      const px = -uz * line.offset;
      const pz = ux * line.offset;
      if (line.dashed) {
        // Dash centres at fixed distances along the whole road, so chunks line up.
        for (let next = Math.max(PITCH, Math.ceil(travelled / PITCH) * PITCH); next < travelled + length; next += PITCH) {
          if (next < END_CLEAR || next > span.total - END_CLEAR) continue;
          const t = next - travelled;
          out.push({ x: a.x + ux * t + px, z: a.z + uz * t + pz, angle, across: 0.15, along: DASH });
        }
      } else {
        // Solid line along the part of the segment away from the road's ends.
        const from = Math.max(0, END_CLEAR - travelled);
        const to = Math.min(length, span.total - END_CLEAR - travelled);
        if (to - from > 0.5) {
          const mid = (from + to) / 2;
          out.push({ x: a.x + ux * mid + px, z: a.z + uz * mid + pz, angle, across: 0.15, along: to - from });
        }
      }
    }
    travelled += length;
  }
}

function addPolygon(builder: MeshBuilder, outline: readonly Point[], y: number): void {
  const base = builder.vertexCount;
  for (const p of outline) builder.vertex(p.x, y, p.z, 0, 1, 0, p.x / UV_METRES.area, p.z / UV_METRES.area);
  const faces = THREE.ShapeUtils.triangulateShape(outline.map((p) => new THREE.Vector2(p.x, p.z)), []);
  for (const face of faces) {
    const [i0, i1, i2] = face as [number, number, number];
    const p0 = outline[i0]!;
    const p1 = outline[i1]!;
    const p2 = outline[i2]!;
    const up = (p1.z - p0.z) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.z - p0.z) > 0;
    if (up) builder.triangle(base + i0, base + i1, base + i2);
    else builder.triangle(base + i0, base + i2, base + i1);
  }
}

/**
 * Meshes for a chunk's flat layers. Returns the meshes (add them to the chunk's group) and the
 * geometries the chunk owns (dispose them when it unloads).
 */
export function buildGround(spans: readonly RoadSpan[], areas: readonly Area[], assets: GroundAssets): { meshes: THREE.Mesh[]; owned: THREE.BufferGeometry[] } {
  const verge = new MeshBuilder(); // paved strip beside the bigger roads, and footpaths
  const tarmac = new MeshBuilder();
  const stripes: Stripe[] = [];
  for (const span of spans) {
    const road = span.road;
    const points = road.points.slice(span.start, span.end + 1);
    if (road.kind === "footway") {
      ribbon(verge, points, road.width, LAYER_Y.verge, UV_METRES.verge);
      continue;
    }
    if (MAIN_ROADS.has(road.kind)) ribbon(verge, points, road.width + 5, LAYER_Y.verge, UV_METRES.verge);
    ribbon(tarmac, points, road.width, LAYER_Y.road, UV_METRES.tarmac);
    addStripes(stripes, span);
  }
  const grass = new MeshBuilder();
  const water = new MeshBuilder();
  const sand = new MeshBuilder();
  for (const area of areas) addPolygon(area.kind === "park" ? grass : area.kind === "water" ? water : sand, area.outline, LAYER_Y.park);

  const meshes: THREE.Mesh[] = [];
  const owned: THREE.BufferGeometry[] = [];
  const flat = (builder: MeshBuilder, material: THREE.Material) => {
    const geometry = builder.build();
    if (!geometry) return;
    owned.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    meshes.push(mesh);
  };
  flat(grass, assets.grass);
  flat(water, assets.water);
  flat(sand, assets.sand);
  flat(verge, assets.paving);
  flat(tarmac, assets.asphalt);
  if (stripes.length > 0) {
    const mesh = new THREE.InstancedMesh(assets.stripe, assets.paint, stripes.length);
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const at = new THREE.Vector3();
    const scale = new THREE.Vector3();
    stripes.forEach((s, i) => {
      rotation.setFromAxisAngle(up, s.angle);
      mesh.setMatrixAt(i, matrix.compose(at.set(s.x, LAYER_Y.marking, s.z), rotation, scale.set(s.across, 1, s.along)));
    });
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    meshes.push(mesh);
  }
  return { meshes, owned };
}
