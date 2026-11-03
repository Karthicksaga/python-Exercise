/** Keep the standalone shell inside the keyboard-visible viewport. */
export class ViewportController {
  private viewport = window.visualViewport;
  private frame = 0;
  constructor(private shell: HTMLElement) {
    this.viewport?.addEventListener("resize", this.schedule);
    window.addEventListener("resize", this.schedule);
    shell.addEventListener("focusin", this.schedule);
    this.update();
  }
  private schedule = () => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.update);
  };
  private update = () => {
    // Pinch zoom must retain browser panning rather than resizing the app.
    if (this.viewport && Math.abs(this.viewport.scale - 1) > 0.01) return;
    const height = this.viewport?.height ?? window.innerHeight;
    this.shell.style.setProperty("--hop-viewport-height", `${height}px`);
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      this.shell.contains(active) &&
      active.matches("input, textarea, [contenteditable='true']")
    ) {
      const rect = active.getBoundingClientRect();
      const top = this.viewport?.offsetTop ?? 0;
      if (rect.bottom > top + height || rect.top < top)
        active.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  };
  destroy() {
    cancelAnimationFrame(this.frame);
    this.viewport?.removeEventListener("resize", this.schedule);
    window.removeEventListener("resize", this.schedule);
    this.shell.removeEventListener("focusin", this.schedule);
    this.shell.style.removeProperty("--hop-viewport-height");
  }
}
