// Hop originals (approved Nov 2026 prototype): pickup beacon, fair wait clock and fare story.
// All three run on the phone from data the ride already carries; styles are in animations.css under
// "Hop originals".
import type { Ride } from "../services/contracts";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const inr = (paise: number) => "₹" + (paise % 100 ? (paise / 100).toFixed(2) : String(paise / 100));

// ── Pickup beacon ──────────────────────────────────────
// Both phones pick the same colour from the ride id, so "look for a teal phone" matches the rider's screen.
const BEACONS = [
  { name: "teal", fill: "#2fd5c4", light: "#b8fff6", ink: "#00332f" },
  { name: "orange", fill: "#ff9f1c", light: "#ffe0b0", ink: "#3d2400" },
  { name: "pink", fill: "#ff5fa2", light: "#ffd0e4", ink: "#3d0019" },
  { name: "lime", fill: "#9be22d", light: "#e4ffb8", ink: "#1f3300" },
];
export function beaconFor(rideId: string) {
  let h = 0;
  for (const c of rideId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BEACONS[h % BEACONS.length];
}

/** Rider, captain at the pickup: a button that turns the whole screen the trip colour until tapped. */
export function riderBeacon(sheet: HTMLElement, ride: Ride) {
  let row = sheet.querySelector<HTMLElement>(".hop-beacon-row");
  if (ride.status !== "arrived") return row?.remove();
  const b = beaconFor(ride.id);
  if (!row) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary hop-beacon-row";
    button.dataset.hopBeacon = "on";
    sheet.append(button);
    row = button;
  }
  const html = `<span class="hop-beacon-swatch" style="--beacon:${b.fill};--beacon-light:${b.light}" aria-hidden="true"></span>Light up my phone`;
  if (row.innerHTML !== html) row.innerHTML = html;
  row.setAttribute("aria-label", `Light up my phone in ${b.name} so my captain can spot me`);
}
export function showBeacon(app: HTMLElement, ride: Ride) {
  const b = beaconFor(ride.id), first = (ride.driver_name || "Your captain").split(" ")[0];
  app.querySelector(".hop-beacon")?.remove();
  const el = document.createElement("div");
  el.className = "hop-beacon";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Pickup beacon");
  el.style.setProperty("--beacon", b.fill);
  el.style.setProperty("--beacon-light", b.light);
  el.style.color = b.ink;
  el.innerHTML = `<div><strong>Hold your phone up</strong><p>${escape(first)} is looking for a ${b.name} screen.</p><button type="button" data-hop-beacon="off" style="background:${b.ink}">I see ${escape(first)}</button></div>`;
  // Tapping anywhere ends it; it sits on <body> so the app redrawing underneath doesn't remove it.
  el.addEventListener("click", () => el.remove());
  app.append(el);
  el.querySelector("button")?.focus();
}

/** Captain, heading to or at the pickup: which colour the rider's phone will glow. */
export function captainBeaconHint(container: Element | null, ride?: Ride) {
  if (!container) return;
  let hint = container.querySelector<HTMLElement>(".hop-beacon-hint");
  if (!ride || !["accepted", "arrived"].includes(ride.status)) return hint?.remove();
  const b = beaconFor(ride.id), first = (ride.passenger_name || "The rider").split(" ")[0];
  if (!hint) {
    hint = document.createElement("div");
    hint.className = "hop-beacon-hint";
    container.append(hint);
  }
  const html = `<span class="hop-beacon-swatch" style="--beacon:${b.fill};--beacon-light:${b.light}" aria-hidden="true"></span><span><strong>Look for a ${b.name} phone</strong><small>${escape(first)} can light up their screen when you're close.</small></span>`;
  if (hint.innerHTML !== html) hint.innerHTML = html;
}

// ── Fair wait clock ────────────────────────────────────
// Same rule as the server's waitChargeSQL: 3 free minutes after "arrived", then ₹2 a minute up to ₹100.
export const FREE_WAIT_SECONDS = 180, WAIT_PAISE_PER_MIN = 200, WAIT_CAP_PAISE = 10000;
let waitTimer: ReturnType<typeof setInterval> | undefined;

export function waitClock(container: Element | null, ride: Ride | undefined, role: "rider" | "captain") {
  if (!container) return;
  let card = container.querySelector<HTMLElement>(".hop-wait");
  const since = ride?.status === "arrived" && ride.arrived_at ? Date.parse(ride.arrived_at) : NaN;
  if (!ride || !Number.isFinite(since)) {
    card?.remove();
    return;
  }
  if (!card) {
    card = document.createElement("div");
    card.className = "hop-wait";
    card.setAttribute("role", "timer");
    card.innerHTML = `<svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true"><circle class="track" cx="24" cy="24" r="20" fill="none" stroke-width="5"/><circle class="left" cx="24" cy="24" r="20" fill="none" stroke-width="5" stroke-linecap="round" pathLength="1" stroke-dasharray="1"/></svg><span><strong></strong><small></small></span>`;
    container.append(card);
  }
  card.dataset.since = String(since);
  card.dataset.role = role;
  card.dataset.other = (role === "rider" ? ride.driver_name : ride.passenger_name)?.split(" ")[0] || (role === "rider" ? "Your captain" : "The rider");
  paintWait(card);
  if (!waitTimer) waitTimer = setInterval(() => {
    const cards = document.querySelectorAll<HTMLElement>(".hop-wait");
    if (!cards.length) { clearInterval(waitTimer); waitTimer = undefined; return; }
    cards.forEach(paintWait);
  }, 1000);
}
function paintWait(card: HTMLElement) {
  const elapsed = Math.max(0, Math.floor((Date.now() - Number(card.dataset.since)) / 1000));
  const left = Math.max(0, FREE_WAIT_SECONDS - elapsed);
  const over = elapsed - FREE_WAIT_SECONDS;
  const charge = over > 0 ? Math.min(WAIT_CAP_PAISE, Math.floor(over / 60) * WAIT_PAISE_PER_MIN) : 0;
  const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
  card.classList.toggle("over", left === 0);
  card.querySelector<SVGCircleElement>("circle.left")?.setAttribute("stroke-dashoffset", String(1 - left / FREE_WAIT_SECONDS));
  const title = left > 0 ? `Free wait ${mmss(left)}` : `Waiting ${mmss(over)} extra`;
  const note = left > 0
    ? `${card.dataset.other} sees the same clock. Then ₹2 a minute.`
    : card.dataset.role === "rider" ? `Waiting charge so far ${inr(charge)} (₹2 a minute, up to ₹100).` : `Waiting charge so far ${inr(charge)}, added to the fare.`;
  const strong = card.querySelector("strong"), small = card.querySelector("small");
  if (strong && strong.textContent !== title) strong.textContent = title;
  if (small && small.textContent !== note) small.textContent = note;
}

// ── Fare story ─────────────────────────────────────────
/** The fare explained as a short timeline from the ride's own numbers. */
export function fareStory(ride: Ride, role: "rider" | "captain") {
  const quoted = ride.quoted_fare_paise ?? ride.fare_paise;
  const wait = ride.wait_charge_paise || 0;
  const adjustedFrom = ride.adjusted_from_paise ?? null;
  const discount = ride.discount_paise || 0;
  const payable = ride.payable_paise ?? ride.fare_paise;
  const km = (m?: number | null) => (m ? `${(m / 1000).toFixed(1)} km` : "");
  const steps: [string, string, string, string][] = [["lock", "Fare locked at booking", km(ride.meters) ? `${km(ride.meters)} route` : "The price you saw", inr(quoted)]];
  steps.push(wait > 0 ? ["clock", "Waiting at pickup", "After the 3 free minutes, ₹2 a minute", `+${inr(wait)}`] : ["clock", "No waiting charge", "Picked up within the free wait", inr(0)]);
  if (adjustedFrom !== null && ride.covered_meters)
    steps.push(["route", `Trip ended after ${km(ride.covered_meters)}`, role === "rider" ? "You pay only for the distance covered" : "Fare for the distance driven", `−${inr(Math.max(0, adjustedFrom - ride.fare_paise))}`]);
  if (discount > 0) steps.push(["gift", "Discount", "Applied to this ride", `−${inr(discount)}`]);
  steps.push(["check", role === "rider" ? "You pay" : "You collect", payable === quoted ? "Same as the price at booking" : "Never more than the locked price, plus any waiting", inr(payable)]);
  const ico: Record<string, string> = { lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4", clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2", route: "M12 3l7 18-7-4-7 4z", gift: "M3 9h18v4H3zM5 13v8h14v-8M12 9v12", check: "M5 12.5l4.5 4.5L19 7.5" };
  return `<section class="hop-fare-story" aria-label="How this fare was worked out"><strong>Fare story</strong>${steps.map(([i, t, d, a]) => `<div><span class="hop-fs-dot" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${ico[i]}"/></svg></span><span><b>${escape(t)}</b><small>${escape(d)}</small></span><span class="hop-fs-amt">${a}</span></div>`).join("")}</section>`;
}

// ── Ride notes (phase 2) ───────────────────────────────
// Four fixed notes, shown to the captain in their own app language (no translation service needed).
export const NOTE_LABELS: Record<string, Record<string, string>> = {
  quiet: { en: "Quiet ride", ta: "அமைதியான பயணம்", hi: "शांत सफ़र" },
  luggage: { en: "Luggage", ta: "லக்கேஜ் இருக்கு", hi: "सामान है" },
  boarding: { en: "Help boarding", ta: "ஏற உதவி வேணும்", hi: "चढ़ने में मदद चाहिए" },
  call: { en: "On a call", ta: "போன்ல பேசிட்டு இருக்கேன்", hi: "फ़ोन पर हूँ" },
};
export const noteLabel = (code: string, lang = "en") => NOTE_LABELS[code]?.[lang] || NOTE_LABELS[code]?.en || code;

/** Rider, Review screen: pick notes for the captain. */
export function notesPicker(container: Element | null, selected: Set<string>) {
  if (!container) return;
  let box = container.querySelector<HTMLElement>(".hop-notes");
  if (!box) {
    box = document.createElement("section");
    box.className = "hop-notes";
    box.setAttribute("aria-label", "Note for your captain");
    container.append(box);
  }
  const html = `<strong>Note for your captain</strong><div class="hop-notes-chips">${Object.keys(NOTE_LABELS).map((c) => `<button type="button" class="product-chip ${selected.has(c) ? "active" : ""}" aria-pressed="${selected.has(c)}" data-hop-note="${c}">${noteLabel(c)}</button>`).join("")}</div><small>Your captain sees these in their own language.</small>`;
  if (box.innerHTML !== html) box.innerHTML = html;
}

/** Captain: the rider's notes, in the captain's language with the English underneath. */
export function notesCard(container: Element | null, notes: string[] | undefined, lang: string) {
  if (!container) return;
  let card = container.querySelector<HTMLElement>(".hop-notes-card");
  if (!notes?.length) return card?.remove();
  if (!card) {
    card = document.createElement("div");
    card.className = "hop-notes-card";
    card.setAttribute("role", "note");
    container.append(card);
  }
  const html = `<span class="live-eyebrow">RIDER NOTES</span><strong>${notes.map((n) => escape(noteLabel(n, lang))).join(" · ")}</strong>${lang !== "en" ? `<small>${notes.map((n) => escape(noteLabel(n))).join(" · ")}</small>` : ""}`;
  if (card.innerHTML !== html) card.innerHTML = html;
}

// ── Arrival alert and SMS updates (phase 3) ────────────
type SmsConfig = { sms_available?: boolean; sms_test_mode?: boolean };
/** Rider on a trip: tell a contact on arrival, and SMS updates if the internet drops. */
export function alertToggles(container: Element | null, ride: Ride | undefined, cfg: SmsConfig = {}) {
  if (!container) return;
  let box = container.querySelector<HTMLElement>(".hop-alerts");
  if (!ride || !["accepted", "arrived", "in_progress"].includes(ride.status)) return box?.remove();
  if (!box) {
    box = document.createElement("div");
    box.className = "hop-alerts";
    container.append(box);
  }
  const note = cfg.sms_available ? "" : cfg.sms_test_mode ? "Test mode: texts are logged, not sent." : "Texts aren’t set up yet, so nothing will be sent.";
  const row = (key: "arrival_alert" | "sms_updates", title: string, detail: string) =>
    `<label class="hop-alert-row"><span><strong>${title}</strong><small>${detail}</small></span><input type="checkbox" role="switch" data-hop-alert="${key}" ${ride[key] ? "checked" : ""}/></label>`;
  const html = row("arrival_alert", "Tell my emergency contact when I arrive", "They get a text the moment you reach.") +
    row("sms_updates", "SMS updates if my internet drops", "Captain arriving and trip started, by text.") +
    (note ? `<small class="hop-alert-note">${note}</small>` : "");
  if (box.innerHTML !== html) box.innerHTML = html;
}
/** Rider payment page: what happened to the arrival text. */
export function arrivalResult(ride: Ride) {
  const s = ride.arrival_alert_status;
  if (!ride.arrival_alert || !s) return "";
  const text = {
    sent: "Your emergency contact got a text that you arrived.",
    test: "Test mode: the arrival text was logged, not sent.",
    unavailable: "Texts aren’t set up yet, so no arrival text was sent.",
    no_contact: "Add an emergency contact (Safety centre) to use arrival alerts.",
    failed: "The arrival text couldn’t be sent.",
  }[s];
  return text ? `<div class="payment-hint hop-arrival-${s}" role="status">${text}</div>` : "";
}

// ── Chai break (phase 3) ───────────────────────────────
/** Captain Drive: after 4 hours online, a gentle 15-minute break; while on a break, a countdown. */
export function breakCard(container: Element | null, driver: { online?: boolean; online_since?: string | null; break_until?: string | null } | undefined) {
  if (!container) return;
  let card = container.querySelector<HTMLElement>(".hop-break");
  const until = driver?.break_until ? Date.parse(driver.break_until) : 0;
  const onlineFor = driver?.online && driver.online_since ? Date.now() - Date.parse(driver.online_since) : 0;
  const onBreak = until > Date.now();
  if (!driver?.online || (!onBreak && onlineFor < 4 * 3600 * 1000)) return card?.remove();
  if (!card) {
    card = document.createElement("div");
    card.className = "hop-break";
    container.querySelector(".zone-pill-row")?.after(card);
    if (!card.isConnected) container.prepend(card);
  }
  const hours = Math.floor(onlineFor / 3600000), mins = Math.floor((onlineFor % 3600000) / 60000);
  const left = Math.max(0, Math.round((until - Date.now()) / 60000));
  const html = onBreak
    ? `<span><strong>On a chai break · ${left} min left</strong><small>Requests are paused. You stay online.</small></span><button type="button" class="secondary" data-hop-break="0">End break</button>`
    : `<span><strong>${hours} h ${mins} min on the road</strong><small>Time for a chai? Requests pause, you keep your place.</small></span><button type="button" class="secondary" data-hop-break="15">15 min break</button>`;
  if (card.innerHTML !== html) card.innerHTML = html;
}

// ── Language bridge: quick replies (phase 3) ───────────
// Quick replies are sent in English and shown to the other person in their app language.
export const QUICK_TEXT: Record<string, Record<string, string>> = {
  "I’m at the pickup.": { ta: "நான் பிக்அப் இடத்தில் இருக்கேன்.", hi: "मैं पिकअप पर हूँ।" },
  "I’ll be there shortly.": { ta: "சீக்கிரம் வந்துடுவேன்.", hi: "मैं थोड़ी देर में पहुँच रहा/रही हूँ।" },
  "Please wait 2 minutes.": { ta: "2 நிமிஷம் காத்திருங்க.", hi: "कृपया 2 मिनट रुकिए।" },
  "I’ve arrived outside.": { ta: "நான் வெளியே வந்துட்டேன்.", hi: "मैं बाहर पहुँच गया हूँ।" },
  "Hazard lights are on.": { ta: "ஹசார்ட் லைட் போட்டிருக்கேன்.", hi: "हैज़र्ड लाइट चालू है।" },
  "Stuck in traffic, about 5 minutes.": { ta: "டிராஃபிக்ல இருக்கேன், சுமார் 5 நிமிஷம்.", hi: "ट्रैफ़िक में हूँ, लगभग 5 मिनट।" },
};
