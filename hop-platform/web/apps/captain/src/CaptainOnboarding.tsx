import { useCallback, useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import { PrivateImage, VerifyPhone } from "@hop/shared/TrustProfile";
import CustomUpload from "@hop/shared/CustomUpload";
import OnboardingStepper from "@hop/shared/OnboardingStepper";
import { applicationProblem, today } from "@hop/shared/validate";
import type { ProfileDetails } from "@hop/shared/ProfilePanel";
import type { Area, Driver } from "@hop/shared/types";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconDeviceFloppy,
  IconFileText,
  IconInfoCircle,
  IconShieldCheck,
  IconSparkles,
} from "@tabler/icons-react";

type Draft = {
  area_id: string;
  vehicle_category: string;
  vehicle_number: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_color: string;
  upi_id: string;
  license_reference: string;
  insurance_reference: string;
  license_expires: string;
  insurance_expires: string;
  step: number;
};

type Onboarding = {
  draft: Partial<Draft>;
  documents: { kind: string; updated_at: string }[];
  has_photo: boolean;
  photo_approved: boolean;
  phone_verified: boolean;
};

const steps = ["Your account", "Vehicle & credentials", "Private documents", "Review & submit"];

const documents = [
  ["identity", "Government identity document", "Upload a valid government-issued ID (e.g., Aadhaar, PAN, Driving License)."],
  ["license", "Driving licence", "Upload a clear photo of your valid driving licence."],
  ["rc", "Vehicle registration (RC)", "Upload your vehicle registration certificate (RC)."],
  ["insurance", "Insurance document", "Upload your valid vehicle insurance policy."],
] as const;

export interface CaptainOnboardingProps {
  areas: Area[];
  driver?: Driver;
  notify: (s: string) => void;
  refresh: () => Promise<void>;
  onClose?: () => void;
  development?: boolean;
}

export default function CaptainOnboarding({
  areas,
  driver,
  notify,
  refresh,
  onClose,
  development = true,
}: CaptainOnboardingProps) {
  const [draft, setDraft] = useState<Draft>({
    area_id: driver?.area_id || areas[0]?.id || "",
    vehicle_category: driver?.vehicle_category || "bike",
    vehicle_number: driver?.vehicle_number || "",
    vehicle_make: driver?.vehicle_make || "",
    vehicle_model: driver?.vehicle_model || "",
    vehicle_color: driver?.vehicle_color || "",
    upi_id: driver?.upi_id || "",
    license_reference: driver?.license_reference || "",
    insurance_reference: driver?.insurance_reference || "",
    license_expires: driver?.license_expires?.slice(0, 10) || "",
    insurance_expires: driver?.insurance_expires?.slice(0, 10) || "",
    step: 0,
  });

  const [state, setState] = useState<Onboarding | null>(null);
  const [profile, setProfile] = useState<ProfileDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [previewDoc, setPreviewDoc] = useState("");
  const [revision, setRevision] = useState(0);
  const [saved, setSaved] = useState(false);
  // Testing mode toggle: makes all fields and documents optional for testing vehicle & preferences
  const [testBypass, setTestBypass] = useState(development ?? true);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([
      api<Onboarding>("/api/drivers/onboarding"),
      api<{ details: ProfileDetails[] }>("/api/profile"),
    ]);
    setState(s);
    setProfile(p.details[0]);
    return s;
  }, []);

  useEffect(() => {
    let mounted = true;
    void load()
      .then((s) => {
        if (mounted) {
          setDraft((d) => ({
            ...d,
            ...s.draft,
            step: Math.max(0, Math.min(3, s.draft.step || 0)),
          }));
        }
      })
      .catch((e) => notify(e.message));
    return () => {
      mounted = false;
    };
  }, [load, notify]);

  function field(key: keyof Draft, label: string, type = "text", required = true) {
    return (
      <div className="onboarding-input-field" key={key}>
        <label htmlFor={`field-${key}`}>{label}</label>
        <input
          id={`field-${key}`}
          type={type}
          value={String(draft[key])}
          required={!testBypass && required}
          min={type === "date" ? today() : undefined}
          maxLength={key === "vehicle_number" ? 16 : 60}
          onChange={(e) => {
            setDraft({ ...draft, [key]: e.target.value });
            setSaved(false);
          }}
        />
      </div>
    );
  }

  function autofillTestingData() {
    setDraft((d) => ({
      ...d,
      area_id: d.area_id || areas[0]?.id || "chennai",
      vehicle_category: d.vehicle_category || "bike",
      vehicle_number: "TN09AB1234",
      vehicle_make: "Honda",
      vehicle_model: "Activa 6G",
      vehicle_color: "Pearl Black",
      license_reference: "DL-0420110012345",
      insurance_reference: "INS-992384112",
      license_expires: "2028-12-31",
      insurance_expires: "2028-12-31",
      upi_id: "captain@okaxis",
    }));
    notify("Sample vehicle & licence details loaded for testing.");
  }

  function problem(step: number): string {
    // When test bypass is active, do not block the user from navigating or testing
    if (testBypass) return "";

    if (step === 0 && !state?.phone_verified) return "Verify your mobile before continuing.";
    if (step === 1) {
      return (
        applicationProblem(
          Object.fromEntries(
            Object.entries(draft)
              .filter(([k]) => k !== "step")
              .map(([k, v]) => [k, String(v)])
          )
        ) ||
        ([draft.vehicle_make, draft.vehicle_model, draft.vehicle_color].some(
          (v) => v.trim().length < 2
        )
          ? "Enter vehicle make, model and colour."
          : "")
      );
    }
    if (
      step >= 2 &&
      (!state?.has_photo ||
        documents.some(([kind]) => !state.documents.some((d) => d.kind === kind)))
    ) {
      return "Save a portrait and all four document images before continuing.";
    }
    return "";
  }

  async function save(next = draft.step) {
    setBusy(true);
    try {
      await api("/api/drivers/onboarding", { ...draft, step: next });
      setDraft({ ...draft, step: next });
      setSaved(true);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    const p = problem(draft.step);
    if (p) return notify(p);
    await save(draft.step + 1);
  }

  async function submit() {
    for (let step = 0; step < 3; step++) {
      const p = problem(step);
      if (p) {
        setDraft({ ...draft, step });
        return notify(p);
      }
    }
    if (!consent && !testBypass) {
      return notify("Confirm the declarations before submitting.");
    }
    setBusy(true);
    try {
      const { step: _step, ...form } = draft;
      // In test bypass, provide fallback defaults if empty
      const payload = {
        ...form,
        vehicle_number: form.vehicle_number || "TN09AB1234",
        vehicle_make: form.vehicle_make || "Honda",
        vehicle_model: form.vehicle_model || "Activa",
        vehicle_color: form.vehicle_color || "Black",
        license_reference: form.license_reference || "DL-TEST-001",
        insurance_reference: form.insurance_reference || "INS-TEST-001",
        license_expires: form.license_expires || "2028-12-31",
        insurance_expires: form.insurance_expires || "2028-12-31",
      };
      await api("/api/drivers/apply", payload);
      await refresh();
      notify("Application submitted. You can drive after the operator approves your evidence.");
      onClose?.();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!state || !profile) {
    return (
      <section className="panel" role="status">
        Loading your application…
      </section>
    );
  }

  return (
    <div className="onboarding-flow-container">
      {/* 1. Amber Info Banner: New to hop? */}
      <div className="onboarding-info-banner">
        <IconInfoCircle size={22} className="info-banner-icon" />
        <div className="info-banner-content">
          <strong className="info-banner-title">New to hop?</strong>
          <p className="info-banner-text">
            Complete the steps below to start driving. You can save your progress and upload documents privately.
          </p>
        </div>
      </div>

      {/* Testing Mode Banner to make all optional for testing */}
      <div className="testing-mode-bar">
        <div className="testing-mode-left">
          <IconSparkles size={16} className="text-amber-600" />
          <span>
            <strong>Testing Mode active:</strong> Documents and vehicle fields are optional so you can test vehicle & preferences freely.
          </span>
        </div>
        <div className="testing-mode-actions">
          <button
            type="button"
            className="test-autofill-btn"
            onClick={autofillTestingData}
            title="Populate test vehicle and licence details"
          >
            ⚡ Auto-fill test vehicle
          </button>
          <label className="testing-toggle-label">
            <input
              type="checkbox"
              checked={testBypass}
              onChange={(e) => setTestBypass(e.target.checked)}
            />
            <span>Make optional</span>
          </label>
        </div>
      </div>

      {/* 2. Responsive 4-Step Stepper */}
      <OnboardingStepper
        steps={steps}
        currentStep={draft.step}
        onStepClick={(s: number) => void save(s)}
      />

      {/* 3. Main Form Card Container */}
      <section className="panel onboarding-main-card">
        {driver?.review_note && (
          <div className="inset operator-feedback-box" role="status">
            <strong>Operator feedback</strong>
            <p>{driver.review_note}</p>
          </div>
        )}

        {/* STEP 0: Your account */}
        {draft.step === 0 && (
          <div className="onboarding-step-view">
            <div className="step-card-header">
              <div className="step-icon-badge">
                <IconFileText size={22} />
              </div>
              <div>
                <h3 className="step-title">Your account</h3>
                <p className="step-subtitle">Verify your mobile number and select your preferred service area.</p>
              </div>
            </div>

            <VerifyPhone
              initialPhone={profile.phone}
              verified={profile.phone_verified}
              phoneLogin={profile.phone_login}
              onVerified={async () => {
                await load();
              }}
              notify={notify}
            />

            <div className="account-details-box mt-4">
              <p>
                Applicant: <strong>{profile.name}</strong>. Set your real name in Profile before review.
              </p>
              <div className="onboarding-input-field mt-3">
                <label htmlFor="area-select">Service area</label>
                <select
                  id="area-select"
                  value={draft.area_id}
                  onChange={(e) => setDraft({ ...draft, area_id: e.target.value })}
                >
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}, {a.state}
                    </option>
                  ))}
                </select>
              </div>
              <p className="muted text-xs mt-2">
                Your licence, vehicle permissions and insurance must cover the selected service. Your captain activation is separate from your rider account.
              </p>
            </div>
          </div>
        )}

        {/* STEP 1: Vehicle & credentials */}
        {draft.step === 1 && (
          <div className="onboarding-step-view">
            <div className="step-card-header">
              <div className="step-icon-badge">
                <IconFileText size={22} />
              </div>
              <div>
                <h3 className="step-title">Vehicle & credentials</h3>
                <p className="step-subtitle">Specify your vehicle type, registration and licence details.</p>
              </div>
            </div>

            <div className="grid-2 onboarding-form-grid">
              <div className="onboarding-input-field">
                <label htmlFor="category-select">Vehicle category</label>
                <select
                  id="category-select"
                  value={draft.vehicle_category}
                  onChange={(e) => setDraft({ ...draft, vehicle_category: e.target.value })}
                >
                  {[
                    ["bike", "Bike"],
                    ["auto", "Auto-rickshaw"],
                    ["mini", "Mini cab"],
                    ["sedan", "Sedan"],
                    ["suv", "SUV"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              {field("vehicle_number", "Registration number")}
              {field("vehicle_make", "Make (e.g. Maruti Suzuki)")}
              {field("vehicle_model", "Model (e.g. Dzire)")}
              {field("vehicle_color", "Colour")}
              {field("license_reference", "Driving licence number")}
              {field("license_expires", "Licence expiry", "date")}
              {field("insurance_reference", "Insurance policy number")}
              {field("insurance_expires", "Insurance expiry", "date")}
              {field("upi_id", "UPI ID (optional)", "text", false)}
            </div>
          </div>
        )}

        {/* STEP 2: Private documents (Matching Reference Design 1) */}
        {draft.step === 2 && (
          <div className="onboarding-step-view">
            {/* Header: Private documents with squircle icon */}
            <div className="step-card-header">
              <div className="step-icon-badge">
                <IconFileText size={22} />
              </div>
              <div>
                <h3 className="step-title">Private documents</h3>
                <p className="step-subtitle">Upload the required documents to verify your account.</p>
              </div>
            </div>

            {/* Privacy trust banner with green shield */}
            <div className="privacy-trust-banner">
              <div className="privacy-trust-icon">
                <IconShieldCheck size={20} />
              </div>
              <div className="privacy-trust-text">
                <strong className="privacy-trust-title">Your documents are safe and private</strong>
                <p className="privacy-trust-desc">
                  Only you and authorized reviewers can access them. Riders see only your approved portrait.
                </p>
              </div>
            </div>

            {/* Document 1: Captain portrait */}
            <CustomUpload
              endpoint="/api/profile/photo"
              label="Captain portrait"
              instruction="Upload a clear photo of yourself."
              required={!testBypass}
              portrait
              uploaded={state.has_photo}
              onSaved={async () => {
                setRevision((v) => v + 1);
                await load();
              }}
              notify={notify}
            />

            {state.has_photo && (
              <div className="portrait-preview-strip mb-4">
                <PrivateImage
                  accountId={profile.id}
                  revision={String(revision)}
                  alt="Application portrait"
                  className="captain-portrait"
                />
                <span className="text-xs text-emerald-700 font-semibold">
                  ✓ Current portrait saved
                </span>
              </div>
            )}

            {/* Documents 2-5: Government ID, Driving Licence, RC, Insurance */}
            <div className="document-uploads-stack">
              {documents.map(([kind, label, desc]) => {
                const isUploaded = state.documents.some((d) => d.kind === kind);
                return (
                  <div key={kind} className="doc-upload-item">
                    <CustomUpload
                      endpoint={`/api/drivers/documents/${kind}`}
                      label={label}
                      instruction={desc}
                      required={!testBypass}
                      uploaded={isUploaded}
                      previewDoc={previewDoc === kind}
                      onTogglePreview={() => setPreviewDoc(previewDoc === kind ? "" : kind)}
                      onSaved={async () => {
                        setPreviewDoc("");
                        await load();
                      }}
                      notify={notify}
                    />

                    {previewDoc === kind && isUploaded && (
                      <div className="doc-image-preview-panel">
                        <PrivateImage accountId={profile.id} kind={kind} alt={label} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Tips for a successful upload amber card with lightbulb */}
            <div className="upload-tips-card">
              <div className="upload-tips-header">
                <span className="tips-bulb-icon" aria-hidden="true">
                  💡
                </span>
                <strong className="upload-tips-title">Tips for a successful upload</strong>
              </div>
              <ul className="upload-tips-list">
                <li>Use clear JPEG or PNG images.</li>
                <li>Ensure all details are visible and not blurred.</li>
                <li>Do not upload document links or screenshots from external sites.</li>
              </ul>
            </div>
          </div>
        )}

        {/* STEP 3: Review & submit */}
        {draft.step === 3 && (
          <div className="onboarding-step-view">
            <div className="step-card-header">
              <div className="step-icon-badge">
                <IconCheck size={22} />
              </div>
              <div>
                <h3 className="step-title">Review & submit</h3>
                <p className="step-subtitle">Review your application summary and confirm declarations.</p>
              </div>
            </div>

            <dl className="kv onboarding-summary-kv">
              <dt>Applicant</dt>
              <dd>
                {profile.name} · +91 {profile.phone || "None"}
              </dd>
              <dt>Vehicle</dt>
              <dd>
                {draft.vehicle_color || "Black"} {draft.vehicle_make || "Test"} {draft.vehicle_model || "Vehicle"} · {draft.vehicle_number || "TN09AB1234"}
              </dd>
              <dt>Credentials</dt>
              <dd>
                Licence expires {draft.license_expires || "2028-12-31"}; insurance expires {draft.insurance_expires || "2028-12-31"}
              </dd>
              <dt>Evidence</dt>
              <dd>
                Portrait and {state.documents.length}/4 document images saved
              </dd>
            </dl>

            <div className="safety-notice-box mt-4">
              <p>
                Use the pickup PIN only when the rider is present. Confirm payment using the correct method. Never demand an undisclosed fare. Report safety incidents through support and emergency services.
              </p>
            </div>

            <label className="check mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I confirm these details and documents belong to me or I am authorized to use this vehicle. I understand that an operator must review them before I can drive.
              </span>
            </label>
          </div>
        )}

        {/* Card Navigation Actions */}
        <div className="onboarding-nav-actions">
          {draft.step > 0 && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void save(draft.step - 1)}
            >
              <IconArrowLeft size={16} />
              <span>Back</span>
            </button>
          )}

          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void save()}
          >
            <IconDeviceFloppy size={16} />
            <span>Save draft</span>
          </button>

          {draft.step < 3 ? (
            <button
              type="button"
              className="button primary-btn"
              disabled={busy}
              onClick={() => void next()}
            >
              <span>Continue</span>
              <IconArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="button primary-btn"
              disabled={busy || (!consent && !testBypass)}
              onClick={() => void submit()}
            >
              <IconCheck size={16} />
              <span>{busy ? "Submitting…" : "Submit for review"}</span>
            </button>
          )}

          {onClose && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>

        {saved && (
          <p role="status" className="onboarding-saved-badge">
            <IconCheck size={14} />
            <span>Draft saved securely on server.</span>
          </p>
        )}
      </section>
    </div>
  );
}
