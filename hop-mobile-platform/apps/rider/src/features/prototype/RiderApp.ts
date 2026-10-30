import { icon } from "@shared/icons";
import { escape, money, img, mapArt, notify } from "@shared/helpers";
import { VehicleCategory, VehicleOption, Place, CommuteCorridor } from "@shared/types";


export interface RiderState {
  screen: string;
  backStack: string[];
  modal: string | null;
  vehicle: VehicleCategory;
  pickup: string;
  destination: string;
  search: string;
  stops: string[];
  tripType: string;
  payment: string;
  balance: number;
  promo: boolean;
  who: string;
  share: boolean;
  pink: boolean;
  favouriteFirst: boolean;
  offer: string;
  schedule: string;
  phase: "none" | "requested" | "matching" | "accepted" | "arrived" | "in_progress" | "completed" | "cancelled";
  activity: string;
  rating: number;
  chats: Array<{ sender: "mine" | "partner"; text: string }>;
  saved: string[];
  family: string[];
  toggled: Record<string, boolean>;
  amount: number;
  usual: { destination: string; vehicle: VehicleCategory; payment: string };
  quoteRefreshed: boolean;
  routeAlternative: "fastest" | "omr";
  commuteTab: "find" | "offer";
  commuteReserved: string[];
  commuteCorridorFilter: "all" | "omr" | "guindy" | "ambattur";
  form: Record<string, string>;
}

export const vehicleData: VehicleOption[] = [
  {
    id: "auto",
    name: "Hop Auto",
    caption: "Everyday quick rides at standard metered fares.",
    price: 148,
    eta: "2 min",
    seats: 3,
  },
  {
    id: "bike",
    name: "Hop Moto",
    caption: "Beat the traffic, solo & swift.",
    price: 85,
    eta: "1 min",
    seats: 1,
  },
  {
    id: "mini",
    name: "Hop Mini",
    caption: "Compact air-conditioned city rides.",
    price: 210,
    eta: "4 min",
    seats: 4,
  },
  {
    id: "sedan",
    name: "Hop Prime Sedan",
    caption: "Spacious sedans with top-rated captains.",
    price: 268,
    eta: "3 min",
    seats: 4,
  },
  {
    id: "suv",
    name: "Hop Prime SUV",
    caption: "Extra legroom & luggage space for family trips.",
    price: 557,
    eta: "7 min",
    seats: 6,
  },
];

export const places: Place[] = [
  { name: "Chennai Airport", detail: "Departures · Terminal 1", icon: "location" },
  { name: "Chennai Central", detail: "Pickup bay · Poonamallee High Road", icon: "navigation" },
  { name: "T. Nagar", detail: "Pondy Bazaar · Chennai", icon: "pin" },
  { name: "Marina Beach", detail: "Light House entrance · Chennai", icon: "pin" },
  { name: "Home", detail: "2nd Cross Street, Adyar", icon: "home" },
  { name: "Work", detail: "Olympia Tech Park, Guindy", icon: "briefcase" },
];

export const commuteCorridors: CommuteCorridor[] = [
  {
    id: "c1",
    corridor: "omr",
    name: "Adyar ⇄ OMR IT Expressway",
    sub: "Tidel Park · Ascendas · RMZ Millenia",
    time: "8:30 AM ± 10 min",
    days: "Mon–Fri",
    captain: "Vikram R.",
    rating: "4.9",
    trips: "420 commutes",
    car: "Honda City · White",
    seatsTotal: 4,
    seatsLeft: 2,
    price: 65,
    badge: "Verified IT Pass",
  },
  {
    id: "c2",
    corridor: "guindy",
    name: "Velachery ⇄ Olympia Tech Park",
    sub: "Guindy Industrial Estate · Ekkattuthangal",
    time: "9:00 AM ± 10 min",
    days: "Mon–Fri",
    captain: "Priya S.",
    rating: "5.0",
    trips: "180 commutes",
    car: "Hyundai i20 · Grey",
    seatsTotal: 3,
    seatsLeft: 1,
    price: 55,
    badge: "Women-only ride",
  },
  {
    id: "c3",
    corridor: "ambattur",
    name: "Anna Nagar ⇄ Ambattur Tech Zone",
    sub: "Prince Info Park · One Indiabulls",
    time: "8:45 AM ± 10 min",
    days: "Mon–Fri",
    captain: "Karthik N.",
    rating: "4.8",
    trips: "95 commutes",
    car: "Tata Nexon EV · Blue",
    seatsTotal: 4,
    seatsLeft: 3,
    price: 70,
    badge: "Green EV Corridor",
  },
];

export class RiderApp {
  private container: HTMLElement;
  private state: RiderState;

  constructor(container: HTMLElement) {
    this.container = container;
    this.state = {
      screen: "home",
      backStack: [],
      modal: null,
      vehicle: "auto",
      pickup: "2nd Cross Street, Adyar",
      destination: "Chennai Airport",
      search: "",
      stops: [],
      tripType: "city",
      payment: "Wallet",
      balance: 500,
      promo: false,
      who: "Me",
      share: false,
      pink: false,
      favouriteFirst: false,
      offer: "",
      schedule: "Now",
      phase: "none",
      activity: "Past",
      rating: 0,
      chats: [],
      saved: ["Home", "Work"],
      family: [],
      toggled: { notifications: true },
      amount: 500,
      usual: { destination: "Work", vehicle: "auto", payment: "Wallet" },
      quoteRefreshed: false,
      routeAlternative: "fastest",
      commuteTab: "find",
      commuteReserved: [],
      commuteCorridorFilter: "all",
      form: {},
    };

    this.bindEvents();
    this.render();
  }

  get currentVehicle(): VehicleOption {
    return vehicleData.find((item) => item.id === this.state.vehicle) || vehicleData[0];
  }

  get calculatedPrice(): number {
    return Math.max(20, this.currentVehicle.price - (this.state.promo ? 50 : 0));
  }

  public go(screen: string, replace = false): void {
    if (!replace && screen !== this.state.screen) {
      this.state.backStack.push(this.state.screen);
    }
    this.state.screen = screen;
    this.state.modal = null;
    this.state.search = "";
    this.render();
  }

  public back(): void {
    if (this.state.modal) {
      this.state.modal = null;
      this.render();
      return;
    }
    if (this.state.backStack.length > 0) {
      this.state.screen = this.state.backStack.pop()!;
      this.render();
    } else {
      this.go("home");
    }
  }

  public openModal(name: string): void {
    this.state.modal = name;
    this.render();
  }

  public closeModal(): void {
    this.state.modal = null;
    this.render();
  }

  private header(title = "", hasBack = false, isBrand = false): string {
    const brand = isBrand
      ? `<span class="brand" data-go="home"><span class="brand-badge">h</span> hop</span>`
      : "";
    const backBtn = hasBack
      ? `<button class="icon-button header-back" aria-label="Go back" data-action="back">${icon("back")}</button>`
      : "";
    const rightActions = `
      <div class="header-right">
        <button class="icon-button" aria-label="Hop Commute" data-go="commute">${icon("layers")}</button>
        <button class="icon-button" aria-label="Safety Centre" data-go="safety">${icon("shield")}</button>
        <button class="icon-button" aria-label="Notifications" data-go="notifications">${icon("bell")}</button>
      </div>
    `;

    return `
      <header class="app-header">
        <div class="header-left">
          ${backBtn}
          ${brand}
          ${title && !isBrand ? `<h1 class="header-title">${escape(title)}</h1>` : ""}
        </div>
        ${rightActions}
      </header>
    `;
  }

  private journeyRibbon(): string {
    const sequence = ["choose", "confirm", "matching", "tracking", "receipt"];
    const labels = ["Choose", "Confirm", "Dispatch", "On trip", "Receipt"];
    const current = sequence.indexOf(this.state.screen);
    if (current === -1) return "";

    return `
      <nav class="journey-ribbon" aria-label="Journey progress">
        <ol>
          ${labels
            .map(
              (label, index) => `
            <li class="${index < current ? "complete" : index === current ? "current" : ""}" ${
                index === current ? 'aria-current="step"' : ""
              }>
              <span class="journey-dot" aria-hidden="true">${index < current ? "✓" : ""}</span>
              <span>${label}</span>
            </li>`
            )
            .join("")}
        </ol>
      </nav>
    `;
  }

  private nav(active: string): string {
    const items = [
      ["home", "home", "Ride"],
      ["activity", "clock", "Activity"],
      ["wallet", "wallet", "Wallet"],
      ["account", "user", "Account"],
    ];

    return `
      <nav class="bottom-nav" aria-label="Main navigation">
        ${items
          .map(
            ([id, ico, label]) => `
          <button class="nav-item ${active === id ? "active" : ""}" data-go="${id}">
            ${icon(ico)}
            <span>${label}</span>
          </button>`
          )
          .join("")}
      </nav>
    `;
  }

  private primary(text: string, action: string, extraCls = ""): string {
    return `<button class="primary ${extraCls}" data-action="${action}">${escape(text)}</button>`;
  }

  private row(title: string, detail: string, ico: string, screen: string, right = ""): string {
    return `
      <button class="list-row" data-go="${screen}">
        <span class="list-icon">${icon(ico)}</span>
        <span class="list-text"><strong>${escape(title)}</strong><small>${escape(detail)}</small></span>
        ${right ? `<span class="row-right">${right}</span>` : icon("chevron")}
      </button>
    `;
  }

  private modalRow(title: string, detail: string, ico: string, modal: string, right = ""): string {
    return `
      <button class="list-row" data-modal="${modal}">
        <span class="list-icon">${icon(ico)}</span>
        <span class="list-text"><strong>${escape(title)}</strong><small>${escape(detail)}</small></span>
        ${right ? `<span class="row-right">${right}</span>` : icon("chevron")}
      </button>
    `;
  }

  private toggle(title: string, detail: string, key: string): string {
    const on = !!this.state.toggled[key];
    return `
      <label class="toggle-row">
        <span><strong>${escape(title)}</strong><small>${escape(detail)}</small></span>
        <input type="checkbox" data-toggle="${key}" ${on ? "checked" : ""} aria-label="${escape(title)}"/>
      </label>
    `;
  }

  private routeLines(): string {
    return `
      <div class="confirm-route">
        <div class="route-line">
          <span class="location-dot"></span>
          <strong>${escape(this.state.pickup)}</strong>
        </div>
        ${this.state.stops
          .map(
            (stop) => `
          <div class="route-line">
            <span class="location-dot stop"></span>
            <strong>${escape(stop)}</strong>
          </div>`
          )
          .join("")}
        <div class="route-line">
          <span class="location-dot destination"></span>
          <strong>${escape(this.state.destination)}</strong>
        </div>
      </div>
    `;
  }

  private fareBreakdown(): string {
    const base = this.currentVehicle.price;
    const discount = this.state.promo ? 50 : 0;
    const total = Math.max(20, base - discount);

    return `
      <div class="fare-rows">
        <div class="fare-row"><span>Base & distance fare</span><strong>${money(base)}</strong></div>
        ${discount ? `<div class="fare-row promo"><span>HOP50 promotional credit</span><strong>−${money(discount)}</strong></div>` : ""}
        <div class="fare-row"><span>Taxes & platform fee</span><strong class="muted">Included</strong></div>
        <div class="fare-row total"><span>Total payable</span><strong>${money(total)}</strong></div>
      </div>
    `;
  }

  private vehicleRows(): string {
    return `
      <div class="vehicle-list">
        ${vehicleData
          .map((v) => {
            const selected = v.id === this.state.vehicle;
            const priceVal = v.price - (this.state.promo ? 50 : 0);
            return `
            <button class="vehicle-card ${selected ? "selected" : ""}" data-vehicle="${v.id}" role="radio" aria-checked="${selected}">
              ${img(v.id, 64)}
              <div class="vehicle-details">
                <div class="vehicle-top">
                  <strong>${v.name}</strong>
                  <span class="vehicle-eta">${icon("clock", "tiny-icon")} ${v.eta} away</span>
                </div>
                <p class="vehicle-caption">${v.caption}</p>
                <div class="vehicle-meta">
                  <span class="badge seats">${icon("user", "tiny-icon")} ${v.seats} seats</span>
                  <span class="badge neutral">Fastest pickup</span>
                </div>
              </div>
              <div class="vehicle-pricing">
                <span class="vehicle-price">${money(priceVal)}</span>
                ${this.state.promo ? `<small class="strike">${money(v.price)}</small>` : ""}
              </div>
            </button>`;
          })
          .join("")}
      </div>
    `;
  }

  private placeResults(query: string): string {
    const q = (query || "").toLowerCase();
    const filtered = places.filter(
      (p) => p.name.toLowerCase().includes(q) || p.detail.toLowerCase().includes(q)
    );

    if (filtered.length === 0) {
      return `
        <div class="empty-state">
          ${icon("search")}
          <h2>Try another location</h2>
          <p>Search across Chennai landmarks, Metro stations, or office tech parks.</p>
        </div>
      `;
    }

    return filtered
      .map(
        (p) => `
      <button class="list-row place-row" data-destination="${escape(p.name)}">
        <span class="list-icon">${icon(p.icon)}</span>
        <span class="list-text">
          <strong>${escape(p.name)}</strong>
          <small>${escape(p.detail)}</small>
        </span>
        ${icon("chevron")}
      </button>`
      )
      .join("");
  }

  private renderScreen(): { title?: string; back?: boolean; brand?: boolean; map?: boolean; nav?: string; body: string; action?: string } {
    switch (this.state.screen) {
      case "home":
        return {
          brand: true,
          map: true,
          nav: "home",
          body: `
            ${mapArt(false, false, "rider", "home")}
            <div class="map-bubble" style="left:18px;top:19px;display:flex;align-items:center;gap:6px">
              ${icon("pin", "tiny-icon")} Chennai <span class="muted">⌄</span>
            </div>
            <div class="sheet home-sheet">
              <div class="sheet-handle"></div>
              <div class="home-heading">
                <span class="home-greeting">A LITTLE CLOSER, WITH HOP</span>
                <h2>Where to next?</h2>
              </div>
              <p class="subline">Your city. Your people. Your way.</p>
              
              <button class="destination-search" data-go="search">
                ${icon("search")}
                <span style="flex:1">Where are you going?</span>
                <span class="round">${icon("arrow")}</span>
              </button>

              <div class="shortcut-grid">
                <button class="shortcut" data-destination="Home">
                  ${icon("home")}
                  <span><strong>Home</strong><small>2nd Cross Street</small></span>
                </button>
                <button class="shortcut" data-destination="Work">
                  ${icon("briefcase")}
                  <span><strong>Work</strong><small>Olympia Tech Park</small></span>
                </button>
              </div>

              <div class="product-row">
                <button class="product-chip active" data-go="search">City ride</button>
                <button class="product-chip" data-go="commute">Hop Commute</button>
                <button class="product-chip" data-triptype="rental">Hourly rental</button>
                <button class="product-chip" data-triptype="outstation">Outstation</button>
              </div>

              <button class="usual-ride" data-action="usual-ride">
                <span class="usual-mark">${icon("refresh")}</span>
                <span>
                  <small>MY USUAL RIDE</small>
                  <strong>${escape(this.state.usual.destination)}</strong>
                  <span>Auto-rickshaw · ${this.state.usual.payment}</span>
                </span>
                <span class="usual-arrow">${icon("arrow")}</span>
              </button>
            </div>
          `,
        };

      case "search":
        return {
          title: "Where are you going?",
          back: true,
          body: `
            <div class="screen-padding">
              <div class="route-fields">
                <div class="route-field">
                  <i class="location-dot"></i>
                  <div style="flex:1">
                    <small>Pickup location</small>
                    <input id="pickup-input" aria-label="Pickup location" value="${escape(this.state.pickup)}"/>
                  </div>
                  <button class="icon-button flat" aria-label="Use current location" data-action="current-location">
                    ${icon("target")}
                  </button>
                </div>
                <div class="route-field">
                  <i class="location-dot destination"></i>
                  <div style="flex:1">
                    <small>Destination</small>
                    <input id="destination-input" aria-label="Search destination" placeholder="Search a place or address" value="${escape(this.state.search)}" autocomplete="off" autofocus/>
                  </div>
                  <button class="icon-button flat" aria-label="Voice booking" data-modal="voice">
                    ${icon("mic")}
                  </button>
                </div>
              </div>

              <div class="row" style="margin-top:8px">
                <button class="text-button" data-modal="stops">
                  ${icon("plus", "tiny-icon")} Add a stop${this.state.stops.length ? ` (${this.state.stops.length})` : ""}
                </button>
                <button class="text-button" data-go="plan">
                  ${icon("calendar", "tiny-icon")} ${escape(this.state.schedule)}
                </button>
              </div>

              <div class="section-label" style="display:flex;justify-content:space-between;margin-top:14px">
                <span>SAVED & RECENT</span>
                <button class="text-button" data-go="saved" style="font-size:11px">Manage places</button>
              </div>

              <div id="place-results">
                ${this.placeResults(this.state.search)}
              </div>
            </div>
          `,
        };

      case "choose":
        const isOmr = this.state.routeAlternative === "omr";
        const routeKm = isOmr ? "10.2 km" : "8.6 km";
        const routeTime = isOmr ? "26 min" : "22 min";
        return {
          title: "Choose your ride",
          back: true,
          map: true,
          body: `
            ${mapArt(true, false, "rider", "choose")}
            <div class="route-pill">
              ${icon("pin")}
              <strong>${escape(this.state.pickup.split(",")[0])} → ${escape(this.state.destination)}</strong>
              <button data-go="search">Edit</button>
            </div>
            <div class="sheet choose-sheet">
              <div class="sheet-handle"></div>
              <div class="row" style="align-items:center">
                <h2>A ride that fits.</h2>
                <span class="badge neutral">Sample fares</span>
              </div>
              <p class="subline">${routeKm} · about ${routeTime} via ${isOmr ? "OMR (Toll free)" : "Guindy"}</p>
              
              <div class="route-alt-row" role="radiogroup" aria-label="Route alternative">
                <button class="route-alt-chip ${!isOmr ? "active" : ""}" data-route-alt="fastest" role="radio" aria-checked="${!isOmr}">
                  <span>Fastest</span>
                  <strong>22 min</strong>
                  <small>8.6 km · via Guindy</small>
                </button>
                <button class="route-alt-chip ${isOmr ? "active" : ""}" data-route-alt="omr" role="radio" aria-checked="${isOmr}">
                  <span>Via OMR</span>
                  <strong>26 min</strong>
                  <small>10.2 km · Toll free</small>
                </button>
              </div>

              <div role="radiogroup" aria-label="Vehicle options">
                ${this.vehicleRows()}
              </div>
            </div>
          `,
          action: `
            <button class="footer-price fare-trigger" data-modal="fare">
              <span>${this.currentVehicle.name} · ${this.currentVehicle.eta} away</span>
              <strong>${money(this.calculatedPrice)}</strong>
              ${icon("chevron", "tiny-icon")}
            </button>
            ${this.primary("Continue", "review")}
          `,
        };

      case "confirm":
        return {
          title: "Review your ride",
          back: true,
          map: true,
          body: `
            ${mapArt(true, false, "rider", "confirm")}
            <div class="sheet confirm-sheet">
              <div class="sheet-handle"></div>
              <h2>Ready when you are.</h2>
              <p class="subline">Review your details before booking.</p>
              
              ${this.routeLines()}

              <div class="confirm-options">
                <button class="option-pill" data-modal="payment">
                  ${icon("wallet", "tiny-icon")}
                  <span><strong>${escape(this.state.payment)}</strong><small>Change payment</small></span>
                </button>
                <button class="option-pill" data-modal="promo">
                  ${icon("gift", "tiny-icon")}
                  <span><strong>${this.state.promo ? "HOP50 applied" : "Add promo"}</strong><small>${this.state.promo ? "−₹50 discount" : "Coupons"}</small></span>
                </button>
                <button class="option-pill" data-modal="passenger">
                  ${icon("user", "tiny-icon")}
                  <span><strong>${escape(this.state.who)}</strong><small>Change passenger</small></span>
                </button>
                <button class="option-pill" data-modal="options">
                  ${icon("settings", "tiny-icon")}
                  <span><strong>Ride options</strong><small>${this.state.share ? "Shared" : "Standard"}</small></span>
                </button>
              </div>

              <div class="section-card" style="margin-top:14px">
                <div class="row">
                  <div>
                    <strong style="font-size:15px">${this.currentVehicle.name}</strong>
                    <p class="micro muted" style="margin-top:2px">${this.currentVehicle.seats} seats · Pickup in ${this.currentVehicle.eta}</p>
                  </div>
                  ${img(this.state.vehicle, 52)}
                </div>
              </div>
            </div>
          `,
          action: `
            <button class="footer-price fare-trigger" data-modal="fare">
              <span>Total fare estimate</span>
              <strong>${money(this.calculatedPrice)}</strong>
              ${icon("chevron", "tiny-icon")}
            </button>
            ${this.primary(this.state.schedule === "Now" ? "Request ride" : "Schedule ride", "request")}
            <p class="fineprint">Review your quote before booking. Authoritative dispatch runs on Hop backend.</p>
          `,
        };

      case "matching":
        return {
          title: "Finding your captain",
          back: false,
          map: true,
          body: `
            ${mapArt(true, false, "rider", "matching")}
            <div class="sheet">
              <div class="sheet-handle"></div>
              <div class="tracking-heading">
                <h2>You’re in good hands.</h2>
                <div class="eta">⌁<small>Searching</small></div>
              </div>
              <p class="subline" style="margin-top:8px">Your request is looking for a nearby ${this.currentVehicle.name.toLowerCase()}.</p>

              <div class="matching-radar-status">
                <div class="radar-spinner"></div>
                <div>
                  <strong style="font-size:12px">Broadcasting to 4 nearby Captains...</strong>
                  <small style="display:block;color:var(--muted);font-size:10px">OMR Corridor · First captain to accept wins</small>
                </div>
              </div>

              ${this.routeLines()}

              <div class="row" style="margin-top:12px">
                <span class="small muted">Requested fare</span>
                <strong>${money(this.calculatedPrice)}</strong>
              </div>

              <div class="handoff-box">
                <div class="row" style="margin-bottom:4px">
                  <span class="badge green" style="font-size:9px">● Dispatch Dispatched</span>
                  <span class="micro muted">Simulate Captain Role</span>
                </div>
                <p class="micro" style="margin:0 0 8px;color:var(--muted)">
                  Captain Suresh received this incoming request (${money(this.calculatedPrice)}).
                </p>
                <div style="display:flex;flex-direction:column;gap:5px">
                  <button class="primary small" data-action="simulate-other-captain-accept" style="width:100%;font-size:11px">
                    ⚡ Simulate: Captain accepts offer →
                  </button>
                </div>
              </div>

              <div class="circle-actions" style="margin-top:14px">
                <button data-modal="cancel">${icon("close")}Cancel request</button>
                <button data-modal="bids">${icon("chat")}Fare offers</button>
                <button data-go="safety">${icon("shield")}Safety</button>
              </div>
            </div>
          `,
        };

      case "tracking":
        return {
          title: this.state.phase === "in_progress" ? "On your way" : "Your captain is coming",
          back: false,
          map: true,
          body: `
            ${mapArt(true, true, "rider", "tracking")}
            <div class="sheet">
              <div class="sheet-handle"></div>
              <div class="tracking-heading">
                <h2>${
                  this.state.phase === "in_progress"
                    ? "Next stop: your plans."
                    : this.state.phase === "arrived"
                    ? "Your captain is here."
                    : "Meet Arun in 3 min."
                }</h2>
                <div class="eta">
                  ${this.state.phase === "in_progress" ? "18" : this.state.phase === "arrived" ? "0" : "3"}
                  <small>min</small>
                </div>
              </div>

              <div class="driver-card">
                <span class="avatar driver">A</span>
                <span class="driver-text">
                  <strong>Arun Kumar <span class="small muted">★ 4.9</span></strong>
                  <small>${this.currentVehicle.name} · Verified captain</small>
                  <span class="plate">TN 09 AB 1234</span>
                </span>
                ${img(this.state.vehicle, 60)}
              </div>

              ${
                this.state.phase !== "in_progress"
                  ? `<div class="pin-code ${this.state.phase === "arrived" ? "highlight" : ""}">
                      <span class="small">
                        ${this.state.phase === "arrived" ? "Share OTP with Captain to begin trip" : "Your pickup code"}
                        <small class="muted" style="display:block;font-size:9px;margin-top:3px">Share only when you meet your captain</small>
                      </span>
                      <strong>431602</strong>
                    </div>`
                  : this.routeLines()
              }

              <div class="circle-actions" style="margin-top:14px">
                <button data-modal="call">${icon("phone")}Call captain</button>
                <button data-go="chat">${icon("chat")}Message</button>
                <button data-go="safety">${icon("shield")}Safety</button>
              </div>

              <div style="display:flex;gap:8px;margin-top:12px">
                <button class="secondary" style="flex:1" data-action="simulate-trip-step">
                  ${this.state.phase === "accepted" ? "Simulate: Captain Arrives" : this.state.phase === "arrived" ? "Simulate: Start Trip" : "Simulate: Complete Trip"}
                </button>
                <button class="secondary" style="flex:1" data-modal="${this.state.phase === "in_progress" ? "share" : "cancel"}">
                  ${this.state.phase === "in_progress" ? "Share trip" : "Cancel"}
                </button>
              </div>
            </div>
          `,
        };

      case "receipt":
        return {
          title: "Trip details",
          back: true,
          body: `
            <div class="screen-padding">
              <div class="receipt-total">
                <span class="check-circle">${icon("check")}</span>
                <p>Thanks for riding with Hop.</p>
                <h2>${money(this.calculatedPrice)}</h2>
                <span class="badge green">${this.state.payment === "Cash" ? "Captain reported cash received" : "Payment confirmed"}</span>
              </div>

              <div class="section-card">
                ${this.routeLines()}
                ${this.fareBreakdown()}
              </div>

              <div class="row" style="margin-top:18px;align-items:center">
                <span>
                  <strong class="small">How was your ride?</strong>
                  <small style="display:block" class="micro muted">Sample trip · 8.6 km · 22 min</small>
                </span>
                <span class="avatar">A</span>
              </div>

              <div class="stars" aria-label="Trip rating">
                ${[1, 2, 3, 4, 5]
                  .map(
                    (n) => `
                  <button class="${n <= this.state.rating ? "active" : ""}" data-rating="${n}" aria-label="${n} stars">★</button>`
                  )
                  .join("")}
              </div>

              ${this.row("Download trip statement", "Preview your receipt and payment status", "download", "statement")}
              ${this.row("Something wasn’t right?", "Report an issue or a lost item", "help", "support")}
            </div>
          `,
          action: this.primary("Done", "receipt-done"),
        };

      case "statement":
        return {
          title: "Trip statement",
          back: true,
          body: `
            <div class="screen-padding">
              <div class="section-card" style="margin:12px 0">
                <div class="row">
                  <h2 style="font-size:22px">hop</h2>
                  <span class="badge neutral">Official Receipt</span>
                </div>
                <p class="small muted" style="margin-top:20px">TRIP STATEMENT · HOP-DEMO-028</p>
                <p class="small" style="margin-top:14px">Demo Rider · ${escape(this.state.destination)}</p>
                ${this.fareBreakdown()}
                <p class="micro muted" style="margin-top:12px">Authorized receipt voucher generated from Hop Platform.</p>
              </div>
              ${this.modalRow("Business receipt details", "Company, GSTIN and cost centre", "briefcase", "business")}
            </div>
          `,
          action: this.primary("Share receipt statement", "save-statement"),
        };

      case "commute":
        const filteredCommute =
          this.state.commuteCorridorFilter === "all"
            ? commuteCorridors
            : commuteCorridors.filter((c) => c.corridor === this.state.commuteCorridorFilter);

        return {
          title: "Hop Commute",
          back: true,
          body: `
            <div class="screen-padding">
              <div class="commute-hero">
                <div class="row">
                  <div>
                    <span class="home-greeting">OFFICE CORRIDORS</span>
                    <h2>Hop Commute</h2>
                  </div>
                  <span class="badge" style="background:#eaf5ec;color:#236e3d">Shared Ride</span>
                </div>
                <p class="small muted" style="margin-top:6px">Share an existing daily route with verified coworkers. Low cost, zero surge, guaranteed seats.</p>
              </div>

              <div class="tabs" style="margin:14px 0 10px">
                <button class="${this.state.commuteTab === "find" ? "active" : ""}" data-commute-tab="find">Find a commute</button>
                <button class="${this.state.commuteTab === "offer" ? "active" : ""}" data-commute-tab="offer">Publish route</button>
              </div>

              ${
                this.state.commuteTab === "find"
                  ? `
                <div class="commute-filters">
                  <button class="product-chip ${this.state.commuteCorridorFilter === "all" ? "active" : ""}" data-commute-filter="all">All corridors</button>
                  <button class="product-chip ${this.state.commuteCorridorFilter === "omr" ? "active" : ""}" data-commute-filter="omr">OMR IT</button>
                  <button class="product-chip ${this.state.commuteCorridorFilter === "guindy" ? "active" : ""}" data-commute-filter="guindy">Guindy</button>
                  <button class="product-chip ${this.state.commuteCorridorFilter === "ambattur" ? "active" : ""}" data-commute-filter="ambattur">Ambattur</button>
                </div>
                <div class="commute-list">
                  ${filteredCommute
                    .map(
                      (item) => `
                    <div class="commute-card section-card">
                      <div class="row">
                        <strong style="font-size:14px">${escape(item.name)}</strong>
                        <span class="badge ${item.badge.includes("Women") ? "coral" : "neutral"}">${escape(item.badge)}</span>
                      </div>
                      <p class="micro muted" style="margin:3px 0 8px">${escape(item.sub)}</p>
                      <div class="commute-meta-grid">
                        <span>${icon("clock", "tiny-icon")} <strong>${escape(item.time)}</strong></span>
                        <span>${icon("car", "tiny-icon")} ${escape(item.car)}</span>
                        <span>${icon("user", "tiny-icon")} ${escape(item.captain)} ★ ${item.rating}</span>
                        <span>${icon("pin", "tiny-icon")} Meeting: Main Gate</span>
                      </div>
                      <div class="row" style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line);align-items:center">
                        <div>
                          <span class="amount" style="font-size:18px">₹${item.price}</span>
                          <small class="muted" style="display:block;font-size:9px">per seat · shared cost</small>
                        </div>
                        <div>
                          <span class="seats-left-pill ${item.seatsLeft <= 1 ? "urgent" : ""}">
                            ${this.state.commuteReserved.includes(item.id) ? "Reserved ✓" : `${item.seatsLeft} of ${item.seatsTotal} seats left`}
                          </span>
                          <button class="${this.state.commuteReserved.includes(item.id) ? "secondary" : "primary"}" style="min-height:36px;padding:0 12px;font-size:11px;margin-left:6px" data-reserve-commute="${item.id}">
                            ${this.state.commuteReserved.includes(item.id) ? "Cancel seat" : "Reserve seat"}
                          </button>
                        </div>
                      </div>
                    </div>`
                    )
                    .join("")}
                </div>
                <div class="notice-box" style="margin-top:14px">
                  Hop Commute facilitates legitimate cost-sharing for regular office commutes in compliance with non-commercial guidelines.
                </div>
              `
                  : `
                <div class="section-card">
                  <strong class="small">Share your regular office drive</strong>
                  <p class="micro muted" style="margin:4px 0 14px">Publish your route to offset fuel costs with verified coworkers.</p>
                  <label class="field-label" for="commute-origin">Starting area</label>
                  <input class="text-input" id="commute-origin" value="Adyar, Chennai"/>
                  <label class="field-label" for="commute-work">Work Tech Park</label>
                  <input class="text-input" id="commute-work" value="Olympia Tech Park, Guindy"/>
                  <label class="field-label" for="commute-time">Departure time (Morning)</label>
                  <input class="text-input" id="commute-time" type="time" value="08:30"/>
                  <label class="field-label" for="commute-seats">Available seats</label>
                  <select class="text-input" id="commute-seats">
                    <option>1 seat</option>
                    <option selected>2 seats</option>
                    <option>3 seats</option>
                  </select>
                  <button class="primary" style="margin-top:14px;width:100%" data-action="publish-commute">Publish commute route</button>
                </div>
              `
              }
            </div>
          `,
        };

      case "activity":
        return {
          title: "Your rides",
          nav: "activity",
          body: `
            <div class="screen-padding">
              <div class="tabs" role="tablist" aria-label="Ride history">
                ${["Ongoing", "Upcoming", "Past"]
                  .map(
                    (tab) => `
                  <button role="tab" aria-selected="${this.state.activity === tab}" class="${this.state.activity === tab ? "active" : ""}" data-activity="${tab}">${tab}</button>`
                  )
                  .join("")}
              </div>

              ${
                this.state.activity === "Ongoing"
                  ? this.state.phase !== "none" && this.state.phase !== "completed"
                    ? `
                  <div class="activity-card">
                    <div class="row">
                      <span class="badge">${this.state.phase.replace("_", " ")}</span>
                      <strong>${money(this.calculatedPrice)}</strong>
                    </div>
                    ${this.routeLines()}
                    <button data-go="tracking">Track your trip →</button>
                  </div>`
                    : `
                  <div class="empty-state">
                    ${icon("car")}
                    <h2>No trips right now.</h2>
                    <p>Your next little adventure is a ride away.</p>
                    <button class="primary" data-go="home">Book a ride</button>
                  </div>`
                  : this.state.activity === "Upcoming"
                  ? `
                  <div class="activity-card">
                    <div class="row">
                      <span class="badge warn">Scheduled</span>
                      <span class="activity-date">Tomorrow, 06:30</span>
                    </div>
                    ${this.routeLines()}
                    <div class="row" style="margin-top:8px">
                      <button data-go="plan">View schedule →</button>
                      <button data-modal="cancel-schedule">Cancel</button>
                    </div>
                  </div>`
                  : `
                  ${[0, 1, 2]
                    .map(
                      (item) => `
                    <div class="activity-card">
                      <div class="row">
                        <span class="activity-date">${["Today, 09:24", "Yesterday, 18:40", "26 Oct, 08:10"][item]}</span>
                        <span class="badge ${item === 2 ? "neutral" : ""}">${item === 2 ? "Cancelled" : "Completed"}</span>
                      </div>
                      <div class="row">
                        <span class="small">${img(item === 1 ? "sedan" : "auto", 35)} ${item === 1 ? "Sedan" : "Auto-rickshaw"}</span>
                        <strong>${["₹268", "₹426", "—"][item]}</strong>
                      </div>
                      <div class="route-line"><i class="location-dot"></i><strong>Adyar, Chennai</strong></div>
                      <div class="route-line"><i class="location-dot destination"></i><strong>${item === 1 ? "Olympia Tech Park" : "Chennai Airport"}</strong></div>
                      <div class="row" style="margin:4px 0 0">
                        <button data-go="${item === 2 ? "support" : "receipt"}">${item === 2 ? "Get help" : "Receipt & details"} →</button>
                        <button data-action="rebook">Ride again</button>
                      </div>
                    </div>`
                    )
                    .join("")}
                `
              }
            </div>
          `,
        };

      case "wallet":
        return {
          title: "Wallet & offers",
          nav: "wallet",
          body: `
            <div class="screen-padding">
              <div class="wallet-hero">
                ${icon("wallet")}
                <small>YOUR HOP WALLET</small>
                <div class="amount">${money(this.state.balance)}<span style="font-size:19px;opacity:.5">.00</span></div>
                <button data-modal="topup">${icon("plus", "tiny-icon")} Add money</button>
              </div>

              <div class="shortcut-grid" style="margin:16px 0">
                <button class="shortcut" data-modal="promo">
                  ${icon("gift")}
                  <span><strong>Offers</strong><small>HOP50 available</small></span>
                </button>
                <button class="shortcut" data-go="rewards">
                  ${icon("star")}
                  <span><strong>Hop Points</strong><small>240 points</small></span>
                </button>
              </div>

              <div class="section-label">Recent transactions</div>
              ${this.modalRow("Ride payment · Auto", "Today, 09:46 · completed", "car", "transaction", "−₹148")}
              ${this.modalRow("Wallet top-up · UPI", "Yesterday · successful", "wallet", "transaction", "+₹500")}
              ${this.modalRow("HOP50 credit", "26 Oct · promo applied", "gift", "transaction", "+₹50")}
            </div>
          `,
        };

      case "account":
        return {
          title: "Account",
          nav: "account",
          body: `
            <div class="screen-padding">
              <div class="driver-card" style="margin:8px 0 16px">
                <span class="avatar">R</span>
                <span class="driver-text">
                  <strong>Demo Rider</strong>
                  <small>+91 98765 43210 · ★ 4.9</small>
                </span>
                <button class="text-button" data-go="personal">Edit</button>
              </div>

              ${this.row("Saved places", "Home, Work and favourite stops", "pin", "saved")}
              ${this.row("Family & favourite captains", "Ride together with priority dispatch", "user", "family")}
              ${this.row("Ride preferences", "Default vehicle, language, night theme", "settings", "preferences")}
              ${this.row("Safety centre", "SOS, trusted contacts and RideCheck", "shield", "safety")}
              ${this.row("Rewards & referrals", "Invite friends and redeem credits", "gift", "rewards")}
              ${this.row("Personal & business details", "Work profiles and GST receipts", "briefcase", "personal")}
              ${this.row("Help & support", "Lost items, trip queries and tickets", "help", "support")}
              ${this.row("Privacy & sign out", "Data control and account management", "lock", "privacy")}
            </div>
          `,
        };

      case "saved":
        return {
          title: "Saved places",
          back: true,
          body: `
            <div class="screen-padding">
              <p class="small muted" style="margin:8px 0 15px">One-tap routes for your frequent destinations.</p>
              ${this.state.saved
                .map(
                  (place, i) => `
                <div class="list-row">
                  <span class="list-icon">${icon(place === "Home" ? "home" : place === "Work" ? "briefcase" : "pin")}</span>
                  <span class="list-text">
                    <strong>${escape(place)}</strong>
                    <small>Frequent shortcut</small>
                  </span>
                  <button class="text-button" data-action="quick-book-saved" data-destination="${escape(place)}">Book</button>
                </div>`
                )
                .join("")}
              ${this.modalRow("Add a new place", "Save a gym, school or favourite spot", "plus", "add-place")}
            </div>
          `,
        };

      case "safety":
        return {
          title: "Safety Centre",
          back: true,
          body: `
            <div class="screen-padding">
              <div class="safety-hero">
                ${icon("shield")}
                <div>
                  <h2>A little peace of mind.</h2>
                  <p>Your safety matters on every journey.</p>
                </div>
              </div>

              <div class="quick-grid">
                <button class="quick-tile quick-tile-emergency" data-modal="sos" aria-label="Emergency Help: Quick incident alert to Hop operator">
                  <div class="quick-tile-icon-badge">${icon("phone")}</div>
                  <strong>Emergency Help</strong>
                  <small>Quick incident alert to Hop operator</small>
                </button>
                <button class="quick-tile" data-modal="share" aria-label="Share Your Trip: Let trusted people follow your live ride">
                  <div class="quick-tile-icon-badge normal">${icon("location")}</div>
                  <strong>Share Your Trip</strong>
                  <small>Let trusted people follow your live ride</small>
                </button>
              </div>

              <div class="section-label" style="margin-top:20px">Your safety toolkit</div>
              ${this.modalRow("Emergency contacts", "Manage trusted contacts", "user", "contacts")}
              ${this.modalRow("Report a safety concern", "Tell us about an incident or driver", "shield", "report")}
              ${this.modalRow("RideCheck™ Safety Monitor", "Anomaly & unexpected stop detection", "shield", "ridecheck")}
              ${this.modalRow("Safety guidance", "Verify your vehicle and pickup code", "book", "safety-guidance")}

              <div class="notice-box" style="margin-top:20px">
                An app SOS creates an operator incident. It does not contact emergency services. For immediate help, use your phone's emergency calling function.
              </div>
            </div>
          `,
        };

      case "chat":
        return {
          title: "Arun · your captain",
          back: true,
          body: `
            <div class="chat">
              <div class="chat-time">Today · trip communication</div>
              <div class="chat-bubble partner">Hi! I’m on my way to your pickup.</div>
              ${this.state.chats
                .map(
                  (c) => `
                <div class="chat-bubble ${c.sender === "mine" ? "mine" : "partner"}">${escape(c.text)}</div>`
                )
                .join("")}
              <div class="product-row" style="margin-top:15px">
                <button class="product-chip" data-quick-chat="I’m at pickup">I’m at pickup</button>
                <button class="product-chip" data-quick-chat="On my way out">On my way out</button>
                <button class="product-chip" data-quick-chat="Wearing blue shirt">Wearing blue shirt</button>
              </div>
            </div>
          `,
          action: `
            <form id="chat-form" class="chat-compose">
              <input id="message-input" class="text-input" aria-label="Message" placeholder="Type a message…" maxlength="500"/>
              <button class="icon-button" aria-label="Send message" type="submit">${icon("send")}</button>
            </form>
          `,
        };

      case "notifications":
        return {
          title: "Notifications",
          back: true,
          body: `
            <div class="screen-padding">
              ${this.modalRow("Special Weekend Pass", "Save 20% on all Prime sedan rides this Saturday", "gift", "notification")}
              ${this.modalRow("Hop Commute is Live!", "Connect with verified tech park colleagues", "layers", "notification")}
              ${this.modalRow("Trip Receipt: Adyar → Airport", "Paid ₹148 via Hop Wallet", "file", "notification")}
            </div>
          `,
        };

      case "privacy":
        return {
          title: "Privacy & account",
          back: true,
          body: `
            <div class="screen-padding">
              ${this.modalRow("Privacy disclosures", "How Hop protects your data", "eye", "privacy-info")}
              ${this.modalRow("Download my data", "Export trip history and profile information", "download", "export")}
              ${this.modalRow("Delete account", "Permanently remove your account and data", "close", "delete-account")}
              ${this.modalRow("Sign out", "Sign out of Hop on this device", "logout", "signout")}
            </div>
          `,
        };

      case "plan":
        return {
          title: "Plan your ride",
          back: true,
          body: `
            <div class="screen-padding">
              <label class="field-label" for="trip-type">Trip type</label>
              <select id="trip-type" class="text-input">
                <option value="city" ${this.state.tripType === "city" ? "selected" : ""}>City ride</option>
                <option value="rental" ${this.state.tripType === "rental" ? "selected" : ""}>Hourly rental</option>
                <option value="outstation" ${this.state.tripType === "outstation" ? "selected" : ""}>Outstation</option>
              </select>

              <label class="field-label" for="ride-time" style="margin-top:12px">When do you need a ride?</label>
              <select id="ride-time" class="text-input">
                <option ${this.state.schedule === "Now" ? "selected" : ""}>Now</option>
                <option ${this.state.schedule !== "Now" ? "selected" : ""}>Schedule for later</option>
              </select>

              <div class="section-card" style="margin-top:20px">
                ${this.routeLines()}
              </div>
            </div>
          `,
          action: this.primary("Save trip plan", "save-plan"),
        };

      default:
        return {
          title: "Hop",
          back: true,
          body: `
            <div class="screen-padding">
              <p>Screen: ${escape(this.state.screen)}</p>
            </div>
          `,
        };
    }
  }

  private modalContent(name: string): [string, string] {
    const field = (id: string, label: string, value = "", placeholder = "") =>
      `<label class="field-label" for="${id}">${escape(label)}</label><input id="${id}" class="text-input" value="${escape(
        value
      )}" placeholder="${escape(placeholder)}"/>`;

    switch (name) {
      case "payment":
        return [
          "Pay your way.",
          `<p>Choose a payment method for your rides.</p>
           ${["Wallet", "Cash", "UPI", "Online payment"]
             .map(
               (m) => `
             <button class="list-row" data-payment="${m}">
               <span class="list-icon">${icon(m === "Cash" ? "wallet" : m === "UPI" ? "phone" : "card")}</span>
               <span class="list-text"><strong>${m}</strong><small>${
                 m === "Wallet" ? `Balance ${money(this.state.balance)}` : m === "Cash" ? "Pay captain at drop-off" : m === "UPI" ? "Scan QR / UPI Intent at drop-off" : "Direct payment"
               }</small></span>
               ${this.state.payment === m ? icon("check") : icon("chevron")}
             </button>`
             )
             .join("")}`,
        ];

      case "upi-qr":
        return [
          "Direct UPI Payment",
          `
          <div class="empty-state" style="padding:16px 10px">
            <div style="background:#fff;padding:12px;border-radius:12px;display:inline-block;box-shadow:0 2px 8px rgba(0,0,0,0.08);margin-bottom:12px">
              <svg width="180" height="180" viewBox="0 0 180 180" fill="none">
                <rect width="180" height="180" fill="white"/>
                <rect x="15" y="15" width="45" height="45" rx="6" fill="#1b1c1d"/>
                <rect x="23" y="23" width="29" height="29" rx="3" fill="white"/>
                <rect x="29" y="29" width="17" height="17" rx="2" fill="#1b1c1d"/>
                <rect x="120" y="15" width="45" height="45" rx="6" fill="#1b1c1d"/>
                <rect x="128" y="23" width="29" height="29" rx="3" fill="white"/>
                <rect x="134" y="29" width="17" height="17" rx="2" fill="#1b1c1d"/>
                <rect x="15" y="120" width="45" height="45" rx="6" fill="#1b1c1d"/>
                <rect x="23" y="128" width="29" height="29" rx="3" fill="white"/>
                <rect x="29" y="134" width="17" height="17" rx="2" fill="#1b1c1d"/>
                <circle cx="90" cy="90" r="14" fill="#dfb82d"/>
                <text x="85" y="95" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1b1c1d">h</text>
                <path d="M70 20h20M75 35h15M70 50h30M20 75h30M70 70h40M125 75h35M90 105v40M110 115h30M115 135h40M75 145h25" stroke="#1b1c1d" stroke-width="4" stroke-linecap="round"/>
              </svg>
            </div>
            <h2>Scan to Pay ${money(this.calculatedPrice)}</h2>
            <p style="margin-top:4px">Captain UPI ID: <strong>suresh@oksbi</strong></p>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
            <a href="upi://pay?pa=suresh@oksbi&pn=Captain Suresh&am=${this.calculatedPrice}&cu=INR&tn=HopRide" class="primary" style="text-align:center;display:block">
              Open UPI App (GPay / PhonePe) ↗
            </a>
            <button class="secondary" data-action="close-modal">Done / Paid</button>
          </div>
          `,
        ];

      case "promo":
        return [
          "Promotions & discounts",
          `<p>Apply promo code for your trip discount.</p>
           ${field("promo-code", "Coupon code", this.state.promo ? "HOP50" : "", "Try HOP50")}
           <div id="modal-error" class="message-error" role="alert"></div>
           ${this.primary(this.state.promo ? "Remove promo" : "Apply promo code", this.state.promo ? "remove-promo" : "promo-submit")}`,
        ];

      case "fare":
        return [
          "Your fare, clearly.",
          `<div class="fare-overview">
             <span>ESTIMATED FARE</span>
             <strong>${money(this.calculatedPrice)}</strong>
             <small>${this.currentVehicle.name} · 8.6 km · about 22 min</small>
           </div>
           ${this.fareBreakdown()}
           <div class="quote-explainer">
             ${icon("refresh")}
             <p>Upfront transparent fare estimate based on standard distance and duration rules.</p>
           </div>
           ${this.primary("Got it", "close-modal")}`,
        ];

      case "passenger":
        return [
          "Who’s riding?",
          `<p>Book for yourself or family members.</p>
           ${["Me", "A family member", "Someone else"]
             .map(
               (who) => `
             <button class="list-row" data-passenger="${who}">
               <span class="list-icon">${icon("user")}</span>
               <strong style="flex:1">${who}</strong>
               ${this.state.who === who ? icon("check") : icon("chevron")}
             </button>`
             )
             .join("")}
           ${this.primary("Done", "close-modal")}`,
        ];

      case "options":
        return [
          "Ride options",
          `
           ${this.toggle("Share this ride", "Allow co-riders along route for lower fare", "shared")}
           ${this.toggle("Women drivers only", "Assign certified women captains", "pink")}
           ${this.toggle("Favourite captains first", "Priority broadcast to saved favourites", "favourite-first")}
           ${field("fare-offer", "Custom fare offer (₹) · optional", this.state.offer, "Enter offer")}
           ${this.primary("Save ride options", "options-submit")}
           <button class="usual-save" data-action="save-usual" style="margin-top:10px;width:100%">
             ${icon("book", "tiny-icon")} Save as my usual ride
           </button>
          `,
        ];

      case "cancel":
        return [
          "Cancel ride?",
          `<p>Are you sure you want to cancel your ride request?</p>
           <div class="product-row" style="margin:14px 0">
             <button class="product-chip active" data-action="cancel-ride">Confirm cancellation</button>
             <button class="product-chip" data-action="close-modal">Keep ride</button>
           </div>`,
        ];

      case "call":
        return [
          "Contact captain",
          `<div class="empty-state" style="padding:24px 10px">
             ${icon("phone")}
             <h2>Calling Arun Kumar</h2>
             <p>Private number masking connects you securely without disclosing phone numbers.</p>
           </div>
           ${this.primary("Close dialog", "close-modal")}`,
        ];

      case "sos":
        return [
          "Emergency assistance",
          `<p>Direct connection to emergency safety services.</p>
           ${this.modalRow("Emergency Police (112)", "National emergency response", "phone", "sos-info")}
           ${this.modalRow("Notify trusted contacts", "Send SMS with live GPS location", "user", "contacts")}
           ${this.modalRow("Report an incident", "Hop 24/7 safety response", "shield", "report")}`,
        ];

      case "topup":
        return [
          "Add to wallet",
          `<p>Add funds to your Hop wallet.</p>
           <div class="product-row" style="margin:18px 0">
             ${[100, 200, 500, 1000]
               .map(
                 (n) => `
               <button class="product-chip ${this.state.amount === n ? "active" : ""}" data-amount="${n}">
                 ${money(n)}
               </button>`
               )
               .join("")}
           </div>
           ${field("topup-amount", "Amount (₹)", String(this.state.amount))}
           <div id="modal-error" class="message-error" role="alert"></div>
           ${this.primary("Add money", "topup-submit")}`,
        ];

      case "add-place":
        return [
          "Save new place",
          `${field("place-name", "Place name", "", "Gym, Yoga class...")}
           ${field("place-address", "Address", "", "Full street address")}
           ${this.primary("Save place", "save-place")}`,
        ];

      case "ridecheck":
        return [
          "RideCheck™ Safety Monitor",
          `<div class="empty-state" style="padding:16px 10px">${icon("shield")}<h2>Is everything okay?</h2><p>Hop detected that your ride has been stationary for over 4 minutes away from traffic signals.</p></div><div style="display:flex;flex-direction:column;gap:10px;margin-top:14px"><button class="primary" data-action="close-modal">I’m fine, just stopped in traffic</button><button class="secondary" data-modal="sos">Need help / Emergency options</button></div><div class="notice-box" style="margin-top:16px">RideCheck uses GPS motion telemetry to proactively check on riders during unexpected delays.</div>`,
        ];

      case "safety-guidance":
        return [
          "Safety Guidance",
          `<p class="muted small" style="margin:4px 0 14px">Follow these verification steps to protect yourself on every journey.</p><div class="section-card" style="margin-bottom:14px"><div class="row"><strong>Meet at a safe point</strong><small class="muted">Well-lit pickup spots</small></div><p class="micro muted" style="margin-top:4px">Verify the vehicle licence plate and model before opening the door.</p></div><div class="section-card" style="margin-bottom:14px"><div class="row"><strong>Confirm Captain identity</strong><small class="muted">Name check</small></div><p class="micro muted" style="margin-top:4px">Ask the driver who they are picking up before entering.</p></div><div class="section-card"><div class="row"><strong>Share 4-digit PIN</strong><small class="muted">Trip verification</small></div><p class="micro muted" style="margin-top:4px">Share your ride start code only after you are safely seated.</p></div>${this.primary("Got it", "close-modal")}`,
        ];

      default:
        return [
          "Information",
          `<p>Details view for ${escape(name)}.</p>${this.primary("Close", "close-modal")}`,
        ];
    }
  }

  public render(): void {
    const view = this.renderScreen();

    this.container.className = `app rider ${this.state.toggled.dark ? "dark" : ""} ${
      this.state.toggled["large-text"] ? "large-text" : ""
    }`;

    this.container.innerHTML = `
      ${this.header(view.title, view.back, view.brand)}
      ${this.journeyRibbon()}
      <div class="screen-body ${view.map ? "map-screen" : ""}">
        ${view.body}
      </div>
      ${view.action ? `<footer class="action-bar">${view.action}</footer>` : ""}
      ${view.nav ? this.nav(view.nav) : ""}
    `;

    if (this.state.modal) {
      for (const child of Array.from(this.container.children)) {
        (child as HTMLElement).setAttribute("aria-hidden", "true");
      }
      const [title, content] = this.modalContent(this.state.modal);
      this.container.insertAdjacentHTML(
        "beforeend",
        `
        <div class="sheet-overlay">
          <section class="modal-sheet" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div class="sheet-handle"></div>
            <div class="modal-title">
              <h2 id="modal-title">${escape(title)}</h2>
              <button class="icon-button" aria-label="Close dialog" data-action="close-modal">
                ${icon("close")}
              </button>
            </div>
            ${content}
          </section>
        </div>`
      );
    }
  }

  private bindEvents(): void {
    this.container.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest("button, a") as HTMLElement;
      if (!target) {
        if ((e.target as HTMLElement).classList.contains("sheet-overlay")) {
          this.closeModal();
        }
        return;
      }

      if (target.dataset.go) {
        this.go(target.dataset.go);
        return;
      }

      if (target.dataset.modal) {
        this.openModal(target.dataset.modal);
        return;
      }

      if (target.dataset.destination) {
        this.state.destination = target.dataset.destination;
        this.go("choose");
        return;
      }

      if (target.dataset.vehicle) {
        this.state.vehicle = target.dataset.vehicle as VehicleCategory;
        this.render();
        return;
      }

      if (target.dataset.routeAlt) {
        this.state.routeAlternative = target.dataset.routeAlt as "fastest" | "omr";
        this.render();
        return;
      }

      if (target.dataset.payment) {
        this.state.payment = target.dataset.payment;
        this.closeModal();
        return;
      }

      if (target.dataset.passenger) {
        this.state.who = target.dataset.passenger;
        this.render();
        return;
      }

      if (target.dataset.amount) {
        this.state.amount = Number(target.dataset.amount);
        const input = document.getElementById("topup-amount") as HTMLInputElement;
        if (input) input.value = String(this.state.amount);
        return;
      }

      if (target.dataset.rating) {
        this.state.rating = Number(target.dataset.rating);
        this.render();
        return;
      }

      if (target.dataset.commuteTab) {
        this.state.commuteTab = target.dataset.commuteTab as "find" | "offer";
        this.render();
        return;
      }

      if (target.dataset.commuteFilter) {
        this.state.commuteCorridorFilter = target.dataset.commuteFilter as any;
        this.render();
        return;
      }

      if (target.dataset.reserveCommute) {
        const id = target.dataset.reserveCommute;
        if (this.state.commuteReserved.includes(id)) {
          this.state.commuteReserved = this.state.commuteReserved.filter((x) => x !== id);
          notify("Commute seat cancelled.");
        } else {
          this.state.commuteReserved.push(id);
          notify("Commute seat reserved successfully!");
        }
        this.render();
        return;
      }

      if (target.dataset.quickChat) {
        const text = target.dataset.quickChat;
        this.state.chats.push({ sender: "mine", text });
        this.render();
        setTimeout(() => {
          this.state.chats.push({ sender: "partner", text: "Got it, see you at the pickup!" });
          this.render();
        }, 1000);
        return;
      }

      if (target.dataset.activity) {
        this.state.activity = target.dataset.activity;
        this.render();
        return;
      }

      if (target.dataset.action) {
        this.handleAction(target.dataset.action);
        return;
      }
    });

    this.container.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      if (target.id === "destination-input") {
        this.state.search = target.value;
        const resEl = document.getElementById("place-results");
        if (resEl) resEl.innerHTML = this.placeResults(this.state.search);
      }
      if (target.id === "pickup-input") {
        this.state.pickup = target.value;
      }
      if (target.dataset.toggle) {
        this.state.toggled[target.dataset.toggle] = target.checked;
        this.render();
      }
    });

    this.container.addEventListener("submit", (e) => {
      const form = e.target as HTMLFormElement;
      if (form.id === "chat-form") {
        e.preventDefault();
        const input = document.getElementById("message-input") as HTMLInputElement;
        const text = input?.value?.trim();
        if (text) {
          this.state.chats.push({ sender: "mine", text });
          input.value = "";
          this.render();
          setTimeout(() => {
            this.state.chats.push({ sender: "partner", text: "Understood, see you shortly!" });
            this.render();
          }, 1000);
        }
      }
    });
  }

  private handleAction(action: string): void {
    switch (action) {
      case "back":
        this.back();
        break;

      case "close-modal":
        this.closeModal();
        break;

      case "review":
        this.go("confirm");
        break;

      case "request":
        if (this.state.schedule !== "Now") {
          this.state.activity = "Upcoming";
          this.go("activity");
          notify("Scheduled ride saved!");
        } else {
          this.state.phase = "requested";
          this.go("matching");

        }
        break;

      case "cancel-ride":
        this.state.phase = "none";
        this.go("home");
        notify("Ride cancelled.");
        break;

      case "simulate-other-captain-accept":
        this.state.phase = "accepted";
        this.go("tracking");
        notify("Captain Arun Kumar accepted your ride! Arriving in 3 min.");
        break;

      case "simulate-trip-step":
        if (this.state.phase === "accepted") {
          this.state.phase = "arrived";
          this.render();
          notify("Captain has arrived at pickup!");
        } else if (this.state.phase === "arrived") {
          this.state.phase = "in_progress";
          this.render();
          notify("OTP verified · Trip in progress!");
        } else if (this.state.phase === "in_progress") {
          this.state.phase = "completed";
          this.go("receipt");
          notify("Destination reached! Trip completed.");
        }
        break;

      case "usual-ride":
        this.state.destination = this.state.usual.destination;
        this.state.vehicle = this.state.usual.vehicle;
        this.state.payment = this.state.usual.payment;
        this.go("choose");
        break;

      case "save-usual":
        this.state.usual = {
          destination: this.state.destination,
          vehicle: this.state.vehicle,
          payment: this.state.payment,
        };
        this.closeModal();
        notify("Saved as your usual ride!");
        break;

      case "promo-submit":
        const codeInput = document.getElementById("promo-code") as HTMLInputElement;
        const code = codeInput?.value?.trim().toUpperCase();
        if (code === "HOP50") {
          this.state.promo = true;
          this.closeModal();
          notify("HOP50 applied! ₹50 off.");
        } else {
          const err = document.getElementById("modal-error");
          if (err) err.textContent = "Invalid code. Use HOP50.";
        }
        break;

      case "remove-promo":
        this.state.promo = false;
        this.closeModal();
        notify("Promo removed.");
        break;

      case "receipt-done":
        this.state.rating = 0;
        this.state.phase = "none";
        this.go("home");
        break;

      case "rebook":
        this.state.destination = "Chennai Airport";
        this.go("choose");
        break;

      case "topup-submit":
        const topupInput = document.getElementById("topup-amount") as HTMLInputElement;
        const amount = Number(topupInput?.value || 0);
        if (amount > 0) {
          this.state.balance += amount;
          this.closeModal();
          notify(`Added ${money(amount)} to wallet!`);
        }
        break;

      case "publish-commute":
        this.state.commuteTab = "find";
        this.render();
        notify("Commute route published for verified coworkers!");
        break;

      default:
        console.log("Unhandled action:", action);
    }
  }
}

