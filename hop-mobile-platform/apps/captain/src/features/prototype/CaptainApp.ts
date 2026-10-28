import { icon } from "@shared/icons";
import { escape, money, img, mapArt, notify } from "@shared/helpers";
import { DriverOffer, EarningsPeriodData } from "@shared/types";


export interface CaptainState {
  screen: string;
  backStack: string[];
  modal: string | null;
  online: boolean;
  phase: "none" | "requested" | "accepted" | "arrived" | "in_progress" | "completed";
  pickup: string;
  destination: string;
  payment: string;
  price: number;
  vehicleName: string;
  vehicleCategory: string;
  goal: number;
  rating: number;
  chats: Array<{ sender: "mine" | "partner"; text: string }>;
  earningsPeriod: "Today" | "This week" | "This month";
  offerIndex: number;
  cockpitMode: boolean;
  serviceArea: string;
  serviceAreaRequest: { area: string; reason: string; time: string } | null;
  homeMode: boolean;
  onboardStep: number;
  docs: string[];
  toggled: Record<string, boolean>;
  form: Record<string, string>;
}

export const captainOffers: DriverOffer[] = [
  {
    id: "offer_1",
    rider: "Demo Rider",
    rating: "4.8",
    pickup: "2nd Cross Street, Adyar",
    dest: "Chennai Airport",
    dist: "1.2 km",
    time: "22 min",
    tripKm: "8.6 km",
    price: 148,
    vehicle: "Auto",
    payment: "Wallet",
    corridor: "OMR IT Corridor",
  },
  {
    id: "offer_2",
    rider: "Priya S.",
    rating: "4.9",
    pickup: "Guindy Industrial Estate, Guindy",
    dest: "Tidel Park, Tharamani",
    dist: "0.8 km",
    time: "16 min",
    tripKm: "6.4 km",
    price: 195,
    vehicle: "Sedan",
    payment: "Cash",
    corridor: "Guindy Tech Corridor",
  },
];

export const earningsData: Record<string, EarningsPeriodData> = {
  Today: {
    amount: "1,260",
    trips: "6",
    km: "42.6",
    cash: "840",
    online: "420",
    bars: [25, 80, 45, 60, 95, 75, 30],
    labels: ["6a", "9a", "12p", "3p", "6p", "9p", "11p"],
    legend: "Hourly fares · ₹",
  },
  "This week": {
    amount: "7,840",
    trips: "34",
    km: "248.0",
    cash: "5,120",
    online: "2,720",
    bars: [52, 65, 38, 82, 60, 94, 70],
    labels: ["M", "T", "W", "T", "F", "S", "S"],
    legend: "Daily fares · ₹",
  },
  "This month": {
    amount: "32,450",
    trips: "148",
    km: "1,020.5",
    cash: "21,300",
    online: "11,150",
    bars: [70, 85, 92, 78],
    labels: ["W1", "W2", "W3", "W4"],
    legend: "Weekly fares · ₹",
  },
};

export class CaptainApp {
  private container: HTMLElement;
  private state: CaptainState;

  constructor(container: HTMLElement) {
    this.container = container;
    this.state = {
      screen: "drive",
      backStack: [],
      modal: null,
      online: true,
      phase: "none",
      pickup: "2nd Cross Street, Adyar",
      destination: "Chennai Airport",
      payment: "Wallet",
      price: 148,
      vehicleName: "Auto",
      vehicleCategory: "auto",
      goal: 2000,
      rating: 0,
      chats: [],
      earningsPeriod: "Today",
      offerIndex: 0,
      cockpitMode: false,
      serviceArea: "Chennai South (OMR & Velachery)",
      serviceAreaRequest: null,
      homeMode: false,
      onboardStep: 0,
      docs: ["Identity", "Licence"],
      toggled: { notifications: true },
      form: {},
    };

    this.bindEvents();
    this.render();
  }

  public go(screen: string, replace = false): void {
    if (!replace && screen !== this.state.screen) {
      this.state.backStack.push(this.state.screen);
    }
    this.state.screen = screen;
    this.state.modal = null;
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
      this.go("drive");
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
      ? `<span class="brand" data-go="drive"><span class="brand-badge" style="background:#dfb82d;color:#1b1c1d">c</span> Hop Captain</span>`
      : "";
    const backBtn = hasBack
      ? `<button class="icon-button header-back" aria-label="Go back" data-action="back">${icon("back")}</button>`
      : "";
    const rightActions = `
      <div class="header-right">
        <button class="icon-button" aria-label="Driver Tools" data-go="tools">${icon("settings")}</button>
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

  private nav(active: string): string {
    const items = [
      ["drive", "navigation", "Drive"],
      ["earnings", "chart", "Earnings"],
      ["activity", "clock", "Trips"],
      ["account", "user", "Account"],
    ];

    return `
      <nav class="bottom-nav" aria-label="Captain navigation">
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

  private cockpitHUD(type: "pickup" | "trip"): string {
    const isPickup = type === "pickup";
    const maneuver = isPickup
      ? {
          icon: "↰",
          dist: "200 m",
          street: "Turn left onto Sardar Patel Road",
          dir: "Towards Adyar Signal / Pickup pin",
          speed: 38,
          limit: 50,
          heading: "NW 310°",
        }
      : {
          icon: "↑",
          dist: "1.4 km",
          street: "Continue straight on GST Road",
          dir: "Towards Airport Flyover / Drop",
          speed: 52,
          limit: 60,
          heading: "SW 215°",
        };

    return `
      <div class="cockpit-container">
        <div class="cockpit-header">
          <div class="cockpit-turn-card">
            <span class="cockpit-turn-symbol">${maneuver.icon}</span>
            <div class="cockpit-turn-text">
              <div class="cockpit-turn-dist">In ${maneuver.dist}</div>
              <div class="cockpit-turn-street">${maneuver.street}</div>
              <div class="cockpit-turn-dir">${maneuver.dir}</div>
            </div>
          </div>
        </div>

        <div class="cockpit-center">
          <div class="cockpit-lanes">
            <span class="lane-box">↑</span>
            <span class="lane-box active">${maneuver.icon}</span>
            <span class="lane-box">↱</span>
          </div>

          <div class="cockpit-telemetry">
            <div class="speed-gauge">
              <span class="speed-num">${maneuver.speed}</span>
              <span class="speed-unit">km/h</span>
            </div>
            <div class="speed-limit-sign">
              <span class="limit-label">LIMIT</span>
              <span class="limit-num">${maneuver.limit}</span>
            </div>
            <div class="compass-badge">
              ${icon("navigation", "tiny-icon")} ${maneuver.heading}
            </div>
          </div>
        </div>

        <div class="cockpit-footer">
          <div class="cockpit-trip-stats">
            <div class="stat-col"><small>ETA</small><strong>${isPickup ? "3 min" : "18 min"}</strong></div>
            <div class="stat-col"><small>Remaining</small><strong>${isPickup ? "1.2 km" : "6.2 km"}</strong></div>
            <div class="stat-col"><small>Destination</small><strong>${isPickup ? "Pickup Pin" : "Airport"}</strong></div>
          </div>
          <div class="cockpit-actions">
            <button class="primary" data-action="${isPickup ? "arrive" : "complete-trip"}">
              ${isPickup ? "I’ve arrived" : "Complete trip"} ${icon("arrow")}
            </button>
            <button class="cockpit-exit-btn secondary" data-action="toggle-cockpit">Exit Cockpit HUD</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderScreen(): { title?: string; back?: boolean; brand?: boolean; map?: boolean; nav?: string; body: string; action?: string } {
    const curOffer = captainOffers[this.state.offerIndex] || captainOffers[0];

    switch (this.state.screen) {
      case "drive":
        const headsUpAlert =
          this.state.phase === "requested"
            ? `
          <div class="captain-heads-up" data-go="request">
            <div class="heads-up-head">
              <span class="app-badge"><b>h</b> Hop Captain</span>
              <span class="heads-up-timer">15s</span>
            </div>
            <div class="heads-up-body">
              <strong>New Ride Request Nearby!</strong>
              <p>Pickup: ${escape(this.state.pickup.split(",")[0])} · ${money(this.state.price)} (${this.state.vehicleName})</p>
            </div>
            <div class="heads-up-cta">Tap to review & accept (2 offers available) →</div>
          </div>`
            : "";

        return {
          brand: true,
          map: true,
          nav: "drive",
          body: `
            ${headsUpAlert}
            ${mapArt(false, true, "captain", "drive")}
            <div class="online-pill ${this.state.online ? "online" : ""}">
              <i></i>${this.state.online ? "You’re online" : "You’re offline"}
            </div>
            <button class="earnings-mini" data-go="earnings">
              Today’s earnings<strong>₹1,260</strong>
            </button>

            <div class="sheet">
              <div class="sheet-handle"></div>
              <div class="zone-pill-row">
                <button class="zone-pill" data-modal="service-area">
                  ${icon("navigation", "tiny-icon")} Zone: ${escape(this.state.serviceArea)} 
                  <span class="badge ${this.state.serviceAreaRequest ? "warn" : "green"}" style="font-size:9px;padding:2px 6px">
                    ${this.state.serviceAreaRequest ? "Pending" : "Active"}
                  </span>
                </button>
              </div>

              <h2>${this.state.online ? "Your next ride awaits." : "Your day, at your pace."}</h2>
              <p class="subline">${this.state.online ? "Broadcasting incoming rider requests near your location." : "Go online to start receiving ride offers in your corridor."}</p>

              <div class="row small" style="margin-top:14px">
                <span class="muted">Daily goal</span>
                <strong>₹1,260 <span class="muted">/ ${money(this.state.goal)}</span></strong>
              </div>
              <div class="progress-track">
                <i style="width:${Math.min(100, (1260 / this.state.goal) * 100)}%"></i>
              </div>

              <div class="row" style="margin:12px 0 16px">
                <span class="small muted">6 trips completed today</span>
                <button class="text-button" style="font-size:11px" data-go="tools">Driver tools ${icon("chevron", "tiny-icon")}</button>
              </div>

              <div style="margin-top:8px">
                <button class="secondary small" data-action="simulate-dispatch-alert" style="width:100%;font-size:11px">
                  ⚡ Simulate: Receive Incoming Ride Request (2 offers)
                </button>
              </div>
            </div>
          `,
          action: `
            ${this.primary(this.state.online ? "Take a break · Go offline" : "Go online", "toggle-online", this.state.online ? "dark" : "")}
            <p class="fineprint">${this.state.online ? "Background GPS location sharing is active." : "Location is shared only while on duty."}</p>
          `,
        };

      case "request":
        return {
          title: "New ride request",
          map: true,
          body: `
            ${mapArt(true, true, "captain", "request")}
            <div class="online-pill online"><i></i>Incoming request</div>
            
            <div class="sheet driver-sheet">
              <div class="sheet-handle"></div>
              
              <div class="offer-switcher" role="tablist" aria-label="Incoming ride offers">
                <button class="offer-tab-btn ${this.state.offerIndex === 0 ? "active" : ""}" data-switch-offer="0">
                  <span><strong>Offer 1</strong> · Adyar</span>
                  <span>₹148</span>
                </button>
                <button class="offer-tab-btn ${this.state.offerIndex === 1 ? "active" : ""}" data-switch-offer="1">
                  <span><strong>Offer 2</strong> · Guindy</span>
                  <span>₹195</span>
                </button>
              </div>

              <div class="offer-timer-bar">
                <div class="timer-top">
                  <span class="timer-pulse"></span>
                  <span class="timer-text">Offer expires in <strong>15s</strong></span>
                  <span class="timer-badge">Auto-dispatch</span>
                </div>
                <div class="timer-track"><i class="timer-fill"></i></div>
              </div>

              <div class="row" style="margin-top:8px">
                <div>
                  <span class="small muted">Estimated fare (${curOffer.rider})</span>
                  <div class="amount">${money(curOffer.price)}</div>
                </div>
                <span class="badge coral">${curOffer.vehicle}</span>
              </div>

              <div class="offer-facts">
                <span>${icon("pin", "tiny-icon")}<strong>${curOffer.dist}</strong><small>to pickup</small></span>
                <span>${icon("clock", "tiny-icon")}<strong>${curOffer.time}</strong><small>trip time</small></span>
                <span>${icon("wallet", "tiny-icon")}<strong>${curOffer.payment}</strong><small>payment</small></span>
              </div>

              <div class="confirm-route">
                <div class="route-line"><span class="location-dot"></span><strong>${escape(curOffer.pickup)}</strong></div>
                <div class="route-line"><span class="location-dot destination"></span><strong>${escape(curOffer.dest)}</strong></div>
              </div>

              <div class="row small" style="margin-top:8px">
                <span class="muted">Trip distance</span>
                <strong>${curOffer.tripKm} · ${curOffer.time}</strong>
              </div>
            </div>
          `,
          action: `
            <div class="driver-offer-actions" style="margin-top:0">
              <button class="secondary" data-action="decline">Decline</button>
              ${this.primary("Accept ride", "accept")}
            </div>
            <div class="row" style="margin-top:8px;gap:8px">
              <button class="text-button" style="flex:1;font-size:11px" data-modal="ride-taken">
                ⚡ Simulate: Taken by another captain
              </button>
              <button class="text-button" style="flex:1;font-size:11px" data-modal="counter">
                Make counter-offer
              </button>
            </div>
          `,
        };

      case "pickup":
        if (this.state.cockpitMode) {
          return {
            title: "Cockpit Navigation",
            body: this.cockpitHUD("pickup"),
          };
        }
        return {
          title: "Head to pickup",
          map: true,
          body: `
            ${mapArt(true, true, "captain", "pickup")}
            <div class="route-pill">
              ${icon("navigation")}
              <strong>Turn left onto Sardar Patel Road</strong>
              <span class="small">200 m</span>
            </div>

            <div class="sheet">
              <div class="sheet-handle"></div>
              <div class="tracking-heading">
                <h2>Pickup in 3 min.</h2>
                <span class="badge green">Accepted</span>
              </div>

              <div class="driver-card">
                <span class="avatar driver">D</span>
                <span class="driver-text">
                  <strong>Demo Rider <span class="small muted">★ 4.8</span></strong>
                  <small>${escape(this.state.pickup)}</small>
                </span>
              </div>

              <div class="circle-actions" style="margin-top:14px">
                <button data-modal="call">${icon("phone")}Call rider</button>
                <button data-go="chat">${icon("chat")}Message</button>
                <button data-go="safety">${icon("shield")}Safety</button>
              </div>

              <button class="text-button" style="width:100%;margin-top:10px" data-action="toggle-cockpit">
                ${icon("navigation", "tiny-icon")} Fullscreen Cockpit HUD
              </button>
            </div>
          `,
          action: `
            ${this.primary("I’ve arrived at pickup", "arrive")}
            <p class="fineprint">Mark arrived when you pull up to the designated pickup point.</p>
          `,
        };

      case "otp":
        return {
          title: "Start the ride",
          back: true,
          body: `
            <div class="screen-padding">
              <div class="empty-state" style="padding:22px 10px 10px">
                ${icon("lock")}
                <h2>Ask rider for pickup code.</h2>
                <p>Confirm you’re with the right rider before starting trip.</p>
              </div>

              <div class="pin-entry">
                ${[0, 1, 2, 3, 4, 5]
                  .map(
                    (i) => `
                  <input id="pin-${i}" type="text" inputmode="numeric" maxlength="1" aria-label="Code digit ${i + 1}"/>`
                  )
                  .join("")}
              </div>

              <div class="otp-actions-row" style="margin-top:12px">
                <button class="secondary small auto-otp-btn" data-action="autofill-otp">
                  ${icon("lock", "tiny-icon")} Autofill Rider OTP (431602)
                </button>
              </div>

              <p class="fineprint" style="margin-top:8px">Authoritative 6-digit OTP issued by Hop backend.</p>
              <p class="message-error" id="pin-error" role="alert"></p>

              <div class="section-card" style="margin-top:16px">
                <div class="driver-card" style="padding:0">
                  <span class="avatar">D</span>
                  <span class="driver-text">
                    <strong>Demo Rider</strong>
                    <small>Destination: ${escape(this.state.destination)}</small>
                  </span>
                </div>
              </div>
            </div>
          `,
          action: this.primary("Verify & start ride", "start-trip"),
        };

      case "trip":
        if (this.state.cockpitMode) {
          return {
            title: "Cockpit Navigation",
            body: this.cockpitHUD("trip"),
          };
        }
        return {
          title: "On trip",
          map: true,
          body: `
            ${mapArt(true, true, "captain", "trip")}
            <div class="route-pill">
              ${icon("navigation")}
              <strong>Continue straight on GST Road</strong>
              <span class="small">1.4 km</span>
            </div>

            <div class="sheet">
              <div class="sheet-handle"></div>
              <div class="tracking-heading">
                <h2>Keep going. You’re close.</h2>
                <div class="eta">18<small>min to drop</small></div>
              </div>

              <div class="confirm-route">
                <div class="route-line">
                  <span class="location-dot destination"></span>
                  <strong>${escape(this.state.destination)}</strong>
                </div>
                <p class="small muted" style="margin:8px 0 0 17px">6.2 km remaining · live route</p>
              </div>

              <div class="circle-actions" style="margin-top:14px">
                <button data-modal="navigation">${icon("navigation")}Navigation</button>
                <button data-go="chat">${icon("chat")}Message</button>
                <button data-go="safety">${icon("shield")}Safety</button>
              </div>

              <button class="text-button" style="width:100%;margin-top:10px" data-action="toggle-cockpit">
                ${icon("navigation", "tiny-icon")} Fullscreen Cockpit HUD
              </button>
            </div>
          `,
          action: `
            ${this.primary("Complete trip", "complete-trip")}
            <p class="fineprint">Tap complete only after reaching dropoff destination.</p>
          `,
        };

      case "collect":
        return {
          title: "Finish your trip",
          body: `
            <div class="screen-padding">
              <div class="receipt-total">
                <span class="check-circle">${icon("check")}</span>
                <p>Trip completed</p>
                <h2>${money(this.state.price)}</h2>
                <p>${
                  this.state.payment === "Cash"
                    ? "Collect cash from rider"
                    : this.state.payment === "UPI"
                    ? "Confirm direct UPI payment"
                    : "Payment confirmed via Hop Wallet"
                }</p>
              </div>

              <div class="section-card">
                <div class="row">
                  <span class="small muted">Payment method</span>
                  <strong class="small">${escape(this.state.payment)}</strong>
                </div>
                <div class="fare-rows" style="margin-top:8px">
                  <div class="fare-row"><span>Fare amount</span><strong>${money(this.state.price)}</strong></div>
                  <div class="fare-row"><span>Platform fee</span><strong class="muted">₹0 (0% commission promo)</strong></div>
                  <div class="fare-row total"><span>Your net payout</span><strong>${money(this.state.price)}</strong></div>
                </div>
              </div>
            </div>
          `,
          action: this.primary(
            this.state.payment === "Wallet" ? "Confirm settlement & finish" : "Record payment received",
            "settle"
          ),
        };

      case "earnings":
        const curData = earningsData[this.state.earningsPeriod] || earningsData.Today;
        return {
          title: "Your earnings",
          nav: "earnings",
          body: `
            <div class="screen-padding">
              <div class="tabs">
                <button class="${this.state.earningsPeriod === "Today" ? "active" : ""}" data-earnings-period="Today">Today</button>
                <button class="${this.state.earningsPeriod === "This week" ? "active" : ""}" data-earnings-period="This week">This week</button>
                <button class="${this.state.earningsPeriod === "This month" ? "active" : ""}" data-earnings-period="This month">This month</button>
              </div>

              <div class="earnings-hero">
                <p class="small muted">FARES EARNED · ${this.state.earningsPeriod.toUpperCase()}</p>
                <div class="amount">₹${curData.amount}<span style="font-size:19px;color:#9ca496">.00</span></div>
                <p class="small muted">${curData.trips} completed trips · ${curData.km} km</p>
              </div>

              <div class="section-card">
                <div class="row">
                  <strong class="small">${this.state.earningsPeriod} overview</strong>
                  <span class="small muted">₹${curData.amount}</span>
                </div>
                <div class="chart" role="img" aria-label="Fares in rupees">
                  <div style="position:absolute;right:0;top:-13px;font-size:8px;color:#899483">${curData.legend}</div>
                  ${curData.bars
                    .map(
                      (h, i) => `
                    <div class="chart-col ${i === curData.bars.length - 1 ? "active" : ""}" style="height:${h}%">
                      <span>${curData.labels[i]}</span>
                    </div>`
                    )
                    .join("")}
                </div>
              </div>

              <div class="stat-grid" style="margin:16px 0">
                <div class="stat"><strong>₹${curData.cash}</strong><small>Cash & direct UPI</small></div>
                <div class="stat"><strong>₹${curData.online}</strong><small>Wallet & online</small></div>
              </div>

              <div class="section-label">Your balance</div>
              <div class="section-card">
                <div class="row">
                  <span>
                    <strong>₹2,140</strong>
                    <small class="muted" style="display:block;margin-top:3px;font-size:9px">Available to withdraw</small>
                  </span>
                  <button class="text-button" data-modal="payout">Withdraw ${icon("arrow", "tiny-icon")}</button>
                </div>
              </div>

              ${this.row("Trip insights", "Fare, time, safety score and peak hours", "chart", "insights")}
            </div>
          `,
        };

      case "tools":
        return {
          title: "Driver tools",
          back: true,
          body: `
            <div class="screen-padding">
              <div class="section-card">
                <div class="row">
                  <strong class="small">Daily earnings goal</strong>
                  <button class="text-button" data-modal="goal">Edit</button>
                </div>
                <p class="small muted">₹1,260 of ${money(this.state.goal)}</p>
                <div class="progress-track" style="margin-top:8px">
                  <i style="width:${Math.min(100, (1260 / this.state.goal) * 100)}%"></i>
                </div>
              </div>

              <div class="section-card" style="margin-top:14px">
                <div class="row">
                  <div>
                    <strong class="small">Go-Home Mode</strong>
                    <p class="micro muted">Only receive trips heading towards home</p>
                  </div>
                  <input type="checkbox" data-action="toggle-home-mode" ${this.state.homeMode ? "checked" : ""}/>
                </div>
              </div>

              ${this.modalRow("Operating service area", `Zone: ${this.state.serviceArea}`, "navigation", "service-area")}
              ${this.modalRow("Break reminder", "Automatic 15-min pause", "clock", "break")}
            </div>
          `,
        };

      case "insights":
        return {
          title: "Your trip insights",
          back: true,
          body: `
            <div class="screen-padding">
              <div class="safety-hero">
                ${icon("shield")}
                <div>
                  <h2>Excellent rating!</h2>
                  <p>Captain Safety & Performance Score</p>
                </div>
                <strong style="font-size:28px">96</strong>
              </div>

              <div class="stat-grid" style="margin:16px 0">
                <div class="stat"><strong>4.9 ★</strong><small>Rider rating</small></div>
                <div class="stat"><strong>96%</strong><small>Acceptance rate</small></div>
                <div class="stat"><strong>₹210</strong><small>Average fare</small></div>
                <div class="stat"><strong>22 min</strong><small>Average trip time</small></div>
              </div>

              ${this.modalRow("Fare & time summary", "Distance and duration analytics", "chart", "insight-details")}
              ${this.modalRow("Busy hours & corridor patterns", "Peak demand times across OMR & Guindy", "clock", "insight-details")}
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
                <span class="avatar driver">C</span>
                <span class="driver-text">
                  <strong>Captain Suresh</strong>
                  <small>+91 98765 12345 · ★ 4.9</small>
                  <span class="plate">Bajaj RE · TN 09 AB 1234</span>
                </span>
              </div>

              ${this.row("Your vehicle & documents", "Verified RC, Insurance, Licence", "car", "vehicle")}
              ${this.row("Earnings & payout settings", "UPI ID and bank accounts", "wallet", "earnings")}
              ${this.row("Safety centre", "SOS helpline and emergency protocols", "shield", "safety")}
              ${this.row("Help & support", "Driver assistance and toll tickets", "help", "support")}
              ${this.row("Privacy & sign out", "Account control and log out", "lock", "privacy")}
            </div>
          `,
        };

      case "vehicle":
        return {
          title: "Your vehicle",
          back: true,
          body: `
            <div class="screen-padding">
              <div class="section-card">
                <div class="row">
                  <div>
                    <strong>Bajaj RE Auto</strong>
                    <p class="micro muted" style="margin-top:2px">Plate: TN 09 AB 1234</p>
                  </div>
                  ${img("auto", 52)}
                </div>
              </div>

              <div class="section-label" style="margin-top:16px">VERIFIED DOCUMENTS</div>
              ${["Identity (Aadhaar)", "Driving Licence", "Vehicle RC", "Vehicle Insurance"]
                .map(
                  (doc) => `
                <div class="list-row">
                  <span class="list-icon">${icon("check")}</span>
                  <span class="list-text"><strong>${doc}</strong><small>Verified by Hop Operator</small></span>
                  <span class="badge green">Valid</span>
                </div>`
                )
                .join("")}
              
              ${this.modalRow("Request vehicle change", "Submit new RC and model details", "refresh", "vehicle-change")}
            </div>
          `,
        };

      case "chat":
        return {
          title: "Demo Rider",
          back: true,
          body: `
            <div class="chat">
              <div class="chat-time">Today · trip communication</div>
              <div class="chat-bubble partner">Hi! I’m at the pickup pin.</div>
              ${this.state.chats
                .map(
                  (c) => `
                <div class="chat-bubble ${c.sender === "mine" ? "mine" : "partner"}">${escape(c.text)}</div>`
                )
                .join("")}
              <div class="product-row" style="margin-top:15px">
                <button class="product-chip" data-quick-chat="I’ve arrived outside">I’ve arrived outside</button>
                <button class="product-chip" data-quick-chat="Hazard lights are on">Hazard lights are on</button>
                <button class="product-chip" data-quick-chat="On my way">On my way</button>
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

      case "activity":
        return {
          title: "Your trips",
          nav: "activity",
          body: `
            <div class="screen-padding">
              ${[0, 1, 2]
                .map(
                  (item) => `
                <div class="activity-card">
                  <div class="row">
                    <span class="activity-date">${["Today, 09:24", "Today, 08:15", "Yesterday, 19:40"][item]}</span>
                    <span class="badge green">Completed</span>
                  </div>
                  <div class="row">
                    <span class="small">Demo Rider</span>
                    <strong>${["₹148", "₹210", "₹268"][item]}</strong>
                  </div>
                  <div class="route-line"><i class="location-dot"></i><strong>Adyar, Chennai</strong></div>
                  <div class="route-line"><i class="location-dot destination"></i><strong>Chennai Airport</strong></div>
                </div>`
                )
                .join("")}
            </div>
          `,
        };

      default:
        return {
          title: "Hop Captain",
          back: true,
          body: `<div class="screen-padding"><p>Screen: ${escape(this.state.screen)}</p></div>`,
        };
    }
  }

  private modalContent(name: string): [string, string] {
    const field = (id: string, label: string, value = "", placeholder = "") =>
      `<label class="field-label" for="${id}">${escape(label)}</label><input id="${id}" class="text-input" value="${escape(
        value
      )}" placeholder="${escape(placeholder)}"/>`;

    switch (name) {
      case "ride-taken":
        return [
          "Another captain was faster!",
          `
          <div class="empty-state" style="padding:18px 10px">
            ${icon("clock")}
            <h2>Offer Accepted by Another Captain</h2>
            <p>Another nearby captain accepted this ride request just before you. First accept wins on the Hop platform.</p>
          </div>
          <div class="notice-box" style="margin-top:12px">
            Your acceptance score is 100% protected and was not penalized.
          </div>
          <div style="margin-top:16px">
            <button class="primary" data-action="close-modal" style="width:100%">Back to Drive</button>
          </div>
          `,
        ];

      case "service-area":
        const areas = [
          "Chennai South (OMR & Velachery)",
          "Chennai Central & T. Nagar Hub",
          "Chennai Airport & Guindy Corridor",
          "Chennai North & Port Zone",
        ];
        return [
          "Operating Service Area",
          `
          <p>Choose your primary dispatch corridor.</p>
          <div class="section-card" style="margin:12px 0">
            <div class="row">
              <div>
                <small class="muted">CURRENT ACTIVE CORRIDOR</small>
                <strong style="display:block;margin-top:2px">${escape(this.state.serviceArea)}</strong>
              </div>
              <span class="badge ${this.state.serviceAreaRequest ? "warn" : "green"}">
                ${this.state.serviceAreaRequest ? "Pending review" : "Active"}
              </span>
            </div>
          </div>
          <label class="field-label" for="target-area">Request corridor change</label>
          <select id="target-area" class="text-input">
            ${areas.map((a) => `<option value="${a}" ${a === this.state.serviceArea ? "disabled" : ""}>${a}</option>`).join("")}
          </select>
          ${this.primary("Submit corridor update", "submit-service-area")}
          `,
        ];

      case "payout":
        return [
          "Withdraw earnings",
          `
          <p>Available balance to withdraw:</p>
          <h2 style="font-size:28px;margin:8px 0 16px">₹2,140.00</h2>
          ${field("payout-upi", "UPI ID", "suresh@oksbi", "e.g. mobile@upi")}
          ${this.primary("Confirm Instant Payout", "payout-submit")}
          `,
        ];

      case "goal":
        return [
          "Daily earnings goal",
          `
          ${field("daily-goal", "Daily target (₹)", String(this.state.goal))}
          ${this.primary("Save daily goal", "goal-submit")}
          `,
        ];

      case "counter":
        return [
          "Make counter-offer",
          `
          <p>Suggest a modified fare for this trip.</p>
          ${field("counter-fare", "Your counter fare (₹)", "175")}
          ${this.primary("Send counter-offer", "counter-submit")}
          `,
        ];

      case "break":
        return [
          "Take a break",
          `
          <div class="empty-state" style="padding:20px 10px">
            ${icon("clock")}
            <h2>Ready for a short break?</h2>
            <p>Pause incoming dispatch requests for 15 minutes to recharge.</p>
          </div>
          ${this.primary("Start 15-min break", "take-break")}
          `,
        ];

      default:
        return ["Information", `<p>Captain detail view.</p>${this.primary("Close", "close-modal")}`];
    }
  }

  public render(): void {
    const view = this.renderScreen();

    this.container.className = `app captain ${this.state.toggled.dark ? "dark" : ""}`;

    this.container.innerHTML = `
      ${this.header(view.title, view.back, view.brand)}
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

      if (target.dataset.switchOffer) {
        this.state.offerIndex = Number(target.dataset.switchOffer);
        this.render();
        return;
      }

      if (target.dataset.earningsPeriod) {
        this.state.earningsPeriod = target.dataset.earningsPeriod as any;
        this.render();
        return;
      }

      if (target.dataset.quickChat) {
        const text = target.dataset.quickChat;
        this.state.chats.push({ sender: "mine", text });
        this.render();
        setTimeout(() => {
          this.state.chats.push({ sender: "partner", text: "Got it! Coming down to the car." });
          this.render();
        }, 1000);
        return;
      }

      if (target.dataset.action) {
        this.handleAction(target.dataset.action);
        return;
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
            this.state.chats.push({ sender: "partner", text: "Understood, see you right there!" });
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

      case "toggle-online":
        this.state.online = !this.state.online;

        this.render();
        notify(this.state.online ? "You are online and ready for requests!" : "You are offline.");
        break;

      case "simulate-dispatch-alert":
        this.state.phase = "requested";
        this.go("request");
        notify("Incoming ride request! 15s to accept.");
        break;

      case "accept":
        this.state.phase = "accepted";
        this.go("pickup");
        notify("Ride accepted! Head to pickup at Adyar (1.2 km away).");
        break;

      case "decline":
        this.state.phase = "none";
        this.go("drive");
        notify("Offer declined.");
        break;

      case "arrive":
        this.state.phase = "arrived";
        this.go("otp");
        notify("Arrived at pickup! Ask rider for 6-digit pickup OTP.");
        break;

      case "autofill-otp":
        const code = "431602";
        for (let i = 0; i < 6; i++) {
          const input = document.getElementById(`pin-${i}`) as HTMLInputElement;
          if (input) input.value = code[i];
        }
        notify("Rider OTP 431602 entered.");
        break;

      case "start-trip":
        const entered = [0, 1, 2, 3, 4, 5]
          .map((i) => (document.getElementById(`pin-${i}`) as HTMLInputElement)?.value)
          .join("");
        if (entered !== "431602") {
          const err = document.getElementById("pin-error");
          if (err) err.textContent = "Please enter valid pickup code 431602.";
          return;
        }
        this.state.phase = "in_progress";
        this.go("trip");
        notify("OTP 431602 Verified ✓ · Trip Started!");
        break;

      case "complete-trip":
        this.state.phase = "completed";
        this.go("collect");
        notify("Destination reached! Collect payment.");
        break;

      case "settle":
        this.state.phase = "none";
        this.go("drive");
        notify("Trip completed! ₹148 added to today’s earnings.");
        break;

      case "toggle-cockpit":
        this.state.cockpitMode = !this.state.cockpitMode;
        this.render();
        notify(this.state.cockpitMode ? "Cockpit HUD activated" : "Standard view restored");
        break;

      case "submit-service-area":
        const select = document.getElementById("target-area") as HTMLSelectElement;
        if (select) {
          this.state.serviceArea = select.value;
          this.state.serviceAreaRequest = { area: select.value, reason: "Corridor peak alignment", time: "Just now" };
        }
        this.closeModal();
        notify(`Operating area updated to: ${this.state.serviceArea}`);
        break;

      case "payout-submit":
        this.closeModal();
        notify("Instant payout of ₹2,140 dispatched to UPI!");
        break;

      case "counter-submit":
        this.closeModal();
        this.go("drive");
        notify("Counter-offer sent to rider.");
        break;

      case "goal-submit":
        const goalInput = document.getElementById("daily-goal") as HTMLInputElement;
        const target = Number(goalInput?.value || 0);
        if (target > 0) {
          this.state.goal = target;
          this.closeModal();
          notify(`Daily goal set to ${money(target)}!`);
        }
        break;

      case "take-break":
        this.state.online = false;
        this.closeModal();
        this.go("drive");
        notify("Break started. Status set to offline.");
        break;

      case "toggle-home-mode":
        this.state.homeMode = !this.state.homeMode;
        notify(this.state.homeMode ? "Go-Home Mode enabled: trips towards Adyar" : "Go-Home Mode disabled");
        break;

      default:
        console.log("Unhandled captain action:", action);
    }
  }
}

