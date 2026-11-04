// RideCheck: checks in with the rider when a live trip leaves the planned road or stops for a
// long time away from the destination. It only uses measured captain positions from the
// backend; nothing is sent anywhere. The rider chooses: dismiss, share the trip, or get help.
import { distanceMeters, snapToRoute } from "./motion";
import type { Coordinate, MapData } from "./types";

const OFF_ROUTE_METERS = 250; // farther than this from the planned road counts as off route
const OFF_ROUTE_SECONDS = 45; // …for this long
const STOP_METERS = 40; // moved less than this…
const STOP_SECONDS = 240; // …over this long counts as a long stop
const NEAR_DESTINATION_METERS = 300; // stopping near the destination is normal
const SNOOZE_MS = 10 * 60 * 1000; // after "I'm fine", ask again about the same thing after 10 min

type Reason = "route" | "stop";
const TEXT: Record<Reason, [string, string]> = {
  route: ["Your ride has left the planned route", "The captain is driving away from the route shown when you booked. This can be a detour around traffic."],
  stop: ["Your ride has stopped for a while", "The vehicle hasn't moved for 4 minutes and isn't near your destination."],
};

export class RideCheck {
  private samples: { at: number; p: Coordinate }[] = [];
  private offSince = 0;
  private snoozed: Record<Reason, number> = { route: 0, stop: 0 };
  private showing: Reason | null = null;
  private card?: HTMLElement;
  private trip = "";

  constructor(private root: () => HTMLElement | undefined, private now = () => Date.now()) {}

  observe(data: MapData) {
    const v = data.vehicles[0];
    const trip = data.phase === "in_progress" && data.pickup && data.dropoff ? `${data.pickup.lat},${data.pickup.lng}>${data.dropoff.lat},${data.dropoff.lng}` : "";
    if (trip !== this.trip) this.reset(trip);
    if (!trip) return this.render();
    if (!v) return this.render(); // no fresh fix: decide nothing on missing data
    const at = this.now();
    this.samples.push({ at, p: v });
    this.samples = this.samples.filter((s) => at - s.at <= STOP_SECONDS * 1000 + 5000);

    const snap = data.route && data.route.length > 1 ? snapToRoute(v, data.route) : null;
    if (snap && snap.distance > OFF_ROUTE_METERS) this.offSince ||= at;
    else this.offSince = 0;
    const offRoute = Boolean(this.offSince) && at - this.offSince >= OFF_ROUTE_SECONDS * 1000;

    const oldest = this.samples[0];
    const longStop = at - oldest.at >= STOP_SECONDS * 1000
      && this.samples.every((s) => distanceMeters(s.p, v) < STOP_METERS)
      && distanceMeters(v, data.dropoff!) > NEAR_DESTINATION_METERS;

    const reason: Reason | null = offRoute && at > this.snoozed.route ? "route" : longStop && at > this.snoozed.stop ? "stop" : null;
    if (reason) this.showing = reason;
    else if (this.showing === "route" && !this.offSince) this.showing = null; // back on route
    this.render();
  }

  private reset(trip: string) {
    this.trip = trip;
    this.samples = [];
    this.offSince = 0;
    this.showing = null;
  }

  private render() {
    const root = this.root();
    if (!this.showing || !root) {
      this.card?.remove();
      this.card = undefined;
      return;
    }
    const [title, body] = TEXT[this.showing];
    if (!this.card || this.card.parentElement !== root || this.card.dataset.reason !== this.showing) {
      this.card?.remove();
      this.card = document.createElement("div");
      this.card.className = "hop-ridecheck";
      this.card.setAttribute("role", "alertdialog");
      this.card.setAttribute("aria-label", "RideCheck: is everything okay?");
      this.card.dataset.reason = this.showing;
      this.card.innerHTML = `<strong>${title}</strong><p>${body} Is everything okay?</p>
        <div class="hop-ridecheck-actions">
          <button type="button" class="secondary" data-ridecheck-ok>I’m fine</button>
          <button type="button" class="secondary" data-modal="share">Share trip</button>
          <button type="button" class="primary" data-modal="sos">Get help</button>
        </div>`;
      this.card.querySelector("[data-ridecheck-ok]")!.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.showing) this.snoozed[this.showing] = this.now() + SNOOZE_MS;
        if (this.showing === "stop") this.samples = [];
        this.showing = null;
        this.render();
      });
      root.append(this.card);
      (this.card.querySelector("[data-ridecheck-ok]") as HTMLElement).focus({ preventScroll: true });
    }
  }

  stop() {
    this.reset("");
    this.render();
  }
}
