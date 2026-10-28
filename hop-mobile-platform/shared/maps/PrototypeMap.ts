import { GoogleMapView, loadGoogle } from "./google";
import { OSMMapView } from "./osm";
import { LiveFeed } from "./liveFeed";
import { watchLocation } from "./locationWatch";
import type { Coordinate, MapData, MapView } from "./types";
import { api } from "../services/client";
import { ForegroundTracking } from "./foregroundTracking";
import { currentLocation } from "../platform/transport";

/** Replaces only the sample map canvas. The approved surrounding UI is untouched. */
export class PrototypeMap {
  private view?: MapView;
  private canvas?: HTMLElement;
  private status?: HTMLElement;
  private root?: HTMLElement;
  private provider = "";
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
  private display() {
    return {
      ...(this.data.pickup
        ? this.data
        : { ...this.data, ...this.planned, vehicles: this.data.vehicles }),
      current: this.current,
    };
  }
  private paint() {
    this.view?.update(this.display());
    if (this.following && this.current) this.view?.center(this.current);
  }
  private plan = (event: Event) => {
    this.planned = (event as CustomEvent<MapData>).detail;
    this.paint();
    const points =
      this.planned.route ||
      [this.planned.pickup!, this.planned.dropoff!].filter(Boolean);
    if (points.length) this.view?.fit(points);
    else this.view?.center(this.planned.center);
  };
  private dragged = () => {
    this.following = false;
    this.app
      .querySelector("[data-follow]")
      ?.setAttribute("aria-pressed", "false");
  };
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
        this.paint();
        if (!this.centered && (data.pickup || data.vehicles.length)) {
          this.view?.center(data.center);
          this.centered = true;
        }
        this.label();
      },
      (online) => {
        if (this.role !== "captain") return;
        if (!online) this.tracking.stop();
        const pill = this.app.querySelector<HTMLElement>(".online-pill");
        if (pill) {
          pill.classList.toggle("online", online);
          pill.innerHTML = `<i></i>${online ? "You’re online" : "You’re offline"}`;
        }
        const button = this.app.querySelector<HTMLElement>(
          '[data-action="online"]',
        );
        if (button?.firstChild)
          button.firstChild.textContent = online
            ? "Take a break · Go offline"
            : "Go online";
      },
    );
    this.observer = new MutationObserver(() => void this.attach());
    this.observer.observe(app, { childList: true });
    app.addEventListener("click", this.click, true);
    window.addEventListener("hop-map-auth-failed", this.authFailure);
    window.addEventListener("hop-planned-route", this.plan);
    window.addEventListener("hop-map-drag", this.dragged);
    void this.attach();
    void this.feed.start();
  }
  private click = (event: Event) => {
    const control = (event.target as Element)?.closest<HTMLElement>(
      "[data-follow],[data-route-fit]",
    );
    if (control) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (control.hasAttribute("data-route-fit")) {
        this.dragged();
        const data = this.display();
        this.view?.fit(
          data.route || [data.pickup!, data.dropoff!].filter(Boolean),
        );
        return;
      }
      this.following = !this.following;
      control.setAttribute("aria-pressed", String(this.following));
      if (this.following) {
        const generation = ++this.locationGeneration;
        this.locationStop?.();
        void watchLocation(
          (point) => {
            if (generation !== this.locationGeneration) return;
            this.current = point;
            this.feed.setLocation(point);
            this.paint();
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
        await api.online(next);
        if (!next) this.tracking.stop();
        this.message = next
          ? "Online · tap GPS sharing to send your location"
          : "You’re offline · GPS sharing stopped";
        this.label();
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
        const point = { lat: coords.latitude, lng: coords.longitude };
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
    if (this.status)
      this.status.textContent = `${this.provider || "Loading map"} · ${this.message}`;
  }
  private size = () => {
    if (!this.root || !this.canvas) return;
    const body = this.root.parentElement!,
      sheet = body.querySelector<HTMLElement>(".sheet");
    const top = body.getBoundingClientRect().top;
    // Keep provider attribution above the approved sheet instead of hiding it underneath.
    const height = sheet
      ? Math.max(100, sheet.getBoundingClientRect().top - top)
      : body.clientHeight;
    this.canvas.style.height = `${height}px`;
    body
      .querySelector(".map-controls")
      ?.classList.toggle("hop-compact-controls", height < 230);
  };
  private async attach() {
    const root = this.app.querySelector<HTMLElement>(".map-art");
    if (root === this.root) return;
    this.revision++;
    this.view?.destroy();
    this.view = undefined;
    this.resize?.disconnect();
    this.root = root || undefined;
    if (!root) return;
    const revision = this.revision;
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
    try {
      await loadGoogle(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "");
      if (revision !== this.revision) return;
      this.view = new GoogleMapView(this.canvas, this.display().center, () => {
        void this.fallback(revision);
      });
      this.provider = "Google Maps";
      this.paint();
      if (this.planned?.route) this.view.fit(this.planned.route);
      this.label();
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
      this.display().center,
      (message) => {
        this.message = message;
        this.label();
      },
    );
    this.provider = "OpenStreetMap";
    this.paint();
    if (this.planned?.route) this.view.fit(this.planned.route);
    this.label();
  }
  destroy() {
    this.revision++;
    this.locationGeneration++;
    this.locationStop?.();
    window.removeEventListener("hop-planned-route", this.plan);
    window.removeEventListener("hop-map-drag", this.dragged);
    this.feed.stop();
    this.tracking.stop();
    this.observer.disconnect();
    this.resize?.disconnect();
    this.view?.destroy();
    this.app.removeEventListener("click", this.click, true);
    window.removeEventListener("hop-map-auth-failed", this.authFailure);
  }
}
