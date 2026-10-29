import { downloadJSON } from "../platform/download";
import { checkout, type Order } from "../payments/checkout";
import { api } from "../services/client";
import { escape, money } from "../helpers";
import type { State, Config } from "../services/contracts";
import type { OnboardingBridge as Bridge } from "../onboarding/CaptainOnboarding";
type Data = Record<string, any>;
export class LiveAccount {
  private drafts = new Map<string, { value: string; checked: boolean }>();
  private input = (e: Event) => {
    const el = e.target as HTMLInputElement;
    if (!el.id.startsWith("account-")) return;
    const ui = this.bridge.read();
    this.drafts.set(`${ui.modal || ui.screen}:${el.id}`, {
      value: el.value,
      checked: el.checked,
    });
  };
  private generation = 0;
  private cache = new Map<string, Data>();
  private loading = new Set<string>();
  private errors = new Map<string, string>();
  private busy = false;
  private selectedRide?: string;
  private status = "";
  private phoneSent = false;
  private otpRetryAt = 0;
  private shareURL = "";
  private photo = "";
  constructor(
    private app: HTMLElement,
    private role: "rider" | "captain",
    private bridge: Bridge,
    private state: () => State | undefined,
    private config: () => Config | undefined,
    private refresh: () => Promise<void>,
  ) {
    app.addEventListener("input", this.input, true);
    app.addEventListener("click", this.click, true);
    app.addEventListener("change", this.change, true);
  }
  destroy() {
    this.app.removeEventListener("input", this.input, true);
    this.app.removeEventListener("click", this.click, true);
    this.app.removeEventListener("change", this.change, true);
  }
  clear() {
    this.generation++;
    this.drafts.clear();
    this.cache.clear();
    this.errors.clear();
    this.shareURL = "";
    this.photo = "";
    this.selectedRide = undefined;
    this.phoneSent = false;
  }
  private field(
    key: string,
    label: string,
    value: unknown = "",
    type = "text",
  ) {
    return `<label class="field-label" for="account-${key}">${label}</label><input class="text-input" id="account-${key}" type="${type}" value="${escape(value)}"/>`;
  }
  private action(id: string, label: string) {
    return `<button class="secondary" data-account-action="${id}" ${this.busy ? "disabled" : ""}>${label}</button>`;
  }
  private select(key: string, label: string, items: string[], value: string) {
    return `<label class="field-label" for="account-${key}">${label}</label><select class="text-input" id="account-${key}">${items.map((v) => `<option ${value === v ? "selected" : ""}>${escape(v)}</option>`).join("")}</select>`;
  }
  private async load(path: string) {
    if (this.loading.has(path)) return;
    this.loading.add(path);
    const generation = this.generation;
    try {
      const result = await api.request<Data>(path);
      if (path === "/api/profile" && !Array.isArray(result.details))
        throw new Error("Profile data is unavailable.");
      if (path === "/api/drivers/earnings" && !result.summary)
        throw new Error("Earnings data is unavailable.");
      if (
        ["/api/wallet", "/api/drivers/wallet"].includes(path) &&
        !Number.isSafeInteger(result.balance_paise)
      )
        throw new Error("Wallet balance is unavailable.");
      if (generation !== this.generation) return;
      this.cache.set(path, result);
      this.errors.delete(path);
    } catch (e) {
      this.errors.set(path, (e as Error).message);
    } finally {
      this.loading.delete(path);
      this.render(true);
    }
  }
  private get(path: string) {
    if (
      !this.cache.has(path) &&
      !this.loading.has(path) &&
      !this.errors.has(path)
    )
      void this.load(path);
    return this.cache.get(path);
  }
  private active() {
    return this.state()?.rides.find(
      (r) =>
        (this.role === "rider" ? r.mine : r.driving) &&
        ["accepted", "arrived", "in_progress", "requested"].includes(r.status),
    );
  }
  private trip() {
    const r =
      this.state()?.rides.find((r) => r.id === this.selectedRide) ||
      this.active();
    if (!r) throw new Error("Select a trip in My rides first.");
    return r;
  }
  render(force = false) {
    const ui = this.bridge.read(),
      screen = ui.screen,
      modal = ui.modal;
    const screenPaths: Record<string, string> = {
      personal: "/api/profile",
      preferences: "/api/companion",
      earnings: "/api/drivers/earnings",
      ledger: this.role === "captain" ? "/api/drivers/wallet" : "/api/wallet",
      wallet: "/api/wallet",
      rewards: "/api/companion",
      family: "/api/companion",
      saved: "state",
      vehicle: "driver",
      safety: "safety",
      support: "support",
      demand: "/api/drivers/demand",
      insights: "/api/drivers/insights",
      tools: "/api/drivers/earnings",
    };
    const modalPaths: Record<string, string> = {
      business: "/api/profile",
      verify: "/api/profile",
      contacts: "/api/profile",
      goal: "driver",
      payout: "/api/drivers/wallet",
      share: "trip",
      sos: "trip",
      report: "trip",
      "lost-item": "trip",
      counter: "trip",
      bids: "trip",
      export: "export",
      "delete-account": "/api/profile",
      "family-invite": "/api/companion",
      referral: "/api/companion",
    };
    if (!modal && this.role === "captain" && screen === "drive") {
      const earnings = this.get("/api/drivers/earnings")?.summary;
      const mini = this.app.querySelector(".earnings-mini strong");
      if (mini)
        mini.textContent = earnings
          ? money(earnings.today_fare_paise / 100)
          : "—";
      const rows = this.app.querySelectorAll(".sheet .row");
      rows.forEach((row) => {
        if (row.textContent?.includes("Daily goal")) {
          const amount = row.querySelector("strong");
          if (amount)
            amount.textContent = earnings
              ? `${money(earnings.today_fare_paise / 100)} / ${money(((this.state()?.driver?.[0] as Data)?.daily_goal_paise || 0) / 100)}`
              : "Loading earnings…";
        }
      });
      this.app
        .querySelectorAll(".sheet .progress-track i")
        .forEach((el) => ((el as HTMLElement).style.width = "0%"));
      const trips = this.app.querySelector(".sheet .row.small > .muted");
      if (trips)
        trips.textContent = earnings
          ? `${earnings.today_completed_trips} trips today`
          : "Loading trips…";
    }
    if (!modal && screen === "account") {
      const p = this.get("/api/profile")?.details?.[0];
      if (!p) {
        const hero = this.app.querySelector(".account-hero");
        const title = hero?.querySelector("h2"),
          sub = hero?.querySelector("p");
        if (title)
          title.textContent = this.errors.has("/api/profile")
            ? "Profile unavailable"
            : "Loading profile…";
        if (sub)
          sub.textContent =
            this.errors.get("/api/profile") || "Connecting to your account";
      }
      if (p) {
        const hero = this.app.querySelector(".account-hero");
        if (hero) {
          const h = hero.querySelector("h2"),
            sub = hero.querySelector("p");
          if (h) h.textContent = p.name;
          if (sub)
            sub.textContent = p.phone_verified
              ? "Verified mobile account"
              : "Verify mobile ownership in Personal details";
        }
      }
      this.app
        .querySelectorAll(
          ".account-hero ~ .section-card p,.account-group small",
        )
        .forEach((el) => {
          if (
            el.textContent?.includes("State-wide") ||
            el.textContent?.includes("state-wide")
          )
            el.textContent = "Captain application and document approval";
        });
      return;
    }
    const path = modal ? modalPaths[modal] : screenPaths[screen];
    if (!path) return;
    const host = this.app.querySelector<HTMLElement>(
      modal ? ".modal-sheet" : ".screen-padding",
    );
    if (!host) return;
    const key = modal || screen;
    if (!force && host.dataset.liveAccount === key) return;
    host.dataset.liveAccount = key;
    const data = path.startsWith("/api") ? this.get(path) : {},
      p = data?.details?.[0] || {},
      driver = this.state()?.driver?.[0] as Data | undefined;
    let body = "";
    const btn = (a: string, l: string) => this.action(a, l);
    if (path.startsWith("/api") && !data)
      body = `<p role="status">${this.errors.has(path) ? escape(this.errors.get(path)) : "Loading account data…"}</p>${btn("retry", "Retry")}`;
    else if (key === "personal")
      body =
        this.field("name", "Full name", p.name) +
        `<p class="small">Mobile: ${escape(p.phone || "Not set")} · ${p.phone_verified ? "Verified" : "Unverified"}</p><button class="text-button" data-modal="verify">Verify mobile</button>` +
        this.select(
          "gender",
          "Gender",
          ["", "female", "male", "other", "undisclosed"],
          p.gender,
        ) +
        this.field("birth_date", "Date of birth", p.birth_date || "", "date") +
        this.select(
          "default_payment",
          "Default payment",
          ["cash", "upi", "wallet"],
          p.default_payment,
        ) +
        this.select(
          "default_vehicle",
          "Default vehicle",
          ["bike", "auto", "mini", "sedan", "suv"],
          p.default_vehicle,
        ) +
        btn("profile", "Save details") +
        `<label class="upload"><span>Profile photo<small>Choose a JPEG or PNG up to 12 MB. Preview before saving.</small></span><input aria-label="Profile photo" type="file" accept="image/jpeg,image/png" data-account-photo/></label>${this.photo ? `<img alt="Profile photo preview" src="data:image/jpeg;base64,${this.photo}" style="max-width:160px"/>${btn("photo", "Save profile photo")}` : ""}<button class="text-button" data-modal="business">Business receipt details</button>`;
    else if (key === "business")
      body =
        [
          ["company_name", "Company name"],
          ["business_gstin", "GSTIN (optional)"],
          ["cost_centre", "Cost centre"],
          ["work_email", "Work email"],
        ]
          .map(([k, l]) => this.field(k, l, p[k] || ""))
          .join("") + btn("business", "Save business details");
    else if (key === "verify")
      body =
        this.field("phone", "Mobile number", p.phone, "tel") +
        `<p>${p.phone_verified ? "Current mobile is verified." : "Verify ownership with an SMS code."}</p>` +
        btn("send-code", "Send verification code") +
        (this.phoneSent
          ? this.field("code", "6-digit verification code") +
            btn("verify-code", "Verify mobile")
          : "");
    else if (key === "contacts")
      body =
        (data?.contacts || [])
          .map(
            (c: Data) =>
              `<div class="list-row"><strong>${escape(c.name)}</strong><small>${escape(c.phone)}</small><button class="text-button" data-account-delete-contact="${escape(c.id)}">Remove</button></div>`,
          )
          .join("") +
        this.field("contact-name", "Contact name") +
        this.field("contact-phone", "Contact mobile", "", "tel") +
        this.field("relation", "Relationship") +
        btn("contact", "Save emergency contact");
    else if (key === "preferences") {
      const prefs = data?.preferences || {};
      body =
        this.select(
          "language",
          "Language",
          ["en", "hi", "ta", "te", "kn", "ml", "bn", "mr", "gu", "pa"],
          prefs.language || "en",
        ) +
        (
          [
            ["wheelchair_access", "Wheelchair access"],
            ["hearing_impaired", "Hearing assistance"],
            ["visually_impaired", "Low vision assistance"],
            ["extra_assistance", "Boarding assistance"],
            ["large_text", "Larger text"],
            ["notifications_enabled", "Trip notifications"],
          ] as string[][]
        )
          .map(
            ([k, l]) =>
              `<label class="toggle-row"><span>${l}</span><input type="checkbox" id="account-${k}" ${prefs[k] ? "checked" : ""}/></label>`,
          )
          .join("") +
        (this.role === "captain"
          ? this.field(
              "pickup_radius_meters",
              "Pickup radius (metres)",
              driver?.pickup_radius_meters || 3000,
              "number",
            ) +
            this.field(
              "minimum_fare",
              "Minimum fare (₹)",
              (driver?.minimum_fare_paise || 0) / 100,
              "number",
            )
          : "") +
        `<button class="text-button" data-modal="appearance">Appearance</button>` +
        btn("preferences", "Save preferences");
    } else if (key === "tools") {
      body = `<div class="section-card"><strong>Today's completed fares</strong><p>${money((data?.summary?.today_fare_paise || 0) / 100)}</p><button class="text-button" data-modal="goal">Edit daily goal</button></div><button class="toggle-row" data-action="home-mode"><span>Head towards home using my current location</span></button><button class="list-row" data-modal="service-area">Operating city</button><button class="list-row" data-go="demand">Demand nearby</button><button class="list-row" data-go="preferences">Pickup and fare preferences</button><button class="list-row" data-go="insights">Driving insights</button><button class="secondary" data-action="take-break">Go offline for a break</button>`;
    } else if (key === "earnings") {
      const sum = data?.summary || {};
      body = `<div class="wallet-hero"><small>TODAY'S COMPLETED FARES</small><div class="amount">${money((sum.today_fare_paise || 0) / 100)}</div><p>${Number(sum.today_completed_trips || 0)} completed trips</p></div><div class="section-card"><p>Week ${money((sum.week_fare_paise || 0) / 100)}</p><p>Month ${money((sum.month_fare_paise || 0) / 100)}</p><p>All time ${money((sum.all_time_fare_paise || 0) / 100)}</p><p class="micro">Reported receipt is distinct from provider settlement.</p></div>${(data?.rides || []).map((r: Data) => `<div class="list-row"><span>${escape(r.pickup_label)} → ${escape(r.dropoff_label)}</span><strong>${money(r.fare_paise / 100)}</strong></div>`).join("")}<button class="secondary" data-go="ledger">Ledger & payouts</button>`;
    } else if (key === "ledger" || key === "wallet") {
      body = `<div class="wallet-hero"><small>SERVER BALANCE</small><div class="amount">${money((data?.balance_paise || 0) / 100)}</div></div>${(data?.entries || data?.ledger || []).map((r: Data) => `<div class="list-row"><span>${escape(r.kind)}<small>${escape(r.note || "")} · ${escape(r.created_at || "")}</small></span><strong>${money(r.amount_paise / 100)}</strong></div>`).join("")}${this.role === "captain" ? `<button class="secondary" data-modal="payout">Request payout</button>${(data?.payouts || []).map((r: Data) => `<p>${money(r.amount_paise / 100)} · ${escape(r.status)} · ${escape(r.reference || "")}</p>`).join("")}` : this.field("topup-amount", "Add money (₹)", "", "number") + btn("topup", "Add money with provider checkout")}`;
    } else if (key === "payout")
      body =
        `<p>Available: ${money((data?.balance_paise || 0) / 100)} · Minimum: ${money((data?.min_payout_paise || 0) / 100)}</p>` +
        this.field("payout-amount", "Payout amount (₹)", "", "number") +
        `<p>Registered UPI: ${escape(data?.upi_id || "Not set")}. Operator processing is required.</p>` +
        btn("payout", "Submit payout request");
    else if (key === "goal")
      body =
        this.field(
          "goal",
          "Daily earnings goal (₹)",
          (driver?.daily_goal_paise || 0) / 100,
          "number",
        ) + btn("goal", "Save goal");
    else if (key === "vehicle")
      body = `<div class="section-card"><p>Captain status: ${escape(driver?.status || "Not applied")}</p><p>${escape(driver?.vehicle_number || "")} · ${escape(driver?.vehicle_make || "")} ${escape(driver?.vehicle_model || "")}</p><p>Licence expiry: ${escape(driver?.license_expires?.slice(0, 10) || "Not supplied")}</p><p>Insurance expiry: ${escape(driver?.insurance_expires?.slice(0, 10) || "Not supplied")}</p></div><button class="primary" data-go="onboarding">View application & private documents</button><p class="micro">Approved vehicle changes require operator review.</p>`;
    else if (key === "rewards")
      body = `<div class="wallet-hero"><small>REWARD POINTS</small><div class="amount">${Number(data?.referral?.[0]?.points || 0)}</div></div><p>Referral code: ${escape(data?.referral?.[0]?.code || "Unavailable")}</p><button class="secondary" data-modal="referral">Redeem a friend's code</button>${(data?.rewards || []).map((r: Data) => `<p>${Number(r.points)} · ${escape(r.reason)}</p>`).join("")}`;
    else if (key === "referral")
      body =
        this.field("referral", "Referral code") +
        btn("referral", "Redeem code");
    else if (key === "family")
      body =
        (data?.family || [])
          .map(
            (m: Data) =>
              `<div class="section-card"><strong>${escape(m.name)}</strong><p>${escape(m.status)}</p>${m.status === "pending" && m.role === "member" ? `<button class="secondary" data-account-family-accept="${escape(m.id)}">Accept invitation</button>` : ""}<button class="text-button" data-account-family-delete="${escape(m.id)}">Remove</button></div>`,
          )
          .join("") +
        `<button class="secondary" data-modal="family-invite">Invite family member</button><div class="section-label">Favourite captains</div>` +
        (data?.favorite_drivers || [])
          .map(
            (f: Data) =>
              `<div class="list-row"><strong>${escape(f.name)}</strong><span>${escape(f.vehicle_number)}</span><button class="text-button" data-account-favorite-delete="${escape(f.id)}">Remove</button></div>`,
          )
          .join("");
    else if (key === "family-invite")
      body =
        this.field("family-email", "Family member email", "", "email") +
        btn("family", "Send invitation");
    else if (key === "saved")
      body =
        (this.state()?.saved_locations || [])
          .map(
            (p: Data) =>
              `<div class="list-row"><strong>${escape(p.label)}</strong><small>${escape(p.place_label || "")}</small><button class="text-button" data-account-location-delete="${escape(p.id)}">Remove</button></div>`,
          )
          .join("") +
        `<p class="notice-box">Choose a real address on the booking search before saving it.</p>` +
        this.field("location-kind", "Kind (home/work/favorite)", "favorite") +
        this.field("location-label", "Place label") +
        btn("save-location", "Save selected destination");
    else if (key === "safety")
      body = `<div class="safety-hero"><h2>A little peace of mind.</h2><p>Safety actions stay linked to your real trip.</p></div><div class="quick-grid"><button class="quick-tile" data-modal="sos">Emergency help</button><button class="quick-tile" data-modal="share">Share your trip</button></div><button class="list-row" data-modal="contacts">Emergency contacts</button><button class="list-row" data-modal="report">Report a safety concern</button><p class="notice-box">An app SOS creates an operator incident. It does not contact emergency services. For immediate help, use your phone's emergency calling function.</p>`;
    else if (key === "support")
      body = `<p>Select a trip in My rides to report an issue, or report your current trip below.</p><button class="list-row" data-go="activity">My rides</button><button class="list-row" data-modal="report">Report an issue</button><button class="list-row" data-modal="lost-item">Report a lost item</button><p class="micro">Reports go to the operator. Live support chat is not provided by this backend.</p>`;
    else if (key === "sos")
      body =
        `<p>Send an SOS incident to the operator for your current assigned trip. This does not place an emergency call.</p>` +
        btn("sos", "Send SOS to operator");
    else if (key === "report" || key === "lost-item")
      body =
        `<label class="field-label" for="account-ride">Trip</label><select class="text-input" id="account-ride"><option value="">Current assigned trip</option>${(
          this.state()?.rides || []
        )
          .filter((r) => (this.role === "rider" ? r.mine : r.driving))
          .map(
            (r) =>
              `<option value="${escape(r.id)}" ${r.id === this.selectedRide ? "selected" : ""}>${escape(r.pickup_label)} → ${escape(r.dropoff_label)} · ${escape(r.status)}</option>`,
          )
          .join(
            "",
          )}</select><label class="field-label" for="account-report">Describe the ${key === "lost-item" ? "item" : "issue"}</label><textarea class="text-input" id="account-report" maxlength="2000"></textarea>` +
        btn(key, "Submit report");
    else if (key === "share")
      body =
        `<p>Generate a revocable, six-hour link for your assigned trip. Anyone with the link can view the permitted trip details.</p>${this.shareURL ? `<input class="text-input" aria-label="Trip share link" readonly value="${escape(this.shareURL)}"/>` : ""}` +
        btn("share", "Create share link") +
        btn("revoke-share", "Revoke trip links");
    else if (key === "bids")
      body =
        (this.active()?.bids || [])
          .map(
            (b) =>
              `<div class="driver-card"><strong>${escape(b.driver_name)}</strong><span>${money(b.amount_paise / 100)}</span><button class="primary" data-account-accept-bid="${escape(b.id)}">Accept offer</button></div>`,
          )
          .join("") || "<p>No current Captain offers.</p>";
    else if (key === "counter")
      body =
        this.field("counter", "Your fare offer (₹)", "", "number") +
        btn("counter", "Send fare offer");
    else if (key === "export")
      body =
        `<p>Download your private account data to this device.</p>` +
        btn("export", "Download my data");
    else if (key === "delete-account")
      body =
        `<p>${p.deletion_requested_at ? "Account deletion has been requested. You can cancel during the recovery window." : "Request account deletion after the backend recovery window. This is a real account action."}</p><label class="toggle-row"><span>I confirm this account deletion request</span><input type="checkbox" id="account-confirm-deletion"/></label>` +
        btn(
          p.deletion_requested_at ? "cancel-deletion" : "deletion",
          p.deletion_requested_at
            ? "Cancel deletion request"
            : "Request account deletion",
        );
    else if (key === "demand")
      body =
        (data?.cells || [])
          .map(
            (c: Data) =>
              `<div class="section-card"><p>${escape(c.lat)}, ${escape(c.lng)}</p><p>${Number(c.requests || 0)} requests · ${Number(c.drivers || 0)} online Captains</p></div>`,
          )
          .join("") || "<p>No current demand cells returned by the server.</p>";
    else if (key === "insights")
      body = `<p class="notice-box">Your driving insights are calculated by the backend.</p><dl>${Object.entries(
        data || {},
      )
        .filter(([, v]) => typeof v === "number")
        .map(
          ([k, v]) =>
            `<dt>${escape(k.replaceAll("_", " "))}</dt><dd>${Number(v)}</dd>`,
        )
        .join("")}</dl>`;
    host.innerHTML =
      (modal
        ? `<div class="sheet-handle"></div><div class="modal-title"><h2>${escape(key.replaceAll("-", " "))}</h2><button class="icon-button" aria-label="Close dialog" data-action="close-modal">×</button></div>`
        : "") +
      body +
      `<p role="status" class="small muted">${escape(this.status)}</p>`;
    for (const el of host.querySelectorAll<HTMLInputElement>(
      "[id^=account-]",
    )) {
      const draft = this.drafts.get(`${key}:${el.id}`);
      if (draft) {
        el.value = draft.value;
        el.checked = draft.checked;
      }
    }
    if (!modal)
      this.app.querySelector(".action-bar")?.setAttribute("hidden", "");
  }
  private val(key: string) {
    return (
      this.app
        .querySelector<HTMLInputElement>(`#account-${key}`)
        ?.value.trim() || ""
    );
  }
  private checked(key: string) {
    return !!this.app.querySelector<HTMLInputElement>(`#account-${key}`)
      ?.checked;
  }
  private change = (e: Event) => {
    this.input(e);
    const el = e.target as HTMLInputElement;
    if (!el.hasAttribute("data-account-photo") || !el.files?.[0]) return;
    const file = el.files[0];
    void (async () => {
      if (
        !/^image\/(jpeg|png)$/.test(file.type) ||
        file.size > 12 * 1024 * 1024
      )
        throw new Error("Choose a JPEG or PNG up to 12 MB.");
      const b = await createImageBitmap(file);
      try {
        if (Math.min(b.width, b.height) < 64)
          throw new Error("Photo is too small.");
        const side = Math.min(b.width, b.height),
          c = document.createElement("canvas");
        c.width = c.height = Math.min(640, side);
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(
          b,
          (b.width - side) / 2,
          (b.height - side) / 2,
          side,
          side,
          0,
          0,
          c.width,
          c.height,
        );
        this.photo = c.toDataURL("image/jpeg", 0.82).split(",")[1];
        this.render(true);
      } finally {
        b.close();
      }
    })().catch((e) => {
      this.status = e.message;
      this.render(true);
    });
  };
  private click = (e: Event) => {
    const b = (e.target as Element).closest<HTMLElement>("button");
    if (!b || !Object.keys(b.dataset).some((k) => k.startsWith("account")))
      return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (this.busy) return;
    const d = b.dataset,
      a = d.accountAction,
      v = (k: string) => this.val(k),
      checked = (k: string) => this.checked(k);
    const values = Object.fromEntries(
      Array.from(
        this.app.querySelectorAll<HTMLInputElement>("[id^=account-]"),
      ).map((el) => [
        el.id.slice(8),
        el.type === "checkbox" ? el.checked : el.value.trim(),
      ]),
    );
    const value = (k: string) => String(values[k] || "");
    this.busy = true;
    this.status = "";
    void (async () => {
      if (a === "retry") {
        this.errors.clear();
        this.cache.clear();
        return;
      }
      if (a === "profile") {
        await api.request("/api/profile", {
          name: v("name"),
          gender: v("gender"),
          birth_date: v("birth_date"),
          default_payment: v("default_payment"),
          default_vehicle: v("default_vehicle"),
        });
        this.cache.delete("/api/profile");
      }
      if (a === "business") {
        const p = this.cache.get("/api/profile")?.details?.[0];
        await api.request("/api/profile", {
          name: p.name,
          company_name: v("company_name"),
          business_gstin: v("business_gstin"),
          cost_centre: v("cost_centre"),
          work_email: v("work_email"),
        });
        this.cache.delete("/api/profile");
      }
      if (a === "photo") {
        await api.request("/api/profile/photo", { image: this.photo });
        this.photo = "";
        this.cache.delete("/api/profile");
        await this.refresh();
      }
      if (a === "send-code") {
        if (Date.now() < this.otpRetryAt)
          throw new Error("Wait before requesting another code.");
        const r = await api.request<{
          retry_after?: number;
          dev_code?: string;
        }>("/api/profile/phone/request", { phone: v("phone") });
        this.otpRetryAt = Date.now() + (r.retry_after || 30) * 1000;
        this.phoneSent = true;
        this.status =
          this.config()?.development && r.dev_code
            ? `Development code: ${r.dev_code}`
            : "Verification code sent.";
        return;
      }
      if (a === "verify-code") {
        await api.request("/api/profile/phone/verify", {
          phone: v("phone"),
          code: v("code"),
        });
        this.phoneSent = false;
        this.cache.delete("/api/profile");
      }
      if (a === "preferences") {
        const prefs: Data = { language: v("language") };
        for (const key of [
          "wheelchair_access",
          "hearing_impaired",
          "visually_impaired",
          "extra_assistance",
          "large_text",
          "notifications_enabled",
        ])
          prefs[key] = checked(key);
        await api.request("/api/preferences", prefs);
        if (this.role === "captain")
          await api.request("/api/drivers/preferences", {
            pickup_radius_meters: Number(v("pickup_radius_meters")),
            minimum_fare_paise: Math.round(Number(v("minimum_fare")) * 100),
          });
        this.bridge.update({
          toggled: {
            ...this.bridge.read().toggled,
            "large-text": prefs.large_text,
          },
        });
        this.cache.delete("/api/companion");
        await this.refresh();
      }
      if (a === "contact") {
        await api.request("/api/profile/contacts", {
          name: v("contact-name"),
          phone: v("contact-phone"),
          relation: v("relation"),
        });
        this.cache.delete("/api/profile");
      }
      if (d.accountDeleteContact) {
        await api.request(
          `/api/profile/contacts/${encodeURIComponent(d.accountDeleteContact)}/delete`,
          {},
        );
        this.cache.delete("/api/profile");
      }
      if (a === "goal") {
        await api.request("/api/drivers/goal", {
          daily_goal_paise: Math.round(Number(v("goal")) * 100),
        });
        await this.refresh();
      }
      if (a === "payout") {
        await api.request("/api/drivers/payouts", {
          amount_paise: Math.round(Number(v("payout-amount")) * 100),
        });
        this.cache.delete("/api/drivers/wallet");
        this.status = "Payout request submitted for operator processing.";
        return;
      }
      if (a === "report" || a === "lost-item") {
        this.selectedRide = v("ride") || undefined;
        const r = this.trip();
        await api.request(
          a === "report"
            ? "/api/incidents"
            : `/api/rides/${encodeURIComponent(r.id)}/lost-items`,
          a === "report"
            ? { ride_id: r.id, message: v("report") }
            : { description: v("report") },
        );
        this.status = "Report submitted to the operator.";
        return;
      }
      if (a === "sos") {
        await api.request(
          `/api/rides/${encodeURIComponent(this.trip().id)}/sos`,
          {},
        );
        this.status =
          "SOS incident sent to the operator. No emergency call was placed.";
        return;
      }
      if (a === "share") {
        const r = await api.request<{ path: string }>(
          `/api/rides/${encodeURIComponent(this.trip().id)}/share`,
          {},
        );
        const origin = import.meta.env.VITE_MOBILE_API_URL || location.origin;
        this.shareURL = new URL(r.path, origin).href;
        this.status = "Trip link created. Copy it only to people you trust.";
        return;
      }
      if (a === "revoke-share") {
        await api.request(
          `/api/rides/${encodeURIComponent(this.trip().id)}/share/revoke`,
          {},
        );
        this.shareURL = "";
      }
      if (d.accountAcceptBid) {
        await api.request(
          `/api/rides/${encodeURIComponent(this.trip().id)}/bids/${encodeURIComponent(d.accountAcceptBid)}/accept`,
          {},
        );
        await this.refresh();
        this.bridge.update({ modal: null });
      }
      if (a === "counter") {
        const r = this.state()?.offers?.[0];
        if (!r) throw new Error("No current eligible request.");
        await api.request(`/api/rides/${encodeURIComponent(r.id)}/bids`, {
          amount_paise: Math.round(Number(v("counter")) * 100),
        });
        await this.refresh();
      }
      if (a === "referral") {
        await api.request("/api/referrals/redeem", { code: v("referral") });
        this.cache.delete("/api/companion");
      }
      if (a === "family") {
        await api.request("/api/family/invite", { email: v("family-email") });
        this.cache.delete("/api/companion");
      }
      if (d.accountFamilyAccept) {
        await api.request(
          `/api/family/${encodeURIComponent(d.accountFamilyAccept)}/respond`,
          { accept: true },
        );
        this.cache.delete("/api/companion");
      }
      if (d.accountFamilyDelete) {
        await api.request(
          `/api/family/${encodeURIComponent(d.accountFamilyDelete)}/delete`,
          {},
        );
        this.cache.delete("/api/companion");
      }
      if (d.accountFavoriteDelete) {
        await api.request(
          `/api/favorite-drivers/${encodeURIComponent(d.accountFavoriteDelete)}/delete`,
          {},
        );
        this.cache.delete("/api/companion");
      }
      if (d.accountLocationDelete) {
        await api.request(
          `/api/locations/${encodeURIComponent(d.accountLocationDelete)}/delete`,
          {},
        );
        await this.refresh();
      }
      if (a === "save-location") {
        const p = (this.bridge.read() as Data).liveDestination;
        if (!p)
          throw new Error("Select a destination in booking search first.");
        await api.request("/api/locations", {
          kind: v("location-kind"),
          label: v("location-label"),
          place_label: p.label,
          lat: p.lat,
          lng: p.lng,
        });
        await this.refresh();
      }
      if (a === "export") {
        const data = await api.request("/api/profile/export");
        await downloadJSON(data, "hop-my-data.json");
      }
      if (a === "deletion" || a === "cancel-deletion") {
        if (a === "deletion" && !checked("confirm-deletion"))
          throw new Error("Confirm the deletion request first.");
        await api.request("/api/profile/deletion", {
          cancel: a === "cancel-deletion",
        });
        this.cache.delete("/api/profile");
      }
      if (a === "topup") {
        const account =
          this.cache.get("/api/profile")?.details?.[0]?.id ||
          (await api.session()).user.id;
        const key = `hop.wallet.account.pending:${account}`;
        const amount = Math.round(Number(v("topup-amount")) * 100);
        if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 10000000)
          throw new Error("Choose an amount from ₹10 to ₹100,000.");
        const cached = sessionStorage.getItem(key);
        let order: Order | { balance_paise: number };
        if (cached) {
          try {
            order = JSON.parse(cached);
          } catch {
            throw new Error(
              "A top-up creation is uncertain. Check your wallet or contact support before paying again.",
            );
          }
        } else {
          sessionStorage.setItem(key, "creating");
          order = await api.request("/api/wallet/topup", {
            amount_paise: amount,
          });
        }
        if ("balance_paise" in order) {
          sessionStorage.removeItem(key);
          this.cache.delete("/api/wallet");
          this.status =
            "Development credit recorded by the backend. No real money charged.";
          return;
        }
        sessionStorage.setItem(key, JSON.stringify(order));
        const verification = await checkout(order);
        await api.request("/api/wallet/verify", verification);
        sessionStorage.removeItem(key);
        this.cache.delete("/api/wallet");
        this.status = "Top-up verified by the backend.";
        return;
      }
      if (a === "wallet-payment") {
        this.bridge.notify(
          "Wallet top-up is available in Payment & receipt for a started or completed trip.",
        );
        return;
      }
      this.drafts.clear();
      this.status = "Saved by the server.";
    })()
      .catch((err) => {
        this.status = err.message;
        this.bridge.notify(this.status);
      })
      .finally(() => {
        this.busy = false;
        this.render(true);
      });
  };
}
