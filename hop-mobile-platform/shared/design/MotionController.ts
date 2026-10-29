/** Decorative motion never gates navigation, API work, focus or permissions. */
export class MotionController {
  private observer: MutationObserver;
  private preference = matchMedia("(prefers-reduced-motion: reduce)");
  private animations = new Set<Animation>();
  private screen = "";
  private modal = "";
  private toast = "";
  private disposed = false;
  private ease = "cubic-bezier(.22,1,.36,1)";
  constructor(private app: HTMLElement) {
    this.observer = new MutationObserver(() => this.update());
    this.observer.observe(app, {
      childList: true,
      attributes: true,
      attributeFilter: ["data-ready", "data-live-payment"],
    });
    this.preference.addEventListener("change", this.reduce);
    document.addEventListener("visibilitychange", this.visibility);
    this.update();
  }
  private cancel() {
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
  }
  private reduce = () => {
    if (this.preference.matches) this.cancel();
  };
  private visibility = () => {
    if (document.hidden) this.cancel();
  };
  private play(
    node: Element | null,
    frames: Keyframe[],
    duration: number,
    label: string,
    delay = 0,
  ) {
    if (!node || this.preference.matches || document.hidden || this.disposed)
      return;
    const animation = node.animate(frames, {
      duration,
      delay,
      easing: this.ease,
      fill: "both",
    });
    animation.id = `hop-${label}`;
    this.animations.add(animation);
    void animation.finished
      .then(() => {
        animation.cancel();
        this.animations.delete(animation);
      })
      .catch(() => this.animations.delete(animation));
  }
  private update() {
    if (this.disposed || this.app.dataset.ready !== "true") return;
    const motionScreen = this.app.dataset.motionScreen || "";
    if (motionScreen) this.app.dataset.screen = motionScreen;
    const screen = this.app.dataset.livePayment
      ? `payment:${this.app.dataset.livePayment}`
      : `${this.app.dataset.motionRole}:${this.app.dataset.motionScreen}`;
    const modal = this.app.dataset.motionModal || "";
    const toast = this.app.querySelector(".toast")?.textContent || "";
    const changed = screen !== this.screen;
    if (changed) {
      this.cancel();
      const back = this.app.dataset.motionDirection === "back";
      const body = this.app.querySelector(".screen-body");
      // Only the sheet moves on map screens; the map/camera/GPS canvas is stable.
      const target = body?.classList.contains("map-screen")
        ? body.querySelector(".sheet")
        : body;
      this.play(
        target || null,
        [
          {
            opacity: 0,
            transform: `translate3d(${back ? -8 : 0}px,${back ? 0 : 8}px,0)`,
          },
          { opacity: 1, transform: "translate3d(0,0,0)" },
        ],
        240,
        "screen-entry",
      );
      this.play(
        this.app.querySelector(".action-bar"),
        [
          { opacity: 0, transform: "translateY(5px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        200,
        "action-entry",
        40,
      );
      const cards = this.app.querySelectorAll(
        ".screen-padding > :is(.wallet-hero,.offer-card,.activity-card,.section-card,.account-group,.list-row,.upload),.choose-sheet .vehicle,.login-assurance > span",
      );
      Array.from(cards)
        .slice(0, 6)
        .forEach((card, i) =>
          this.play(
            card,
            [
              { opacity: 0.3, transform: "translateY(5px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            200,
            "card-entry",
            i * 24,
          ),
        );
      if (this.app.dataset.motionScreen === "auth") {
        this.play(
          this.app.querySelector(".login-vehicle"),
          [
            { opacity: 0, transform: "translate3d(-20px,4px,0)" },
            { opacity: 1, transform: "translate3d(0,0,0)" },
          ],
          480,
          "login-vehicle",
          40,
        );
        this.play(
          this.app.querySelector(".login-form"),
          [
            { opacity: 0, transform: "translateY(10px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          300,
          "login-form",
          80,
        );
      }
    }
    if (modal && modal !== this.modal) {
      this.play(
        this.app.querySelector(".sheet-overlay"),
        [{ opacity: 0 }, { opacity: 1 }],
        160,
        "scrim-entry",
      );
      this.play(
        this.app.querySelector(".modal-sheet"),
        [
          { opacity: 0, transform: "translateY(24px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        280,
        "modal-entry",
      );
    }
    if (toast && toast !== this.toast)
      this.play(
        this.app.querySelector(".toast"),
        [
          { opacity: 0, transform: "translate(-50%,6px)" },
          { opacity: 1, transform: "translate(-50%,0)" },
        ],
        180,
        "toast-entry",
      );
    this.screen = screen;
    this.modal = modal;
    this.toast = toast;
  }
  destroy() {
    this.disposed = true;
    this.observer.disconnect();
    this.cancel();
    this.preference.removeEventListener("change", this.reduce);
    document.removeEventListener("visibilitychange", this.visibility);
  }
}
