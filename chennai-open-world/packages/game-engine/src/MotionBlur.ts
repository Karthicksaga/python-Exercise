/**
 * Cheap speed blur for the "high" tier: each frame is blended with the previous blended frame,
 * so fast-moving edges leave a short smear. Costs two full-screen passes and three render
 * targets (made on first use), and only while blurring; below the speed threshold the scene
 * draws straight to the screen as before. Never used on phones ("low") or in tests ("lite").
 */
import * as THREE from "three";

const QUAD_VERTEX = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";

export class MotionBlur {
  private readonly scene: THREE.WebGLRenderTarget;
  private history: THREE.WebGLRenderTarget;
  private next: THREE.WebGLRenderTarget;
  private readonly blend: THREE.ShaderMaterial;
  private readonly output: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private readonly stage = new THREE.Scene();
  private readonly flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly size = new THREE.Vector2();
  /** False when the history holds nothing useful (blur just started or the view resized). */
  private primed = false;

  constructor(samples: number) {
    // Half floats keep the scene's light values linear and unclipped until the final pass.
    const options = { type: THREE.HalfFloatType, depthBuffer: false };
    this.scene = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.history = new THREE.WebGLRenderTarget(1, 1, options);
    this.next = new THREE.WebGLRenderTarget(1, 1, options);
    this.blend = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: { current: { value: null }, previous: { value: null }, amount: { value: 0 } },
      vertexShader: QUAD_VERTEX,
      fragmentShader: "uniform sampler2D current; uniform sampler2D previous; uniform float amount; varying vec2 vUv; void main(){ gl_FragColor = mix(texture2D(current, vUv), texture2D(previous, vUv), amount); }",
    });
    // Tone mapping and sRGB output happen here, as they would when drawing straight to the screen.
    this.output = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: { map: { value: null } },
      vertexShader: QUAD_VERTEX,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv;
        void main(){ gl_FragColor = texture2D(map, vUv);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blend);
    this.quad.frustumCulled = false;
    this.stage.add(this.quad);
  }

  /** Forget the previous frame (call when blur stops, so it restarts clean). */
  reset(): void {
    this.primed = false;
  }

  /** @param amount 0 (no smear) to below 1: share of the previous frame kept */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, amount: number): void {
    renderer.getDrawingBufferSize(this.size);
    if (this.scene.width !== this.size.x || this.scene.height !== this.size.y) {
      for (const target of [this.scene, this.history, this.next]) target.setSize(this.size.x, this.size.y);
      this.primed = false;
    }
    renderer.setRenderTarget(this.scene);
    renderer.render(scene, camera);

    this.blend.uniforms.current!.value = this.scene.texture;
    this.blend.uniforms.previous!.value = this.history.texture;
    this.blend.uniforms.amount!.value = this.primed ? amount : 0;
    this.quad.material = this.blend;
    renderer.setRenderTarget(this.next);
    renderer.render(this.stage, this.flat);

    this.output.uniforms.map!.value = this.next.texture;
    this.quad.material = this.output;
    renderer.setRenderTarget(null);
    renderer.render(this.stage, this.flat);

    [this.history, this.next] = [this.next, this.history];
    this.primed = true;
  }

  dispose(): void {
    for (const target of [this.scene, this.history, this.next]) target.dispose();
    this.blend.dispose();
    this.output.dispose();
    this.quad.geometry.dispose();
  }
}
