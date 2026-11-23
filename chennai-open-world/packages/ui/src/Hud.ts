/**
 * Heads-up display: place, money and stage, the current objective with its countdown and
 * distance, a speedometer while driving, short messages, and the pause screen.
 */

const STYLE = `
.cow-hud{position:absolute;inset:0;pointer-events:none;font-family:system-ui,sans-serif;color:#fff}
.cow-hud-top{position:absolute;top:calc(10px + env(safe-area-inset-top));left:calc(14px + env(safe-area-inset-left));right:calc(14px + env(safe-area-inset-right));
  display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.cow-left{display:flex;flex-direction:column;gap:6px;max-width:46%}
.cow-box{background:rgba(15,18,30,.6);padding:6px 12px;border-radius:10px;font-size:12px;line-height:1.35}
.cow-box b{font-size:14px}
.cow-stats{display:flex;gap:10px;align-items:baseline}
.cow-money{color:#ffd166;font-weight:700;font-size:14px}
.cow-mission b{display:block;color:#ffd166;font-size:12px;letter-spacing:.4px;text-transform:uppercase}
.cow-objective{font-size:14px;font-weight:600}
.cow-meta{opacity:.85;font:600 12px ui-monospace,monospace}
.cow-meta.urgent{color:#ff6b6b}
.cow-right{display:flex;gap:8px;align-items:flex-start}
.cow-fps{background:rgba(15,18,30,.55);padding:6px 10px;border-radius:10px;font:600 11px ui-monospace,monospace}
.cow-jobs{pointer-events:auto;height:44px;padding:0 14px;border-radius:12px;border:0;background:#ffb703;color:#1a1a1a;font:800 13px system-ui,sans-serif;letter-spacing:.5px;touch-action:manipulation}
.cow-rep{opacity:.9}
.cow-gear{display:inline-block;margin-left:10px;padding-left:10px;border-left:1px solid rgba(255,255,255,.3);color:#ffd166}
.cow-list{display:flex;flex-direction:column;gap:8px;width:min(560px,100%);max-height:58vh;overflow-y:auto;text-align:left}
.cow-row{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.08);border-radius:12px;padding:10px 12px}
.cow-row div{flex:1;min-width:0}
.cow-row b{display:block;font-size:14px}
.cow-row span{display:block;font-size:12px;opacity:.8}
.cow-row em{font-style:normal;color:#ffd166;font:700 12px ui-monospace,monospace}
.cow-overlay .cow-row button{min-width:92px;min-height:44px}
.cow-overlay .cow-row button:disabled{background:rgba(255,255,255,.12);color:rgba(255,255,255,.6)}
.cow-pause{pointer-events:auto;width:44px;height:44px;border-radius:12px;border:0;background:rgba(15,18,30,.6);color:#fff;font-size:16px;touch-action:manipulation}
.cow-speed{position:absolute;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));transform:translateX(-50%);background:rgba(15,18,30,.6);
  padding:6px 16px;border-radius:14px;text-align:center;font:700 26px ui-monospace,monospace}
.cow-speed small{display:block;font:600 10px system-ui,sans-serif;opacity:.75;letter-spacing:1px}
.cow-toast{position:absolute;left:50%;top:26%;transform:translateX(-50%);background:rgba(15,18,30,.82);border:1px solid rgba(255,209,102,.7);
  padding:10px 20px;border-radius:12px;text-align:center;font-size:15px;font-weight:700;max-width:70%;transition:opacity .3s}
.cow-toast small{display:block;font-weight:500;font-size:12px;opacity:.85;margin-top:2px}
.cow-overlay{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:12px;
  background:radial-gradient(120% 100% at 50% 40%,rgba(7,9,15,.78) 0%,rgba(7,9,15,.92) 100%);pointer-events:auto;text-align:center;
  padding:max(18px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));
  box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
/* Centred when it fits, scrollable from the top when it does not: centring with justify-content
   would cut off the first and last buttons on a short screen (the pause menu on a landscape phone). */
.cow-overlay>:first-child{margin-top:auto}
.cow-overlay>:last-child{margin-bottom:auto}
.cow-overlay h2{margin:0;font-size:13px;font-weight:800;letter-spacing:.34em;text-transform:uppercase;color:#ffb703}
.cow-overlay p{margin:0;opacity:.82;font-size:13px;line-height:1.45;max-width:520px}
.cow-overlay button{min-width:190px;min-height:46px;border-radius:6px;border:0;background:#ffb703;color:#14110a;
  font:800 14px system-ui,sans-serif;letter-spacing:.06em;cursor:pointer;touch-action:manipulation;transition:background-color .15s ease,transform .1s ease}
.cow-overlay button:active{transform:scale(.97)}
.cow-overlay button:focus-visible{outline:2px solid #fff;outline-offset:2px}
.cow-overlay button.quiet{background:rgba(255,255,255,.1);color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}
.cow-overlay button.quiet:hover{background:rgba(255,255,255,.16)}
.cow-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;width:min(620px,100%);flex-shrink:0}
.cow-actions button{flex:1 1 190px;max-width:300px}
.cow-actions button:not(.quiet){flex-basis:100%;max-width:400px}
@media (max-height:480px) and (min-aspect-ratio:1/1){
  .cow-overlay{gap:8px}
  .cow-overlay p{font-size:12px;max-width:640px}
  .cow-overlay button{min-height:42px}
  .cow-actions{gap:8px}
}
.cow-health{width:150px;height:9px;border-radius:5px;background:rgba(0,0,0,.45);overflow:hidden;margin-top:5px}
.cow-health i{display:block;height:100%;background:#4ccb6b;transition:width .15s}
.cow-health.low i{background:#ff5d5d}
.cow-street{opacity:.85;font-size:11px}
.cow-flash{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(255,0,0,0) 45%,rgba(255,30,30,.55) 100%);opacity:0;transition:opacity .35s}
.cow-hud [hidden]{display:none}
`;

export interface MissionView {
  /** "Stage 2 · Auto shift" */
  readonly title: string;
  readonly objective: string;
  /** Metres to the marker, when there is one. */
  readonly distance: number | null;
  readonly secondsLeft: number | null;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}

export class Hud {
  readonly root: HTMLDivElement;
  private readonly fps: HTMLSpanElement;
  private readonly money: HTMLSpanElement;
  private readonly stage: HTMLSpanElement;
  private readonly street: HTMLDivElement;
  private readonly healthBox: HTMLDivElement;
  private readonly healthFill: HTMLElement;
  private readonly flash: HTMLDivElement;
  private shownHealth = -1;
  private readonly missionBox: HTMLDivElement;
  private readonly missionTitle: HTMLElement;
  private readonly objective: HTMLDivElement;
  private readonly meta: HTMLDivElement;
  private readonly speed: HTMLDivElement;
  private readonly speedValue: Text;
  private readonly gear: HTMLSpanElement;
  private readonly reputation: HTMLSpanElement;
  private readonly toast: HTMLDivElement;
  private overlay: HTMLDivElement | null = null;
  /** The overlay's buttons, in a wrapping row (several per line on a wide, short screen). */
  private overlayActions: HTMLDivElement | null = null;
  private toastTimer = 0;

  constructor(parent: HTMLElement, place: { title: string; subtitle: string }, onPause: () => void, onJobs?: () => void) {
    if (!document.getElementById("cow-hud-style")) {
      const style = document.createElement("style");
      style.id = "cow-hud-style";
      style.textContent = STYLE;
      document.head.append(style);
    }
    this.root = element("div", "cow-hud", parent);
    const top = element("div", "cow-hud-top", this.root);
    const left = element("div", "cow-left", top);

    const placeBox = element("div", "cow-box", left);
    const title = element("b", "", placeBox);
    title.textContent = `${place.title} · ${place.subtitle}`;
    const stats = element("div", "cow-stats", placeBox);
    this.money = element("span", "cow-money", stats);
    this.money.dataset.testid = "money";
    this.stage = element("span", "", stats);
    this.reputation = element("span", "cow-rep", stats);
    this.reputation.dataset.testid = "reputation";
    this.street = element("div", "cow-street", placeBox);
    const health = (this.healthBox = element("div", "cow-health", placeBox));
    health.dataset.testid = "health";
    health.setAttribute("role", "meter");
    health.setAttribute("aria-label", "Health");
    this.healthFill = element("i", "", health);
    this.flash = element("div", "cow-flash", this.root);

    this.missionBox = element("div", "cow-box cow-mission", left);
    this.missionBox.dataset.testid = "mission";
    this.missionTitle = element("b", "", this.missionBox);
    this.objective = element("div", "cow-objective", this.missionBox);
    this.meta = element("div", "cow-meta", this.missionBox);

    const right = element("div", "cow-right", top);
    this.fps = element("span", "cow-fps", right);
    this.fps.dataset.testid = "fps";
    this.fps.textContent = "-- fps";
    if (onJobs) {
      const jobs = element("button", "cow-jobs", right);
      jobs.type = "button";
      jobs.textContent = "JOBS";
      jobs.dataset.testid = "jobs";
      jobs.setAttribute("aria-label", "Job board");
      jobs.addEventListener("click", onJobs);
    }
    const pause = element("button", "cow-pause", right);
    pause.type = "button";
    pause.textContent = "❚❚";
    pause.setAttribute("aria-label", "Pause");
    pause.addEventListener("click", onPause);

    this.speed = element("div", "cow-speed", this.root);
    this.speed.dataset.testid = "speed";
    this.speedValue = document.createTextNode("0");
    this.speed.append(this.speedValue);
    this.gear = element("span", "cow-gear", this.speed);
    this.gear.dataset.testid = "gear";
    element("small", "", this.speed).textContent = "KM/H · GEAR";
    this.speed.hidden = true;

    this.toast = element("div", "cow-toast", this.root);
    this.toast.setAttribute("role", "status");
    this.toast.hidden = true;
  }

  setFps(fps: number): void {
    const text = `${Math.round(fps)} fps`;
    if (this.fps.textContent !== text) this.fps.textContent = text;
  }

  setMoney(rupees: number, stagesDone: number, stageCount: number): void {
    const money = `₹${rupees.toLocaleString("en-IN")}`;
    if (this.money.textContent !== money) this.money.textContent = money;
    const stage = `Stages ${stagesDone}/${stageCount}`;
    if (this.stage.textContent !== stage) this.stage.textContent = stage;
  }

  /** Name of the street the player is on (real names from the map), or empty. */
  setStreet(name: string): void {
    if (this.street.textContent !== name) this.street.textContent = name;
  }

  /** @param fraction 0 (knocked out) to 1 (full health) */
  setHealth(fraction: number): void {
    const percent = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
    if (percent === this.shownHealth) return;
    this.shownHealth = percent;
    this.healthFill.style.width = `${percent}%`;
    this.healthBox.classList.toggle("low", percent < 35);
    this.healthBox.setAttribute("aria-valuenow", String(percent));
  }

  /** Red flash round the edges of the screen when the player is hurt. */
  flashHurt(): void {
    this.flash.style.transition = "none";
    this.flash.style.opacity = "1";
    // Let the browser apply the instant change before fading out.
    requestAnimationFrame(() => {
      this.flash.style.transition = "";
      this.flash.style.opacity = "0";
    });
  }

  /** Show the current mission, or hide the panel with null. */
  setMission(view: MissionView | null): void {
    this.missionBox.hidden = view === null;
    if (!view) return;
    if (this.missionTitle.textContent !== view.title) this.missionTitle.textContent = view.title;
    if (this.objective.textContent !== view.objective) this.objective.textContent = view.objective;
    const parts: string[] = [];
    if (view.distance !== null) parts.push(view.distance >= 1000 ? `${(view.distance / 1000).toFixed(1)} km` : `${Math.round(view.distance)} m`);
    if (view.secondsLeft !== null) {
      const s = Math.max(0, Math.ceil(view.secondsLeft));
      parts.push(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
    }
    const meta = parts.join("  ·  ");
    if (this.meta.textContent !== meta) this.meta.textContent = meta;
    this.meta.classList.toggle("urgent", view.secondsLeft !== null && view.secondsLeft < 10);
  }

  /** Show the speedometer with this speed and gear, or hide it with null. */
  setSpeed(kmh: number | null, gear = ""): void {
    this.speed.hidden = kmh === null;
    if (kmh === null) return;
    const text = String(Math.round(kmh));
    if (this.speedValue.data !== text) this.speedValue.data = text;
    if (this.gear.textContent !== gear) this.gear.textContent = gear;
  }

  /** Reputation from city jobs, 0 to 100. */
  setReputation(points: number): void {
    const text = `★ ${Math.round(points)}`;
    if (this.reputation.textContent !== text) this.reputation.textContent = text;
  }

  /** A list of choices in the overlay that is showing (the job board). */
  addOverlayList(rows: ReadonlyArray<{ title: string; detail: string; meta: string; button: string; disabled?: string; run: () => void; testId?: string }>): void {
    if (!this.overlay) return;
    const list = element("div", "cow-list", this.overlay);
    for (const row of rows) {
      const item = element("div", "cow-row", list);
      const text = element("div", "", item);
      element("b", "", text).textContent = row.title;
      element("span", "", text).textContent = row.disabled ?? row.detail;
      element("em", "", text).textContent = row.meta;
      const button = element("button", "", item);
      button.type = "button";
      button.textContent = row.button;
      if (row.testId) button.dataset.testid = row.testId;
      button.disabled = row.disabled !== undefined;
      button.addEventListener("click", row.run);
    }
  }

  /** True while a toast is on screen (so a less important one can wait its turn). */
  get toastShowing(): boolean {
    return !this.toast.hidden && this.toast.style.opacity !== "0";
  }

  /** A short message in the middle of the screen that fades by itself. */
  showToast(title: string, detail = "", seconds = 3.2): void {
    this.toast.textContent = title;
    if (detail) element("small", "", this.toast).textContent = detail;
    this.toast.hidden = false;
    this.toast.style.opacity = "1";
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.style.opacity = "0";
      this.toastTimer = window.setTimeout(() => (this.toast.hidden = true), 320);
    }, seconds * 1000);
  }

  /** Full-screen message with buttons (pause menu, fatal error). */
  showOverlay(title: string, message: string, action?: { label: string; run: () => void }): void {
    this.hideOverlay();
    const overlay = element("div", "cow-overlay", this.root);
    overlay.setAttribute("role", "dialog");
    element("h2", "", overlay).textContent = title;
    element("p", "", overlay).textContent = message;
    this.overlay = overlay;
    if (action) this.addOverlayAction(action);
  }

  /** Add another button to the overlay that is showing. */
  addOverlayAction(action: { label: string; run: () => void; quiet?: boolean }): void {
    if (!this.overlay) return;
    this.overlayActions ??= element("div", "cow-actions", this.overlay);
    const button = element("button", action.quiet ? "quiet" : "", this.overlayActions);
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", action.run);
  }

  hideOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
    this.overlayActions = null;
  }
}
