/**
 * Railway panel at the bottom of the screen: on a platform, the station's name and when the
 * next trains come; on a train, where it goes, the next station and how far it is.
 */

const STYLE = `
.cow-ride{position:absolute;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));transform:translateX(-50%);background:rgba(16,32,64,.82);
  border:1px solid rgba(242,194,48,.8);border-radius:12px;padding:6px 14px;color:#fff;font:600 12px system-ui,sans-serif;text-align:center;pointer-events:none;max-width:60%}
.cow-ride b{display:block;font-size:14px;color:#f2c230;letter-spacing:.3px}
.cow-ride span{display:block;opacity:.9}
.cow-ride[hidden]{display:none}
`;

export interface RideView {
  /** "Train to Tambaram" or the station's name. */
  readonly title: string;
  /** "Next: Saidapet · 1.4 km" or "To Tambaram 1:20 · To Chennai Beach 4:05". */
  readonly detail: string;
}

export class RidePanel {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLElement;
  private readonly detail: HTMLElement;

  constructor(parent: HTMLElement) {
    if (!document.getElementById("cow-ride-style")) {
      const style = document.createElement("style");
      style.id = "cow-ride-style";
      style.textContent = STYLE;
      document.head.append(style);
    }
    this.root = document.createElement("div");
    this.root.className = "cow-ride";
    this.root.dataset.testid = "ride";
    this.root.setAttribute("role", "status");
    this.title = document.createElement("b");
    this.detail = document.createElement("span");
    this.root.append(this.title, this.detail);
    this.root.hidden = true;
    parent.append(this.root);
  }

  /** Show this, or hide the panel with null. */
  show(view: RideView | null): void {
    this.root.hidden = view === null;
    if (!view) return;
    if (this.title.textContent !== view.title) this.title.textContent = view.title;
    if (this.detail.textContent !== view.detail) this.detail.textContent = view.detail;
  }
}
