// Swipe a list card sideways to act on it (Nov 2026: swipe right marks a notification read).
// One delegated listener per root, so cards the renderer redraws keep working. Vertical scrolling
// stays with the browser (touch-action: pan-y on the cards); a mostly-vertical drag never swipes.
// Styles: animations.css, "Swipe to act".

type Options = { selector: string; label: string; onSwipe: (card: HTMLElement) => void | Promise<void> };
const attached = new WeakMap<HTMLElement, Options[]>();

export function enableSwipe(root: HTMLElement, options: Options) {
  const list = attached.get(root);
  if (list) {
    if (!list.some((o) => o.selector === options.selector)) list.push(options);
    return;
  }
  attached.set(root, [options]);
  let card: HTMLElement | null = null, opts: Options | undefined, startX = 0, startY = 0, dx = 0, decided = false, swiping = false;
  const reset = (el: HTMLElement) => {
    el.classList.remove("hop-swiping");
    el.style.removeProperty("--swipe-x");
  };
  root.addEventListener("pointerdown", (e) => {
    const target = e.target as Element;
    for (const o of attached.get(root) || []) {
      const hit = target.closest<HTMLElement>(o.selector);
      if (hit && !target.closest("button, a, input")) {
        card = hit; opts = o; startX = e.clientX; startY = e.clientY; dx = 0; decided = false; swiping = false;
        hit.dataset.swipeLabel = o.label;
        return;
      }
    }
  });
  root.addEventListener("pointermove", (e) => {
    if (!card) return;
    const x = e.clientX - startX, y = e.clientY - startY;
    if (!decided) {
      if (Math.abs(x) < 8 && Math.abs(y) < 8) return;
      decided = true;
      swiping = x > 0 && Math.abs(x) > Math.abs(y) * 1.5;
      if (!swiping) { card = null; return; }
      card.setPointerCapture?.(e.pointerId);
      card.classList.add("hop-swiping");
    }
    dx = Math.max(0, x);
    card.style.setProperty("--swipe-x", `${dx}px`);
  });
  const end = () => {
    const el = card, o = opts;
    card = null;
    // The click that follows this pointerup is swallowed below; later taps must not be.
    setTimeout(() => { swiping = false; }, 0);
    if (!el || !swiping || !o) return;
    if (dx > Math.min(120, el.offsetWidth * 0.35)) {
      el.classList.add("hop-swiped");
      navigator.vibrate?.(15);
      void Promise.resolve(o.onSwipe(el)).finally(() => { el.classList.remove("hop-swiped"); reset(el); });
    } else reset(el);
  };
  root.addEventListener("pointerup", end);
  root.addEventListener("pointercancel", end);
  // A swipe that started on a card must not also count as a tap on it.
  root.addEventListener("click", (e) => { if (swiping && dx > 8) { e.stopPropagation(); swiping = false; } }, true);
}
