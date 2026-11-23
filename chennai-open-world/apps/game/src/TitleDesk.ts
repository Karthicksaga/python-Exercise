/**
 * The title menu over the live city: the menu itself (`TitleScreen` in `@cow/ui`) and the slow
 * camera that circles the player behind it. Game.ts wires it; the game's rules do not run while it
 * is open (the loop is stopped), only the camera moves and the street is drawn.
 */
import { TitleScreen, type TitleControlsGroup, type TitleModel } from "@cow/ui";

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TitleHooks {
  /** What the menu shows now (progress, place, time, weather). */
  model(): TitleModel;
  /** Where the camera circles, and the heading to start behind (the player's). */
  centre(): Vec3 & { readonly yaw: number };
  /** Draw one frame of the city from `eye` looking at `target`. */
  draw(dt: number, eye: Vec3, target: Vec3): void;
  play(): void;
  newGame(): void;
  nextTime(): void;
  toggleWeather(): void;
  toggleSound(): void;
  quit?: () => void;
}

/** The touch controls, as the pause screen describes them, grouped for the Controls page. */
export const CONTROLS: readonly TitleControlsGroup[] = [
  {
    heading: "On foot",
    items: [
      ["Left side", "Move"],
      ["Right side", "Look around"],
      ["JUMP", "Jump"],
      ["HIT", "Punch"],
      ["FIRE", "Shoot where you look"],
      ["ENTER", "Get in a vehicle or go into a place"],
    ],
  },
  {
    heading: "Driving",
    items: [
      ["Left stick", "Steer"],
      ["GAS · BRAKE", "On the right; hold BRAKE to reverse"],
      ["SIREN", "In the ambulance"],
    ],
  },
  {
    heading: "Anywhere",
    items: [
      ["JOBS", "Open the job board"],
      ["Minimap", "Tap it for the city map"],
      ["Pause", "Time, weather, new game and this menu"],
    ],
  },
];

/** Radians per second the title camera circles at (about three minutes a turn). */
const ORBIT_SPEED = 0.034;
/** Frames drawn per second at most behind the menu: the scene is still, so this saves battery. */
const MAX_FPS = 30;

/**
 * Where the title camera is `t` seconds after the menu opened: circling `centre` from behind the
 * player's heading, high enough to look over the street, slowly breathing in and out.
 */
export function attractPose(t: number, centre: Vec3 & { readonly yaw: number }): { eye: Vec3; target: Vec3 } {
  const angle = centre.yaw + 0.5 + t * ORBIT_SPEED;
  const radius = 30 + 4 * Math.sin(t * 0.045);
  const height = 13 + 2.5 * Math.sin(t * 0.06 + 1);
  return {
    eye: { x: centre.x + Math.sin(angle) * radius, y: centre.y + height, z: centre.z + Math.cos(angle) * radius },
    target: { x: centre.x, y: centre.y + 2.2, z: centre.z },
  };
}

const reducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export class TitleDesk {
  readonly screen: TitleScreen;
  private frameId = 0;
  private elapsed = 0;
  private lastTime = 0;
  private centre: Vec3 & { readonly yaw: number } = { x: 0, y: 0, z: 0, yaw: 0 };
  /**
   * Resizing (a phone turned round) clears the canvas. The moving camera redraws on its own; the
   * still picture used with reduced motion is redrawn here, a frame later (after the renderer has
   * taken the new size).
   */
  private readonly onResize = (): void => {
    if (this.isOpen && !this.frameId) requestAnimationFrame(() => this.isOpen && this.drawNow());
  };

  constructor(
    parent: HTMLElement,
    private readonly hooks: TitleHooks,
  ) {
    this.screen = new TitleScreen(parent, {
      play: () => hooks.play(),
      newGame: () => hooks.newGame(),
      nextTime: () => hooks.nextTime(),
      toggleWeather: () => hooks.toggleWeather(),
      toggleSound: () => hooks.toggleSound(),
      ...(hooks.quit ? { quit: hooks.quit } : {}),
    });
  }

  get isOpen(): boolean {
    return this.screen.isOpen;
  }

  /** Show the menu and start the camera. */
  open(): void {
    this.centre = this.hooks.centre();
    this.elapsed = 0;
    this.screen.open(this.hooks.model());
    this.drawNow();
    this.startLoop();
    window.addEventListener("resize", this.onResize);
  }

  /** A setting changed: new labels, and redraw at once when the camera is not moving. */
  refresh(): void {
    this.screen.update(this.hooks.model());
    if (reducedMotion()) this.drawNow();
  }

  /** Leave the menu: fade out, hide it, run `start` (the game), fade in. */
  close(start: () => void | Promise<void>): Promise<void> {
    return this.screen.transition(async () => {
      this.stopLoop();
      window.removeEventListener("resize", this.onResize);
      this.screen.hide();
      await start();
    });
  }

  /** Come back to the menu from the game: fade out, `stop` the game, show the menu, fade in. */
  show(stop: () => void): Promise<void> {
    return this.screen.transition(() => {
      stop();
      this.open();
    });
  }

  /** Android Back: close a sub-page; false when the main page is showing. */
  back(): boolean {
    return this.screen.back();
  }

  private drawNow(): void {
    const pose = attractPose(this.elapsed, this.centre);
    this.hooks.draw(0, pose.eye, pose.target);
  }

  private startLoop(): void {
    this.stopLoop();
    // With reduced motion the city is a still picture, redrawn only when a setting changes.
    if (reducedMotion()) return;
    this.lastTime = performance.now();
    const tick = (now: number): void => {
      this.frameId = requestAnimationFrame(tick);
      const dt = (now - this.lastTime) / 1000;
      if (dt < 1 / MAX_FPS - 0.002) return;
      this.lastTime = now;
      // A long gap (the app was in the background) must not jump the camera.
      const step = Math.min(dt, 0.1);
      this.elapsed += step;
      const pose = attractPose(this.elapsed, this.centre);
      this.hooks.draw(step, pose.eye, pose.target);
    };
    this.frameId = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }
}
