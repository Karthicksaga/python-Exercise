/**
 * The loading screen. Its first frame is plain HTML and CSS in `apps/game/index.html`, so it
 * shows while the game's script is still being read; this class takes that markup over once the
 * script runs.
 *
 * Progress is honest: the game reports which named step it has reached (`step`), and the bar
 * fills one segment per finished step. There is no invented percentage. Until the first step
 * arrives the bar is indeterminate.
 */

import { fontLoaded } from "./TitleScreen";

export interface LoadStep {
  readonly id: string;
  /** What the player reads while the step runs: "Building the streets around you". */
  readonly label: string;
}

/** The parts of the world map the background sketch draws (structural, so `ui` needs no world types). */
export interface StreetSketch {
  readonly bounds: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };
  readonly roads: ReadonlyArray<{ readonly kind: string; readonly points: ReadonlyArray<{ readonly x: number; readonly z: number }> }>;
  readonly sea?: { readonly outline: ReadonlyArray<{ readonly x: number; readonly z: number }> };
}

export interface LoadingOptions {
  readonly steps: readonly LoadStep[];
  /** Gameplay tips shown one at a time while loading. */
  readonly tips: readonly string[];
  /** CSS family of a font that can draw the Tamil wordmark; it is shown once that font is ready. */
  readonly tamilFont?: string;
}

/** Seconds each tip stays on screen. */
const TIP_SECONDS = 6.5;
/** Width and alpha of each road class in the background sketch (CSS pixels at fit scale). */
const SKETCH: Record<string, { width: number; alpha: number }> = {
  primary: { width: 2.4, alpha: 0.62 },
  secondary: { width: 1.7, alpha: 0.46 },
  tertiary: { width: 1.2, alpha: 0.32 },
  residential: { width: 0.75, alpha: 0.2 },
  service: { width: 0.5, alpha: 0.11 },
};


export class LoadingScreen {
  private readonly bar: HTMLElement;
  private readonly segments: HTMLElement[] = [];
  private readonly stepText: HTMLElement;
  private readonly tipText: HTMLElement | null;
  private readonly tamil: HTMLElement | null;
  private readonly canvas: HTMLCanvasElement | null;
  private current = -1;
  private tipIndex = 0;
  private tipTimer = 0;
  private sketchData: StreetSketch | null = null;
  /** How long the street sketch last took to draw, ms (tests and the debug console). */
  sketchMs = 0;
  private resizeTimer = 0;
  private readonly onResize = (): void => {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => this.drawSketch(), 150);
  };
  private finished = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly options: LoadingOptions,
  ) {
    const find = <T extends HTMLElement>(selector: string): T | null => root.querySelector<T>(selector);
    this.bar = find(".ld-bar") ?? root;
    this.stepText = find(".ld-step") ?? root;
    this.tipText = find(".ld-tip-text");
    this.tamil = find(".ld-tamil");
    this.canvas = find<HTMLCanvasElement>(".ld-map");

    // Replace the indeterminate bar with one segment per step.
    this.bar.replaceChildren();
    this.bar.classList.add("ld-bar-steps");
    this.bar.setAttribute("aria-valuemin", "0");
    this.bar.setAttribute("aria-valuemax", String(options.steps.length));
    for (const step of options.steps) {
      const segment = document.createElement("i");
      segment.dataset.step = step.id;
      this.bar.append(segment);
      this.segments.push(segment);
    }
    this.showTip(Math.floor(Math.random() * Math.max(1, options.tips.length)));
    if (options.tips.length > 1) this.tipTimer = window.setInterval(() => this.showTip(this.tipIndex + 1), TIP_SECONDS * 1000);
    window.addEventListener("resize", this.onResize);
    root.dataset.state = "loading";
  }

  /** The game has started this step; every step before it is finished. */
  step(id: string): void {
    if (this.finished) return;
    const index = this.options.steps.findIndex((s) => s.id === id);
    if (index < 0 || index <= this.current) return;
    this.current = index;
    this.segments.forEach((segment, i) => {
      segment.classList.toggle("done", i < index);
      segment.classList.toggle("active", i === index);
    });
    const step = this.options.steps[index]!;
    this.stepText.textContent = step.label;
    this.bar.setAttribute("aria-valuenow", String(index));
    this.bar.setAttribute("aria-valuetext", `Step ${index + 1} of ${this.options.steps.length}: ${step.label}`);
    this.revealTamil();
  }

  /** Draw the real street network (the world file has been read) behind the screen. */
  sketch(map: StreetSketch): void {
    this.sketchData = map;
    this.drawSketch();
  }

  /** Every step is finished: fill the bar, then fade the screen out and remove it. */
  async finish(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    for (const segment of this.segments) {
      segment.classList.remove("active");
      segment.classList.add("done");
    }
    this.stepText.textContent = "Ready";
    this.bar.setAttribute("aria-valuenow", String(this.options.steps.length));
    this.bar.setAttribute("aria-valuetext", "Ready");
    this.stop();
    this.root.dataset.state = "done";
    // Removed at once, not faded: a fade makes the whole screen one more full-screen GPU layer
    // just as the game starts drawing, which a phone short of GPU memory could not afford.
    this.root.remove();
  }

  /** Loading failed: say what happened and offer to try again. Never leaves a black screen. */
  fail(message: string, retry: () => void): void {
    this.finished = true;
    this.stop();
    this.root.dataset.state = "error";
    this.segments.forEach((segment) => segment.classList.remove("active"));
    this.stepText.textContent = "The game could not start on this device.";
    const status = this.root.querySelector(".ld-status") ?? this.root;
    const detail = document.createElement("p");
    detail.className = "ld-error";
    detail.setAttribute("role", "alert");
    detail.textContent = message;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ld-retry";
    button.textContent = "Try again";
    button.addEventListener("click", retry);
    status.append(detail, button);
    button.focus({ preventScroll: true });
  }

  private stop(): void {
    window.clearInterval(this.tipTimer);
    window.clearTimeout(this.resizeTimer);
    window.removeEventListener("resize", this.onResize);
  }

  private showTip(index: number): void {
    const tips = this.options.tips;
    if (!this.tipText || tips.length === 0) return;
    this.tipIndex = ((index % tips.length) + tips.length) % tips.length;
    const text = tips[this.tipIndex]!;
    const node = this.tipText;
    // Swapped at once: a fade would make the tip a layer of its own every few seconds (see
    // index.html on why nothing animates here).
    node.textContent = text;
  }

  private revealTamil(): void {
    const family = this.options.tamilFont;
    if (!this.tamil || !family || !this.tamil.hidden) return;
    if (fontLoaded(family)) this.tamil.hidden = false;
  }

  private drawSketch(): void {
    const map = this.sketchData;
    const canvas = this.canvas;
    if (!map || !canvas) return;
    const started = performance.now();
    // Drawn by the CPU, not the GPU (`willReadFrequently` makes Chrome keep this canvas in
    // memory): it is every street in Chennai as five long paths with round joins, a lot of
    // tessellation for a phone GPU at the very moment loading needs it, and the street sketch was
    // the part of the screen that broke up on an entry-level Adreno (23 Nov 2026). Only the
    // finished picture goes to the GPU, once.
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (!g) return;
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    // A faint background: drawn at CSS pixels, not the screen's, to keep its texture small.
    const ratio = 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, width, height);

    // Cover the canvas with the map (crop rather than letterbox), centred.
    const { minX, maxX, minZ, maxZ } = map.bounds;
    const scale = Math.max(width / (maxX - minX), height / (maxZ - minZ));
    const ox = width / 2 - ((minX + maxX) / 2) * scale;
    const oz = height / 2 - ((minZ + maxZ) / 2) * scale;
    const fit = Math.min(1.6, Math.max(0.7, scale * 6));

    const sea = map.sea?.outline;
    if (sea && sea.length > 2) {
      g.beginPath();
      sea.forEach((p, i) => (i === 0 ? g.moveTo(ox + p.x * scale, oz + p.z * scale) : g.lineTo(ox + p.x * scale, oz + p.z * scale)));
      g.closePath();
      g.fillStyle = "rgba(40, 92, 140, 0.32)";
      g.fill();
    }

    g.lineCap = "round";
    g.lineJoin = "round";
    // Minor roads first, so the arterials draw on top.
    for (const kind of ["service", "residential", "tertiary", "secondary", "primary"]) {
      const style = SKETCH[kind]!;
      g.beginPath();
      for (const road of map.roads) {
        if (road.kind !== kind || road.points.length < 2) continue;
        road.points.forEach((p, i) => (i === 0 ? g.moveTo(ox + p.x * scale, oz + p.z * scale) : g.lineTo(ox + p.x * scale, oz + p.z * scale)));
      }
      g.strokeStyle = `rgba(255, 183, 3, ${style.alpha})`;
      g.lineWidth = style.width * fit;
      g.stroke();
    }
    canvas.classList.add("drawn");
    this.sketchMs = Math.round(performance.now() - started);
  }
}
