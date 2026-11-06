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
