import {
  enableNotifications,
  disableNotifications,
} from "../notifications/device";
import { recoveryStates, type RecoveryState } from "./recovery";
import { LivePayment } from "../payments/LivePayment";
import { paymentMethods } from "../payments/components";
import { api, APIError } from "../services/client";
import type { Point, Config, Quote, State, Ride } from "../services/contracts";
import { escape, money } from "../helpers";
import type { Coordinate } from "../maps/types";
import { currentLocation } from "../platform/transport";
interface Bridge {
  assign(patch: Record<string, unknown>): void;
  read(): any;
  update(patch: Record<string, unknown>): void;
  go(screen: string): void;
  notify(message: string): void;
}
type Route = { route: Coordinate[]; meters: number; seconds: number };
type Notice = { id: string; title: string; body: string; created_at: string };
/** Data and action adapter for the approved UI; no alternate screen renderer. */
export class LiveJourney {
  private config?: Config;
  private locationDenied = () => this.showRecovery("location");
  private recovery?: RecoveryState;
  private lastAction = "";
  private signedIn = false;
  private payment?: LivePayment;
  private walletBalance?: number;
  private walletLoading = false;
  private authError = "";
  private phone = "";
  private otp = "";
  private codeSent = false;
  private devCode = "";
  private pickup?: Point;
  private dropoff?: Point;
  private selectedArea = "";
  private searchLabel = "SEARCH REAL PLACES";
  private searchNeedsSignIn = false;
  private target: "pickup" | "dropoff" = "dropoff";
  private results: Point[] = [];
  private searchTimer?: ReturnType<typeof setTimeout>;
  private sequence = 0;
  private routeSequence = 0;
  private route?: Route;
  private quote?: Quote;
  private requestKey = crypto.randomUUID();
  private bookingPayload?: { quote: string; payment: string };
  private busy = false;
  private state?: State;
  private seenRide = "";
  private offersSeen = new Set<string>();
  private notices: Notice[] = [];
  private chat: { body: string; mine: boolean; sent_at: string }[] = [];
  private chatAt = 0;
  private chatLoading = false;
  private submit = (event: Event) => {
    if ((event.target as HTMLFormElement).id !== "chat-form") return;
    this.stop(event);
    const input = this.app.querySelector<HTMLInputElement>("#message-input");
    const text = input?.value.trim();
    if (text)
      void this.run(async () => {
        await this.sendChat(text);
        if (input) input.value = "";
      });
  };
  private async sendChat(body: string) {
    const ride = this.active();
    if (!ride || ride.status === "requested")
      throw new Error("Chat is available after a Captain accepts the ride.");
    await api.request(`/api/rides/${encodeURIComponent(ride.id)}/messages`, {
      body,
    });
    await this.loadChat();
  }
  private async loadChat() {
    const ride = this.active();
    if (!ride || this.chatLoading) return;
    this.chatLoading = true;
    try {
      const data = await api.request<{
        messages: { body: string; mine: boolean; sent_at: string }[];
      }>(`/api/rides/${encodeURIComponent(ride.id)}/messages`);
      this.chat = data.messages || [];
      this.paintChat();
    } catch {
    } finally {
      this.chatAt = Date.now();
      this.chatLoading = false;
    }
  }
  private paintChat() {
    if (this.bridge.read().screen !== "chat") return;
    const chat = this.app.querySelector(".chat");
    if (chat)
      chat.innerHTML = this.chat.length
        ? this.chat
            .map(
              (m) =>
                `<div class="chat-bubble ${m.mine ? "mine" : "partner"}">${escape(m.body)}</div>`,
            )
            .join("")
        : '<p class="small muted">Messages appear here during your active ride.</p>';
  }
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
  private navigationUpdate = (event: Event) => {
    this.navigation = (event as CustomEvent).detail || undefined;
    this.decorate();
  };
  constructor(
    private app: HTMLElement,
    private role: "rider" | "captain",
    private bridge: Bridge,
  ) {
    app.addEventListener("submit", this.submit, true);
    app.addEventListener("click", this.click, true);
    app.addEventListener("input", this.input, true);
    app.addEventListener("focusin", this.focus, true);
    app.addEventListener("change", this.changeArea, true);
    window.addEventListener("hop-location-denied", this.locationDenied);
    window.addEventListener("hop-navigation", this.navigationUpdate);
    window.addEventListener("hop-map-pick", this.mapPick);
    window.addEventListener("hop-live-state", this.serverState);
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
    void api
      .session()
      .then(() => {
        this.signedIn = true;
        this.decorate();
      })
      .catch(() => this.decorate());
    void this.notifications();
    this.decorate();
  }
  private focus = (event: Event) => {
    const id = (event.target as HTMLElement).id;
    if (id === "pickup-input") this.target = "pickup";
    if (id === "destination-input") this.target = "dropoff";
  };
  private showRecovery(state: RecoveryState) {
    this.recovery = state;
    this.bridge.update({ modal: "live-recovery" });
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
    this.routeSequence++;
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
    this.showResults([], "Searching places…");
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
        `/api/places?area_id=${encodeURIComponent(area.id)}&q=${encodeURIComponent(query)}`,
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
  private showResults(results: Point[], label: string) {
    this.results = results;
    this.searchLabel = label;
    const list = this.app.querySelector("#place-results");
    if (list)
      list.innerHTML =
        results
          .map(
            (p, i) =>
              `<button class="list-row" data-live-place="${i}"><span class="list-icon">⌖</span><span class="list-text"><strong>${escape(p.label)}</strong><small>${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</small></span><span>›</span></button>`,
          )
          .join("") ||
        `<div class="search-feedback" role="status"><p>${escape(label)}</p>${this.searchNeedsSignIn ? '<button class="secondary" data-live-login>Sign in to search places</button>' : ""}</div>`;
    const heading = this.app.querySelector("#results-label");
    if (heading) heading.textContent = label;
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
    if (this.role !== "rider" || this.active()) return;
    const point = (event as CustomEvent<Coordinate>).detail;
    void this.select({
      ...point,
      label: `Map pin ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
    }).catch((e) => this.message(e));
  };
  private async plan() {
    if (!this.pickup || !this.dropoff) return;
    const revision = ++this.routeSequence,
      pickup = { ...this.pickup },
      dropoff = { ...this.dropoff };
    try {
      await api.session();
      this.config ||= await api.config();
      const area = this.area(pickup);
      if (!area)
        throw new Error("Pickup is outside the supported service areas.");
      const response = await api.request<{ routes: Route[] }>(
        "/api/routes/alternatives",
        { pickup, dropoff },
      );
      if (revision !== this.routeSequence) return;
      if (!response.routes?.[0]?.route?.length)
        throw new Error("No road route is available for these locations.");
      this.route = response.routes[0];
      window.dispatchEvent(
        new CustomEvent("hop-planned-route", {
          detail: {
            center: pickup,
            vehicles: [],
            pickup,
            dropoff,
            route: this.route.route,
          },
        }),
      );
      this.decorate();
      const estimates = await api.request<{
        options: { category: string; fare_paise: number }[];
      }>("/api/estimates", { area_id: area.id, pickup, dropoff });
      if (revision !== this.routeSequence) return;
      this.estimates = Object.fromEntries(
        (estimates.options || []).map((o) => [o.category, o.fare_paise]),
      );
      this.decorate();
    } catch (error) {
      if (revision === this.routeSequence) {
        this.route = undefined;
        this.message(error);
        this.decorate();
      }
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
        this.showRecovery("alerts");
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
  private openPayment(ride: Ride) {
    this.payment?.destroy();
    this.bridge.assign({ modal: null });
    this.payment = new LivePayment(this.app, ride, this.role, () => {
      this.payment = undefined;
      this.bridge.go("activity");
    });
  }
  private click = (event: Event) => {
    const button = (event.target as Element)?.closest<HTMLElement>("button,a");
    if (!button) return;
    if (this.payment) return;
    if (button.dataset.liveRecover) {
      this.stop(event);
      const state = this.recovery;
      this.recovery = undefined;
      this.bridge.update({ modal: null });
      if (state === "expired") {
        void this.run(async () => {
          if (!this.pickup || !this.dropoff)
            throw new Error("Choose your pickup and destination again.");
          this.quote = await api.quote(
            this.area()!.id,
            this.bridge.read().vehicle,
            this.pickup,
            this.dropoff,
          );
          this.bridge.go("confirm");
        });
      } else if (state === "offline")
        void this.run(async () => this.sync(await api.state()));
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
    if (button.dataset.message) {
      this.stop(event);
      void this.run(() => this.sendChat(button.dataset.message!));
      return;
    }
    if (button.dataset.vehicle) {
      this.quote = undefined;
      this.bookingPayload = undefined;
      queueMicrotask(() => this.decorate());
      return;
    }
    if (button.dataset.routeAlt) {
      this.stop(event);
      this.bridge.notify(
        "The displayed route is the backend’s recommended road route.",
      );
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
    const action = button.dataset.action;
    this.lastAction = action || "";
    if (!action) return;
    if (
      [
        "simulate-other-captain-accept",
        "preview-captain-notification",
        "switch-to-captain-pickup",
        "autofill-otp",
        "view-next-offer",
        "toggle-cockpit",
      ].includes(action)
    ) {
      this.stop(event);
      this.bridge.notify(
        "Live rides advance only after the backend confirms a real trip action.",
      );
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
          this.devCode = this.config?.development ? result.dev_code || "" : "";
          this.bridge.update({});
        } else {
          if (!/^\d{6}$/.test(this.otp))
            throw new Error("Enter the six-digit SMS code.");
          await api.verifyOtp(this.phone, this.otp);
          this.signedIn = true;
          this.devCode = "";
          this.bridge.go(this.role === "rider" ? "home" : "drive");
        }
      });
      return;
    }
    if (action === "enable-device-notifications") {
      this.stop(event);
      void this.run(async () => {
        await enableNotifications();
        this.bridge.notify("Device notifications enabled.");
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
        this.pickup = undefined;
        this.dropoff = undefined;
        this.invalidate();
        this.notices = [];
        this.chat = [];
        this.codeSent = false;
        this.phone = "";
        this.otp = "";
        this.bridge.go("auth");
      });
      return;
    }
    if (action === "usual-ride" || action === "rebook") {
      this.stop(event);
      this.bridge.go("search");
      this.bridge.notify(
        "Choose your pickup and destination to get a fresh backend fare.",
      );
      return;
    }
    if (action === "current-location") {
      this.stop(event);
      void this.run(async () => {
        const coords = await currentLocation();
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
        );
        if (
          revision !== this.routeSequence ||
          ui.vehicle !== this.bridge.read().vehicle
        )
          return;
        this.quote = quote;
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
        if (
          ui.schedule !== "Now" ||
          ui.stops.length ||
          ui.tripType !== "city" ||
          ui.share ||
          ui.promo ||
          ui.offer ||
          ui.who !== "Me"
        )
          throw new Error(
            "This live flow currently supports immediate solo city rides without extra stops or offers.",
          );
        if (!this.quote)
          throw new Error(
            "Get a fresh backend quote before requesting a ride.",
          );
        const payment = String(ui.payment).toLowerCase();
        const payload = { quote: this.quote.id, payment };
        if (
          this.bookingPayload &&
          JSON.stringify(payload) !== JSON.stringify(this.bookingPayload)
        )
          this.requestKey = crypto.randomUUID();
        this.bookingPayload = payload;
        await api.bookRide(payload.quote, this.requestKey, payment);
        this.bridge.update({ phase: "requested" });
        this.bridge.go("matching");
        this.sync(await api.state());
      });
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
          await api.action(ride.id, ride.version, name, {
            ...(name === "start" ? { code } : {}),
            ...(name === "complete" ? { confirm: true } : {}),
            ...(name === "cancel" ? { reason: "Plans changed" } : {}),
          });
        }
        this.sync(await api.state());
      });
      return;
    }
    if (action === "read-all") {
      this.stop(event);
      void this.run(async () => {
        await api.request("/api/notifications/read", {});
        this.bridge.notify("Notifications marked as read.");
      });
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
    this.state = state;
    const ride = this.active();
    if (ride) {
      const revision = `${ride.id}:${ride.status}`;
      if (revision !== this.seenRide) {
        this.seenRide = revision;
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
      }
    } else if (this.seenRide) {
      const previous = state.rides?.find(
        (r) => r.id === this.seenRide.split(":")[0],
      );
      const finished = state.rides?.find(
        (r) => r.id === this.seenRide.split(":")[0] && r.status === "completed",
      );
      this.seenRide = "";
      if (finished) {
        this.bridge.assign({ phase: "completed" });
        this.openPayment(finished);
        return;
      }
      this.bridge.update({ phase: "none" });
      this.bridge.go(this.role === "rider" ? "activity" : "drive");
      if (previous?.status === "expired") this.showRecovery("drivers");
      if (previous?.status === "cancelled") this.showRecovery("cancelled");
    }
    if (this.role === "captain" && !ride && state.offers?.length) {
      const offer = state.offers[0];
      if (!this.offersSeen.has(offer.id)) {
        this.offersSeen.add(offer.id);
        this.bridge.update({
          pickup: offer.pickup_label,
          destination: offer.dropoff_label,
          vehicle: offer.vehicle_category,
          payment: offer.payment_method,
          offerIndex: 0,
        });
        this.bridge.go("request");
        this.bridge.notify(
          "New ride request received. Review the pickup and fare.",
        );
      }
    }
    this.decorate();
  }
  private decorate() {
    if (this.app.dataset.livePayment) return;
    if (this.recovery && this.bridge.read().modal === "live-recovery") {
      const panel = this.app.querySelector(".modal-sheet"),
        state = recoveryStates[this.recovery];
      if (panel)
        panel.innerHTML = `<div class="sheet-handle"></div><div class="modal-title"><h2 id="modal-title">${state.title}</h2><button class="icon-button" aria-label="Close dialog" data-action="close-modal">×</button></div><section class="state-preview-card"><div class="payment-state-symbol">${state.symbol}</div><p>${state.copy}</p></section><button class="primary" data-live-recover="continue">${state.action}</button>`;
    }
    const screen = this.bridge.read().screen;
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
      statusBadge.textContent = screen === "auth" ? "Secure sign-in" : "Live";
    this.app
      .querySelectorAll<HTMLElement>(".shortcut[data-destination]")
      .forEach((button) => {
        const name = button.dataset.destination!.toLowerCase();
        const saved = this.state?.saved_locations?.find(
          (p) => p.kind.toLowerCase() === name,
        );
        const detail = button.querySelector("small");
        if (detail)
          detail.textContent =
            saved?.place_label || "Choose your saved address";
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
          `<p class="small muted" style="margin-bottom:15px">Choose how you’d like to pay for your ride.</p>${paymentMethods(this.bridge.read().payment, this.walletBalance, "data-payment")}<p class="fineprint">The backend confirms availability and wallet balance when you request the ride.</p>`,
        );
      }
    }
    if (screen === "search") {
      const fields = this.app.querySelector(".route-fields");
      if (fields && !this.app.querySelector("#live-search-area")) {
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
      if (badge) badge.textContent = "Backend estimates";
      const subline = this.app.querySelector(".choose-sheet .subline");
      if (subline)
        subline.textContent = this.route
          ? `${(this.route.meters / 1000).toFixed(1)} km · ${Math.ceil(this.route.seconds / 60)} min · road route`
          : "Choose both locations to load a road route";
      this.app
        .querySelectorAll<HTMLElement>("[data-vehicle]")
        .forEach((button) => {
          const price = button.querySelector(".vehicle-price");
          if (price)
            price.textContent =
              this.estimates[button.dataset.vehicle!] !== undefined
                ? money(this.estimates[button.dataset.vehicle!] / 100)
                : "Unavailable";
          const detail = button.querySelector("small");
          if (detail)
            detail.textContent = "Availability confirmed during matching";
        });
      this.app.querySelector(".route-alt-row")?.setAttribute("hidden", "");
    }
    if (this.bridge.read().modal === "fare") {
      const overview = this.app.querySelector(".fare-overview strong");
      const value =
        this.quote?.fare_paise ?? this.estimates[this.bridge.read().vehicle];
      if (overview)
        overview.textContent =
          value !== undefined ? money(value / 100) : "Quote required";
      const breakdown = this.app.querySelector(".modal-sheet .breakdown");
      if (breakdown)
        breakdown.innerHTML = `<div class="row"><span>Backend quoted total</span><strong>${value !== undefined ? money(value / 100) : "—"}</strong></div><p class="small muted">Pricing follows the existing backend. No sample fee breakdown is used.</p>`;
    }
    if (screen === "choose" || screen === "confirm") {
      const caption = this.app.querySelector(".footer-price span");
      if (caption?.firstChild)
        caption.firstChild.textContent = "Backend estimated fare";
      const value =
        this.quote?.fare_paise ?? this.estimates[this.bridge.read().vehicle];
      this.app
        .querySelectorAll(".footer-price strong")
        .forEach(
          (el) =>
            (el.textContent = value === undefined ? "—" : money(value / 100)),
        );
      const badge = this.app.querySelector(".confirm-sheet .badge");
      if (badge)
        badge.textContent = this.quote ? "Backend quote" : "Quote required";
    }
    if (screen === "matching") {
      this.app.querySelector(".handoff-box")?.remove();
      const status = this.app.querySelector(".matching-radar-status strong");
      if (status)
        status.textContent = "Searching for eligible nearby Captains…";
    }
    const ride = this.active();
    if (ride && screen === "tracking") {
      const name = this.app.querySelector(".driver-text strong");
      if (name) name.textContent = ride.driver_name || "Assigned Captain";
      const plate = this.app.querySelector(".plate");
      if (plate)
        plate.textContent = ride.vehicle_number || "Vehicle details pending";
      const code = this.app.querySelector(".pin-code strong");
      if (code) code.textContent = ride.pickup_code || "Waiting";
      const heading = this.app.querySelector(".tracking-heading h2");
      if (heading)
        heading.textContent =
          ride.status === "in_progress"
            ? "On your way to the destination"
            : ride.status === "arrived"
              ? "Your Captain has arrived"
              : "Your Captain is on the way";
      this.app
        .querySelectorAll(".eta")
        .forEach((el) => (el.textContent = "Live"));
    }
    if (this.role === "captain" && screen === "request") {
      const offer = this.state?.offers?.[0];
      this.app.querySelector(".offer-switcher")?.remove();
      this.app.querySelector(".offer-timer-bar")?.remove();
      const amount = this.app.querySelector(".driver-sheet .amount");
      if (amount)
        amount.textContent = offer ? money(offer.fare_paise / 100) : "—";
      const badge = this.app.querySelector(".online-pill");
      if (badge)
        badge.textContent = offer ? "New live request" : "No current requests";
      this.app
        .querySelectorAll(".offer-facts strong")
        .forEach((el) => (el.textContent = "—"));
    }
    if (this.role === "captain" && ["pickup", "trip"].includes(screen)) {
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
    if (screen === "otp") {
      this.app.querySelector(".otp-actions-row")?.remove();
      this.app.querySelectorAll(".fineprint").forEach((el) => {
        if (el.textContent?.includes("431602"))
          el.textContent =
            "Use the pickup code shown on the rider’s active trip.";
      });
    }
    if (screen === "chat") {
      this.paintChat();
      if (Date.now() - this.chatAt > 3000) void this.loadChat();
      const send = this.app.querySelector('[aria-label="Send sample message"]');
      send?.setAttribute("aria-label", "Send message");
    }
    if (screen === "activity") {
      const body = this.app.querySelector(".screen-padding");
      const rides = (this.state?.rides || []).filter((r) =>
        this.role === "rider" ? r.mine : r.driving,
      );
      if (body)
        body.innerHTML = rides.length
          ? rides
              .map(
                (r) =>
                  `<article class="activity-card"><div class="row"><span class="badge neutral">${escape(r.status)}</span><strong>${money((r.payable_paise ?? r.fare_paise) / 100)}</strong></div><div class="route-line"><i class="location-dot"></i><strong>${escape(r.pickup_label)}</strong></div><div class="route-line"><i class="location-dot destination"></i><strong>${escape(r.dropoff_label)}</strong></div>${["in_progress", "completed"].includes(r.status) ? `<button class="text-button" data-live-ride-payment="${escape(r.id)}">Payment & receipt →</button>` : ""}</article>`,
              )
              .join("")
          : '<div class="empty-state"><h2>No rides yet.</h2><p>Your real trips will appear here.</p></div>';
    }
    if (screen === "notifications") this.renderNotices();
    this.app
      .querySelectorAll<HTMLButtonElement>(
        '[data-action="request"],[data-action="review"]',
      )
      .forEach((button) => (button.disabled = this.busy));
  }
  private async loadNotices() {
    try {
      const data = await api.request<{ notifications: Notice[] }>(
        "/api/companion",
      );
      this.notices = data.notifications || [];
      this.renderNotices();
    } catch (error) {
      this.message(error);
    }
  }
  private renderNotices() {
    if (this.bridge.read().screen !== "notifications") return;
    const body = this.app.querySelector(".screen-padding");
    if (body)
      body.innerHTML = `<div class="section-label">YOUR NOTIFICATIONS</div>${this.notices.map((n) => `<article class="section-card"><strong>${escape(n.title)}</strong><p class="small muted">${escape(n.body)}</p><small>${escape(n.created_at)}</small></article>`).join("") || '<p class="muted">No notifications yet.</p>'}<button class="secondary" data-action="enable-device-notifications">Enable device notifications</button><button class="text-button" data-action="read-all">Mark all as read</button>`;
  }
  private async notifications() {
    try {
      const data = await api.request<{ notifications: Notice[] }>(
        "/api/notifications/new",
      );
      for (const notice of data.notifications || [])
        if (!this.notices.some((n) => n.id === notice.id)) {
          this.notices.unshift(notice);
          this.bridge.notify(`${notice.title}: ${notice.body}`);
        }
      this.renderNotices();
    } catch {}
    if (!this.stopped)
      this.notificationTimer = setTimeout(
        () => void this.notifications(),
        10000,
      );
  }
  destroy() {
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
    window.removeEventListener("hop-navigation", this.navigationUpdate);
    window.removeEventListener("hop-map-pick", this.mapPick);
    window.removeEventListener("hop-live-state", this.serverState);
  }
}
