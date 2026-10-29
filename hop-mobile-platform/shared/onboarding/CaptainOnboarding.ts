import { api } from "../services/client";
import { escape } from "../helpers";
import { icon } from "../icons";
import type { Config, State } from "../services/contracts";

export type OnboardingBridge = {
  read: () => Record<string, any>;
  assign: (patch: Record<string, any>) => void;
  update: (patch: Record<string, any>) => void;
  go: (screen: string) => void;
  notify: (message: string) => void;
};

type Draft = Record<string, string | number> & { step: number };

type Evidence = {
  draft: Partial<Draft>;
  documents: { kind: string }[];
  has_photo: boolean;
  phone_verified: boolean;
};

const vehicleCategories = [
  { id: "bike", name: "Bike", seats: "1 seat", image: "./assets/bike.png" },
  { id: "auto", name: "Auto", seats: "3 seats", image: "./assets/auto.png" },
  { id: "mini", name: "Mini", seats: "4 seats", image: "./assets/mini.png" },
  { id: "sedan", name: "Sedan", seats: "4 seats", image: "./assets/sedan.png" },
  { id: "suv", name: "SUV", seats: "6 seats", image: "./assets/suv.png" },
];

const documents = [
  { kind: "license", label: "Driving licence", icon: "file" },
  { kind: "rc", label: "Registration certificate", icon: "file" },
  { kind: "insurance", label: "Insurance policy", icon: "shield" },
  { kind: "identity", label: "Government identity", icon: "lock" },
];

const fields = [
  ["vehicle_number", "Vehicle registration number"],
  ["vehicle_make", "Vehicle make"],
  ["vehicle_model", "Vehicle model"],
  ["vehicle_color", "Vehicle colour"],
  ["license_reference", "Driving licence number"],
  ["license_expires", "Licence expiry", "date"],
  ["insurance_reference", "Insurance policy number"],
  ["insurance_expires", "Insurance expiry", "date"],
  ["upi_id", "UPI ID (optional)"],
];

export class CaptainOnboarding {
  private evidence?: Evidence;
  private name = "";
  private phone = "";
  private draft: Draft = { step: 0, area_id: "", vehicle_category: "bike" };
  private loading = false;
  private attempted = false;
  private busy = false;
  private error = "";
  private sent = false;
  private submitted = false;
  private lastStatus = "";
  private retryAt = 0;
  private preview?: { image: string; endpoint: string };

  constructor(
    private app: HTMLElement,
    private bridge: OnboardingBridge,
    private config: () => Config | undefined,
    private state: () => State | undefined,
    private refresh: () => Promise<void>,
    private close?: () => void,
  ) {
    app.addEventListener("click", this.onClick, true);
    app.addEventListener("input", this.onInput, true);
    app.addEventListener("change", this.onChange, true);
  }

  show() {
    this.sync();
  }

  sync() {
    if (this.bridge.read().screen !== "onboarding") return;
    if (!this.attempted && !this.loading) void this.load();
    const status = this.state()?.driver?.[0]?.status || "";
    if (!this.app.querySelector("[data-captain-onboarding]") || status !== this.lastStatus) {
      this.lastStatus = status;
      this.render();
    }
  }

  destroy() {
    this.app.removeEventListener("click", this.onClick, true);
    this.app.removeEventListener("input", this.onInput, true);
    this.app.removeEventListener("change", this.onChange, true);
  }

  private async load() {
    this.loading = true;
    this.attempted = true;
    try {
      const [evidence, profile] = await Promise.all([
        api.request<Evidence>("/api/drivers/onboarding"),
        api.request<{ details: { name: string; phone: string }[] }>(
          "/api/profile",
        ),
      ]);
      this.evidence = evidence;
      this.draft = {
        ...this.draft,
        ...evidence.draft,
        step: Math.max(0, Math.min(3, Number(evidence.draft?.step) || 0)),
      };
      this.bridge.update({ onboard: this.draft.step });
      this.name = profile.details[0]?.name || "";
      this.phone = profile.details[0]?.phone || "";
      this.error = "";
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private field(
    key: string,
    label: string,
    type = "text",
    value: string | number = this.draft[key] || "",
    placeholder = "",
  ) {
    return `<label class="field-label" for="captain-${key}">${label}</label><input class="text-input" id="captain-${key}" data-captain-field="${key}" type="${type}" value="${escape(String(value))}" ${placeholder ? `placeholder="${escape(placeholder)}"` : ""}/>`;
  }

  private render() {
    if (this.bridge.read().screen !== "onboarding") return;
    const host = this.app.querySelector<HTMLElement>(".screen-padding");
    if (!host) return;
    host.setAttribute("data-captain-onboarding", "");
    const step = this.draft.step;
    const driver = this.state()?.driver?.[0];
    const areas = this.config()?.areas || [];
    const pending = driver?.status === "pending" || (!driver?.status && this.submitted);
    const actions = this.app.querySelector<HTMLElement>(".action-bar");
    if (actions) actions.style.display = pending ? "none" : "";
    if (pending) {
      host.innerHTML = `<div class="section-card"><span class="badge warn">Under review</span><h2>Application submitted</h2><p>Your documents and details are awaiting operator approval. Drive, earnings, trips and account will unlock after approval.</p>${driver?.review_note ? `<p class="notice-box">${escape(driver.review_note)}</p>` : ""}<button class="secondary" data-captain-action="check-approval">Check approval status</button>${this.error ? `<p role="alert">${escape(this.error)}</p>` : ""}</div>`;
      return;
    }

    const upload = (kind: string, label: string, saved: boolean, iconName = "file") =>
      `<div class="upload-card ${saved ? "uploaded" : ""}">` +
        `<div class="upload-icon-circle ${saved ? "success" : ""}">${icon(saved ? "check" : iconName)}</div>` +
        `<div class="upload-content">` +
          `<div class="upload-title-row">` +
            `<strong>${label}</strong>` +
            `${saved ? `<span class="badge green">${icon("check", "tiny-icon")} Verified</span>` : `<span class="badge warn">Required</span>`}` +
          `</div>` +
          `<small>${saved ? "Uploaded privately · awaiting review" : "Choose a clear JPEG or PNG (up to 12 MB)"}</small>` +
        `</div>` +
        `<label class="upload-button-label" for="captain-upload-${kind}">` +
          `<span>${saved ? "Replace" : "Upload"}</span>` +
          `<input id="captain-upload-${kind}" aria-label="${label}" type="file" accept="image/jpeg,image/png" data-captain-upload="${kind}" ${this.busy ? "disabled" : ""}/>` +
        `</label>` +
      `</div>`;

    let body = "";
    if (!this.evidence) {
      body = `<p role="status">${this.loading ? "Loading your application…" : "Application could not be loaded."}</p><button class="secondary" data-captain-action="reload">Retry</button>`;
    } else if (step === 0) {
      body = `
        <div class="section-card onboarding-card">
          <div class="card-head">
            <div class="card-icon">${icon("user")}</div>
            <div>
              <h3>Legal Identity</h3>
              <p class="micro muted">Your official name for passenger safety</p>
            </div>
          </div>
          <div class="form-field full-width">
            <label class="field-label" for="captain-name">Your legal name</label>
            <input class="text-input" id="captain-name" data-captain-field="name" type="text" value="${escape(this.name)}" placeholder="Full legal name as on ID"/>
          </div>
        </div>

        <div class="section-card onboarding-card">
          <div class="card-head">
            <div class="card-icon">${icon("phone")}</div>
            <div>
              <h3>Mobile Verification</h3>
              <p class="micro muted">Registered number for dispatch and OTP login</p>
            </div>
          </div>
          <div class="form-field full-width">
            <label class="field-label" for="captain-phone">Mobile number</label>
            <input class="text-input" id="captain-phone" data-captain-field="phone" ${this.evidence.phone_verified ? "readonly" : ""} type="tel" value="${escape(this.phone)}" placeholder="10-digit mobile number"/>
          </div>
          <div class="phone-status-row">
            ${this.evidence.phone_verified
              ? `<div class="status-pill success">${icon("check", "tiny-icon")} <span>Mobile ownership verified</span></div>`
              : `<div class="status-pill warning"><p class="micro">Verify mobile ownership before continuing.</p><button type="button" class="secondary micro-btn" data-captain-action="send">${icon("send", "tiny-icon")} Send code</button></div>`
            }
          </div>
          ${this.sent ? `
            <div class="verification-code-box">
              <label class="field-label" for="captain-code">6-digit verification code</label>
              <input class="text-input" id="captain-code" data-captain-field="code" type="text" value="${escape(String(this.draft.code || ""))}" placeholder="Enter 6-digit OTP"/>
              <button type="button" class="secondary" data-captain-action="verify" style="margin-top:10px">${icon("check", "tiny-icon")} Verify mobile</button>
            </div>
          ` : ""}
        </div>

        <div class="section-card onboarding-card">
          <div class="card-head">
            <div class="card-icon">${icon("camera")}</div>
            <div>
              <h3>Captain Portrait</h3>
              <p class="micro muted">Clear facial photo displayed to riders</p>
            </div>
          </div>
          ${upload("portrait", "Captain portrait", this.evidence.has_photo, "camera")}
        </div>

        <div class="section-card onboarding-card">
          <div class="card-head">
            <div class="card-icon">${icon("navigation")}</div>
            <div>
              <h3>Operating Jurisdiction</h3>
              <p class="micro muted">Select the primary service area you will operate in</p>
            </div>
          </div>
          <div class="form-field full-width">
            <label class="field-label" for="captain-area_id">Operating city</label>
            <select class="text-input" id="captain-area_id" data-captain-field="area_id">
              <option value="">Select a city</option>
              ${areas.map((a) => `<option value="${escape(a.id)}" ${a.id === this.draft.area_id ? "selected" : ""}>${escape(a.name)}</option>`).join("")}
            </select>
          </div>
          <div class="jurisdiction-banner">
            <span class="badge green">City Service Permit</span>
            <p class="micro muted" style="margin-top: 6px;">Chennai, Bengaluru and other configured cities. No neighbourhood-zone approvals. Captain approval is required before driving.</p>
          </div>
        </div>
      `;
    } else if (step === 1) {
      body = `
        <div class="section-card onboarding-card">
          <div class="card-head">
            <div class="card-icon">${icon("car")}</div>
            <div>
              <h3>Vehicle Category</h3>
              <p class="micro muted">Choose the service type you will operate</p>
            </div>
          </div>
          <div class="vehicle-grid" role="radiogroup" aria-label="Vehicle category selection">
            ${vehicleCategories.map((v) => `
              <button
                type="button"
                class="vehicle-card product-chip ${v.id === this.draft.vehicle_category ? "active" : ""}"
                data-captain-vehicle="${v.id}"
                role="radio"
                aria-checked="${v.id === this.draft.vehicle_category}"
              >
                <img src="${v.image}" alt="${v.name}" class="vehicle-card-img" />
                <div class="vehicle-card-info">
                  <strong class="vehicle-card-name">${v.name}</strong>
                  <span class="vehicle-card-seats">${v.seats}</span>
                </div>
                ${v.id === this.draft.vehicle_category ? `<span class="vehicle-card-check">${icon("check", "tiny-icon")}</span>` : ""}
              </button>
            `).join("")}
          </div>
          <label class="sr-only-sync" for="captain-vehicle_category">Vehicle category</label>
          <select class="text-input sr-only-sync" id="captain-vehicle_category" data-captain-field="vehicle_category" aria-label="Vehicle category">
            ${vehicleCategories.map((v) => `
              <option value="${v.id}" ${v.id === this.draft.vehicle_category ? "selected" : ""}>${v.id}</option>
            `).join("")}
          </select>
        </div>

        <div class="section-card onboarding-card">
          <div class="card-head">
            <div class="card-icon">${icon("car")}</div>
            <div>
              <h3>Vehicle Details</h3>
              <p class="micro muted">Official registration and model details</p>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-field full-width">
              ${this.field("vehicle_number", "Vehicle registration number", "text", this.draft.vehicle_number || "", "e.g. KA 01 AB 1234")}
            </div>
            <div class="form-row-2col">
              <div class="form-field">
                ${this.field("vehicle_make", "Vehicle make", "text", this.draft.vehicle_make || "", "e.g. Honda, Bajaj")}
              </div>
              <div class="form-field">
                ${this.field("vehicle_model", "Vehicle model", "text", this.draft.vehicle_model || "", "e.g. Activa, Pulsar")}
              </div>
            </div>
            <div class="form-field full-width">
              ${this.field("vehicle_color", "Vehicle colour", "text", this.draft.vehicle_color || "", "e.g. Black, White, Yellow")}
            </div>
          </div>
        </div>

        <div class="section-card onboarding-card">
          <div class="card-head">
            <div class="card-icon">${icon("shield")}</div>
            <div>
              <h3>Licence & Insurance</h3>
              <p class="micro muted">Confidential evidence verified by Hop operations</p>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-field full-width">
              ${this.field("license_reference", "Driving licence number", "text", this.draft.license_reference || "", "e.g. DL-1420110012345")}
            </div>
            <div class="form-field full-width">
              ${this.field("license_expires", "Licence expiry", "date", this.draft.license_expires || "")}
            </div>
            <div class="form-field full-width">
              ${this.field("insurance_reference", "Insurance policy number", "text", this.draft.insurance_reference || "", "e.g. POL-9876543210")}
            </div>
            <div class="form-field full-width">
              ${this.field("insurance_expires", "Insurance expiry", "date", this.draft.insurance_expires || "")}
            </div>
          </div>
        </div>

        <div class="section-card onboarding-card">
          <div class="card-head">
            <div class="card-icon">${icon("wallet")}</div>
            <div>
              <h3>Earnings Payout (Optional)</h3>
              <p class="micro muted">Direct UPI bank transfer for your daily earnings</p>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-field full-width">
              ${this.field("upi_id", "UPI ID (optional)", "text", this.draft.upi_id || "", "e.g. username@upi")}
            </div>
          </div>
        </div>
      `;
    } else if (step === 2) {
      body = `
        <div class="security-banner onboarding-card">
          <div class="security-icon">${icon("lock")}</div>
          <div>
            <strong>Private & Encrypted Verification</strong>
            <p class="micro muted">Documents are private to you and authorised reviewers. Uploading does not grant approval.</p>
          </div>
        </div>
        <div class="documents-list">
          ${documents.map((d) => upload(d.kind, d.label, this.evidence!.documents.some((item) => item.kind === d.kind), d.icon)).join("")}
        </div>
      `;
    } else {
      const selectedArea = areas.find((a) => a.id === this.draft.area_id)?.name || "Select a city";
      const docCount = this.evidence.documents.length;
      body = `
        <div class="section-card onboarding-card summary-card">
          <div class="summary-hero">
            <div class="summary-avatar">
              ${this.evidence.has_photo && this.preview?.endpoint === "/api/profile/photo"
                ? `<img src="data:image/jpeg;base64,${this.preview.image}" alt="Portrait" class="avatar-img" />`
                : `<div class="avatar-initials">${icon("user")}</div>`
              }
            </div>
            <div class="summary-meta">
              <h3>${escape(this.name || "Real Captain")}</h3>
              <span class="micro muted">${escape(this.phone || "")} · Verified phone</span>
            </div>
            <span class="badge ${driver?.status === "approved" ? "green" : "warn"}">
              ${driver?.status ? escape(driver.status.toUpperCase()) : "READY FOR REVIEW"}
            </span>
          </div>

          <div class="summary-divider"></div>

          <div class="summary-grid">
            <div class="summary-row">
              <span class="summary-label">${icon("navigation", "tiny-icon")} Operating City</span>
              <span class="summary-value badge green">${escape(selectedArea)}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">${icon("car", "tiny-icon")} Vehicle</span>
              <div class="summary-vehicle-info">
                <strong>${escape(String(this.draft.vehicle_make || ""))} ${escape(String(this.draft.vehicle_model || ""))}</strong>
                <span class="vehicle-plate">${escape(String(this.draft.vehicle_number || ""))}</span>
              </div>
            </div>
            <div class="summary-row">
              <span class="summary-label">${icon("file", "tiny-icon")} Documents</span>
              <span class="badge ${docCount >= 4 ? "green" : "warn"}">
                ${docCount} of 4 verified
              </span>
            </div>
            <div class="summary-row">
              <span class="summary-label">${icon("shield", "tiny-icon")} Captain Status</span>
              <strong>${escape(driver?.status || "Not applied")}</strong>
            </div>
          </div>
        </div>

        <div class="notice-box onboarding-card">
          An operator must review and approve your application before you can drive.
        </div>

        <label class="toggle-row onboarding-card" style="margin-top: 14px;">
          <span>
            <strong>Confirm declaration</strong>
            <small>I declare these documents are genuine and valid.</small>
          </span>
          <input type="checkbox" data-captain-consent aria-label="Confirm application"/>
        </label>
      `;
    }

    if (this.preview) {
      body += `
        <div class="section-card onboarding-card preview-card">
          <div class="card-head">
            <div class="card-icon">${icon("eye")}</div>
            <div>
              <h3>Image Preview</h3>
              <p class="micro muted">Review before saving to private vault</p>
            </div>
          </div>
          <div class="preview-img-wrap">
            <img alt="Upload preview" src="data:image/jpeg;base64,${this.preview.image}" style="max-width:100%;max-height:220px;border-radius:12px;"/>
          </div>
          <div class="preview-actions" style="margin-top:12px;display:flex;gap:10px">
            <button type="button" class="secondary" data-captain-action="upload" style="flex:1">${icon("check", "tiny-icon")} Save image privately</button>
            <button type="button" class="text-button" data-captain-action="discard">${icon("close", "tiny-icon")} Discard</button>
          </div>
        </div>
      `;
    }

    host.innerHTML = `
      <div class="onboarding-applicant-bar">
        <span class="applicant-pill">${icon("user", "tiny-icon")} Captain: <strong>${escape(this.name || "Real Captain")}</strong></span>
      </div>
      <div class="onboarding-steps">${[0, 1, 2, 3].map((i) => `<span class="${i <= step ? "active" : ""}"></span>`).join("")}</div>
      <p class="eyebrow">STEP ${step + 1} OF 4</p>
      <h2>${["First, your account.", "Tell us about your vehicle.", "Keep your documents ready.", "Ready for review."][step]}</h2>
      ${driver?.review_note ? `<p class="notice-box">${escape(driver.review_note)}</p>` : ""}
      ${body}
      ${this.error ? `<p class="notice-box message-error" role="alert">${escape(this.error)}</p>` : ""}
    `;

    this.app
      .querySelectorAll<HTMLButtonElement>(
        '[data-action="onboarding-next"], [data-action="onboarding-back"]',
      )
      .forEach((b) => {
        b.disabled = this.busy || this.loading || !this.evidence;
      });
  }

  private onInput = (event: Event) => {
    const el = event.target as HTMLInputElement;
    const key = el.dataset.captainField;
    if (!key) return;
    if (key === "name") this.name = el.value;
    else if (key === "phone") this.phone = el.value;
    else this.draft[key] = el.value;
  };

  private onChange = (event: Event) => {
    this.onInput(event);
    const el = event.target as HTMLInputElement;
    if (el.dataset.captainField === "vehicle_category") {
      this.draft.vehicle_category = el.value;
      this.render();
      return;
    }
    if (el.dataset.captainUpload && el.files?.[0]) {
      void this.run(async () => {
        const file = el.files![0];
        if (
          !/^image\/(jpeg|png)$/.test(file.type) ||
          file.size > 12 * 1024 * 1024
        )
          throw new Error("Choose a JPEG or PNG up to 12 MB.");
        const bitmap = await createImageBitmap(file);
        try {
          if (bitmap.width < 64 || bitmap.height < 64)
            throw new Error(
              "Choose an image at least 64 pixels wide and high.",
            );
          const portrait = el.dataset.captainUpload === "portrait";
          const side = Math.min(bitmap.width, bitmap.height);
          const w = portrait ? side : bitmap.width,
            h = portrait ? side : bitmap.height;
          const scale = Math.min(1, (portrait ? 640 : 1600) / Math.max(w, h));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Image processing unavailable.");
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(
            bitmap,
            portrait ? (bitmap.width - side) / 2 : 0,
            portrait ? (bitmap.height - side) / 2 : 0,
            w,
            h,
            0,
            0,
            canvas.width,
            canvas.height,
          );
          this.preview = {
            image: canvas.toDataURL("image/jpeg", 0.85).split(",")[1],
            endpoint: portrait
              ? "/api/profile/photo"
              : `/api/drivers/documents/${el.dataset.captainUpload}`,
          };
        } finally {
          bitmap.close();
        }
      });
    }
  };

  private problem(step: number) {

    if (
      step === 0 &&
      (!this.evidence?.phone_verified ||
        !this.name.trim() ||
        !this.config()?.areas.some((a) => a.id === this.draft.area_id))
    )
      throw new Error(
        "Verify your mobile, enter your legal name and select an operating city.",
      );
    if (step === 1) {
      for (const [key] of fields.filter(([key]) => key !== "upi_id"))
        if (!String(this.draft[key] || "").trim())
          throw new Error("Complete your vehicle and credential details.");
      for (const key of ["license_expires", "insurance_expires"])
        if (String(this.draft[key]) < new Date().toISOString().slice(0, 10))
          throw new Error("Licence and insurance must be valid.");
    }
    if (
      step === 2 &&
      (!this.evidence?.has_photo ||
        documents.some(
          (d) => !this.evidence?.documents.some((doc) => doc.kind === d.kind),
        ))
    )
      throw new Error("Upload your portrait and all four document images.");
  }

  private async run(work: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    try {
      await work();
    } catch (e) {
      this.error = (e as Error).message;
      this.bridge.notify(this.error);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private onClick = (event: Event) => {
    if (this.bridge.read().screen !== "onboarding") return;

    const vehicleBtn = (event.target as Element).closest<HTMLElement>("[data-captain-vehicle]");
    if (vehicleBtn) {
      const chosen = vehicleBtn.dataset.captainVehicle;
      if (chosen && chosen !== this.draft.vehicle_category) {
        this.draft.vehicle_category = chosen;
        const selectEl = this.app.querySelector<HTMLSelectElement>("#captain-vehicle_category");
        if (selectEl) {
          selectEl.value = chosen;
        }
        this.render();
      }
      return;
    }

    const button = (event.target as Element).closest<HTMLElement>("button");
    if (!button) return;
    const action = button.dataset.captainAction || button.dataset.action;
    if (
      !action ||
      ![
        "reload",
        "check-approval",
        "send",
        "verify",
        "upload",
        "discard",
        "onboarding-next",
        "onboarding-back",
        "instant-approve-captain",
      ].includes(action)
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const consent = this.app.querySelector<HTMLInputElement>(
      "[data-captain-consent]",
    )?.checked;
    void this.run(async () => {
      if (action === "check-approval") return this.refresh();
      if (action === "reload") return this.load();
      if (action === "instant-approve-captain")
        throw new Error("Only an operator can approve a Captain.");
      if (action === "discard") {
        this.preview = undefined;
        return;
      }
      if (action === "upload") {
        if (!this.preview) return;
        await api.request(this.preview.endpoint, { image: this.preview.image });
        this.preview = undefined;
        this.evidence = await api.request<Evidence>("/api/drivers/onboarding");
        this.bridge.notify(
          "Image uploaded privately. Operator review is still required.",
        );
        return;
      }
      if (action === "send") {
        if (Date.now() < this.retryAt)
          throw new Error("Please wait before requesting another code.");
        const result = await api.request<{ retry_after?: number }>(
          "/api/profile/phone/request",
          { phone: this.phone },
        );
        this.retryAt = Date.now() + (result.retry_after || 30) * 1000;
        this.sent = true;
        this.bridge.notify("Verification code sent.");
        return;
      }
      if (action === "verify") {
        await api.request("/api/profile/phone/verify", {
          phone: this.phone,
          code: this.draft.code,
        });
        this.evidence = await api.request<Evidence>("/api/drivers/onboarding");
        this.sent = false;
        return;
      }
      const step = this.draft.step;
      if (action === "onboarding-next") {
        this.problem(step);
        if (step === 0)
          await api.request("/api/profile", { name: this.name.trim() });
        if (step === 3) {
          for (let s = 0; s < 3; s++) this.problem(s);
          if (!consent)
            throw new Error("Confirm the declaration before submitting.");
          const { step: _step, code: _code, ...payload } = this.draft;
          await api.request("/api/drivers/apply", payload);
          this.submitted = true;
          this.bridge.assign({
            driverApproved: false,
            driverStatus: "pending",
          });
          this.bridge.notify(
            "Application submitted. Operator approval is required before driving.",
          );
          this.render();
          await this.refresh();
          return;
        }
      }
      const next =
        action === "onboarding-back" ? Math.max(0, step - 1) : step + 1;
      const { code: _code, ...saved } = this.draft;
      await api.request("/api/drivers/onboarding", { ...saved, step: next });
      this.draft.step = next;
      this.bridge.update({ onboard: next });
    });
  };
}
