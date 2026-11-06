// Swipe between tabs (Nov 2026 phone test): on any screen with a tab bar (Activity / Trips:
// Ongoing · Upcoming · Past, Notifications: All · Unread, Earnings: Today · This week…), a sideways
// swipe on the page moves to the neighbouring tab, like flicking between pages.
// Swipe left → next tab, swipe right → previous tab. The tab's own click handler does the work, so
// every screen keeps its existing behaviour. Maps, sliders, inputs and sideways-scrolling rows keep
// their own gestures. Touch events are used because Android cancels pointer events once it starts
// scrolling; the mouse path is for desktop testing. Styles: animations.css, "Swipe between tabs".

const IGNORE = "input, textarea, select, .leaflet-container, .hop-map-canvas, .hop-slide, [data-no-tab-swipe]";

function tabBar(root: HTMLElement): HTMLElement[] {
  const bar = [...root.querySelectorAll<HTMLElement>(".screen-body .tabs")].find((el) => el.offsetParent !== null && !el.closest(".modal-sheet"));
  return bar ? [...bar.querySelectorAll<HTMLElement>(":scope > button")].filter((b) => !(b as HTMLButtonElement).disabled) : [];
}

function activeIndex(tabs: HTMLElement[]) {
  return tabs.findIndex(
    (t) => t.classList.contains("active") || t.getAttribute("aria-selected") === "true" || t.getAttribute("aria-pressed") === "true",
  );
}

/** True when the gesture starts inside something that scrolls sideways on its own. */
function scrollsSideways(el: Element | null, root: HTMLElement) {
  for (let node = el; node && node !== root; node = node.parentElement)
    if (node instanceof HTMLElement && node.scrollWidth > node.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(node).overflowX)) return true;
  return false;
}

export function enableTabSwipe(root: HTMLElement) {
  if (root.dataset.tabSwipe) return;
  root.dataset.tabSwipe = "1";
  let start: { x: number; y: number; t: number } | null = null;
  const begin = (x: number, y: number, target: EventTarget | null) => {
    const el = target as Element | null;
    if (!el?.closest?.(".screen-body") || el.closest(IGNORE) || scrollsSideways(el, root) || root.querySelector(".modal-sheet")) {
      start = null;
      return;
    }
    start = { x, y, t: Date.now() };
  };
  const finish = (x: number, y: number) => {
    if (!start) return;
    const dx = x - start.x, dy = y - start.y, quick = Date.now() - start.t < 700;
    start = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6 || !quick) return;
    const tabs = tabBar(root);
    const current = activeIndex(tabs);
    if (current < 0) return;
    const next = current + (dx < 0 ? 1 : -1);
    if (next < 0 || next >= tabs.length) return;
    tabs[next].click();
    navigator.vibrate?.(8);
    // The tab redraws its content; slide the new content in from the side it came from.
    requestAnimationFrame(() => {
      const panel = root.querySelector<HTMLElement>(".screen-body .screen-padding") || root.querySelector<HTMLElement>(".screen-body");
      if (!panel || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      panel.classList.remove("hop-tab-in-left", "hop-tab-in-right");
      void panel.offsetWidth;
      panel.classList.add(dx < 0 ? "hop-tab-in-right" : "hop-tab-in-left");
      setTimeout(() => panel.classList.remove("hop-tab-in-left", "hop-tab-in-right"), 320);
    });
  };
  root.addEventListener("touchstart", (e) => e.touches.length === 1 ? begin(e.touches[0].clientX, e.touches[0].clientY, e.target) : (start = null), { passive: true });
  root.addEventListener("touchend", (e) => { const t = e.changedTouches[0]; if (t) finish(t.clientX, t.clientY); }, { passive: true });
  root.addEventListener("touchcancel", () => (start = null), { passive: true });
  root.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") begin(e.clientX, e.clientY, e.target); });
  root.addEventListener("pointerup", (e) => { if (e.pointerType === "mouse") finish(e.clientX, e.clientY); });
}
