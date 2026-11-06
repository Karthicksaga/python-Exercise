import { LiveAccount } from "../account/LiveAccount";
import { LiveBooking } from "../booking/LiveBooking";
import { LiveHistory } from "../history/LiveHistory";
import { acceptRideSound, captainArrivedSound, captainFoundSound, notificationSound, rideCancelledSound, startOfferAlert, startSearchingSound, stopOfferAlert, stopSearchingSound, tripCompleteSound, tripStartedSound } from "../sounds";
import { CaptainOnboarding } from "../onboarding/CaptainOnboarding";
import { icon } from "../icons";
import {
  enableNotifications,
  notificationStatus,
  openNotificationSettings,
  type AlertState,
  disableNotifications,
} from "../notifications/device";
import { recoveryStates, type RecoveryState } from "./recovery";
import { LivePayment } from "../payments/LivePayment";
import { RideChat } from "../chat/RideChat";
import { paymentMethods } from "../payments/components";
import { api, APIError } from "../services/client";
import type { Point, Config, Quote, State, Ride } from "../services/contracts";
import { playMoment } from "../design/tripMoments";
import { enhanceSlides } from "../design/slideToConfirm";
import { enableTabSwipe } from "../design/swipe";
import { riderBeacon, showBeacon, captainBeaconHint, waitClock } from "../design/tripExtras";
import { escape, money } from "../helpers";
import type { Coordinate } from "../maps/types";
import { distanceMeters } from "../maps/motion";
import { currentLocation } from "../platform/transport";
interface Bridge {
  assign(patch: Record<string, unknown>): void;
  read(): any;
  update(patch: Record<string, unknown>): void;
  go(screen: string): void;
  back(): void;
  notify(message: string): void;
}
type Route = { route: Coordinate[]; meters: number; seconds: number };
// Names riders understand instead of "Route 2": the quickest, the shortest, or another option.
export function routeLabels(routes: Route[]): string[] {
  if (!routes.length) return [];
  const fastest = routes.reduce((b, r, i) => (r.seconds < routes[b].seconds ? i : b), 0);
  const shortest = routes.reduce((b, r, i) => (r.meters < routes[b].meters ? i : b), 0);
  return routes.map((_, i) => (i === fastest && i === shortest ? "Fastest & shortest" : i === fastest ? "Fastest" : i === shortest ? "Shortest" : "Alternative"));
}
type Notice = { id: string; title: string; body: string; created_at?: string; read_at?: string | null; kind?: string };

/** Data and action adapter for the approved UI; no alternate screen renderer. */
export class LiveJourney {
  private history?: LiveHistory;
  private booking: LiveBooking;
  private account: LiveAccount;
  private config?: Config;
  private locationDenied = () => this.showRecovery("location");
  private recovery?: RecoveryState;
  private lastAction = "";
  private signedIn = false;
  private sessionChecked = false;
  readonly ready: Promise<void>;
  private payment?: LivePayment;
  private onboarding?: CaptainOnboarding;
  private onboardingDismissed = false;
  private walletBalance?: number;
  private paymentChecked = false;
  private synced = false;
  private paymentChosen = false;
  /** A ride step that just happened, played as a short motion once its screen is drawn. */
  private pendingMoment = "";
  /** The ride whose pickup code boxes were last cleared. */
  private pinRide = "";
  private walletLoading = false;
  private authError = "";
  private phone = "";
  private otp = "";
  private codeSent = false;
  private devCode = "";
  private pickup?: Point;
  private dropoff?: Point;
  private selectedArea = "";
  private searchLabel = "Type at least three characters to search places.";
  private searchNeedsSignIn = false;
  private target: "pickup" | "dropoff" = "dropoff";
  private results: Point[] = [];
  private searchTimer?: ReturnType<typeof setTimeout>;
  private sequence = 0;
  private routeSequence = 0;
  private route?: Route;
  private routes: Route[] = [];
  private quote?: Quote;
  private quoteOptionsKey = "";
  private requestKey = crypto.randomUUID();
  private bookingPayload?: { quote: string; payment: string };
  private busy = false;
  private state?: State;
  private seenRide = "";
  private offersSeen = new Set<string>();
  private notices: Notice[] = [];
  private noticeFilter = "all";
  private noticesLoading = false;
  private noticesError = "";
  private rideChat: RideChat;
  /** The phone's own position from the home map, used to tell whether it's inside a service area. */
  private here?: { lat: number; lng: number };
  private hopHere = (event: Event) => {
    const d = (event as CustomEvent<{ lat: number; lng: number }>).detail;
    if (!d || !Number.isFinite(d.lat) || !Number.isFinite(d.lng)) return;
    const moved = !this.here || Math.abs(this.here.lat - d.lat) + Math.abs(this.here.lng - d.lng) > 0.0005;
    this.here = { lat: d.lat, lng: d.lng };
    if (moved) this.decorate();
  };
  private inService(point: { lat: number; lng: number }) {
    return !!this.config?.areas.some((a) => point.lat >= a.min_lat && point.lat <= a.max_lat && point.lng >= a.min_lng && point.lng <= a.max_lng);
  }
  private serviceNote() {
    const names = (this.config?.areas || []).map((a) => a.name.replace(/ (Urban|Rural|District|City)$/i, ""));
    return names.length ? `Hop serves ${names.join(", ")} for now.` : "Hop isn't serving any area yet.";
  }
  /** Outside every service area there is nothing to book, so search is switched off with a reason. */
  private gateService(screen: string) {
    if (this.role !== "rider" || !this.config) return;
    if (screen === "home") {
      const out = !!this.here && !this.inService(this.here);
      const card = this.app.querySelector<HTMLElement>(".home-where");
      let note = card?.querySelector<HTMLElement>(".home-unavailable");
      if (out && card && !note) {
        note = document.createElement("p");
        note.className = "home-unavailable";
        note.setAttribute("role", "status");
        note.innerHTML = `<strong>Hop isn’t available at your location yet.</strong>${escape(this.serviceNote())}`;
        card.append(note);
      } else if (!out) note?.remove();
      this.app
        .querySelectorAll<HTMLButtonElement>('.screen-body [data-go="search"], .shortcut[data-destination], [data-triptype], [data-action="usual-ride"]')
        .forEach((b) => {
          if (b.disabled === out) return;
          b.disabled = out;
          b.toggleAttribute("data-out-of-service", out);
        });
    }
    if (screen === "search") {
      const point = this.pickup || this.here;
      const out = !!point && !this.inService(point);
      const input = this.app.querySelector<HTMLInputElement>("#destination-input");
      if (input && input.disabled !== out) {
        input.dataset.placeholder ||= input.placeholder;
        input.disabled = out;
        input.placeholder = out ? "Pickup is outside Hop’s service areas" : input.dataset.placeholder;
      }
      const message = `This pickup is outside Hop’s service areas. ${this.serviceNote()} Choose a pickup inside one of them.`;
      if (out && this.searchLabel !== message) this.showResults([], message);
    }
  }
  private submit = (event: Event) => {
    if ((event.target as HTMLFormElement).id !== "chat-form") return;
    this.stop(event);
    this.rideChat.submit();
  };
  private notificationTimer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private observer: MutationObserver;
  private estimates: Record<string, number> = {};
  private navigation?: {
    steps: { instruction: string; meters: number }[];
    seconds: number;
    meters: number;
    stale: boolean;
  };
  // Tapping a grey alternative route on the map selects it, like tapping its chip.
  private routePick = (event: Event) => {
    const index = (event as CustomEvent<{ index: number }>).detail?.index;
    if (!Number.isInteger(index) || index === this.booking.routeIndex || !this.routes[index]) return;
    this.booking.routeIndex = index;
    this.quote = undefined;
    this.bookingPayload = undefined;
    void this.plan();
  };
  private navigationUpdate = (event: Event) => {
    this.navigation = (event as CustomEvent).detail || undefined;
    this.decorate();
  };
  constructor(
    private app: HTMLElement,
    private role: "rider" | "captain",
    private bridge: Bridge,
  ) {
    // The shared renderer starts with review-only addresses. A live journey
    // has no pickup or destination until the user explicitly selects one.
    bridge.assign({ pickup: "", destination: "", search: "" });
    // Appearance (Nov 2026): the dark choice is kept on the phone; with no choice yet, follow the phone.
    try {
      const saved = localStorage.getItem("hop-dark");
      const dark = saved === null ? matchMedia("(prefers-color-scheme: dark)").matches : saved === "1";
      bridge.assign({ toggled: { ...bridge.read().toggled, dark } });
      this.savedDark = dark;
    } catch {}
    this.rideChat = new RideChat(app, role, bridge, () => this.active());
    this.account = new LiveAccount(
      app,
      role,
      bridge,
      () => this.state,
      () => this.config,
      async () => this.sync(await api.state()),
    );
    this.booking = new LiveBooking(
      app,
      bridge,
      () => this.area()?.id,
      async () => {
        this.invalidate();
        if (this.pickup && this.dropoff) {
          this.bridge.go("choose");
          await this.plan();
        } else this.bridge.go("search");
      },
      (query) => {
        this.bridge.go("search");
        this.target = "dropoff";
        const field =
          this.app.querySelector<HTMLInputElement>("#destination-input");
        if (field) {
          field.value = query;
          field.dispatchEvent(new Event("input", { bubbles: true }));
        }
      },
    );
    app.addEventListener("submit", this.submit, true);
    app.addEventListener("click", this.click, true);
    enableTabSwipe(app);
    app.addEventListener("input", this.input, true);
    app.addEventListener("focusin", this.focus, true);
    app.addEventListener("change", this.changeArea, true);
    window.addEventListener("hop-location-denied", this.locationDenied);
    window.addEventListener("hop-navigation", this.navigationUpdate);
    window.addEventListener("hop-map-pick", this.mapPick);
    window.addEventListener("hop-route-pick", this.routePick);
    window.addEventListener("hop-live-state", this.serverState);
    window.addEventListener("hop-trip-eta", this.tripEta);
    window.addEventListener("hop-here", this.hopHere);
    this.observer = new MutationObserver(() => this.decorate());
    this.observer.observe(app, { childList: true });
    void api
      .config()
      .then((config) => {
        this.config = config;
        this.selectedArea ||=
          config.areas.find(
            (a) =>
              13.0067 >= a.min_lat &&
              13.0067 <= a.max_lat &&
              80.2206 >= a.min_lng &&
              80.2206 <= a.max_lng,
          )?.id ||
          config.areas[0]?.id ||
          "";
        this.decorate();
      })
      .catch(() => {});
    this.ready = api.session()
      .then(async session => {
        if (!session.user?.id) throw new APIError("Sign in to your Hop account.", 401);
        this.signedIn = true;
        this.sessionChecked = true;
        try {
          this.sync(await api.state());
        } catch {
          // Gracefully continue if initial state fetch fails
        }
        if (this.bridge.read().screen === "auth") {
          this.bridge.go(this.role === "rider" ? "home" : "drive");
          this.bridge.assign({ back: [] });
        }
        this.decorate();
      })
      .catch(error => {
        this.signedIn = false;
        this.sessionChecked = true;
        this.authError = error instanceof APIError && error.status === 401
          ? ""
          : "We could not check your saved session. Please sign in to continue.";
        this.bridge.go("auth");
        this.decorate();
      });
    void this.notifications();
    this.decorate();
  }
  private focus = (event: Event) => {
    const id = (event.target as HTMLElement).id;
    if (id === "pickup-input") this.target = "pickup";
    if (id === "destination-input") this.target = "dropoff";
  };
  private isDevMode(): boolean {
    return api.isDevEnvironment(this.config);
  }
  private showRecovery(state: RecoveryState) {
    this.recovery = state;
    this.bridge.update({ modal: "live-recovery" });
  }
  // A new rider starts on Wallet with no balance, so their first request would be refused.
  // Unless they picked Wallet themselves, a ride the wallet can't cover starts on Cash, and the
  // Payment row shows it before they request.
  private preferAffordablePayment() {
    if (this.paymentChecked || this.paymentChosen || this.bridge.read().payment !== "Wallet") return;
    this.paymentChecked = true;
    void api
      .request<{ balance_paise: number }>("/api/wallet")
      .then((wallet) => {
        this.walletBalance = wallet.balance_paise;
        const fare = this.estimates[this.bridge.read().vehicle] ?? this.quote?.fare_paise;
        if (this.paymentChosen || this.bridge.read().payment !== "Wallet" || !Number.isSafeInteger(wallet.balance_paise) || fare === undefined || wallet.balance_paise >= fare) return;
        // Quietly: the Payment row already shows Cash, and a pop-up here only got in the way.
        this.bridge.update({ payment: "Cash" });
      })
      .catch(() => { this.paymentChecked = false; });
  }

  private message(error: unknown) {
    this.bridge.notify(
      error instanceof Error
        ? error.message
        : "Unable to connect to Hop. Try again.",
    );
  }
  private invalidate() {
    const area = this.area();
    this.planningError = "";
    this.routeSequence++;
    this.routes = [];
    this.booking.routeIndex = 0;
    this.quote = undefined;
    this.bookingPayload = undefined;
    this.requestKey = crypto.randomUUID();
    this.route = undefined;
    this.estimates = {};
    window.dispatchEvent(
      new CustomEvent("hop-planned-route", {
        detail: {
          center:
            this.pickup ||
            this.dropoff ||
            (area
              ? {
                  lat: (area.min_lat + area.max_lat) / 2,
                  lng: (area.min_lng + area.max_lng) / 2,
                }
              : { lat: 13.0067, lng: 80.2206 }),
          vehicles: [],
          pickup: this.pickup,
          dropoff: this.dropoff,
        },
      }),
    );
  }
  private input = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.id === "demo-phone") this.phone = input.value;
    if (input.id === "live-login-code") this.otp = input.value;
    if (input.id === "message-input") this.rideChat.typing();
    if (!["pickup-input", "destination-input"].includes(input.id)) return;
    event.stopImmediatePropagation();
    this.target = input.id === "pickup-input" ? "pickup" : "dropoff";
    this.bridge.assign(
      this.target === "pickup"
        ? { pickup: input.value }
        : { search: input.value },
    );
    if (this.target === "pickup") this.pickup = undefined;
    else this.dropoff = undefined;
    this.invalidate();
    clearTimeout(this.searchTimer);
    const sequence = ++this.sequence,
      query = input.value.trim();
    if (query.length < 3) {
      this.showResults([], "Type at least three characters");
      return;
    }
    this.searchNeedsSignIn = false;
    this.searchQuery = query;
    this.showResults([], "Searching places…", true);
    this.searchTimer = setTimeout(() => void this.search(query, sequence), 350);
  };
  private changeArea = (event: Event) => {
    const input = event.target as HTMLSelectElement;
    if (input.id !== "live-search-area") return;
    this.selectedArea = input.value;
    this.sequence++;
    clearTimeout(this.searchTimer);
    this.pickup = undefined;
    this.dropoff = undefined;
    this.invalidate();
    this.bridge.assign({ pickup: "", destination: "", search: "" });
    this.showResults([], "Search within your selected city");
    this.bridge.update({});
  };
  private area(point = this.pickup) {
    const selected = this.config?.areas.find((a) => a.id === this.selectedArea);
    if (!point)
      return (
        selected ||
        this.config?.areas.find(
          (a) =>
            13.0067 >= a.min_lat &&
            13.0067 <= a.max_lat &&
            80.2206 >= a.min_lng &&
            80.2206 <= a.max_lng,
        ) ||
        this.config?.areas[0]
      );
    const contains = (a: {
      min_lat: number;
      max_lat: number;
      min_lng: number;
      max_lng: number;
    }) =>
      point.lat >= a.min_lat &&
      point.lat <= a.max_lat &&
      point.lng >= a.min_lng &&
      point.lng <= a.max_lng;
    return selected && contains(selected)
      ? selected
      : this.config?.areas.find(contains);
  }
  private async search(query: string, sequence: number) {
    try {
      await api.session();
      this.config ||= await api.config();
      const area = this.area();
      if (!area)
        throw new Error("Select a pickup inside a supported service area.");
      const results = await api.request<Point[]>(
        `/api/places?area_id=${encodeURIComponent(area.id)}${this.booking.tripType === "outstation" && this.target === "dropoff" ? "&scope=india" : ""}&q=${encodeURIComponent(query)}`,
      );
      if (sequence !== this.sequence || this.stopped) return;
      this.showResults(
        results,
        results.length
          ? "SEARCH RESULTS"
          : "No matching places. Try a nearby landmark.",
      );
    } catch (error) {
      this.searchNeedsSignIn =
        error instanceof APIError && error.status === 401;
      if (sequence === this.sequence)
        this.showResults(
          [],
          error instanceof Error ? error.message : "Search unavailable",
        );
    }
  }
  private searchQuery = "";
  /** The typed letters, highlighted where a result's name starts with them. */
  private highlight(name: string) {
    const q = this.searchQuery;
    if (q && name.toLowerCase().startsWith(q.toLowerCase()))
      return `<mark>${escape(name.slice(0, q.length))}</mark>${escape(name.slice(q.length))}`;
    return escape(name);
  }
  private showResults(found: Point[], label: string, loading = false) {
    // The address service often returns the same place several times a few metres apart.
    const near = (a: Point, b: Point) => Math.abs(a.lat - b.lat) < 0.0015 && Math.abs(a.lng - b.lng) < 0.0015;
    const results = found.filter((p, i) => !found.slice(0, i).some((q) => q.label === p.label && near(p, q)));
    this.results = results;
    this.searchLabel = label;
    const list = this.app.querySelector<HTMLElement>("#place-results");
    // decorate() calls this every few seconds; rebuild only when the results change, or the rows
    // replay their slide-in and the list looks like it keeps refreshing (phone test, Nov 2026).
    const key = JSON.stringify([results.map((p) => p.label), label, loading, this.searchNeedsSignIn, this.searchQuery]);
    if (list && list.dataset.shown === key && list.childElementCount) return;
    if (list) list.dataset.shown = key;
    if (list)
      list.innerHTML =
        results
          .map(
            (p, i) =>
              {
                // "Guindy, Anna Salai (Mount Road)" reads as the place, then where it is.
                const [name, ...area] = p.label.split(", ");
                return `<button class="list-row hop-result-in" style="--i:${i}" data-live-place="${i}"><span class="list-icon">⌖</span><span class="list-text"><strong>${this.highlight(name)}</strong>${area.length ? `<small>${escape(area.join(", "))}</small>` : ""}</span><span>›</span></button>`;
              },
          )
          .join("") ||
        (loading
          ? `<div class="hop-search-skeleton" role="status" aria-label="${escape(label)}">${'<div class="hop-skel-row" aria-hidden="true"><i class="hop-skel hop-skel-icon"></i><span><i class="hop-skel hop-skel-line"></i><i class="hop-skel hop-skel-line short"></i></span></div>'.repeat(3)}</div>`
          : "") ||
        `<div class="search-feedback" role="status"><p>${escape(label)}</p>${this.searchNeedsSignIn ? '<button class="secondary" data-live-login>Sign in to search places</button>' : ""}</div>`;
    const heading = this.app.querySelector("#results-label");
    if (heading)
      heading.innerHTML = results.length
        ? "SEARCH RESULTS"
        : loading
          ? 'SEARCHING <span class="hop-live-dots" aria-hidden="true"><i></i><i></i><i></i></span>'
          : "PLACES";
  }
  private async select(point: Point) {
    this.sequence++;
    clearTimeout(this.searchTimer);
    if (this.target === "pickup") {
      this.pickup = point;
      this.invalidate();
      this.bridge.update({ pickup: point.label });
      this.target = "dropoff";
      this.app.querySelector<HTMLInputElement>("#destination-input")?.focus();
      if (this.dropoff) {
        this.bridge.go("choose");
        await this.plan();
      }
    } else {
      this.dropoff = point;
      this.bridge.assign({ liveDestination: point });
      this.invalidate();
      this.bridge.update({ destination: point.label });
      if (!this.pickup) {
        this.bridge.notify(
          "Choose a pickup first, or use your current location.",
        );
        this.bridge.go("search");
        this.target = "pickup";
        return;
      }
      this.bridge.go("choose");
      await this.plan();
    }
  }
  private mapPick = (event: Event) => {
    if (this.active()) return;
    const point = (event as CustomEvent<Coordinate & { target?: "pickup" | "dropoff" }>).detail;
    if (point.target) this.target = point.target;
    if (this.role === "captain") {
      window.dispatchEvent(
        new CustomEvent("hop-planned-route", {
          detail: {
            center: point,
            vehicles: [],
            pickup: point,
          },
        }),
      );
      return;
    }
    if (!this.pickup && this.bridge.read().screen === "home") {
      this.target = "pickup";
    }
    // A tapped point gets the street name from the server; raw coordinates read like an error.
    void (async () => {
      let label = "Pinned location";
      try {
        label = (await api.request<{ label: string }>(`/api/places/reverse?lat=${point.lat}&lng=${point.lng}`)).label || label;
      } catch {}
      await this.select({ lat: point.lat, lng: point.lng, label });
    })().catch((e) => this.message(e));
  };
  /** After a trip ends, home starts clean: no old pickup, drop-off or route on the map or in the form. */
  private clearPlan() {
    this.pickup = undefined;
    this.dropoff = undefined;
    this.routes = [];
    this.invalidate();
    this.bridge.assign({ pickup: "", destination: "", search: "" });
  }
  private cancelRiderRide() {
    this.recovery = undefined;
    this.seenRide = "";
    this.quote = undefined;
    this.bookingPayload = undefined;
    this.route = undefined;
    this.estimates = {};
    this.dropoff = undefined;
    this.invalidate();
    this.bridge.assign({
      modal: null,
      phase: "none",
      destination: "",
      search: "",
    });
    this.bridge.update({
      modal: null,
      phase: "none",
      destination: "",
      search: "",
    });
    stopSearchingSound();
    this.bridge.go("home");
    this.bridge.notify("Ride request cancelled.");
  }

  // Every fetched route for the map, so unselected ones stay visible (grey) and tappable.
  private alternatives() {
    const labels = routeLabels(this.routes);
    return this.routes.length < 2 ? [] : this.routes.map((r, index) => ({
      index, route: r.route, selected: index === this.booking.routeIndex,
      label: `${labels[index]} · ${Math.ceil(r.seconds / 60)} min`,
    }));
  }
  private planningError = "";
  private async plan(): Promise<void> {
    if (!this.pickup || !this.dropoff) return;
    const revision = ++this.routeSequence,
      pickup = { ...this.pickup },
      dropoff = { ...this.dropoff };
    this.planningError = "";
    this.route = undefined;
    this.estimates = {};
    this.quote = undefined;
    try {
      await api.session();
      this.config ||= await api.config();
      const area = this.area(pickup);
      if (!area)
        throw new Error("Pickup is outside the supported service areas.");
      if (this.booking.advanced()) {
        const categories = this.config.vehicles
          .filter((v) => v.area_id === area.id)
          .map((v) => v.category);
        const selected = this.bridge.read().vehicle;
        const options = await Promise.allSettled(
          [...new Set([...categories, selected])].map(async (category) => ({
            category,
            quote: await api.quote(
              area.id,
              category,
              pickup,
              dropoff,
              this.booking.quoteOptions(),
            ),
          })),
        );
        if (revision !== this.routeSequence) return;
        const available = options.flatMap((r) =>
          r.status === "fulfilled" ? [r.value] : [],
        );
        if (!available.length)
          throw (
            (
              options.find(
                (r) => r.status === "rejected",
              ) as PromiseRejectedResult
            )?.reason || new Error("No fares available.")
          );
        this.estimates = Object.fromEntries(
          available.map((v) => [v.category, v.quote.fare_paise]),
        );
        const quote =
          available.find((v) => v.category === selected)?.quote ||
          available[0].quote;
        this.route = {
          route: quote.route || [],
          meters: quote.meters,
          seconds: quote.seconds,
        };
        window.dispatchEvent(
          new CustomEvent("hop-planned-route", {
            detail: {
              center: pickup,
              vehicles: [],
              pickup,
              dropoff,
              route: this.route.route,
              alternatives: this.alternatives(),
              dropoffNote: this.route.seconds > 0 ? `${Math.ceil(this.route.seconds / 60)} min ride` : undefined,
            },
          }),
        );
        return;
      }
      // Routes are fetched once per pickup/destination (invalidate() clears them); switching
      // between them reuses the list instead of asking the router again.
      if (!this.routes.length) {
        const response = await api.request<{ routes: Route[] }>(
          "/api/routes/alternatives",
          { pickup, dropoff, stops: this.booking.stops },
        );
        if (revision !== this.routeSequence) return;
        this.routes = response.routes || [];
        // Start on the fastest route (after the server's traffic adjustment), not simply the
        // router's first choice, and price that route with a quote for it.
        const fastest = this.routes.reduce((best, r, i) => (r.seconds < this.routes[best].seconds ? i : best), 0);
        if (fastest > 0 && this.booking.routeIndex === 0) {
          this.booking.routeIndex = fastest;
          return this.plan();
        }
      }
      // Estimates price the first (recommended) route; other routes go through per-vehicle quotes above.
      const route = this.routes[0];
      if (!route?.route?.length)
        throw new Error("No road route is available for these locations.");
      const estimates = await api.request<{
        options: { category: string; fare_paise: number }[];
      }>("/api/estimates", {
        area_id: area.id,
        pickup,
        dropoff,
        stops: this.booking.stops,
      });
      if (revision !== this.routeSequence) return;
      if (!estimates.options?.length)
        throw new Error("No vehicle estimates are available.");
      this.route = route;
      this.estimates = Object.fromEntries(
        estimates.options
          .filter(
            (o) => Number.isSafeInteger(o.fare_paise) && o.fare_paise >= 0,
          )
          .map((o) => [o.category, o.fare_paise]),
      );
      window.dispatchEvent(
        new CustomEvent("hop-planned-route", {
          detail: {
            center: pickup,
            vehicles: [],
            pickup,
            dropoff,
            route: route.route,
            alternatives: this.alternatives(),
            dropoffNote: route.seconds > 0 ? `${Math.ceil(route.seconds / 60)} min ride` : undefined,
          },
        }),
      );
    } catch (e) {
      if (revision !== this.routeSequence) return;
      this.route = undefined;
      this.estimates = {};
      this.quote = undefined;
      this.planningError =
        e instanceof Error
          ? e.message
          : "Road route and fare unavailable. Try again.";
      window.dispatchEvent(
        new CustomEvent("hop-planned-route", {
          detail: { center: pickup, vehicles: [], pickup, dropoff, route: [] },
        }),
      );
      this.bridge.notify(this.planningError);
    } finally {
      if (revision === this.routeSequence) this.decorate();
    }
  }
  private active() {
    return this.state?.rides?.find(
      (r) =>
        (this.role === "rider" ? r.mine : r.driving) &&
        ["requested", "accepted", "arrived", "in_progress"].includes(r.status),
    );
  }
  private async run(work: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    try {
      await work();
    } catch (error) {
      if (this.bridge.read().screen === "auth")
        this.authError =
          error instanceof Error ? error.message : "Sign-in failed. Try again.";
      this.message(error);
      const text = error instanceof Error ? error.message : String(error);
      if (
        (error instanceof APIError && error.status === 0) ||
        (error instanceof TypeError && /fetch|network/i.test(text))
      )
        this.showRecovery("offline");
      else if (/quote.*expir|quote.*invalid|pricing.*changed/i.test(text)) {
        this.quote = undefined;
        this.showRecovery("expired");
      } else if (
        this.lastAction === "accept" &&
        error instanceof APIError &&
        error.status === 409
      )
        this.showRecovery("taken");
      else if (this.lastAction === "enable-device-notifications")
        // The toast above already says what went wrong; refresh the card so it can offer Settings.
        void this.refreshAlerts();
      else if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        [1, 2, 3].includes(Number(error.code))
      )
        this.showRecovery("location");
    } finally {
      this.busy = false;
      this.decorate();
    }
  }
  private stop(event: Event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  private openPayment(ride: Ride, after?: () => void) {
    this.payment?.destroy();
    this.bridge.assign({ modal: null });
    this.payment = new LivePayment(this.app, ride, this.role, () => {
      this.payment = undefined;
      if (after) after();
      else this.bridge.go("activity");
    });
  }
  private startCityRide() {
    this.booking.reset();
    this.bridge.assign({ tripType: "city", schedule: "Now" });
    this.quote = undefined;
    this.bookingPayload = undefined;
  }
  /** Captain's wait time from the live map feed (rider), so the sheet and the pickup pin agree. */
  private eta?: { ride: string; status: string; seconds?: number };
  private tripEta = (event: Event) => {
    this.eta = (event as CustomEvent<{ ride: string; status: string; seconds?: number }>).detail;
    const ride = this.active();
    if (ride && this.bridge.read().screen === "tracking") this.decorateTripSheet(ride);
  };
  /**
   * Rider trip sheet (Nov 2026, simplified at the product owner's request): one headline, the
   * captain with a large number plate, the pickup code (highlighted once they arrive), one row of
   * actions and a light link for trip details. The renderer's sample extras are hidden in CSS.
   */
  private decorateTripSheet(ride: Ride) {
    const sheet = this.app.querySelector<HTMLElement>(".screen-body > .sheet");
    if (!sheet) return;
    sheet.classList.add("live-trip-sheet");
    sheet.dataset.phase = ride.status;
    const name = ride.driver_name || "Your captain";
    const first = name.split(" ")[0];
    const minutes =
      this.eta?.ride === ride.id && this.eta.status === ride.status && Number.isFinite(this.eta.seconds)
        ? Math.max(1, Math.round((this.eta.seconds as number) / 60))
        : undefined;
    const set = (selector: string, text: string) => {
      const el = sheet.querySelector(selector);
      if (el && el.textContent !== text) el.textContent = text;
    };
    set(
      ".tracking-heading h2",
      ride.status === "in_progress"
        ? minutes
          ? `Arriving in ${minutes} min`
          : `Heading to ${ride.dropoff_label.split(",")[0]}`
        : ride.status === "arrived"
          ? `${first} is here`
          : minutes
            ? `${first} arrives in ${minutes} min`
            : `${first} is on the way`,
    );
    set(".driver-text strong", name);
    set(".driver-card .avatar", first.charAt(0).toUpperCase() || "C");
    const kind: Record<string, string> = { bike: "Bike", auto: "Auto-rickshaw", mini: "Mini cab", sedan: "Sedan", suv: "SUV" };
    set(".driver-text small", ride.status === "in_progress" ? `To ${ride.dropoff_label.split(",")[0]}` : kind[ride.vehicle_category] || "Your ride");
    set(".plate", ride.vehicle_number || "Plate pending");
    set(".pin-code strong", ride.pickup_code || "Waiting");
    set(".pin-code > span", ride.status === "arrived" ? "Share this code to start" : "Pickup code");
    set('.sheet > button.secondary[data-modal="cancel"]', "Trip details or cancel");
    // Hop originals: the fair wait clock and the pickup beacon, while the captain waits at the pickup.
    let extras = sheet.querySelector<HTMLElement>(".hop-trip-extras");
    if (!extras) {
      extras = document.createElement("div");
      extras.className = "hop-trip-extras";
      const anchor = sheet.querySelector(".pin-code");
      if (anchor) anchor.after(extras);
      else sheet.append(extras);
    }
    waitClock(extras, ride, "rider");
    riderBeacon(extras, ride);
  }
  /** A next-ride offer (or held next ride) for a captain who is on a trip. */
  private pendingNext() {
    return this.role === "captain" ? this.state?.offers?.find((o) => o.offer_kind === "next") : undefined;
  }
  /** Captain trip screen: the next ride on offer (accept/decline) or already held for them. */
  private nextRideCard(offer?: Ride) {
    let card = this.app.querySelector<HTMLElement>(".next-ride-card");
    const sheet = this.app.querySelector(".sheet .tracking-heading");
    if (!offer || !sheet) {
      card?.remove();
      return;
    }
    const fare = money(offer.fare_paise / 100);
    const html = offer.next_ride_held
      ? `<span class="badge green">Next ride booked</span><strong>Pickup: ${escape(offer.pickup_label)}</strong><p class="small muted">Starts when you complete this trip · ${fare}. The rider knows you’re coming next.</p>`
      : `<span class="badge">Next ride request</span><strong>${escape(offer.pickup_label)} → ${escape(offer.dropoff_label)}</strong><p class="small muted">Close to this drop-off · starts right after it · ${fare}</p><div class="next-ride-actions"><button class="primary" data-live-next="accept" ${this.busy ? "disabled" : ""}>Accept next ride</button><button class="secondary" data-live-next="decline" ${this.busy ? "disabled" : ""}>Decline</button></div>`;
    if (!card) {
      card = document.createElement("div");
      card.className = "section-card next-ride-card";
      card.setAttribute("role", "region");
      card.setAttribute("aria-label", "Next ride");
      sheet.after(card);
    }
    if (card.dataset.signature !== html) {
      card.dataset.signature = html;
      card.innerHTML = html;
    }
  }
  private countdownTimer?: ReturnType<typeof setInterval>;
  /** Captain request screen: seconds left in this captain's exclusive window to accept. */
  private offerCountdown(expiresAt?: string) {
    clearInterval(this.countdownTimer);
    this.countdownTimer = undefined;
    const sheet = this.app.querySelector(".driver-sheet");
    let line = this.app.querySelector<HTMLElement>(".offer-countdown");
    const until = expiresAt ? Date.parse(expiresAt) : NaN;
    if (!sheet || !Number.isFinite(until)) {
      line?.remove();
      return;
    }
    if (!line) {
      line = document.createElement("p");
      line.className = "fineprint offer-countdown";
      line.setAttribute("aria-live", "off");
      sheet.appendChild(line);
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      if (line) line.textContent = left > 0 ? `Only you have this request · ${left} s to accept` : "Time’s up · checking for the next request";
      if (!left) clearInterval(this.countdownTimer);
    };
    tick();
    this.countdownTimer = setInterval(tick, 1000);
  }
  private click = (event: Event) => {
    const button = (event.target as Element)?.closest<HTMLElement>(
      "button,a,[data-go]",
    );
    if (!button) return;
    if (button.dataset.hopBeacon) {
      this.stop(event);
      const ride = this.active();
      if (button.dataset.hopBeacon === "on" && ride) showBeacon(document.body, ride);
      else document.querySelector(".hop-beacon")?.remove();
      return;
    }
    if (this.app.querySelector("[data-captain-onboarding]")) return;
    if (this.payment) return;
    if (
      this.role === "captain" &&
      (button.dataset.go === "onboarding" ||
        button.hasAttribute("data-live-onboard"))
    ) {
      this.stop(event);
      this.onboardingDismissed = false;
      this.bridge.go("onboarding");
      return;
    }
    if (button.dataset.go === "search" && this.bridge.read().screen === "home")
      this.startCityRide();
    if (button.dataset.triptype) {
      this.stop(event);
      this.booking.tripType = button.dataset.triptype!;
      this.bridge.assign({ tripType: this.booking.tripType });
      this.bridge.go("plan");
      return;
    }
    if (button.dataset.liveNext) {
      this.stop(event);
      stopOfferAlert();
      const offer = this.pendingNext();
      void this.run(async () => {
        if (!offer) throw new Error("This next ride is no longer available.");
        await api.session();
        if (button.dataset.liveNext === "accept") await api.action(offer.id, offer.version, "accept");
        else await api.request(`/api/rides/${offer.id}/decline`, {});
        this.sync(await api.state());
      });
      return;
    }
    if (button.hasAttribute("data-live-retry-plan")) {
      this.stop(event);
      void this.plan();
      return;
    }
    if (button.dataset.liveRecover) {
      this.stop(event);
      const state = this.recovery;
      this.recovery = undefined;
      this.bridge.update({ modal: null });
      if (state === "expired") {
        void this.run(async () => {
          if (!this.pickup || !this.dropoff)
            throw new Error("Choose your pickup and destination again.");
          this.quoteOptionsKey = JSON.stringify(this.booking.quoteOptions());
          this.quote = await api.quote(
            this.area()!.id,
            this.bridge.read().vehicle,
            this.pickup,
            this.dropoff,
            this.booking.quoteOptions(),
          );
          this.bridge.go("confirm");
        });
      } else if (state === "offline")
        void this.run(async () => this.sync(await api.state()));
      else if (state === "cancelled" && this.role === "rider")
        this.cancelRiderRide();
      else
        this.bridge.go(
          state === "location"
            ? "search"
            : state === "taken"
              ? "drive"
              : state === "alerts"
                ? "notifications"
                : state === "drivers"
                  ? "choose"
                  : this.role === "rider"
                    ? "home"
                    : "activity",
        );
      return;
    }
    if (button.dataset.liveRidePayment) {
      this.stop(event);
      const ride = this.state?.rides.find(
        (r) => r.id === button.dataset.liveRidePayment,
      );
      if (ride) this.openPayment(ride);
      return;
    }
    if (button.dataset.payment) this.paymentChosen = true;
    if (button.dataset.modal === "payment") {
      void api
        .request<{ balance_paise: number }>("/api/wallet")
        .then((wallet) => {
          this.walletBalance = wallet.balance_paise;
          this.decorate();
        })
        .catch(() => {});
    }

    if (button.hasAttribute("data-live-login")) {
      this.stop(event);
      this.bridge.go("auth");
      return;
    }
    if (button.dataset.livePlace !== undefined) {
      this.stop(event);
      void this.run(() =>
        this.select(this.results[Number(button.dataset.livePlace)]),
      );
      return;
    }
    if (button.dataset.destination) {
      this.stop(event);
      if (this.bridge.read().screen === "home") this.startCityRide();
      this.target = "dropoff";
      const saved = this.state?.saved_locations?.find(
        (p) =>
          p.kind.toLowerCase() === button.dataset.destination!.toLowerCase() ||
          p.label.toLowerCase() === button.dataset.destination!.toLowerCase(),
      );
      if (saved) {
        void this.run(() =>
          this.select({ ...saved, label: saved.place_label || saved.label }),
        );
      } else {
        this.bridge.go("search");
        this.bridge.notify(
          `Choose your saved ${button.dataset.destination} address or search for its street address.`,
        );
      }
      return;
    }
    if (button.dataset.message || button.dataset.chatRetry || button.dataset.chatDiscard || button.dataset.chatOlder !== undefined) {
      this.stop(event);
      this.rideChat.click(button);
      return;
    }
    if (button.dataset.vehicle && this.bridge.read().screen === "choose") {
      if (this.estimates[button.dataset.vehicle] === undefined) {
        this.stop(event);
        return;
      }
      this.quote = undefined;
      this.bookingPayload = undefined;
      queueMicrotask(() => this.decorate());
      return;
    }
    if (button.dataset.liveRouteIndex !== undefined) {
      this.stop(event);
      this.booking.routeIndex = Number(button.dataset.liveRouteIndex);
      this.quote = undefined;
      this.bookingPayload = undefined;
      void this.plan();
      return;
    }
    if (button.dataset.routeAlt) {
      this.stop(event);
      this.bridge.notify(
        "This is the recommended road route.",
      );
      return;
    }
    if (button.dataset.modal === "pickup") {
      this.stop(event);
      this.target = "pickup";
      this.bridge.go("search");
      this.app.querySelector<HTMLInputElement>("#pickup-input")?.focus();
      return;
    }
    if (button.dataset.modal === "navigation") {
      this.stop(event);
      this.bridge.notify(
        this.navigation && !this.navigation.stale
          ? this.navigation.steps?.[0]?.instruction || "Follow the marked route"
          : "Waiting for current road guidance",
      );
      return;
    }
    if (button.dataset.go === "notifications") {
      setTimeout(() => {
        this.decorate();
        void this.loadNotices();
      }, 0);
      return;
    }
    if (button.dataset.noticeFilter) {
      this.stop(event);
      this.noticeFilter = button.dataset.noticeFilter;
      this.renderNotices();
      this.app.querySelector<HTMLButtonElement>(`[data-notice-filter="${this.noticeFilter}"]`)?.focus();
      return;
    }
    const readOne = (event.target as Element).closest<HTMLElement>("[data-notice-read]");
    if (readOne) {
      this.stop(event);
      void this.readNotice(readOne.dataset.noticeRead!);
      return;
    }
    const action = button.dataset.action;
    if (action === "retry-notifications") {
      this.stop(event);
      void this.loadNotices();
      return;
    }
    if (action === "online" && this.role === "captain") {
      this.stop(event);
      void this.run(async () => {
        const current = await api.state();
        const driver = current.driver[0];
        if (driver?.status !== "approved") {
          this.sync(current);
          this.onboardingDismissed = false;
          this.bridge.go("onboarding");
          throw new Error("Operator approval is required before driving.");
        }
        try {
          await api.online(!driver.online);
        } catch (error) {
          // A zone that needs a monthly pass: take the captain to Earnings, where they can get one.
          if (!driver.online && /monthly pass/i.test((error as Error).message)) this.bridge.go("earnings");
          throw error;
        }
        // The map starts or stops location sharing and plays the matching sound.
        window.dispatchEvent(new CustomEvent("hop-captain-online", { detail: !driver.online }));
        try {
          this.sync(await api.state());
        } catch {
          // Gracefully continue if initial state fetch fails
        }
      });
      return;
    }
    this.lastAction = action || "";
    if (!action) return;
    if (
      [
        "simulate-other-captain-accept",
        "preview-captain-notification",
        "switch-to-captain-pickup",
        "autofill-otp",
        "view-next-offer",
      ].includes(action)
    ) {
      this.stop(event);
      this.bridge.notify(
        "Your ride updates as soon as Hop confirms each step.",
      );
      return;
    }
    if (action === "external-nav") {
      this.stop(event);
      const ride = this.active();
      if (!ride) return;
      const going = ride.status === "in_progress" ? { lat: ride.dropoff_lat, lng: ride.dropoff_lng } : { lat: ride.pickup_lat, lng: ride.pickup_lng };
      // Google Maps' own app opens this link with voice turn-by-turn; Hop keeps tracking the trip.
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${going.lat},${going.lng}&travelmode=${ride.vehicle_category === "bike" ? "two-wheeler" : "driving"}&dir_action=navigate`, "_blank");
      return;
    }
    if (action === "toggle-cockpit") {
      this.stop(event);
      if (
        !this.active() ||
        !["pickup", "trip"].includes(this.bridge.read().screen)
      ) {
        this.bridge.notify(
          "Cockpit guidance is available during an assigned Captain trip.",
        );
        return;
      }
      this.bridge.update({ cockpitMode: !this.bridge.read().cockpitMode });
      return;
    }
    if (action === "home-mode") {
      this.stop(event);
      void this.run(async () => {
        const driver = this.state?.driver?.[0] as any;
        if (driver?.home_until && Date.parse(driver.home_until) > Date.now())
          await api.request("/api/drivers/go-home", { off: true });
        else {
          const point = await currentLocation();
          await api.request("/api/drivers/go-home", {
            lat: point.latitude,
            lng: point.longitude,
          });
        }
        try {
          this.sync(await api.state());
        } catch {
          // Gracefully continue if initial state fetch fails
        }
      });
      return;
    }
    if (action === "take-break") {
      this.stop(event);
      void this.run(async () => {
        await api.online(false);
        try {
          this.sync(await api.state());
        } catch {
          // Gracefully continue if initial state fetch fails
        }
      });
      return;
    }
    if (action === "meeting-map") {
      this.stop(event);
      this.bridge.update({ modal: null });
      return;
    }
    if (action === "refresh-sample-quote") {
      this.stop(event);
      this.bridge.update({ modal: null });
      this.quote = undefined;
      this.bridge.go("choose");
      void this.plan();
      return;
    }
    if (action === "demo-login") {
      this.authError = "";
      this.stop(event);
      void this.run(async () => {
        if (!this.codeSent) {
          if (!/^[6-9]\d{9}$/.test(this.phone))
            throw new Error("Enter a valid 10-digit Indian mobile number.");
          const result = await api.requestOtp(this.phone);
          this.codeSent = true;
          this.devCode = result.dev_code || (this.isDevMode() ? "123456" : "");
          if (this.devCode) {
            this.otp = this.devCode;
          }
          this.bridge.update({});
        } else {
          if (!/^\d{6}$/.test(this.otp))
            throw new Error("Enter the six-digit SMS code.");
          await api.verifyOtp(this.phone, this.otp);
          this.signedIn = true;
          this.devCode = "";
          try {
          this.sync(await api.state());
        } catch {
          // Gracefully continue if initial state fetch fails
        }
          this.bridge.go(this.role === "rider" ? "home" : "drive");
          this.bridge.assign({ back: [] });
        }
      });
      return;
    }
    if (action === "enable-device-notifications") {
      this.stop(event);
      void this.run(async () => {
        if ((await notificationStatus()) === "blocked") {
          await openNotificationSettings();
          this.bridge.notify("Turn on notifications for Hop, then come back.");
          return;
        }
        await enableNotifications();
        this.alertState = "on";
        this.bridge.notify("Phone alerts are on.");
      });
      return;
    }
    if (action === "demo-signout") {
      this.stop(event);
      void this.run(async () => {
        await disableNotifications().catch(() => {});
        await api.request("/auth/logout", {});
        this.signedIn = false;
        this.state = undefined;
        this.account.clear();
        this.booking.reset();
        this.pickup = undefined;
        this.dropoff = undefined;
        this.invalidate();
        this.notices = [];
        this.rideChat.close();
        this.codeSent = false;
        this.phone = "";
        this.otp = "";
        this.bridge.go("auth");
      });
      return;
    }
    if (action === "usual-ride" || action === "rebook") {
      this.stop(event);
      this.startCityRide();
      this.bridge.go("search");
      this.bridge.notify(
        "Choose your pickup and destination to see the fare.",
      );
      return;
    }
    if (action === "current-location") {
      this.stop(event);
      void this.run(async () => {
        const coords = await currentLocation();
        window.dispatchEvent(new CustomEvent("hop-current-location", { detail: {
          lat: coords.latitude, lng: coords.longitude, heading: coords.heading ?? undefined,
        } }));
        this.target = "pickup";
        let label = "Current location";
        try {
          label = (
            await api.request<{ label: string }>(
              `/api/places/reverse?lat=${coords.latitude}&lng=${coords.longitude}`,
            )
          ).label;
        } catch {}
        await this.select({
          lat: coords.latitude,
          lng: coords.longitude,
          label,
        });
      });
      return;
    }
    if (action === "save-plan") {
      this.stop(event);
      void this.run(async () => {
        this.bridge.go("plan");
      });
      return;
    }
    if (action === "review") {
      this.stop(event);
      void this.run(async () => {
        if (!this.pickup || !this.dropoff || !this.route)
          throw new Error(
            "Choose a pickup and destination and wait for the road route.",
          );
        const revision = this.routeSequence;
        const ui = this.bridge.read();
        const quote = await api.quote(
          this.area()!.id,
          ui.vehicle,
          this.pickup,
          this.dropoff,
          this.booking.quoteOptions(),
        );
        if (
          revision !== this.routeSequence ||
          ui.vehicle !== this.bridge.read().vehicle
        )
          return;
        this.quote = quote;
        this.quoteOptionsKey = JSON.stringify(this.booking.quoteOptions());
        this.bookingPayload = undefined;
        this.requestKey = crypto.randomUUID();
        this.bridge.go("confirm");
      });
      return;
    }
    if (action === "request") {
      this.stop(event);
      void this.run(async () => {
        const ui = this.bridge.read();
        if (!this.quote)
          throw new Error(
            "Get an updated fare before requesting a ride.",
          );
        if (
          this.quoteOptionsKey !== JSON.stringify(this.booking.quoteOptions())
        )
          throw new Error(
            "Ride options changed. Review the updated fare before booking.",
          );
        const payment = String(ui.payment).toLowerCase();
        const options = this.booking.rideOptions(this.quote);
        if (this.booking.scheduleAt) {
          if (
            this.booking.tripType !== "city" ||
            !["cash", "upi"].includes(payment)
          )
            throw new Error("Scheduling supports city rides with Cash or UPI.");
          if (!this.pickup || !this.dropoff)
            throw new Error("Select both locations.");
          const scheduledPayload = {
            category: ui.vehicle,
            pickup_lat: this.pickup.lat,
            pickup_lng: this.pickup.lng,
            pickup_label: this.pickup.label,
            dropoff_lat: this.dropoff.lat,
            dropoff_lng: this.dropoff.lng,
            dropoff_label: this.dropoff.label,
            scheduled_for: new Date(this.booking.scheduleAt).toISOString(),
            payment_method: payment,
          };
          const account = (await api.session()).user.id;
          const pendingKey = `hop.schedule.pending:${account}:${JSON.stringify(scheduledPayload)}`;
          if (sessionStorage.getItem(pendingKey))
            throw new Error(
              "This schedule may already exist. Check Upcoming rides before scheduling again.",
            );
          sessionStorage.setItem(pendingKey, "creating");
          try {
            await api.request("/api/scheduled-rides", scheduledPayload);
            sessionStorage.setItem(pendingKey, "submitted");
          } catch (e) {
            if (
              e instanceof APIError &&
              [400, 401, 403, 409, 422].includes(e.status)
            )
              sessionStorage.removeItem(pendingKey);
            throw e;
          }
          this.quote = undefined;
          this.bridge.go("activity");
          this.bridge.notify(
            "Scheduled ride saved. Fare is re-quoted at dispatch.",
          );
          return;
        }
        const payload = { quote: this.quote.id, payment, options };
        if (
          this.bookingPayload &&
          JSON.stringify(payload) !== JSON.stringify(this.bookingPayload)
        )
          this.requestKey = crypto.randomUUID();
        this.bookingPayload = payload;
        try {
          await api.bookRide(payload.quote, this.requestKey, payment, options);
        } catch (e) {
          // An unpaid earlier ride blocks booking. Open its payment screen so the rider can
          // settle it (or see that it's waiting for the captain) instead of a passing message.
          if (e instanceof APIError && e.status === 402 && e.details.code === "payment_required" && typeof e.details.ride_id === "string") {
            const state = await api.state().catch(() => undefined);
            if (state) this.sync(state);
            const unpaid = this.state?.rides.find((r) => r.id === e.details.ride_id);
            if (unpaid) {
              this.openPayment(unpaid);
              this.bridge.notify("Settle your last ride before booking another. If you paid your captain in cash, ask them to record it.");
              return;
            }
          }
          throw e;
        }
        this.bridge.update({ phase: "requested" });
        this.bridge.go("matching");
        try {
          this.sync(await api.state());
        } catch {
          // Gracefully continue if initial state fetch fails
        }
      });
      return;
    }
    if (this.role === "rider" && action === "cancel-ride") {
      this.stop(event);
      const ride = this.active();
      if (ride) {
        void this.run(async () => {
          await api.session();
          await api.action(ride.id, ride.version, "cancel", {
            reason: "Plans changed",
          });
          this.cancelRiderRide();
          try {
          this.sync(await api.state());
        } catch {
          // Gracefully continue if initial state fetch fails
        }
        });
      }
      return;
    }
    if (
      [
        "accept",
        "decline",
        "arrive",
        "start-trip",
        "complete-trip",
        "cancel-ride",
      ].includes(action)
    ) {
      this.stop(event);
      if (action === "accept" || action === "decline") stopOfferAlert();
      void this.run(async () => {
        await api.session();
        const state = await api.state();
        this.state = state;
        const ride =
          action === "accept" || action === "decline"
            ? state.offers?.[0]
            : this.active();
        if (!ride) throw new Error("This ride is no longer available.");
        if (action === "decline")
          await api.request(`/api/rides/${ride.id}/decline`, {});
        else {
          const name =
            (
              {
                "start-trip": "start",
                "complete-trip": "complete",
                "cancel-ride": "cancel",
              } as Record<string, string>
            )[action] || action;
          const code = [0, 1, 2, 3, 4, 5]
            .map(
              (i) =>
                this.app.querySelector<HTMLInputElement>(`#pin-${i}`)?.value ||
                "",
            )
            .join("");
          if (name === "start" && !/^\d{6}$/.test(code))
            throw new Error("Enter the rider’s six-digit pickup code.");
          const send = (confirm: boolean) =>
            api.action(ride.id, ride.version, name, {
              ...(name === "start" ? { code } : {}),
              ...(confirm ? { confirm: true } : {}),
              ...(name === "cancel" ? { reason: "Plans changed" } : {}),
            });
          if (name === "complete") {
            // Ask the server first: far from the drop-off it answers 409 "Early finish…" with the
            // reduced fare. Show the captain that and complete only if they agree.
            try {
              await send(false);
            } catch (error) {
              if (!(error instanceof APIError && error.status === 409 && /early finish/i.test(error.message))) throw error;
              if (!window.confirm(`${error.message}\n\nComplete the trip here?`)) return;
              await send(true);
            }
          } else await send(false);
        }
        try {
          this.sync(await api.state());
        } catch {
          // Gracefully continue if initial state fetch fails
        }
      });
      return;
    }
    if (action === "read-all") {
      this.stop(event);
      void this.run(async () => {
        await api.request("/api/notifications/read", {});
        this.notices = this.notices.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }));
        this.renderNotices();
        this.bridge.notify("Notifications marked as read.");
      });
      return;
    }
    if (
      ![
        "back",
        "close-modal",
        "meeting-chat",
        "center-map",
        "receipt-done",
      ].includes(action)
    ) {
      this.stop(event);
      this.bridge.notify(
        "This option isn’t available yet. Nothing was changed.",
      );
    }
  };
  private serverState = (event: Event) =>
    this.sync((event as CustomEvent<State>).detail);
  private sync(state: State) {
    if (this.payment) {
      this.state = state;
      const ride = state.rides.find(
        (r) => r.id === this.app.dataset.livePayment,
      );
      if (ride) this.payment.update(ride);
      return;
    }
    this.signedIn = true;
    const wasApproved = this.state?.driver?.[0]?.status === "approved";
    this.state = state;
    if (this.role === "captain" && !wasApproved && state.driver?.[0]?.status === "approved" && this.bridge.read().screen === "onboarding") this.bridge.go("drive");
    const ride = this.active();
    if (this.role === "rider" && ride?.status === "requested") startSearchingSound();
    else stopSearchingSound();
    // Sounds mark changes the person didn't make themselves; the first load after opening the
    // app stays quiet so an ongoing trip doesn't replay "captain found".
    const announce = this.synced;
    this.synced = true;
    const nextOffer = this.pendingNext();
    if (this.role === "captain" && (ride ? !nextOffer || nextOffer.next_ride_held : !state.offers?.length)) stopOfferAlert();
    if (this.role === "captain" && ride && nextOffer && !nextOffer.next_ride_held && !this.offersSeen.has(nextOffer.id)) {
      this.offersSeen.add(nextOffer.id);
      startOfferAlert();
    }
    if (ride) {
      const revision = `${ride.id}:${ride.status}`;
      if (revision !== this.seenRide) {
        // A captain's next ride starts the moment they complete a trip: settle that trip's
        // payment first, then head to the next pickup.
        const previous = this.seenRide.split(":")[0];
        const finished =
          this.role === "captain" && previous && previous !== ride.id
            ? state.rides?.find((r) => r.id === previous && r.status === "completed")
            : undefined;
        this.seenRide = revision;
        if (finished) {
          this.bridge.update({ phase: ride.status, pickup: ride.pickup_label, destination: ride.dropoff_label, vehicle: ride.vehicle_category, payment: ride.payment_method });
          this.openPayment(finished, () => this.bridge.go("pickup"));
          this.bridge.notify(`Next ride starts now · after this payment, head to ${ride.pickup_label}`);
          return;
        }
        if (announce && this.role === "captain" && ride.status === "accepted")
          acceptRideSound();
        if (announce && this.role === "rider")
          ({ accepted: captainFoundSound, arrived: captainArrivedSound, in_progress: tripStartedSound } as Record<string, () => void>)[ride.status]?.();
        if (announce) this.pendingMoment = ride.status;
        this.bridge.update({
          phase: ride.status,
          pickup: ride.pickup_label,
          destination: ride.dropoff_label,
          vehicle: ride.vehicle_category,
          payment: ride.payment_method,
        });
        this.bridge.go(
          this.role === "rider"
            ? ride.status === "requested"
              ? "matching"
              : "tracking"
            : (
                {
                  accepted: "pickup",
                  arrived: "otp",
                  in_progress: "trip",
                } as Record<string, string>
              )[ride.status] || "drive",
        );
        if (this.pendingMoment) {
          const chips: Record<string, Record<string, string>> = {
            rider: { accepted: "Captain found", arrived: "Your captain is here", in_progress: "Trip started" },
            captain: { accepted: "Ride accepted", arrived: "You’ve arrived", in_progress: "Trip started" },
          };
          playMoment(this.app, this.pendingMoment, chips[this.role][this.pendingMoment]);
          this.pendingMoment = "";
        }
      }
    } else if (this.seenRide) {
      const previous = state.rides?.find(
        (r) => r.id === this.seenRide.split(":")[0],
      );
      const finished = state.rides?.find(
        (r) => r.id === this.seenRide.split(":")[0] && r.status === "completed",
      );
      this.seenRide = "";
      if (finished || this.role === "captain") this.clearPlan();
      if (finished) {
        if (this.role === "rider") tripCompleteSound();
        this.bridge.assign({ phase: "completed" });
        this.openPayment(finished);
        return;
      }
      if (previous?.status === "cancelled" || previous?.status === "expired") rideCancelledSound();
      if (this.role === "rider") {
        if (previous?.status === "cancelled") {
          this.cancelRiderRide();
          return;
        }
        this.bridge.update({ phase: "none" });
        this.bridge.go("home");
        if (previous?.status === "expired") this.showRecovery("drivers");
      } else {
        this.bridge.update({ phase: "none" });
        this.bridge.go("drive");
        if (previous?.status === "expired") this.showRecovery("drivers");
        if (previous?.status === "cancelled") this.showRecovery("cancelled");
      }
    }
    if (this.role === "captain" && !ride && state.offers?.length) {
      const offer = state.offers[0];
      if (!this.offersSeen.has(offer.id)) {
        this.offersSeen.add(offer.id);
        startOfferAlert();
        this.bridge.update({
          pickup: offer.pickup_label,
          destination: offer.dropoff_label,
          vehicle: offer.vehicle_category,
          payment: offer.payment_method,
          offerIndex: 0,
        });
        const pickup = { lat: offer.pickup_lat, lng: offer.pickup_lng };
        const dropoff = { lat: offer.dropoff_lat, lng: offer.dropoff_lng };
        window.dispatchEvent(
          new CustomEvent("hop-planned-route", {
            detail: {
              center: pickup,
              vehicles: [],
              pickup,
              dropoff,
              route: offer.route,
            },
          }),
        );
        this.bridge.go("request");
        this.bridge.notify(
          "New ride request received. Review the pickup and fare.",
        );
      }
    }
    this.decorate();
  }
  private savedDark?: boolean;
  private rememberAppearance() {
    const dark = Boolean(this.bridge.read().toggled?.dark);
    if (dark === this.savedDark) return;
    this.savedDark = dark;
    try { localStorage.setItem("hop-dark", dark ? "1" : "0"); } catch {}
  }
  private decorate() {
    this.rememberAppearance();
    if (this.sessionChecked && !this.signedIn && this.bridge.read().screen !== "auth") {
      this.bridge.go("auth");
      return;
    }
    // The payment page owns the screen until it closes; if a re-render drew over it, restore it.
    if (this.payment) {
      this.payment.ensureShown();
      return;
    }
    // The design preview's "Simulate: taken by another captain" control would show a made-up
    // state; live apps learn that from the server's 409 on accept instead.
    this.app.querySelectorAll('[data-modal="ride-taken"]').forEach((el) => el.remove());
    // A trip screen with no live trip behind it would show the design preview's sample captain
    // and pickup code. Go to the finished ride's payment, or home, instead.
    const tripScreens = this.role === "rider" ? ["matching", "tracking"] : ["pickup", "otp", "trip"];
    if (this.state && !this.busy && !this.payment && !this.active() && tripScreens.includes(this.bridge.read().screen)) {
      const unpaid = this.state.rides.find((r) => r.mine !== false && r.status === "completed" && !["paid_online", "driver_reported_received", "rider_reported_paid"].includes(r.payment_status ?? ""));
      this.seenRide = "";
      this.clearPlan();
      if (unpaid) {
        this.bridge.assign({ phase: "completed" });
        this.openPayment(unpaid);
      } else {
        this.bridge.update({ phase: "none" });
        this.bridge.go(this.role === "rider" ? "home" : "drive");
      }
      return;
    }
    if (this.role === "captain" && this.signedIn && this.state?.driver?.[0]?.status !== "approved") {
      if (this.bridge.read().screen !== "onboarding") {
        if (!this.onboardingDismissed) {
          this.bridge.go("onboarding");
          return;
        }
      } else {
        this.app.querySelectorAll<HTMLElement>('.bottom-nav').forEach(el => { el.remove(); });
      }
    }
    if (this.role === "captain") {
      enhanceSlides(this.app);
      const screenNow = this.bridge.read().screen, ride = this.active();
      const host = screenNow === "pickup" ? this.app.querySelector(".screen-body > .sheet") : screenNow === "otp" ? this.app.querySelector(".screen-padding") : null;
      if (host) {
        let extras = host.querySelector<HTMLElement>(".hop-trip-extras");
        if (!extras) {
          extras = document.createElement("div");
          extras.className = "hop-trip-extras";
          const anchor = host.querySelector(".tracking-heading, .empty-state");
          if (anchor) anchor.after(extras);
          else host.prepend(extras);
        }
        waitClock(extras, ride, "captain");
        captainBeaconHint(extras, ride);
      }
      // On the trip the rider is in the vehicle: no Message button (safety and navigation stay).
      this.app.querySelectorAll<HTMLElement>('.circle-actions [data-go="chat"]').forEach((b) => (b.style.display = screenNow === "trip" ? "none" : ""));
    }
    this.booking?.render();
    this.account?.render();
    if (this.role === "captain" && this.bridge.read().screen === "onboarding") {
      this.onboarding ||= new CaptainOnboarding(
        this.app,
        this.bridge,
        () => this.config,
        () => this.state,
        async () => this.sync(await api.state()),
        () => {
          this.onboardingDismissed = true;
          this.bridge.back();
        },
      );
      this.onboarding.sync();
      return;
    }
    if (this.app.dataset.livePayment) return;
    if (this.recovery && this.bridge.read().modal === "live-recovery") {
      const panel = this.app.querySelector(".modal-sheet"),
        state = recoveryStates[this.recovery];
      if (panel)
        panel.innerHTML = `<div class="sheet-handle"></div><div class="modal-title"><h2 id="modal-title">${state.title}</h2><button class="icon-button" aria-label="Close dialog" data-action="close-modal">×</button></div><section class="state-preview-card"><div class="payment-state-symbol">${state.symbol}</div><p>${state.copy}</p></section><button class="primary" data-live-recover="continue">${state.action}</button>`;
    }
    const screen = this.bridge.read().screen;
    if (this.role === "captain") {
      const driver = this.state?.driver[0];
      const area = this.config?.areas.find((a) => a.id === driver?.area_id);
      const jurisdiction = area?.name || "Choose an operating city";
      this.bridge.assign({
        driverApproved: driver?.status === "approved",
        driverStatus: driver?.status || "not_applied",
        online: driver?.status === "approved" && !!driver.online,
        serviceArea: jurisdiction,
      });

      this.app
        .querySelectorAll<HTMLElement>('[data-modal="service-area"]')
        .forEach((button) => {
          if (button.classList.contains("zone-pill"))
            button.innerHTML = `${icon("navigation", "tiny-icon")} City: ${escape(jurisdiction)} <span class="badge green" style="font-size:8px;padding:2px 6px">City</span>`;
          else {
            const detail = button.querySelector("small");
            if (detail) detail.textContent = jurisdiction;
          }
        });

      const existingBanner = this.app.querySelector(".onboarding-banner");
      if (existingBanner)
        existingBanner.innerHTML = `<div class="row"><strong>Complete onboarding to go online</strong><span>→</span></div><p class="micro">Submit your documents for operator approval.</p>`;
      const duty = this.app.querySelector<HTMLElement>(
        '[data-action="online"]',
      );
      if (duty && this.state) {
        if (driver?.status !== "approved") {
          duty.setAttribute("data-live-onboard", "");
          duty.textContent =
            driver?.status === "pending"
              ? "Application under review"
              : driver?.status === "suspended"
                ? "View suspension details"
                : "Complete Captain onboarding";
        } else {
          duty.removeAttribute("data-live-onboard");
          duty.textContent = driver.online ? "Online" : "Go online";
          // Compact redesign (Nov 2026): an approved captain's online control is a small switch in
          // the header instead of a full-width bar. Same button, same handlers, just moved.
          duty.classList.add("hop-duty-switch");
          duty.setAttribute("aria-pressed", String(Boolean(driver.online)));
          duty.classList.toggle("is-online", Boolean(driver.online));
          const tools = this.app.querySelector(".app-head .head-tools");
          if (tools && duty.parentElement !== tools) tools.prepend(duty);
        }
      }

      if (screen === "drive" && driver?.status !== "approved") {
        const sheet = this.app.querySelector(".sheet");
        if (sheet && !sheet.querySelector(".onboarding-banner")) {
          const banner = document.createElement("div");
          banner.className = "notice-box onboarding-banner";
          banner.style.cssText =
            "margin:8px 0 12px;cursor:pointer;background:var(--accent-warm,#fef7e6);border:1px solid #c9c5f7;color:#8a6e2b";
          banner.setAttribute("data-go", "onboarding");
          banner.innerHTML = `<div class="row"><strong>Complete onboarding to go online</strong><span style="font-size:12px">→</span></div><p class="micro" style="margin-top:2px">Submit your documents for operator approval.</p>`;
          const handle = sheet.querySelector(".sheet-handle");
          if (handle && handle.nextSibling) {
            sheet.insertBefore(banner, handle.nextSibling);
          } else {
            sheet.prepend(banner);
          }
        }
      }

      if (this.bridge.read().modal === "service-area") {
        const panel = this.app.querySelector(".modal-sheet");
        if (panel && !panel.querySelector("[data-live-state]"))
          panel.innerHTML = driver?.status === "approved"
            ? `<div data-live-state><div class="sheet-handle"></div><div class="modal-title"><h2>Operating city</h2><button class="icon-button" aria-label="Close dialog" data-action="close-modal">×</button></div><div class="section-card"><div class="row"><div><small class="muted">YOU DRIVE IN</small><strong style="display:block;margin-top:2px">${escape(jurisdiction)}</strong></div><span class="badge green">Approved</span></div><p class="micro muted" style="margin-top:6px">You get ride requests anywhere in this city.</p></div><div class="notice-box">Want to drive in another city? Hop support can move your account. Your documents stay approved.</div><button class="primary" data-go="support">Contact support</button></div>`
            : `<div data-live-state><div class="sheet-handle"></div><div class="modal-title"><h2>Operating city</h2><button class="icon-button" aria-label="Close dialog" data-action="close-modal">×</button></div><div class="section-card"><div class="row"><div><small class="muted">OPERATING CITY</small><strong style="display:block;margin-top:2px">${escape(jurisdiction)}</strong></div><span class="badge green">City</span></div><p class="micro muted" style="margin-top:6px">Your application uses a configured operating city. No neighbourhood-zone approvals.</p><p class="small muted">Captain status: ${escape(driver?.status || "Not applied")}</p></div><div class="notice-box">Captain and document approval is required before driving. The backend enforces the configured service area.</div><button class="primary" data-go="onboarding">${driver?.status === "approved" ? "View Captain Application" : "Complete Captain Onboarding"}</button></div>`;
      }
    }
    if (
      !this.signedIn &&
      screen !== "auth" &&
      !this.app.querySelector("[data-live-login]")
    ) {
      const host =
        this.app.querySelector(".head-tools") ||
        this.app.querySelector(".app-head");
      if (host) {
        const login = document.createElement("button");
        login.className = "badge neutral";
        login.setAttribute("data-live-login", "");
        login.textContent = "Sign in";
        host.append(login);
      }
    } else if (this.signedIn || screen === "auth")
      this.app.querySelector("[data-live-login]")?.remove();
    const statusBadge = this.app.querySelector(".app-head > .badge");
    if (statusBadge)
      statusBadge.textContent =
        screen === "auth"
          ? (this.isDevMode() ? "Development" : "Secure sign-in")
          : (this.isDevMode() ? "Live (Dev)" : "Live");
    this.app
      .querySelectorAll<HTMLElement>(".shortcut[data-destination]")
      .forEach((button) => {
        const name = button.dataset.destination!.toLowerCase();
        const saved = this.state?.saved_locations?.find(
          (p) => p.kind.toLowerCase() === name,
        );
        const detail = button.querySelector("small");
        const place = saved?.place_label || "Choose your saved address";
        if (detail) detail.textContent = place;
        // The compact home tiles hide the address, so keep it in the button's name.
        button.setAttribute("aria-label", `${button.dataset.destination} · ${place}`);
      });
    if (screen === "auth") {
      const phone = this.app.querySelector<HTMLInputElement>("#demo-phone");
      if (phone) phone.value = this.phone;
      if (this.codeSent && !this.app.querySelector("#live-login-code")) {
        const label = document.createElement("label");
        label.className = "field-label";
        label.htmlFor = "live-login-code";
        label.textContent = "Six-digit SMS code";
        const code = document.createElement("input");
        code.className = "text-input";
        code.id = "live-login-code";
        code.inputMode = "numeric";
        code.autocomplete = "one-time-code";
        code.maxLength = 6;
        code.value = this.otp;
        (phone?.closest(".login-phone") || phone)?.after(label, code);
      } else if (this.app.querySelector<HTMLInputElement>("#live-login-code")) {
        const code = this.app.querySelector<HTMLInputElement>("#live-login-code")!;
        if (!code.value && this.otp) {
          code.value = this.otp;
        }
      }
      const notice = this.app.querySelector(".notice-box");
      if (notice) {
        notice.classList.toggle("payment-error", !!this.authError);
        if (this.authError) notice.setAttribute("role", "alert");
        else notice.removeAttribute("role");
      }
      if (notice)
        notice.textContent =
          this.authError ||
          (this.devCode
            ? `Development SMS code: ${this.devCode}`
            : this.codeSent
              ? "Enter the code sent to your mobile number."
              : this.isDevMode()
                ? "Development mode · Enter your mobile number to sign in."
                : "Sign in securely to your existing Hop account.");
      const action = this.app.querySelector<HTMLButtonElement>(
        '[data-action="demo-login"]',
      );
      if (action) {
        action.disabled = this.busy;
        if (action.firstChild)
          action.firstChild.textContent = this.codeSent
            ? "Verify & continue"
            : "Send sign-in code";
      }
    }
    if (this.bridge.read().modal === "cancel") {
      const panel = this.app.querySelector(".modal-sheet");
      if (panel) {
        const button = panel.querySelector('[data-action="cancel-ride"]');
        if (button?.firstChild)
          button.firstChild.textContent = "Confirm cancellation";
        const info = panel.querySelector("p");
        if (info)
          info.textContent =
            "Your request is cancelled only after Hop confirms it. Your Captain will receive the update.";
      }
    }
    if (this.bridge.read().modal === "payment") {
      const panel = this.app.querySelector(".modal-sheet");
      const title = panel?.querySelector(".modal-title");
      const key = JSON.stringify([
        this.bridge.read().payment,
        this.walletBalance,
      ]);
      if (panel && title && panel.getAttribute("data-methods") !== key) {
        panel.setAttribute("data-methods", key);
        while (title.nextSibling) title.nextSibling.remove();
        panel.insertAdjacentHTML(
          "beforeend",
          `<p class="small muted" style="margin-bottom:15px">Choose how you’d like to pay for your ride.</p>${paymentMethods(this.bridge.read().payment, this.walletBalance, "data-payment")}<p class="fineprint">Hop checks your wallet balance when you request the ride.</p>`,
        );
      }
    }
    if (screen === "search") {
      const pickupField = this.app.querySelector<HTMLInputElement>("#pickup-input");
      if (pickupField) {
        pickupField.placeholder = "Search a place or address";
        pickupField.autocomplete = "off";
      }
      const fields = this.app.querySelector(".route-fields");
      if (this.role !== "rider" && fields && !this.app.querySelector("#live-search-area")) {
        const wrapper = document.createElement("label");
        wrapper.className = "field-label search-city";
        wrapper.textContent = "Search city";
        const select = document.createElement("select");
        select.id = "live-search-area";
        select.className = "text-input";
        select.setAttribute("aria-label", "Search city");
        for (const area of this.config?.areas || []) {
          const option = document.createElement("option");
          option.value = area.id;
          option.textContent = area.name;
          option.selected = area.id === this.area()?.id;
          select.append(option);
        }
        wrapper.append(select);
        fields.before(wrapper);
      }
      const areaSelect =
        this.app.querySelector<HTMLSelectElement>("#live-search-area");
      if (
        areaSelect &&
        areaSelect.options.length !== (this.config?.areas.length || 0)
      )
        areaSelect.innerHTML = (this.config?.areas || [])
          .map(
            (a) =>
              `<option value="${escape(a.id)}" ${a.id === this.area()?.id ? "selected" : ""}>${escape(a.name)}</option>`,
          )
          .join("");
      this.showResults(this.results, this.searchLabel);
    }
    if (screen === "choose") {
      const badge = this.app.querySelector(".choose-sheet .badge");
      if (badge) badge.textContent = "Live prices";
      const subline = this.app.querySelector(".choose-sheet .subline");
      if (subline)
        subline.textContent =
          this.booking.tripType === "rental" && this.route
            ? `Hourly rental · ${this.booking.rentalHours} hours`
            : this.route
              ? `${(this.route.meters / 1000).toFixed(1)} km · ${Math.ceil(this.route.seconds / 60)} min · road route`
              : this.planningError ||
                "Choose both locations to load a road route";
      this.app
        .querySelectorAll<HTMLElement>("[data-vehicle]")
        .forEach((button) => {
          if (button instanceof HTMLButtonElement)
            button.disabled =
              this.estimates[button.dataset.vehicle!] === undefined;
          const price = button.querySelector(".vehicle-price");
          if (price)
            price.textContent =
              this.estimates[button.dataset.vehicle!] !== undefined
                ? money(this.estimates[button.dataset.vehicle!] / 100)
                : "Unavailable";
          const detail = button.querySelector("small");
          if (detail)
            detail.textContent =
              this.estimates[button.dataset.vehicle!] !== undefined
                ? "Captains checked when you book"
                : "Not available for this trip";
        });
      // Compact redesign: when some rides are priced, the unavailable ones fold into one dimmed row
      // ("Cars · Mini cab, Sedan, SUV") instead of a stack of "Unavailable" rows.
      const rows = [...this.app.querySelectorAll<HTMLButtonElement>("button[data-vehicle]")];
      const off = rows.filter((b) => this.estimates[b.dataset.vehicle!] === undefined);
      rows.forEach((b) => {
        b.hidden = false;
        const strong = b.querySelector("strong");
        if (strong) {
          b.dataset.liveName ||= strong.textContent?.trim() || b.dataset.vehicle!;
          strong.textContent = b.dataset.liveName;
        }
      });
      if (off.length > 1 && off.length < rows.length) {
        const names = off.map((b) => b.dataset.liveName || b.dataset.vehicle!);
        const cars = off.every((b) => ["mini", "sedan", "suv"].includes(b.dataset.vehicle!));
        off.slice(1).forEach((b) => (b.hidden = true));
        const first = off[0];
        const title = first.querySelector("strong");
        if (title) title.textContent = cars ? "Cars" : "Other rides";
        const detail = first.querySelector("small");
        if (detail) detail.textContent = `${names.join(", ")} · not available for this trip`;
        const price = first.querySelector(".vehicle-price");
        if (price) price.textContent = "";
      }
      const alternatives =
        this.app.querySelector<HTMLElement>(".route-alt-row");
      if (alternatives) {
        alternatives.hidden = this.routes.length < 2;
        const labels = routeLabels(this.routes);
        const content = this.routes
          .map(
            (r, i) =>
              `<button class="route-alt-chip ${i === this.booking.routeIndex ? "active" : ""}" role="radio" aria-checked="${i === this.booking.routeIndex}" data-live-route-index="${i}"><span>${labels[i]}</span><strong>${Math.ceil(r.seconds / 60)} min</strong><small>${(r.meters / 1000).toFixed(1)} km</small></button>`,
          )
          .join("");
        if (alternatives.innerHTML !== content)
          alternatives.innerHTML = content;
      }
      const sheet = this.app.querySelector(".choose-sheet");
      sheet?.querySelector("[data-live-plan-error]")?.remove();
      if (this.planningError)
        sheet?.insertAdjacentHTML(
          "beforeend",
          `<div data-live-plan-error class="notice-box" role="alert">${escape(this.planningError)}<button class="secondary" data-live-retry-plan>Retry route and fares</button></div>`,
        );
    }
    const promoControl = this.app.querySelector('[data-modal="promo"]');
    if (promoControl) {
      const title = promoControl.querySelector("strong"),
        detail = promoControl.querySelector("small");
      if (title) title.textContent = this.booking.promo || "Add a promo code";
      if (detail)
        detail.textContent = this.quote?.discount_paise
          ? `−${money(this.quote.discount_paise / 100)}`
          : "";
    }
    if (this.bridge.read().modal === "meeting") {
      // The renderer's meeting sheet is written for its sample map.
      const badge = this.app.querySelector(".meeting-overview .badge");
      if (badge) badge.textContent = "Your pickup";
      const mapButton = this.app.querySelector('.modal-sheet [data-action="meeting-map"]');
      if (mapButton) mapButton.textContent = "Show pickup on the map";
    }
    if (this.bridge.read().modal === "fare") {
      const overview = this.app.querySelector(".fare-overview strong");
      const value =
        this.quote?.payable_paise ??
        this.quote?.fare_paise ??
        this.estimates[this.bridge.read().vehicle];
      if (overview)
        overview.textContent =
          value !== undefined ? money(value / 100) : "Quote required";
      const breakdown = this.app.querySelector(".modal-sheet .breakdown");
      const set = (selector: string, text: string) => {
        const el = this.app.querySelector(selector);
        if (el) el.textContent = text;
      };
      set(".fare-overview span", "ESTIMATED FARE");
      set(".modal-sheet .quote-explainer p", "Changed the route or ride options? Get an updated fare before you request.");
      set('.modal-sheet [data-action="refresh-sample-quote"]', "Get an updated fare");
      if (breakdown)
        breakdown.innerHTML = `<div class="row"><span>Quoted total</span><strong>${value !== undefined ? money(value / 100) : "—"}</strong></div><p class="small muted">This is the fare Hop quoted for this route and vehicle.</p>`;
    }
    if (screen === "choose" || screen === "confirm") {
      const caption = this.app.querySelector(".footer-price span");
      if (caption?.firstChild)
        caption.firstChild.textContent = "Estimated fare";
      const value =
        this.quote?.payable_paise ??
        this.quote?.fare_paise ??
        this.estimates[this.bridge.read().vehicle];
      this.app
        .querySelectorAll(".footer-price strong")
        .forEach(
          (el) =>
            (el.textContent = value === undefined ? "—" : money(value / 100)),
        );
      const badge = this.app.querySelector(".confirm-sheet .badge");
      const breakdownAmount = this.app.querySelector(
        '.confirm-sheet [data-modal="fare"] small',
      );
      if (breakdownAmount)
        breakdownAmount.textContent =
          value === undefined ? "—" : money(value / 100);
      if (badge)
        badge.textContent = this.quote ? "Fare locked" : "Getting fare";
    }
    if (screen === "confirm") {
      const eta = this.app.querySelector(".confirm-sheet > .row p");
      if (eta)
        eta.textContent = "Captain availability is confirmed during matching";
      this.preferAffordablePayment();
    }
    if (screen === "choose") {
      const badge = this.app.querySelector(".choose-sheet .badge");
      if (badge) badge.textContent = "Live prices";
    }
    if (screen === "matching") {
      const fare = this.active()?.payable_paise ?? this.active()?.fare_paise;
      this.app.querySelectorAll(".sheet .row").forEach((row) => {
        if (row.textContent?.includes("Requested fare")) {
          const amount = row.querySelector("strong");
          if (amount)
            amount.textContent =
              fare !== undefined ? money(fare / 100) : "Waiting for server";
        }
      });
      const subtitle = this.app.querySelector(".matching-radar-status small");
      if (subtitle)
        subtitle.textContent =
          "We'll tell you the moment a captain accepts";
      this.app.querySelector(".handoff-box")?.remove();
      const status = this.app.querySelector(".matching-radar-status strong");
      const held = this.active();
      if (status)
        status.textContent = held?.next_ride
          ? `${held.reserved_driver_name || "A Captain"} is finishing a trip nearby`
          : "Searching for eligible nearby Captains…";
      if (subtitle && held?.next_ride)
        subtitle.textContent = `They’ll come to you right after${held.next_ride_eta_seconds ? ` · about ${Math.max(1, Math.round(held.next_ride_eta_seconds / 60))} min` : ""}`;
    }
    const ride = this.active();
    if (ride && screen === "tracking") this.decorateTripSheet(ride);
    if (this.role === "captain" && screen === "request") {
      const offer = this.state?.offers?.[0];
      if (offer) {
        const pickup = { lat: offer.pickup_lat, lng: offer.pickup_lng };
        const dropoff = { lat: offer.dropoff_lat, lng: offer.dropoff_lng };
        window.dispatchEvent(
          new CustomEvent("hop-planned-route", {
            detail: {
              center: pickup,
              vehicles: [],
              pickup,
              dropoff,
              route: offer.route,
            },
          }),
        );
      } else {
        const area = this.area();
        const center = area
          ? {
              lat: (area.min_lat + area.max_lat) / 2,
              lng: (area.min_lng + area.max_lng) / 2,
            }
          : { lat: 13.0067, lng: 80.2206 };
        window.dispatchEvent(
          new CustomEvent("hop-planned-route", {
            detail: {
              center,
              vehicles: [],
              route: [],
            },
          }),
        );
      }
      this.app.querySelector(".offer-switcher")?.remove();
      this.app.querySelector(".offer-timer-bar")?.remove();
      const amount = this.app.querySelector(".driver-sheet .amount");
      if (amount)
        amount.textContent = offer ? money(offer.fare_paise / 100) : "—";
      const badge = this.app.querySelector(".online-pill");
      // The header already says "New ride request"; the map chip stays only when there's none.
      if (badge && offer) badge.remove();
      else if (badge) badge.textContent = "No current requests";
      this.offerCountdown(offer?.offer_kind === "now" ? offer.offer_expires_at : undefined);
      const fareLabel = this.app.querySelector(".driver-sheet .row .small.muted");
      if (fareLabel?.textContent?.startsWith("Estimated fare")) fareLabel.textContent = "Estimated fare";
      // Pickup distance from the captain's last fix, trip time from the quote, and the payment method.
      const me = this.state?.driver?.[0] as { lat?: number; lng?: number } | undefined;
      const km = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
      const toPickup =
        offer && me?.lat != null && me?.lng != null
          ? km(distanceMeters({ lat: me.lat, lng: me.lng }, { lat: offer.pickup_lat, lng: offer.pickup_lng }))
          : "—";
      const seconds = Number((offer as { seconds?: number } | undefined)?.seconds || 0);
      const methods: Record<string, string> = { cash: "Cash", upi: "UPI", wallet: "Wallet", online: "Online" };
      const facts = [toPickup, seconds ? `${Math.max(1, Math.round(seconds / 60))} min` : "—", offer ? methods[offer.payment_method] || offer.payment_method : "—"];
      this.app
        .querySelectorAll(".offer-facts strong")
        .forEach((el, i) => (el.textContent = facts[i] ?? "—"));
    }
    if (this.role === "captain") this.nextRideCard(screen === "trip" ? this.pendingNext() : undefined);
    if (this.role === "captain" && ["pickup", "trip"].includes(screen)) {
      if (this.bridge.read().cockpitMode) {
        const nav = this.navigation,
          valid = nav && !nav.stale;
        const text = (selector: string, value: string) => {
          const el = this.app.querySelector(selector);
          if (el) el.textContent = value;
        };
        const step = valid ? nav.steps?.[0] : undefined;
        const km = (m: number) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);
        text(".cockpit-turn-dist", step ? `In ${km(step.meters || 0)}` : valid ? "Follow the route" : "Finding your route…");
        text(
          ".cockpit-turn-street",
          step?.instruction || (valid ? "Keep to the highlighted road" : "Guidance appears once your GPS fix arrives"),
        );
        const stats = this.app.querySelectorAll(".cockpit-trip-stats strong");
        if (stats[0])
          stats[0].textContent = valid
            ? `${Math.ceil(nav.seconds / 60)} min`
            : "—";
        if (stats[1])
          stats[1].textContent = valid
            ? `${(nav.meters / 1000).toFixed(1)} km`
            : "—";
        if (stats[2])
          stats[2].textContent =
            screen === "pickup"
              ? this.active()?.pickup_label.split(",")[0] || "Pickup"
              : this.active()?.dropoff_label.split(",")[0] || "Destination";
      }
      const instruction = this.app.querySelector(".route-pill strong");
      const distance = this.app.querySelector(".route-pill .small");
      const nav = this.navigation;
      if (instruction)
        instruction.textContent =
          nav && !nav.stale
            ? nav.steps?.[0]?.instruction ||
              "Continue toward the marked destination"
            : "Waiting for current road guidance";
      if (distance)
        distance.textContent =
          nav && !nav.stale ? `${nav.steps?.[0]?.meters || 0} m` : "—";
      this.app
        .querySelectorAll(".eta")
        .forEach(
          (el) =>
            (el.textContent =
              nav && !nav.stale ? `${Math.ceil(nav.seconds / 60)} min` : "—"),
        );
      const heading = this.app.querySelector(".tracking-heading h2");
      if (heading)
        heading.textContent =
          screen === "pickup"
            ? "Head to the rider’s pickup"
            : "Continue to the destination";
      const remaining = this.app.querySelector(".confirm-route .muted");
      if (remaining)
        remaining.textContent =
          nav && !nav.stale
            ? `${(nav.meters / 1000).toFixed(1)} km remaining`
            : "Navigation updating";
    }
    if (this.role === "captain" && ["pickup", "otp", "trip"].includes(screen)) {
      const rider = this.app.querySelector(".driver-card .driver-text > strong");
      if (rider) rider.textContent = "Your rider";
      const avatar = this.app.querySelector(".driver-card .avatar");
      if (avatar && !avatar.querySelector("img")) avatar.textContent = "R";
    }
    if (screen === "otp") {
      // The code boxes keep typed digits across re-renders. Clear them for each new ride, so an
      // earlier ride's digits are never sent with this one's (the server refuses a mixed code).
      const rideId = this.active()?.id || "";
      if (rideId && rideId !== this.pinRide) {
        this.pinRide = rideId;
        const form = this.bridge.read().form as Record<string, string> | undefined;
        if (form) for (const key of Object.keys(form)) if (/:pin-\d$/.test(key)) delete form[key];
        this.app.querySelectorAll<HTMLInputElement>('.pin-entry input').forEach((input) => (input.value = ""));
      }
      this.app.querySelector(".otp-actions-row")?.remove();
      const notice = this.app.querySelector(".screen-padding > .notice-box");
      if (notice) notice.textContent = "Confirm the code with your rider. Start the trip only when they are safely on board.";
      this.app.querySelectorAll(".fineprint").forEach((el) => {
        if (el.textContent?.includes("431602"))
          el.textContent =
            "Use the pickup code shown on the rider’s active trip.";
      });
    }
    this.rideChat.update();
    this.gateService(screen);
    if (screen === "activity") {
      this.history ||= new LiveHistory(
        this.app,
        this.role,
        this.bridge,
        () => this.state,
        async () => this.sync(await api.state()),
        async (ride) => {
          this.startCityRide();
          this.pickup = {
            lat: ride.pickup_lat,
            lng: ride.pickup_lng,
            label: ride.pickup_label,
          };
          this.dropoff = {
            lat: ride.dropoff_lat,
            lng: ride.dropoff_lng,
            label: ride.dropoff_label,
          };
          this.invalidate();
          this.bridge.update({
            pickup: ride.pickup_label,
            destination: ride.dropoff_label,
            vehicle: ride.vehicle_category,
          });
          this.bridge.go("choose");
          await this.plan();
        },
        (ride) => this.openPayment(ride),
      );
      this.history.render();
    }
    if (screen === "notifications") this.renderNotices();
    this.app
      .querySelectorAll<HTMLButtonElement>(
        '[data-action="request"],[data-action="review"]',
      )
      .forEach(
        (button) =>
          (button.disabled =
            this.busy ||
            (button.dataset.action === "review" &&
              (!this.route ||
                this.estimates[this.bridge.read().vehicle] === undefined))),
      );
  }
  private async loadNotices() {
    if (this.noticesLoading) return;
    this.noticesLoading = true;
    this.noticesError = "";
    this.renderNotices();
    try {
      const data = await api.request<{ notifications: Notice[] }>(
        "/api/companion",
      );
      this.notices = data.notifications || [];
    } catch (error) {
      this.noticesError = error instanceof Error ? error.message : "Notifications could not be loaded.";
    } finally {
      this.noticesLoading = false;
      this.renderNotices();
    }
  }
  private renderNotices() {
    if (this.bridge.read().screen !== "notifications") return;
    const body = this.app.querySelector(".screen-padding");
    if (!body) return;
    const key = JSON.stringify([this.notices, this.noticeFilter, this.noticesLoading, this.noticesError, this.busy, this.alertState]);
    if (body.getAttribute("data-notices") === key) return;
    body.setAttribute("data-notices", key);
    const unread = this.notices.filter(n => !n.read_at).length;
    const shown = this.notices.filter(n => this.noticeFilter !== "unread" || !n.read_at);
    const dateLabel = (value?: string) => {
      if (!value) return "Recent update";
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return "Recent update";
      const today = new Date();
      const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
      const day = date.toDateString() === today.toDateString() ? "Today" : date.toDateString() === yesterday.toDateString() ? "Yesterday" : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
      return `${day} · ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
    };
    const list = shown.map(n => `<article class="notice-card ${!n.read_at ? "is-unread" : ""}" data-notice-id="${escape(n.id)}"><span class="notice-symbol" aria-hidden="true">${icon(n.kind === "chat" ? "chat" : n.kind?.includes("payment") || n.kind?.includes("payout") ? "wallet" : n.kind?.includes("ride") || n.kind?.includes("trip") ? "car" : "bell")}</span><div class="notice-copy"><div class="notice-title"><h2>${escape(n.title)}</h2>${!n.read_at ? '<span class="notice-unread-dot" aria-label="Unread"></span>' : ""}</div><p>${escape(n.body)}</p><time ${n.created_at ? `datetime="${escape(n.created_at)}"` : ""}>${escape(dateLabel(n.created_at))}</time>${!n.read_at ? `<button class="text-button notice-read" data-notice-read="${escape(n.id)}">Mark read</button>` : ""}</div></article>`).join("");
    body.innerHTML = `<div class="notice-toolbar"><div class="tabs" aria-label="Filter notifications"><button data-notice-filter="all" aria-pressed="${this.noticeFilter === "all"}" class="${this.noticeFilter === "all" ? "active" : ""}">All</button><button data-notice-filter="unread" aria-pressed="${this.noticeFilter === "unread"}" class="${this.noticeFilter === "unread" ? "active" : ""}">Unread${unread ? ` (${unread})` : ""}</button></div><button class="text-button" data-action="read-all" ${!unread || this.busy ? "disabled" : ""}>Mark all as read</button></div><section class="notice-list" aria-label="Notifications">${this.noticesLoading ? '<p class="notice-empty" role="status">Loading notifications…</p>' : this.noticesError ? `<div class="notice-empty" role="alert"><p>${escape(this.noticesError)}</p><button class="secondary" data-action="retry-notifications">Try again</button></div>` : list || `<div class="notice-empty">${icon("bell")}<h2>${this.noticeFilter === "unread" ? "You’re all caught up" : "No notifications yet"}</h2><p>Ride updates and account messages will appear here.</p></div>`}</section>${this.alertCard()}`;
  }
  /** Marks one notification read (its "Mark read" button). */
  private async readNotice(id: string) {
    const notice = this.notices.find((n) => n.id === id);
    if (!notice || notice.read_at) return;
    try {
      await api.request("/api/notifications/read", { id });
      notice.read_at = new Date().toISOString();
    } catch (error) {
      this.message(error);
    }
    this.renderNotices();
  }
  private alertState?: AlertState;
  private async refreshAlerts() {
    const next = await notificationStatus();
    if (next === this.alertState) return;
    this.alertState = next;
    this.app.querySelector(".screen-padding")?.removeAttribute("data-notices");
    this.renderNotices();
  }
  /** Phone alerts card under the notifications: on, blocked in settings, or not asked yet. */
  private alertCard() {
    if (this.alertState === undefined) void this.refreshAlerts();
    const state = this.alertState;
    if (state === "unavailable") return "";
    const [title, copy, button] =
      state === "on"
        ? ["Phone alerts are on", "Trip updates reach this phone even when Hop is closed.", ""]
        : state === "blocked"
          ? ["Phone alerts are off", "Notifications for Hop are turned off in your phone’s settings.", "Open phone settings"]
          : ["Stay updated", "Get trip alerts on this device.", "Enable device notifications"];
    return `<div class="notice-device ${state === "on" ? "is-on" : ""}"><span class="list-icon" aria-hidden="true">${icon("bell")}</span><div><strong>${title}</strong><p class="small muted">${copy}</p>${button ? `<button class="text-button" data-action="enable-device-notifications">${button}</button>` : ""}</div></div>`;
  }
  private async notifications() {
    try {
      const data = await api.request<{ notifications: Notice[] }>(
        "/api/notifications/new",
      );
      let received = false;
      for (const notice of data.notifications || [])
        if (!this.notices.some((n) => n.id === notice.id)) {
          received = true;
          this.notices.unshift(notice);
          this.bridge.notify(`${notice.title}: ${notice.body}`);
        }
      if (received) notificationSound();
      this.renderNotices();
    } catch {}
    if (!this.stopped)
      this.notificationTimer = setTimeout(
        () => void this.notifications(),
        10000,
      );
  }
  destroy() {
    stopSearchingSound();
    stopOfferAlert();
    clearInterval(this.countdownTimer);
    this.onboarding?.destroy();
    this.history?.destroy();
    this.booking.destroy();
    this.account.destroy();
    this.payment?.destroy();
    this.stopped = true;
    this.sequence++;
    this.routeSequence++;
    clearTimeout(this.searchTimer);
    clearTimeout(this.notificationTimer);
    this.observer.disconnect();
    this.app.removeEventListener("submit", this.submit, true);
    this.app.removeEventListener("click", this.click, true);
    this.app.removeEventListener("input", this.input, true);
    this.app.removeEventListener("focusin", this.focus, true);
    this.app.removeEventListener("change", this.changeArea, true);
    window.removeEventListener("hop-location-denied", this.locationDenied);
    window.removeEventListener("hop-trip-eta", this.tripEta);
    window.removeEventListener("hop-navigation", this.navigationUpdate);
    window.removeEventListener("hop-route-pick", this.routePick);
    window.removeEventListener("hop-map-pick", this.mapPick);
    window.removeEventListener("hop-live-state", this.serverState);
    window.removeEventListener("hop-here", this.hopHere);
    this.rideChat.close();
  }
}
