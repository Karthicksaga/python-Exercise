/**
 * Owns the WebGL renderer, the scene and its light. Everything visible is added to `scene`
 * by other modules; this class only knows how to light and draw it.
 *
 * The light follows the time of day and the weather (`setTimeOfDay`, `setRain`) through
 * `lightingAt`; modules that change with it (sky, wet roads, lit windows, vehicle lamps)
 * subscribe with `listen`. Draw distance, shadows, rain density and speed blur depend on the
 * quality tier (`TIERS`).
 */
import * as THREE from "three";
import { lightingAt, wrapHour, type Look } from "./lighting";
import { MotionBlur } from "./MotionBlur";
import { RainView } from "./RainView";
import { headlightTexture } from "./textures";

/**
 * "low" for phones, "high" for desktops. "lite" draws at a quarter of the pixels with no shadows:
 * for automated tests on machines without a GPU, where only gameplay is being checked.
 */
export type Quality = "low" | "high" | "lite";

export interface RendererOptions {
  readonly canvas: HTMLCanvasElement;
  readonly quality: Quality;
}

/** What each quality tier can afford. Distances in metres. */
export interface TierSettings {
  /** Camera far plane: nothing further is drawn. */
  readonly far: number;
  /** Fog on a clear noon; haze (golden hour, rain, later the coast) pulls both nearer. */
  readonly fogNear: number;
  readonly fogFar: number;
  /** Chunk streaming distances (see `ChunkManager`). */
  readonly loadDistance: number;
  readonly unloadDistance: number;
  /** Shadow map size, 0 for no shadows. */
  readonly shadowMap: number;
  /** Half-width of the shadow box around the player. */
  readonly shadowReach: number;
  /** Blur radius of shadow edges, in shadow-map texels (same cost at any radius). */
  readonly shadowSoftness: number;
  /** Rain streaks around the camera (one draw call whatever the number). */
  readonly rainDrops: number;
  /** Frame-blend blur at high speed: two extra full-screen passes while it is on. */
  readonly motionBlur: boolean;
}

export const TIERS: Readonly<Record<Quality, TierSettings>> = {
  lite: { far: 340, fogNear: 80, fogFar: 320, loadDistance: 260, unloadDistance: 340, shadowMap: 0, shadowReach: 0, shadowSoftness: 0, rainDrops: 500, motionBlur: false },
  low: { far: 360, fogNear: 90, fogFar: 340, loadDistance: 250, unloadDistance: 330, shadowMap: 1024, shadowReach: 40, shadowSoftness: 1.5, rainDrops: 1100, motionBlur: false },
  high: { far: 480, fogNear: 120, fogFar: 450, loadDistance: 300, unloadDistance: 380, shadowMap: 2048, shadowReach: 55, shadowSoftness: 3, rainDrops: 2200, motionBlur: true },
};

/** Colour of the clear-noon horizon haze. The sky and fog take their colours from the time of day after start-up. */
export const HAZE = 0xc9dbe6;

/** Distance of the shadow camera from the player, along the light. */
const SUN_DISTANCE = 130;
/** Game hours the clock must move before the light is recomputed (about half a real second). */
const HOUR_STEP = 0.01;
/** Seconds for rain to start or stop. */
const RAIN_FADE = 2.5;
/** Speed blur: none below `BLUR_FROM` m/s (about 58 km/h), strongest from `BLUR_FULL` (about 115 km/h). */
const BLUR_FROM = 16;
const BLUR_FULL = 32;
const BLUR_MAX = 0.42;

/** Where the player's vehicle is, for the pool of headlight on the road ahead at night. */
export interface HeadlightPose {
  readonly x: number;
  readonly z: number;
  /** Heading: 0 faces north (-Z), positive turns left. */
  readonly yaw: number;
}

export type LookListener = (look: Look) => void;

export class SceneRenderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** What this device's tier gets (draw distance, shadows, rain, blur). */
  readonly tier: TierSettings;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly fog: THREE.Fog;
  private readonly background = new THREE.Color(HAZE);
  /** Light direction scaled to the shadow camera's distance (from the ground towards the light). */
  readonly sunOffset = new THREE.Vector3(38, 60, 26);
  private current: Look;
  private hour = 17.75;
  private rainTarget = 0;
  private rainLevel = 0;
  /** Extra haze for the place (1 inland; a coast can raise it later). */
  private placeHaze = 1;
  private readonly listeners: LookListener[] = [];
  private readonly rain: RainView;
  private readonly headlights: THREE.Mesh;
  private readonly headlightMaterial: THREE.MeshBasicMaterial;
  private blur: MotionBlur | null = null;
  private blurAmount = 0;
  /** Reflections: the sky copy they are rendered from, and the phase they were made for. */
  private reflection: { stage: THREE.Scene; floor: THREE.MeshBasicMaterial; generator: THREE.PMREMGenerator; target: THREE.WebGLRenderTarget | null; phase: string } | null = null;

  constructor(private readonly options: RendererOptions) {
    const { canvas, quality } = options;
    this.tier = TIERS[quality];
    // Throws when WebGL is unavailable; the caller shows the error to the player.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === "high", powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = this.tier.shadowMap > 0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // Counted per frame in `render`, so passes of the speed blur add up instead of resetting.
    this.renderer.info.autoReset = false;

    this.scene.background = this.background;
    // Haze hides the edge of the drawn world and chunk streaming.
    this.fog = new THREE.Fog(HAZE, this.tier.fogNear, this.tier.fogFar);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, this.tier.far);

    this.hemisphere = new THREE.HemisphereLight(0xdfefff, 0x8d7b5a, 0.85);
    this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
    this.sun.castShadow = this.tier.shadowMap > 0;
    if (this.sun.castShadow) {
      this.sun.shadow.mapSize.set(this.tier.shadowMap, this.tier.shadowMap);
      // The shadow box follows the player (see `focusShadows`), so it can stay small and sharp.
      const reach = this.tier.shadowReach;
      const shadowCamera = this.sun.shadow.camera;
      shadowCamera.left = -reach;
      shadowCamera.right = reach;
      shadowCamera.top = reach;
      shadowCamera.bottom = -reach;
      shadowCamera.near = 1;
      shadowCamera.far = SUN_DISTANCE + 130;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.03;
      this.sun.shadow.radius = this.tier.shadowSoftness;
    }
    this.scene.add(this.sun, this.sun.target);

    this.rain = new RainView(this.tier.rainDrops);
    this.scene.add(this.rain.object);

    // A soft pool of light on the road ahead of the player's vehicle after dark: one flat quad.
    this.headlightMaterial = new THREE.MeshBasicMaterial({
      map: headlightTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      opacity: 0,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    });
    this.headlights = new THREE.Mesh(new THREE.PlaneGeometry(7, 16).rotateX(-Math.PI / 2), this.headlightMaterial);
    this.headlights.visible = false;
    this.headlights.renderOrder = 3;
    this.scene.add(this.headlights);

    this.current = lightingAt(this.hour, 0);
    this.applyLook();
    this.resize();
  }

  /** The look in use (time of day and weather), for tests and modules that need it now. */
  get look(): Look {
    return this.current;
  }

  /** True while rain is falling or about to (the target, not the fade). */
  get raining(): boolean {
    return this.rainTarget > 0;
  }

  /**
   * Call `listener` now and whenever the look changes (sky, wet roads, lit windows, lamps).
   * Cheap: only material parameters should change in a listener.
   */
  listen(listener: LookListener): void {
    this.listeners.push(listener);
    listener(this.current);
    // The sky the reflections come from may just have changed.
    if (this.reflection) this.reflection.phase = "";
    this.applyLook();
  }

  /** Follow the game clock (0 to 24). Recomputes only when the hour moved noticeably. */
  setTimeOfDay(hour: number): void {
    const h = wrapHour(hour);
    const gap = Math.abs(h - this.hour);
    if (Math.min(gap, 24 - gap) < HOUR_STEP) return;
    this.hour = h;
    this.applyLook();
  }

  /** Start or stop the rain. It fades over a couple of seconds unless `immediate`. */
  setRain(on: boolean, immediate = false): void {
    this.rainTarget = on ? 1 : 0;
    if (immediate && this.rainLevel !== this.rainTarget) {
      this.rainLevel = this.rainTarget;
      this.applyLook();
    }
  }

  /** Haze for the place: 1 inland; above 1 thickens the fog (sea haze near the coast, later). */
  setHaze(amount: number): void {
    const next = Math.max(0.5, Math.min(3, Number.isFinite(amount) ? amount : 1));
    if (Math.abs(next - this.placeHaze) < 0.01) return;
    this.placeHaze = next;
    this.applyLook();
  }

  /**
   * Per frame, before `render`: rain animation and fade, headlight pool and speed blur.
   * @param speed the player's speed in m/s (speed blur on the high tier)
   * @param headlights the player's vehicle, or null on foot
   */
  update(dt: number, speed: number, headlights: HeadlightPose | null): void {
    if (this.rainLevel !== this.rainTarget) {
      const step = dt / RAIN_FADE;
      this.rainLevel = this.rainTarget > this.rainLevel ? Math.min(this.rainTarget, this.rainLevel + step) : Math.max(this.rainTarget, this.rainLevel - step);
      this.applyLook();
    }
    const night = this.current.night;
    const dim: readonly [number, number, number] = [0.25 + 0.53 * (1 - night), 0.28 + 0.52 * (1 - night), 0.33 + 0.51 * (1 - night)];
    this.rain.update(dt, this.camera, this.rainLevel, dim);

    const glow = Math.max(0, (night - 0.15) / 0.85) * 0.6 * (1 + 0.35 * this.rainLevel);
    this.headlights.visible = headlights !== null && glow > 0.01;
    if (headlights && this.headlights.visible) {
      const fx = -Math.sin(headlights.yaw);
      const fz = -Math.cos(headlights.yaw);
      // The pool starts just ahead of the bumper and reaches about 17 m.
      this.headlights.position.set(headlights.x + fx * 9.5, 0.1, headlights.z + fz * 9.5);
      this.headlights.rotation.y = headlights.yaw;
      this.headlightMaterial.opacity = glow;
    }

    if (this.tier.motionBlur) {
      const target = Math.min(1, Math.max(0, (Math.abs(speed) - BLUR_FROM) / (BLUR_FULL - BLUR_FROM))) * BLUR_MAX;
      this.blurAmount += (target - this.blurAmount) * Math.min(1, dt * 4);
    }
  }

  /** Turn the current hour, rain and place haze into lights, fog, sky and exposure. */
  private applyLook(): void {
    const look = lightingAt(this.hour, this.rainLevel);
    this.current = look;
    const srgb = THREE.SRGBColorSpace;
    this.sun.color.setRGB(...look.lightColor, srgb);
    this.sun.intensity = look.lightIntensity;
    this.sunOffset.set(...look.light).multiplyScalar(SUN_DISTANCE);
    this.hemisphere.color.setRGB(...look.hemiSky, srgb);
    this.hemisphere.groundColor.setRGB(...look.hemiGround, srgb);
    this.hemisphere.intensity = look.hemiIntensity;
    this.background.setRGB(...look.horizon, srgb);
    this.fog.color.setRGB(...look.horizon, srgb);
    const haze = look.haze * this.placeHaze;
    this.fog.near = this.tier.fogNear / haze;
    this.fog.far = Math.min(this.tier.far - 5, this.tier.fogFar / (1 + (haze - 1) * 0.6));
    this.renderer.toneMappingExposure = look.exposure;
    this.scene.environmentIntensity = look.environment;
    for (const listener of this.listeners) listener(look);
    this.refreshReflections(look);
  }

  /**
   * Use an object (the sky dome) as the source of reflections and soft ambient light, so car
   * paint and glass pick up the sky instead of looking flat. Rebuilt only when the sky changes
   * character (day, low sun, twilight, night, rain), a handful of times per game day.
   */
  reflect(sky: THREE.Object3D): void {
    const stage = new THREE.Scene();
    const copy = sky.clone();
    copy.position.set(0, 0, 0);
    stage.add(copy);
    // Below the horizon the "sky" is the colour of the ground.
    const floor = new THREE.MeshBasicMaterial({ color: 0x8f8266 });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(440, 24).rotateX(-Math.PI / 2), floor);
    disc.position.y = -1;
    stage.add(disc);
    this.reflection = { stage, floor, generator: new THREE.PMREMGenerator(this.renderer), target: null, phase: "" };
    this.refreshReflections(this.current);
  }

  private refreshReflections(look: Look): void {
    const reflection = this.reflection;
    if (!reflection) return;
    const phase = (look.night > 0.6 ? "night" : look.night > 0.15 ? "twilight" : look.light[1] < 0.45 ? "low" : "day") + (look.rain > 0.5 ? "-rain" : "");
    if (phase === reflection.phase) return;
    reflection.phase = phase;
    reflection.floor.color.setRGB(...look.hemiGround, THREE.SRGBColorSpace);
    const target = reflection.generator.fromScene(reflection.stage, 0, 1, 600);
    this.scene.environment = target.texture;
    reflection.target?.dispose();
    reflection.target = target;
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
    this.renderer.info.reset();
    if (this.tier.motionBlur && this.blurAmount > 0.02) {
      this.blur ??= new MotionBlur(4);
      this.blur.render(this.renderer, this.scene, this.camera, this.blurAmount);
      return;
    }
    this.blur?.reset();
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
