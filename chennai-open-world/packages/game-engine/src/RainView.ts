/**
 * Light rain: short falling streaks in a box that travels with the camera, drawn as one
 * `LineSegments` (one draw call). Streaks stay put in the world as the camera moves and wrap
 * around the box, so the rain never runs out; all movement happens in the vertex shader.
 */
import * as THREE from "three";

/** Size of the rain box around the camera, metres (x, y, z). */
const BOX = new THREE.Vector3(36, 22, 36);
/** Falling speed (m/s), and how long a streak's tail trails behind (s): 14 m/s × 0.04 s ≈ 0.6 m. */
const FALL = 14;
const STREAK = 0.04;

export class RainView {
  readonly object: THREE.LineSegments;
  private readonly material: THREE.ShaderMaterial;
  private time = 0;

  /** @param drops streaks in the box; one draw call whatever the number */
  constructor(drops: number) {
    const positions = new Float32Array(drops * 6);
    const tails = new Float32Array(drops * 2);
    // Deterministic scatter, so the rain looks the same on every run.
    let state = 12345;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    for (let i = 0; i < drops; i++) {
      const x = random() * BOX.x;
      const y = random() * BOX.y;
      const z = random() * BOX.z;
      positions.set([x, y, z, x, y, z], i * 6);
      tails[i * 2 + 1] = 1;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("tail", new THREE.BufferAttribute(tails, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        origin: { value: new THREE.Vector3() },
        time: { value: 0 },
        box: { value: BOX.clone() },
        wind: { value: new THREE.Vector2(1.2, 0.6) },
        color: { value: new THREE.Color(0xc4ccd4) },
        opacity: { value: 0 },
      },
      vertexShader: `
        uniform vec3 origin; uniform float time; uniform vec3 box; uniform vec2 wind;
        attribute float tail; varying float fade;
        void main(){
          vec3 velocity = vec3(wind.x, -${FALL.toFixed(1)}, wind.y);
          vec3 p = position;
          float y = mod(p.y - time * ${FALL.toFixed(1)}, box.y);
          vec3 world = vec3(
            origin.x + mod(p.x - origin.x, box.x) - box.x * 0.5,
            origin.y - box.y * 0.35 + y,
            origin.z + mod(p.z - origin.z, box.z) - box.z * 0.5);
          world -= velocity * tail * ${STREAK.toFixed(3)};
          vec4 view = viewMatrix * vec4(world, 1.0);
          gl_Position = projectionMatrix * view;
          // Fade near the box edges so streaks don't pop in and out, and the tail into nothing.
          float edge = length(world.xz - origin.xz) / (box.x * 0.5);
          fade = (1.0 - smoothstep(0.6, 1.0, edge)) * (1.0 - tail * 0.7) * smoothstep(0.5, 2.0, -view.z);
        }`,
      fragmentShader: `
        uniform vec3 color; uniform float opacity; varying float fade;
        void main(){
          gl_FragColor = vec4(color, opacity * fade);
          #include <colorspace_fragment>
        }`,
    });
    this.object = new THREE.LineSegments(geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 4;
    this.object.visible = false;
  }

  /**
   * @param level 0 no rain (hidden, no draw call) to 1 steady light rain
   * @param tint streak colour (lighter by day, dim at night), sRGB 0..1
   */
  update(dt: number, camera: THREE.Camera, level: number, tint: readonly [number, number, number]): void {
    this.object.visible = level > 0.01;
    if (!this.object.visible) return;
    // The fall repeats every box height, so wrapping time keeps the shader's numbers small.
    this.time = (this.time + dt) % (BOX.y / FALL);
    const u = this.material.uniforms;
    u.time!.value = this.time;
    (u.origin!.value as THREE.Vector3).copy(camera.position);
    (u.color!.value as THREE.Color).setRGB(tint[0], tint[1], tint[2], THREE.SRGBColorSpace);
    u.opacity!.value = 0.42 * level;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.material.dispose();
  }
}
