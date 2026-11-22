/**
 * The title menu, drawn over the live city (the game renders the street behind it with a slow
 * camera; see `apps/game/src/TitleDesk.ts`). Pure UI: it shows what the game passes in and calls
 * back when the player chooses something. It invents no options: every item maps to something the
 * game already does (play, new game, time of day, weather, controls help, credits, quit in the app).
 *
 * Layout rules that keep every button reachable on any screen:
 * - the menu column scrolls on its own when it is taller than the screen, and is never centred
 *   with overflow (which would cut off its first and last items);
 * - pages are stacked in one grid cell, so switching pages never moves anything else;
 * - entrance animations only animate from a start state; the end state is the normal, visible
 *   style, so a skipped or reduced-motion animation leaves the button visible.
 */

export interface TitleSave {
  /** "Stage 4 · Auto shift", or "Free roam" once every stage is done. */
  readonly headline: string;
  /** "₹1,250 · 3 of 21 stages". */
  readonly detail: string;
}

export interface TitleControlsGroup {
  readonly heading: string;
  readonly items: ReadonlyArray<readonly [control: string, does: string]>;
}

export interface TitleModel {
  /** Progress to carry on with, or null for a fresh game (the first item then says PLAY). */
  readonly save: TitleSave | null;
  /** What PLAY starts with: "Stage 1 · Morning walk". */
  readonly firstStage: string;
  /** Where the player is: area and street, shown on the location card. */
  readonly place: { readonly area: string; readonly street: string };
  /** "Evening · 17:45". */
  readonly time: string;
  /** "Clear" or "Rain". */
  readonly weather: string;
  readonly controls: readonly TitleControlsGroup[];
  /** Lines for the About page (credits, data source and date, what is estimated). */
  readonly about: readonly string[];
  /** Short credit in the footer: "Map data © OpenStreetMap contributors". */
  readonly credit: string;
}

export interface TitleActions {
  /** Continue the saved game (or start the first stage when there is none). */
  play(): void;
  /** Forget progress and start again (asked only after the player confirms). */
  newGame(): void;
  nextTime(): void;
  toggleWeather(): void;
  /** Close the app (only inside the Android app; absent in a browser). */
  quit?: () => void;
}

/** CSS family of the Tamil font loaded by the game (station boards); covers "சென்னை". */
const TAMIL_FONT = "CowStationTamil";

type PageId = "main" | "settings" | "controls" | "about" | "confirm";

const STYLE = `
.cow-title{--amber:#ffb703;--text:#f4f1ea;--muted:rgba(244,241,234,.64);--line:rgba(244,241,234,.14);
  position:absolute;inset:0;z-index:30;color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  display:grid;grid-template-columns:minmax(280px,440px) 1fr;grid-template-rows:auto minmax(0,1fr) auto;
  gap:10px 24px;box-sizing:border-box;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;
  padding:max(20px,env(safe-area-inset-top)) max(28px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(28px,env(safe-area-inset-left))}
.cow-title[hidden]{display:none}
.cow-title *,.cow-title *::before,.cow-title *::after{box-sizing:border-box}
.ct-shade{position:absolute;inset:0;pointer-events:none;z-index:-1;
  background:linear-gradient(90deg,rgba(7,9,15,.9) 0%,rgba(7,9,15,.72) 26%,rgba(7,9,15,.18) 55%,rgba(7,9,15,0) 72%),
  linear-gradient(0deg,rgba(7,9,15,.85) 0%,rgba(7,9,15,0) 30%),
  linear-gradient(180deg,rgba(7,9,15,.55) 0%,rgba(7,9,15,0) 22%)}
.ct-brand{grid-column:1;grid-row:1;align-self:start}
.ct-tamil{display:block;font:700 14px "${TAMIL_FONT}","Noto Sans Tamil",sans-serif;color:var(--amber);letter-spacing:.04em;margin-bottom:4px}
.ct-tamil[hidden]{display:none}
.ct-brand h1{margin:0;line-height:.9;font-weight:900;text-transform:uppercase;letter-spacing:-.01em}
.ct-brand h1 span{display:block}
.ct-w1{font-size:clamp(34px,5.6vw,80px);text-shadow:0 6px 28px rgba(0,0,0,.6)}
.ct-w2{font-size:clamp(12px,1.55vw,21px);font-weight:700;letter-spacing:.5em;color:var(--amber);margin-top:7px}
.ct-tag{margin:10px 0 0;font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:var(--muted)}
.ct-pages{grid-column:1;grid-row:2;display:grid;min-height:0;position:relative}
.ct-page{grid-area:1/1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;
  display:flex;flex-direction:column;padding:6px 6px 6px 0;margin-left:-2px;padding-left:2px;
  transition:opacity .28s ease,transform .32s cubic-bezier(.2,.7,.2,1),visibility 0s linear 0s}
.ct-page::-webkit-scrollbar{display:none}
/* Soft edges where a long page scrolls under the wordmark or the footer. */
.ct-page{-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 10px,#000 calc(100% - 10px),transparent 100%);
  mask-image:linear-gradient(180deg,transparent 0,#000 10px,#000 calc(100% - 10px),transparent 100%)}
/* Reading pages use the whole width, over a darker city. */
.cow-title[data-page="controls"] .ct-pages,.cow-title[data-page="about"] .ct-pages{grid-column:1/-1}
.cow-title[data-page="controls"] .ct-place,.cow-title[data-page="about"] .ct-place{opacity:0}
.ct-shade::after{content:"";position:absolute;inset:0;background:rgba(7,9,15,.62);opacity:0;transition:opacity .3s ease}
.cow-title[data-page="controls"] .ct-shade::after,.cow-title[data-page="about"] .ct-shade::after{opacity:1}
.ct-place{transition:opacity .25s ease}
/* Centred vertically when there is room, top-aligned (and scrollable) when there is not. */
.ct-page>:first-child{margin-top:auto}.ct-page>:last-child{margin-bottom:auto}
.ct-page:not(.current){opacity:0;visibility:hidden;pointer-events:none;transform:translateX(var(--from,-24px));
  transition:opacity .2s ease,transform .25s ease,visibility 0s linear .25s}
.ct-pages[data-dir="back"] .ct-page:not(.current){--from:24px}
.ct-page h2{margin:0 0 10px;font-size:12px;font-weight:800;letter-spacing:.32em;text-transform:uppercase;color:var(--amber)}
.ct-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;max-width:420px}
.ct-item{position:relative;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;width:100%;min-height:46px;
  padding:6px 16px 6px 20px;border:0;border-radius:0 6px 6px 0;background:transparent;color:var(--text);text-align:left;cursor:pointer;
  font:700 17px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:.14em;text-transform:uppercase;
  transition:background-color .2s ease,color .2s ease;touch-action:manipulation;outline:none}
.ct-item::before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:4px;border-radius:2px;background:var(--amber);
  transform:scaleY(0);transition:transform .22s cubic-bezier(.2,.7,.2,1)}
.ct-item .ct-label{display:block;transition:transform .22s cubic-bezier(.2,.7,.2,1)}
.ct-item .ct-detail{display:block;margin-top:2px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:none;color:var(--muted)}
.ct-item.is-selected{background:linear-gradient(90deg,rgba(255,183,3,.2),rgba(255,183,3,.04) 70%,rgba(255,183,3,0))}
.ct-item.is-selected::before{transform:scaleY(1)}
.ct-item.is-selected .ct-label{transform:translateX(6px)}
.ct-item.is-selected .ct-detail{color:rgba(244,241,234,.85)}
.ct-item:active{background:rgba(255,183,3,.3)}
.ct-item:focus-visible:not(.is-selected){box-shadow:inset 0 0 0 2px rgba(255,183,3,.75)}
.ct-item.primary .ct-label{color:var(--amber)}
.ct-item.danger .ct-label{color:#ff9b8a}
.ct-setting{flex-direction:row;align-items:center;justify-content:space-between;gap:16px}
.ct-setting .ct-value{font-size:13px;letter-spacing:.06em;text-transform:none;color:var(--amber);white-space:nowrap}
.ct-setting .ct-value::after{content:" ›";color:var(--muted)}
.ct-back{margin-top:8px}
.ct-back .ct-label::before{content:"‹ ";color:var(--muted)}
.ct-text{margin:0 0 12px;max-width:44ch;font-size:13px;line-height:1.5;color:rgba(244,241,234,.86)}
.ct-groups{display:flex;flex-wrap:wrap;gap:4px 34px;margin-bottom:8px}
.ct-gbox{flex:1 1 230px;max-width:340px}
.ct-dl{margin:0;display:grid;grid-template-columns:auto 1fr;align-content:start;gap:5px 14px;font-size:12.5px;line-height:1.35}
.ct-dl dt{font-weight:800;letter-spacing:.08em;color:var(--amber);white-space:nowrap}
.ct-dl dd{margin:0;color:rgba(244,241,234,.88)}
.ct-group{margin:0 0 5px;padding-top:6px;font-size:10px;font-weight:800;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}
.ct-place{grid-column:2;grid-row:3;justify-self:end;align-self:end;text-align:right;
  border-right:3px solid var(--amber);padding:2px 12px 2px 0;text-shadow:0 1px 8px rgba(0,0,0,.7)}
.ct-place b{display:block;font-size:15px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
.ct-place span{display:block;font-size:12px;color:rgba(244,241,234,.82);margin-top:2px}
.ct-foot{grid-column:1;grid-row:3;align-self:end;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:10.5px;color:var(--muted);letter-spacing:.04em}
.ct-keys{display:none}
.ct-keys kbd{font:700 10px ui-monospace,monospace;border:1px solid var(--line);border-radius:3px;padding:1px 5px;margin-right:4px;color:var(--text)}
@media (hover:hover) and (pointer:fine){.ct-keys{display:inline}}
.cow-title.enter .ct-brand{animation:ct-rise .8s cubic-bezier(.2,.7,.2,1) both}
.cow-title.enter .ct-page.current .ct-list>li,.cow-title.enter .ct-place,.cow-title.enter .ct-foot{animation:ct-in .55s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i,0) * 55ms + 220ms)}
.cow-title.enter .ct-place{--i:8}.cow-title.enter .ct-foot{--i:9}
@keyframes ct-rise{from{opacity:0;transform:translateY(12px)}}
@keyframes ct-in{from{opacity:0;transform:translateX(-14px)}}
.cow-curtain{position:fixed;inset:0;z-index:60;background:#07090f;opacity:0;pointer-events:none;transition:opacity .3s ease}
.cow-curtain.shut{opacity:1;pointer-events:auto}
/* Short landscape phones (the usual way the game is held). */
@media (max-height:480px) and (min-aspect-ratio:1/1){
  .cow-title{grid-template-columns:minmax(260px,380px) 1fr;gap:6px 20px;padding-top:max(14px,env(safe-area-inset-top));padding-bottom:max(10px,env(safe-area-inset-bottom))}
  .ct-w1{font-size:clamp(28px,4.8vw,44px)}.ct-w2{margin-top:5px;font-size:12px}.ct-tag{display:none}.ct-tamil{font-size:12px;margin-bottom:2px}
  .ct-item{min-height:42px;font-size:15px;padding-top:4px;padding-bottom:4px}
  .ct-item .ct-detail{font-size:10.5px;margin-top:1px}
  .ct-page h2{margin-bottom:6px}
  .ct-text{font-size:12px;margin-bottom:8px}.ct-dl{font-size:11.5px;gap:3px 12px}
  .ct-place b{font-size:13px}.ct-place span{font-size:11px}
}
/* Portrait and narrow screens: one column, menu at the bottom where thumbs are. */
@media (max-aspect-ratio:1/1){
  .cow-title{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr) auto auto}
  .ct-shade{background:linear-gradient(0deg,rgba(7,9,15,.95) 0%,rgba(7,9,15,.82) 45%,rgba(7,9,15,.1) 75%,rgba(7,9,15,.6) 100%)}
  .ct-pages{grid-row:2}.ct-page>:first-child{margin-top:auto}.ct-page>:last-child{margin-bottom:0}
  .ct-place{grid-column:1;grid-row:1;justify-self:end;align-self:start;display:none}
  .ct-foot{grid-row:4}
}
@media (prefers-reduced-motion:reduce){
  .cow-title *,.cow-title,.cow-curtain{animation:none!important;transition:none!important}
}
`;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  parent?.append(node);
  return node;
}

const reducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

let idCounter = 0;

/**
 * True when a font face of this family has been loaded into the page. (`document.fonts.check`
 * is not enough: it also answers true for a family that was never added.)
 */
export function fontLoaded(family: string): boolean {
  let found = false;
  try {
    document.fonts.forEach((face) => {
      if (face.family.replace(/["']/g, "") === family && face.status === "loaded") found = true;
    });
  } catch {
    // Very old WebViews without the font loading API: show the Latin wordmark only.
  }
  return found;
}

export class TitleScreen {
  readonly root: HTMLDivElement;
  private readonly curtain: HTMLDivElement;
  private readonly tamil: HTMLSpanElement;
  private readonly pagesBox: HTMLElement;
  private readonly pages = new Map<PageId, HTMLElement>();
  private readonly placeArea: HTMLElement;
  private readonly placeLine: HTMLElement;
  private readonly creditText: HTMLElement;
  private page: PageId = "main";
  /** The item that opened the current sub-page, focused again on the way back. */
  private opener: HTMLElement | null = null;
  /** A transition is running: choices are ignored until it ends (no double starts). */
  private busy = false;
  private readonly onKey = (event: KeyboardEvent): void => this.key(event);

  constructor(
    parent: HTMLElement,
    private readonly actions: TitleActions,
  ) {
    if (!document.getElementById("cow-title-style")) {
      const style = document.createElement("style");
      style.id = "cow-title-style";
      style.textContent = STYLE;
      document.head.append(style);
    }
    this.root = element("div", "cow-title", parent);
    this.root.hidden = true;
    this.root.dataset.testid = "title";
    element("div", "ct-shade", this.root);

    const brand = element("header", "ct-brand", this.root);
    this.tamil = element("span", "ct-tamil", brand);
    this.tamil.lang = "ta";
    this.tamil.textContent = "சென்னை";
    this.tamil.hidden = true;
    const h1 = element("h1", "", brand);
    element("span", "ct-w1", h1).textContent = "Chennai";
    element("span", "ct-w2", h1).textContent = "Open World";
    element("p", "ct-tag", brand).textContent = "Explore the city. Live the experience.";

    this.pagesBox = element("nav", "ct-pages", this.root);
    this.pagesBox.setAttribute("aria-label", "Main menu");
    for (const id of ["main", "settings", "controls", "about", "confirm"] as const) {
      const page = element("section", "ct-page", this.pagesBox);
      page.dataset.page = id;
      this.pages.set(id, page);
    }

    const place = element("aside", "ct-place", this.root);
    place.setAttribute("aria-label", "Where you are");
    this.placeArea = element("b", "", place);
    this.placeLine = element("span", "", place);

    const foot = element("footer", "ct-foot", this.root);
    const keys = element("span", "ct-keys", foot);
    keys.innerHTML = "<kbd>↑</kbd><kbd>↓</kbd>Select &nbsp;<kbd>Enter</kbd>Confirm &nbsp;<kbd>Esc</kbd>Back";
    this.creditText = element("span", "", foot);

    this.curtain = element("div", "cow-curtain", parent);
    this.curtain.setAttribute("aria-hidden", "true");

    // Selection follows the mouse on a desktop and focus everywhere (keyboard, screen readers).
    this.root.addEventListener("focusin", (event) => {
      if (event.target instanceof HTMLButtonElement) this.select(event.target);
    });
    this.root.addEventListener("pointerover", (event) => {
      if (event.pointerType !== "mouse") return;
      const button = (event.target as HTMLElement).closest?.("button");
      if (button instanceof HTMLButtonElement && this.root.contains(button) && !button.disabled) button.focus({ preventScroll: true });
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  get currentPage(): PageId {
    return this.page;
  }

  /** Show the menu (with its entrance) for this state of the game. */
  open(model: TitleModel): void {
    this.root.hidden = false;
    this.busy = false;
    this.buildAll(model);
    this.go("main", null, true);
    this.revealTamil();
    // Restart the entrance animation.
    this.root.classList.remove("enter");
    void this.root.offsetWidth;
    if (!reducedMotion()) this.root.classList.add("enter");
    window.addEventListener("keydown", this.onKey);
    const first = this.firstButton();
    if (first) this.select(first);
    // Keyboard and screen-reader users start on the first item; on touch screens focusing a
    // button has no visible side effect.
    first?.focus({ preventScroll: true });
  }

  /** Refresh labels (after a setting changed) without rebuilding the page the player is on. */
  update(model: TitleModel): void {
    this.fillPlace(model);
    const settings = this.pages.get("settings");
    const time = settings?.querySelector<HTMLElement>('[data-action="time"] .ct-value');
    const weather = settings?.querySelector<HTMLElement>('[data-action="weather"] .ct-value');
    if (time) time.textContent = model.time;
    if (weather) weather.textContent = model.weather;
    settings?.querySelector('[data-action="time"]')?.setAttribute("aria-label", `Time of day: ${model.time}`);
    settings?.querySelector('[data-action="weather"]')?.setAttribute("aria-label", `Weather: ${model.weather}`);
  }

  /**
   * Fade to black, run `swap` (start the game, or show this menu), then fade back in. Choices are
   * ignored meanwhile, so a double tap cannot start the game twice.
   */
  async transition(swap: () => void | Promise<void>): Promise<void> {
    this.busy = true;
    const motion = !reducedMotion();
    this.curtain.classList.add("shut");
    if (motion) await wait(320);
    try {
      await swap();
    } finally {
      this.curtain.classList.remove("shut");
      if (motion) await wait(60);
      this.busy = false;
    }
  }

  /** Hide the menu at once (inside `transition`). */
  hide(): void {
    this.root.hidden = true;
    this.root.classList.remove("enter");
    window.removeEventListener("keydown", this.onKey);
    if (this.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  }

  /** Android Back or Escape: leave a sub-page. False when already on the main page. */
  back(): boolean {
    if (!this.isOpen || this.page === "main") return false;
    this.go("main", this.opener, false, "back");
    return true;
  }

  dispose(): void {
    this.hide();
    this.root.remove();
    this.curtain.remove();
  }

  // ---- building -----------------------------------------------------------------------------

  private buildAll(model: TitleModel): void {
    this.buildMain(model);
    this.buildSettings(model);
    this.buildControls(model);
    this.buildAbout(model);
    this.buildConfirm();
    this.fillPlace(model);
    this.creditText.textContent = model.credit;
  }

  private fillPlace(model: TitleModel): void {
    this.placeArea.textContent = model.place.area;
    this.placeLine.textContent = [model.place.street, model.time, model.weather].filter(Boolean).join(" · ");
  }

  private list(page: HTMLElement): HTMLUListElement {
    const list = element("ul", "ct-list", page);
    list.setAttribute("role", "list");
    return list;
  }

  private item(list: HTMLElement, label: string, run: () => void, options: { detail?: string; className?: string; action?: string; value?: string } = {}): HTMLButtonElement {
    const li = element("li", "", list);
    li.style.setProperty("--i", String(list.children.length - 1));
    const button = element("button", `ct-item${options.className ? ` ${options.className}` : ""}${options.value !== undefined ? " ct-setting" : ""}`, li);
    button.type = "button";
    if (options.action) button.dataset.action = options.action;
    element("span", "ct-label", button).textContent = label;
    if (options.value !== undefined) {
      element("span", "ct-value", button).textContent = options.value;
      button.setAttribute("aria-label", `${label}: ${options.value}`);
    } else button.setAttribute("aria-label", label);
    if (options.detail) {
      const detail = element("span", "ct-detail", button);
      detail.id = `ct-d${++idCounter}`;
      detail.textContent = options.detail;
      button.setAttribute("aria-describedby", detail.id);
    }
    button.addEventListener("click", () => {
      if (!this.busy) run();
    });
    return button;
  }

  private buildMain(model: TitleModel): void {
    const page = this.pages.get("main")!;
    page.replaceChildren();
    const list = this.list(page);
    if (model.save) {
      this.item(list, "Continue", () => this.actions.play(), { detail: `${model.save.headline} · ${model.save.detail}`, className: "primary", action: "play" });
      this.item(list, "New game", () => this.go("confirm", this.button("newgame")), { detail: "Start again from Stage 1", action: "newgame" });
    } else {
      this.item(list, "Play", () => this.actions.play(), { detail: model.firstStage, className: "primary", action: "play" });
    }
    this.item(list, "Settings", () => this.go("settings", this.button("settings")), { detail: "Time of day and weather", action: "settings" });
    this.item(list, "Controls", () => this.go("controls", this.button("controls")), { detail: "Touch controls on foot and driving", action: "controls" });
    this.item(list, "About", () => this.go("about", this.button("about")), { detail: "Credits and map data", action: "about" });
    const quit = this.actions.quit;
    if (quit) this.item(list, "Quit", () => quit(), { detail: "Close the game", action: "quit" });
  }

  private buildSettings(model: TitleModel): void {
    const page = this.pages.get("settings")!;
    page.replaceChildren();
    element("h2", "", page).textContent = "Settings";
    const list = this.list(page);
    this.item(list, "Time of day", () => this.actions.nextTime(), { value: model.time, action: "time" });
    this.item(list, "Weather", () => this.actions.toggleWeather(), { value: model.weather, action: "weather" });
    this.item(list, "Back", () => this.back(), { className: "ct-back", action: "back" });
  }

  private buildControls(model: TitleModel): void {
    const page = this.pages.get("controls")!;
    page.replaceChildren();
    element("h2", "", page).textContent = "Controls";
    const groups = element("div", "ct-groups", page);
    for (const group of model.controls) {
      const box = element("div", "ct-gbox", groups);
      element("h3", "ct-group", box).textContent = group.heading;
      const dl = element("dl", "ct-dl", box);
      for (const [control, does] of group.items) {
        element("dt", "", dl).textContent = control;
        element("dd", "", dl).textContent = does;
      }
    }
    this.item(this.list(page), "Back", () => this.back(), { className: "ct-back", action: "back" });
  }

  private buildAbout(model: TitleModel): void {
    const page = this.pages.get("about")!;
    page.replaceChildren();
    element("h2", "", page).textContent = "About";
    for (const line of model.about) element("p", "ct-text", page).textContent = line;
    this.item(this.list(page), "Back", () => this.back(), { className: "ct-back", action: "back" });
  }

  private buildConfirm(): void {
    const page = this.pages.get("confirm")!;
    page.replaceChildren();
    element("h2", "", page).textContent = "New game";
    element("p", "ct-text", page).textContent = "Start again from Stage 1? Your money, finished stages, city jobs and explored areas will be forgotten.";
    const list = this.list(page);
    this.item(list, "Start new game", () => this.actions.newGame(), { className: "danger", action: "confirm-new" });
    this.item(list, "Cancel", () => this.back(), { className: "ct-back", action: "back" });
  }

  // ---- navigation ---------------------------------------------------------------------------

  private button(action: string): HTMLButtonElement | null {
    return this.pages.get("main")?.querySelector<HTMLButtonElement>(`[data-action="${action}"]`) ?? null;
  }

  private go(id: PageId, opener: HTMLElement | null, instant = false, dir: "in" | "back" = "in"): void {
    this.pagesBox.dataset.dir = dir;
    this.root.dataset.page = id;
    if (id !== "main") this.opener = opener;
    this.page = id;
    for (const [pageId, page] of this.pages) {
      const current = pageId === id;
      page.classList.toggle("current", current);
      page.inert = !current;
      if (current) page.removeAttribute("aria-hidden");
      else page.setAttribute("aria-hidden", "true");
      if (current) page.scrollTop = 0;
    }
    if (instant) return;
    const target = id === "main" && opener && this.pages.get("main")!.contains(opener) ? opener : this.firstButton();
    if (target instanceof HTMLButtonElement) {
      this.select(target);
      target.focus({ preventScroll: true });
    }
  }

  private buttons(): HTMLButtonElement[] {
    return [...(this.pages.get(this.page)?.querySelectorAll<HTMLButtonElement>("button.ct-item:not(:disabled)") ?? [])];
  }

  private firstButton(): HTMLButtonElement | null {
    return this.buttons()[0] ?? null;
  }

  private select(button: HTMLButtonElement): void {
    for (const other of this.root.querySelectorAll(".ct-item.is-selected")) if (other !== button) other.classList.remove("is-selected");
    button.classList.add("is-selected");
  }

  private key(event: KeyboardEvent): void {
    if (!this.isOpen || this.busy || event.defaultPrevented) return;
    const list = this.buttons();
    if (list.length === 0) return;
    const at = list.findIndex((b) => b === document.activeElement || b.classList.contains("is-selected"));
    let next = -1;
    switch (event.key) {
      case "ArrowDown":
        next = at < 0 ? 0 : (at + 1) % list.length;
        break;
      case "ArrowUp":
        next = at < 0 ? list.length - 1 : (at - 1 + list.length) % list.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = list.length - 1;
        break;
      case "Escape":
      case "Backspace":
        if (this.back()) event.preventDefault();
        return;
      case "Enter":
      case " ":
        // A focused button activates natively; this covers a selection made without focus.
        if (at >= 0 && document.activeElement !== list[at]) {
          event.preventDefault();
          list[at]!.click();
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    const target = list[next]!;
    this.select(target);
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest" });
  }

  private revealTamil(): void {
    this.tamil.hidden = !fontLoaded(TAMIL_FONT);
  }
}
