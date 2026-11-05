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
  // Monthly pass card on Earnings. Shown only when a pass is needed or the captain has one.
  private passCard() {
    const pass = this.get("/api/drivers/pass");
    if (!pass) return "";
    if (!pass.required && !pass.active && !pass.paid_until) return "";
    const until = pass.paid_until ? this.day(pass.paid_until) : "";
    const badge = pass.active
      ? `<span class="badge green">Active</span>`
      : `<span class="badge ${pass.required ? "warn" : "neutral"}">${pass.required ? "Needed" : "Not active"}</span>`;
    const detail = pass.active
      ? `Paid until ${until}`
      : pass.required
        ? "You need a pass to go online in your zone"
        : "Not needed in your zone right now";
    return `<div class="section-card" style="margin:14px 0"><div class="row"><div><small class="muted">MONTHLY PASS</small><strong style="display:block;margin-top:2px">${escape(detail)}</strong></div>${badge}</div><p class="micro muted" style="margin:6px 0 10px">${money(pass.price_paise / 100)} for ${Number(pass.days)} days. No commission on your fares.</p><button class="${pass.active ? "secondary" : "primary"}" data-modal="pass">${pass.active ? "View pass" : "Get a pass"}</button></div>`;
  }
  private passSheet(pass: Data) {
    const price = money(pass.price_paise / 100);
    const balance = Number(pass.balance_paise || 0);
    let action = "";
    if (!pass.can_buy)
      action = `<div class="notice-box">You can renew from ${escape(this.day(pass.renew_from))}, in the last ${Number(pass.renew_days)} days of your pass.</div>`;
    else if (balance < pass.price_paise)
      action = `<div class="notice-box">Your Hop balance is ${money(balance / 100)}. To pay in cash, contact Hop support and they will add the pass for you.</div>`;
    else action = this.action("buy-pass", `Pay ${price} from earnings`);
    const starts = pass.paid_until ? `Starts when your current pass ends (${escape(this.day(pass.paid_until))}).` : "Starts as soon as you pay.";
    const history = ((pass.history || []) as Data[])
      .map((h) => `<div class="list-row"><span class="list-text"><strong>${escape(this.day(h.starts_at))} – ${escape(this.day(h.ends_at))}</strong><small>${h.source === "operator" ? "Added by Hop" : "Paid from earnings"}</small></span><span class="right"><strong>${money(Number(h.price_paise || 0) / 100)}</strong></span></div>`)
      .join("");
    return `<div class="row" style="margin:6px 0 4px"><span class="muted small">Price</span><strong>${price} · ${Number(pass.days)} days</strong></div><div class="row" style="margin-bottom:12px"><span class="muted small">Hop balance</span><strong>${money(balance / 100)}</strong></div><p class="small muted" style="margin:0 0 14px">${starts} You keep the full fare on every trip while your pass is active.</p>${action}${history ? `<div class="section-label" style="margin-top:18px">Your passes</div>${history}` : ""}`;
  }
  private day(value: string) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  }
  private select(key: string, label: string, items: string[], value: string, labels: Record<string, string> = {}) {
    return `<label class="field-label" for="account-${key}">${label}</label><select class="text-input" id="account-${key}">${items.map((v) => `<option value="${escape(v)}" ${value === v ? "selected" : ""}>${escape(labels[v] || v)}</option>`).join("")}</select>`;
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
    }
    // The renderer's offer card advertises a sample code (HOP50) that doesn't exist. Real promo
    // codes are entered when reviewing a ride.
    this.app.querySelector(".screen-padding > .offer-card")?.remove();
    if (hero) {
      const amountEl = hero.querySelector(".amount");
      if (amountEl && data && Number.isSafeInteger(data.balance_paise)) {
        const balance = data.balance_paise / 100;
        this.bridge.assign({ balance });
        // money() already shows paise when there are any; add the faded ".00" only for whole rupees.
        amountEl.innerHTML = Number.isInteger(balance)
          ? `${money(balance)}<span style="font-size:19px;opacity:.5">.00</span>`
          : money(balance);
      } else if (amountEl) {
        amountEl.textContent = "—";
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
    if (label && notice) {
      const entries: Data[] = data?.entries || data?.ledger || [];
      let next = label.nextElementSibling;
      while (next && next !== notice) {
        const toRemove = next;
        next = next.nextElementSibling;
        toRemove.remove();
      }
      if (!data) {
        const error = this.errors.get("/api/wallet");
        label.insertAdjacentHTML("afterend", `<div class="notice-box" role="${error ? "alert" : "status"}">${escape(error || "Loading your wallet…")}${error ? this.action("retry", "Try again", "secondary") : ""}</div>`);
      } else if (entries.length > 0) {
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
      html += `<div class="section-card live-ledger-balance"><small class="muted">AVAILABLE BALANCE</small><strong>${data ? money(data.balance_paise / 100) : "—"}</strong><button class="primary" data-modal="payout">Request payout</button></div>`;
    }

    if (data && Array.isArray(entries)) {
      if (entries.length > 0) {
        html += entries.map((e) => this.formatWalletEntry(e)).join("");
      } else {
        html += `<p class="micro muted" style="margin:16px 4px">No transactions recorded yet.</p>`;
      }
    } else {
      const error = this.errors.get(path);
      html += `<div class="notice-box" role="${error ? "alert" : "status"}">${escape(error || "Loading transactions…")}${error ? this.action("retry", "Try again", "secondary") : ""}</div>`;
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
      ? `<strong style="color:#3a2fb8">+${amountFormatted}</strong>`
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
      tools: "driver",
    };
    const modalPaths: Record<string, string> = {
      business: "/api/profile",
      verify: "/api/profile",
      "personal-more": "/api/profile",
      email: "/api/profile",
      contacts: "/api/profile",
      goal: "driver",
      payout: "/api/drivers/wallet",
      pass: "/api/drivers/pass",
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
      // Daily goal row: today's fares against the captain's own goal (none set → no target).
      const goal = ((this.state()?.driver?.[0] as Data)?.daily_goal_paise || 0) / 100;
      const today = earnings ? earnings.today_fare_paise / 100 : 0;
      const goalRow = Array.from(this.app.querySelectorAll(".sheet .row.small")).find((row) =>
        row.textContent?.includes("Daily goal"),
      );
      const amount = goalRow?.querySelector("strong");
      if (amount)
        amount.textContent = !earnings
          ? "Loading earnings…"
          : goal > 0
            ? `${money(today)} / ${money(goal)}`
            : `${money(today)} · no goal set`;
      this.app
        .querySelectorAll<HTMLElement>(".sheet .progress-track i")
        .forEach((el) => (el.style.width = `${goal > 0 ? Math.min(100, (today / goal) * 100) : 0}%`));
      // The row under the bar replaces the sample "6 trips today".
      const trips = this.app.querySelector(".sheet .row:not(.small) > span.small.muted");
      if (trips)
        trips.textContent = earnings
          ? `${earnings.today_completed_trips} ${earnings.today_completed_trips === 1 ? "trip" : "trips"} today`
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
    if (!modal && screen === "privacy") {
      const notice = this.app.querySelector(".notice-box");
      if (notice) notice.textContent = "Manage your account data and privacy. Account changes require confirmation.";
      const detail = this.app.querySelector('[data-modal="export"] small');
      if (detail) detail.textContent = "Download your account information";
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
      modal ? ".modal-sheet" : screen === "demand" ? ".screen-body > .sheet" : ".screen-padding",
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
      body = this.errors.has(path)
        ? `<div class="notice-box" role="alert"><p>${escape(this.errors.get(path))}</p>${btn("retry", "Retry")}</div>`
        : `<div class="notice-box" role="status" aria-busy="true">Loading your information…</div>`;
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
        `<div class="notice-box">Keep your contact details up to date so we can reach you about your rides.</div>`;
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
      const uiState = this.bridge.read() as Data;
      const vehicleLabel = String(uiState.vehicle || "auto").replace(/^./, (m) => m.toUpperCase());
      const paymentLabel = String(uiState.payment || "Cash");
      const accessSettings = ([
            ["wheelchair_access", "Wheelchair access"],
            ["hearing_impaired", "Hearing assistance"],
            ["visually_impaired", "Low vision assistance"],
            ["extra_assistance", "Boarding assistance"],
            ["large_text", "Larger text"],
            ["notifications_enabled", "Trip notifications"],
          ] as string[][])
          .map(
            ([k, l]) =>
              `<label class="toggle-row live-setting-toggle"><span><strong>${l}</strong></span><input type="checkbox" role="switch" id="account-${k}" ${prefs[k] ? "checked" : ""}/><span class="switch" aria-hidden="true"></span></label>`,
          )
          .join("");
      body = `<div class="live-preferences-page">${this.role === "captain" ? `<div class="live-page-intro"><span class="live-eyebrow">DRIVING</span><h2>Set the trips that work for you.</h2><p>Choose your pickup range and minimum fare. These settings guide trip matching.</p></div><section class="live-card-group"><div class="live-field-block"><label class="field-label" for="account-pickup_radius_meters">Pickup radius</label><div class="live-field-hint">How far away trip requests can be</div><div class="live-input-with-unit"><input class="text-input" id="account-pickup_radius_meters" type="number" value="${escape(driver?.pickup_radius_meters || 3000)}"/><span>metres</span></div></div><div class="live-field-block"><label class="field-label" for="account-minimum_fare">Minimum fare</label><div class="live-field-hint">Skip requests below this amount</div><div class="live-input-with-unit"><input class="text-input" id="account-minimum_fare" type="number" value="${escape((driver?.minimum_fare_paise || 0) / 100)}"/><span>₹</span></div></div></section>` : `<div class="live-page-intro"><span class="live-eyebrow">MAKE IT YOURS</span><h2>Your ride, your way.</h2><p>Set your usual ride options and accessibility preferences.</p></div><section class="live-card-group">${this.modalRow("Default vehicle", vehicleLabel, "car", "vehicle-default")}${this.modalRow("Default payment", paymentLabel, "wallet", "payment")}</section>`}<div class="live-section-heading">App settings</div><section class="live-card-group">${this.select("language", "Language", ["en", "hi", "ta", "te", "kn", "ml", "bn", "mr", "gu", "pa"], prefs.language || "en", { en: "English", hi: "Hindi", ta: "Tamil", te: "Telugu", kn: "Kannada", ml: "Malayalam", bn: "Bengali", mr: "Marathi", gu: "Gujarati", pa: "Punjabi" })}${accessSettings}<button type="button" class="live-preference-row" data-modal="appearance"><span class="list-icon">${icon("moon")}</span><span><strong>Appearance</strong><small>Choose light or dark theme</small></span><span class="live-row-chevron">›</span></button></section></div>`;
    } else if (key === "tools") {
      body = `<div class="live-tools-page"><div class="live-page-intro"><span class="live-eyebrow">CAPTAIN TOOLKIT</span><h2>Make your day work for you.</h2><p>Keep an eye on your goal, trip settings and breaks.</p></div><div class="live-section-heading">Your workday</div><section class="live-card-group"><div class="live-tool-goal"><span class="list-icon">${icon("chart")}</span><div><strong>Daily earnings goal</strong><small>Today’s completed fares</small><b>${this.cache.get("/api/drivers/earnings")?.summary ? money(this.cache.get("/api/drivers/earnings")!.summary.today_fare_paise / 100) : "—"}</b></div><button class="text-button" data-modal="goal">Edit</button></div><button class="live-tool-action" data-action="home-mode"><span class="list-icon">${icon("navigation")}</span><span><strong>Head towards home</strong><small>Prefer trips in the direction of home</small></span><span class="live-row-chevron">›</span></button></section><div class="live-section-heading">On the road</div><section class="live-card-group"><button class="live-tool-action" data-modal="service-area"><span class="list-icon">${icon("pin")}</span><span><strong>Operating city</strong><small>View your service area</small></span><span class="live-row-chevron">›</span></button><button class="live-tool-action" data-go="demand"><span class="list-icon">${icon("layers")}</span><span><strong>Demand nearby</strong><small>Explore active pickup areas</small></span><span class="live-row-chevron">›</span></button><button class="live-tool-action" data-go="preferences"><span class="list-icon">${icon("settings")}</span><span><strong>Driving preferences</strong><small>Pickup radius and minimum fare</small></span><span class="live-row-chevron">›</span></button><button class="live-tool-action" data-go="insights"><span class="list-icon">${icon("shield")}</span><span><strong>Driving insights</strong><small>Your trip activity and feedback</small></span><span class="live-row-chevron">›</span></button></section><button class="live-break-action secondary" data-action="take-break">Take a break</button></div>`;
    } else if (key === "earnings") {
      const sum = data?.summary || {};
      const fare = (paise: number | undefined) => money((paise || 0) / 100);
      const trips = Number(sum.today_completed_trips || 0);
      const rides = (data?.rides || []) as Data[];
      body = `<div class="live-earnings-page"><div class="wallet-hero"><small>TODAY'S COMPLETED FARES</small><div class="amount">${fare(sum.today_fare_paise)}</div><p>${trips} completed ${trips === 1 ? "trip" : "trips"}</p></div>`
        + `<div class="live-earnings-stats"><div><small>This week</small><strong>${fare(sum.week_fare_paise)}</strong></div><div><small>This month</small><strong>${fare(sum.month_fare_paise)}</strong></div><div><small>All time</small><strong>${fare(sum.all_time_fare_paise)}</strong></div></div>`
        + `<section class="live-card-group"><button class="live-tool-action" data-go="ledger"><span class="list-icon">${icon("wallet")}</span><span><strong>Ledger & payouts</strong><small>Balance, payout requests and history</small></span><span class="live-row-chevron">›</span></button></section>`
        + this.passCard()
        + `<div class="live-section-heading">Recent trips</div>`
        + (rides.length
          ? `<section class="live-card-group">${rides.map((r) => `<div class="live-earnings-trip"><span>${escape(r.pickup_label)} → ${escape(r.dropoff_label)}</span><strong>${fare(r.fare_paise)}</strong></div>`).join("")}</section>`
          : `<p class="live-page-note">Completed trips will appear here.</p>`)
        + `<p class="live-page-note">Fares riders paid for completed trips. Payouts to your bank are shown in Ledger & payouts.</p></div>`;
    } else if (key === "pass") body = this.passSheet(data || {});
    else if (key === "payout")
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
    else if (key === "vehicle") {
      const vehicleName = [driver?.vehicle_make, driver?.vehicle_model].filter(Boolean).join(" ") || "Vehicle details pending";
      const vehicleNumber = driver?.vehicle_number || "Registration not supplied";
      const status = driver?.status || "Not applied";
      const documentRow = (title: string, detail: string, ico: string) => `<div class="live-document-row"><span class="list-icon">${icon(ico)}</span><span><strong>${title}</strong><small>${escape(detail)}</small></span><span class="live-row-chevron">›</span></div>`;
      // Show the vehicle type the captain applied with (bike, auto, mini, sedan or SUV).
      const categoryNames: Record<string, string> = { bike: "Bike", auto: "Auto-rickshaw", mini: "Mini cab", sedan: "Sedan", suv: "SUV" };
      const category = String(driver?.vehicle_category || "");
      const art = categoryNames[category]
        ? `<img src="./assets/${category}.png" alt="" draggable="false"/>`
        : icon("car");
      body = `<div class="live-vehicle-page"><section class="live-vehicle-card"><div class="live-vehicle-art">${art}</div><div><span class="live-eyebrow">YOUR VEHICLE${categoryNames[category] ? ` · ${categoryNames[category].toUpperCase()}` : ""}</span><h2>${escape(vehicleName)}</h2><span class="live-vehicle-plate">${escape(vehicleNumber)}</span></div></section><div class="live-status-card"><span><small>APPLICATION STATUS</small><strong>${escape(status.replaceAll("_", " "))}</strong></span><span class="badge ${status === "approved" ? "green" : "neutral"}">${escape(status.replaceAll("_", " "))}</span></div><div class="live-page-intro live-doc-intro"><h2>Vehicle & documents</h2><p>Review your submitted information and private documents.</p></div><section class="live-card-group">${documentRow("Driving licence", driver?.license_expires ? `Expires ${escape(driver.license_expires.slice(0, 10))}` : "Expiry date not supplied", "file")}${documentRow("Registration certificate", driver?.vehicle_number ? "Submitted with your application" : "Not supplied", "file")}${documentRow("Vehicle insurance", driver?.insurance_expires ? `Expires ${escape(driver.insurance_expires.slice(0, 10))}` : "Expiry date not supplied", "shield")}</section><button class="live-vehicle-action primary" data-go="onboarding">View application & private documents</button><p class="live-page-note">Vehicle changes and document approvals are reviewed by the operator.</p></div>`;
    }
    else if (key === "rewards") {
      const referral = data?.referral?.[0] || {};
      body = `<div class="live-rewards-page"><div class="live-page-intro"><span class="live-eyebrow">HOP REWARDS</span><h2>Good rides bring good things.</h2><p>Invite friends and keep track of the points you’ve earned.</p></div><section class="live-points-card"><span>YOUR REWARD POINTS</span><strong>${Number(referral.points || 0)}</strong><small>Points collected from eligible rides</small></section><div class="live-section-heading">Invite a friend</div><section class="live-referral-card"><span class="live-eyebrow">YOUR REFERRAL CODE</span><div class="live-referral-code">${escape(referral.code || "Unavailable")}</div><p>Share your code with a friend when they join Hop.</p><button class="secondary" data-action="copy-code">${icon("copy", "tiny-icon")} Copy code</button></section><button class="live-referral-redeem" data-modal="referral"><span class="list-icon">${icon("gift")}</span><span><strong>Have a referral code?</strong><small>Enter a code shared with you</small></span><span class="live-row-chevron">›</span></button>${(data?.rewards || []).length ? `<div class="live-section-heading">Your rewards activity</div><section class="live-card-group">${(data?.rewards || []).map((r: Data) => `<div class="live-reward-row"><strong>${Number(r.points)} points</strong><span>${escape(r.reason)}</span></div>`).join("")}</section>` : `<p class="live-page-note">Your reward activity will appear here when you earn points.</p>`}</div>`;
    }
    else if (key === "referral")
      body =
        this.field("referral", "Referral code") +
        btn("referral", "Redeem code");
    else if (key === "family")
      body =
        ((data?.family || []).length === 0
          ? `<div class="family-empty-card"><span class="family-empty-icon">${icon("heart")}</span><strong>Your people, all in one place</strong><p>Invite a family member to make planning rides together easier.</p></div>`
          : "") +
        (data?.family || [])
          .map(
            (m: Data) =>
              `<div class="section-card"><strong>${escape(m.name)}</strong><p>${escape(m.status)}</p>${m.status === "pending" && m.role === "member" ? `<button class="secondary" data-account-family-accept="${escape(m.id)}">Accept invitation</button>` : ""}<button class="text-button" data-account-family-delete="${escape(m.id)}">Remove</button></div>`,
          )
          .join("") +
        `<button class="secondary" data-modal="family-invite">Invite family member</button><div class="section-label">Favourite captains</div>` +
        ((data?.favorite_drivers || []).length === 0
          ? `<div class="family-empty-card compact"><span class="family-empty-icon">${icon("car")}</span><strong>No favourites yet</strong><p>Captains you save after a ride will appear here.</p></div>`
          : "") +
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
            return `<div class="list-row"><span class="list-icon">${icon(ico)}</span><span class="list-text"><strong>${escape(p.label)}</strong><small>${escape(p.place_label || "Saved destination")}</small></span><button class="text-button" data-account-location-delete="${escape(p.id)}" style="min-height:44px;padding:8px 12px;font-size:12px;color:var(--muted)">Remove</button></div>`;
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
            address: "Add your home address",
            ico: "home",
          });
        }
        if (!hasWork) {
          suggestions.push({
            kind: "work",
            label: "Work",
            address: "Add your work address",
            ico: "briefcase",
          });
        }
        if (locs.length === 0 && !hasHome && !hasWork) {
          suggestions.push({
            kind: "favorite",
            label: "Favourite",
            address: "A place you go often",
            ico: "pin",
          });
        }

        if (suggestions.length > 0) {
          suggestionsHtml =
            `<div class="section-label" style="margin-top:16px">Quick suggestions <span>Not set yet</span></div>` +
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
        `<label class="field-label" for="account-location-kind" style="margin-top:0">Type of place</label>` +
        `<select class="text-input" id="account-location-kind">` +
        `<option value="favorite">Favourite</option>` +
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
        `<option value="favorite">Favourite</option>` +
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
        `<p style="margin-top:8px">While your trip is under way and the Hop app is open, Hop watches the captain's live GPS. If the ride leaves the planned route for 45 seconds, or stops for 4 minutes away from your destination, the map asks whether everything is okay.</p>` +
        `</div>` +
        `<div class="notice-box" style="margin:14px 0 18px">` +
        `<strong>How RideCheck works:</strong><br/>` +
        `• It uses only the captain's measured GPS position.<br/>` +
        `• The check-in stays on screen until you answer: you're fine, share your trip, or get help.<br/>` +
        `• Get help raises an SOS with the Hop operations team. It doesn't call emergency services.` +
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
        `<div class="list-icon" style="flex-shrink:0;width:32px;height:32px;border-radius:8px;background:#ecebfd;color:#3a2fb8">${icon("check", "tiny-icon")}</div>` +
        `<div><strong style="font-size:12px;display:block">1. Verify vehicle & plate number</strong><small style="color:var(--muted);font-size:10px;line-height:1.4;display:block;margin-top:2px">Check the vehicle model, color, and registration plate before opening the door.</small></div>` +
        `</div>` +
        `<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px">` +
        `<div class="list-icon" style="flex-shrink:0;width:32px;height:32px;border-radius:8px;background:#ecebfd;color:#3a2fb8">${icon("user", "tiny-icon")}</div>` +
        `<div><strong style="font-size:12px;display:block">2. Confirm Captain name</strong><small style="color:var(--muted);font-size:10px;line-height:1.4;display:block;margin-top:2px">Ask your Captain who they are picking up to make sure they know your name.</small></div>` +
        `</div>` +
        `<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px">` +
        `<div class="list-icon" style="flex-shrink:0;width:32px;height:32px;border-radius:8px;background:#ecebfd;color:#3a2fb8">${icon("lock", "tiny-icon")}</div>` +
        `<div><strong style="font-size:12px;display:block">3. Share pickup PIN at start</strong><small style="color:var(--muted);font-size:10px;line-height:1.4;display:block;margin-top:2px">Provide your 4-digit start PIN only after you are safely in the correct vehicle.</small></div>` +
        `</div>` +
        `<div style="display:flex;gap:12px;align-items:flex-start">` +
        `<div class="list-icon" style="flex-shrink:0;width:32px;height:32px;border-radius:8px;background:#ecebfd;color:#3a2fb8">${icon("location", "tiny-icon")}</div>` +
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
          `<button class="primary" data-account-action="sos" style="min-height:48px;background:#c62f2f;border-color:#c62f2f;color:#ffffff" ${this.busy ? "disabled" : ""}>` +
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
          `<a href="tel:112" class="primary" style="min-height:48px;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;background:#c62f2f;border-color:#c62f2f;color:#ffffff">` +
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
        `<p>${p.deletion_requested_at ? "Account deletion has been requested. You can cancel during the recovery window." : "Request account deletion. You can cancel during the recovery window. This is a real account action."}</p><label class="toggle-row"><span>I confirm this account deletion request</span><input type="checkbox" id="account-confirm-deletion"/></label>` +
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
              `<div class="section-card"><strong>Nearby pickup area</strong><p>${Number(c.requests || 0)} requests · ${Number(c.drivers || 0)} online Captains</p></div>`,
          )
          .join("") || '<div class="notice-box" role="status">No recent requests nearby. Check again in a little while.</div>';
    else if (key === "insights") {
      const totals = data?.totals?.[0];
      const metric = (label: string, value: string) => `<div class="live-insight-stat"><span>${label}</span><strong>${escape(value)}</strong></div>`;
      body = `<div class="live-page-intro"><span class="live-eyebrow">YOUR DRIVING</span><h2>Every trip adds up.</h2><p>Distance, fares and feedback from your completed trips.</p></div>`;
      if (!totals) body += `<div class="notice-box" role="status">Trip insights aren’t available yet. Check back after your next completed trip.</div>`;
      else if (!Number(totals.trips)) body += `<div class="empty-state"><h2>Your journey starts here.</h2><p>Complete your first trip to see your driving insights.</p><button class="primary" data-go="drive">Back to driving</button></div>`;
      else {
        body += `<div class="live-insight-grid">${metric("Completed trips", String(totals.trips))}${metric("Distance travelled", `${(Number(totals.meters || 0) / 1000).toFixed(1)} km`)}${metric("Average fare", money(Number(totals.avg_fare_paise || 0) / 100))}${metric("Average pickup", `${Math.round(Number(totals.avg_pickup_seconds || 0) / 60)} min`)}${metric("Rider rating", totals.avg_rating == null ? "Not rated yet" : `${totals.avg_rating} / 5`)}${metric("Best fare", money(Number(totals.best_fare_paise || 0) / 100))}</div>`;
        for (const [key, heading, label] of [["days", "Last seven days", "day"], ["areas", "Popular destinations", "area"], ["methods", "Payment methods", "method"], ["types", "Trip types", "trip_type"]]) {
          if (data?.[key]?.length) body += `<div class="live-section-heading">${heading}</div><div class="live-card-group">${data[key].map((row: Data) => `<div class="live-insight-row"><span><strong>${escape(row[label])}</strong><small>${Number(row.trips || 0)} trips</small></span><strong>${money(Number(row.fare_paise || 0) / 100)}</strong></div>`).join("")}</div>`;
        }
      }
    }
    if (key === "demand") body = `<div class="sheet-handle"></div><div class="live-page-intro"><h2>Demand nearby</h2><p>Recent requests in your operating city.</p></div>${body}`;
    const modalTitles: Record<string, string> = {
      "personal-more": "Gender & date of birth",
      email: "Email address",
      verify: "Verify mobile number",
      business: "Business receipt details",
      contacts: "Emergency contacts",
      goal: "Daily earnings goal",
      payout: "Request payout",
      pass: "Monthly pass",
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
      (this.status && !this.loading.has(path) ? `<p role="status" class="small muted" style="margin-top:12px">${escape(this.status)}</p>` : "");
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
      if (labelInput) labelInput.value = label === "Favourite" ? "" : label;
      // Suggestions carry no address: the rider picks or types their own (a place chosen in
      // search stays filled in).
      void address;
      (label === "Favourite" ? labelInput : addressInput || labelInput)?.focus();
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
      if (a === "buy-pass") {
        const pass = this.cache.get("/api/drivers/pass");
        if (!pass) throw new Error("Pass details are still loading. Try again.");
        try {
          await api.request("/api/drivers/pass", { price_paise: pass.price_paise });
        } finally {
          // The price, balance or end date may have changed either way.
          this.cache.delete("/api/drivers/pass");
          this.cache.delete("/api/drivers/wallet");
        }
        this.status = "Pass bought. It's paid from your Hop balance.";
        return;
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
            "Test credit added. No real money was charged.";
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
        this.status = "Top-up confirmed.";
        this.statusError = false;
        this.bridge.update({ modal: null });
        this.bridge.notify("Top-up confirmed.");
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
