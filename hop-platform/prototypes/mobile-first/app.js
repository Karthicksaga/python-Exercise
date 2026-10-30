// Local interaction prototype. Deliberately has no network or backend adapter.
const $ = (selector) => document.querySelector(selector);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  arrow: "M5 12h14m-5-5 5 5-5 5",
  back: "m15 5-7 7 7 7",
  chevron: "m9 5 7 7-7 7",
  close: "m6 6 12 12M6 18 18 6",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  search: "m21 21-4.5-4.5M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  clock: "M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0ZM12 6v6l4 2",
  wallet:
    "M21 7H4a2 2 0 0 1 0-4h14v4m3 0v14H4a2 2 0 0 1-2-2V5m19 6h-6v6h6m-3-3h.01",
  user: "M20 21v-2a7 7 0 0 0-14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  bell: "M18 8a6 6 0 0 0-12 0c0 8-3 8-3 9h18c0-1-3-1-3-9M10 21h4",
  car: "m4 8 2-5h12l2 5M3 8h18v10H3Zm3 10v3m12-3v3M6 12h.01M18 12h.01",
  shield: "m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6Zm-4 10 3 3 5-6",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2-6h4l1 3 3 1 3 2v4l-3 2-1 3-1 5h-4l-2-3-3-1-3-2v-4l3-2 1-3Z",
  card: "M3 4h18v16H3ZM3 9h18M6 15h4",
  briefcase: "M8 6V3h8v3M3 7h18v14H3Zm0 6h18M10 12v3h4v-3",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  star: "m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z",
  gift: "M3 8h18v4H3Zm2 4v10h14V12M12 8v14M12 8C3 8 4 0 9 3c2 1 3 5 3 5Zm0 0c9 0 8-8 3-5-2 1-3 5-3 5Z",
  phone: "M4 3h4l2 5-3 2c2 4 3 5 7 7l2-3 5 2v4c-9 4-20-7-17-17Z",
  chat: "M21 3H3v14h5l4 4 4-4h5Z",
  send: "m22 2-7 20-4-9-9-4Zm0 0L11 13",
  help: "M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0ZM9 8a3 3 0 0 1 6 0c0 3-3 2-3 5m0 4h.01",
  location: "m22 2-7 20-4-9-9-4Z",
  layers: "m12 2 10 6-10 6L2 8Zm-10 10 10 6 10-6M2 17l10 6 10-6",
  check: "m4 12 5 5L20 6",
  calendar: "M4 4h16v18H4ZM4 9h16M8 2v4M16 2v4",
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0Zm-3 5v2a6 6 0 0 0 12 0v-2M12 18v4M8 22h8",
  book: "M4 3h16v18l-8-5-8 5Z",
  file: "M14 2H4v20h16V8Zm0 0v6h6M8 13h8M8 17h6",
  download: "M12 2v13m-5-5 5 5 5-5M3 16v6h18v-6",
  logout: "M9 3H3v18h6m5-14 5 5-5 5M7 12h13",
  mail: "M2 4h20v16H2Zm0 0 10 9L22 4",
  chart: "M3 3v18h19M7 16v-5m6 5V6m6 10V9",
  target:
    "M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0ZM17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0ZM12 10v4M10 12h4",
  navigation: "m12 2 9 20-9-5-9 5Z",
  eye: "M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12Zm15 0a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  lock: "M6 10V6a6 6 0 0 1 12 0v4M4 10h16v12H4Zm8 4v4",
  stop: "M5 5h14v14H5Z",
  copy: "M8 8h14v14H8ZM16 8V2H2v14h6",
  refresh: "M20 7A9 9 0 1 0 21 14M20 2v6h-6",
  moon: "M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10",
  accessibility:
    "M14 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM4 8l8 2 8-2M12 10v6m-5 7 5-7 5 7",
  camera: "M3 6h5l2-3h4l2 3h5v15H3Zm13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
};
function icon(name, cls = "") {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.help}"/></svg>`;
}
const vehicleData = [
  {
    id: "auto",
    name: "Auto-rickshaw",
    caption: "Open air. Everyday easy.",
    price: 268,
    eta: "3 min",
    seats: 3,
  },
  {
    id: "bike",
    name: "Bike",
    caption: "Light on traffic. Light on you.",
    price: 148,
    eta: "2 min",
    seats: 1,
  },
  {
    id: "mini",
    name: "Mini cab",
    caption: "A little comfort for the city.",
    price: 350,
    eta: "4 min",
    seats: 4,
  },
  {
    id: "sedan",
    name: "Sedan",
    caption: "More room to settle in.",
    price: 426,
    eta: "5 min",
    seats: 4,
  },
  {
    id: "suv",
    name: "SUV",
    caption: "Room for your whole crew.",
    price: 557,
    eta: "7 min",
    seats: 6,
  },
];
const places = [
  {
    name: "Chennai Airport",
    detail: "Departures · Terminal 1",
    icon: "location",
  },
  {
    name: "Chennai Central",
    detail: "Pickup bay · Poonamallee High Road",
    icon: "navigation",
  },
  { name: "T. Nagar", detail: "Pondy Bazaar · Chennai", icon: "pin" },
  {
    name: "Marina Beach",
    detail: "Light House entrance · Chennai",
    icon: "pin",
  },
  { name: "Home", detail: "2nd Cross Street, Adyar", icon: "home" },
  { name: "Work", detail: "Olympia Tech Park, Guindy", icon: "briefcase" },
];
const state = {
  role: "rider",
  screen: "home",
  last: { rider: "home", captain: "drive" },
  back: [],
  modal: null,
  toast: "",
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
  offer: "",
  schedule: "Now",
  phase: "none",
  activity: "Past",
  online: false,
  homeMode: false,
  goal: 2000,
  rating: 0,
  chats: [],
  onboard: 0,
  docs: [],
  toggled: { notifications: true },
  saved: ["Home", "Work"],
  family: [],
  error: "",
  note: "",
  amount: 500,
  usual: { destination: "Work", vehicle: "auto", payment: "Wallet" },
  quoteRefreshed: false,
  cockpitMode: false,
  serviceArea: "Chennai",
  serviceAreaRequest: null,
  driverApproved: false,
  driverStatus: "pending",
  name: "Demo Captain",
  phone: "+91 98765 43210",
  vehicleNumber: "TN 09 AB 1234",
  vehicleModel: "Bajaj RE",
  vehicleColour: "Yellow & black",
  earningsPeriod: "Today",
  routeAlternative: "fastest",
  commuteTab: "find",
  commuteReserved: [],
  commuteCorridorFilter: "all",
  ridecheckActive: false,
  offerIndex: 0,
};
const v = () => vehicleData.find((item) => item.id === state.vehicle);
const price = () => v().price - (state.promo ? 50 : 0);
const money = (value) => `₹${Number(value).toLocaleString("en-IN")}`;
const screens = {
  rider: [
    [
      "home",
      "Home",
      "THE EVERYDAY START",
      "A calmer way to go.",
      "A map, one destination field and the places you use most. Everything else waits until you need it.",
      "The destination is primary. My usual ride restores a familiar route and preferences, then asks you to review a fresh fare.",
    ],
    [
      "search",
      "Pickup & destination",
      "ONE DECISION",
      "Where to?",
      "Search has its own focused screen. Voice, saved places and adding a stop stay close to the route.",
      "The keyboard gets a dedicated search view; it never covers the booking button.",
    ],
    [
      "choose",
      "Choose a ride",
      "CLEAR CHOICES",
      "A ride that fits.",
      "Five vehicle categories, arrival information and a readable estimate. No competing sidebars.",
      "The journey ribbon keeps your place. Every fare has a consistent entry into its estimate details.",
    ],
    [
      "confirm",
      "Review & confirm",
      "BEFORE YOU GO",
      "Everything in one glance.",
      "Route, vehicle, fare and payment are visible. Passenger, sharing, promo and negotiation open only on demand.",
      "Progressive disclosure keeps every booking option without a kitchen-sink form.",
    ],
    [
      "matching",
      "Finding a captain",
      "REQUESTED",
      "A clear next moment.",
      "A calm waiting state explains what is happening and keeps cancellation and safety within reach.",
      "The review controls simulate dispatch. No real ride is being requested.",
    ],
    [
      "tracking",
      "Captain & live trip",
      "ACCEPTED → IN PROGRESS",
      "Stay with your journey.",
      "Your captain, vehicle, pickup code and arrival status sit together. Calling, chat and safety remain one tap away.",
      "Meeting-point guidance, vehicle checks and chat sit together. The journey ribbon explains the current stage.",
    ],
    [
      "receipt",
      "Trip receipt & rating",
      "COMPLETED",
      "A thoughtful finish.",
      "A clear payment status, full fare details, trip statement and rating finish the journey.",
      "Only the existing backend can confirm payments; the prototype shows sample statuses.",
    ],
    [
      "activity",
      "Your rides",
      "YOUR ACTIVITY",
      "A place for every trip.",
      "Ongoing, scheduled and past rides get separate views. Receipts, rebooking and support live with the trip.",
      "Long history lists scroll inside one content region; the app navigation stays fixed.",
    ],
    [
      "wallet",
      "Wallet & offers",
      "YOUR MONEY",
      "Simple money moments.",
      "Balance, top-up, offers and transactions are grouped without filling the booking flow.",
      "Payment forms open as focused sheets and never share space with location search.",
    ],
    [
      "account",
      "Account",
      "YOUR SPACE",
      "The essentials, organised.",
      "Account, saved places, family, preferences, safety and rewards are reachable through short menus.",
      "Related settings have their own screens instead of one enormous profile page.",
    ],
    [
      "saved",
      "Saved places",
      "FAMILIAR PLACES",
      "A quicker way back.",
      "Home, Work and favourite places retain dedicated add and edit flows.",
      "A saved destination can become a booking in one tap.",
    ],
    [
      "family",
      "Family & favourite captains",
      "RIDE TOGETHER",
      "Made for your people.",
      "Family invitations, passenger choice and favourite captains stay available without occupying the home screen.",
      "Personal information will use the existing ownership and verification rules.",
    ],
    [
      "preferences",
      "Ride preferences",
      "YOUR DEFAULTS",
      "Small things, remembered.",
      "Default vehicle, payment, language, accessibility and low-data mode are grouped into short focused settings.",
      "Preferences keep the next booking lighter; they never bypass server validation.",
    ],
    [
      "safety",
      "Safety centre",
      "ALWAYS WITH YOU",
      "Help within reach.",
      "Emergency contacts, SOS, trip sharing and reporting remain easy to reach during a ride.",
      "Prototype safety actions display previews only and never contact emergency services.",
    ],
    [
      "support",
      "Help & support",
      "WE ARE HERE",
      "Start with the right help.",
      "Booking, payments, account and trip issues lead into focused support journeys.",
      "A trip issue carries the trip context forward instead of making you explain it again.",
    ],
    [
      "notifications",
      "Notifications",
      "KEEPING YOU UPDATED",
      "Only what matters.",
      "Ride updates, account notices and promotions are grouped in an inbox with clear read states.",
      "Push delivery and permission behaviour stay a separate native acceptance gate.",
    ],
    [
      "rewards",
      "Rewards & referrals",
      "A LITTLE EXTRA",
      "Good journeys add up.",
      "Rewards, referral codes and redemption retain a place under Account.",
      "Invites and copying are local preview interactions; nothing is sent.",
    ],
    [
      "personal",
      "Personal & business details",
      "YOUR DETAILS",
      "Clear ownership.",
      "Personal details, verified mobile, portrait and business receipt details remain separate from booking.",
      "Native implementation must preserve OTP ownership, private media and immutable receipt snapshots.",
    ],
    [
      "privacy",
      "Privacy & account",
      "YOUR CHOICES",
      "Control your account.",
      "Data export, deletion request and sign-out remain explicit, separate actions.",
      "Every action here is a demonstration and changes no real account.",
    ],
    [
      "chat",
      "Trip chat",
      "STAY IN TOUCH",
      "A quick hello.",
      "Quick replies and a small composer keep the conversation useful during pickup.",
      "Messaging stays inside the assigned trip and uses existing access rules.",
    ],
    [
      "plan",
      "Schedule & trip type",
      "PLAN YOUR JOURNEY",
      "More ways to go.",
      "City rides, hourly rental, outstation, return trips and scheduling have a focused planning screen.",
      "All vehicle eligibility, limits and pricing stay on the existing backend.",
    ],
    [
      "auth",
      "Sign in & verification",
      "WELCOME TO HOP",
      "Your next stop starts here.",
      "Phone sign-in and verification become small, understandable steps.",
      "The prototype uses a demo sign-in only. No phone number, OTP or real session is sent.",
    ],
  ],
  captain: [
    [
      "drive",
      "Drive home",
      "READY WHEN YOU ARE",
      "Focus on the road.",
      "Online status, daily progress and one primary action. Driver tools stay off the driving surface.",
      "Offline and online are explicit. Background location requires a separate device validation gate.",
    ],
    [
      "request",
      "Incoming request",
      "A CLEAR OFFER",
      "Know it before you accept.",
      "Pickup distance, destination and fare are visible together. Decline and counter-offer stay available.",
      "The request surface is prioritised over earnings and settings.",
    ],
    [
      "pickup",
      "Head to pickup",
      "ACCEPTED",
      "One next step.",
      "Navigation context, rider details and arrival action replace the general dashboard during a trip.",
      "Only one trip action is primary at each lifecycle stage.",
    ],
    [
      "otp",
      "Verify pickup code",
      "ARRIVED",
      "Ready to begin.",
      "The six-digit demonstration code makes the transition clear. Production retains the existing server-issued code.",
      "The real pickup-code length and validation come from the backend; this is sample UI.",
    ],
    [
      "trip",
      "On trip",
      "IN PROGRESS",
      "Keep the destination clear.",
      "Map, next turn, destination and a single completion action. Safety and rider contact stay accessible.",
      "Vehicle location and trip state remain server-authoritative in the final app.",
    ],
    [
      "collect",
      "Payment & completion",
      "COMPLETED",
      "Finish with clarity.",
      "Cash, direct UPI and wallet confirmation retain distinct states. Recording cash is not a gateway verification.",
      "Payment settlement rules and provider verification will not be moved into the mobile UI.",
    ],
    [
      "earnings",
      "Earnings & payouts",
      "YOUR WORK",
      "A clearer picture of your day.",
      "Earnings, trip totals, ledger and payout requests are grouped in one dedicated destination.",
      "The sample chart is not live accounting data. Existing ledger and payout rules remain authoritative.",
    ],
    [
      "activity",
      "Trip history",
      "YOUR TRIPS",
      "Every trip has its place.",
      "Completed and cancelled trips lead to receipts, support and passenger ratings.",
      "Trip history uses the existing participant-only API.",
    ],
    [
      "tools",
      "Driver tools",
      "YOUR WORKDAY",
      "Useful when you need them.",
      "Daily goal, go-home mode, break reminder, demand zones and dispatch preferences stay one tap away.",
      "Productivity tools do not compete with incoming requests or navigation.",
    ],
    [
      "preferences",
      "Dispatch preferences",
      "YOUR PREFERENCES",
      "Work on your terms.",
      "Pickup radius, minimum fare, UPI details and notification preferences keep their current validation rules.",
      "Native controls will send the same payload units and respect server bounds.",
    ],
    [
      "account",
      "Captain account",
      "YOUR ACCOUNT",
      "Professional, organised.",
      "Vehicle, documents, profile, safety, support and account settings stay separate from driving.",
      "Identity and vehicle changes still require the existing review and approval process.",
    ],
    [
      "vehicle",
      "Vehicle & documents",
      "YOUR VEHICLE",
      "Keep everything current.",
      "Vehicle descriptors, document validity and change requests have a dedicated home.",
      "Private KYC uploads and operator approval remain unchanged.",
    ],
    [
      "onboarding",
      "Captain onboarding",
      "JOIN HOP",
      "A step at a time.",
      "Account verification, vehicle details, private evidence and review become four focused steps.",
      "This demo never uploads evidence or approves a captain.",
    ],
    [
      "insights",
      "Trip insights",
      "UNDERSTAND YOUR WORK",
      "Patterns, not clutter.",
      "Fare/time summaries, payment mix, peak hours and safety score leave the drive screen clean.",
      "Sample metrics illustrate hierarchy and are not operational performance claims.",
    ],
    [
      "safety",
      "Safety centre",
      "ALWAYS WITH YOU",
      "A safer workday.",
      "SOS, support, trip sharing and safety guidance remain available during every active stage.",
      "No demonstration action calls, shares or reports to a real service.",
    ],
    [
      "support",
      "Help & support",
      "WE ARE HERE",
      "Support with context.",
      "Driver account, trip, payment and vehicle issues have focused paths.",
      "The existing incident and support contracts are retained.",
    ],
    [
      "chat",
      "Rider chat",
      "PICKUP COORDINATION",
      "Keep it simple.",
      "Quick replies and rider contact are reachable from the current trip.",
      "Real messages remain restricted to assigned participants.",
    ],
    [
      "notifications",
      "Notifications",
      "YOUR UPDATES",
      "Useful signals.",
      "Trip requests, document expiry and payout updates stay in one inbox.",
      "Push, reconnect recovery and background delivery need physical-device testing.",
    ],
    [
      "personal",
      "Personal details",
      "YOUR DETAILS",
      "Your professional profile.",
      "Verified mobile, portrait and personal details retain their current review constraints.",
      "No real personal data is collected by this prototype.",
    ],
    [
      "privacy",
      "Privacy & account",
      "YOUR CHOICES",
      "Control your account.",
      "Privacy, export and sign-out remain available without crowding drive home.",
      "All account mutations are simulated here.",
    ],
    [
      "cockpit",
      "Cockpit navigation",
      "ON THE ROAD",
      "Focused driver HUD.",
      "Turn-by-turn maneuvers, road telemetry, lane guidance, and quick actions designed for safe in-vehicle navigation.",
      "Cockpit navigation provides high-contrast road guidance with speed telemetry and turn alerts.",
    ],
    [
      "auth",
      "Sign in & verification",
      "WELCOME CAPTAIN",
      "Your workday begins here.",
      "Phone sign-in and verification use a compact flow designed for the phone.",
      "This is a demonstration and does not authenticate a real account.",
    ],
  ],
};
function currentMeta() {
  return (
    screens[state.role].find((x) => x[0] === state.screen) ||
    screens[state.role][0]
  );
}
function go(screen, replace = false) {
  if(screen === "commute"){notify("Hop Commute is currently disabled.");return;}
  if (screen !== state.screen) $("#app").dataset.motionDirection = replace ? "back" : "forward";
  if (!replace && screen !== state.screen) state.back.push(state.screen);
  state.screen = screen;
  state.last[state.role] = screen;
  state.modal = null;
  state.error = "";
  state.search = "";
  render();
}
function back() {
  if (state.modal) {
    state.modal = null;
    render();
    return;
  }
  if (state.screen === "onboarding" && state.onboard > 0) {
    state.onboard--;
    render();
    return;
  }
  const prev = state.back.pop();
  if (prev === "auth" || !prev) {
    go(state.role === "rider" ? "home" : "drive", true);
  } else {
    go(prev, true);
  }
}
function role(next) {
  state.last[state.role] = state.screen;
  state.role = next;
  state.screen = state.last[next];
  state.back = [];
  state.modal = null;
  render();
}
function notify(message) {
  state.toast = message;
  render();
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => {
    state.toast = "";
    renderToast();
  }, 3400);
}
function renderToast() {
  $(".toast")?.remove();
  if (state.toast)
    $("#app").insertAdjacentHTML(
      "beforeend",
      `<div class="toast" role="status">${escape(state.toast)}</div>`,
    );
}
function openModal(name) {
  state.modal = name;
  state.error = "";
  render();
}
function img(category = "auto", width = 56) {
  return `<img src="./assets/${category}.png" alt="${escape(category)}" width="${width}" style="object-fit:contain;max-height:44px"/>`;
}
function primary(text, action, extra = "") {
  return `<button class="primary ${extra}" data-action="${action}">${text}${icon("arrow")}</button>`;
}
function row(title, detail, ico, screen, right = "") {
  return `<button class="list-row" data-go="${screen}"><span class="list-icon">${icon(ico)}</span><span class="list-text"><strong>${title}</strong>${detail ? `<small>${detail}</small>` : ""}</span>${right ? `<span class="right">${right}</span>` : icon("chevron")}</button>`;
}
function modalRow(title, detail, ico, modal, right = "") {
  return `<button class="list-row" data-modal="${modal}"><span class="list-icon">${icon(ico)}</span><span class="list-text"><strong>${title}</strong><small>${detail}</small></span>${right ? `<span class="right">${right}</span>` : icon("chevron")}</button>`;
}
function toggle(title, detail, key) {
  return `<button class="toggle-row" role="switch" aria-checked="${!!state.toggled[key]}" data-toggle="${key}"><span><strong>${title}</strong><small>${detail}</small></span><span class="switch ${state.toggled[key] ? "on" : ""}" aria-hidden="true"></span></button>`;
}
function routeLines(edit = false) {
  return `<div class="route-line"><span class="location-dot"></span><strong>${escape(state.pickup)}</strong>${edit ? '<button data-modal="pickup">Edit</button>' : ""}</div>${state.stops.map((p) => `<div class="route-line"><span class="location-dot" style="background:#a8b09f"></span><strong>${escape(p)}</strong></div>`).join("")}<div class="route-line"><span class="location-dot destination"></span><strong>${escape(state.tripType === "rental" ? "Hourly rental · 2 hours" : state.destination)}</strong>${edit ? '<button data-go="search">Edit</button>' : ""}</div>`;
}
function mapArt(route = false, trip = false) {
  return `<div class="map-art" role="img" aria-label="Schematic sample map; not live navigation"><svg viewBox="0 0 390 720" preserveAspectRatio="xMidYMin slice"><defs><pattern id="blocks" width="84" height="82" patternTransform="rotate(-16)" patternUnits="userSpaceOnUse"><rect width="84" height="82" fill="#e8eee2"/><rect x="6" y="7" width="29" height="27" rx="4" fill="#dfe7d5"/><rect x="43" y="7" width="34" height="27" rx="4" fill="#e0e7d8"/><rect x="6" y="42" width="34" height="33" rx="4" fill="#e0e7d8"/><rect x="47" y="42" width="30" height="33" rx="4" fill="#e1e8d9"/><path d="M0 38h84M40 0v82" stroke="#fbfcf8" stroke-width="7"/></pattern><filter id="route-shadow"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".08"/></filter></defs><rect width="390" height="720" fill="url(#blocks)"/><path d="M320-20c-30 120 10 130 60 210 45 80-10 140 0 200l50 330H500V-20Z" fill="#c4dedb"/><path d="M-20 230 412 79M-20 440 410 271M96-30 312 720M-15 92l415 325" stroke="#d0d8c6" stroke-width="14" fill="none"/><path d="M-20 230 412 79M-20 440 410 271M96-30 312 720M-15 92l415 325" stroke="#fffef5" stroke-width="9" fill="none"/><path d="M25 330c45-67 82-25 120-70s62-20 81-68" stroke="#fffef5" stroke-width="7" fill="none"/><ellipse cx="56" cy="109" rx="42" ry="31" transform="rotate(-16 56 109)" fill="#cbdcbb"/><ellipse cx="208" cy="289" rx="35" ry="24" transform="rotate(-16 208 289)" fill="#ccdcbd"/>${route ? '<path d="M99 126 130 199 175 182 204 251 263 229 282 278" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M99 126 130 199 175 182 204 251 263 229 282 278" fill="none" stroke="#34745c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#route-shadow)"/>' : ""}<text x="31" y="68" fill="#84917e" font-size="8" letter-spacing="2" font-family="sans-serif">ADYAR</text><text x="145" y="153" fill="#84917e" font-size="8" letter-spacing="2" font-family="sans-serif">GUINDY</text><text x="49" y="274" fill="#84917e" font-size="8" letter-spacing="2" font-family="sans-serif">ALANDUR</text><text x="314" y="260" fill="#749b99" font-size="8" font-family="sans-serif" transform="rotate(77 314 260)">ADYAR RIVER</text></svg></div><div class="map-pin pickup" style="left:22%;top:${route ? "18" : "24"}%"></div>${state.screen === "matching" ? `<div class="radar-pulse-wrap" style="left:22%;top:${route ? "18" : "24"}%"><span class="radar-wave"></span><span class="radar-wave delay-1"></span><span class="radar-wave delay-2"></span></div>` : ""}${route ? '<div class="map-pin" style="left:70%;top:37%"></div><div class="map-bubble" style="left:40%;top:22%">22 min <span class="muted">· 8.6 km</span></div>' : ""}<div class="mini-car" style="left:49%;top:15%">${img(trip ? "sedan" : "auto", 37)}</div><div class="mini-car" style="left:18%;top:39%;transform:rotate(25deg)">${img("sedan", 37)}</div><div class="mini-car" style="left:74%;top:12%;transform:rotate(-20deg)">${img("mini", 37)}</div><div class="map-controls"><button class="icon-button" aria-label="Map layers" data-modal="map">${icon("layers")}</button><button class="icon-button" aria-label="Centre map" data-action="center-map">${icon("target")}</button></div>`;
}
function nav(active) {
  const items =
    state.role === "rider"
      ? [
          ["home", "home", "Ride"],
          ["activity", "clock", "Activity"],
          ["wallet", "wallet", "Wallet"],
          ["account", "user", "Account"],
        ]
      : [
          ["drive", "navigation", "Drive"],
          ["earnings", "chart", "Earnings"],
          ["activity", "clock", "Trips"],
          ["account", "user", "Account"],
        ];
  return `<nav class="bottom-nav" aria-label="Mobile navigation">${items.map(([screen, ico, label]) => `<button data-go="${screen}" class="${active === screen ? "active" : ""}"><span class="nav-icon-wrap">${icon(ico)}</span>${label}</button>`).join("")}</nav>`;
}
function header(title = "", backButton = false, brand = false) {
  const isLive = typeof document !== "undefined" && (document.documentElement.classList.contains("hop-live") || document.body?.classList.contains("is-native-mobile"));
  const statusBar = isLive ? "" : '<div class="status-bar"><span>9:41</span><span class="status-icons" aria-hidden="true">▂▅▇ ◉ ▰</span></div>';
  const previewBadge = isLive ? "" : '<span class="badge neutral">Preview</span>';
  return `${statusBar}<header class="app-head"><div class="head-title">${backButton ? `<button class="icon-button flat" aria-label="Back" data-action="back">${icon("back")}</button>` : ""}${brand ? `<div class="brand">hop<span class="role-tag">${state.role === "rider" ? "RIDER" : "CAPTAIN"}</span></div>` : `<h1>${title}</h1>`}</div>${brand ? `<div class="head-tools">${state.role === "rider" ? `<button class="icon-button" aria-label="Plan a ride" data-go="plan">${icon("calendar")}</button>` : ""}<button class="icon-button" aria-label="Notifications" data-go="notifications">${icon("bell")}<i class="notification-dot"></i></button></div>` : state.screen === "tracking" || state.screen === "pickup" || state.screen === "trip" ? `<button class="icon-button" aria-label="Safety centre" data-go="safety">${icon("shield")}</button>` : previewBadge}</header>`;
}
function fareBreakdown() {
  return `<div class="breakdown"><div class="row"><span>Base fare</span><span>${money(40)}</span></div><div class="row"><span>Distance charge</span><span>${money(v().price - 40)}</span></div><div class="row"><span>Platform fee</span><span>₹0</span></div>${state.promo ? '<div class="row"><span>HOP50 discount</span><span>−₹50</span></div>' : ""}<div class="row"><span>Estimated total</span><span>${money(price())}</span></div></div>`;
}
function vehicleRows() {
  return vehicleData
    .map(
      (item) =>
        `<button class="vehicle ${state.vehicle === item.id ? "selected" : ""}" role="radio" aria-checked="${state.vehicle === item.id}" data-vehicle="${item.id}">${img(item.id, 49)}<span><strong>${item.name}</strong><small>${item.eta} away · ${item.seats} ${item.seats === 1 ? "seat" : "seats"}</small></span><span class="vehicle-price">${money(item.price)}</span><i class="radio-dot" aria-hidden="true"></i></button>`,
    )
    .join("");
}

function journeyRibbon() {
  let steps, current;
  const booking = ["search", "choose", "confirm"];
  if (state.role === "rider" && booking.includes(state.screen)) {
    steps = ["Route", "Ride", "Review"];
    current = booking.indexOf(state.screen);
  } else if (state.role === "rider" && ["matching", "tracking", "receipt"].includes(state.screen)) {
    steps = ["Request", "Meet", "Ride", "Done"];
    current = state.screen === "receipt" ? 3 : state.screen === "matching" ? 0 : state.phase === "in_progress" ? 2 : 1;
  } else if (state.role === "captain" && ["request", "pickup", "otp", "trip", "collect", "receipt"].includes(state.screen)) {
    steps = ["Pickup", "Verify", "Trip", "Finish"];
    current = state.screen === "request" || state.screen === "pickup" ? 0 : state.screen === "otp" ? 1 : state.screen === "trip" ? 2 : 3;
  }
  if (!steps) return "";
  return `<nav class="journey-ribbon" aria-label="Journey progress"><ol>${steps.map((label, index) => `<li class="${index < current ? "complete" : index === current ? "current" : ""}" ${index === current ? 'aria-current="step"' : ""}><span class="journey-dot" aria-hidden="true">${index < current ? "✓" : ""}</span><span>${label}</span></li>`).join("")}</ol></nav>`;
}
function pickupBrief() {
  return `<button class="pickup-brief" data-modal="meeting"><span class="pickup-brief-icon">${icon("pin")}</span><span><strong>Meet at your pickup pin</strong><small>${escape(state.pickup)}</small></span>${icon("chevron", "tiny-icon")}</button>`;
}
function fareCaption() {
  return `<small class="fare-caption">${state.promo ? "HOP50 applied · see details" : state.quoteRefreshed ? "Refreshed · see fare details" : "See what’s in your fare"}</small>`;
}

function commuteView() {
  const corridors = [
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

  const filtered =
    state.commuteCorridorFilter === "all"
      ? corridors
      : corridors.filter((c) => c.corridor === state.commuteCorridorFilter);

  return {
    title: "Hop Commute",
    back: true,
    body: `<div class="screen-padding"><div class="commute-hero"><div class="row"><div><span class="home-greeting">OFFICE CORRIDORS</span><h2>Hop Commute</h2></div><span class="badge" style="background:#eaf5ec;color:#236e3d">Shared Ride</span></div><p class="small muted" style="margin-top:6px">Share an existing daily route with verified coworkers. Low cost, zero surge, guaranteed seats.</p></div><div class="tabs" style="margin:14px 0 10px"><button class="${state.commuteTab === "find" ? "active" : ""}" data-commute-tab="find">Find a commute</button><button class="${state.commuteTab === "offer" ? "active" : ""}" data-commute-tab="offer">Publish route</button></div>${
      state.commuteTab === "find"
        ? `<div class="commute-filters"><button class="product-chip ${state.commuteCorridorFilter === "all" ? "active" : ""}" data-commute-filter="all">All corridors</button><button class="product-chip ${state.commuteCorridorFilter === "omr" ? "active" : ""}" data-commute-filter="omr">OMR IT</button><button class="product-chip ${state.commuteCorridorFilter === "guindy" ? "active" : ""}" data-commute-filter="guindy">Guindy</button><button class="product-chip ${state.commuteCorridorFilter === "ambattur" ? "active" : ""}" data-commute-filter="ambattur">Ambattur</button></div><div class="commute-list">${filtered
            .map(
              (item) =>
                `<div class="commute-card section-card"><div class="row"><strong style="font-size:14px">${escape(item.name)}</strong><span class="badge ${item.badge.includes("Women") ? "coral" : "neutral"}">${escape(item.badge)}</span></div><p class="micro muted" style="margin:3px 0 8px">${escape(item.sub)}</p><div class="commute-meta-grid"><span>${icon("clock", "tiny-icon")} <strong>${escape(item.time)}</strong></span><span>${icon("car", "tiny-icon")} ${escape(item.car)}</span><span>${icon("user", "tiny-icon")} ${escape(item.captain)} ★ ${item.rating}</span><span>${icon("pin", "tiny-icon")} Meeting: Main Gate</span></div><div class="row" style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line);align-items:center"><div><span class="amount" style="font-size:18px">₹${item.price}</span><small class="muted" style="display:block;font-size:9px">per seat · shared cost</small></div><div><span class="seats-left-pill ${item.seatsLeft <= 1 ? "urgent" : ""}">${state.commuteReserved.includes(item.id) ? "Reserved ✓" : `${item.seatsLeft} of ${item.seatsTotal} seats left`}</span><button class="${state.commuteReserved.includes(item.id) ? "secondary" : "primary"}" style="min-height:36px;padding:0 12px;font-size:11px;margin-left:6px" data-reserve-commute="${item.id}">${state.commuteReserved.includes(item.id) ? "Cancel seat" : "Reserve seat"}</button></div></div></div>`,
            )
            .join(
              "",
            )}</div><div class="notice-box" style="margin-top:14px">Hop Commute facilitates legitimate cost-sharing for regular office commutes in compliance with non-commercial guidelines.</div>`
        : `<div class="section-card"><strong class="small">Share your regular office drive</strong><p class="micro muted" style="margin:4px 0 14px">Publish your route to offset fuel costs with verified coworkers.</p><label class="field-label" for="commute-origin">Starting area</label><input class="text-input" id="commute-origin" value="Adyar, Chennai"/><label class="field-label" for="commute-work">Work Tech Park</label><input class="text-input" id="commute-work" value="Olympia Tech Park, Guindy"/><label class="field-label" for="commute-time">Departure time (Morning)</label><input class="text-input" id="commute-time" type="time" value="08:30"/><label class="field-label" for="commute-seats">Available seats</label><select class="text-input" id="commute-seats"><option>1 seat</option><option selected>2 seats</option><option>3 seats</option></select><button class="primary" style="margin-top:14px;width:100%" data-action="publish-commute">Publish sample commute route</button></div>`
    }</div>`,
  };
}

function cockpitHUD(type = "trip") {
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

  return `<div class="cockpit-container"><div class="cockpit-header"><div class="cockpit-turn-card"><span class="cockpit-turn-symbol">${maneuver.icon}</span><div class="cockpit-turn-text"><div class="cockpit-turn-dist">In ${maneuver.dist}</div><div class="cockpit-turn-street">${maneuver.street}</div><div class="cockpit-turn-dir">${maneuver.dir}</div></div></div></div><div class="cockpit-center"><div class="cockpit-lanes"><span class="lane-box">↑</span><span class="lane-box active">${maneuver.icon}</span><span class="lane-box">↱</span></div><div class="cockpit-telemetry"><div class="speed-gauge"><span class="speed-num">${maneuver.speed}</span><span class="speed-unit">km/h</span></div><div class="speed-limit-sign"><span class="limit-label">LIMIT</span><span class="limit-num">${maneuver.limit}</span></div><div class="compass-badge">${icon("navigation", "tiny-icon")} ${maneuver.heading}</div></div></div><div class="cockpit-footer"><div class="cockpit-trip-stats"><div class="stat-col"><small>ETA</small><strong>${isPickup ? "3 min" : "18 min"}</strong></div><div class="stat-col"><small>Remaining</small><strong>${isPickup ? "1.2 km" : "6.2 km"}</strong></div><div class="stat-col"><small>Destination</small><strong>${isPickup ? "Pickup Pin" : "Airport"}</strong></div></div><div class="cockpit-actions"><button class="primary" data-action="${isPickup ? "arrive" : "complete-trip"}">${isPickup ? "I’ve arrived" : "Complete trip"} ${icon("arrow")}</button><button class="cockpit-exit-btn secondary" data-action="toggle-cockpit">Exit Cockpit HUD</button></div></div></div>`;
}

function riderView() {
  switch (state.screen) {
    case "home":
      return {
        brand: true,
        map: true,
        nav: "home",
        body: `${mapArt()}<div class="map-bubble" style="left:18px;top:19px;display:flex;align-items:center;gap:6px">${icon("pin", "tiny-icon")} Chennai <span class="muted">⌄</span></div><div class="sheet home-sheet"><div class="sheet-handle"></div><div class="home-heading"><span class="home-greeting">A LITTLE CLOSER, WITH HOP</span><h2>Where to next?</h2></div><p class="subline">Your city. Your people. Your way.</p><button class="destination-search" data-go="search">${icon("search")}<span style="flex:1">Where are you going?</span><span class="round">${icon("arrow")}</span></button><div class="shortcut-grid"><button class="shortcut" data-destination="Home">${icon("home")}<span><strong>Home</strong><small>2nd Cross Street</small></span></button><button class="shortcut" data-destination="Work">${icon("briefcase")}<span><strong>Work</strong><small>Olympia Tech Park</small></span></button></div><div class="product-row"><button class="product-chip active" data-go="search">City ride</button><button class="product-chip" data-triptype="rental">Hourly rental</button><button class="product-chip" data-triptype="outstation">Outstation</button></div><button class="usual-ride" data-action="usual-ride"><span class="usual-mark">${icon("refresh")}</span><span><small>MY USUAL RIDE</small><strong>${escape(state.usual.destination)}</strong><span>${vehicleData.find(item => item.id === state.usual.vehicle).name} · ${state.usual.payment}</span></span><span class="usual-arrow">${icon("arrow")}</span></button></div>`,
      };
    case "search":
      return {
        title: "Where are you going?",
        back: true,
        body: `<div class="screen-padding"><div class="route-fields"><div class="route-field"><i class="location-dot"></i><div><small>Pickup location</small><input id="pickup-input" aria-label="Pickup location" value="${escape(state.pickup)}"/></div><button class="icon-button flat" aria-label="Use current location" data-action="current-location">${icon("target")}</button></div><div class="route-field"><i class="location-dot destination"></i><div><small>Destination</small><input id="destination-input" aria-label="Search destination" placeholder="Search a place or address" value="${escape(state.search)}" autocomplete="off"/></div><button class="icon-button flat" aria-label="Voice booking" data-modal="voice">${icon("mic")}</button></div></div><div class="row" style="margin-top:5px"><button class="text-button" data-modal="stops">${icon("plus", "tiny-icon")} Add a stop${state.stops.length ? ` (${state.stops.length})` : ""}</button><button class="text-button" data-go="plan">${icon("calendar", "tiny-icon")} ${escape(state.schedule)}</button></div><div class="section-label"><span id="results-label">SAVED & RECENT</span><button class="text-button" data-go="saved">Manage places</button></div><div id="place-results">${placeResults("")}</div></div>`,
      };
    case "choose":
      const isOmr = state.routeAlternative === "omr";
      const routeKm = isOmr ? "10.2 km" : "8.6 km";
      const routeTime = isOmr ? "26 min" : "22 min";
      return {
        title: "Choose your ride",
        back: true,
        map: true,
        body: `${mapArt(true)}<div class="route-pill">${icon("pin")}<strong>${escape(state.pickup.split(",")[0])} → ${escape(state.destination)}</strong><button data-go="search">Edit</button></div><div class="sheet choose-sheet"><div class="sheet-handle"></div><div class="row"><h2>A ride that fits.</h2><span class="badge neutral">Sample fares</span></div><p class="subline">${routeKm} · about ${routeTime} via ${isOmr ? "OMR (Toll free)" : "Guindy"}</p><div class="route-alt-row" role="radiogroup" aria-label="Route alternative"><button class="route-alt-chip ${!isOmr ? "active" : ""}" data-route-alt="fastest" role="radio" aria-checked="${!isOmr}"><span>Fastest</span><strong>22 min</strong><small>8.6 km · via Guindy</small></button><button class="route-alt-chip ${isOmr ? "active" : ""}" data-route-alt="omr" role="radio" aria-checked="${isOmr}"><span>Via OMR</span><strong>26 min</strong><small>10.2 km · Toll free</small></button></div><div role="radiogroup" aria-label="Vehicle options">${vehicleRows()}</div></div>`,
        action: `<button class="footer-price fare-trigger" data-modal="fare"><span>${v().name} · ${v().eta} away${fareCaption()}</span><strong>${money(v().price)}</strong>${icon("chevron", "tiny-icon")}</button>${primary("Continue", "review")}`,
      };
    case "confirm":
      return {
        title: "Review your ride",
        back: true,
        map: true,
        body: `${mapArt(true)}<div class="sheet confirm-sheet"><div class="sheet-handle"></div><div class="row">${img(state.vehicle, 58)}<div style="flex:1"><strong>${v().name}</strong><p class="small muted">${v().eta} away · ${v().seats} seats</p></div><span class="badge coral">Sample quote</span></div><div class="confirm-route">${routeLines(true)}</div><button class="pickup-inline" data-modal="meeting">${icon("pin", "tiny-icon")}<span>Check your meeting point</span>${icon("chevron", "tiny-icon")}</button><button class="compact-row" data-modal="payment">${icon("wallet")}<strong>Payment method</strong><small>${state.payment}</small>${icon("chevron", "chevron")}</button><button class="compact-row" data-modal="promo">${icon("gift")}<strong>${state.promo ? "HOP50 applied" : "Add a promo code"}</strong><small>${state.promo ? "−₹50" : ""}</small>${icon("chevron", "chevron")}</button><button class="compact-row" data-modal="passenger">${icon("user")}<strong>Riding for</strong><small>${state.who}</small>${icon("chevron", "chevron")}</button><button class="compact-row" data-modal="options">${icon("settings")}<strong>Ride options</strong><small>${state.share ? "Shared ride" : "Sharing, offer & more"}</small>${icon("chevron", "chevron")}</button><button class="compact-row" data-modal="fare">${icon("file")}<strong>Fare breakdown</strong><small>${money(price())}</small>${icon("chevron", "chevron")}</button></div>`,
        action: `<button class="footer-price fare-trigger" data-modal="fare"><span>Estimated fare · sample quote${fareCaption()}</span><strong>${money(price())}</strong>${icon("chevron", "tiny-icon")}</button>${primary(state.schedule === "Now" ? "Request a ride" : "Schedule ride", "request")}<p class="fineprint">${state.schedule === "Now" ? "Review your quote before booking." : "Final pricing is confirmed when your scheduled ride dispatches."}</p>`,
      };
    case "matching":
      return {
        title: "Finding your captain",
        back: false,
        map: true,
        body: `${mapArt(true)}<div class="sheet"><div class="sheet-handle"></div><div class="tracking-heading"><h2>You’re in good hands.</h2><div class="eta">⌁<small>Searching</small></div></div><p class="subline" style="margin-top:8px">Your request is looking for a nearby ${v().name.toLowerCase()}.</p><div class="step-progress"><i class="done"></i><i></i><i></i></div><div class="matching-radar-status"><div class="radar-spinner"></div><div><strong style="font-size:11px">Broadcasting to 4 nearby Captains...</strong><small style="display:block;color:var(--muted);font-size:9px">OMR Corridor · First captain to accept wins</small></div></div><div class="confirm-route">${routeLines()}</div><div class="row"><span class="small muted">Requested fare</span><strong>${money(price())}</strong></div><div class="handoff-box"><div class="row" style="margin-bottom:4px"><span class="badge green" style="font-size:9px">● Dispatch Dispatched</span><span class="micro muted">Simulate Captain Role</span></div><p class="micro" style="margin:0 0 8px;color:var(--muted)">Captain Suresh received this incoming request (${money(price())}).</p><div style="display:flex;flex-direction:column;gap:5px"><button class="primary small" data-action="preview-captain-notification" style="width:100%;font-size:11px">🔔 Switch to Captain: See Notification & Accept →</button><button class="text-button" data-action="simulate-other-captain-accept" style="width:100%;font-size:10px;text-align:center">⚡ Simulate: Another captain accepts first</button></div></div><div class="circle-actions"><button data-modal="cancel">${icon("close")}Cancel request</button><button data-modal="bids">${icon("chat")}Fare offers</button><button data-go="safety">${icon("shield")}Safety</button></div></div>`,
      };
    case "tracking":
      return {
        title:
          state.phase === "in_progress"
            ? "On your way"
            : "Your captain is coming",
        back: false,
        map: true,
        body: `${mapArt(true, true)}<div class="sheet"><div class="sheet-handle"></div><div class="tracking-heading"><h2>${state.phase === "in_progress" ? "Next stop: your plans." : state.phase === "arrived" ? "Your captain is here." : "Meet Arun in 3 min."}</h2><div class="eta">${state.phase === "in_progress" ? "18" : state.phase === "arrived" ? "0" : "3"}<small>min</small></div></div><div class="driver-card"><span class="avatar driver">A</span><span class="driver-text"><strong>Arun Kumar <span class="small muted">★ 4.9</span></strong><small>${v().name} · Verified captain</small><span class="plate">TN 09 AB 1234</span></span>${img(state.vehicle, 60)}</div>${state.phase !== "in_progress" ? pickupBrief() : ""}${state.phase !== "in_progress" ? `<div class="pin-code ${state.phase === "arrived" ? "highlight" : ""}"><span class="small">${state.phase === "arrived" ? "Share OTP with Captain to begin trip" : "Your pickup code"}<small class="muted" style="display:block;font-size:9px;margin-top:3px">Share only when you meet your captain</small></span><strong>431602</strong></div>` : `<div class="confirm-route">${routeLines()}</div>`}<div class="row" style="margin:4px 0 2px"><button class="text-button" data-action="switch-to-captain-pickup" style="width:100%;font-size:10px;text-align:center">📲 Switch to Captain perspective (${state.phase === "arrived" ? "Enter OTP" : "Navigation"}) →</button></div><div class="circle-actions"><button data-modal="call">${icon("phone")}Call captain</button><button data-go="chat">${icon("chat")}Message</button><button data-go="safety">${icon("shield")}Safety</button></div><button class="secondary" data-modal="${state.phase === "in_progress" ? "share" : "cancel"}">${state.phase === "in_progress" ? "Share your trip" : "Trip details & cancellation"}</button></div>`,
      };
    case "commute":
      return commuteView();
    default:
      return commonView();
  }
}
function placeResults(query) {
  const matches = places.filter((p) =>
    `${p.name} ${p.detail}`.toLowerCase().includes(query.toLowerCase()),
  );
  return matches.length
    ? matches
        .map(
          (p) =>
            `<button class="list-row" data-destination="${escape(p.name)}"><span class="list-icon">${icon(p.icon)}</span><span class="list-text"><strong>${p.name}</strong><small>${p.detail}</small></span>${icon("chevron")}</button>`,
        )
        .join("")
    : `<div class="empty-state">${icon("search")}<h2>Try another place</h2><p>This prototype searches six sample destinations. Live Places search will use the existing service.</p></div>`;
}
function captainView() {
  switch (state.screen) {
    case "drive":
      const headsUpAlert = state.phase === "requested"
        ? `<div class="captain-heads-up" data-go="request"><div class="heads-up-head"><span class="app-badge"><b>h</b> Hop Captain</span><span class="heads-up-timer">15s</span></div><div class="heads-up-body"><strong>New Ride Request Nearby!</strong><p>Pickup: ${escape(state.pickup.split(",")[0])} · ${money(price())} (${v().name})</p></div><div class="heads-up-cta">Tap to review & accept (2 offers available) →</div></div>`
        : "";
      return {
        brand: true,
        map: true,
        nav: "drive",
        body: `${headsUpAlert}${mapArt(false, true)}<div class="online-pill ${state.online ? "online" : ""}"><i></i>${state.online ? "You’re online" : "You’re offline"}</div><button class="earnings-mini" data-go="earnings">Today’s earnings<strong>₹1,260</strong></button><div class="sheet"><div class="sheet-handle"></div><div class="zone-pill-row"><button class="zone-pill" data-modal="service-area">${icon("navigation", "tiny-icon")} City: ${escape(state.serviceArea)} <span class="badge green" style="font-size:8px;padding:2px 6px">City service</span></button></div>${!state.driverApproved ? `<div class="notice-box onboarding-banner" style="margin:8px 0 12px;cursor:pointer;background:var(--accent-warm,#fef7e6);border:1px solid #e0c875;color:#8a6e2b" data-go="onboarding"><div class="row"><strong>Complete onboarding to go online in your operating city</strong>${icon("chevron", "tiny-icon")}</div><p class="micro" style="margin-top:2px">Submit details and verify credentials for in your operating city coverage.</p></div>` : ""}<h2>${state.online ? "Your next ride awaits." : "Your day, at your pace."}</h2><p class="subline">${state.online ? "You’ll receive requests near your current location." : "Go online when you’re ready for your next trip."}</p><div class="row small"><span class="muted">Daily goal</span><strong>₹1,260 <span class="muted">/ ${money(state.goal)}</span></strong></div><div class="progress-track"><i style="width:${Math.min(100, (1260 / state.goal) * 100)}%"></i></div><div class="row" style="margin:12px 0 16px"><span class="small muted">6 trips today</span><button class="text-button" style="font-size:10px;min-height:24px;padding:0" data-go="tools">Driver tools ${icon("chevron", "tiny-icon")}</button></div></div>`,
        action: `${primary(state.online ? "Take a break · Go offline" : state.driverApproved ? "Go online" : "Complete onboarding to go online", "online", state.online ? "dark" : "")}<p class="fineprint">${state.online ? "Location sharing is on while you’re online." : "Location is shared only while you’re online."}</p>`,
      };
    case "request":
      const captainOffers = [
        {
          rider: "Demo Rider",
          rating: "4.8",
          pickup: state.pickup,
          dest: state.destination,
          dist: "1.2 km",
          time: "22 min",
          tripKm: "8.6 km",
          price: price(),
          vehicle: v().name,
          payment: state.payment,
          corridor: "OMR IT Corridor",
        },
        {
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
      const curOffer = captainOffers[state.offerIndex] || captainOffers[0];
      return {
        title: "New ride request",
        map: true,
        body: `${mapArt(true, true)}<div class="online-pill online"><i></i>New request · Sample</div><div class="sheet driver-sheet"><div class="sheet-handle"></div><div class="offer-switcher" role="tablist" aria-label="Incoming ride offers"><button class="offer-tab-btn ${state.offerIndex === 0 ? "active" : ""}" data-switch-offer="0"><span><strong>Offer 1</strong> · Adyar</span><span>${money(price())}</span></button><button class="offer-tab-btn ${state.offerIndex === 1 ? "active" : ""}" data-switch-offer="1"><span><strong>Offer 2</strong> · Guindy</span><span>₹195</span></button></div><div class="offer-timer-bar"><div class="timer-top"><span class="timer-pulse"></span><span class="timer-text">Offer expires in <strong>15s</strong></span><span class="timer-badge">Auto-dispatch</span></div><div class="timer-track"><i class="timer-fill"></i></div></div><div class="row"><div><span class="small muted">Estimated fare (${curOffer.rider})</span><div class="amount">${money(curOffer.price)}</div></div><span class="badge coral">${curOffer.vehicle}</span></div><div class="offer-facts"><span>${icon("pin", "tiny-icon")}<strong>${curOffer.dist}</strong><small>to pickup</small></span><span>${icon("clock", "tiny-icon")}<strong>${curOffer.time}</strong><small>trip time</small></span><span>${icon("wallet", "tiny-icon")}<strong>${curOffer.payment}</strong><small>payment</small></span></div><div class="confirm-route"><div class="route-line"><span class="location-dot"></span><strong>${escape(curOffer.pickup)}</strong></div><div class="route-line"><span class="location-dot destination"></span><strong>${escape(curOffer.dest)}</strong></div></div><div class="row small"><span class="muted">Trip distance</span><strong>${curOffer.tripKm} · ${curOffer.time}</strong></div></div>`,
        action: `<div class="driver-offer-actions" style="margin-top:0"><button class="secondary" data-action="decline">Decline</button>${primary("Accept ride", "accept")}</div><div class="row" style="margin-top:6px;gap:8px"><button class="text-button" style="flex:1;font-size:10px" data-modal="ride-taken">⚡ Simulate: Taken by another captain</button><button class="text-button" style="flex:1;font-size:10px" data-modal="counter">Make counter-offer</button></div>`,
      };
    case "pickup":
      if (state.cockpitMode) {
        return {
          title: "Cockpit Navigation",
          body: cockpitHUD("pickup"),
        };
      }
      return {
        title: "Head to pickup",
        map: true,
        body: `${mapArt(true, true)}<div class="route-pill">${icon("navigation")}<strong>Turn left onto Sardar Patel Road</strong><span class="small">200 m</span></div><div class="sheet"><div class="sheet-handle"></div><div class="tracking-heading"><h2>Pickup in 3 min.</h2><span class="badge">Accepted</span></div><div class="driver-card"><span class="avatar driver">D</span><span class="driver-text"><strong>Demo Rider <span class="small muted">★ 4.8</span></strong><small>${escape(state.pickup)}</small></span></div><div class="circle-actions"><button data-modal="call">${icon("phone")}Call rider</button><button data-go="chat">${icon("chat")}Message</button><button data-go="safety">${icon("shield")}Safety</button></div><button class="text-button" style="width:100%;margin-top:6px" data-action="toggle-cockpit">${icon("navigation", "tiny-icon")} Fullscreen Cockpit HUD</button></div>`,
        action: `${primary("I’ve arrived", "arrive")}<p class="fineprint">Mark arrived when you reach the pickup point.</p>`,
      };
    case "otp":
      return {
        title: "Start the ride",
        back: true,
        body: `<div class="screen-padding"><div class="empty-state" style="padding:22px 10px 10px">${icon("lock")}<h2>Ask for the pickup code.</h2><p>Confirm you’re with the right rider before starting your trip.</p></div><div class="pin-entry">${[0, 1, 2, 3, 4, 5].map((i) => `<input id="pin-${i}" type="text" inputmode="numeric" maxlength="1" aria-label="Code digit ${i + 1}"/>`).join("")}</div><div class="otp-actions-row"><button class="secondary small auto-otp-btn" data-action="autofill-otp">${icon("lock", "tiny-icon")} Autofill Rider OTP (431602)</button></div><p class="fineprint" style="margin-top:8px">Prototype code: <strong>431602</strong>. Actual code rules stay with the backend.</p><p class="message-error" id="pin-error" role="alert"></p><div class="section-card" style="margin-top:16px"><div class="driver-card" style="padding:0"><span class="avatar">D</span><span class="driver-text"><strong>Demo Rider</strong><small>${escape(state.destination)}</small></span></div></div><div class="notice-box">Pickup waiting charges retain the existing grace period and backend rules. This screen shows no running charge.</div></div>`,
        action: primary("Verify & start ride", "start-trip"),
      };
    case "trip":
      if (state.cockpitMode) {
        return {
          title: "Cockpit Navigation",
          body: cockpitHUD("trip"),
        };
      }
      return {
        title: "On trip",
        map: true,
        body: `${mapArt(true, true)}<div class="route-pill">${icon("navigation")}<strong>Continue straight on GST Road</strong><span class="small">1.4 km</span></div><div class="sheet"><div class="sheet-handle"></div><div class="tracking-heading"><h2>Keep going. You’re close.</h2><div class="eta">18<small>min to drop</small></div></div><div class="confirm-route"><div class="route-line"><span class="location-dot destination"></span><strong>${escape(state.destination)}</strong></div><p class="small muted" style="margin:8px 0 0 17px">6.2 km remaining · sample navigation</p></div><div class="circle-actions"><button data-modal="navigation">${icon("navigation")}Navigation</button><button data-go="chat">${icon("chat")}Message</button><button data-go="safety">${icon("shield")}Safety</button></div><button class="text-button" style="width:100%;margin-top:6px" data-action="toggle-cockpit">${icon("navigation", "tiny-icon")} Fullscreen Cockpit HUD</button></div>`,
        action: `${primary("Complete trip", "complete-trip")}<p class="fineprint">Complete only after reaching the destination.</p>`,
      };
    case "cockpit":
      return {
        title: "Cockpit Navigation",
        body: cockpitHUD("trip"),
      };
    case "collect":
      return {
        title: "Finish your trip",
        body: `<div class="screen-padding"><div class="receipt-total"><span class="check-circle">${icon("check")}</span><p>Trip completed</p><h2>${money(price())}</h2><p>${state.payment === "Cash" ? "Collect cash from the rider" : state.payment === "UPI" ? "Confirm direct UPI payment" : "Payment status from Hop wallet"}</p></div><div class="section-card"><div class="row"><span class="small muted">Payment method</span><strong class="small">${state.payment}</strong></div>${fareBreakdown()}</div><div class="notice-box">${state.payment === "Wallet" ? "The final app will show the server’s settlement status. This sample does not charge a wallet." : "Recording a direct payment is a captain report. It is not an independent gateway confirmation."}</div></div>`,
        action: primary(
          state.payment === "Wallet"
            ? "Preview confirmed settlement"
            : "Record payment received",
          "settle",
        ),
      };
    case "earnings":
      const periodData = {
        "Today": {
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
      const cur = periodData[state.earningsPeriod] || periodData["Today"];
      return {
        title: "Your earnings",
        nav: "earnings",
        body: `<div class="screen-padding"><div class="tabs"><button class="${state.earningsPeriod === "Today" ? "active" : ""}" data-earnings-period="Today">Today</button><button class="${state.earningsPeriod === "This week" ? "active" : ""}" data-earnings-period="This week">This week</button><button class="${state.earningsPeriod === "This month" ? "active" : ""}" data-earnings-period="This month">This month</button></div><div class="earnings-hero"><p class="small muted">FARES EARNED · ${state.earningsPeriod.toUpperCase()}</p><div class="amount">₹${cur.amount}<span style="font-size:19px;color:#9ca496">.00</span></div><p class="small muted">${cur.trips} completed trips · ${cur.km} km</p></div><div class="section-card"><div class="row"><strong class="small">${state.earningsPeriod} overview</strong><span class="small muted">₹${cur.amount}</span></div><div class="chart" role="img" aria-label="Illustrative fares in rupees"><div style="position:absolute;right:0;top:-13px;font-size:8px;color:#899483">${cur.legend}</div>${cur.bars.map((h, i) => `<div class="chart-col ${i === cur.bars.length - 1 ? "active" : ""}" style="height:${h}%"><span>${cur.labels[i]}</span></div>`).join("")}</div></div><div class="stat-grid"><div class="stat"><strong>₹${cur.cash}</strong><small>Cash & direct UPI</small></div><div class="stat"><strong>₹${cur.online}</strong><small>Wallet & online</small></div></div><div class="section-label">Your balance</div><div class="section-card"><div class="row"><span><strong>₹2,140</strong><small class="muted" style="display:block;margin-top:3px;font-size:9px">Available to withdraw · sample</small></span><button class="text-button" data-modal="payout">Withdraw ${icon("arrow", "tiny-icon")}</button></div></div>${row("Transactions & payouts", "Ledger, payment method and status", "file", "ledger")}${row("Trip insights", "Fare, time and payment summaries", "chart", "insights")}</div>`,
      };
    case "tools":
      return {
        title: "Driver tools",
        back: true,
        body: `<div class="screen-padding"><div class="section-label">A good workday starts here.</div><div class="section-card"><div class="row"><strong class="small">Daily earnings goal</strong><button class="text-button" data-modal="goal">Edit</button></div><p class="small muted">₹1,260 of ${money(state.goal)}</p><div class="progress-track"><i style="width:${Math.min(100, (1260 / state.goal) * 100)}%"></i></div></div><div class="section-card" style="margin-top:14px"><button class="toggle-row" data-action="home-mode" role="switch" aria-checked="${state.homeMode}"><span><strong>Head towards home</strong><small>${state.homeMode ? "On · sample 90-minute window" : "Prefer trips heading towards home"}</small></span><span class="switch ${state.homeMode ? "on" : ""}"></span></button><p class="small muted">Existing daily usage limits will still apply.</p></div>${modalRow("Operating city", `${state.serviceArea} · City service`, "navigation", "service-area")}${row("Demand nearby", "View sample busy pickup areas", "layers", "demand")}${row("Pickup & fare preferences", "Radius and minimum fare", "settings", "preferences")}${modalRow("Break reminder", "A pause after four hours online", "clock", "break")}${row("Your safety score", "Feedback and driving record", "shield", "insights")}</div>`,
      };
    case "vehicle":
      return {
        title: "Vehicle & documents",
        back: true,
        body: `<div class="screen-padding"><div class="section-card" style="margin-top:8px;text-align:center;padding:22px">${img(state.vehicle, 100)}<h2 style="font-size:18px;margin-top:10px">${v().name}</h2><p class="small muted" style="margin-top:5px">TN 09 AB 1234 · Verified vehicle</p></div><div class="section-label">Private documents</div>${modalRow("Driving licence", "Expires 18 Dec 2028", "file", "document")}${modalRow("Registration certificate", "Approved", "file", "document")}${modalRow("Vehicle insurance", "Expires 12 Mar 2027", "shield", "document")}${modalRow("Identity document", "Approved · private", "lock", "document")}<button class="secondary" style="margin-top:20px" data-modal="vehicle-change">Request vehicle change</button><div class="notice-box">Vehicle and identity changes still require operator approval. Nothing is uploaded or changed in this preview.</div></div>`,
      };
    case "onboarding":
      return {
        title: "Become a captain",
        back: true,
        body: onboarding(),
        action:
          (state.onboard > 0 ? `<button class="secondary" data-action="onboarding-back" style="flex:1">Back</button>` : "") +
          `<button class="primary" data-action="onboarding-next" style="flex:2">${state.onboard === 3 ? "Submit for review" : "Continue"}</button>`,
      };
    case "insights":
      return {
        title: "Your trip insights",
        back: true,
        body: `<div class="screen-padding"><div class="safety-hero">${icon("shield")}<div><h2>Looking good.</h2><p>Safety score · sample data</p></div><strong style="font-size:28px">96</strong></div><div class="stat-grid"><div class="stat"><strong>4.9</strong><small>Rider rating</small></div><div class="stat"><strong>96%</strong><small>Completion rate</small></div><div class="stat"><strong>₹210</strong><small>Average fare</small></div><div class="stat"><strong>22 min</strong><small>Average trip time</small></div></div>${modalRow("Fare & time summary", "Distance, waiting and time on trips", "chart", "insight-details")}${modalRow("Payment breakdown", "Cash, direct UPI, wallet and online", "wallet", "insight-details")}${modalRow("Busy hours & areas", "Find the patterns in your workday", "clock", "insight-details")}<div class="notice-box">These are illustrative metrics. Real calculations and statuses come from the existing earnings and safety endpoints.</div></div>`,
      };
    case "demand":
      return {
        title: "Demand nearby",
        back: true,
        map: true,
        body: `${mapArt()}<div class="map-bubble" style="left:80px;top:80px;background:#faeac5;color:#8a6e2b">Guindy · Higher demand</div><div class="sheet"><div class="sheet-handle"></div><h2>Where the city is moving.</h2><p class="subline">Illustrative zones · no live demand data</p>${row("Guindy", "2.1 km away · sample", "pin", "drive")}${row("Adyar", "1.4 km away · sample", "pin", "drive")}</div>`,
      };
    default:
      return commonView();
  }
}
function onboarding() {
  const headings = [
    "First, your account.",
    "Tell us about your vehicle.",
    "Keep your documents ready.",
    "Ready for review.",
  ];
  return `<div class="screen-padding"><div class="onboarding-steps">${[0, 1, 2, 3].map((i) => `<span class="${i <= state.onboard ? "active" : ""}"></span>`).join("")}</div><p class="eyebrow">STEP ${state.onboard + 1} OF 4</p><h2 style="font-size:23px;letter-spacing:-.7px">${headings[state.onboard]}</h2>${
    state.onboard === 0
      ? `<label class="field-label" for="onboard-name">Your legal name</label><input class="text-input" id="onboard-name" value="${escape(state.name || "Demo Captain")}"/><label class="field-label" for="onboard-phone">Mobile number</label><input class="text-input" id="onboard-phone" value="${escape(state.phone || "+91 98765 43210")}" readonly/><button class="upload" data-action="demo-verify">${icon("shield")}<span>Verify mobile<small>Phone verified · ready</small></span></button><button class="upload" data-action="portrait">${icon("camera")}<span>Profile photo<small>Sample portrait verified</small></span></button><label class="field-label" for="onboard-state" style="margin-top:14px">Operating city</label><select class="text-input" id="onboard-state"><option value="Chennai" ${state.serviceArea.startsWith("Tamil Nadu") ? "selected" : ""}>Chennai</option><option value="Bengaluru" ${state.serviceArea.startsWith("Karnataka") ? "selected" : ""}>Bengaluru</option><option value="Hyderabad" ${state.serviceArea.startsWith("Telangana") ? "selected" : ""}>Hyderabad</option><option value="Mumbai" ${state.serviceArea.startsWith("Maharashtra") ? "selected" : ""}>Mumbai</option><option value="Delhi NCR" ${state.serviceArea.startsWith("Delhi") ? "selected" : ""}>Delhi NCR</option></select><p class="micro muted" style="margin-top:4px">City service Permit: No neighbourhood-zone approvals. Once approved, you are authorized to operate in the selected operating city.</p>`
      : state.onboard === 1
        ? `<label class="field-label" for="vehicle-category">Vehicle category</label><select class="text-input" id="vehicle-category">${vehicleData.map((item) => `<option value="${item.id}" ${item.id === state.vehicle ? "selected" : ""}>${item.name} (${item.seats} seats)</option>`).join("")}</select><label class="field-label" for="vehicle-number">Vehicle registration number</label><input class="text-input" id="vehicle-number" value="${escape(state.vehicleNumber || "TN 09 AB 1234")}"/><label class="field-label" for="vehicle-model">Make & model</label><input class="text-input" id="vehicle-model" value="${escape(state.vehicleModel || "Bajaj RE")}"/><label class="field-label" for="vehicle-colour">Vehicle colour</label><input class="text-input" id="vehicle-colour" value="${escape(state.vehicleColour || "Yellow & black")}"/><p class="micro muted" style="margin-top:6px">Commercial permit and registration details for in your operating city operations.</p>`
        : state.onboard === 2
          ? `<p class="small muted" style="margin:12px 0 18px">Private evidence is shared only with authorised reviewers. City service permit granted upon document approval.</p>${[
              ["Licence", "Driving Licence (DL)", "Government driving licence with commercial endorsement"],
              ["Registration", "Registration Certificate (RC)", "Valid state vehicle registration certificate"],
              ["Insurance", "Vehicle Insurance Policy", "Commercial or private passenger vehicle insurance"],
              ["Identity", "Government Identity Document", "Aadhaar, Voter ID or Passport (confidential)"]
            ].map(([docId, title, sub]) => `<button class="upload" data-document="${docId}">${icon(state.docs.includes(docId) ? "check" : "download")}<span>${title}<small>${state.docs.includes(docId) ? "Document attached & verified" : sub}</small></span></button>`).join("")}`
          : `<div class="section-card" style="margin-top:22px"><div class="row"><strong>${escape(state.name || "Demo Captain")}</strong><span class="badge ${state.driverApproved ? "green" : "warn"}">${state.driverApproved ? "Approved" : "Ready for review"}</span></div><p class="small muted" style="margin-top:10px">${escape(state.serviceArea || "Chennai")}</p><p class="small muted" style="margin-top:4px">${v().name} · ${escape(state.vehicleNumber || "TN 09 AB 1234")} · ${escape(state.vehicleModel || "Bajaj RE")}</p><p class="small muted" style="margin-top:4px">Licence, RC and Insurance documents uploaded (${state.docs.length || 0}/4 verified).</p></div><div class="notice-box" style="margin-top:14px">City service Jurisdiction: No neighbourhood-zone approvals. Once approved by an operator, you are authorized to accept rides in the selected operating city.</div><label class="toggle-row" style="margin-top:12px"><span><strong>Confirm declaration</strong><small>I declare these documents are genuine and valid.</small></span><input type="checkbox" id="onboard-confirm" checked aria-label="Confirm application"/></label>`
  }</div>`;
}
function loginScreen(captain) {
  return `<div class="login-screen ${captain ? "login-captain" : "login-rider"}"><section class="login-hero"><div class="login-hero-top"><span class="login-wordmark">hop<span>${captain ? "CAPTAIN" : "RIDER"}</span></span><span class="login-chip">${captain ? "A better way to work" : "A little closer"}</span></div><div class="login-illustration" aria-hidden="true"><svg viewBox="0 0 360 180" fill="none"><path d="M-10 125 78 78l80 34 87-62 130 44" stroke="#ffffff12" stroke-width="48"/><path class="login-route" d="M12 151 78 78l80 34 87-62 98 26" stroke="${captain ? "#dfb82d" : "#ef8c74"}" stroke-width="3" stroke-linecap="round" stroke-dasharray="5 8"/><circle cx="245" cy="50" r="18" fill="#ffffff14"/><circle cx="245" cy="50" r="7" fill="${captain ? "#dfb82d" : "#ef8c74"}"/><path d="M24 35h36m18-12h27m172 110h42" stroke="#ffffff24" stroke-linecap="round" stroke-width="3"/></svg><img class="login-vehicle" src="./assets/${captain ? "sedan" : "auto"}.png" alt=""/><span class="login-map-tag">${captain ? "Your journey. Your pace." : "Good journeys start here."}</span></div><p class="login-kicker">${captain ? "MAKE EVERY JOURNEY COUNT" : "YOUR CITY. YOUR WAY."}</p><h2>${captain ? "Your drive.<br>Your next chapter." : "A better way<br>to get there."}</h2><p class="login-hero-copy">${captain ? "A focused space for your rides, earnings and time." : "Everyday rides, familiar places, and the people who move you."}</p></section><section class="login-form"><div class="login-form-heading"><div><span class="login-step">LET’S GET STARTED</span><h2>${captain ? "Welcome, Captain." : "Welcome to hop."}</h2></div><span class="login-lock">${icon("lock")}</span></div><p class="login-form-copy">Enter your mobile number. We’ll send a code to sign you in.</p><label class="field-label" for="demo-phone">Mobile number</label><div class="login-phone"><span>+91</span><input id="demo-phone" class="text-input" type="tel" placeholder="Your 10-digit number" inputmode="tel" autocomplete="tel-national" maxlength="10"/></div><div class="notice-box login-feedback">Design prototype · no SMS is sent in preview mode.</div><div class="login-assurance"><span>${icon("shield", "tiny-icon")} Your number stays private</span><span>${icon("chat", "tiny-icon")} Sign in with an SMS code</span></div></section></div>`;
}
function commonView() {
  const captain = state.role === "captain";
  switch (state.screen) {
    case "activity":
      return {
        title: captain ? "Your trips" : "Your rides",
        nav: "activity",
        body: `<div class="screen-padding"><div class="tabs" role="tablist" aria-label="Ride history">${["Ongoing", "Upcoming", "Past"].map((tab) => `<button role="tab" aria-selected="${state.activity === tab}" class="${state.activity === tab ? "active" : ""}" data-activity="${tab}">${tab}</button>`).join("")}</div>${state.activity === "Ongoing" ? (state.phase !== "none" && state.phase !== "completed" ? `<div class="activity-card"><div class="row"><span class="badge">${state.phase.replace("_", " ")}</span><strong>${money(price())}</strong></div>${routeLines()}<button data-go="${captain ? "pickup" : "tracking"}">Track your trip →</button></div>` : `<div class="empty-state">${icon("car")}<h2>No trips right now.</h2><p>${captain ? "Your active trip will appear here." : "Your next little adventure is a ride away."}</p><button class="primary" data-go="${captain ? "drive" : "home"}">${captain ? "Go to Drive" : "Book a ride"}</button></div>`) : state.activity === "Upcoming" ? `<div class="activity-card"><div class="row"><span class="badge warn">Scheduled · sample</span><span class="activity-date">Tomorrow, 06:30</span></div>${routeLines()}<div class="row" style="margin-top:8px"><button data-go="plan">View schedule →</button><button data-modal="cancel-schedule">Cancel</button></div></div><div class="notice-box">Scheduling retains the existing dispatch and quote rules. This is a sample planned ride.</div>` : `${[0, 1, 2].map((item) => `<div class="activity-card"><div class="row"><span class="activity-date">${["Today, 09:24", "Yesterday, 18:40", "26 Oct, 08:10"][item]}</span><span class="badge ${item === 2 ? "neutral" : ""}">${item === 2 ? "Cancelled" : "Completed"}</span></div><div class="row"><span class="small">${img(item === 1 ? "sedan" : "auto", 35)} ${item === 1 ? "Sedan" : "Auto-rickshaw"}</span><strong>${["₹268", "₹426", "—"][item]}</strong></div><div class="route-line"><i class="location-dot"></i><strong>Adyar, Chennai</strong></div><div class="route-line"><i class="location-dot destination"></i><strong>${item === 1 ? "Olympia Tech Park" : "Chennai Airport"}</strong></div><div class="row" style="margin:4px 0 0"><button data-go="${item === 2 ? "support" : "receipt"}">${item === 2 ? "Get help" : "Receipt & details"} →</button><button data-action="rebook">Ride again</button></div></div>`).join("")}`}</div>`,
      };
    case "receipt":
      return {
        title: "Trip details",
        back: true,
        body: `<div class="screen-padding"><div class="receipt-total"><span class="check-circle">${icon("check")}</span><p>Thanks for riding with Hop.</p><h2>${money(price())}</h2><span class="badge">${state.payment === "Cash" ? "Captain reported cash received" : "Sample payment confirmed"}</span></div><div class="section-card">${routeLines()}${fareBreakdown()}</div><div class="row" style="margin-top:18px"><span><strong class="small">${captain ? "Rate your rider" : "How was your ride?"}</strong><small style="display:block" class="micro muted">Sample trip · 8.6 km · 22 min</small></span><span class="avatar">${captain ? "D" : "A"}</span></div><div class="stars" aria-label="Trip rating">${[1, 2, 3, 4, 5].map((n) => `<button class="${n <= state.rating ? "active" : ""}" data-rating="${n}" aria-label="${n} stars">★</button>`).join("")}</div>${row("Download trip statement", "Preview your receipt and payment status", "download", "statement")}${row("Something wasn’t right?", "Report an issue or a lost item", "help", "support")}</div>`,
        action: primary("Done", "receipt-done"),
      };
    case "statement":
      return {
        title: "Trip statement",
        back: true,
        body: `<div class="screen-padding"><div class="section-card" style="margin:12px 0"><div class="row"><h2 style="font-size:22px">hop</h2><span class="badge neutral">Sample</span></div><p class="small muted" style="margin-top:20px">TRIP STATEMENT · HOP-DEMO-028</p><p class="small" style="margin-top:14px">Demo Rider · ${escape(state.destination)}</p>${fareBreakdown()}<p class="micro muted">This is a prototype receipt preview, not a tax invoice or a real payment record.</p></div>${modalRow("Business receipt details", "Company, GSTIN and cost centre", "briefcase", "business")}</div>`,
        action: primary("Preview save & share", "save-statement"),
      };
    case "wallet":
      return {
        title: "Wallet & offers",
        nav: "wallet",
        body: `<div class="screen-padding"><div class="wallet-hero">${icon("wallet")}<small>YOUR HOP WALLET · SAMPLE</small><div class="amount">${money(state.balance)}<span style="font-size:19px;opacity:.5">.00</span></div><button data-modal="topup">+ Add money</button></div><div class="offer-card">${icon("gift")}<span><strong>A little off your next ride.</strong><small>Sample code HOP50 · ₹50 off</small></span><button data-action="apply-promo">Apply</button></div><div class="section-label">Recent transactions <span>All</span></div>${row("Added to wallet", "Today · sample credit", "plus", "ledger", '<strong style="color:#357451">+₹500</strong>')}${row("Ride payment", "Yesterday · sample ride", "car", "receipt", "<strong>−₹268</strong>")}${row("Refund received", "24 Oct · sample refund", "refresh", "ledger", '<strong style="color:#357451">+₹50</strong>')}<div class="notice-box">Cash, direct UPI and online payment options remain available at trip confirmation. This balance is local sample data.</div></div>`,
      };
    case "account":
      return {
        title: "Account",
        nav: "account",
        body: `<div class="screen-padding"><div class="account-hero"><span class="avatar">${captain ? "A" : "D"}</span><div><h2>Demo ${captain ? "Captain" : "Rider"}</h2><p>${captain ? "Professional captain · sample account" : "Your everyday companion"}</p></div></div>${captain ? `<div class="section-card" style="margin-bottom:14px;border:1px solid var(--accent,#dfb82d)"><div class="row"><div><strong class="small">Join as Captain / Onboarding Application</strong><p class="micro muted" style="margin-top:2px">${state.driverApproved ? "Approved · City service Operations Active" : "Complete onboarding to go online in your operating city"}</p></div><button class="primary small" data-go="onboarding" style="padding:6px 12px;font-size:11px">${state.driverApproved ? "View Application" : "Start Application"}</button></div></div>` : ""}<div class="account-group">${row("Personal details", "Profile, mobile & business details", "user", "personal")}${row(captain ? "Vehicle & documents" : "Saved places", captain ? "Vehicle, expiry & private evidence" : "Home, Work and your favourites", captain ? "car" : "book", captain ? "vehicle" : "saved")}${row(captain ? "Driver preferences" : "Family & favourite captains", captain ? "Pickup radius, minimum fare & more" : "Book for your people", captain ? "settings" : "heart", captain ? "preferences" : "family")}</div><div class="account-group">${row(captain ? "Driver tools" : "Ride preferences", captain ? "Goals, go-home mode & reminders" : "Language, accessibility & defaults", "settings", captain ? "tools" : "preferences")}${row("Safety centre", "Emergency contacts & trip sharing", "shield", "safety")}${row("Notifications", "Ride and account updates", "bell", "notifications")}</div><div class="account-group">${row("Help & support", "We’re here when you need us", "help", "support")}${captain ? row("Join as Captain / Onboarding", "City service operating application & documents", "file", "onboarding") : row("Rewards & referrals", "Good journeys add up", "gift", "rewards")}${row("Privacy & account", "Data, deletion & sign out", "lock", "privacy")}</div></div>`,
      };
    case "saved":
      return {
        title: "Saved places",
        back: true,
        body: `<div class="screen-padding"><p class="small muted" style="margin:8px 0 14px">A few familiar places. A little less typing.</p>${state.saved.map((place, i) => row(escape(place), i === 0 ? "2nd Cross Street, Adyar" : i === 1 ? "Olympia Tech Park, Guindy" : "Saved sample location", i === 0 ? "home" : i === 1 ? "briefcase" : "pin", "search")).join("")}<button class="secondary" style="margin-top:20px" data-modal="add-place">+ Add a place</button>${modalRow("Edit saved places", "Rename or remove a sample place", "settings", "edit-place")}</div>`,
      };
    case "family":
      return {
        title: "Your people",
        back: true,
        body: `<div class="screen-padding"><div class="section-label">Family account <span>Up to 6 members</span></div><div class="section-card"><div class="row"><span class="avatar">D</span><div style="flex:1"><strong class="small">Demo Rider</strong><p class="micro muted">Account owner</p></div><span class="badge">You</span></div>${state.family.map((name) => `<div class="list-row"><span class="avatar">${escape(name[0])}</span><span><strong>${escape(name)}</strong><small>Sample invitation pending</small></span></div>`).join("")}<button class="text-button" style="width:100%;margin-top:10px" data-modal="family-invite">+ Invite a family member</button></div><div class="section-label">Favourite captains</div>${modalRow("Arun Kumar", "4.9 ★ · Auto-rickshaw", "heart", "favourite")}<div class="notice-box">Family invitations, consent and favourite-driver eligibility retain the current backend checks. No invitations are sent here.</div></div>`,
      };
    case "preferences":
      return {
        title: captain ? "Driver preferences" : "Ride preferences",
        back: true,
        body: `<div class="screen-padding">${captain ? `<label class="field-label" for="radius">Pickup radius · 3 km</label><input id="radius" type="range" min="500" max="20000" step="500" value="3000" style="width:100%;accent-color:var(--accent)" aria-label="Pickup radius in metres"/><label class="field-label" for="minimum-fare">Minimum fare (₹)</label><input class="text-input" id="minimum-fare" type="number" min="0" value="40"/><label class="field-label" for="upi-id">Payout UPI ID</label><input class="text-input" id="upi-id" placeholder="Your UPI ID"/>` : `${modalRow("Default vehicle", v().name, "car", "vehicle-default")}${modalRow("Default payment", state.payment, "wallet", "payment")}`}${modalRow("Appearance", state.toggled.dark ? "Dark" : "Light", "moon", "appearance")}${modalRow("Language", "English", "chat", "language")}${toggle("Low-data mode", "Reduce data usage and map effects", "lowdata")}${toggle("Larger text", "Improve text readability", "large-text")}${toggle("Wheelchair accessibility", "Assistance with boarding", "wheelchair")}${toggle("Hearing assistance", "Prefer written trip communication", "hearing")}${toggle("Low vision assistance", "Tell your captain you may need help", "vision")}${toggle("Boarding assistance", "Help getting into and out of the vehicle", "boarding")}${toggle("Trip notifications", "Ride and account updates", "notifications")}</div>`,
        action: primary("Save preferences", "save-preferences"),
      };
    case "safety":
      return {
        title: "Safety Centre",
        back: true,
        body: `<div class="screen-padding"><div class="safety-hero">${icon("shield")}<div><h2>A little peace of mind.</h2><p>Your safety matters on every journey.</p></div></div><div class="quick-grid"><button class="quick-tile quick-tile-emergency" data-modal="sos" aria-label="Emergency Help: Quick incident alert to Hop operator"><div class="quick-tile-icon-badge">${icon("phone")}</div><strong>Emergency Help</strong><small>Quick incident alert to Hop operator</small></button><button class="quick-tile" data-modal="share" aria-label="Share Your Trip: Let trusted people follow your live ride"><div class="quick-tile-icon-badge normal">${icon("location")}</div><strong>Share Your Trip</strong><small>Let trusted people follow your live ride</small></button></div><div class="section-label" style="margin-top:20px">Your safety toolkit</div>${modalRow("Emergency contacts", "Manage trusted contacts", "user", "contacts")}${modalRow("Report a safety concern", "Tell us about an incident or driver", "shield", "report")}${modalRow("RideCheck™ Safety Monitor", "Anomaly & unexpected stop detection", "shield", "ridecheck")}${modalRow("Safety guidance", "Verify your vehicle and pickup code", "book", "safety-guidance")}<div class="notice-box" style="margin-top:20px">An app SOS creates an operator incident. It does not contact emergency services. For immediate help, use your phone's emergency calling function.</div></div>`,
      };
    case "support":
      return {
        title: "Help & support",
        back: true,
        body: `<div class="screen-padding"><div class="help-hero"><h2>How can we help?</h2><p>Let’s get you to the right place.</p></div><div class="quick-grid"><button class="quick-tile" data-modal="report">${icon("car")}<strong>Trip issue</strong><small>Pickup, cancellation or fare</small></button><button class="quick-tile" data-modal="report">${icon("wallet")}<strong>Payments</strong><small>Wallet, UPI and refunds</small></button><button class="quick-tile" data-go="personal">${icon("user")}<strong>Account</strong><small>Sign-in and verification</small></button><button class="quick-tile" data-go="safety">${icon("shield")}<strong>Safety</strong><small>Help during your trip</small></button></div><div class="section-label">More help</div>${modalRow("I left something behind", "Report a lost item from a past trip", "briefcase", "lost-item")}${modalRow("Chat with support", "Start a local demo conversation", "chat", "support-chat")}${modalRow("Call or email support", "Preview contact options", "phone", "support-contact")}</div>`,
      };
    case "notifications":
      return {
        title: "Notifications",
        back: true,
        body: `<div class="screen-padding"><div class="tabs"><button class="active">All</button><button data-action="unread">Unread</button></div>${modalRow(captain ? "New trip request" : "Your captain is on the way", "Just now · sample ride update", "car", "notification")}${modalRow(captain ? "Document reminder" : "A little off your next ride", "Today · sample account notice", captain ? "file" : "gift", "notification")}${modalRow(captain ? "Payout processed" : "Welcome to Hop", "Yesterday · sample account update", "bell", "notification")}<button class="text-button" style="margin-top:15px" data-action="read-all">Mark all as read</button></div>`,
      };
    case "rewards":
      return {
        title: "Rewards & referrals",
        back: true,
        body: `<div class="screen-padding"><div class="wallet-hero" style="background:#6a5140">${icon("gift")}<small>YOUR REWARD POINTS · SAMPLE</small><div class="amount">240</div><p class="small" style="color:#ead7c6">Good journeys come back around.</p></div><div class="section-label">Invite a friend</div><div class="section-card"><p class="small muted">Your referral code</p><div class="row" style="margin-top:10px"><strong style="font-size:20px;letter-spacing:2px">HOPDEMO</strong><button class="text-button" data-action="copy-code">${icon("copy", "tiny-icon")} Copy</button></div></div>${modalRow("Have a referral code?", "Preview applying a friend’s code", "gift", "referral")}<div class="notice-box">Reward eligibility and redemption keep the existing server rules. Sample points cannot be spent.</div></div>`,
      };
    case "personal":
      return {
        title: "Personal details",
        back: true,
        body: `<div class="screen-padding"><div class="account-hero"><span class="avatar">${captain ? "A" : "D"}</span><div><h2>Demo ${captain ? "Captain" : "Rider"}</h2><button class="text-button" style="padding:0;min-height:25px;font-size:10px" data-action="portrait">Change photo</button></div></div><label class="field-label" for="full-name">Full name</label><input class="text-input" id="full-name" value="Demo ${captain ? "Captain" : "Rider"}"/>${modalRow("Mobile number", "Demo account · verification required in live app", "phone", "verify")}${modalRow("Email address", "Add or update your email", "mail", "email")}${modalRow("Gender & date of birth", "Personal information", "user", "personal-more")}${!captain ? modalRow("Business receipt details", "Company, GSTIN, cost centre & work email", "briefcase", "business") : ""}<div class="notice-box">The existing exact-number verification and captain identity review checks remain required in the real application.</div></div>`,
        action: primary("Save details", "save-personal"),
      };
    case "privacy":
      return {
        title: "Privacy & account",
        back: true,
        body: `<div class="screen-padding">${modalRow("Download my data", "Preview the data export request", "download", "export")}${modalRow("Account deletion", "View the existing request and recovery process", "user", "delete-account")}${modalRow("Privacy information", "How trip and account data are handled", "lock", "privacy-info")}<button class="secondary" style="color:#b44a3b;margin-top:25px" data-modal="signout">Sign out</button><div class="notice-box">These are design previews only. No real session, account or stored data is changed.</div></div>`,
      };
    case "chat":
      return {
        title: captain ? "Demo Rider" : "Arun · your captain",
        back: true,
        body: `<div class="chat"><div class="chat-time">Today · sample conversation</div><div class="chat-bubble">${captain ? "I’m at the main entrance." : "Hi! I’m on my way to your pickup."}</div>${state.chats.map((c) => {
          const isMine = typeof c === "string" || c.sender === "mine";
          const text = typeof c === "string" ? c : c.text;
          return `<div class="chat-bubble ${isMine ? "mine" : "partner"}">${escape(text)}</div>`;
        }).join("")}<div class="product-row" style="margin-top:15px"><button class="product-chip" data-message="${captain ? "I’ve arrived outside." : "I’m at the pickup."}">${captain ? "I’ve arrived outside" : "I’m at pickup"}</button><button class="product-chip" data-message="${captain ? "Hazard lights are on." : "I’ll be there shortly."}">${captain ? "Hazard lights on" : "On my way"}</button><button class="product-chip" data-message="${captain ? "AC is on full." : "Wearing blue shirt."}">${captain ? "AC is on full" : "Wearing blue shirt"}</button></div></div>`,
        action: `<form id="chat-form" class="chat-compose"><input id="message-input" class="text-input" aria-label="Message" placeholder="Type a message…" maxlength="500"/><button class="icon-button" aria-label="Send sample message" type="submit">${icon("send")}</button></form>`,
      };
    case "plan":
      return {
        title: "Plan your ride",
        back: true,
        body: `<div class="screen-padding"><p class="small muted" style="margin:8px 0 15px">The same easy journey, on your terms.</p><label class="field-label" for="trip-type">Trip type</label><select id="trip-type" class="text-input"><option value="city" ${state.tripType === "city" ? "selected" : ""}>City ride</option><option value="rental" ${state.tripType === "rental" ? "selected" : ""}>Hourly rental</option><option value="outstation" ${state.tripType === "outstation" ? "selected" : ""}>Outstation</option></select>${state.tripType === "rental" ? '<label class="field-label" for="rental-hours">Rental hours (1–12)</label><input id="rental-hours" class="text-input" type="number" min="1" max="12" value="2"/>' : ""}${state.tripType === "outstation" ? `${toggle("Round trip", "Include your return journey", "roundtrip")}<label class="field-label" for="trip-days">Trip days</label><input id="trip-days" class="text-input" type="number" min="1" max="10" value="1"/>` : ""}<label class="field-label" for="ride-time">When do you need a ride?</label><select id="ride-time" class="text-input"><option ${state.schedule === "Now" ? "selected" : ""}>Now</option><option ${state.schedule !== "Now" ? "selected" : ""}>Schedule for later</option></select>${state.schedule !== "Now" ? '<label class="field-label" for="schedule-at">Pickup date & time</label><input id="schedule-at" class="text-input" type="datetime-local"/>' : ""}<div class="section-card" style="margin-top:20px">${routeLines()}</div><div class="notice-box">Product availability, scheduling windows, rental limits and outstation pricing will keep the existing backend validation. This preview does not schedule a real ride.</div></div>`,
        action: primary("Save trip plan", "save-plan"),
      };
    case "ledger":
      return {
        title: "Transactions",
        back: true,
        body: `<div class="screen-padding">${[modalRow("Online ride fare", "Today · sample ledger entry", "car", "transaction", "+₹420"), modalRow("Payout request", "Yesterday · sample paid payout", "wallet", "transaction", "−₹1,200"), modalRow("Promo reimbursement", "26 Oct · sample credit", "gift", "transaction", "+₹50")].join("")}<div class="notice-box">Ledger entries are illustrative. Existing accounting and payment verification remain unchanged.</div></div>`,
      };
    case "auth":
      return {
        title: "Welcome to Hop",
        body: loginScreen(captain),
        action: primary("Continue with demo account", "demo-login"),
      };
    default:
      return {
        title: "Your Hop",
        back: true,
        body: '<div class="screen-padding"><p>Choose a journey from the review controls.</p></div>',
      };
  }
}
function modalContent(name) {
  const field = (id, label, value = "", placeholder = "") =>
    `<label class="field-label" for="${id}">${label}</label><input id="${id}" class="text-input" value="${escape(value)}" placeholder="${placeholder}"/>`;
  switch (name) {
    case "payment":
      return [
        "Pay your way.",
        `<p>Choose a payment method for this sample ride.</p>${["Wallet", "Cash", "UPI", "Online payment"].map((method) => `<button class="list-row" data-payment="${method}"><span class="list-icon">${icon(method === "Cash" ? "wallet" : method === "UPI" ? "phone" : "card")}</span><span class="list-text"><strong>${method}</strong><small>${method === "Wallet" ? `Sample balance ${money(state.balance)}` : method === "Cash" ? "Pay your captain at drop-off" : method === "UPI" ? "Direct UPI at drop-off" : "Provider checkout in the final app"}</small></span>${state.payment === method ? icon("check") : icon("chevron")}</button>`).join("")}`,
      ];
    case "promo":
      return [
        "A little off your ride.",
        `<p>Use the sample code HOP50 to preview a discount.</p>${field("promo-code", "Promo code", "", "HOP50")}<div id="modal-error" class="message-error" role="alert"></div>${primary(state.promo ? "Remove promo" : "Apply sample code", state.promo ? "remove-promo" : "promo-submit")}`,
      ];
    case "passenger":
      return [
        "Who’s riding?",
        `<p>Keep family and other-passenger booking just one tap away.</p>${["Me", "A family member", "Someone else"].map((who) => `<button class="list-row" data-passenger="${who}"><span class="list-icon">${icon("user")}</span><strong style="flex:1">${who}</strong>${state.who === who ? icon("check") : icon("chevron")}</button>`).join("")}${state.who === "Someone else" ? `${field("passenger-name", "Passenger name", "", "Demo passenger")}${field("passenger-phone", "Passenger mobile", "", "Sample only; not sent")}` : ""}${state.who === "A family member" ? '<div class="notice-box">The final app lists accepted family members from the current account. This preview selects a demo member.</div>' : ""}${primary("Done", "close-modal")}`,
      ];
    case "options":
      return [
        "Make the ride yours.",
        `${toggle("Share this ride", "Preview the existing shared-ride option", "shared")}${toggle("Women drivers only", "Eligibility and certified drivers checked by backend", "pink")}${toggle("Favourite captains first", "Existing priority window still applies", "favourite-first")}${field("fare-offer", "Your fare offer (₹) · optional", state.offer, "Within existing quote limits")}<p class="micro" style="margin-top:5px">Demo bounds: ${money(Math.ceil(v().price * 0.7))}–${money(Math.floor(v().price * 1.5))}.</p><div id="modal-error" class="message-error" role="alert"></div>${primary("Save ride options", "options-submit")}<button class="usual-save" data-action="save-usual">${icon("book", "tiny-icon")} Save route, vehicle & payment as my usual</button>`,
      ];
    case "fare":
      return [
        "Your fare, clearly.",
        `<div class="fare-overview"><span>ESTIMATED FARE · SAMPLE</span><strong>${money(price())}</strong><small>${v().name} · 8.6 km · about 22 min</small></div>${fareBreakdown()}${state.offer ? `<div class="fare-offer-note"><strong>Your offer: ${money(state.offer)}</strong><p>A captain still needs to accept or counter your offer.</p></div>` : ""}<div class="quote-explainer">${icon("refresh")}<p>Change the route or ride options? Review a fresh quote before requesting. This is an estimate, not a locked-fare promise.</p></div><button class="secondary" data-action="refresh-sample-quote">Refresh sample estimate</button>${primary("Got it", "close-modal")}`,
      ];
    case "meeting":
      return ["Find each other, easily.", `<div class="meeting-overview"><span class="meeting-map" aria-hidden="true">${icon("pin")}</span><div><span class="badge neutral">Sample pickup</span><h3>${escape(state.pickup)}</h3><p>Meet at the selected pickup pin.</p></div></div><div class="meeting-tip">${icon("eye")}<span><strong>Check the vehicle before you get in.</strong><small>Match the registration and captain details with your app.</small></span></div><div class="meeting-tip">${icon("lock")}<span><strong>Your code is just for the pickup.</strong><small>Share it only when you meet your captain.</small></span></div><div class="quote-explainer">${icon("chat")}<p>Not sure where to wait? Confirm the meeting point in your trip chat.</p></div>${primary(state.role === "rider" ? "Message my captain" : "Message the rider", "meeting-chat")}<button class="secondary" style="margin-top:9px" data-action="meeting-map">View pickup on the sample map</button>`];
    case "pickup":
      return [
        "Choose your pickup.",
        `${field("pickup-edit", "Pickup location", state.pickup)}${primary("Confirm pickup", "pickup-submit")}<button class="secondary" style="margin-top:10px" data-action="pin-preview">Choose a point on the map</button><p class="fineprint">Prototype uses a sample map point. Native GPS and pin editing remain an integration gate.</p>`,
      ];
    case "stops":
      return [
        "A stop along the way?",
        `<p>Up to three stops, using the existing booking limits.</p>${state.stops.map((place, index) => `<div class="list-row"><span class="list-text"><strong>${escape(place)}</strong><small>Stop ${index + 1}</small></span><button class="text-button" data-remove-stop="${index}">Remove</button></div>`).join("")}${state.stops.length < 3 ? `${field("stop-place", "Stop address", "", "Example: Chennai Central")}${primary("Add sample stop", "stop-submit")}` : '<div class="notice-box">Maximum of three stops reached.</div>'}<button class="secondary" style="margin-top:10px" data-action="close-modal">Done</button>`,
      ];
    case "voice":
      return [
        "Speak your trip.",
        `<div class="empty-state" style="padding:25px 10px">${icon("mic")}<h2>“Take me to the airport.”</h2><p>A dedicated listening state with a clear stop action. No microphone is activated in this prototype.</p></div>${primary("Preview recognised trip", "voice-submit")}`,
      ];
    case "map":
      return [
        "Your map preferences.",
        `${toggle("Traffic layer", "Sample visual option", "traffic")}${toggle("Satellite view", "Native map provider integration required", "satellite")}${toggle("Low-data map", "Existing reduced-data behaviour retained", "lowdata")}${toggle("Night map", "Follow your selected appearance", "night")}${primary("Done", "close-modal")}`,
      ];
    case "cancel":
      return [
        "Cancel this request?",
        `<p>The real app will apply the existing allowed cancellation states and policies.</p><label class="field-label" for="cancel-reason">Reason</label><select id="cancel-reason" class="text-input"><option>Plans changed</option><option>Pickup is taking too long</option><option>Booked by mistake</option></select>${primary("Cancel sample request", "cancel-ride")}<button class="secondary" style="margin-top:10px" data-action="close-modal">Keep my ride</button>`,
      ];
    case "bids":
      return [
        "Captain fare offers",
        `<p>Sample offers illustrate negotiation. Eligibility, bounds and reservation remain with the backend.</p><div class="driver-card"><span class="avatar driver">A</span><span class="driver-text"><strong>Arun Kumar</strong><small>4.9 ★ · ${v().name}</small></span><strong>${money(v().price + 20)}</strong></div>${primary("Preview choosing this offer", "demo-match")}`,
      ];
    case "counter":
      return [
        "Make a counter-offer.",
        `<p>Existing quote bounds still apply. This does not send an offer to a real rider.</p>${field("counter-fare", "Your offer (₹)", v().price + 20)}<div id="modal-error" class="message-error" role="alert"></div>${primary("Send sample offer", "counter-submit")}`,
      ];
    case "ride-taken":
      return [
        "Ride claimed by another captain",
        `<div class="empty-state" style="padding:14px 10px"><span class="taken-badge">⚡ First Accept Wins</span><h2>Another captain was faster!</h2><p>Captain Arun K. (0.4 km away) accepted this ride request. Dispatch assigned the booking to the nearest available driver.</p></div><div class="notice-box" style="margin-top:12px"><strong>Hop Fair Dispatch Guarantee:</strong><br/>Under Hop's dispatch rules, broadcast offers claimed by faster captains never lower your acceptance score or ranking.</div><div style="display:flex;flex-direction:column;gap:8px;margin-top:14px"><button class="primary" data-action="view-next-offer">View Next Available Request (Offer 2) →</button><button class="secondary" data-action="close-modal">Return to active radar</button></div>`,
      ];
    case "call":
      return [
        "A quick call.",
        `<div class="empty-state" style="padding:24px 10px">${icon("phone")}<h2>Contact your ${state.role === "rider" ? "captain" : "rider"}.</h2><p>The final app uses the current masked-contact flow and its provider availability. No call is placed here.</p></div>${primary("Close preview", "close-modal")}`,
      ];
    case "share":
      return [
        "Let someone follow along.",
        `<p>Live sharing will use the existing revocable trip link and access rules.</p><div class="section-card" style="margin-top:17px"><strong class="small">Demo trip · ${escape(state.destination)}</strong><p style="margin-top:6px">hop.local / sample-trip</p></div>${primary("Preview copy trip link", "copy-trip")}<button class="text-button" style="width:100%" data-action="revoke-share">Preview revoke link</button>`,
      ];
    case "sos":
      return [
        "Help when it matters.",
        `<p>This is an emergency UI preview. It will not call anyone or send an alert.</p>${modalRow("Emergency services", "In production, open the supported emergency channel", "phone", "sos-info")}${modalRow("Notify a trusted contact", "Preview your contact options", "user", "contacts")}${modalRow("Report an incident", "Keep the current trip context", "shield", "report")}`,
      ];
    case "sos-info":
      return [
        "Emergency action preview",
        `<p>No call has been made. The released app must use the supported emergency service for the rider’s location and retain an explicit confirmation.</p>${primary("Return to safety", "close-modal")}`,
      ];
    case "contacts":
      return [
        "People you trust.",
        `${field("contact-name", "Contact name", "", "Demo contact")}${field("contact-mobile", "Mobile number", "", "Sample number only")}${primary("Save sample contact", "save-contact")}`,
      ];
    case "report":
    case "lost-item":
      return [
        name === "lost-item"
          ? "Something left behind?"
          : "Tell us what happened.",
        `<p>This report is linked to a sample trip only. Nothing is sent to support.</p><label class="field-label" for="report-text">${name === "lost-item" ? "Describe the item" : "Describe the issue"}</label><textarea id="report-text" class="text-input" rows="4" placeholder="Add a few details…"></textarea>${primary("Save sample report", "save-report")}`,
      ];
    case "support-chat":
      return [
        "Chat with support",
        `<p>A local preview conversation. No agent or external service is contacted.</p><div class="chat-bubble" style="margin-top:17px">Hi! How can we help with your journey?</div>${field("support-message", "Your message", "", "Type your question")}${primary("Send sample message", "send-support")}`,
      ];
    case "support-contact":
      return [
        "Ways to reach us.",
        `<p>Production contact details will use the existing configured support channels. This prototype does not initiate a call or email.</p>${primary("Done", "close-modal")}`,
      ];
    case "add-place":
      return [
        "Save a familiar place.",
        `${field("place-name", "Place label", "", "Gym, favourite café…")}${field("place-address", "Address", "", "Sample address")}${primary("Save sample place", "save-place")}`,
      ];
    case "edit-place":
      return [
        "Manage saved places",
        `${state.saved.map((place, i) => `<div class="list-row"><span class="list-text"><strong>${escape(place)}</strong><small>Sample saved location</small></span><button class="text-button" data-remove-place="${i}">Remove</button></div>`).join("")}${primary("Done", "close-modal")}`,
      ];
    case "family-invite":
      return [
        "Bring your people.",
        `${field("family-name", "Family member’s name", "", "Demo family member")}${field("family-email", "Registered email", "", "Sample email; no invitation sent")}${primary("Preview invitation", "invite-family")}`,
      ];
    case "favourite":
      return [
        "A familiar captain.",
        `<div class="driver-card"><span class="avatar driver">A</span><span class="driver-text"><strong>Arun Kumar</strong><small>4.9 ★ · Auto-rickshaw</small></span></div><p>Existing completed-trip eligibility and favourite-driver-first rules stay in place.</p>${primary("Preview remove favourite", "remove-favourite")}`,
      ];
    case "vehicle-default":
      return [
        "Your usual ride.",
        `<div role="radiogroup" aria-label="Default vehicle">${vehicleRows()}</div>${primary("Save default", "close-modal")}`,
      ];
    case "appearance":
      return [
        "A comfortable view.",
        `${toggle("Dark appearance", "Preview the mobile night theme", "dark")}${toggle("Larger text", "Preview increased text size", "large-text")}${primary("Done", "close-modal")}`,
      ];
    case "language":
      return [
        "Your language.",
        `${["English", "हिन्दी", "தமிழ்", "తెలుగు", "ಕನ್ನಡ", "മലയാളം", "বাংলা", "मराठी", "ગુજરાતી", "ਪੰਜਾਬੀ"].map((language) => `<button class="list-row" data-language="${language}"><strong style="flex:1">${language}</strong>${icon("chevron")}</button>`).join("")}<p class="fineprint">Language selection is previewed locally. Translation coverage must match the existing implementation.</p>`,
      ];
    case "referral":
      return [
        "Have a friend’s code?",
        `${field("referral-code", "Referral code", "", "Sample code")}${primary("Preview redemption", "redeem-referral")}`,
      ];
    case "topup":
      return [
        "Add to your wallet.",
        `<p>Sample balance only. No money is collected.</p><div class="product-row" style="margin:18px 0">${[100, 200, 500, 1000].map((n) => `<button class="product-chip ${state.amount === n ? "active" : ""}" data-amount="${n}">${money(n)}</button>`).join("")}</div>${field("topup-amount", "Amount (₹)", state.amount)}<div id="modal-error" class="message-error" role="alert"></div>${primary("Add sample money", "topup-submit")}`,
      ];
    case "payout":
      return [
        "Your earnings, to you.",
        `<p>Available sample balance</p><h2 style="font-size:30px;margin:10px 0 17px">₹2,140</h2>${field("payout-upi", "Payout UPI ID", "", "Sample UPI ID")}<div class="notice-box">The real app retains minimum balance, open-request and operator approval checks. This preview sends no payout request.</div>${primary("Preview payout request", "payout-submit")}`,
      ];
    case "goal":
      return [
        "A goal for your day.",
        `${field("daily-goal", "Daily goal (₹)", state.goal)}<div id="modal-error" class="message-error" role="alert"></div>${primary("Save sample goal", "goal-submit")}`,
      ];
    case "break":
      return [
        "A little pause helps.",
        `<div class="empty-state" style="padding:22px 10px">${icon("clock")}<h2>Time to recharge.</h2><p>A short break after four hours online. The final app preserves the current reminder and online-state rules.</p></div>${primary("Take a sample break", "take-break")}`,
      ];
    case "vehicle-change":
      return [
        "A different vehicle?",
        `${field("new-vehicle", "Vehicle number", "", "Sample registration")}${field("new-model", "Make & model", "", "Sample vehicle")}<div class="notice-box">The operator must approve a vehicle change. A driver cannot approve their own request.</div>${primary("Preview change request", "vehicle-change-submit")}`,
      ];
    case "document":
      return [
        "Private document preview",
        `<div class="empty-state" style="padding:28px 10px">${icon("file")}<h2>Reviewed. Kept private.</h2><p>Actual evidence is retrieved only through the existing authorised private-media endpoints.</p></div>${primary("Done", "close-modal")}`,
      ];
    case "verify":
      return [
        "Verify your mobile.",
        `<p>Exact-number ownership stays with the existing OTP verification service.</p>${field("verify-mobile", "Mobile number", "", "Sample only")}${primary("Preview verification state", "demo-verify")}`,
      ];
    case "business":
      return [
        "Business receipt details",
        `${field("company", "Company name", "", "Company")}${field("gstin", "GSTIN (optional)", "", "GSTIN")}${field("cost-centre", "Cost centre (optional)", "", "Cost centre")}${field("work-email", "Work email (optional)", "", "Work email")}<div class="notice-box">Completed-trip receipt snapshots remain immutable. This preview does not issue a tax invoice.</div>${primary("Save sample details", "save-business")}`,
      ];
    case "email":
      return [
        "Your email address.",
        `${field("email-address", "Email", "", "Sample address")}${primary("Save sample email", "save-email")}`,
      ];
    case "personal-more":
      return [
        "A few personal details.",
        `<label class="field-label" for="gender">Gender</label><select id="gender" class="text-input"><option>Prefer not to say</option><option>Female</option><option>Male</option><option>Other</option></select><label class="field-label" for="dob">Date of birth</label><input id="dob" class="text-input" type="date"/>${primary("Save sample details", "save-personal-more")}`,
      ];
    case "export":
      return [
        "Your data, your choice.",
        `<p>The final app uses the existing authenticated data export. No real account information is read by this prototype.</p>${primary("Preview data export", "export-data")}`,
      ];
    case "delete-account":
      return [
        "Account deletion",
        `<p>The final app must retain the existing request, recovery window and active-trip checks. This demonstration will not delete or request deletion of anything.</p>${primary("Preview deletion request", "delete-preview")}<button class="secondary" style="margin-top:9px" data-action="close-modal">Keep my account</button>`,
      ];
    case "privacy-info":
      return [
        "Your information stays yours.",
        `<p>Mobile migration preserves existing ownership, private media, role access and retention rules. Actual privacy disclosures must reflect the configured service.</p>${primary("Done", "close-modal")}`,
      ];
    case "signout":
      return [
        "Sign out of this preview?",
        `<p>Your live Rider and Captain sessions are separate and will remain signed in.</p>${primary("Sign out of demo", "demo-signout")}`,
      ];
    case "cancel-schedule":
      return [
        "Cancel this sample schedule?",
        `<p>No real schedule will be changed.</p>${primary("Preview cancellation", "schedule-cancel")}`,
      ];
    case "navigation":
      return [
        "Navigation options",
        `${toggle("Voice directions", "Prototype setting only; no speech plays", "voice-nav")}${toggle("Traffic information", "Map provider capability required", "traffic")}${toggle("Use low-data map", "Retain reduced-data mode", "lowdata")}${primary("Done", "close-modal")}`,
      ];
    case "service-area":
      const states = [
        "Chennai",
        "Bengaluru",
        "Hyderabad",
        "Mumbai",
        "Delhi NCR",
      ];
      return [
        "Operating city",
        `<p>Authorized jurisdiction for in your operating city operations.</p><div class="section-card" style="margin:12px 0"><div class="row"><div><small class="muted">OPERATING CITY</small><strong style="display:block;margin-top:2px">${escape(state.serviceArea)}</strong></div><span class="badge green">City service</span></div><p class="micro muted" style="margin-top:6px">Authorized to operate within the configured city service area without separate zone approvals.</p></div><label class="field-label" for="target-area">Select Operating city</label><select id="target-area" class="text-input">${states.map((s) => `<option ${s === state.serviceArea || s.startsWith(state.serviceArea) ? "selected" : ""}>${s}</option>`).join("")}</select><div class="notice-box" style="margin-top:12px">City service Jurisdiction: No neighbourhood-zone approvals. Initial document verification (DL, RC, Insurance) authorizes in your operating city service.</div>${primary("Save Operating city", "submit-service-area")}`,
      ];
    case "ridecheck":
      return [
        "RideCheck™ Anomaly Detection",
        `<div class="empty-state" style="padding:16px 10px">${icon("shield")}<h2>Is everything okay?</h2><p>Hop detected that your ride has been stationary for over 4 minutes away from traffic signals.</p></div><div style="display:flex;flex-direction:column;gap:10px;margin-top:14px"><button class="primary" data-action="ridecheck-ok">I’m fine, just stopped in traffic</button><button class="secondary" data-modal="sos">Need help / Emergency options</button></div><div class="notice-box" style="margin-top:16px">RideCheck uses GPS motion telemetry to proactively check on riders during unexpected delays.</div>`,
      ];
    case "review-screens":
      return [
        "Explore the prototype",
        `<p>All screens use sample data. Choose an app and journey.</p><div class="product-row" style="margin:14px 0"><button class="product-chip ${state.role === "rider" ? "active" : ""}" data-switch-role="rider">Rider</button><button class="product-chip ${state.role === "captain" ? "active" : ""}" data-switch-role="captain">Captain</button><a class="product-chip" href="./strategy.html">Strategy ↗</a></div><button class="primary dark" data-action="next-demo">Next journey step →</button>${screens[state.role].map((item) => `<button class="list-row" data-go="${item[0]}"><strong style="flex:1">${item[1]}</strong>${icon("chevron")}</button>`).join("")}`,
      ];
    default:
      return [
        "A little more detail.",
        `<p>${name === "insight-details" ? "The final app will display the existing backend fare, time, payment and trip statistics here." : name === "safety-guidance" ? "Meet at a safe pickup point. Check the vehicle and captain details. Share the pickup code only when you meet." : name === "notification" ? "Sample notification opened. Real updates retain their current read state and notification preferences." : "A demonstration of the detail view. Nothing is sent to a live service."}</p>${primary("Got it", "close-modal")}`,
      ];
  }
}
function render() {
  const previousScroll = $(".screen-body")?.scrollTop || 0;
  const sameScreen = render.lastScreen === `${state.role}:${state.screen}`;
  render.lastScreen = `${state.role}:${state.screen}`;
  const view = state.role === "rider" ? riderView() : captainView();
  const meta = currentMeta();
  $("#app").dataset.motionRole = state.role;
  $("#app").dataset.motionScreen = state.screen;
  $("#app").dataset.motionModal = state.modal || "";
  $("#app").className =
    `app ${state.role} ${state.toggled.dark ? "dark" : ""} ${state.toggled["large-text"] ? "large-text" : ""}`;
  $("#app").innerHTML =
    `${header(view.title, view.back, view.brand)}${journeyRibbon()}<div class="screen-body ${view.map ? "map-screen" : ""}">${view.body}</div>${view.action ? `<footer class="action-bar">${view.action}</footer>` : ""}${view.nav ? nav(view.nav) : ""}`;
  if (sameScreen) $(".screen-body").scrollTop = previousScroll;
  if (state.modal) {
    for (const child of $("#app").children) {
      child.inert = true;
      child.setAttribute("aria-hidden", "true");
    }
    const [title, content] = modalContent(state.modal);
    $("#app").insertAdjacentHTML(
      "beforeend",
      `<div class="sheet-overlay"><section class="modal-sheet" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="sheet-handle"></div><div class="modal-title"><h2 id="modal-title">${title}</h2><button class="icon-button" aria-label="Close dialog" data-action="close-modal">${icon("close")}</button></div>${content}</section></div>`,
    );
  }
  if (state.modal) $(".modal-sheet").focus({ preventScroll: true });
  renderToast();
  if ($("#screen-select")) {
  $("#screen-select").innerHTML = screens[state.role]
    .map(
      (item) =>
        `<option value="${item[0]}" ${item[0] === state.screen ? "selected" : ""}>${item[1]}</option>`,
    )
    .join("");
  const journey =
    state.role === "rider"
      ? [
          "home",
          "search",
          "choose",
          "confirm",
          "tracking",
          "activity",
          "account",
        ]
      : ["drive", "request", "pickup", "trip", "earnings", "tools", "account"];
  $("#journey-nav").innerHTML = journey
    .map(
      (id, i) =>
        `<button class="journey-link ${state.screen === id ? "active" : ""}" data-review-go="${id}"><span>0${i + 1}</span>${screens[state.role].find((x) => x[0] === id)[1]}</button>`,
    )
    .join("");
  $("#screen-number").textContent =
    `${String(screens[state.role].indexOf(meta) + 1).padStart(2, "0")} / ${meta[2]}`;
  $("#screen-title").textContent = meta[3];
  $("#screen-description").textContent = meta[4];
  $("#design-note").textContent = meta[5];
  document
    .querySelectorAll("[data-role]")
    .forEach((button) =>
      button.classList.toggle("selected", button.dataset.role === state.role),
    );
  $("#mobile-role").textContent =
    `Preview: ${state.role === "rider" ? "Rider" : "Captain"} ⇄`;
  $("#next-state").innerHTML = `${nextLabel()} <span>→</span>`;
  }
  $("#phone")?.setAttribute("aria-label", `${state.role} prototype, ${meta[1]}`);
  // Keep preview form values local across harmless re-renders.
  document
    .querySelectorAll("#app input:not([type=checkbox]),#app textarea")
    .forEach((input) => {
      const key = `${state.role}:${state.screen}:${state.modal || ""}:${input.id}`;
      if (
        input.id &&
        state.form?.[key] !== undefined &&
        !["destination-input", "pickup-input"].includes(input.id)
      )
        input.value = state.form[key];
    });
}
function nextLabel() {
  if (state.screen === "matching") return "Preview a captain match";
  if (state.screen === "tracking") return "Preview trip completion";
  if (state.screen === "confirm") return "Preview requesting a ride";
  if (state.screen === "drive") return "Preview incoming request";
  return "Next journey step";
}
function nextDemo() {
  const order =
    state.role === "rider"
      ? [
          "home",
          "search",
          "choose",
          "confirm",
          "matching",
          "tracking",
          "receipt",
          "activity",
          "wallet",
          "account",
        ]
      : [
          "drive",
          "request",
          "pickup",
          "otp",
          "trip",
          "collect",
          "earnings",
          "activity",
          "tools",
          "account",
        ];
  if (state.screen === "matching") {
    state.phase = "accepted";
    go("tracking");
    return;
  }
  if (state.screen === "tracking") {
    state.phase = "completed";
    go("receipt");
    return;
  }
  if (state.screen === "drive") {
    state.online = true;
    state.phase = "requested";
    go("request");
    return;
  }
  const i = order.indexOf(state.screen);
  go(order[(i + 1) % order.length]);
}
function read(id) {
  return document.getElementById(id)?.value?.trim() || "";
}
function modalError(text) {
  const element = $("#modal-error");
  if (element) element.textContent = text;
}
function saveNotice(text) {
  state.modal = null;
  notify(text);
}
const actions = {
  "usual-ride": () => {
    state.destination = state.usual.destination;
    state.vehicle = state.usual.vehicle;
    state.payment = state.usual.payment;
    state.promo = false;
    state.offer = "";
    state.tripType = "city";
    state.schedule = "Now";
    state.stops = [];
    go("choose");
  },
  "save-usual": () => {
    state.usual = {destination: state.destination, vehicle: state.vehicle, payment: state.payment};
    saveNotice("Your usual ride is saved in this preview. Review the latest quote each time.");
  },
  "refresh-sample-quote": () => {
    state.quoteRefreshed = true;
    notify("Sample estimate refreshed. Its value is unchanged; no pricing API was called.");
  },
  "meeting-chat": () => go("chat"),
  "meeting-map": () => {
    state.modal = null;
    render();
    const pin = $(".map-pin.pickup");
    if(pin) { pin.classList.add("pickup-highlight"); setTimeout(() => pin?.classList.remove("pickup-highlight"), 1800); }
  },
  back: back,
  "close-modal": () => {
    state.modal = null;
    render();
  },
  review: () => go("confirm"),
  request: () => {
    if (state.schedule !== "Now") {
      state.activity = "Upcoming";
      go("activity");
      notify("Sample schedule saved locally. No backend request was sent.");
    } else {
      state.phase = "requested";
      go("matching");
    }
  },
  "current-location": () => openModal("pickup"),
  "center-map": () =>
    notify("Sample map centred. No device location was requested."),
  "pin-preview": () => {
    state.pickup = "Sample pickup point, Adyar";
    state.modal = null;
    render();
  },
  "voice-submit": () => {
    state.destination = "Chennai Airport";
    go("choose");
    notify("Sample transcript filled in. No microphone was used.");
  },
  "stop-submit": () => {
    const place = read("stop-place");
    if (!place) return modalError("Enter a sample stop.");
    if (state.stops.length < 3) state.stops.push(place);
    state.form = {};
    render();
  },
  "pickup-submit": () => {
    state.pickup = read("pickup-edit") || state.pickup;
    state.modal = null;
    render();
  },
  "promo-submit": () => {
    if (read("promo-code").toUpperCase() !== "HOP50")
      return modalError("Use HOP50 for this demonstration.");
    state.promo = true;
    saveNotice("Sample promo applied. No real quote was changed.");
  },
  "remove-promo": () => {
    state.promo = false;
    saveNotice("Sample promo removed.");
  },
  "apply-promo": () => {
    state.promo = true;
    notify("HOP50 applied to the local sample booking.");
  },
  "options-submit": () => {
    const offer = read("fare-offer");
    if (
      offer &&
      (!Number.isFinite(Number(offer)) ||
        Number(offer) < v().price * 0.7 ||
        Number(offer) > v().price * 1.5)
    )
      return modalError(
        "Your demo offer is outside the existing 70–150% quote limits.",
      );
    state.offer = offer;
    state.share = !!state.toggled.shared;
    state.pink = !!state.toggled.pink;
    saveNotice("Sample ride options saved locally.");
  },
  "cancel-ride": () => {
    state.phase = "none";
    go(state.role === "rider" ? "home" : "drive");
    notify("Sample request cancelled. No real ride was changed.");
  },
  "demo-match": () => {
    state.phase = "accepted";
    go(state.role === "rider" ? "tracking" : "pickup");
  },
  online: () => {
    if (!state.driverApproved) {
      go("onboarding");
      notify("Complete onboarding to go online in your operating city.");
      return;
    }
    state.online = !state.online;
    render();
    if (state.online)
      notify(
        "You’re online in your operating city! Receiving requests across the operating area.",
      );
  },
  accept: () => {
    state.phase = "accepted";
    go("pickup");
    notify("Ride Accepted! Head to pickup at Adyar (1.2 km away).");
  },
  decline: () => {
    go("drive");
    notify("Sample request declined.");
  },
  arrive: () => {
    state.phase = "arrived";
    go("otp");
    notify("Arrived at pickup! Ask rider for 6-digit pickup OTP.");
  },
  "autofill-otp": () => {
    const code = "431602";
    state.form ||= {};
    for (let i = 0; i < 6; i++) {
      const key = `${state.role}:${state.screen}:${state.modal || ""}:pin-${i}`;
      state.form[key] = code[i];
      const input = $(`#pin-${i}`);
      if (input) input.value = code[i];
    }
    const err = $("#pin-error");
    if (err) err.textContent = "";
    notify("Demo pickup code 431602 entered.");
  },
  "preview-captain-notification": () => {
    state.last[state.role] = state.screen;
    state.role = "captain";
    state.screen = "request";
    state.offerIndex = 0;
    state.modal = null;
    render();
    notify("Switched to Captain: Incoming ride request alert active (15s to accept).");
  },
  "simulate-other-captain-accept": () => {
    state.phase = "accepted";
    go("tracking");
    notify("Captain Dinesh Kumar (★ 4.9 · Bajaj RE) accepted your ride! Arriving in 3 min.");
  },
  "view-next-offer": () => {
    state.offerIndex = 1;
    state.modal = null;
    render();
    notify("Switched to Offer 2: Guindy → Tidel Park (₹195).");
  },
  "switch-to-captain-pickup": () => {
    state.last[state.role] = state.screen;
    state.role = "captain";
    state.screen = state.phase === "arrived" ? "otp" : "pickup";
    render();
    notify("Switched to Captain perspective.");
  },
  "start-trip": () => {
    const code = [0, 1, 2, 3, 4, 5].map((i) => read(`pin-${i}`)).join("");
    if (code !== "431602") {
      $("#pin-error").textContent = "Use the demonstration pickup code 431602.";
      return;
    }
    state.phase = "in_progress";
    go("trip");
    notify("OTP 431602 Verified ✓ · Trip Started! Navigating to destination.");
  },
  "complete-trip": () => {
    state.phase = "completed";
    go("collect");
  },
  settle: () => {
    go("receipt");
    notify("Sample payment status recorded. No payment was taken.");
  },
  "counter-submit": () => {
    const amount = Number(read("counter-fare"));
    if (
      !Number.isFinite(amount) ||
      amount < v().price * 0.7 ||
      amount > v().price * 1.5
    )
      return modalError(
        "Enter a sample offer within the existing quote bounds.",
      );
    state.modal = null;
    go("drive");
    notify(`Sample counter-offer of ${money(amount)} previewed.`);
  },
  "receipt-done": () => {
    state.rating = 0;
    go(state.role === "rider" ? "home" : "drive");
  },
  "save-statement": () =>
    notify(
      "Save/share preview: the final app retrieves the existing PDF trip statement.",
    ),
  rebook: () => {
    state.destination = "Chennai Airport";
    go("choose");
  },
  "topup-submit": () => {
    const amount = Number(read("topup-amount"));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000)
      return modalError("Enter a sample amount from ₹1 to ₹10,000.");
    state.balance += amount;
    saveNotice("Local sample balance updated. No payment was taken.");
  },
  "payout-submit": () =>
    saveNotice("Sample payout request previewed. No money was transferred."),
  "goal-submit": () => {
    const amount = Number(read("daily-goal"));
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000)
      return modalError("Choose a sample goal from ₹1 to ₹100,000.");
    state.goal = amount;
    saveNotice("Your sample daily goal is saved.");
  },
  "home-mode": () => {
    state.homeMode = !state.homeMode;
    render();
  },
  "take-break": () => {
    state.online = false;
    go("drive");
    notify("Sample break started. Your live Captain status is unchanged.");
  },
  "save-plan": () => {
    state.schedule = read("ride-time") || state.schedule;
    go("search");
  },
  "save-place": () => {
    const place = read("place-name");
    if (!place) return;
    state.saved.push(place);
    saveNotice("Sample place saved.");
  },
  "invite-family": () => {
    const name = read("family-name");
    if (!name) return;
    state.family.push(name);
    saveNotice("Sample invitation added. No email was sent.");
  },
  "save-contact": () =>
    saveNotice("Sample contact saved locally. No contact was notified."),
  "save-report": () =>
    saveNotice("Sample report saved locally. Nothing was sent to support."),
  "send-support": () =>
    saveNotice(
      "Your sample message is shown locally. No support agent was contacted.",
    ),
  "copy-code": () => notify("Sample referral code: HOPDEMO. Nothing was sent."),
  "copy-trip": () =>
    saveNotice("Sample trip link previewed. No real link was shared."),
  "revoke-share": () =>
    saveNotice("Sample share revoked. No backend link was changed."),
  "save-preferences": () =>
    notify("Sample preferences saved. Live account preferences are unchanged."),
  "save-personal": () =>
    notify("Sample details saved. No real profile was updated."),
  portrait: () =>
    notify("Sample portrait selection previewed. No file was uploaded."),
  "demo-verify": () =>
    saveNotice(
      "Demo verification previewed. No SMS or real verification occurred.",
    ),
  "save-business": () => saveNotice("Sample business details saved."),
  "save-email": () => saveNotice("Sample email saved. No email was sent."),
  "save-personal-more": () => saveNotice("Sample personal details saved."),
  "export-data": () =>
    saveNotice("Export preview ready. No real account data was accessed."),
  "delete-preview": () =>
    saveNotice("Deletion request previewed. No account data was changed."),
  "demo-signout": () => {
    state.phase = "none";
    go("auth");
  },
  "demo-login": () => {
    go(state.role === "rider" ? "home" : "drive");
    state.back = [];
  },
  "onboarding-next": () => {
    if (state.onboard === 0) {
      const st = $("#onboard-state")?.value;
      if (st) state.serviceArea = st;
      const nm = $("#onboard-name")?.value;
      if (nm) state.name = nm;
    } else if (state.onboard === 1) {
      const cat = $("#vehicle-category")?.value;
      if (cat) state.vehicle = cat;
      const num = $("#vehicle-number")?.value;
      if (num) state.vehicleNumber = num;
      const mod = $("#vehicle-model")?.value;
      if (mod) state.vehicleModel = mod;
      const col = $("#vehicle-colour")?.value;
      if (col) state.vehicleColour = col;
    }
    if (state.onboard < 3) {
      state.onboard++;
      state.form = {};
      render();
    } else {
      if (!$("#onboard-confirm")?.checked) {
        notify("Confirm the application to preview submission.");
        return;
      }
      state.driverStatus = "pending";
      go("drive");
      notify(
        "Application submitted for review. Tap 'Approve Application (Demo/Staging)' to test driving.",
      );
    }
  },
  "onboarding-back": () => {
    if (state.onboard > 0) {
      state.onboard--;
      render();
    } else {
      back();
    }
  },
  "vehicle-change-submit": () =>
    saveNotice(
      "Sample vehicle change is pending review. No real request was submitted.",
    ),
  "schedule-cancel": () => {
    state.modal = null;
    state.activity = "Past";
    render();
    notify("Sample schedule cancellation previewed.");
  },
  "remove-favourite": () =>
    saveNotice("Sample favourite removed. Live account unchanged."),
  "redeem-referral": () =>
    saveNotice(
      "Sample code redemption previewed. Reward rules stay on the backend.",
    ),
  "earnings-period": () =>
    notify(
      "Earnings period preview. The displayed chart uses fixed sample data.",
    ),
  unread: () =>
    notify("Unread inbox preview. All notifications here are samples."),
  "read-all": () => notify("Sample notifications marked as read."),
  "next-demo": nextDemo,
  "toggle-cockpit": () => {
    state.cockpitMode = !state.cockpitMode;
    render();
    notify(
      state.cockpitMode
        ? "Cockpit Navigation HUD activated."
        : "Returned to standard view.",
    );
  },
  "submit-service-area": () => {
    state.serviceArea = read("target-area") || "Chennai";
    state.serviceAreaRequest = null;
    state.modal = null;
    render();
    notify("Operating state updated to " + state.serviceArea + ". City service authorization active.");
  },
  "ridecheck-ok": () => {
    state.modal = null;
    notify("Glad you’re okay! RideCheck will continue monitoring your trip.");
  },
  "publish-commute": () => {
    notify(
      "Sample commute route published. Co-riders along your corridor can now request seats.",
    );
  },
};

function triggerAutoReply(userMessage) {
  clearTimeout(triggerAutoReply.timer);
  triggerAutoReply.timer = setTimeout(() => {
    let reply = "Understood, see you shortly!";
    const msg = String(userMessage || "").toLowerCase();
    if (
      msg.includes("pickup") ||
      msg.includes("entrance") ||
      msg.includes("gate") ||
      msg.includes("here")
    ) {
      reply =
        state.role === "rider"
          ? "Got it! White Sedan with hazard lights blinking right by the gate."
          : "Thanks! Coming down the elevator right now.";
    } else if (msg.includes("shirt") || msg.includes("wearing")) {
      reply = "Spotted you! Pulling up to the curb now.";
    } else if (msg.includes("hazard") || msg.includes("arrived")) {
      reply = "Walking out to the car now!";
    } else if (msg.includes("way") || msg.includes("shortly")) {
      reply = "Take your time, waiting safely at the pickup pin.";
    } else if (msg.includes("ac")) {
      reply = "Thank you, appreciate it!";
    }
    state.chats.push({ sender: "partner", text: reply });
    render();
  }, 600);
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button,a");
  if (!target) {
    if (event.target.classList.contains("sheet-overlay")) {
      state.modal = null;
      render();
    }
    return;
  }
  if (target.dataset.role) {
    role(target.dataset.role);
    return;
  }
  if (target.dataset.switchRole) {
    role(target.dataset.switchRole);
    openModal("review-screens");
    return;
  }
  if (target.dataset.reviewGo) {
    go(target.dataset.reviewGo);
    return;
  }
  if (target.dataset.go) {
    go(target.dataset.go);
    return;
  }
  if (target.dataset.modal) {
    openModal(target.dataset.modal);
    return;
  }
  if (target.dataset.action) {
    actions[target.dataset.action]?.();
    return;
  }
  if (target.dataset.vehicle) {
    state.vehicle = target.dataset.vehicle;
    render();
    return;
  }
  if (target.dataset.destination) {
    state.destination = target.dataset.destination;
    go("choose");
    return;
  }
  if (target.dataset.triptype) {
    state.tripType = target.dataset.triptype;
    go("plan");
    return;
  }
  if (target.dataset.payment) {
    state.payment = target.dataset.payment;
    state.modal = null;
    render();
    return;
  }
  if (target.dataset.passenger) {
    state.who = target.dataset.passenger;
    render();
    return;
  }
  if (target.dataset.activity) {
    state.activity = target.dataset.activity;
    render();
    return;
  }
  if (target.dataset.rating) {
    state.rating = Number(target.dataset.rating);
    render();
    return;
  }
  if (target.dataset.toggle) {
    state.toggled[target.dataset.toggle] =
      !state.toggled[target.dataset.toggle];
    render();
    return;
  }
  if (target.dataset.message) {
    state.chats.push(target.dataset.message);
    render();
    triggerAutoReply(target.dataset.message);
    return;
  }
  if (target.dataset.earningsPeriod) {
    state.earningsPeriod = target.dataset.earningsPeriod;
    render();
    return;
  }
  if (target.dataset.switchOffer !== undefined) {
    state.offerIndex = Number(target.dataset.switchOffer);
    render();
    return;
  }
  if (target.dataset.commuteTab) {
    state.commuteTab = target.dataset.commuteTab;
    render();
    return;
  }
  if (target.dataset.commuteFilter) {
    state.commuteCorridorFilter = target.dataset.commuteFilter;
    render();
    return;
  }
  if (target.dataset.reserveCommute) {
    const id = target.dataset.reserveCommute;
    if (state.commuteReserved.includes(id)) {
      state.commuteReserved = state.commuteReserved.filter((x) => x !== id);
      notify("Commute reservation cancelled.");
    } else {
      state.commuteReserved.push(id);
      notify("Commute seat reserved! Driver and co-riders notified.");
    }
    render();
    return;
  }
  if (target.dataset.routeAlt) {
    state.routeAlternative = target.dataset.routeAlt;
    render();
    return;
  }
  if (target.dataset.language) {
    saveNotice(`Sample language selected: ${target.dataset.language}.`);
    return;
  }
  if (target.dataset.amount) {
    state.amount = Number(target.dataset.amount);
    state.form = {};
    render();
    return;
  }
  if (target.dataset.removeStop !== undefined) {
    state.stops.splice(Number(target.dataset.removeStop), 1);
    render();
    return;
  }
  if (target.dataset.removePlace !== undefined) {
    state.saved.splice(Number(target.dataset.removePlace), 1);
    render();
    return;
  }
  if (target.dataset.document) {
    if (!state.docs.includes(target.dataset.document))
      state.docs.push(target.dataset.document);
    render();
    return;
  }
});
document.addEventListener("input", (event) => {
  const input = event.target;
  if (input.id === "destination-input") {
    state.search = input.value;
    $("#place-results").innerHTML = placeResults(input.value);
    $("#results-label").textContent = input.value
      ? "SAMPLE SEARCH RESULTS"
      : "SAVED & RECENT";
    return;
  }
  if (input.id === "pickup-input") {
    state.pickup = input.value;
    return;
  }
  if (input.id.startsWith("pin-")) {
    input.value = input.value.replace(/\D/g, "").slice(-1);
    if (input.value) {
      const next = $(`#pin-${Number(input.id.split("-")[1]) + 1}`);
      next?.focus();
    }
  }
  if (input.id) {
    state.form ||= {};
    state.form[
      `${state.role}:${state.screen}:${state.modal || ""}:${input.id}`
    ] = input.value;
  }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "screen-select") go(event.target.value);
  if (event.target.id === "trip-type") {
    state.tripType = event.target.value;
    render();
  }
  if (event.target.id === "ride-time") {
    state.schedule = event.target.value;
    render();
  }
  if (event.target.id === "radius") {
    event.target.previousElementSibling.textContent = `Pickup radius · ${Number(event.target.value) / 1000} km`;
  }
});
document.addEventListener("submit", (event) => {
  if (event.target.id === "chat-form") {
    event.preventDefault();
    const message = read("message-input");
    if (message) {
      state.chats.push(message);
      state.form = {};
      render();
      triggerAutoReply(message);
    }
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.modal) {
    state.modal = null;
    render();
  }
  if (event.key === "Tab" && state.modal) {
    const dialog = $("[role=dialog]");
    const focusable = [
      ...dialog.querySelectorAll("button,input,select,textarea,a[href]"),
    ].filter((el) => !el.disabled);
    const first = focusable[0],
      last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
$("#mobile-role")?.addEventListener("click", () =>
  role(state.role === "rider" ? "captain" : "rider"),
);
$("#mobile-menu")?.addEventListener("click", () => openModal("review-screens"));
$("#next-state")?.addEventListener("click", nextDemo);
render();

// Stable integration seam: native/mobile adapters supply real data beneath the
// approved renderer. The experience lab itself continues to use sample data.
export const prototypeBridge = {
  read: () => ({ ...state }),
  assign: (patch) => { Object.assign(state, patch); },
  update: (patch) => { Object.assign(state, patch); render(); },
  go,
  role,
  back: () => actions.back(),
  notify,
};
