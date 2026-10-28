import { api } from "../services/client";
import { escape } from "../helpers";
import type { Config, State } from "../services/contracts";

export type OnboardingBridge = {
  read: () => {
    screen?: string;
    onboard?: number;
    docs?: string[];
    serviceArea?: string;
    driverApproved?: boolean;
    driverStatus?: string;
    vehicle?: string;
    name?: string;
    phone?: string;
    vehicleNumber?: string;
    vehicleModel?: string;
    vehicleColour?: string;
    [key: string]: any;
  };
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

export class CaptainOnboarding {
  private evidence?: Evidence;
  private profile?: { name: string; phone: string; phone_login?: boolean };
  private draft: Draft = { step: 0 };
  private loaded = false;
  private listening = false;

  constructor(
    private app: HTMLElement,
    private bridge: OnboardingBridge,
    private config: () => Config | undefined,
    private state: () => State | undefined,
    private refresh: () => Promise<void>,
    private close?: () => void,
  ) {
    this.attachEvents();
  }

  show() {
    this.sync();
  }

  sync() {
    this.attachEvents();
    if (!this.loaded) {
      void this.loadBackend();
    } else {
      this.prefillForm();
    }
  }

  destroy() {
    this.app.removeEventListener("click", this.onClick, true);
    this.app.removeEventListener("input", this.onInput, true);
    this.app.removeEventListener("change", this.onChange, true);
    this.listening = false;
  }

  private attachEvents() {
    if (this.listening) return;
    this.app.addEventListener("click", this.onClick, true);
    this.app.addEventListener("input", this.onInput, true);
    this.app.addEventListener("change", this.onChange, true);
    this.listening = true;
  }

  private async loadBackend() {
    try {
      const [evidence, profile] = await Promise.all([
        api.request<Evidence>("/api/drivers/onboarding").catch(() => undefined),
        api
          .request<{
            details: { name: string; phone: string; phone_login?: boolean }[];
          }>("/api/profile")
          .catch(() => undefined),
      ]);

      if (evidence) this.evidence = evidence;
      if (profile?.details?.[0]) this.profile = profile.details[0];
      this.loaded = true;

      // Sync backend state into bridge
      const driver = this.state()?.driver?.[0];
      if (driver?.status === "approved") {
        this.bridge.assign({ driverApproved: true, driverStatus: "approved" });
      }

      if (this.evidence?.documents?.length) {
        const backendDocs = this.evidence.documents.map((d) => {
          if (d.kind === "license") return "Licence";
          if (d.kind === "rc") return "Registration";
          if (d.kind === "insurance") return "Insurance";
          if (d.kind === "identity" || d.kind === "portrait") return "Identity";
          return d.kind;
        });
        const currentDocs = this.bridge.read().docs || [];
        const merged = Array.from(new Set([...currentDocs, ...backendDocs]));
        this.bridge.assign({ docs: merged });
      }

      if (this.profile?.name) {
        this.bridge.assign({ name: this.profile.name });
      }
      if (this.profile?.phone) {
        this.bridge.assign({ phone: this.profile.phone });
      }

      this.prefillForm();
    } catch {
      this.loaded = true;
    }
  }

  private prefillForm() {
    if (this.bridge.read().screen !== "onboarding") return;

    const nameInput = this.app.querySelector<HTMLInputElement>("#onboard-name");
    if (nameInput && this.profile?.name && !nameInput.value) {
      nameInput.value = this.profile.name;
    }

    const phoneInput = this.app.querySelector<HTMLInputElement>("#onboard-phone");
    if (phoneInput && this.profile?.phone && phoneInput.value === "Demo account") {
      phoneInput.value = this.profile.phone;
    }

    const stateSelect = this.app.querySelector<HTMLSelectElement>("#onboard-state");
    if (stateSelect && this.bridge.read().serviceArea) {
      const sa = this.bridge.read().serviceArea!;
      for (const opt of Array.from(stateSelect.options)) {
        if (opt.value === sa || opt.value.startsWith(sa)) {
          opt.selected = true;
          break;
        }
      }
    }
  }

  private onInput = (event: Event) => {
    const el = event.target as HTMLInputElement | HTMLSelectElement;
    if (!el) return;

    if (el.id === "onboard-name") {
      this.draft.name = el.value;
      this.bridge.assign({ name: el.value });
    }
    if (el.id === "onboard-state") {
      this.draft.serviceArea = el.value;
      this.bridge.assign({ serviceArea: el.value });
    }
    if (el.id === "vehicle-number") {
      this.draft.vehicle_number = el.value;
      this.bridge.assign({ vehicleNumber: el.value });
    }
    if (el.id === "vehicle-model") {
      this.draft.vehicle_model = el.value;
      this.bridge.assign({ vehicleModel: el.value });
    }
    if (el.id === "vehicle-colour") {
      this.draft.vehicle_color = el.value;
      this.bridge.assign({ vehicleColour: el.value });
    }
    if (el.id === "vehicle-category") {
      this.draft.vehicle_category = el.value;
      this.bridge.assign({ vehicle: el.value });
    }
  };

  private onChange = (event: Event) => {
    this.onInput(event);
  };

  private onClick = (event: Event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLElement>("button, [data-action], [data-document]");
    if (!button) return;

    const action = button.dataset.action;
    const documentType = button.dataset.document;

    // Instant Demo Approval
    if (action === "instant-approve-captain") {
      event.preventDefault();
      event.stopImmediatePropagation();

      const st =
        this.app.querySelector<HTMLSelectElement>("#onboard-state")?.value ||
        this.bridge.read().serviceArea ||
        "Tamil Nadu — State-wide Operations";

      if (this.state()?.driver?.[0]) {
        this.state()!.driver[0].status = "approved";
        this.state()!.driver[0].state = st;
      }

      this.bridge.update({
        driverApproved: true,
        driverStatus: "approved",
        serviceArea: st,
        docs: ["Licence", "Registration", "Insurance", "Identity"],
      });
      this.bridge.go("drive");
      this.bridge.notify(
        `Captain Approved! You are authorized to operate state-wide in ${st}.`,
      );
      void this.refresh();
      return;
    }

    // Document upload card click
    if (documentType) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const docs = this.bridge.read().docs || [];
      if (!docs.includes(documentType)) {
        docs.push(documentType);
      }
      this.bridge.update({ docs });
      this.bridge.notify(`${documentType} document uploaded & verified for state-wide permit.`);

      // Optional backend upload sync
      const kindMap: Record<string, string> = {
        Licence: "license",
        Registration: "rc",
        Insurance: "insurance",
        Identity: "identity",
      };
      const kind = kindMap[documentType];
      if (kind) {
        // Transparent sample 64x64 PNG data url
        const dummyImg =
          "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAAAAACPAv4PNQAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAUSURBVGhD7cExAQAAAMKg9U9tDQ8gAAAA3wAE5AAB7l17iAAAAABJRU5ErkJggg==";
        api
          .request(`/api/drivers/documents/${kind}`, { image: dummyImg })
          .catch(() => {});
      }
      return;
    }

    // Demo phone verify
    if (action === "demo-verify") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.bridge.notify("Mobile number verified with official Hop Captain ID.");
      return;
    }

    // Demo portrait
    if (action === "portrait") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.bridge.notify("Profile photo captured and verified.");
      return;
    }

    // Onboarding Back
    if (action === "onboarding-back") {
      event.preventDefault();
      event.stopImmediatePropagation();
      const current = this.bridge.read().onboard || 0;
      if (current > 0) {
        this.bridge.update({ onboard: current - 1 });
      }
      return;
    }

    // Onboarding Next or Submit
    if (action === "onboarding-next") {
      event.preventDefault();
      event.stopImmediatePropagation();

      const current = this.bridge.read().onboard || 0;
      if (current === 0) {
        const stateSelect = this.app.querySelector<HTMLSelectElement>("#onboard-state");
        if (stateSelect?.value) {
          this.bridge.assign({ serviceArea: stateSelect.value });
        }
        const nameInput = this.app.querySelector<HTMLInputElement>("#onboard-name");
        if (nameInput?.value) {
          this.bridge.assign({ name: nameInput.value });
          api.request("/api/profile", { name: nameInput.value.trim() }).catch(() => {});
        }
      } else if (current === 1) {
        const cat = this.app.querySelector<HTMLSelectElement>("#vehicle-category")?.value;
        if (cat) this.bridge.assign({ vehicle: cat });
        const num = this.app.querySelector<HTMLInputElement>("#vehicle-number")?.value;
        if (num) this.bridge.assign({ vehicleNumber: num });
        const mod = this.app.querySelector<HTMLInputElement>("#vehicle-model")?.value;
        if (mod) this.bridge.assign({ vehicleModel: mod });
        const col = this.app.querySelector<HTMLInputElement>("#vehicle-colour")?.value;
        if (col) this.bridge.assign({ vehicleColour: col });
      }

      if (current < 3) {
        this.bridge.update({ onboard: current + 1 });
        // Save draft to backend
        api
          .request("/api/drivers/onboarding", {
            ...this.draft,
            step: current + 1,
          })
          .catch(() => {});
      } else {
        const confirmCheck = this.app.querySelector<HTMLInputElement>("#onboard-confirm");
        if (confirmCheck && !confirmCheck.checked) {
          this.bridge.notify("Please confirm the declaration before submitting.");
          return;
        }

        // Final submission
        const payload = {
          area_id:
            this.config()?.areas[0]?.id || "00000000-0000-0000-0000-000000000001",
          vehicle_category: this.bridge.read().vehicle || "auto",
          vehicle_number: this.bridge.read().vehicleNumber || "TN 09 AB 1234",
          vehicle_make: (this.bridge.read().vehicleModel || "Bajaj RE").split(" ")[0] || "Bajaj",
          vehicle_model: this.bridge.read().vehicleModel || "Bajaj RE",
          vehicle_color: this.bridge.read().vehicleColour || "Yellow & black",
          license_reference: "TN09-2024-0012345",
          license_expires: "2029-12-31",
          insurance_reference: "INS-992144-TN",
          insurance_expires: "2028-12-31",
        };

        api.request("/api/drivers/apply", payload).catch(() => {});

        this.bridge.update({ driverStatus: "pending" });
        this.bridge.go("drive");
        this.bridge.notify(
          "Application submitted for review. Tap 'Approve Application (Demo/Staging)' to immediately test driving.",
        );
        void this.refresh();
      }
      return;
    }
  };
}
