/**
 * The approved experience lab IS the UI source, not a loose design reference.
 * Keep its renderer, typography, copy, tokens and assets shared with both apps.
 * Backend integration must adapt data/actions underneath this renderer.
 */
export async function mountPrototype(role: "rider" | "captain") {
  document.documentElement.classList.toggle(
    "hop-live",
    new URLSearchParams(location.search).get("map") !== "reference",
  );
  const referenceMode =
    new URLSearchParams(location.search).get("map") === "reference";
  // Reference mode compares the canonical paint without live-only animation layers.
  if (!referenceMode) await import("./animations.css");
  document.body.innerHTML = `${
    referenceMode
      ? `
    <div data-prototype-review hidden inert aria-hidden="true">
      <button data-role="rider"></button><button data-role="captain"></button>
      <select id="screen-select"></select><div id="journey-nav"></div>
      <span id="screen-number"></span><span id="screen-title"></span>
      <span id="screen-description"></span><span id="design-note"></span>
      <button id="mobile-role"></button><button id="mobile-menu"></button>
      <button id="next-state"></button>
    </div>`
      : ""
  }
    <main class="phone" id="phone"><div class="app" id="app"></div></main>`;
  const host = document.querySelector<HTMLElement>("#app")!;
  host.inert = true;
  host.setAttribute("aria-busy", "true");
  const ready = () => {
    host.inert = false;
    host.setAttribute("aria-busy", "false");
    host.dataset.ready = "true";
  };
  // Normal apps are standalone: review controls exist only in explicit
  // reference mode for screenshot comparisons.
  const { prototypeBridge } = await import("@prototype/app.js");
  (window as any).prototypeBridge = prototypeBridge;
  if (role === "captain") prototypeBridge.role("captain");
  if ((window as any).Capacitor?.isNativePlatform?.()) {
    document.body.classList.add("is-native-mobile");
    const { App } = await import("@capacitor/app");
    await App.addListener("backButton", () => {
      const modalClose = document.querySelector<HTMLButtonElement>(
        '[data-action="close-modal"], [data-modal-close], .modal button[aria-label*="Close"], .modal-sheet button[aria-label*="Close"]',
      );
      if (modalClose) {
        modalClose.click();
        return;
      }
      const st = prototypeBridge.read();
      if (st.modal) {
        prototypeBridge.update({ modal: null });
        return;
      }
      if (st.screen === "onboarding" && st.onboard > 0) {
        const backBtn = document.querySelector<HTMLButtonElement>(
          'header button[data-action="back"], [data-action="onboarding-back"]',
        );
        if (backBtn) {
          backBtn.click();
          return;
        }
      }
      prototypeBridge.back();
    });
  }
  const preview = new URLSearchParams(location.search).get("prototype");
  if (preview === "login") {
    document.documentElement.classList.remove("hop-live");
    prototypeBridge.go("auth");
    const { LoginPrototype } = await import("../prototypes/LoginPrototype");
    new LoginPrototype(document.querySelector<HTMLElement>("#app")!);
    ready();
    document.title = `Hop ${role} — login design prototype`;
    return;
  }
  if (preview === "states") {
    document.documentElement.classList.remove("hop-live");
    const { JourneyStates } = await import("../prototypes/JourneyStates");
    new JourneyStates(document.querySelector<HTMLElement>("#app")!, role);
    ready();
    document.title = `Hop ${role} — recovery state prototypes`;
    return;
  }
  if (preview === "payment") {
    document.documentElement.classList.remove("hop-live");
    const { PaymentPrototype } = await import("../prototypes/PaymentPrototype");
    new PaymentPrototype(document.querySelector<HTMLElement>("#app")!, role);
    ready();
    document.title = `Hop ${role} — payment design prototype`;
    return;
  }
  // Explicit reference mode exists for pixel comparison only. Normal apps use live maps.
  if (new URLSearchParams(location.search).get("map") !== "reference") {
    // Keep Home hidden until the saved session is checked. Login is the
    // default live launch screen; design/reference previews remain isolated.
    prototypeBridge.go("auth");
    const { LiveJourney } = await import("../journey/LiveJourney");
    const journey = new LiveJourney(
      document.querySelector<HTMLElement>("#app")!,
      role,
      prototypeBridge,
    );
    window.addEventListener("pagehide", () => journey.destroy(), {
      once: true,
    });
    await journey.ready;
    const { PrototypeMap } = await import("../maps/PrototypeMap");
    const map = new PrototypeMap(
      document.querySelector<HTMLElement>("#app")!,
      role,
    );
    window.addEventListener("pagehide", () => map.destroy(), { once: true });
    const { MotionController } = await import("./MotionController");
    const motion = new MotionController(host);
    window.addEventListener("pagehide", () => motion.destroy(), { once: true });
  }
  ready();
  document.title = `Hop ${role === "rider" ? "Rider" : "Captain"} — prototype replica`;
}

export const mountMobileApp = mountPrototype;
