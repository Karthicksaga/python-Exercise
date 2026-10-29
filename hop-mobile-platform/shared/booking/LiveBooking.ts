import { api } from "../services/client";
import { escape } from "../helpers";
import type { Point, Quote } from "../services/contracts";
import type { OnboardingBridge as Bridge } from "../onboarding/CaptainOnboarding";
type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: (event: any) => void;
  onerror: (event: any) => void;
  onend: () => void;
  start(): void;
  stop(): void;
};
export class LiveBooking {
  stops: Point[] = [];
  routeIndex = 0;
  tripType = "city";
  rentalHours = 2;
  tripDays = 1;
  roundTrip = false;
  scheduleAt = "";
  promo = "";
  pink = false;
  share = false;
  favoriteFirst = false;
  offer = "";
  passengerName = "";
  passengerPhone = "";
  familyId = "";
  private places: Point[] = [];
  private families: {
    id: string;
    name?: string;
    member_name?: string;
    status: string;
  }[] = [];
  private familyLoaded = false;
  private searching = 0;
  private status = "";
  private stopQuery = "";
  private recognition?: Recognition;
  constructor(
    private app: HTMLElement,
    private bridge: Bridge,
    private area: () => string | undefined,
    private changed: () => Promise<void>,
    private voice: (query: string) => void,
  ) {
    app.addEventListener("click", this.click, true);
    app.addEventListener("input", this.input, true);
    app.addEventListener("change", this.change, true);
  }
  destroy() {
    this.recognition?.stop();
    this.app.removeEventListener("click", this.click, true);
    this.app.removeEventListener("input", this.input, true);
    this.app.removeEventListener("change", this.change, true);
  }
  reset() {
    this.stops = [];
    this.tripType = "city";
    this.routeIndex = 0;
    this.scheduleAt = "";
    this.promo = "";
    this.pink = false;
    this.share = false;
    this.favoriteFirst = false;
    this.offer = "";
    this.passengerName = "";
    this.passengerPhone = "";
    this.familyId = "";
    this.bridge.assign({
      stops: [],
      promo: false,
      offer: "",
      share: false,
      pink: false,
      who: "Me",
      schedule: "Now",
      tripType: "city",
    });
  }
  quoteOptions() {
    return {
      route_index: this.routeIndex,
      trip_type: this.tripType,
      stops: this.stops,
      rental_hours: this.tripType === "rental" ? this.rentalHours : 0,
      trip_days: this.tripType === "outstation" ? this.tripDays : 0,
      round_trip: this.roundTrip,
      promo_code: this.promo,
      pink: this.pink,
    };
  }
  rideOptions(quote: Quote) {
    const out: Record<string, unknown> = {
      share: this.share,
      favorite_first: this.favoriteFirst,
    };
    if (this.offer) {
      const n = Math.round(Number(this.offer) * 100);
      if (
        !Number.isSafeInteger(n) ||
        n < Math.ceil(quote.fare_paise * 0.7) ||
        n > Math.floor(quote.fare_paise * 1.5)
      )
        throw new Error(
          "Fare offer must be between 70% and 150% of the backend quote.",
        );
      out.offer_paise = n;
    }
    if (this.passengerName || this.passengerPhone) {
      if (
        !this.passengerName.trim() ||
        !/^[6-9]\d{9}$/.test(this.passengerPhone)
      )
        throw new Error("Enter the passenger name and a valid mobile number.");
      out.passenger_name = this.passengerName.trim();
      out.passenger_phone = this.passengerPhone;
    }
    if (this.familyId) out.family_member_id = this.familyId;
    return out;
  }
  advanced() {
    return this.tripType !== "city" || !!this.promo || this.pink || this.routeIndex > 0;
  }
  private field(key: string, label: string, value: unknown, type = "text") {
    const id =
      (
        {
          rentalHours: "rental-hours",
          tripDays: "trip-days",
          scheduleAt: "schedule-at",
        } as Record<string, string>
      )[key] || `booking-${key}`;
    return `<label class="field-label" for="${id}">${label}</label><input class="text-input" id="${id}" data-booking-field="${key}" type="${type}" value="${escape(value)}"/>`;
  }
  private toggle(key: string, label: string, value: boolean) {
    return `<label class="toggle-row"><span>${label}</span><input type="checkbox" data-booking-field="${key}" ${value ? "checked" : ""}/></label>`;
  }
  render(force = false) {
    const ui = this.bridge.read(),
      modal = ui.modal;
    if (modal !== "voice" && this.recognition) {
      this.recognition.stop();
      this.recognition = undefined;
    }
    const plan = ui.screen === "plan" && !modal;
    const supported = [
      "stops",
      "promo",
      "passenger",
      "options",
      "voice",
    ].includes(modal);
    if (!plan && !supported) return;
    const host = this.app.querySelector<HTMLElement>(
      plan ? ".screen-padding" : ".modal-sheet",
    );
    if (!host) return;
    if (!force && host.dataset.liveBooking === (plan ? "plan" : modal)) return;
    host.dataset.liveBooking = plan ? "plan" : modal;
    let body = "";
    if (plan)
      body = `<label class="field-label" for="trip-type">Trip type</label><select class="text-input" id="trip-type" data-booking-field="tripType">${["city", "rental", "outstation"].map((t) => `<option ${t === this.tripType ? "selected" : ""}>${t}</option>`).join("")}</select>${this.tripType === "rental" ? this.field("rentalHours", "Rental hours (1–12)", this.rentalHours, "number") : ""}${this.tripType === "outstation" ? this.field("tripDays", "Trip days (1–10)", this.tripDays, "number") + this.toggle("roundTrip", "Round trip", this.roundTrip) : ""}${this.field("scheduleAt", "Pickup time (leave empty for now)", this.scheduleAt, "datetime-local")}<p class="notice-box">Scheduling supports city rides with Cash or UPI. Product availability and prices come from the backend.</p><button class="primary" data-booking-action="save">Save trip plan</button>`;
    if (modal === "stops")
      body = `<p>Up to three stops. Select an address returned by the server.</p>${this.stops.map((p, i) => `<div class="list-row"><strong>${escape(p.label)}</strong><button class="text-button" data-booking-remove="${i}">Remove</button></div>`).join("")}${this.stops.length < 3 ? this.field("stopQuery", "Stop address", this.stopQuery) + '<button class="secondary" data-booking-action="search-stop">Search addresses</button>' : ""}${this.places.map((p, i) => `<button class="list-row" data-booking-place="${i}">${escape(p.label)}</button>`).join("")}<button class="primary" data-booking-action="save">Done</button>`;
    if (modal === "promo")
      body =
        this.field("promo", "Promo code", this.promo) +
        `<p class="small muted">The server validates eligibility and discount. Clear the code to remove it.</p><button class="primary" data-booking-action="save">Apply code</button>`;
    if (modal === "options")
      body =
        this.toggle("share", "Share this ride", this.share) +
        this.toggle("pink", "Women drivers only", this.pink) +
        this.toggle(
          "favoriteFirst",
          "Favourite captains first",
          this.favoriteFirst,
        ) +
        this.field(
          "offer",
          "Your fare offer (₹, optional)",
          this.offer,
          "number",
        ) +
        `<p class="small muted">Offer bounds: 70–150% of the server quote. Eligibility is checked by the backend.</p><button class="primary" data-booking-action="save">Save ride options</button>`;
    if (modal === "passenger") {
      body =
        this.field(
          "passengerName",
          "Passenger name (optional)",
          this.passengerName,
        ) +
        this.field(
          "passengerPhone",
          "Passenger mobile",
          this.passengerPhone,
          "tel",
        ) +
        `<label class="field-label" for="booking-familyId">Accepted family member (optional)</label><select class="text-input" id="booking-familyId" data-booking-field="familyId"><option value="">Me / named passenger</option>${this.families
          .filter((f) => f.status === "accepted")
          .map(
            (f) =>
              `<option value="${escape(f.id)}" ${f.id === this.familyId ? "selected" : ""}>${escape(f.name || f.member_name || f.id)}</option>`,
          )
          .join(
            "",
          )}</select><button class="primary" data-booking-action="save">Save passenger</button>`;
      if (!this.familyLoaded) {
        this.familyLoaded = true;
        void api
          .request<{
            family: {
              id: string;
              name?: string;
              member_name?: string;
              status: string;
            }[];
          }>("/api/companion")
          .then((r) => {
            this.families = r.family || [];
            this.render(true);
          })
          .catch((e) => {
            this.status = e.message;
            this.render(true);
          });
      }
    }
    if (modal === "voice")
      body = `<p>Speak a destination. Review the returned addresses and fare before booking.</p><button class="primary" data-booking-action="voice">Start microphone</button><button class="secondary" data-booking-action="stop-voice">Stop microphone</button>`;
    host.innerHTML =
      (plan
        ? ""
        : `<div class="sheet-handle"></div><div class="modal-title"><h2>${({ stops: "Stops", promo: "Promo code", options: "Ride options", passenger: "Who's riding?", voice: "Speak your trip" } as Record<string, string>)[modal]}</h2><button class="icon-button" aria-label="Close dialog" data-action="close-modal">×</button></div>`) +
      body +
      `<p role="status" class="small muted">${escape(this.status)}</p>`;
    if (plan)
      this.app
        .querySelector<HTMLElement>(".action-bar")
        ?.setAttribute("hidden", "");
  }
  private input = (e: Event) => {
    const el = e.target as HTMLInputElement;
    const key = el.dataset.bookingField;
    if (!key) return;
    e.stopImmediatePropagation();
    if (["share", "pink", "favoriteFirst", "roundTrip"].includes(key))
      (this as any)[key] = el.checked;
    else if (["rentalHours", "tripDays"].includes(key))
      (this as any)[key] = Number(el.value);
    else (this as any)[key] = el.value;
  };
  private change = (e: Event) => {
    this.input(e);
    const el = e.target as HTMLInputElement;
    if (el.dataset.bookingField === "tripType") this.render(true);
  };
  private click = (e: Event) => {
    const b = (e.target as Element).closest<HTMLElement>("button");
    if (!b || !Object.keys(b.dataset).some((k) => k.startsWith("booking")))
      return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const d = b.dataset;
    void (async () => {
      if (d.bookingRemove !== undefined) {
        this.stops.splice(Number(d.bookingRemove), 1);
        this.render(true);
        return;
      }
      if (d.bookingPlace !== undefined) {
        const p = this.places[Number(d.bookingPlace)];
        if (p && this.stops.length < 3) this.stops.push(p);
        this.places = [];
        this.stopQuery = "";
        this.render(true);
        return;
      }
      if (d.bookingAction === "search-stop") {
        const seq = ++this.searching;
        const points = await api.request<Point[]>(
          `/api/places?area_id=${encodeURIComponent(this.area() || "")}&q=${encodeURIComponent(this.stopQuery)}`,
        );
        if (seq !== this.searching) return;
        this.places = points;
        this.status = points.length ? "Select a stop" : "No matching places";
        this.render(true);
        return;
      }
      if (d.bookingAction === "stop-voice") {
        this.recognition?.stop();
        return;
      }
      if (d.bookingAction === "voice") {
        const Speech =
          (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition;
        if (!Speech)
          throw new Error(
            "Voice recognition is unavailable on this device. Type your destination instead.",
          );
        this.recognition?.stop();
        const rec: Recognition = new Speech();
        this.recognition = rec;
        rec.lang = "en-IN";
        rec.interimResults = false;
        rec.onresult = (ev) => {
          if (this.bridge.read().modal !== "voice") return;
          const text = String(ev.results[0][0].transcript);
          this.bridge.update({ modal: null });
          this.voice(text);
        };
        rec.onerror = (ev) => {
          this.status = `Microphone: ${ev.error}. You can type your destination.`;
          this.render(true);
        };
        rec.onend = () => {
          this.recognition = undefined;
        };
        rec.start();
        this.status = "Listening…";
        this.render(true);
        return;
      }
      if (d.bookingAction === "save") {
        if (
          this.tripType === "rental" &&
          (!Number.isInteger(this.rentalHours) ||
            this.rentalHours < 1 ||
            this.rentalHours > 12)
        )
          throw new Error("Choose 1–12 rental hours.");
        if (
          this.tripType === "outstation" &&
          (!Number.isInteger(this.tripDays) ||
            this.tripDays < 1 ||
            this.tripDays > 10)
        )
          throw new Error("Choose 1–10 trip days.");
        if (this.passengerName && this.familyId)
          throw new Error(
            "Choose either a family member or a named passenger.",
          );
        if (
          this.scheduleAt &&
          (this.tripType !== "city" ||
            this.stops.length ||
            this.promo ||
            this.share ||
            this.pink ||
            this.offer ||
            this.passengerName ||
            this.familyId ||
            this.favoriteFirst)
        )
          throw new Error(
            "Scheduled city rides do not support these additional options in the current backend.",
          );
        this.status = "";
        this.bridge.update({
          modal: null,
          tripType: this.tripType,
          stops: this.stops.map((p) => p.label),
          promo: !!this.promo,
          pink: this.pink,
          share: this.share,
          offer: this.offer,
          who: this.familyId ? "A family member" : this.passengerName || "Me",
          schedule: this.scheduleAt
            ? new Date(this.scheduleAt).toLocaleString("en-IN")
            : "Now",
        });
        await this.changed();
      }
    })().catch((err) => {
      this.status = err.message;
      this.bridge.notify(this.status);
      this.render(true);
    });
  };
}
