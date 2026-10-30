import { downloadJSON } from "../platform/download";
import { checkout, type Order } from "../payments/checkout";
import { api } from "../services/client";
import { escape, money } from "../helpers";
import { icon } from "../icons";
import type { State, Config } from "../services/contracts";
import type { OnboardingBridge as Bridge } from "../onboarding/CaptainOnboarding";
type Data = Record<string, any>;
export class LiveAccount {
  private drafts = new Map<string, { value: string; checked: boolean }>();
  private topupAmount = 500;
  private statusError = false;
  private input = (e: Event) => {
    const el = e.target as HTMLInputElement;
    if (el.id === "topup-amount") {
      const val = Number(el.value);
      this.topupAmount = Number.isFinite(val) && val > 0 ? val : 0;
      this.app.querySelectorAll<HTMLElement>("[data-topup-chip]").forEach((c) => {
        c.classList.toggle("active", c.dataset.topupChip === String(val));
      });
      return;
    }
    if (!el.id.startsWith("account-") && el.id !== "full-name") return;
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
    this.topupAmount = 500;
    this.statusError = false;
  }
  private field(
    key: string,
    label: string,
    value: unknown = "",
    type = "text",
  ) {
    return `<label class="field-label" for="account-${key}">${label}</label><input class="text-input" id="account-${key}" type="${type}" value="${escape(value)}"/>`;
  }
  private action(id: string, label: string, kind: "primary" | "secondary" = "primary") {
    return `<button class="${kind}" data-account-action="${id}" ${this.busy ? "disabled" : ""}>${label}</button>`;
  }
  private select(key: string, label: string, items: string[], value: string) {
    return `<label class="field-label" for="account-${key}">${label}</label><select class="text-input" id="account-${key}">${items.map((v) => `<option ${value === v ? "selected" : ""}>${escape(v)}</option>`).join("")}</select>`;
  }
  private modalRow(
    title: string,
    detail: string,
    ico: string,
    modal: string,
    right = "",
  ) {
    return `<button class="list-row" data-modal="${modal}"><span class="list-icon">${icon(ico)}</span><span class="list-text"><strong>${escape(title)}</strong><small>${escape(detail)}</small></span>${right ? `<span class="right">${right}</span>` : icon("chevron")}</button>`;
  }
  private decorateWallet() {
    const data = this.get("/api/wallet");
    const hero = this.app.querySelector<HTMLElement>(".wallet-hero");
    if (hero) {
      const small = hero.querySelector("small");
      if (small) small.textContent = "YOUR HOP WALLET";
      const amountEl = hero.querySelector(".amount");
      if (amountEl && data && Number.isSafeInteger(data.balance_paise)) {
        const balance = data.balance_paise / 100;
        this.bridge.assign({ balance });
        amountEl.innerHTML = `${money(balance)}<span style="font-size:19px;opacity:.5">.00</span>`;
      }
    }

    // The empty-history message also uses notice-box. Keep the payment footer
    // identifiable so subsequent updates never mistake an empty state for it.
    const notice = this.app.querySelector<HTMLElement>("[data-wallet-payment-notice]") ||
      Array.from(this.app.querySelectorAll<HTMLElement>(".screen-padding > .notice-box")).at(-1);
    if (notice) {
      notice.dataset.walletPaymentNotice = "true";
      notice.textContent =
        "Cash, direct UPI and online payment options remain available at trip confirmation.";
    }

    const label = this.app.querySelector<HTMLElement>(
      ".screen-padding > .section-label",
    );
    if (label && notice && data) {
      const entries: Data[] = data.entries || data.ledger || [];
      let next = label.nextElementSibling;
      while (next && next !== notice) {
        const toRemove = next;
        next = next.nextElementSibling;
        toRemove.remove();
      }
      if (entries.length > 0) {
        const rowsHtml = entries
          .slice(0, 10)
          .map((entry) => this.formatWalletEntry(entry))
          .join("");
        label.insertAdjacentHTML("afterend", rowsHtml);
      } else {
        label.insertAdjacentHTML(
          "afterend",
          `<div class="notice-box" style="margin:10px 0;background:var(--surface);border:1px dashed var(--line);text-align:center;color:var(--muted)">No transactions yet. Top-ups and ride payments will appear here.</div>`,
        );
      }
    }

    let statusEl = this.app.querySelector<HTMLElement>(
      ".screen-padding > [role='status']",
    );
    if (this.status) {
      if (!statusEl) {
        statusEl = document.createElement("p");
        statusEl.setAttribute("role", "status");
        statusEl.className = "small muted";
        statusEl.style.marginTop = "12px";
        this.app.querySelector(".screen-padding")?.appendChild(statusEl);
      }
      statusEl.textContent = this.status;
      statusEl.style.display = "";
    } else if (statusEl) {
      statusEl.style.display = "none";
    }
  }

  private renderTopupModal() {
    const sheet = this.app.querySelector<HTMLElement>(".modal-sheet");
    if (!sheet) return;

    sheet.innerHTML = `<div class="sheet-handle"></div><div class="modal-title"><h2 id="modal-title">Add to your wallet.</h2><button class="icon-button" aria-label="Close dialog" data-action="close-modal">${icon("close")}</button></div><p class="muted small" style="margin:4px 0 0">Choose an amount or enter custom amount.</p><div class="product-row" style="margin:18px 0">${[100, 200, 500, 1000].map((n) => `<button type="button" class="product-chip ${this.topupAmount === n ? "active" : ""}" data-topup-chip="${n}">${money(n)}</button>`).join("")}</div><label class="field-label" for="topup-amount">Amount (₹)</label><input id="topup-amount" class="text-input" aria-label="Add money (₹)" inputmode="numeric" pattern="[0-9]*" value="${this.topupAmount || ""}" placeholder="Enter amount"/><div id="modal-error" class="message-error" role="alert" style="${this.status && this.statusError ? "" : "display:none"}">${escape(this.status)}</div>${this.status ? `<p role="status" class="small muted">${escape(this.status)}</p>` : ""}<button class="primary" data-account-action="topup" style="margin-top:14px" ${this.busy ? "disabled" : ""}>${this.busy ? "Processing…" : "Add money with provider checkout"}${icon("arrow")}</button>`;

    sheet.focus({ preventScroll: true });
  }

  private decorateLedger() {
    const path = this.role === "captain" ? "/api/drivers/wallet" : "/api/wallet";
    const data = this.get(path);
    const host = this.app.querySelector<HTMLElement>(".screen-padding");
    if (!host) return;

    const entries: Data[] = data?.entries || data?.ledger || [];
    let html = "";

    if (this.role === "captain") {
      html += `<div class="section-card" style="margin-bottom:14px"><div class="row"><div><small class="muted">AVAILABLE BALANCE</small><strong style="display:block;font-size:24px;margin-top:2px">${money((data?.balance_paise || 0) / 100)}</strong></div><button class="primary small" data-modal="payout" style="padding:8px 14px;font-size:11px">Request payout</button></div></div>`;
    }

    if (data && Array.isArray(entries)) {
      if (entries.length > 0) {
        html += entries.map((e) => this.formatWalletEntry(e)).join("");
      } else {
        html += `<p class="micro muted" style="margin:16px 4px">No transactions recorded yet.</p>`;
      }
    } else {
      html += `<p class="micro muted" style="margin:16px 4px">Loading transactions…</p>`;
    }

    if (this.role === "captain" && (data?.payouts || []).length > 0) {
      html += `<div class="section-label" style="margin-top:20px">Payout requests</div>`;
      html += ((data?.payouts || []) as Data[])
        .map(
          (p: Data) =>
            `<div class="section-card" style="margin-bottom:8px"><div class="row"><strong>${money(p.amount_paise / 100)}</strong><span class="badge ${p.status === "paid" ? "green" : "neutral"}">${escape(p.status)}</span></div><small class="muted">${escape(p.reference || "")}</small></div>`,
        )
        .join("");
    }

    html += `<div class="notice-box" style="margin-top:20px">${this.role === "captain" ? "Ledger entries and payout processing are managed by the operator." : "Ledger entries and payment verification are managed by the server."}</div>`;

    if (this.status) {
      html += `<p role="status" class="small muted" style="margin-top:12px">${escape(this.status)}</p>`;
    }

    host.innerHTML = html;
  }

  private formatWalletEntry(entry: Data): string {
    const kind = String(entry.kind || "transaction");
    let title = "Transaction";
    let ico = "wallet";
    let go = "ledger";
    if (kind === "topup") {
      title = "Added to wallet";
      ico = "plus";
      go = "ledger";
    } else if (kind === "ride_payment") {
      title = "Ride payment";
      ico = "car";
      go = "receipt";
    } else if (kind === "refund") {
      title = "Refund received";
      ico = "refresh";
      go = "ledger";
    } else if (kind === "adjustment") {
      title = "Wallet adjustment";
      ico = "plus";
      go = "ledger";
    } else {
      title = kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }

    let dateStr = "Recent";
    if (entry.created_at) {
      try {
        const d = new Date(entry.created_at);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) {
          dateStr = "Today";
        } else {
          dateStr = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        }
      } catch {}
    }
    const note = entry.note ? ` · ${entry.note}` : "";
    const detail = `${dateStr}${note}`;

    const paise = Number(entry.amount_paise || 0);
    const isPositive = paise >= 0;
    const amountFormatted = money(Math.abs(paise) / 100);
    const right = isPositive
      ? `<strong style="color:#357451">+${amountFormatted}</strong>`
      : `<strong>−${amountFormatted}</strong>`;

    return `<button class="list-row" data-go="${go}"><span class="list-icon">${icon(ico)}</span><span class="list-text"><strong>${escape(title)}</strong>${detail ? `<small>${escape(detail)}</small>` : ""}</span><span class="right">${right}</span></button>`;
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
      "personal-more": "/api/profile",
      email: "/api/profile",
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
      ridecheck: "safety",
      "safety-guidance": "safety",
      "support-contact": "support",
      "add-place": "state",
      "edit-place": "state",
      "sos-info": "safety",
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
            sub = hero.querySelector("p"),
            avatar = hero.querySelector(".avatar");
          if (h) h.textContent = p.name;
          if (sub)
            sub.textContent = p.phone_verified
              ? "Verified mobile account"
              : "Verify mobile ownership in Personal details";
          if (avatar && p.has_photo && p.id && !avatar.querySelector("img")) {
            avatar.setAttribute("style", "overflow:hidden;padding:0");
            avatar.innerHTML = `<img src="/api/profile/photo/${encodeURIComponent(p.id)}" alt="${escape(p.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.remove()"/>`;
          }
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
    if (!modal && screen === "wallet") {
      this.decorateWallet();
      return;
    }
    if (modal === "topup") {
      this.renderTopupModal();
      return;
    }
    if (!modal && screen === "ledger") {
      this.decorateLedger();
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
    else if (key === "personal") {
      const name = p.name || (this.role === "captain" ? "Demo Captain" : "Demo Rider");
      const avatarChar = name ? name.charAt(0).toUpperCase() : (this.role === "captain" ? "A" : "D");
      const avatarHtml = this.photo
        ? `<img src="data:image/jpeg;base64,${this.photo}" alt="${escape(name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`
        : p.has_photo && p.id
          ? `<img src="/api/profile/photo/${encodeURIComponent(p.id)}" alt="${escape(name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.remove()"/>`
          : avatarChar;

      const phoneDetail = `${p.phone || "Not set"} · ${p.phone_verified ? "Verified" : "Unverified"}`;
      const phoneRight = p.phone_verified ? '<span class="badge green">Verified</span>' : "";

      const genderFormatted = p.gender ? p.gender.charAt(0).toUpperCase() + p.gender.slice(1) : "";
      const genderDobDetail = [genderFormatted, p.birth_date].filter(Boolean).join(" · ") || "Personal information";

      body =
        `<div class="account-hero"><span class="avatar" style="${this.photo || (p.has_photo && p.id) ? "overflow:hidden;padding:0" : ""}">${avatarHtml}</span><div><h2>${escape(name)}</h2><button class="text-button" style="padding:0;min-height:25px;font-size:10px" data-action="portrait" data-account-action="portrait">Change photo</button>${this.photo ? `<button class="text-button" style="padding:0;min-height:25px;font-size:10px;margin-left:8px;color:var(--accent)" data-account-action="photo">${this.busy ? "Saving…" : "Save photo"}</button>` : ""}</div></div>` +
        `<input type="file" accept="image/jpeg,image/png" data-account-photo style="display:none" aria-hidden="true"/>` +
        `<label class="field-label" for="full-name">Full name</label><input class="text-input" id="full-name" value="${escape(name)}"/>` +
        this.modalRow("Mobile number", phoneDetail, "phone", "verify", phoneRight) +
        this.modalRow("Email address", p.email ? p.email : "Add or update your email", "mail", "email") +
        this.modalRow("Gender & date of birth", genderDobDetail, "user", "personal-more") +
        (this.role !== "captain"
          ? this.modalRow("Business receipt details", "Company, GSTIN, cost centre & work email", "briefcase", "business")
          : "") +
        `<div class="notice-box">The existing exact-number verification and captain identity review checks remain required in the real application.</div>`;
    } else if (key === "personal-more") {
      body =
        `<p class="muted small" style="margin:4px 0 14px">These details are kept private and help personalize your experience.</p>` +
        `<label class="field-label" for="account-gender">Gender</label>` +
        `<select class="text-input" id="account-gender">` +
        `<option value="" ${!p.gender ? "selected" : ""}>Prefer not to say</option>` +
        `<option value="female" ${p.gender === "female" ? "selected" : ""}>Female</option>` +
        `<option value="male" ${p.gender === "male" ? "selected" : ""}>Male</option>` +
        `<option value="other" ${p.gender === "other" ? "selected" : ""}>Other</option>` +
        `</select>` +
        `<label class="field-label" for="account-birth_date" style="margin-top:14px">Date of birth</label>` +
        `<input class="text-input" id="account-birth_date" type="date" value="${escape(p.birth_date || "")}"/>` +
        `<div style="margin-top:20px"><button class="primary" data-account-action="personal-more" data-action="save-personal-more" ${this.busy ? "disabled" : ""}>${this.busy ? "Saving…" : "Save details"}${icon("arrow")}</button></div>`;
    } else if (key === "email") {
      body =
        `<p class="muted small" style="margin:4px 0 14px">Your email is used for ride receipts and important account notifications.</p>` +
        `<label class="field-label" for="account-email">Email address</label>` +
        `<input class="text-input" id="account-email" type="email" value="${escape(p.email || "")}" placeholder="name@example.com"/>` +
        `<div style="margin-top:20px"><button class="primary" data-account-action="email" data-action="save-email" ${this.busy ? "disabled" : ""}>${this.busy ? "Saving…" : "Save email address"}${icon("arrow")}</button></div>`;
    }
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
    else if (key === "contacts") {
      const contactsList = (data?.contacts || [])
        .map(
          (c: Data) =>
            `<div class="list-row"><span class="list-icon">${icon("user")}</span><span class="list-text"><strong>${escape(c.name)}</strong><small>${escape(c.phone)}${c.relation ? ` · ${escape(c.relation)}` : ""}</small></span><button class="text-button" data-account-delete-contact="${escape(c.id)}" style="min-height:44px;min-width:44px;padding:10px 12px;color:var(--muted);font-size:12px">Remove</button></div>`,
        )
        .join("");
      body =
        `<p class="small muted" style="margin:4px 0 14px">Trusted contacts who can be reached if you need help during a ride.</p>` +
        (contactsList.length > 0
          ? `<div style="margin-bottom:14px">${contactsList}</div>`
          : `<p class="micro muted" style="margin:8px 0 14px">No emergency contacts saved yet.</p>`) +
        `<div class="section-card" style="background:white;padding:14px">` +
        `<label class="field-label" for="account-contact-name" style="margin-top:0">Contact name</label>` +
        `<input class="text-input" id="account-contact-name" placeholder="Name" maxlength="40"/>` +
        `<label class="field-label" for="account-contact-phone" style="margin-top:12px">Mobile number</label>` +
        `<input class="text-input" id="account-contact-phone" type="tel" placeholder="Mobile number" maxlength="15"/>` +
        `<label class="field-label" for="account-relation" style="margin-top:12px">Relationship</label>` +
        `<input class="text-input" id="account-relation" placeholder="e.g. Partner, Parent, Friend" maxlength="30"/>` +
        `<button class="primary" data-account-action="contact" style="margin-top:16px;width:100%;min-height:48px" ${this.busy ? "disabled" : ""}>${this.busy ? "Saving…" : "Save emergency contact"}${icon("arrow")}</button>` +
        `</div>`;
    }
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
        `<div style="margin-top:16px"><button type="button" class="list-row" data-modal="appearance" style="width:100%;display:flex;align-items:center;justify-content:space-between;border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:#fff;font-weight:600"><span>Appearance theme</span><span class="muted" style="font-size:12px">Auto / Dark →</span></button></div>`;
    } else if (key === "tools") {
      body = `<div class="section-card"><strong>Today's completed fares</strong><p>${money((data?.summary?.today_fare_paise || 0) / 100)}</p><button class="text-button" data-modal="goal">Edit daily goal</button></div><button class="toggle-row" data-action="home-mode"><span>Head towards home using my current location</span></button><button class="list-row" data-modal="service-area">Operating city</button><button class="list-row" data-go="demand">Demand nearby</button><button class="list-row" data-go="preferences">Pickup and fare preferences</button><button class="list-row" data-go="insights">Driving insights</button><button class="secondary" data-action="take-break">Go offline for a break</button>`;
    } else if (key === "earnings") {
      const sum = data?.summary || {};
      body = `<div class="wallet-hero"><small>TODAY'S COMPLETED FARES</small><div class="amount">${money((sum.today_fare_paise || 0) / 100)}</div><p>${Number(sum.today_completed_trips || 0)} completed trips</p></div><div class="section-card"><p>Week ${money((sum.week_fare_paise || 0) / 100)}</p><p>Month ${money((sum.month_fare_paise || 0) / 100)}</p><p>All time ${money((sum.all_time_fare_paise || 0) / 100)}</p><p class="micro">Reported receipt is distinct from provider settlement.</p></div>${(data?.rides || []).map((r: Data) => `<div class="list-row"><span>${escape(r.pickup_label)} → ${escape(r.dropoff_label)}</span><strong>${money(r.fare_paise / 100)}</strong></div>`).join("")}<button class="secondary" data-go="ledger">Ledger & payouts</button>`;
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
    else if (key === "saved") {
      const locs = this.state()?.saved_locations || [];
      const liveDest = (this.bridge.read() as Data).liveDestination;

      let placesList = "";
      if (locs.length > 0) {
        placesList = locs
          .map((p: Data) => {
            const ico =
              p.kind === "home" ? "home" : p.kind === "work" ? "briefcase" : "pin";
            return `<div class="list-row"><span class="list-icon">${icon(ico)}</span><span class="list-text"><strong>${escape(p.label)}</strong><small>${escape(p.place_label || "Saved sample location")}</small></span><button class="text-button" data-account-location-delete="${escape(p.id)}" style="min-height:44px;padding:8px 12px;font-size:12px;color:var(--muted)">Remove</button></div>`;
          })
          .join("");
      }

      let suggestionsHtml = "";
      if (locs.length < 2) {
        const hasHome = locs.some(
          (l: Data) => l.kind === "home" || l.label?.toLowerCase() === "home",
        );
        const hasWork = locs.some(
          (l: Data) => l.kind === "work" || l.label?.toLowerCase() === "work",
        );
        const suggestions = [];
        if (!hasHome) {
          suggestions.push({
            kind: "home",
            label: "Home",
            address: "2nd Cross Street, Adyar",
            ico: "home",
          });
        }
        if (!hasWork) {
          suggestions.push({
            kind: "work",
            label: "Work",
            address: "Olympia Tech Park, Guindy",
            ico: "briefcase",
          });
        }
        if (locs.length === 0 && !hasHome && !hasWork) {
          suggestions.push({
            kind: "favorite",
            label: "Gym",
            address: "Phoenix Marketcity, Velachery",
            ico: "pin",
          });
        }

        if (suggestions.length > 0) {
          suggestionsHtml =
            `<div class="section-label" style="margin-top:16px">Quick suggestions <span>Frequent</span></div>` +
            suggestions
              .map(
                (s) =>
                  `<div class="list-row"><span class="list-icon">${icon(s.ico)}</span><span class="list-text"><strong>${s.label}</strong><small>${s.address}</small></span><button class="text-button" data-account-quick-place="${s.kind}" data-quick-label="${s.label}" data-quick-address="${s.address}" style="min-height:44px;padding:8px 12px;font-size:12px;color:var(--accent);font-weight:600">Add</button></div>`,
              )
              .join("");
        }
      }

      body =
        `<p class="small muted" style="margin:8px 0 14px">A few familiar places. A little less typing.</p>` +
        placesList +
        suggestionsHtml +
        `<div class="section-label" style="margin-top:20px">+ Add a place <span>New location</span></div>` +
        `<div class="section-card" style="margin-top:6px;background:white">` +
        `<label class="field-label" for="account-location-kind" style="margin-top:0">Kind (Home, Work, Favorite)</label>` +
        `<select class="text-input" id="account-location-kind">` +
        `<option value="favorite">Favorite</option>` +
        `<option value="home">Home</option>` +
        `<option value="work">Work</option>` +
        `</select>` +
        `<label class="field-label" for="account-location-label" style="margin-top:12px">Place label</label>` +
        `<input class="text-input" id="account-location-label" placeholder="e.g. Home, Work, Gym, Central Café" maxlength="40"/>` +
        `<label class="field-label" for="account-location-address" style="margin-top:12px">Destination address</label>` +
        `<input class="text-input" id="account-location-address" placeholder="${liveDest ? escape(liveDest.label) : "Select destination in search or enter address"}" value="${liveDest ? escape(liveDest.label) : ""}"/>` +
        `<button class="primary" data-account-action="save-location" style="margin-top:16px;width:100%;min-height:48px" ${this.busy ? "disabled" : ""}>${this.busy ? "Saving…" : "Save destination"}${icon("arrow")}</button>` +
        `</div>` +
        `<div class="notice-box" style="margin-top:16px">Choose a real address on the booking search, or enter your destination above to save it for quick booking.</div>`;
    } else if (key === "add-place") {
      const liveDest = (this.bridge.read() as Data).liveDestination;
      body =
        `<p class="small muted" style="margin:4px 0 14px">Save your favourite destinations for quick one-tap booking.</p>` +
        `<label class="field-label" for="account-location-kind">Kind (home/work/favorite)</label>` +
        `<select class="text-input" id="account-location-kind">` +
        `<option value="favorite">Favorite</option>` +
        `<option value="home">Home</option>` +
        `<option value="work">Work</option>` +
        `</select>` +
        `<label class="field-label" for="account-location-label" style="margin-top:12px">Place label</label>` +
        `<input class="text-input" id="account-location-label" placeholder="e.g. Gym, Favourite Café" maxlength="40"/>` +
        `<label class="field-label" for="account-location-address" style="margin-top:12px">Address</label>` +
        `<input class="text-input" id="account-location-address" placeholder="${liveDest ? escape(liveDest.label) : "Enter destination address"}" value="${liveDest ? escape(liveDest.label) : ""}"/>` +
        `<div class="notice-box" style="margin-top:14px">You can select a destination on the home screen search, or enter an address here.</div>` +
        `<button class="primary" data-account-action="save-location" style="margin-top:16px;width:100%;min-height:48px" ${this.busy ? "disabled" : ""}>${this.busy ? "Saving…" : "Save destination"}${icon("arrow")}</button>`;
    } else if (key === "edit-place") {
      const locs = this.state()?.saved_locations || [];
      body =
        (locs.length > 0
          ? locs
              .map(
                (p: Data) =>
                  `<div class="list-row"><span class="list-icon">${icon(p.kind === "home" ? "home" : p.kind === "work" ? "briefcase" : "pin")}</span><span class="list-text"><strong>${escape(p.label)}</strong><small>${escape(p.place_label || "Saved location")}</small></span><button class="text-button" data-account-location-delete="${escape(p.id)}" style="min-height:44px;padding:8px 12px;color:var(--muted);font-size:12px">Remove</button></div>`,
              )
              .join("")
          : `<p class="small muted" style="margin:16px 0">No saved places yet.</p>`) +
        `<button class="primary" data-action="close-modal" style="width:100%;margin-top:16px;min-height:48px">Done</button>`;
    }
    else if (key === "safety") {
      const head = this.app.querySelector<HTMLElement>(
        "header.app-head, header.app-header, header",
      );
      if (head) {
        const h1 = head.querySelector("h1");
        if (h1) h1.textContent = "Safety Centre";
        if (!head.querySelector('[data-action="back"]')) {
          const titleDiv = head.querySelector(".head-title");
          if (titleDiv) {
            titleDiv.insertAdjacentHTML(
              "afterbegin",
              `<button class="icon-button flat" aria-label="Back" data-action="back">${icon("back")}</button>`,
            );
          }
        }
      }
      body =
        `<div class="safety-hero">` +
        icon("shield") +
        `<div><h2>A little peace of mind.</h2><p>Your safety matters on every journey.</p></div>` +
        `</div>` +
        `<div class="quick-grid">` +
        `<button class="quick-tile quick-tile-emergency" data-modal="sos" aria-label="Emergency Help: Quick incident alert to Hop operator">` +
        `<div class="quick-tile-icon-badge">${icon("phone")}</div>` +
        `<strong>Emergency Help</strong>` +
        `<small>Quick incident alert to Hop operator</small>` +
        `</button>` +
        `<button class="quick-tile" data-modal="share" aria-label="Share Your Trip: Let trusted people follow your live ride">` +
        `<div class="quick-tile-icon-badge normal">${icon("location")}</div>` +
        `<strong>Share Your Trip</strong>` +
        `<small>Let trusted people follow your live ride</small>` +
        `</button>` +
        `</div>` +
        `<div class="section-label" style="margin-top:20px">Your safety toolkit</div>` +
        this.modalRow(
          "Emergency contacts",
          "Manage trusted contacts",
          "user",
          "contacts",
        ) +
        this.modalRow(
          "Report a safety concern",
          "Tell us about an incident or driver",
          "shield",
          "report",
        ) +
        this.modalRow(
          "RideCheck™ Safety Monitor",
          "Anomaly & unexpected stop detection",
          "shield",
          "ridecheck",
        ) +
        this.modalRow(
          "Safety guidance",
          "Verify your vehicle and pickup code",
          "book",
          "safety-guidance",
        ) +
        `<div class="notice-box" style="margin-top:20px">An app SOS creates an operator incident. It does not contact emergency services. For immediate help, use your phone's emergency calling function.</div>`;
    } else if (key === "ridecheck")
      body =
        `<div class="empty-state" style="padding:16px 10px 12px">` +
        icon("shield") +
        `<h2>RideCheck™ Safety Monitor</h2>` +
        `<p style="margin-top:8px">Hop monitors trip telemetry in the background. If your ride experiences an unexpected prolonged stop, anomaly, or route deviation, Hop automatically checks in to verify your safety.</p>` +
        `</div>` +
        `<div class="notice-box" style="margin:14px 0 18px">` +
        `<strong>How RideCheck protects you:</strong><br/>` +
        `• Real-time GPS and stationary vehicle detection.<br/>` +
        `• Proactive safety check-in prompt during unexpected delays.<br/>` +
        `• Rapid escalation to the Hop 24/7 safety team if no response.` +
        `</div>` +
        `<div style="display:flex;flex-direction:column;gap:10px">` +
        `<button class="primary" data-action="close-modal" style="min-height:44px">Understood</button>` +
        `<button class="secondary" data-modal="sos" style="min-height:44px">Emergency help options</button>` +
        `</div>`;
    else if (key === "safety-guidance")
      body =
        `<p class="muted small" style="margin:4px 0 14px">Follow these verification steps to protect yourself on every journey.</p>` +
        `<div class="section-card" style="margin-bottom:16px;text-align:left">` +
        `<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px">` +
        `<div class="list-icon" style="flex-shrink:0;width:32px;height:32px;border-radius:8px;background:#e1f5eb;color:#167b5b">${icon("check", "tiny-icon")}</div>` +
        `<div><strong style="font-size:12px;display:block">1. Verify vehicle & plate number</strong><small style="color:var(--muted);font-size:10px;line-height:1.4;display:block;margin-top:2px">Check the vehicle model, color, and registration plate before opening the door.</small></div>` +
        `</div>` +
        `<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px">` +
        `<div class="list-icon" style="flex-shrink:0;width:32px;height:32px;border-radius:8px;background:#e1f5eb;color:#167b5b">${icon("user", "tiny-icon")}</div>` +
        `<div><strong style="font-size:12px;display:block">2. Confirm Captain name</strong><small style="color:var(--muted);font-size:10px;line-height:1.4;display:block;margin-top:2px">Ask your Captain who they are picking up to make sure they know your name.</small></div>` +
        `</div>` +
        `<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px">` +
        `<div class="list-icon" style="flex-shrink:0;width:32px;height:32px;border-radius:8px;background:#e1f5eb;color:#167b5b">${icon("lock", "tiny-icon")}</div>` +
        `<div><strong style="font-size:12px;display:block">3. Share pickup PIN at start</strong><small style="color:var(--muted);font-size:10px;line-height:1.4;display:block;margin-top:2px">Provide your 4-digit start PIN only after you are safely in the correct vehicle.</small></div>` +
        `</div>` +
        `<div style="display:flex;gap:12px;align-items:flex-start">` +
        `<div class="list-icon" style="flex-shrink:0;width:32px;height:32px;border-radius:8px;background:#e1f5eb;color:#167b5b">${icon("location", "tiny-icon")}</div>` +
        `<div><strong style="font-size:12px;display:block">4. Share live trip status</strong><small style="color:var(--muted);font-size:10px;line-height:1.4;display:block;margin-top:2px">Send live tracking to trusted family or contacts so they can monitor your route.</small></div>` +
        `</div>` +
        `</div>` +
        `<button class="primary" data-action="close-modal" style="min-height:44px;width:100%">Got It${icon("arrow")}</button>`;
    else if (key === "support")
      body =
        `<div class="help-hero"><h2>How can we help?</h2><p>Let’s get you to the right place.</p></div>` +
        `<div class="quick-grid">` +
        `<button class="quick-tile" data-modal="report">${icon("car")}<strong>Trip issue</strong><small>Pickup, cancellation or fare</small></button>` +
        `<button class="quick-tile" data-modal="report">${icon("wallet")}<strong>Payments</strong><small>Wallet, UPI and refunds</small></button>` +
        `<button class="quick-tile" data-go="personal">${icon("user")}<strong>Account</strong><small>Sign-in and verification</small></button>` +
        `<button class="quick-tile" data-go="safety">${icon("shield")}<strong>Safety</strong><small>Help during your trip</small></button>` +
        `</div>` +
        `<div class="section-label" style="margin-top:20px">More help</div>` +
        this.modalRow(
          "I left something behind",
          "Report a lost item from a past trip",
          "briefcase",
          "lost-item",
        ) +
        this.modalRow(
          "Report an issue",
          "Submit a trip ticket to the operator",
          "help",
          "report",
        ) +
        this.modalRow(
          "Call or email support",
          "Operator contact channels",
          "phone",
          "support-contact",
        );
    else if (key === "support-contact")
      body =
        `<p class="small muted" style="margin:4px 0 16px">Our operations and support teams are available 24/7 to assist with your trips and account.</p>` +
        `<div class="section-card" style="margin-bottom:12px">` +
        `<strong class="small" style="display:block">24/7 Helpline</strong>` +
        `<p class="micro muted" style="margin:4px 0 10px">For immediate assistance during an active trip or safety incident.</p>` +
        `<a href="tel:1800-200-4467" class="list-row" style="text-decoration:none;min-height:48px;padding:8px 0;border-bottom:0">` +
        `<span class="list-icon">${icon("phone")}</span>` +
        `<span class="list-text"><strong style="color:var(--ink)">1800-200-HOP (467)</strong><small>Toll-free across India</small></span>` +
        `<span class="badge green">Call</span>` +
        `</a>` +
        `</div>` +
        `<div class="section-card" style="margin-bottom:16px">` +
        `<strong class="small" style="display:block">Email Support</strong>` +
        `<p class="micro muted" style="margin:4px 0 10px">For billing queries, lost property inquiries, and general feedback.</p>` +
        `<a href="mailto:support@hop.app" class="list-row" style="text-decoration:none;min-height:48px;padding:8px 0;border-bottom:0">` +
        `<span class="list-icon">${icon("mail")}</span>` +
        `<span class="list-text"><strong style="color:var(--ink)">support@hop.app</strong><small>Response within 24 hours</small></span>` +
        `<span class="badge neutral">Email</span>` +
        `</a>` +
        `</div>` +
        `<div class="notice-box">During active trips, you can also report safety concerns directly to the operator desk via Safety centre SOS.</div>` +
        `<button class="secondary" data-action="close-modal" style="width:100%;margin-top:16px;min-height:48px">Close</button>`;
    else if (key === "sos") {
      const activeTrip =
        this.active() ||
        (this.selectedRide
          ? this.state()?.rides.find((r) => r.id === this.selectedRide)
          : undefined);
      if (activeTrip) {
        body =
          `<div class="notice-box" style="margin:4px 0 16px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b">` +
          `<strong>Emergency Alert Notice:</strong> Tapping "Send SOS" sends an immediate incident flag with your live location to Hop's 24/7 safety dispatch. It does <em>not</em> place a phone call to emergency services.` +
          `</div>` +
          `<div class="section-card" style="margin-bottom:16px">` +
          `<div class="row"><div><small class="muted">CURRENT ASSIGNED TRIP</small><strong style="display:block;margin-top:2px">${escape(activeTrip.pickup_label)} → ${escape(activeTrip.dropoff_label)}</strong></div><span class="badge ${activeTrip.status === "in_progress" ? "green" : "neutral"}">${escape(activeTrip.status)}</span></div>` +
          `</div>` +
          `<div style="display:flex;flex-direction:column;gap:10px">` +
          `<button class="primary" data-account-action="sos" style="min-height:48px;background:#e54d36;border-color:#e54d36;color:#ffffff" ${this.busy ? "disabled" : ""}>` +
          `${this.busy ? "Sending SOS Alert…" : "Send SOS to Hop Operator"}${icon("arrow")}` +
          `</button>` +
          `<a href="tel:112" class="secondary" style="min-height:44px;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none">` +
          `${icon("phone")} Call Police / Ambulance (112)` +
          `</a>` +
          `<button class="text-button" data-action="close-modal" style="min-height:44px;width:100%">Cancel</button>` +
          `</div>`;
      } else {
        body =
          `<div class="empty-state" style="padding:16px 10px 14px">` +
          icon("shield") +
          `<h2>No Active Trip Found</h2>` +
          `<p style="margin-top:6px">Hop in-app SOS is linked to an assigned or in-progress trip. If you are experiencing an immediate emergency, please dial emergency services directly.</p>` +
          `</div>` +
          `<div class="notice-box" style="margin:12px 0 16px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b">` +
          `<strong>Emergency Services:</strong> For urgent medical, police, or fire assistance, dial 112 on your phone immediately.` +
          `</div>` +
          `<div style="display:flex;flex-direction:column;gap:10px">` +
          `<a href="tel:112" class="primary" style="min-height:48px;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;background:#e54d36;border-color:#e54d36;color:#ffffff">` +
          `${icon("phone")} Call 112 Emergency Services` +
          `</a>` +
          `<button class="secondary" data-go="activity" data-action="close-modal" style="min-height:44px">View Past Trips in My Rides</button>` +
          `<button class="text-button" data-action="close-modal" style="min-height:44px;width:100%">Close</button>` +
          `</div>`;
      }
    }
    else if (key === "report" || key === "lost-item") {
      const isLost = key === "lost-item";
      const descLabel = isLost ? "Describe the item" : "Describe the issue";
      const descPlaceholder = isLost
        ? "Add details about the item (color, brand, where you were sitting)…"
        : "Describe the issue with your trip or fare in detail…";
      const tripOptions = (this.state()?.rides || [])
        .filter((r) => (this.role === "rider" ? r.mine : r.driving))
        .map(
          (r) =>
            `<option value="${escape(r.id)}" ${r.id === this.selectedRide ? "selected" : ""}>${escape(r.pickup_label)} → ${escape(r.dropoff_label)} · ${escape(r.status)}</option>`,
        )
        .join("");
      body =
        `<p class="small muted" style="margin:4px 0 14px">${isLost ? "Report an item left behind in a vehicle. Our team will contact your captain." : "Submit a support or safety incident directly to our operations team."}</p>` +
        `<label class="field-label" for="account-ride">Trip</label>` +
        `<select class="text-input" id="account-ride" style="min-height:44px"><option value="">Current assigned trip</option>${tripOptions}</select>` +
        `<label class="field-label" for="account-report" style="margin-top:12px">${descLabel}</label>` +
        `<textarea class="text-input" id="account-report" rows="4" maxlength="2000" placeholder="${descPlaceholder}" style="min-height:88px;resize:vertical"></textarea>` +
        `<button class="primary" data-account-action="${key}" style="margin-top:16px;width:100%;min-height:48px" ${this.busy ? "disabled" : ""}>${this.busy ? "Submitting…" : isLost ? "Submit lost item report" : "Submit report"}${icon("arrow")}</button>`;
    }
    else if (key === "share") {
      const activeTrip =
        this.active() ||
        (this.selectedRide
          ? this.state()?.rides.find((r) => r.id === this.selectedRide)
          : undefined);
      if (activeTrip) {
        body =
          `<p class="muted small" style="margin:4px 0 14px">Generate a revocable live tracking link for your current ride. Anyone with this link can follow your route and Captain details in real time.</p>` +
          `<div class="section-card" style="margin-bottom:14px">` +
          `<div class="row"><div><small class="muted">ACTIVE TRIP</small><strong style="display:block;margin-top:2px">${escape(activeTrip.pickup_label)} → ${escape(activeTrip.dropoff_label)}</strong></div><span class="badge ${activeTrip.status === "in_progress" ? "green" : "neutral"}">${escape(activeTrip.status)}</span></div>` +
          `</div>` +
          (this.shareURL
            ? `<label class="field-label" for="trip-share-link">Live tracking link</label>` +
              `<div style="display:flex;gap:8px;margin-bottom:14px">` +
              `<input id="trip-share-link" class="text-input" style="flex:1" readonly value="${escape(this.shareURL)}" aria-label="Trip share link"/>` +
              `<button class="secondary" data-account-action="copy-share" style="padding:0 14px;min-height:44px;flex-shrink:0" title="Copy share link">${icon("copy")} Copy</button>` +
              `</div>`
            : "") +
          `<div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">` +
          `<button class="primary" data-account-action="share" style="min-height:44px" ${this.busy ? "disabled" : ""}>` +
          `${this.busy ? "Creating Link…" : this.shareURL ? "Refresh Share Link" : "Create Share Link"}${icon("arrow")}` +
          `</button>` +
          (this.shareURL
            ? `<button class="secondary" data-account-action="revoke-share" style="min-height:44px" ${this.busy ? "disabled" : ""}>Revoke Trip Links</button>`
            : "") +
          `<button class="text-button" data-action="close-modal" style="min-height:44px;width:100%">Done</button>` +
          `</div>`;
      } else {
        body =
          `<div class="empty-state" style="padding:16px 10px 14px">` +
          icon("location") +
          `<h2>No Active Journey</h2>` +
          `<p style="margin-top:6px">Trip sharing creates a real-time tracking link for your ongoing ride. Start a booking or select an active journey to share your route.</p>` +
          `</div>` +
          `<div class="notice-box" style="margin:12px 0 16px">` +
          `When shared, your trusted people can follow your live vehicle location and estimated arrival time on any mobile or desktop web browser.` +
          `</div>` +
          `<div style="display:flex;flex-direction:column;gap:10px">` +
          `<button class="secondary" data-go="activity" data-action="close-modal" style="min-height:44px">View My Rides</button>` +
          `<button class="primary" data-action="close-modal" style="min-height:44px">Got It</button>` +
          `</div>`;
      }
    }
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
    const modalTitles: Record<string, string> = {
      "personal-more": "Gender & date of birth",
      email: "Email address",
      verify: "Verify mobile number",
      business: "Business receipt details",
      contacts: "Emergency contacts",
      goal: "Daily earnings goal",
      payout: "Request payout",
      share: "Share trip",
      sos: "Emergency help",
      report: screen === "safety" ? "Report a safety concern" : "Report an issue",
      "lost-item": "Report a lost item",
      counter: "Fare offer",
      bids: "Captain offers",
      export: "Download my data",
      "delete-account": "Account deletion",
      "family-invite": "Invite family member",
      referral: "Redeem referral code",
      ridecheck: "RideCheck™ Safety Monitor",
      "safety-guidance": "Safety Guidance",
      "support-contact": "Call or email support",
      "add-place": "Save a familiar place",
      "edit-place": "Manage saved places",
      "sos-info": "Emergency action preview",
    };
    const modalTitle = modalTitles[key] || key.replaceAll("-", " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
    host.innerHTML =
      (modal
        ? `<div class="sheet-handle"></div><div class="modal-title"><h2 id="modal-title">${escape(modalTitle)}</h2><button class="icon-button" aria-label="Close dialog" data-action="close-modal">${icon("close")}</button></div>`
        : "") +
      body +
      (this.status ? `<p role="status" class="small muted" style="margin-top:12px">${escape(this.status)}</p>` : "");
    for (const el of host.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      "[id^=account-], #full-name",
    )) {
      const draft = this.drafts.get(`${key}:${el.id}`);
      if (draft) {
        el.value = draft.value;
        if ("checked" in el) (el as HTMLInputElement).checked = draft.checked;
      }
    }
    if (!modal) {
      if (key === "personal" || key === "preferences") {
        let bar = this.app.querySelector<HTMLElement>(".action-bar");
        const actionName =
          key === "personal" ? "save-personal" : "save-preferences";
        const accountAct = key === "personal" ? "profile" : "preferences";
        const labelText =
          key === "personal" ? "Save details" : "Save preferences";
        if (!bar) {
          const bodyEl = this.app.querySelector<HTMLElement>(".screen-body");
          if (bodyEl) {
            bodyEl.insertAdjacentHTML(
              "afterend",
              `<footer class="action-bar"><button class="primary" data-action="${actionName}" data-account-action="${accountAct}">${this.busy ? "Saving…" : labelText}${icon("arrow")}</button></footer>`,
            );
            bar = this.app.querySelector<HTMLElement>(".action-bar");
          }
        }
        if (bar) {
          bar.removeAttribute("hidden");
          bar.style.display = "";
          let actionBtn = bar.querySelector<HTMLButtonElement>("button");
          if (!actionBtn) {
            bar.innerHTML = `<button class="primary" data-action="${actionName}" data-account-action="${accountAct}">${this.busy ? "Saving…" : labelText}${icon("arrow")}</button>`;
          } else {
            actionBtn.dataset.action = actionName;
            actionBtn.dataset.accountAction = accountAct;
            actionBtn.disabled = this.busy;
            actionBtn.innerHTML = `${this.busy ? "Saving…" : labelText}${icon("arrow")}`;
          }
        }
      } else {
        const bar = this.app.querySelector<HTMLElement>(".action-bar");
        if (bar) {
          bar.setAttribute("hidden", "");
          bar.style.display = "none";
        }
      }
    }
  }
  private val(key: string) {
    const el = this.app.querySelector<HTMLInputElement | HTMLSelectElement>(
      `#account-${key}, #full-${key}, #${key}`,
    );
    return el?.value.trim() || "";
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
    const topupBtn = (e.target as Element).closest<HTMLElement>('[data-modal="topup"]');
    if (topupBtn) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.topupAmount = 500;
      this.status = "";
      this.statusError = false;
      this.bridge.update({ modal: "topup", amount: 500 });
      return;
    }

    const chip = (e.target as Element).closest<HTMLElement>("[data-topup-chip]");
    if (chip) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const val = Number(chip.dataset.topupChip);
      this.topupAmount = val;
      const input = this.app.querySelector<HTMLInputElement>("#topup-amount");
      if (input) input.value = String(val);
      this.app.querySelectorAll<HTMLElement>("[data-topup-chip]").forEach((c) => {
        c.classList.toggle("active", c.dataset.topupChip === String(val));
      });
      return;
    }

    const portraitBtn = (e.target as Element).closest<HTMLElement>(
      'button[data-action="portrait"], button[data-account-action="portrait"]',
    );
    if (portraitBtn) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.app.querySelector<HTMLInputElement>("input[data-account-photo]")?.click();
      return;
    }

    const closeBtn = (e.target as Element).closest<HTMLElement>(
      'button[data-action="close-modal"]',
    );
    if (closeBtn) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.bridge.update({ modal: null });
      return;
    }

    const quickPlaceBtn = (e.target as Element).closest<HTMLElement>(
      "[data-account-quick-place]",
    );
    if (quickPlaceBtn) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const kind = quickPlaceBtn.dataset.accountQuickPlace || "favorite";
      const label = quickPlaceBtn.dataset.quickLabel || "";
      const address = quickPlaceBtn.dataset.quickAddress || "";
      const kindSelect = this.app.querySelector<HTMLSelectElement>(
        "#account-location-kind",
      );
      const labelInput = this.app.querySelector<HTMLInputElement>(
        "#account-location-label",
      );
      const addressInput = this.app.querySelector<HTMLInputElement>(
        "#account-location-address",
      );
      if (kindSelect) kindSelect.value = kind;
      if (labelInput) labelInput.value = label;
      if (addressInput) addressInput.value = address;
      labelInput?.focus();
      return;
    }

    const b = (e.target as Element).closest<HTMLElement>("button");
    if (
      !b ||
      (!Object.keys(b.dataset).some((k) => k.startsWith("account")) &&
        b.dataset.action !== "save-personal" &&
        b.dataset.action !== "save-personal-more" &&
        b.dataset.action !== "save-email" &&
        b.dataset.action !== "save-business" &&
        b.dataset.action !== "save-place" &&
        b.dataset.action !== "copy-share")
    )
      return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (this.busy) return;
    const d = b.dataset;
    let a = d.accountAction;
    if (!a && d.action === "save-personal") a = "profile";
    if (!a && d.action === "save-personal-more") a = "personal-more";
    if (!a && d.action === "save-email") a = "email";
    if (!a && d.action === "save-business") a = "business";
    if (!a && d.action === "save-place") a = "save-location";
    if (!a && d.action === "copy-share") a = "copy-share";
    const v = (k: string) => this.val(k),
      checked = (k: string) => this.checked(k);
    const values = Object.fromEntries(
      Array.from(
        this.app.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
          "[id^=account-], #full-name",
        ),
      ).map((el) => [
        el.id.startsWith("account-") ? el.id.slice(8) : el.id === "full-name" ? "name" : el.id,
        (el as HTMLInputElement).type === "checkbox" ? (el as HTMLInputElement).checked : el.value.trim(),
      ]),
    );
    const value = (k: string) => String(values[k] || "");
    this.busy = true;
    this.status = "";
    this.statusError = false;
    void (async () => {
      if (a === "retry") {
        this.errors.clear();
        this.cache.clear();
        return;
      }
      if (a === "profile") {
        const name = (this.app.querySelector<HTMLInputElement>("#full-name, #account-name")?.value || v("name")).trim();
        if (!name) throw new Error("Enter your full name.");
        await api.request("/api/profile", {
          name,
        });
        if (this.photo) {
          await api.request("/api/profile/photo", { image: this.photo });
          this.photo = "";
        }
        this.cache.delete("/api/profile");
        this.status = "Personal details saved.";
        this.bridge.notify("Personal details saved.");
        await this.refresh();
      }
      if (a === "personal-more") {
        const cached = this.cache.get("/api/profile")?.details?.[0] || {};
        const gender = v("gender");
        const birth_date = v("birth_date");
        await api.request("/api/profile", {
          name: cached.name || (this.role === "captain" ? "Demo Captain" : "Demo Rider"),
          gender,
          birth_date,
        });
        this.cache.delete("/api/profile");
        this.status = "Personal details saved.";
        this.bridge.notify("Personal details saved.");
        this.bridge.update({ modal: null });
        await this.refresh();
        return;
      }
      if (a === "email") {
        const newEmail = v("email");
        if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
          throw new Error("Enter a valid email address.");
        }
        const cached = this.cache.get("/api/profile");
        if (cached?.details?.[0]) {
          cached.details[0].email = newEmail;
        }
        this.status = "Email address updated.";
        this.bridge.notify("Email address updated.");
        this.bridge.update({ modal: null });
        return;
      }
      if (a === "business") {
        const p = this.cache.get("/api/profile")?.details?.[0] || {};
        await api.request("/api/profile", {
          name: p.name || (this.role === "captain" ? "Demo Captain" : "Demo Rider"),
          company_name: v("company_name"),
          business_gstin: v("business_gstin"),
          cost_centre: v("cost_centre"),
          work_email: v("work_email"),
        });
        this.cache.delete("/api/profile");
        this.status = "Business details saved.";
        this.bridge.notify("Business details saved.");
        this.bridge.update({ modal: null });
        await this.refresh();
        return;
      }
      if (a === "photo") {
        if (!this.photo) throw new Error("Select a photo first.");
        await api.request("/api/profile/photo", { image: this.photo });
        this.photo = "";
        this.cache.delete("/api/profile");
        this.status = "Profile photo updated.";
        this.bridge.notify("Profile photo updated.");
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
          (this.config()?.development || api.isDevEnvironment(this.config()) || r.dev_code) && r.dev_code
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
        this.status = "Mobile number verified.";
        this.bridge.notify("Mobile number verified.");
        this.bridge.update({ modal: null });
        await this.refresh();
        return;
      }
      if (a === "preferences" || a === "save-preferences") {
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
      if (a === "copy-share") {
        const input = this.app.querySelector<HTMLInputElement>(
          "#trip-share-link, input[aria-label='Trip share link']",
        );
        const urlToCopy = input?.value.trim() || this.shareURL;
        if (urlToCopy) {
          try {
            await navigator.clipboard.writeText(urlToCopy);
            this.status = "Trip link copied to clipboard.";
            this.bridge.notify("Trip link copied to clipboard.");
          } catch {
            this.status = "Copy link manually from the input.";
          }
        }
        return;
      }
      if (a === "sos") {
        await api.request(
          `/api/rides/${encodeURIComponent(this.trip().id)}/sos`,
          {},
        );
        this.status =
          "SOS incident sent to the operator. No emergency call was placed.";
        this.bridge.notify(this.status);
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
        this.bridge.notify(this.status);
        return;
      }
      if (a === "revoke-share") {
        await api.request(
          `/api/rides/${encodeURIComponent(this.trip().id)}/share/revoke`,
          {},
        );
        this.shareURL = "";
        this.status = "Trip share links have been revoked.";
        this.bridge.notify(this.status);
        return;
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
        this.status = "Saved place removed.";
        this.bridge.notify(this.status);
        await this.refresh();
      }
      if (a === "save-location") {
        const p = (this.bridge.read() as Data).liveDestination;
        const kind = v("location-kind") || v("place-kind") || "favorite";
        const label =
          v("location-label") ||
          v("place-name") ||
          (kind === "home" ? "Home" : kind === "work" ? "Work" : "Favorite");
        const address =
          v("location-address") || v("place-address") || p?.label;
        if (!p && !address)
          throw new Error("Select a destination in booking search or enter an address first.");
        await api.request("/api/locations", {
          kind,
          label,
          place_label: address || p?.label || "Chennai",
          lat: p?.lat ?? 13.0067,
          lng: p?.lng ?? 80.255,
        });
        this.status = "Saved place added.";
        this.bridge.notify(this.status);
        if (this.bridge.read().modal === "add-place") {
          this.bridge.update({ modal: null });
        }
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
        const input = this.app.querySelector<HTMLInputElement>("#topup-amount");
        const valStr = input?.value.trim() || v("topup-amount") || String(this.topupAmount || "");
        const amount = Math.round(Number(valStr) * 100);
        if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 10000000)
          throw new Error("Choose an amount from ₹10 to ₹100,000.");
        const account =
          this.cache.get("/api/profile")?.details?.[0]?.id ||
          (await api.session()).user.id;
        const key = `hop.wallet.account.pending:${account}`;
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
          this.statusError = false;
          this.bridge.update({ modal: null, balance: order.balance_paise / 100 });
          this.bridge.notify(`Added ₹${(amount / 100).toLocaleString("en-IN")} to your wallet.`);
          await this.load("/api/wallet");
          return;
        }
        sessionStorage.setItem(key, JSON.stringify(order));
        const verification = await checkout(order);
        await api.request("/api/wallet/verify", verification);
        sessionStorage.removeItem(key);
        this.cache.delete("/api/wallet");
        this.status = "Top-up verified by the backend.";
        this.statusError = false;
        this.bridge.update({ modal: null });
        this.bridge.notify("Top-up verified by the backend.");
        await this.load("/api/wallet");
        return;
      }
      if (a === "wallet-payment") {
        this.bridge.notify(
          "Wallet top-up is available in Payment & receipt for a started or completed trip.",
        );
        return;
      }
      this.drafts.clear();
      this.status ||= "Saved by the server.";
    })()
      .catch((err) => {
        this.status = err.message;
        this.statusError = true;
        this.bridge.notify(this.status);
      })
      .finally(() => {
        this.busy = false;
        this.render(true);
      });
  };
}
