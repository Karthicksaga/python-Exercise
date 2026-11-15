/**
 * The always-loaded part of the world: ground, roads, footpaths, lane markings, parks and sky.
 * Roads for the whole map are a handful of merged meshes.
 */
import * as THREE from "three";
import type { Point, Road, WorldMap } from "@cow/game-world";
import { MeshBuilder } from "./MeshBuilder";
import { asphaltTexture, earthTexture, grassTexture, pavingTexture } from "./textures";

/** Heights of the flat layers above the ground plane, far enough apart not to shimmer. */
const Y = { park: 0.02, verge: 0.035, road: 0.06, marking: 0.08 } as const;

/** Add a flat ribbon following a polyline, with a disc at every vertex to close joints and junctions. */
function ribbon(builder: MeshBuilder, points: readonly Point[], width: number, y: number, uvScale: number): void {
  const half = width / 2;
  const v = (x: number, z: number) => builder.vertex(x, y, z, 0, 1, 0, x / uvScale, z / uvScale);

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 0.01) continue;
    const ox = (-(b.z - a.z) / length) * half;
    const oz = ((b.x - a.x) / length) * half;
    const a0 = v(a.x + ox, a.z + oz);
    const a1 = v(a.x - ox, a.z - oz);
    const b1 = v(b.x - ox, b.z - oz);
    const b0 = v(b.x + ox, b.z + oz);
    builder.quad(a0, b0, b1, a1);
  }
  const SIDES = 10;
  for (const p of points) {
    const centre = v(p.x, p.z);
    const rim: number[] = [];
    for (let s = 0; s < SIDES; s++) {
      const angle = (s / SIDES) * Math.PI * 2;
      rim.push(v(p.x + Math.cos(angle) * half, p.z + Math.sin(angle) * half));
    }
    for (let s = 0; s < SIDES; s++) builder.triangle(centre, rim[(s + 1) % SIDES]!, rim[s]!);
  }
}

function flatMaterial(map: THREE.Texture, offset: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -offset, polygonOffsetUnits: -offset });
}

/** Sky dome: blue overhead fading to haze at the horizon, with a soft glow around the sun. */
function sky(horizon: THREE.Color, sunDirection: THREE.Vector3): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x3f86d4) },
      horizon: { value: horizon },
      sun: { value: sunDirection.clone().normalize() },
    },
    vertexShader: "varying vec3 dir; void main(){ dir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sun; varying vec3 dir;
      void main(){
        vec3 d = normalize(dir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 color = mix(horizon, top, pow(h, 0.55));
        float glow = max(dot(d, sun), 0.0);
        color += vec3(1.0, 0.9, 0.7) * (pow(glow, 350.0) * 1.2 + pow(glow, 12.0) * 0.18);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 12), material);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  return dome;
}

export class MapView {
  readonly object = new THREE.Group();
  /** The sky dome; also used as the source of reflections. */
  readonly dome: THREE.Mesh;

  constructor(map: WorldMap, horizon: THREE.Color, sunDirection: THREE.Vector3) {
    const { bounds } = map;
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;

    // Bare ground, reaching past the playable edge so the horizon isn't a hard line.
    const earth = earthTexture();
    earth.repeat.set((width + 600) / 12, (depth + 600) / 12);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(width + 600, depth + 600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: earth, roughness: 1 }));
    ground.position.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
    ground.receiveShadow = true;
    this.object.add(ground);

    this.addAreas(map);
    this.addRoads(map.roads);

    this.dome = sky(horizon, sunDirection);
    this.object.add(this.dome);
  }

  /** Keep the sky centred on the camera so it always looks infinitely far away. */
  follow(camera: THREE.Camera): void {
    this.dome.position.copy(camera.position);
  }

  private addAreas(map: WorldMap): void {
    const grass = new MeshBuilder();
    const water = new MeshBuilder();
    for (const area of map.areas) {
      const builder = area.kind === "park" ? grass : water;
      const base = builder.vertexCount;
      for (const p of area.outline) builder.vertex(p.x, Y.park, p.z, 0, 1, 0, p.x / 6, p.z / 6);
      const faces = THREE.ShapeUtils.triangulateShape(area.outline.map((p) => new THREE.Vector2(p.x, p.z)), []);
      for (const face of faces) {
        const [i0, i1, i2] = face as [number, number, number];
        const p0 = area.outline[i0]!;
        const p1 = area.outline[i1]!;
        const p2 = area.outline[i2]!;
        const up = (p1.z - p0.z) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.z - p0.z) > 0;
        if (up) builder.triangle(base + i0, base + i1, base + i2);
        else builder.triangle(base + i0, base + i2, base + i1);
      }
    }
    this.addFlat(grass, flatMaterial(grassTexture(), 1));
    this.addFlat(water, new THREE.MeshStandardMaterial({ color: 0x3f7fa6, roughness: 0.2, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  }

  private addRoads(roads: readonly Road[]): void {
    const verge = new MeshBuilder(); // paved strip beside the bigger roads, and footpaths
    const tarmac = new MeshBuilder();
    for (const road of roads) {
      if (road.kind === "footway") {
        ribbon(verge, road.points, road.width, Y.verge, 3);
        continue;
      }
      if (road.kind === "secondary" || road.kind === "tertiary") ribbon(verge, road.points, road.width + 5, Y.verge, 3);
      ribbon(tarmac, road.points, road.width, Y.road, 9);
    }
    this.addFlat(verge, flatMaterial(pavingTexture(), 2));
    this.addFlat(tarmac, flatMaterial(asphaltTexture(), 3));
    this.addMarkings(roads);
  }

  /** Dashed centre line on the main roads, as one instanced mesh. */
  private addMarkings(roads: readonly Road[]): void {
    const dashes: Array<{ x: number; z: number; angle: number }> = [];
    for (const road of roads) {
      if (road.kind !== "secondary" && road.kind !== "tertiary") continue;
      let travelled = 0;
      let next = 8;
      const total = road.points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - road.points[i]!.x, p.z - road.points[i]!.z), 0);
      for (let i = 0; i < road.points.length - 1; i++) {
        const a = road.points[i]!;
        const b = road.points[i + 1]!;
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        while (next < travelled + length) {
          // No paint close to the ends, where junctions usually are.
          if (next < total - 8) {
            const t = (next - travelled) / length;
            dashes.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, angle: Math.atan2(b.x - a.x, b.z - a.z) });
          }
          next += 9;
        }
        travelled += length;
      }
    }
    if (dashes.length === 0) return;
    const paint = new THREE.MeshStandardMaterial({ color: 0xf0efe6, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 3.2).rotateX(-Math.PI / 2), paint, dashes.length);
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    dashes.forEach((d, i) => {
      rotation.setFromAxisAngle(up, d.angle);
      matrix.compose(new THREE.Vector3(d.x, Y.marking, d.z), rotation, one);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    this.object.add(mesh);
  }

  private addFlat(builder: MeshBuilder, material: THREE.Material): void {
    const geometry = builder.build();
    if (!geometry) return;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    this.object.add(mesh);
  }
}
