/**
 * Owns the WebGL renderer, the scene and the daylight. Everything visible is added to `scene`
 * by other modules; this class only knows how to light and draw it.
 */
import * as THREE from "three";

/**
 * "low" for phones, "high" for desktops. "lite" draws at a quarter of the pixels with no shadows:
 * for automated tests on machines without a GPU, where only gameplay is being checked.
 */
export type Quality = "low" | "high" | "lite";

export interface RendererOptions {
  readonly canvas: HTMLCanvasElement;
  readonly quality: Quality;
}

/** Colour of the horizon haze; the fog and the sky dome both use it so they meet seamlessly. */
export const HAZE = 0xc9dbe6;

export class SceneRenderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly sun: THREE.DirectionalLight;
  /** Sun direction (from the ground towards the sun). */
  readonly sunOffset = new THREE.Vector3(38, 60, 26);

  constructor(private readonly options: RendererOptions) {
    const { canvas, quality } = options;
    // Throws when WebGL is unavailable; the caller shows the error to the player.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === "high", powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = quality !== "lite";
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color(HAZE);
    // Coastal haze: hides the edge of the loaded world and will hide chunk streaming later.
    this.scene.fog = new THREE.Fog(HAZE, 110, 400);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 500);

    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x8d7b5a, 0.85));
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
    this.sun.castShadow = quality !== "lite";
    const size = quality === "high" ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    // The shadow box follows the player (see `focusShadows`), so it can stay small and sharp.
    const reach = 45;
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = -reach;
    shadowCamera.right = reach;
    shadowCamera.top = reach;
    shadowCamera.bottom = -reach;
    shadowCamera.near = 1;
    shadowCamera.far = 180;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.resize();
  }

  /**
   * Use an object (the sky dome) as the source of reflections and soft ambient light, so car
   * paint and glass pick up the sky instead of looking flat. Computed once.
   */
  reflect(sky: THREE.Object3D): void {
    const stage = new THREE.Scene();
    const copy = sky.clone();
    copy.position.set(0, 0, 0);
    stage.add(copy);
    // Below the horizon the "sky" is the colour of the ground.
    const floor = new THREE.Mesh(new THREE.CircleGeometry(440, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8f8266 }));
    floor.position.y = -1;
    stage.add(floor);
    const generator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = generator.fromScene(stage, 0, 1, 600).texture;
    this.scene.environmentIntensity = 0.45;
    generator.dispose();
    floor.geometry.dispose();
  }

  /** Match the canvas to its CSS size. Call on window resize and rotation. */
  resize(): void {
    const canvas = this.options.canvas;
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    // Phones report pixel ratios of 2.5-4; drawing at that size wastes the GPU on a 3D scene.
    const { quality } = this.options;
    const cap = quality === "high" ? 2 : 1.5;
    this.renderer.setPixelRatio(quality === "lite" ? 0.5 : Math.min(window.devicePixelRatio || 1, cap));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Centre the shadow-casting area on a point (the player). */
  focusShadows(x: number, z: number): void {
    // Snap to whole metres so shadow edges don't shimmer as the player moves.
    const cx = Math.round(x);
    const cz = Math.round(z);
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx + this.sunOffset.x, this.sunOffset.y, cz + this.sunOffset.z);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Draw calls and triangles of the last frame, for performance checks. */
  stats(): { calls: number; triangles: number } {
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }

  /** Name of the GPU driver in use, when the browser reveals it. */
  gpu(): string {
    const gl = this.renderer.getContext();
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  }
}
