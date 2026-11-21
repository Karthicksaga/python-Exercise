/**
 * Landmark names floating in the world: one small DOM label per landmark, moved to where the
 * renderer projects it. Shown while the landmark is on screen and within 450 m, fading out
 * from 300 m. Only `transform`, `opacity` and (rarely) text change, so updates stay cheap.
 */

/** Where a landmark's name goes this frame (the renderer works it out). */
export interface LandmarkLabelPlacement {
  readonly id: string;
  /** Normalised device coordinates, -1..1, +y up. */
  readonly x: number;
  readonly y: number;
  /** Metres from the player. */
  readonly distance: number;
  readonly inView: boolean;
}

export interface LabelledLandmark {
  readonly id: string;
  readonly name: string;
}

/** Farthest a label is shown, and where it starts to fade. */
export const LABEL_RANGE = 450;
const FADE_FROM = 300;

const STYLE = `
.cow-landmarks{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.cow-landmark{position:absolute;left:0;top:0;will-change:transform,opacity;white-space:nowrap;text-align:center;
  font:700 12px system-ui,sans-serif;color:#fff;letter-spacing:.3px;text-shadow:0 1px 3px rgba(0,0,0,.85)}
.cow-landmark span{display:inline-block;background:rgba(15,18,30,.5);border:1px solid rgba(255,255,255,.35);padding:2px 8px;border-radius:8px}
.cow-landmark small{display:block;font:600 10px ui-monospace,monospace;opacity:.85;margin-top:1px}
.cow-landmark i{display:block;width:1px;height:10px;margin:1px auto 0;background:rgba(255,255,255,.7)}
`;

export class LandmarkLabels {
  private readonly root: HTMLDivElement;
  private readonly labels = new Map<string, { root: HTMLDivElement; distance: HTMLElement; shownMetres: number; opacity: number }>();
  private width = 0;
  private height = 0;

  constructor(parent: HTMLElement, landmarks: readonly LabelledLandmark[]) {
    if (!document.getElementById("cow-landmarks-style")) {
      const style = document.createElement("style");
      style.id = "cow-landmarks-style";
      style.textContent = STYLE;
      document.head.append(style);
    }
    this.root = document.createElement("div");
    this.root.className = "cow-landmarks";
    // First child, so the HUD panels draw over the labels.
    parent.prepend(this.root);
    for (const landmark of landmarks) {
      const root = document.createElement("div");
      root.className = "cow-landmark";
      root.dataset.testid = `landmark-label-${landmark.id}`;
      root.hidden = true;
      const name = document.createElement("span");
      name.textContent = landmark.name;
      const distance = document.createElement("small");
      root.append(name, distance, document.createElement("i"));
      this.root.append(root);
      this.labels.set(landmark.id, { root, distance, shownMetres: -1, opacity: 0 });
    }
    const measure = () => {
      this.width = this.root.clientWidth;
      this.height = this.root.clientHeight;
    };
    measure();
    window.addEventListener("resize", measure);
  }

  update(placements: readonly LandmarkLabelPlacement[]): void {
    if (this.width === 0) {
      this.width = this.root.clientWidth;
      this.height = this.root.clientHeight;
    }
    for (const placement of placements) {
      const label = this.labels.get(placement.id);
      if (!label) continue;
      const opacity = placement.inView ? Math.max(0, Math.min(1, (LABEL_RANGE - placement.distance) / (LABEL_RANGE - FADE_FROM))) : 0;
      const shown = opacity > 0.02;
      if (label.root.hidden === shown) label.root.hidden = !shown;
      if (!shown) {
        label.opacity = 0;
        continue;
      }
      if (Math.abs(opacity - label.opacity) > 0.02) {
        label.opacity = opacity;
        label.root.style.opacity = opacity.toFixed(2);
      }
      const px = ((placement.x + 1) / 2) * this.width;
      const py = ((1 - placement.y) / 2) * this.height;
      // The bottom of the pin line sits on the landmark.
      label.root.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) translate(-50%,-100%)`;
      const metres = placement.distance < 1000 ? Math.round(placement.distance / 10) * 10 : Math.round(placement.distance / 100) * 100;
      if (metres !== label.shownMetres) {
        label.shownMetres = metres;
        label.distance.textContent = metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`;
      }
    }
  }

  /** True while the landmark's label is on screen (for tests). */
  isShown(id: string): boolean {
    const label = this.labels.get(id);
    return label !== undefined && !label.root.hidden;
  }
}
