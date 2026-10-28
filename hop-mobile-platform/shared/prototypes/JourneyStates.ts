import { escape } from "../helpers";
const states = {
  location: {
    symbol: "⌖",
    title: "A little help finding you.",
    copy: "Location access is off. You can still enter your pickup address or choose a point on the map.",
    action: "Preview location enabled",
    next: "ready",
  },
  empty: {
    symbol: "⌕",
    title: "No matches just yet.",
    copy: "Try a street, nearby landmark, or a more specific address. Your pickup stays in place.",
    action: "Try another search",
    next: "ready",
  },
  drivers: {
    symbol: "↗",
    title: "A busy moment nearby.",
    copy: "No eligible Captains are available right now. Try another vehicle or check again shortly.",
    action: "Explore other vehicles",
    next: "ready",
  },
  expired: {
    symbol: "◷",
    title: "Let’s refresh your fare.",
    copy: "This quote has expired. Check the updated fare before requesting your ride.",
    action: "Preview updated fare",
    next: "ready",
  },
  offline: {
    symbol: "⌁",
    title: "A pause in the connection.",
    copy: "We’ll check the status of your request when you reconnect. We won’t assume it failed or send another request automatically.",
    action: "Preview reconnected",
    next: "ready",
  },
  taken: {
    symbol: "↪",
    title: "That request moved on.",
    copy: "Another Captain accepted this request first. Your next eligible offer will appear when it arrives.",
    action: "Return to Drive",
    next: "ready",
  },
  cancel: {
    symbol: "×",
    title: "A change of plans?",
    copy: "Review any applicable cancellation charge before confirming. Your Captain is notified only after the server confirms cancellation.",
    action: "Preview cancellation confirmed",
    next: "cancelled",
  },
  cancelled: {
    symbol: "✓",
    title: "Your request is cancelled.",
    copy: "A clear final status helps you decide what to do next. No new ride is created automatically.",
    action: "Start again",
    next: "ready",
  },
  notifications: {
    symbol: "♧",
    title: "Stay in the loop.",
    copy: "Device alerts are off. Ride updates remain available inside the app. Notification permission is requested only when you choose to enable it.",
    action: "Preview alerts enabled",
    next: "ready",
  },
  ready: {
    symbol: "✓",
    title: "You’re ready to continue.",
    copy: "This is a design preview of a recovered state. No location permission, ride or device setting was changed.",
    action: "Explore another state",
    next: "location",
  },
};
export class JourneyStates {
  private state: keyof typeof states = "location";
  constructor(
    private app: HTMLElement,
    private role: "rider" | "captain",
  ) {
    app.addEventListener("click", (event) => {
      const button = (event.target as Element).closest<HTMLElement>(
        "[data-state-preview]",
      );
      if (button) {
        this.state = button.dataset.statePreview as keyof typeof states;
        this.render();
      }
    });
    this.render();
  }
  private render() {
    const state = states[this.state];
    this.app.className = `app ${this.role}`;
    this.app.innerHTML = `<div class="status-bar"><span>9:41</span><span>▂▅▇</span></div><header class="app-head"><div class="brand">hop<span class="role-tag">${this.role.toUpperCase()}</span></div><span class="badge neutral">State prototypes</span></header><div class="screen-body"><section class="payment-intro"><span>THE SMALL DETAILS MATTER</span><h1>Every state, considered.</h1><p>Explore recovery and decision screens before implementation.</p></section><div class="prototype-state-tabs">${Object.keys(
      states,
    )
      .filter((key) => key !== "ready" && key !== "cancelled")
      .map(
        (key) =>
          `<button class="product-chip ${this.state === key ? "active" : ""}" data-state-preview="${key}">${escape(({ location: "Location", empty: "No results", drivers: "No Captains", expired: "Fare expired", offline: "Offline", taken: "Offer taken", cancel: "Cancel ride", notifications: "Alerts" } as Record<string, string>)[key])}</button>`,
      )
      .join(
        "",
      )}</div><section class="state-preview-card"><div class="payment-state-symbol">${state.symbol}</div><h2>${state.title}</h2><p>${state.copy}</p>${this.state === "cancel" ? '<label class="field-label" for="preview-cancel-reason">Reason (optional)</label><select class="text-input" id="preview-cancel-reason"><option>Plans changed</option><option>Wrong pickup</option><option>Waiting too long</option></select>' : ""}</section></div><footer class="action-bar">${this.state === "cancel" ? '<button class="secondary" data-state-preview="ready">Keep my ride</button>' : ""}<button class="primary" data-state-preview="${state.next}">${state.action} →</button><p class="fineprint">Design preview · no API calls or device changes</p></footer>`;
  }
}
