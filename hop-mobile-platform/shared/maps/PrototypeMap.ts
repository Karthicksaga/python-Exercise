import { goOnlineSound, goOfflineSound } from "../sounds";
import { GoogleMapView, loadGoogle } from "./google";
import { OSMMapView } from "./osm";
import { NativeMapView, nativeMapsEnabled } from "./native";
import { Capacitor } from "@capacitor/core";
import { LiveFeed } from "./liveFeed";
import { watchLocation } from "./locationWatch";
import type { Coordinate, MapData, MapView } from "./types";
import { vehicleCategory } from "./types";
import { api } from "../services/client";
import { ForegroundTracking } from "./foregroundTracking";
import { ensureRideAlerts } from "../notifications/device";
import { currentLocation } from "../platform/transport";
import { RoutePreviewController } from "./RoutePreview";
import { remainingRoute, snapToRoute } from "./motion";
import { RideCheck } from "./rideCheck";
import { walkNote } from "./pins";

function computeBearing(from: Coordinate, to: Coordinate): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

function computeDistanceMeters(a: Coordinate, b: Coordinate): number {
  const R = 6371e3;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Replaces only the sample map canvas. The approved surrounding UI is untouched. */
// Status messages that mean "all is well". They aren't drawn over the map.
const QUIET_STATUS = new Set([
  "",
  "Connecting to Hop for live locations",
  "Live nearby vehicles",
  "No nearby vehicles online",
  "Live captain location",
  "Location found · fetching live vehicles",
  "Online · sharing your location so riders can find you",
  "You’re offline · GPS sharing stopped",
]);

export class PrototypeMap {
  private view?: MapView;
  private canvas?: HTMLElement;
  private status?: HTMLElement;
  private root?: HTMLElement;
  private provider = "";
  private preferences = { traffic: false, satellite: false, lowdata: false, night: false };
  private message = "Connecting to Hop for live locations";
  private data: MapData = {
    center: { lat: 13.0067, lng: 80.2206 },
    vehicles: [],
  };
  private current?: Coordinate;
  private planned?: MapData;
  private following = false;
  private locationStop?: () => void;
  private locationGeneration = 0;
  private revision = 0;
  private locationRequested = false;
  private camera?: { center: Coordinate; zoom: number };
  private routePreview?: RoutePreviewController;
  private previewBadge?: HTMLButtonElement;
  private previewActiveRoute = "";
  private previewCompleted = false;
  private previewCameraFollow = true;
  private located = (event: Event) => {
    this.current = (event as CustomEvent<Coordinate>).detail;
    // Booking uses this to tell whether the phone is inside a service area.
    window.dispatchEvent(new CustomEvent("hop-here", { detail: this.current }));
    this.centered = true;
    this.feed.setLocation(this.current);
    this.paint();
    if (!this.planned?.pickup && !this.data.pickup) this.view?.center(this.current);
  };
  private async locate() {
    try {
      const coords = await currentLocation();
      this.located(new CustomEvent("hop-current-location", { detail: {
        lat: coords.latitude, lng: coords.longitude, heading: coords.heading ?? undefined,
      } }));
      this.message = "Location found · fetching live vehicles";
    } catch {
      this.message = "Allow location access to find your position · you can still choose a map pin";
    }
    this.label();
  }

  // The vehicle the rider picked on Choose your ride (the renderer keeps it in its state).
  private selectedVehicle(): string {
    const bridge = (window as { prototypeBridge?: { read?: () => { vehicle?: string } } }).prototypeBridge;
    return vehicleCategory(String(bridge?.read?.().vehicle || "auto"));
  }

  private isConfirmScreen(): boolean {
    return (
      this.role === "rider" && Boolean(this.app.querySelector(".confirm-sheet"))
    );
  }

  // On a trip, a captain within 35 m of the road is drawn on it, facing along it, and the
  // route behind them disappears, so the line always shows what is still ahead.
  private onRoad(data: MapData): MapData {
    const v = data.vehicles[0], route = data.route;
    // The rider's route before pickup is pickup → destination, which the captain isn't on yet.
    const following = this.role === "captain" || data.phase === "in_progress" || Boolean(data.approach);
    if (!v || !route || route.length < 2 || !following) return data;
    const snap = snapToRoute(v, route);
    if (!snap || snap.distance > 35) return data;
    return {
      ...data,
      vehicles: [{ ...v, lat: snap.point.lat, lng: snap.point.lng, heading: snap.bearing }, ...data.vehicles.slice(1)],
      route: remainingRoute(route, snap),
    };
  }

  private display(): MapData {
    const isPreviewing =
      this.routePreview?.isRunning() && this.isConfirmScreen();
    return {
      ...(this.data.pickup
        ? this.onRoad(this.data)
        : {
            ...this.data,
            ...this.planned,
            route: isPreviewing ? [] : this.planned?.route,
            vehicles: this.data.vehicles,
          }),
      editable: this.role === "rider" && !this.data.pickup,
      current: this.current,
      following: this.following,
      ...(this.role === "rider" && !this.data.pickup && this.current && this.planned?.pickup
        ? { pickupNote: walkNote(computeDistanceMeters(this.current, this.planned.pickup)) }
        : {}),
    };
  }

  // Tapping a pin callout while booking opens the existing edit control for that stop.
  private pinEdit = (event: Event) => {
    const which = (event as CustomEvent<{ target: string }>).detail?.target;
    const control =
      (which === "pickup" ? this.app.querySelector<HTMLElement>('[data-modal="pickup"]') : null) ||
      this.app.querySelector<HTMLElement>('[data-go="search"]');
    control?.click();
  };

  // Each time the trip changes stage (captain assigned, arrived, trip started), frame the vehicle
  // and the road still ahead once. Afterwards the person controls the camera.
  private stage = "";
  private frameStage(data: MapData): boolean {
    const key = data.pickup && data.vehicles.length ? `${data.phase}:${data.approach ? "approach" : ""}` : "";
    if (!key || key === this.stage) {
      if (!key) this.stage = "";
      return false;
    }
    this.stage = key;
    if (this.following) return false;
    const shown = this.display();
    const target = data.phase === "in_progress" ? data.dropoff : data.pickup;
    const points = [...shown.vehicles.slice(0, 1), ...(shown.route?.length ? shown.route : []), ...(target ? [target] : [])];
    this.measureTop();
    if (points.length < 2) return false;
    this.view?.fit(points);
    return true;
  }

  private alternativesKey = "";
  private paint() {
    const shown = this.display();
    this.view?.update(shown);
    // "Follow me" and "Show full route" only help when a route is drawn; without one, the
    // map shows just layers and recentre (map.css).
    const hasRoute = Boolean((shown.route && shown.route.length > 1) || (shown.pickup && shown.dropoff));
    this.root?.parentElement?.querySelector<HTMLElement>(".map-controls")?.toggleAttribute("data-has-route", hasRoute);
    const alternatives = this.data.pickup ? [] : this.planned?.alternatives ?? [];
    const key = JSON.stringify(alternatives.map((a) => [a.index, a.selected, a.route.length]));
    if (key !== this.alternativesKey) {
      this.alternativesKey = key;
      this.view?.setAlternatives?.(alternatives);
    }
    if (this.following && this.current) this.view?.center(this.current);
  }

  private plan = (event: Event) => {
    const next = (event as CustomEvent<MapData>).detail;
    const changed = JSON.stringify([next.center, next.pickup, next.dropoff, next.route]) !== JSON.stringify([this.planned?.center, this.planned?.pickup, this.planned?.dropoff, this.planned?.route]);
    this.planned = next;
    if (!changed) return;
    this.camera = undefined;
    this.paint();
    this.measureTop();
    const points =
      this.planned.route ||
      [this.planned.pickup!, this.planned.dropoff!].filter(Boolean);
    if (points.length > 1) this.view?.fit(points);
    else if (points.length === 1) this.view?.center(points[0]);
    else if (this.planned.center) this.view?.center(this.planned.center);
    // The screen's own bars (route bar, header) are often drawn just after the route arrives.
    // Measure again once they are there and reframe if they cover more than first measured.
    if (points.length > 1) {
      const before = Number(this.canvas?.dataset.topInset || 0), planned = this.planned, moved = this.moves;
      setTimeout(() => {
        this.measureTop();
        if (this.planned !== planned || this.moves !== moved || this.camera) return;
        if (Number(this.canvas?.dataset.topInset || 0) > before + 8) this.view?.fit(points);
      }, 120);
    }

    if (this.isConfirmScreen()) {
      this.startRoutePreview();
    } else {
      this.stopRoutePreview();
    }
  };

  private moves = 0;
  private dragged = () => {
    this.moves++;
    this.following = false;
    this.centered = true;
    this.previewCameraFollow = false;
    this.app
      .querySelector("[data-follow]")
      ?.setAttribute("aria-pressed", "false");
  };

  private rideCheck = new RideCheck(() => this.root);
  private centered = false;
  private observer: MutationObserver;
  private resize?: ResizeObserver;
  private feed: LiveFeed;
  private tracking = new ForegroundTracking((message) => {
    this.message = message;
    this.label();
  });

  constructor(
    private app: HTMLElement,
    private role: "rider" | "captain",
  ) {
    this.feed = new LiveFeed(
      role,
      (data, message) => {
        this.data = data;
        this.message = message;
        if (this.role === "rider") this.rideCheck.observe(data);
        this.paint();
        // A stage frame already shows the vehicle and the road ahead; don't pan away from it.
        if (this.frameStage(data)) this.centered = true;
        if (!this.centered && (data.pickup || data.vehicles.length)) {
          this.view?.center(data.center);
          this.centered = true;
        }
        this.label();
      },
      (online) => {
        if (this.role !== "captain") return;
        // A status poll that started just before the captain tapped Go online can still report
        // "offline"; don't let that stop the sharing they just turned on.
        if (!online && Date.now() - this.wentOnlineAt < 6000) return;
        if (!online) this.tracking.stop();
        // Location is shared only after the captain acts in this session (tapping Go online or
        // GPS sharing). Reopening the app while still online doesn't resume it silently, so
        // say plainly that riders can't find them until they turn it on.
        else if (online !== this.wasOnline && !this.tracking.active && !this.sharingStarting) {
          this.message = "You’re online · tap GPS sharing so riders can find you";
          this.label();
        }
        this.wasOnline = online;
        const pill = this.app.querySelector<HTMLElement>(".online-pill");
        if (pill) {
          pill.classList.toggle("online", online);
          pill.innerHTML = `<i></i>${online ? "You’re online" : "You’re offline"}`;
        }
        const button = this.app.querySelector<HTMLElement>(
          '[data-action="online"]',
        );
        if (button && !button.hasAttribute("data-live-onboard")) {
          button.textContent = online ? "Online" : "Go online";
          button.setAttribute("aria-pressed", String(online));
          button.classList.toggle("is-online", online);
        }
      },
    );
    this.observer = new MutationObserver(() => void this.attach());
    this.observer.observe(app, { childList: true });
    app.addEventListener("click", this.click, true);
    window.addEventListener("hop-map-auth-failed", this.authFailure);
    window.addEventListener("hop-planned-route", this.plan);
    window.addEventListener("hop-map-drag", this.dragged);
    window.addEventListener("hop-pin-edit", this.pinEdit);
    window.addEventListener("hop-captain-online", this.captainOnline);
    window.addEventListener("hop-current-location", this.located);
    void this.attach();
    void this.feed.start();
  }

  private wasOnline?: boolean;
  private wentOnlineAt = 0;
  // The captain tapped Go online / Go offline: going online is their go-ahead to share location.
  private captainOnline = (event: Event) => {
    if (this.role !== "captain") return;
    const online = Boolean((event as CustomEvent<boolean>).detail);
    this.wasOnline = online;
    this.wentOnlineAt = online ? Date.now() : 0;
    if (online) {
      goOnlineSound();
      this.message = "Online · sharing your location so riders can find you";
      this.shareLocation();
    } else {
      goOfflineSound();
      this.tracking.stop();
      this.message = "You’re offline · GPS sharing stopped";
    }
    this.label();
  };
  private sharingStarting = false;
  private shareLocation() {
    void ensureRideAlerts().then((problem) => {
      if (problem) { this.message = problem; this.label(); }
    });
    if (this.tracking.active || this.sharingStarting) return;
    this.sharingStarting = true;
    void this.tracking.start().catch((e) => {
      this.message = `Online, but your location isn’t shared: ${(e as Error).message} Riders can’t send you requests until it is.`;
      this.label();
    }).finally(() => { this.sharingStarting = false; });
  }

  private click = (event: Event) => {
    const previewAction = (event.target as Element)?.closest<HTMLElement>(
      '[data-action="skip-preview"], [data-action="replay-preview"]',
    );
    if (previewAction) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (previewAction.dataset.action === "skip-preview") {
        this.routePreview?.skip();
      } else {
        this.startRoutePreview(true);
      }
      return;
    }
    const preference = (event.target as Element)?.closest<HTMLElement>("[data-map-pref]");
    if (preference) {
      event.preventDefault(); event.stopImmediatePropagation();
      const key = preference.dataset.mapPref as keyof typeof this.preferences;
      if (!(key in this.preferences) || preference.hasAttribute("disabled")) return;
      this.preferences[key] = !this.preferences[key];
      if (key === "lowdata" && this.preferences.lowdata) {
        this.preferences.traffic = false; this.preferences.satellite = false;
      } else if ((key === "traffic" || key === "satellite") && this.preferences[key]) this.preferences.lowdata = false;
      if (key === "satellite" && this.preferences.satellite) this.preferences.night = false;
      if (key === "night" && this.preferences.night) this.preferences.satellite = false;
      this.view?.setPreferences(this.preferences);
      this.decoratePreferences(); this.label();
      return;
    }
    const control = (event.target as Element)?.closest<HTMLElement>(
      "[data-follow],[data-route-fit]",
    );
    if (control) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (control.hasAttribute("data-route-fit")) {
        this.dragged();
        const data = this.display();
        const points =
          data.route || [data.pickup!, data.dropoff!].filter(Boolean);
        if (points.length > 1) this.view?.fit(points);
        else if (points.length === 1) this.view?.center(points[0]);
        return;
      }
      this.following = !this.following;
      control.setAttribute("aria-pressed", String(this.following));
      if (this.following) {
        if (this.current) {
          this.view?.center(this.current);
        }
        const generation = ++this.locationGeneration;
        this.locationStop?.();
        void watchLocation(
          (point) => {
            if (generation !== this.locationGeneration) return;
            let heading = point.heading;
            if (heading == null && this.current) {
              const dist = computeDistanceMeters(this.current, point);
              if (dist >= 1.5) {
                heading = computeBearing(this.current, point);
              } else {
                heading = this.current.heading;
              }
            }
            if (heading == null) {
              const target =
                this.planned?.route?.[1] ||
                this.planned?.dropoff ||
                this.planned?.pickup;
              if (target) {
                heading = computeBearing(point, target);
              }
            }
            this.current = { ...point, heading };
            this.feed.setLocation(point);
            this.paint();
            if (this.following) this.view?.center(point);
          },
          () => {
            this.following = false;
            this.message = "Location unavailable · follow paused";
            this.label();
          },
        )
          .then((stop) => {
            if (generation !== this.locationGeneration) stop();
            else this.locationStop = stop;
          })
          .catch((e) => {
            this.following = false;
            this.message = (e as Error).message;
            this.label();
          });
      } else {
        this.locationGeneration++;
        this.locationStop?.();
        this.locationStop = undefined;
      }
      return;
    }
    const online = (event.target as Element)?.closest<HTMLButtonElement>(
      '[data-action="online"]',
    );
    if (this.role === "captain" && online) {
      event.preventDefault();
      event.stopImmediatePropagation();
      online.disabled = true;
      void (async () => {
        await api.session();
        const state = await api.state();
        const next = !state.driver?.[0]?.online;
        if (next && state.driver?.[0]?.status !== "approved")
          throw new Error(
            "Complete Captain onboarding and wait for operator approval before going online.",
          );
        await api.online(next);
        if (next) goOnlineSound();
        else goOfflineSound();
        if (!next) this.tracking.stop();
        this.message = next
          ? "Online · sharing your location so riders can find you"
          : "You’re offline · GPS sharing stopped";
        this.label();
        if (next) this.shareLocation();
      })()
        .catch((e) => {
          this.message = (e as Error).message;
          this.label();
        })
        .finally(() => {
          online.disabled = false;
        });
      return;
    }
    const tracking = (event.target as Element)?.closest<HTMLElement>(
      "[data-live-gps]",
    );
    if (tracking) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this.tracking.active) {
        this.tracking.stop();
        this.message = "GPS sharing off";
        this.label();
      } else
        void this.tracking.start().catch((e) => {
          this.message = (e as Error).message;
          this.label();
        });
      return;
    }
    const button = (event.target as Element)?.closest<HTMLElement>(
      '[data-action="center-map"]',
    );
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void currentLocation()
      .then((coords) => {
        let heading: number | undefined;
        if (coords.heading != null && !Number.isNaN(coords.heading)) {
          heading = coords.heading;
        } else if (this.current) {
          heading = this.current.heading;
        }
        const point = { lat: coords.latitude, lng: coords.longitude, heading };
        this.current = point;
        this.paint();
        this.feed.setLocation(point);
        this.view?.center(point);
        this.message = "Location found · fetching live vehicles";
        this.label();
      })
      .catch(() => {
        this.message =
          "Location access unavailable · allow location to find nearby vehicles";
        this.label();
        window.dispatchEvent(new Event("hop-location-denied"));
      });
  };

  private authFailure = () => {
    void this.fallback(this.revision);
  };

  private label() {
    if (!this.status) return;
    // The provider name is read out but not shown: the map's own credits already name it.
    const provider = document.createElement("span");
    provider.className = "sr-only";
    provider.textContent = `${this.provider || "Loading map"} · `;
    this.status.replaceChildren(provider, document.createTextNode(this.message));
    // Normal states stay off the map (screen readers still hear them); only problems show.
    this.status.classList.toggle("hop-map-status-quiet", QUIET_STATUS.has(this.message));
  }

  // Wide bars floating over the top of the map (screen header, route bar, status) hide part of
  // it. The map frames routes below them so pins and their callouts stay visible.
  private measureTop() {
    if (!this.root || !this.canvas) return;
    const body = this.root.parentElement!;
    const box = body.getBoundingClientRect();
    let bottom = 0;
    for (const el of Array.from(body.querySelectorAll<HTMLElement>("*"))) {
      if (el === this.canvas || this.canvas.contains(el) || el.contains(this.canvas) || el.closest(".sheet, .map-controls")) continue;
      const style = getComputedStyle(el);
      if (style.position !== "absolute" && style.position !== "fixed" && style.position !== "sticky") continue;
      const rect = el.getBoundingClientRect();
      const map = this.canvas.clientHeight || box.height;
      // Bars only: skip backgrounds and panels taller than half the map.
      if (!rect.height || rect.height > map * 0.5 || rect.width < box.width * 0.45 || rect.top - box.top > map * 0.5) continue;
      bottom = Math.max(bottom, rect.bottom - box.top);
    }
    this.canvas.dataset.topInset = String(Math.round(bottom));
  }

  private size = () => {
    if (!this.root || !this.canvas) return;
    this.measureTop();
    const body = this.root.parentElement!,
      sheet = body.querySelector<HTMLElement>(".sheet");
    const top = body.getBoundingClientRect().top;
    // Keep provider attribution above the approved sheet instead of hiding it underneath.
    const sideSheet = sheet && body.clientWidth >= 700 && sheet.getBoundingClientRect().width < body.clientWidth * 0.7;
    const inset = sideSheet ? sheet.getBoundingClientRect().right - body.getBoundingClientRect().left + 20 : 0;
    const height = sheet && !sideSheet
      ? Math.max(100, sheet.getBoundingClientRect().top - top)
      : body.clientHeight;
    this.canvas.style.height = `${height}px`;
    body.style.setProperty("--hop-map-height", `${height}px`);
    this.canvas.style.left = `${inset}px`;
    this.canvas.style.width = inset ? `calc(100% - ${inset}px)` : "100%";
    body
      .querySelector(".map-controls")
      ?.classList.toggle("hop-compact-controls", height < 360);
  };

  private decoratePreferences() {
    const descriptions: Record<string, [string, string]> = {
      traffic: ["Traffic layer", this.provider === "Google Maps" ? "Live traffic from Google Maps" : "Requires Google Maps; unavailable on the current map"],
      satellite: ["Satellite view", this.provider === "Google Maps" ? "Aerial imagery with road labels" : "Requires Google Maps; unavailable on the current map"],
      lowdata: ["Low-data map", "Limit extra map tiles and layers; data savings vary"],
      night: ["Night map", "Darker map colours for low-light viewing"],
    };
    for (const key of Object.keys(descriptions) as (keyof typeof this.preferences)[]) {
      const button = this.app.querySelector<HTMLButtonElement>(`[data-toggle="${key}"], [data-map-pref="${key}"]`);
      if (!button || !button.closest(".modal-sheet")) continue;
      button.removeAttribute("data-toggle"); button.dataset.mapPref = key;
      const unavailable = !this.view || ((key === "traffic" || key === "satellite") && this.provider !== "Google Maps");
      button.disabled = unavailable;
      button.setAttribute("aria-checked", String(!unavailable && this.preferences[key]));
      const strong = button.querySelector("strong"), small = button.querySelector("small");
      if (strong) strong.textContent = descriptions[key][0];
      if (small) small.textContent = descriptions[key][1];
      button.querySelector(".switch")?.classList.toggle("on", !unavailable && this.preferences[key]);
    }
  }

  private async attach() {
    this.decoratePreferences();
    const root = this.app.querySelector<HTMLElement>(".map-art");
    if (root === this.root) return;
    this.revision++;
    if (this.view) this.camera = this.view.camera();
    this.stopRoutePreview();
    this.view?.destroy();
    this.view = undefined;
    this.resize?.disconnect();
    this.root = root || undefined;
    if (!root) return;
    const revision = this.revision;
    // Both apps find the phone first, so the map opens where the person is, not at the last
    // position the server knows. For a captain this is the location prompt after approval.
    if (!this.locationRequested) {
      this.locationRequested = true;
      void this.locate();
    }
    root
      .parentElement!.querySelectorAll(
        ".mini-car,.map-pin,.map-bubble,.radar-pulse-wrap",
      )
      .forEach((el) => el.remove());
    const mapControls = root.parentElement!.querySelector(".map-controls");
    if (mapControls) {
      for (const [attribute, label, path] of [
        [
          "data-follow",
          "Follow me",
          "M12 2v4m0 12v4M2 12h4m12 0h4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10",
        ],
        [
          "data-route-fit",
          "Show full route",
          "M3 9V3h6m6 0h6v6m0 6v6h-6M9 21H3v-6",
        ],
      ]) {
        if (!mapControls.querySelector(`[${attribute}]`)) {
          const control = document.createElement("button");
          control.className = "icon-button";
          control.setAttribute(attribute, "");
          control.setAttribute("aria-label", label);
          control.title = label;
          if (attribute === "data-follow")
            control.setAttribute("aria-pressed", String(this.following));
          control.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="${path}"/></svg>`;
          mapControls.append(control);
        }
      }
    }
    if (this.role === "captain") {
      const controls = root.parentElement!.querySelector(".map-controls");
      if (controls && !controls.querySelector("[data-live-gps]")) {
        const button = document.createElement("button");
        button.className = "icon-button";
        button.dataset.liveGps = "true";
        button.setAttribute("aria-label", "Start or stop live GPS sharing");
        button.title = "Start or stop live GPS sharing";
        button.innerHTML =
          '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>';
        controls.append(button);
      }
    }
    root.replaceChildren();
    root.removeAttribute("role");
    root.setAttribute("aria-label", "Live street map");
    this.canvas = document.createElement("div");
    this.canvas.className = "hop-map-canvas";
    root.append(this.canvas);
    this.status = document.createElement("div");
    this.status.className = "hop-map-status";
    this.status.setAttribute("role", "status");
    root.append(this.status);
    this.label();
    this.resize = new ResizeObserver(this.size);
    this.resize.observe(root.parentElement!);
    const sheet = root.parentElement!.querySelector(".sheet");
    if (sheet) this.resize.observe(sheet);
    this.size();
    // Android builds with a Maps SDK key use the native Google map: free per load, unlike the
    // web map. If it fails to start or its tiles never load (e.g. the key is rejected), the app
    // falls back to OpenStreetMap. VITE_MAP_PROVIDER=osm skips Google here too.
    const osmOnly = /^(osm|openstreetmap)$/i.test(import.meta.env.VITE_MAP_PROVIDER || "");
    if (Capacitor.getPlatform() === "android" && nativeMapsEnabled() && !osmOnly) {
      this.view = new NativeMapView(this.canvas, this.camera?.center || this.current || this.display().center, () => {
        void this.fallback(revision);
      });
      this.provider = "Google Maps";
      this.alternativesKey = "";
      this.view.setPreferences(this.preferences);
      this.decoratePreferences();
      this.paint();
      const planned = this.planned?.route || [this.planned?.pickup!, this.planned?.dropoff!].filter(Boolean);
      if (this.camera) this.view.restore(this.camera);
      else if (planned.length > 1) this.view.fit(planned);
      else if (planned.length === 1) this.view.center(planned[0]);
      this.label();
      if (this.isConfirmScreen()) this.startRoutePreview(true);
      return;
    }
    // VITE_MAP_PROVIDER=osm selects OpenStreetMap directly instead of trying Google first.
    if (osmOnly) {
      await this.fallback(revision);
      return;
    }
    try {
      await loadGoogle(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "");
      if (revision !== this.revision) return;
      this.view = new GoogleMapView(this.canvas, this.camera?.center || this.current || this.display().center, () => {
        void this.fallback(revision);
      });
      this.provider = "Google Maps";
      this.alternativesKey = "";
      this.view.setPreferences(this.preferences);
      this.decoratePreferences();
      this.paint();
      const points =
        this.planned?.route ||
        [this.planned?.pickup!, this.planned?.dropoff!].filter(Boolean);
      if (this.camera) this.view.restore(this.camera);
      else if (points.length > 1) this.view.fit(points);
      else if (points.length === 1) this.view.center(points[0]);
      this.label();
      if (this.isConfirmScreen()) {
        this.startRoutePreview(true);
      } else {
        this.stopRoutePreview();
      }
    } catch {
      await this.fallback(revision);
    }
  }

  private async fallback(revision: number) {
    if (
      revision !== this.revision ||
      !this.canvas ||
      (this.provider === "OpenStreetMap" && this.view)
    )
      return;
    this.view?.destroy();
    this.canvas.replaceChildren();
    this.view = new OSMMapView(
      this.canvas,
      this.camera?.center || this.current || this.display().center,
      (message) => {
        this.message = message;
        this.label();
      },
    );
    this.provider = "OpenStreetMap";
    this.alternativesKey = "";
    this.preferences.traffic = false; this.preferences.satellite = false;
    this.view.setPreferences(this.preferences);
    this.decoratePreferences();
    this.paint();
    const points =
      this.planned?.route ||
      [this.planned?.pickup!, this.planned?.dropoff!].filter(Boolean);
    if (this.camera) this.view.restore(this.camera);
    else if (points.length > 1) this.view.fit(points);
    else if (points.length === 1) this.view.center(points[0]);
    this.label();
    if (this.isConfirmScreen()) {
      this.startRoutePreview(true);
    } else {
      this.stopRoutePreview();
    }
  }

  private startRoutePreview(force = false) {
    if (!this.isConfirmScreen() || !this.view) {
      this.stopRoutePreview();
      return;
    }
    const route = this.planned?.route;
    if (!route || route.length < 2) {
      this.stopRoutePreview();
      return;
    }

    const routeKey = JSON.stringify([
      this.planned?.pickup,
      this.planned?.dropoff,
      route.length,
    ]);
    if (
      !force &&
      this.previewActiveRoute === routeKey &&
      (this.routePreview?.isRunning() || this.previewCompleted)
    ) {
      return;
    }

    this.previewActiveRoute = routeKey;
    this.previewCompleted = false;
    this.previewCameraFollow = true;

    // 1. Initial overview framing
    this.view.fit(route);
    this.renderPreviewBadge(true);

    this.routePreview?.stop();
    this.routePreview = new RoutePreviewController(route, {
      onProgress: (subRoute, vehiclePos, heading) => {
        this.view?.setRouteProgress?.(subRoute);
        this.view?.setPreviewVehicle?.(vehiclePos, heading, this.selectedVehicle());
      },
      onCamera: (pos) => {
        if (this.previewCameraFollow) {
          this.view?.center(pos);
        }
      },
      onComplete: () => {
        this.previewCompleted = true;
        this.renderPreviewBadge(false);
        if (this.previewCameraFollow && route) {
          this.view?.fit(route);
        }
        this.view?.pulseDestination?.(true);
        setTimeout(() => {
          if (this.previewCompleted) {
            this.view?.setPreviewVehicle?.(null);
            this.view?.pulseDestination?.(false);
          }
        }, 2200);
      },
    });

    this.routePreview.start();
  }

  private stopRoutePreview() {
    this.routePreview?.stop();
    this.routePreview = undefined;
    this.previewActiveRoute = "";
    this.previewCompleted = false;
    this.view?.setPreviewVehicle?.(null);
    this.view?.pulseDestination?.(false);
    this.previewBadge?.remove();
    this.previewBadge = undefined;
    if (this.planned?.route && this.view) {
      this.view.setRouteProgress?.(this.planned.route);
    }
  }

  private renderPreviewBadge(animating: boolean) {
    if (!this.root || !this.isConfirmScreen()) {
      this.previewBadge?.remove();
      this.previewBadge = undefined;
      return;
    }
    if (!this.previewBadge) {
      this.previewBadge = document.createElement("button");
      this.previewBadge.type = "button";
      this.previewBadge.className = "route-preview-badge";
      this.root.append(this.previewBadge);
    }
    this.previewBadge.className = `route-preview-badge ${animating ? "animating" : ""}`;
    if (animating) {
      this.previewBadge.dataset.action = "skip-preview";
      this.previewBadge.setAttribute(
        "aria-label",
        "Skip route preview animation",
      );
      this.previewBadge.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg><span>Skip</span>`;
    } else {
      this.previewBadge.dataset.action = "replay-preview";
      this.previewBadge.setAttribute(
        "aria-label",
        "Replay route preview animation",
      );
      this.previewBadge.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px"><path d="M1 4v6h6"></path><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg><span class="sr-only">Replay route</span>`;
    }
  }

  destroy() {
    this.stopRoutePreview();
    this.revision++;
    this.locationGeneration++;
    this.locationStop?.();
    window.removeEventListener("hop-planned-route", this.plan);
    window.removeEventListener("hop-map-drag", this.dragged);
    window.removeEventListener("hop-pin-edit", this.pinEdit);
    window.removeEventListener("hop-captain-online", this.captainOnline);
    window.removeEventListener("hop-current-location", this.located);
    this.feed.stop();
    this.tracking.stop();
    this.rideCheck.stop();
    this.observer.disconnect();
    this.resize?.disconnect();
    this.view?.destroy();
    this.app.removeEventListener("click", this.click, true);
    window.removeEventListener("hop-map-auth-failed", this.authFailure);
  }
}
