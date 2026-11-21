/**
 * The screen shown inside a place (home, hospital, gym, mall, cinema): a menu of things to do,
 * short tap-through scenes (a film with the audience's antics), and the gym's tap-timing
 * workout. DOM only, sized for a phone held sideways. Uses the HUD's overlay styles.
 */

export interface PlaceChoice {
  readonly title: string;
  readonly detail: string;
  readonly meta?: string;
  readonly button: string;
  /** Why it can't be done now; the button is disabled and this replaces the detail. */
  readonly disabled?: string;
  readonly testId?: string;
  readonly run: () => void;
}

export interface PlaceAction {
  readonly label: string;
  readonly run: () => void;
  readonly quiet?: boolean;
  readonly testId?: string;
}

/** One line of a scene, optionally with a choice that replaces the line with its answer. */
export type SceneLine = string | { readonly text: string; readonly extra: { readonly label: string; readonly testId?: string; readonly run: () => string } };

export interface WorkoutOptions {
  readonly reps: number;
  /** Needle position (0–1) a number of seconds into a rep. */
  readonly needle: (seconds: number) => number;
  /** The green zone, as a share of the bar. */
  readonly zone: readonly [number, number];
}

const STYLE = `
.cow-place{z-index:5}
.cow-place .cow-list{max-height:46vh;width:min(620px,100%)}
.cow-place p{max-width:560px}
.cow-place-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.cow-place-actions button{min-width:150px}
.cow-place-step{font:600 12px ui-monospace,monospace;opacity:.7}
.cow-workout{position:relative;width:min(440px,80%);height:28px;border-radius:14px;background:rgba(255,255,255,.14);overflow:hidden}
.cow-workout i{position:absolute;top:0;bottom:0;background:rgba(76,203,107,.75)}
.cow-workout b{position:absolute;top:-2px;bottom:-2px;width:6px;margin-left:-3px;background:#ffd166;border-radius:3px}
.cow-reps{font:700 18px ui-monospace,monospace;letter-spacing:4px}
.cow-place button.cow-tap{min-width:220px;min-height:64px;font-size:20px}
`;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}

export class PlaceScreen {
  private root: HTMLDivElement | null = null;
  private frame = 0;

  constructor(private readonly parent: HTMLElement) {
    if (!document.getElementById("cow-place-style")) {
      const style = document.createElement("style");
      style.id = "cow-place-style";
      style.textContent = STYLE;
      document.head.append(style);
    }
  }

  get isOpen(): boolean {
    return this.root !== null;
  }

  private open(title: string, text: string): HTMLDivElement {
    this.close();
    const root = element("div", "cow-overlay cow-place", this.parent);
    root.setAttribute("role", "dialog");
    root.dataset.testid = "place-screen";
    element("h2", "", root).textContent = title;
    const p = element("p", "", root);
    p.textContent = text;
    p.dataset.testid = "place-text";
    this.root = root;
    return root;
  }

  private button(parent: HTMLElement, label: string, run: () => void, className = "", testId?: string): HTMLButtonElement {
    const button = element("button", className, parent);
    button.type = "button";
    button.textContent = label;
    if (testId) button.dataset.testid = testId;
    button.addEventListener("click", run);
    return button;
  }

  /** The place's menu: a list of things to do and a row of buttons (Leave). */
  menu(title: string, text: string, choices: readonly PlaceChoice[], actions: readonly PlaceAction[]): void {
    const root = this.open(title, text);
    if (choices.length > 0) {
      const list = element("div", "cow-list", root);
      for (const choice of choices) {
        const row = element("div", "cow-row", list);
        const info = element("div", "", row);
        element("b", "", info).textContent = choice.title;
        element("span", "", info).textContent = choice.disabled ?? choice.detail;
        if (choice.meta) element("em", "", info).textContent = choice.meta;
        const button = this.button(row, choice.button, choice.run, "", choice.testId);
        button.disabled = choice.disabled !== undefined;
      }
    }
    const row = element("div", "cow-place-actions", root);
    for (const action of actions) this.button(row, action.label, action.run, action.quiet ? "quiet" : "", action.testId);
  }

  /** Tap through lines one by one; `done` runs after the last. */
  scene(title: string, lines: readonly SceneLine[], done: () => void): void {
    let index = 0;
    const show = () => {
      const line = lines[index];
      if (line === undefined) {
        done();
        return;
      }
      const text = typeof line === "string" ? line : line.text;
      const root = this.open(title, text);
      element("div", "cow-place-step", root).textContent = `${index + 1} / ${lines.length}`;
      const row = element("div", "cow-place-actions", root);
      if (typeof line !== "string") {
        const extra = this.button(row, line.extra.label, () => {
          const p = root.querySelector("p");
          if (p) p.textContent = line.extra.run();
          extra.remove();
        }, "quiet", line.extra.testId);
      }
      this.button(row, index === lines.length - 1 ? "Done" : "Next", () => {
        index++;
        show();
      }, "", "scene-next");
    };
    show();
  }

  /**
   * The workout: a needle sweeps a bar; tap while it is in the green zone. A tap is judged by
   * where the needle is drawn, so what the player sees is what counts. `done` gets the good reps.
   */
  workout(title: string, text: string, options: WorkoutOptions, done: (good: number) => void): void {
    const root = this.open(title, text);
    const bar = element("div", "cow-workout", root);
    bar.dataset.testid = "workout-bar";
    const zone = element("i", "", bar);
    zone.style.left = `${options.zone[0] * 100}%`;
    zone.style.width = `${(options.zone[1] - options.zone[0]) * 100}%`;
    const needle = element("b", "", bar);
    const reps = element("div", "cow-reps", root);
    reps.dataset.testid = "workout-reps";
    const marks: string[] = [];
    let good = 0;
    let shown = 0;
    let start = performance.now();
    const draw = () => {
      reps.textContent = [...marks, ...Array(options.reps - marks.length).fill("·")].join(" ");
    };
    const place = (value: number) => {
      shown = value;
      needle.style.left = `${value * 100}%`;
      bar.dataset.needle = value.toFixed(3);
    };
    const tick = () => {
      place(options.needle((performance.now() - start) / 1000));
      this.frame = requestAnimationFrame(tick);
    };
    const row = element("div", "cow-place-actions", root);
    this.button(row, "TAP", () => {
      const hit = shown >= options.zone[0] && shown <= options.zone[1];
      if (hit) good++;
      marks.push(hit ? "✓" : "✗");
      draw();
      if (marks.length >= options.reps) {
        cancelAnimationFrame(this.frame);
        done(good);
        return;
      }
      // Next rep: the needle starts again from the left.
      start = performance.now();
      place(0);
    }, "cow-tap", "workout-tap");
    draw();
    place(0);
    this.frame = requestAnimationFrame(tick);
  }

  close(): void {
    cancelAnimationFrame(this.frame);
    this.root?.remove();
    this.root = null;
  }
}
