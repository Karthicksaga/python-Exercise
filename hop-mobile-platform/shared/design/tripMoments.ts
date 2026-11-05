// Trip moments (approved Nov 2026, "Hop Launch Motion" preview): a short motion for each step of a
// ride, matching the sound that already plays. The renderer redraws screens often, so a moment is a
// flag on #app for a moment's length, not a class on an element that may be replaced. Styles are in
// animations.css under "Trip moments"; reduced motion shows the end state at once.

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let clearTimer: ReturnType<typeof setTimeout> | undefined;

/** Plays a moment on the current screen: a chip over the map plus the moment's own sheet motion. */
export function playMoment(app: HTMLElement, moment: string, chip?: string) {
  clearTimeout(clearTimer);
  app.dataset.hopMoment = moment;
  clearTimer = setTimeout(() => delete app.dataset.hopMoment, 1800);
  if (!chip) return;
  app.querySelector(".hop-moment-chip")?.remove();
  const map = app.querySelector(".screen-body.map-screen");
  if (!map) return;
  const el = document.createElement("div");
  el.className = "hop-moment-chip";
  el.setAttribute("role", "status");
  el.innerHTML = `<span class="hop-moment-tick" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>`;
  el.append(document.createTextNode(chip));
  map.append(el);
  setTimeout(() => el.remove(), reduced() ? 2000 : 2600);
}

/** Counts a money figure up to its final text ("₹71.96"), keeping the exact final text. */
export function countUp(el: Element | null) {
  if (!el || reduced()) return;
  const final = el.textContent || "";
  const match = final.match(/[\d,]+(\.\d+)?/);
  if (!match) return;
  const target = Number(match[0].replace(/,/g, ""));
  if (!Number.isFinite(target) || target <= 0) return;
  const decimals = match[1] ? match[1].length - 1 : 0;
  const format = (v: number) => final.replace(match[0], v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  const start = performance.now() + 200, ms = 800;
  const step = (now: number) => {
    if (!el.isConnected) return;
    const k = Math.min(1, Math.max(0, (now - start) / ms));
    el.textContent = k >= 1 ? final : format(target * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  el.textContent = format(0);
  requestAnimationFrame(step);
}
