// Slide to confirm (Nov 2026 compact redesign, approved): the Captain slides to accept a ride and to
// complete a trip, so a pocket tap or a bump on the road can't do either.
// The renderer's own button becomes the knob, so every existing handler, its accessible name
// ("Accept ride", "Complete trip") and keyboard use stay the same: Enter or Space confirms at once.
// A pointer tap without a slide is stopped before any handler sees it and just nudges the knob.
// Styles are in animations.css under "Slide to confirm".

const SELECTOR = '.action-bar button[data-action="accept"], .action-bar button[data-action="complete-trip"]';
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let allowClick = false;
let installed = false;

function guard(event: MouseEvent) {
  const knob = (event.target as Element | null)?.closest?.<HTMLElement>("[data-slide-confirm]");
  if (!knob || allowClick || event.detail === 0) return; // finished slide, or keyboard / assistive tech
  event.preventDefault();
  event.stopImmediatePropagation();
  const track = knob.closest<HTMLElement>(".hop-slide");
  if (!track || reduced()) return;
  track.classList.remove("hop-slide-nudge");
  void track.offsetWidth;
  track.classList.add("hop-slide-nudge");
}

/** Turns the Accept ride / Complete trip buttons on the current screen into slide controls. */
export function enhanceSlides(root: HTMLElement) {
  if (!installed) {
    installed = true;
    // Window capture runs before the app's own capture listeners.
    window.addEventListener("click", guard, true);
  }
  root.querySelectorAll<HTMLButtonElement>(SELECTOR).forEach(build);
}

function build(button: HTMLButtonElement) {
  if (button.dataset.slideConfirm) return;
  const accept = button.dataset.action === "accept";
  const name = (button.textContent || "").trim() || (accept ? "Accept ride" : "Complete trip");
  const track = document.createElement("div");
  track.className = `hop-slide ${accept ? "hop-slide-accept" : ""}`;
  track.innerHTML = `<i class="hop-slide-fill" aria-hidden="true"></i><span class="hop-slide-text" aria-hidden="true">${accept ? "Slide to accept" : "Slide to complete trip"}</span>`;
  button.before(track);
  track.append(button);
  button.dataset.slideConfirm = "1";
  button.setAttribute("aria-label", name);
  button.title = `${accept ? "Slide to accept" : "Slide to complete"}, or press Enter`;
  button.classList.add("hop-slide-knob");
  button.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;

  // Accepting is on a 15 s timer, so it completes a little earlier than ending a trip.
  const threshold = accept ? 0.7 : 0.85;
  let start = 0, x = 0, max = 0, dragging = false;
  const place = (value: number, animate: boolean) => {
    x = value;
    track.classList.toggle("hop-slide-dragging", !animate);
    track.style.setProperty("--slide-x", `${value}px`);
    track.style.setProperty("--slide-p", String(max ? value / max : 0));
  };
  button.addEventListener("pointerdown", (event) => {
    if (button.disabled || track.classList.contains("hop-slide-done")) return;
    max = track.clientWidth - button.offsetWidth - 8;
    start = event.clientX - x;
    dragging = true;
    button.setPointerCapture?.(event.pointerId);
  });
  button.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    place(Math.max(0, Math.min(max, event.clientX - start)), false);
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    if (max > 0 && x >= max * threshold) {
      place(max, true);
      track.classList.add("hop-slide-done");
      navigator.vibrate?.(30);
      allowClick = true;
      try { button.click(); } finally { allowClick = false; }
      // If the screen stays (an error, or the captain said no to an early finish), let them slide again.
      setTimeout(() => {
        if (!track.isConnected) return;
        track.classList.remove("hop-slide-done");
        place(0, true);
      }, 2500);
    } else place(0, true);
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
}
