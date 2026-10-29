import { api } from "../services/client";
import { escape } from "../helpers";
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
const documents = [
  ["license", "Driving licence"],
  ["rc", "Registration certificate"],
  ["insurance", "Insurance policy"],
  ["identity", "Government identity"],
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
  private testingOptional = true;
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
    if (!this.app.querySelector("[data-captain-onboarding]")) this.render();
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
    value = this.draft[key] || "",
  ) {
    return `<label class="field-label" for="captain-${key}">${label}</label><input class="text-input" id="captain-${key}" data-captain-field="${key}" type="${type}" value="${escape(String(value))}"/>`;
  }
  private render() {
    if (this.bridge.read().screen !== "onboarding") return;
    const host = this.app.querySelector<HTMLElement>(".screen-padding");
    if (!host) return;
    host.setAttribute("data-captain-onboarding", "");
    const step = this.draft.step;
    const driver = this.state()?.driver?.[0];
    const areas = this.config()?.areas || [];
    const upload = (kind: string, label: string, saved: boolean) =>
      `<label class="upload"><span>${label}<small>${saved ? "Uploaded privately · awaiting review" : "Choose a clear JPEG or PNG (up to 12 MB)"}</small></span><input aria-label="${label}" type="file" accept="image/jpeg,image/png" data-captain-upload="${kind}" ${this.busy ? "disabled" : ""}/></label>`;
    let body = "";
    if (!this.evidence)
      body = `<p role="status">${this.loading ? "Loading your application…" : "Application could not be loaded."}</p><button class="secondary" data-captain-action="reload">Retry</button>`;
    else if (step === 0)
      body =
        this.field("name", "Your legal name", "text", this.name) +
        this.field("phone", "Mobile number", "tel", this.phone) +
        `<p class="micro">${this.evidence.phone_verified ? "Mobile ownership verified" : "Verify mobile ownership before continuing."}</p><button class="upload" data-captain-action="send">Send verification code</button>${this.sent ? this.field("code", "6-digit verification code") + '<button class="secondary" data-captain-action="verify">Verify mobile</button>' : ""}${upload("portrait", "Captain portrait", this.evidence.has_photo)}<label class="field-label" for="captain-area_id">Operating city</label><select class="text-input" id="captain-area_id" data-captain-field="area_id"><option value="">Select a city</option>${areas.map((a) => `<option value="${escape(a.id)}" ${a.id === this.draft.area_id ? "selected" : ""}>${escape(a.name)}</option>`).join("")}</select><p class="micro muted">Chennai, Bengaluru and other configured cities. No neighbourhood-zone approvals. Captain approval is required before driving.</p>`;
    else if (step === 1)
      body =
        `<label class="field-label" for="captain-vehicle_category">Vehicle category</label><select class="text-input" id="captain-vehicle_category" data-captain-field="vehicle_category">${["bike", "auto", "mini", "sedan", "suv"].map((v) => `<option ${v === this.draft.vehicle_category ? "selected" : ""}>${v}</option>`).join("")}</select>` +
        fields
          .map(([key, label, type]) => this.field(key, label, type))
          .join("");
    else if (step === 2)
      body =
        `<p class="small muted">Documents are private to you and authorised reviewers. Uploading does not grant approval.</p>` +
        documents
          .map(([kind, label]) =>
            upload(
              kind,
              label,
              this.evidence!.documents.some((d) => d.kind === kind),
            ),
          )
          .join("");
    else
      body = `<div class="section-card"><strong>${escape(this.name)}</strong><p>${escape(areas.find((a) => a.id === this.draft.area_id)?.name || "Select a city")}</p><p>${escape(String(this.draft.vehicle_make || ""))} ${escape(String(this.draft.vehicle_model || ""))} · ${escape(String(this.draft.vehicle_number || ""))}</p><p>Captain status: ${escape(driver?.status || "Not applied")}</p></div><div class="notice-box">An operator must review and approve your application before you can drive.</div><label class="toggle-row"><span>I declare these documents are genuine and valid.</span><input type="checkbox" data-captain-consent aria-label="Confirm application"/></label>`;
    if (this.preview)
      body += `<div class="section-card"><img alt="Upload preview" src="data:image/jpeg;base64,${this.preview.image}" style="max-width:100%;max-height:220px"/><button class="secondary" data-captain-action="upload">Save image privately</button><button class="text-button" data-captain-action="discard">Discard</button></div>`;
    host.innerHTML = `<div class="onboarding-steps">${[0, 1, 2, 3].map((i) => `<span class="${i <= step ? "active" : ""}"></span>`).join("")}</div><p class="eyebrow">STEP ${step + 1} OF 4</p><h2>${["First, your account.", "Tell us about your vehicle.", "Keep your documents ready.", "Ready for review."][step]}</h2>${driver?.review_note ? `<p class="notice-box">${escape(driver.review_note)}</p>` : ""}${this.config()?.development ? `<label class="toggle-row"><span><strong>Testing mode</strong><small>Make onboarding fields and documents optional. Server approval is still required to drive.</small></span><input type="checkbox" data-captain-testing ${this.testingOptional ? "checked" : ""} aria-label="Optional onboarding for testing"/></label>` : ""}${body}${this.error ? `<p class="notice-box" role="alert">${escape(this.error)}</p>` : ""}`;
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
    if (el.hasAttribute("data-captain-testing")) {
      this.testingOptional = el.checked;
      return;
    }
    if (el.dataset.captainUpload && el.files?.[0])
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
  };
  private problem(step: number) {
    if (this.config()?.development && this.testingOptional) return;
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
          ([kind]) => !this.evidence?.documents.some((d) => d.kind === kind),
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
    const button = (event.target as Element).closest<HTMLElement>("button");
    if (!button) return;
    const action = button.dataset.captainAction || button.dataset.action;
    if (
      !action ||
      ![
        "reload",
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
          if (!consent && !(this.config()?.development && this.testingOptional))
            throw new Error("Confirm the declaration before submitting.");
          const { step: _step, code: _code, ...payload } = this.draft;
          await api.request("/api/drivers/apply", payload);
          this.bridge.assign({
            driverApproved: false,
            driverStatus: "pending",
          });
          this.bridge.notify(
            "Application submitted. Operator approval is required before driving.",
          );
          this.bridge.go("drive");
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
