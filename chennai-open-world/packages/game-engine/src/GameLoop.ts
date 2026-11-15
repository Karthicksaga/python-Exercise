/**
 * Fixed-timestep game loop.
 *
 * Physics and gameplay advance in constant 1/60 s steps so behaviour is identical on a 60 Hz
 * and a 120 Hz phone; rendering happens once per display frame.
 */
export interface LoopCallbacks {
  /** Gameplay and physics; `dt` is always `FIXED_STEP`. */
  fixedUpdate(dt: number): void;
  /** Camera, animation and drawing; `dt` is the real time since the last frame. */
  frame(dt: number): void;
}

export const FIXED_STEP = 1 / 60;
/** After a long stall (app in background) don't try to catch up more than this many steps. */
const MAX_STEPS_PER_FRAME = 5;

export class GameLoop {
  /** Smoothed frames per second. */
  fps = 60;
  private running = false;
  private last = 0;
  private accumulator = 0;
  private handle = 0;

  constructor(private readonly callbacks: LoopCallbacks) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.accumulator = 0;
    this.handle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    this.handle = requestAnimationFrame(this.tick);
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
      this.callbacks.fixedUpdate(FIXED_STEP);
      this.accumulator -= FIXED_STEP;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
    this.callbacks.frame(dt);
  };
}
