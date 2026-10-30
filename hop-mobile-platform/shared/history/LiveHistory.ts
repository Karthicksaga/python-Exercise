import { downloadBase64 } from "../platform/download";
import { api } from "../services/client";
import { escape, money } from "../helpers";
import { icon } from "../icons";
import type { Ride, ScheduledRide, State } from "../services/contracts";
import type { OnboardingBridge as Bridge } from "../onboarding/CaptainOnboarding";
const active = (r: Ride) =>
  ["requested", "accepted", "arrived", "in_progress"].includes(r.status);
const date = (value?: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString("en-IN")
    : "Time unavailable";
export class LiveHistory {
  private lastHost?: Element;
  private lastContent = "";
  private tab = "Ongoing";
  private page = 0;
  private scheduled?: ScheduledRide[];
  private error = "";
  private loading = false;
  private busy = false;
  private report?: Ride;
  private reportDraft = "";
  private input = (e: Event) => {
    const field = e.target as HTMLTextAreaElement;
    if (field.id === "history-report") this.reportDraft = field.value;
  };
  private cancel?: Ride;
  constructor(
    private app: HTMLElement,
    private role: "rider" | "captain",
    private bridge: Bridge,
    private state: () => State | undefined,
    private refresh: () => Promise<void>,
    private rebook: (r: Ride) => Promise<void>,
    private pay: (r: Ride) => void,
  ) {
    app.addEventListener("input", this.input, true);
    app.addEventListener("click", this.click, true);
    app.addEventListener("keydown", this.keydown, true);
  }
  destroy() {
    this.app.removeEventListener("input", this.input, true);
    this.app.removeEventListener("click", this.click, true);
    this.app.removeEventListener("keydown", this.keydown, true);
  }
  render() {
    if (this.bridge.read().screen !== "activity") return;
    const host = this.app.querySelector(".screen-padding");
    if (!host) return;
    const rides = (this.state()?.rides || []).filter((r) =>
      this.role === "rider" ? r.mine : r.driving,
    );
    if (
      this.tab === "Upcoming" &&
      this.scheduled === undefined &&
      !this.loading &&
      !this.error
    )
      void this.loadSchedules();
    const items =
      this.tab === "Upcoming"
        ? (this.scheduled || []).filter((r) => r.status === "scheduled")
        : rides.filter((r) =>
            this.tab === "Ongoing" ? active(r) : !active(r),
          );
    const cards = items
      .slice(this.page * 10, this.page * 10 + 10)
      .map((r) => {
        if (this.tab === "Upcoming") {
          const s = r as ScheduledRide;
          return `<article class="activity-card"><div class="row"><strong>${escape(s.category)}</strong><span class="badge neutral">${escape(s.status)}</span></div><p>${escape(s.pickup_label)} → ${escape(s.dropoff_label)}</p><p class="small muted">${escape(date(s.scheduled_for))}</p><button class="secondary" data-history-cancel-schedule="${escape(s.id)}">Cancel scheduled ride</button></article>`;
        }
        const ride = r as Ride;
        return `<article class="activity-card"><div class="row"><span class="badge neutral">${escape(ride.status)}</span><strong>${money((ride.payable_paise ?? ride.fare_paise) / 100)}</strong></div><p class="small muted">${escape(date(ride.created_at))} · ${escape(ride.vehicle_category)} · ${escape(ride.trip_type || "city")}</p><div class="route-line"><i class="location-dot"></i><strong>${escape(ride.pickup_label)}</strong></div><div class="route-line"><i class="location-dot destination"></i><strong>${escape(ride.dropoff_label)}</strong></div>${ride.driver_name ? `<p class="small">Captain: ${escape(ride.driver_name)} · ${escape(ride.vehicle_number || "")}</p>` : ""}<div class="product-row">${active(ride) ? `<button class="secondary" data-history-track="${escape(ride.id)}">Track ride</button>${ride.mine ? `<button class="text-button" data-history-cancel="${escape(ride.id)}">Cancel ride</button>` : ""}` : this.role === "rider" ? `<button class="secondary" data-history-rebook="${escape(ride.id)}">Book again</button>` : ""}${["in_progress", "completed"].includes(ride.status) ? `<button class="text-button" data-history-pay="${escape(ride.id)}">Payment & receipt</button>` : ""}<button class="text-button" data-history-report="${escape(ride.id)}">Report an issue</button>${ride.status === "completed" ? `<button class="text-button" data-history-receipt="${escape(ride.id)}">Download statement</button>` : ""}</div></article>`;
      })
      .join("");
    const content = `<div class="tabs" role="tablist" aria-label="Ride history">${["Ongoing", ...(this.role === "rider" ? ["Upcoming"] : []), "Past"].map((t) => `<button role="tab" aria-selected="${t === this.tab}" data-history-tab="${t}" class="${t === this.tab ? "active" : ""}">${t}</button>`).join("")}</div>${this.error ? `<div role="alert" class="notice-box">${escape(this.error)}<button class="text-button" data-history-retry>Retry</button></div>` : ""}${this.loading ? '<p role="status">Loading upcoming rides…</p>' : cards || `<div class="empty-state"><h2>${this.tab === "Ongoing" ? "No active rides" : this.tab === "Upcoming" ? "No upcoming rides" : "No past rides"}</h2><button class="primary" data-history-book>Book a ride</button>${this.tab !== "Past" ? '<button class="text-button" data-history-tab="Past">View past rides</button>' : ""}</div>`}${items.length > 10 ? `<div class="row" style="margin-top:14px"><button class="secondary" data-history-page="-1" ${this.page === 0 ? "disabled" : ""}>Previous</button><span>Page ${this.page + 1} of ${Math.ceil(items.length / 10)}</span><button class="secondary" data-history-page="1" ${(this.page + 1) * 10 >= items.length ? "disabled" : ""}>Next</button></div>` : ""}<p class="micro muted" style="margin:12px 0 16px">Latest 50 participant trips supplied by the server. Older archive search is not available.</p>${this.role === "rider" && this.tab === "Past" ? `<div class="section-card" style="margin-top:16px;background:#f9faf7"><div class="row" style="align-items:center"><div style="display:flex;align-items:center;gap:12px"><span class="list-icon" style="background:var(--accent-soft);color:var(--accent);border-radius:10px;padding:8px">${icon("help")}</span><div><strong style="font-size:13px;display:block">Need help with a trip?</strong><small class="muted">Lost items, receipts, or fare inquiries</small></div></div><button class="text-button" data-go="support" style="font-weight:700;font-size:12px;color:var(--accent);min-height:44px;padding:8px 12px">Help →</button></div></div>` : ""}${this.report ? `<div class="section-card"><label class="field-label" for="history-report">Issue for ${escape(this.report.pickup_label)} → ${escape(this.report.dropoff_label)}</label><textarea class="text-input" id="history-report" maxlength="2000">${escape(this.reportDraft)}</textarea><button class="primary" data-history-send-report>Submit report</button><button class="text-button" data-history-dismiss>Close</button></div>` : ""}${this.cancel ? `<div class="notice-box"><p>Cancel this ride? The server applies the cancellation policy.</p><button class="primary" data-history-confirm-cancel>Confirm cancellation</button><button class="secondary" data-history-dismiss>Keep ride</button></div>` : ""}`;
    if (this.lastHost !== host || this.lastContent !== content) {
      host.innerHTML = content;
      this.lastHost = host;
      this.lastContent = content;
    }
  }
  private async loadSchedules() {
    this.loading = true;
    try {
      this.scheduled =
        (
          await api.request<{ scheduled_rides: ScheduledRide[] }>(
            "/api/companion",
          )
        ).scheduled_rides || [];
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.loading = false;
      this.render();
    }
  }
  private keydown = (event: KeyboardEvent) => {
    const target = (event.target as Element).closest<HTMLElement>(
      '[role="tab"][data-history-tab]',
    );
    if (
      !target ||
      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    )
      return;
    event.preventDefault();
    const tabs = Array.from(
      this.app.querySelectorAll<HTMLElement>('[role="tab"][data-history-tab]'),
    );
    const index = tabs.indexOf(target),
      next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
              tabs.length;
    this.tab = tabs[next].dataset.historyTab!;
    this.page = 0;
    this.render();
    this.app
      .querySelector<HTMLElement>(
        `[role="tab"][data-history-tab="${this.tab}"]`,
      )
      ?.focus();
  };
  private click = (e: Event) => {
    if (this.bridge.read().screen !== "activity") return;
    const b = (e.target as Element).closest<HTMLElement>("button");
    if (!b || !Object.keys(b.dataset).some((k) => k.startsWith("history")))
      return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (this.busy) return;
    const d = b.dataset;
    if (d.historyTab) {
      this.tab = d.historyTab;
      this.page = 0;
      this.report = undefined;
      this.cancel = undefined;
      this.render();
      return;
    }
    if (d.historyPage) {
      this.page = Math.max(0, this.page + Number(d.historyPage));
      this.render();
      return;
    }
    if (b.hasAttribute("data-history-dismiss")) {
      this.report = undefined;
      this.cancel = undefined;
      this.render();
      return;
    }
    const ride = (id?: string) => {
      const r = this.state()?.rides.find(
        (r) => r.id === id && (this.role === "rider" ? r.mine : r.driving),
      );
      if (!r) throw new Error("This trip is no longer available.");
      return r;
    };
    const message = this.app
      .querySelector<HTMLTextAreaElement>("#history-report")
      ?.value.trim();
    this.busy = true;
    this.error = "";
    void (async () => {
      if (b.hasAttribute("data-history-retry")) {
        await this.refresh();
        this.scheduled = undefined;
      } else if (b.hasAttribute("data-history-book"))
        this.bridge.go(this.role === "rider" ? "search" : "drive");
      else if (d.historyTrack) {
        const r = ride(d.historyTrack);
        this.bridge.go(
          this.role === "captain"
            ? r.status === "in_progress"
              ? "trip"
              : "pickup"
            : r.status === "requested"
              ? "matching"
              : "tracking",
        );
      } else if (d.historyRebook) await this.rebook(ride(d.historyRebook));
      else if (d.historyPay) this.pay(ride(d.historyPay));
      else if (d.historyReport) this.report = ride(d.historyReport);
      else if (d.historyCancel) this.cancel = ride(d.historyCancel);
      else if (b.hasAttribute("data-history-confirm-cancel")) {
        const r = ride(this.cancel?.id);
        await api.action(r.id, r.version, "cancel", {
          reason: "Plans changed",
        });
        this.cancel = undefined;
        await this.refresh();
      } else if (b.hasAttribute("data-history-send-report")) {
        if (!message || !this.report)
          throw new Error("Describe the issue before submitting.");
        await api.request("/api/incidents", {
          ride_id: this.report.id,
          message,
        });
        this.report = undefined;
        this.bridge.notify("Report submitted to the operator.");
      } else if (d.historyCancelSchedule) {
        await api.request(
          `/api/scheduled-rides/${encodeURIComponent(d.historyCancelSchedule)}/cancel`,
          {},
        );
        await this.loadSchedules();
      } else if (d.historyReceipt) {
        const r = ride(d.historyReceipt);
        const receipt = await api.request<{ pdf: string; filename: string }>(
          `/api/rides/${encodeURIComponent(r.id)}/receipt`,
        );
        if (!receipt.pdf) throw new Error("Statement unavailable.");
        await downloadBase64(
          receipt.pdf,
          receipt.filename || "hop-trip-statement.pdf",
          "application/pdf",
        );
      }
    })()
      .catch((e) => {
        this.error = (e as Error).message;
      })
      .finally(() => {
        this.busy = false;
        this.render();
      });
  };
}
