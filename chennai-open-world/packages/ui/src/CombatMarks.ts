/**
 * What a fight shows over the people in it (22 Nov 2026 combat redesign): a small health bar
 * over an enemy who has been hurt (it fades a few seconds after the last hit), corner brackets
 * round the enemy the player is locked on to, and a hit marker that flashes where a hit lands
 * (bigger for a heavy one). Plain DOM moved by `transform`, like the landmark labels; the game
 * projects the positions.
 */

export interface CombatMark {
  readonly id: number;
  /** Normalised device coordinates (-1..1, +y up) of the head (bar) and chest (brackets, marker). */
  readonly head: { readonly x: number; readonly y: number };
  readonly chest: { readonly x: number; readonly y: number };
  readonly inView: boolean;
  /** Health left, 0..1. */
  readonly health: number;
  /** Seconds since last hit (Infinity when never). */
  readonly sinceHit: number;
  readonly heavyHit: boolean;
  readonly locked: boolean;
}

/** Seconds a health bar stays after the last hit, the last of them fading. */
const BAR_FOR = 3.5;
const BAR_FADE = 0.8;
/** Seconds a hit marker shows. */
const MARKER_FOR = 0.18;

const STYLE = `
.cow-marks{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.cow-mark-bar{position:absolute;left:0;top:0;width:46px;height:6px;margin:-14px 0 0 -23px;border-radius:3px;
  background:rgba(10,12,22,.7);box-shadow:0 0 0 1px rgba(255,255,255,.55);will-change:transform,opacity;overflow:hidden}
.cow-mark-bar i{display:block;height:100%;background:#ff5d5d;transform-origin:left;transition:transform .15s ease-out}
.cow-mark-bar.flash{box-shadow:0 0 0 2px #fff}
.cow-mark-lock{position:absolute;left:0;top:0;width:54px;height:76px;margin:-38px 0 0 -27px;will-change:transform}
.cow-mark-lock b{position:absolute;width:12px;height:12px;border:2.5px solid #ffb703;filter:drop-shadow(0 0 2px rgba(0,0,0,.8))}
.cow-mark-lock b:nth-child(1){left:0;top:0;border-right:0;border-bottom:0}
.cow-mark-lock b:nth-child(2){right:0;top:0;border-left:0;border-bottom:0}
.cow-mark-lock b:nth-child(3){left:0;bottom:0;border-right:0;border-top:0}
.cow-mark-lock b:nth-child(4){right:0;bottom:0;border-left:0;border-top:0}
.cow-mark-hit{position:absolute;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;will-change:transform,opacity}
.cow-mark-hit::before,.cow-mark-hit::after{content:"";position:absolute;left:50%;top:0;width:3px;height:100%;margin-left:-1.5px;background:#fff;
  border-radius:2px;box-shadow:0 0 3px rgba(0,0,0,.8)}
.cow-mark-hit::before{transform:rotate(45deg)}.cow-mark-hit::after{transform:rotate(-45deg)}
.cow-mark-hit.heavy::before,.cow-mark-hit.heavy::after{background:#ffb703}
.cow-marks [hidden]{display:none}
`;

interface Shown {
  readonly bar: HTMLDivElement;
  readonly fill: HTMLElement;
  readonly hit: HTMLDivElement;
  lastHealth: number;
}

export class CombatMarks {
  private readonly root: HTMLDivElement;
  private readonly lock: HTMLDivElement;
  private readonly shown = new Map<number, Shown>();
  private width = 0;
  private height = 0;

  constructor(parent: HTMLElement) {
    if (!document.getElementById("cow-marks-style")) {
      const style = document.createElement("style");
      style.id = "cow-marks-style";
      style.textContent = STYLE;
      document.head.append(style);
    }
    this.root = document.createElement("div");
    this.root.className = "cow-marks";
    this.root.dataset.testid = "combat-marks";
    parent.append(this.root);
    this.lock = document.createElement("div");
    this.lock.className = "cow-mark-lock";
    this.lock.dataset.testid = "lock-on";
    for (let i = 0; i < 4; i++) this.lock.append(document.createElement("b"));
    this.lock.hidden = true;
    this.root.append(this.lock);
  }

  /** Once per frame with every standing enemy near the player. */
  update(marks: readonly CombatMark[]): void {
    this.width = this.root.clientWidth || this.width;
    this.height = this.root.clientHeight || this.height;
    const toScreen = (p: { x: number; y: number }) => `translate(${((p.x + 1) / 2) * this.width}px,${((1 - p.y) / 2) * this.height}px)`;
    const seen = new Set<number>();
    let locked: CombatMark | null = null;
    for (const mark of marks) {
      if (mark.locked && mark.inView) locked = mark;
      seen.add(mark.id);
      let shown = this.shown.get(mark.id);
      if (!shown) {
        const bar = document.createElement("div");
        bar.className = "cow-mark-bar";
        bar.dataset.testid = "enemy-health";
        const fill = document.createElement("i");
        bar.append(fill);
        const hit = document.createElement("div");
        hit.className = "cow-mark-hit";
        hit.dataset.testid = "hit-marker";
        this.root.append(bar, hit);
        shown = { bar, fill, hit, lastHealth: mark.health };
        this.shown.set(mark.id, shown);
      }
      // The bar: once hurt, for a while after the last hit, or always while locked on.
      const recent = mark.sinceHit < BAR_FOR;
      const visible = mark.inView && mark.health < 1 && (recent || mark.locked);
      shown.bar.hidden = !visible;
      if (visible) {
        shown.bar.style.transform = toScreen(mark.head);
        shown.bar.style.opacity = mark.locked ? "1" : String(Math.min(1, (BAR_FOR - mark.sinceHit) / BAR_FADE));
        shown.fill.style.transform = `scaleX(${Math.max(0, mark.health)})`;
        shown.bar.classList.toggle("flash", mark.sinceHit < 0.12);
      }
      shown.lastHealth = mark.health;
      // The hit marker, for a moment after each hit.
      const marker = mark.inView && mark.sinceHit < MARKER_FOR;
      shown.hit.hidden = !marker;
      if (marker) {
        shown.hit.style.transform = `${toScreen(mark.chest)} scale(${mark.heavyHit ? 1.5 : 1})`;
        shown.hit.style.opacity = String(1 - mark.sinceHit / MARKER_FOR);
        shown.hit.classList.toggle("heavy", mark.heavyHit);
      }
    }
    for (const [id, shown] of this.shown) {
      if (seen.has(id)) continue;
      shown.bar.remove();
      shown.hit.remove();
      this.shown.delete(id);
    }
    this.lock.hidden = locked === null;
    if (locked) this.lock.style.transform = toScreen(locked.chest);
  }

  /** The enemy id the brackets are on, or null (tests). */
  get lockedOn(): boolean {
    return !this.lock.hidden;
  }
}
