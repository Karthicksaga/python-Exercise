/**
 * Keyboard fallback for development on a desktop: WASD or arrows, Shift to run, Space to jump,
 * E to get in or out of a vehicle, F to fire, Q to punch. When driving, W accelerates, S brakes
 * (and reverses once stopped; W in reverse brakes, then drives forwards), P, R and G select park,
 * reverse and drive (D steers), and H sounds the horn (or switches the siren). J opens the job board.
 */
const GEAR_KEYS: Readonly<Record<string, "P" | "R" | "D">> = { KeyP: "P", KeyR: "R", KeyG: "D" };

export class KeyboardInput {
  private gearPressed: "P" | "R" | "D" | null = null;
  private readonly down = new Set<string>();
  private jumpPressed = false;
  private actionPressed = false;
  private punchPressed = false;
  private hornPressed = false;
  private boardPressed = false;

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !e.repeat) this.jumpPressed = true;
      if (e.code === "KeyE" && !e.repeat) this.actionPressed = true;
      if (e.code === "KeyQ" && !e.repeat) this.punchPressed = true;
      if (e.code === "KeyH" && !e.repeat) this.hornPressed = true;
      if (e.code === "KeyJ" && !e.repeat) this.boardPressed = true;
      const gear = GEAR_KEYS[e.code];
      if (gear && !e.repeat) this.gearPressed = gear;
      this.down.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.down.delete(e.code));
    window.addEventListener("blur", () => this.down.clear());
  }

  private axis(negative: string[], positive: string[]): number {
    const has = (codes: string[]) => codes.some((c) => this.down.has(c));
    return (has(positive) ? 1 : 0) - (has(negative) ? 1 : 0);
  }

  get moveX(): number {
    return this.axis(["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]);
  }

  get moveY(): number {
    return this.axis(["KeyS", "ArrowDown"], ["KeyW", "ArrowUp"]);
  }

  get run(): boolean {
    return this.down.has("ShiftLeft") || this.down.has("ShiftRight");
  }

  get fire(): boolean {
    return this.down.has("KeyF");
  }

  consumePunch(): boolean {
    const pressed = this.punchPressed;
    this.punchPressed = false;
    return pressed;
  }

  consumeHorn(): boolean {
    const pressed = this.hornPressed;
    this.hornPressed = false;
    return pressed;
  }

  /** Gear asked for with P, R or G since the last call, or null. */
  consumeGear(): "P" | "R" | "D" | null {
    const gear = this.gearPressed;
    this.gearPressed = null;
    return gear;
  }

  consumeBoard(): boolean {
    const pressed = this.boardPressed;
    this.boardPressed = false;
    return pressed;
  }

  consumeAction(): boolean {
    const pressed = this.actionPressed;
    this.actionPressed = false;
    return pressed;
  }

  consumeJump(): boolean {
    const pressed = this.jumpPressed;
    this.jumpPressed = false;
    return pressed;
  }
}
