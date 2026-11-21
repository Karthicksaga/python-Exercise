/**
 * The always-loaded part of the world: the ground, the sea and the sky. Roads, parks and sand
 * are drawn by the chunks they lie in (`GroundMeshes`), so only the nearby city is in memory.
 */
import * as THREE from "three";
import type { Sea, WorldMap } from "@cow/game-world";
import type { Look } from "./lighting";
import { MeshBuilder } from "./MeshBuilder";
import { earthTexture } from "./textures";

/**
 * Sky dome: zenith colour fading to haze at the horizon, a sun disc with a soft glow, a warm
 * band along the horizon under the sun at sunrise and sunset, and the moon and a few stars at
 * night. Colours come from the time of day (`MapView.applyLook`). Drawn at the far plane, so it
 * works with every tier's draw distance.
 */
function sky(horizon: THREE.Color, sunDirection: THREE.Vector3): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x3f86d4) },
      horizon: { value: horizon.clone() },
      sun: { value: sunDirection.clone().normalize() },
      glowColor: { value: new THREE.Color(0xfff0c8) },
      glowStrength: { value: 0.4 },
      sunDisc: { value: 1 },
      moon: { value: new THREE.Vector3(-0.32, 0.8, 0.5).normalize() },
      moonlight: { value: 0 },
    },
    vertexShader: "varying vec3 dir; void main(){ dir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.99999; }",
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sun; uniform vec3 glowColor; uniform float glowStrength;
      uniform float sunDisc; uniform vec3 moon; uniform float moonlight; varying vec3 dir;
      void main(){
        vec3 d = normalize(dir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 color = mix(horizon, top, pow(h, 0.55));
        float glow = max(dot(d, sun), 0.0);
        color += glowColor * (pow(glow, 350.0) * 1.4 * sunDisc + pow(glow, 12.0) * 0.22 * glowStrength);
        // Sunrise and sunset: a wide warm band low in the sky on the sun's side.
        vec2 across = normalize(d.xz + vec2(1e-5));
        vec2 sunFlat = normalize(sun.xz + vec2(1e-5));
        float side = max(dot(across, sunFlat), 0.0);
        color += glowColor * glowStrength * pow(1.0 - h, 5.0) * pow(side, 2.5) * 0.45;
        // Moon disc with a faint halo, and sparse stars, after dark.
        float m = max(dot(d, moon), 0.0);
        color += vec3(0.85, 0.9, 1.0) * moonlight * (smoothstep(0.9997, 0.99982, m) * 1.6 + pow(m, 40.0) * 0.08);
        vec3 cell = floor(d * 420.0);
        float star = fract(sin(dot(cell, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
        color += vec3(step(0.9975, star) * moonlight * 0.7 * smoothstep(0.08, 0.35, d.y));
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 12), material);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  return dome;
}

/** Uniforms of the sky dome's shader. */
interface SkyUniforms {
  readonly top: { value: THREE.Color };
  readonly horizon: { value: THREE.Color };
  readonly sun: { value: THREE.Vector3 };
  readonly glowColor: { value: THREE.Color };
  readonly glowStrength: { value: number };
  readonly sunDisc: { value: number };
  readonly moon: { value: THREE.Vector3 };
  readonly moonlight: { value: number };
}

/** A surface that darkens and shines when wet: its dry roughness is kept to return to. */
interface WetSurface {
  readonly material: THREE.MeshStandardMaterial;
  readonly dry: number;
  readonly wet: number;
  readonly darken: number;
}

export class MapView {
  readonly object = new THREE.Group();
  /** The sky dome; also used as the source of reflections. */
  readonly dome: THREE.Mesh;
  private readonly wetSurfaces: WetSurface[] = [];

  constructor(map: WorldMap, horizon: THREE.Color, sunDirection: THREE.Vector3) {
    const { bounds } = map;
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;

    // Bare ground, reaching past the playable edge so the horizon isn't a hard line.
    const earth = earthTexture();
    earth.repeat.set((width + 600) / 12, (depth + 600) / 12);
    const groundMaterial = new THREE.MeshStandardMaterial({ map: earth, roughness: 1 });
    this.wetSurfaces.push({ material: groundMaterial, dry: 1, wet: 0.75, darken: 0.3 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(width + 600, depth + 600).rotateX(-Math.PI / 2), groundMaterial);
    ground.position.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
    ground.receiveShadow = true;
    this.object.add(ground);

    if (map.sea) this.addSea(map.sea);

    this.dome = sky(horizon, sunDirection);
    this.object.add(this.dome);
  }

  /** Keep the sky centred on the camera so it always looks infinitely far away. */
  follow(camera: THREE.Camera): void {
    this.dome.position.copy(camera.position);
  }

  /** Sky colours for the time of day, and wet, darker, shinier roads and paths in the rain. */
  applyLook(look: Look): void {
    const u = (this.dome.material as THREE.ShaderMaterial).uniforms as unknown as SkyUniforms;
    u.top.value.setRGB(...look.zenith, THREE.SRGBColorSpace);
    u.horizon.value.setRGB(...look.horizon, THREE.SRGBColorSpace);
    u.glowColor.value.setRGB(...look.glow, THREE.SRGBColorSpace);
    u.sun.value.set(...look.sunSky);
    u.moon.value.set(...look.moon);
    u.glowStrength.value = look.glowStrength;
    u.sunDisc.value = look.sunDisc;
    u.moonlight.value = look.moonlight;
    for (const surface of this.wetSurfaces) {
      surface.material.roughness = surface.dry + (surface.wet - surface.dry) * look.rain;
      surface.material.color.setScalar(1 - surface.darken * look.rain);
    }
  }

  /**
   * The sea east of the coast, out past the draw distance: one flat mesh. It sits just above
   * the ground so the sand and roads stop at the waterline. Gently shiny, darker in the rain.
   */
  private addSea(sea: Sea): void {
    const outline = sea.outline;
    if (outline.length < 3) return;
    const builder = new MeshBuilder();
    for (const p of outline) builder.vertex(p.x, 0.03, p.z, 0, 1, 0, p.x / 40, p.z / 40);
    const faces = THREE.ShapeUtils.triangulateShape(outline.map((p) => new THREE.Vector2(p.x, p.z)), []);
    for (const face of faces) {
      const [i0, i1, i2] = face as [number, number, number];
      const p0 = outline[i0]!;
      const p1 = outline[i1]!;
      const p2 = outline[i2]!;
      const up = (p1.z - p0.z) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.z - p0.z) > 0;
      if (up) builder.triangle(i0, i1, i2);
      else builder.triangle(i0, i2, i1);
    }
    const geometry = builder.build();
    if (!geometry) return;
    // Rough enough and only faintly reflective: a glossy sea mirrors the hazy horizon and
    // reads as more sky (seen on the first try). Bay of Bengal blue-green.
    const material = new THREE.MeshStandardMaterial({ color: 0x2c7f99, roughness: 0.55, metalness: 0, envMapIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    // Not a "wet surface": that look resets the colour to white (it suits textured ground only).
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "sea";
    mesh.receiveShadow = true;
    this.object.add(mesh);
  }
}
