import { useCallback, useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import { MediaUpload, PrivateImage, VerifyPhone } from "@hop/shared/TrustProfile";
import { applicationProblem, today } from "@hop/shared/validate";
import type { ProfileDetails } from "@hop/shared/ProfilePanel";
import type { Area, Driver } from "@hop/shared/types";

type Draft = { area_id: string; vehicle_category: string; vehicle_number: string; vehicle_make: string; vehicle_model: string; vehicle_color: string; upi_id: string; license_reference: string; insurance_reference: string; license_expires: string; insurance_expires: string; step: number };
type Onboarding = { draft: Partial<Draft>; documents: { kind: string; updated_at: string }[]; has_photo: boolean; photo_approved: boolean; phone_verified: boolean };
const steps = ["Your account", "Vehicle & credentials", "Private documents", "Review & submit"];
const documents = [["identity", "Government identity document"], ["license", "Driving licence"], ["rc", "Vehicle registration (RC)"], ["insurance", "Insurance document"]] as const;

export default function CaptainOnboarding({ areas, driver, notify, refresh, onClose }: { areas: Area[]; driver?: Driver; notify: (s: string) => void; refresh: () => Promise<void>; onClose?: () => void }) {
  const [draft, setDraft] = useState<Draft>({ area_id: driver?.area_id || areas[0]?.id || "", vehicle_category: driver?.vehicle_category || "bike", vehicle_number: driver?.vehicle_number || "", vehicle_make: driver?.vehicle_make || "", vehicle_model: driver?.vehicle_model || "", vehicle_color: driver?.vehicle_color || "", upi_id: driver?.upi_id || "", license_reference: driver?.license_reference || "", insurance_reference: driver?.insurance_reference || "", license_expires: driver?.license_expires?.slice(0, 10) || "", insurance_expires: driver?.insurance_expires?.slice(0, 10) || "", step: 0 });
  const [state, setState] = useState<Onboarding | null>(null), [profile, setProfile] = useState<ProfileDetails | null>(null), [busy, setBusy] = useState(false), [consent, setConsent] = useState(false), [previewDoc, setPreviewDoc] = useState("");
  const [revision,setRevision]=useState(0),[saved,setSaved]=useState(false);
  const load = useCallback(async () => {
    const [s, p] = await Promise.all([api<Onboarding>("/api/drivers/onboarding"), api<{ details: ProfileDetails[] }>("/api/profile")]);
    setState(s); setProfile(p.details[0]); return s;
  }, []);
  useEffect(() => { let mounted=true; void load().then(s => {if(mounted) setDraft(d => ({ ...d, ...s.draft,step:Math.max(0,Math.min(3,s.draft.step||0)) }));}).catch(e => notify(e.message));return()=>{mounted=false;}; }, [load, notify]);
  function field(key: keyof Draft, label: string, type = "text", required = true) {
    return <label>{label}<input type={type} value={String(draft[key])} required={required} min={type === "date" ? today() : undefined} maxLength={key === "vehicle_number" ? 16 : 60} onChange={e => {setDraft({ ...draft, [key]: e.target.value });setSaved(false);}} /></label>;
  }
  function problem(step: number): string {
    if (step === 0 && !state?.phone_verified) return "Verify your mobile before continuing.";
    if (step === 1) return applicationProblem(Object.fromEntries(Object.entries(draft).filter(([k])=>k!=="step").map(([k,v])=>[k,String(v)]))) || ([draft.vehicle_make,draft.vehicle_model,draft.vehicle_color].some(v=>v.trim().length<2) ? "Enter vehicle make, model and colour." : "");
    if (step >= 2 && (!state?.has_photo || documents.some(([kind]) => !state.documents.some(d => d.kind === kind)))) return "Save a portrait and all four document images before continuing.";
    return "";
  }
  async function save(next = draft.step) {
    setBusy(true);
    try { await api("/api/drivers/onboarding", { ...draft, step: next }); setDraft({ ...draft, step: next }); setSaved(true); }
    catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  async function next() { const p=problem(draft.step);if(p) return notify(p);await save(draft.step+1); }
  async function submit() {
    for (let step=0;step<3;step++) {const p=problem(step);if(p) {setDraft({...draft,step});return notify(p);}}
    if (!consent) return notify("Confirm the declarations before submitting.");
    setBusy(true);
    try { const {step: _step,...form}=draft;await api("/api/drivers/apply",form);await refresh();notify("Application submitted. You can drive after the operator approves your evidence.");onClose?.(); }
    catch(e){notify((e as Error).message);}finally{setBusy(false);}
  }
  if (!state || !profile) return <section className="panel" role="status">Loading your application…</section>;
  return <section className="panel onboarding-flow">
    <p className="eyebrow">CAPTAIN APPLICATION</p><h2>{driver ? "Update your application" : "Get ready to drive"}</h2>
    {driver?.review_note && <div className="inset" role="status"><strong>Operator feedback</strong><p>{driver.review_note}</p></div>}
    <ol className="onboarding-steps" aria-label="Application progress">{steps.map((label,i)=><li key={label} aria-current={i===draft.step?"step":undefined}><span>{i+1}</span>{label}</li>)}</ol>
    <p className="muted">Step {draft.step+1} of 4 · {steps[draft.step]}. Save and resume across devices. Draft details stay on the server, not in local browser storage.</p>
    {draft.step===0 && <>
      <VerifyPhone initialPhone={profile.phone} verified={profile.phone_verified} phoneLogin={profile.phone_login} onVerified={async()=>{await load();}} notify={notify}/>
      <p>Applicant: <strong>{profile.name}</strong>. Set your real name in Profile before review.</p>
      <label>Service area<select value={draft.area_id} onChange={e=>setDraft({...draft,area_id:e.target.value})}>{areas.map(a=><option key={a.id} value={a.id}>{a.name}, {a.state}</option>)}</select></label>
      <p className="muted">Your licence, vehicle permissions and insurance must cover the selected service. Your captain activation is separate from your rider account.</p>
    </>}
    {draft.step===1 && <div className="grid-2">
      <label>Vehicle category<select value={draft.vehicle_category} onChange={e=>setDraft({...draft,vehicle_category:e.target.value})}>{[["bike","Bike"],["auto","Auto-rickshaw"],["mini","Mini cab"],["sedan","Sedan"],["suv","SUV"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      {field("vehicle_number","Registration number")}{field("vehicle_make","Make (e.g. Maruti Suzuki)")}{field("vehicle_model","Model (e.g. Dzire)")}{field("vehicle_color","Colour")}
      {field("license_reference","Driving licence number")}{field("license_expires","Licence expiry","date")}
      {field("insurance_reference","Insurance policy number")}{field("insurance_expires","Insurance expiry","date")}{field("upi_id","UPI ID (optional)","text",false)}
    </div>}
    {draft.step===2 && <>
      <p className="muted">These documents are private: only you and authorized reviewers can retrieve them. Riders see only your approved portrait. Upload clear JPEG/PNG images; never add document links.</p>
      {state.has_photo && <PrivateImage accountId={profile.id} revision={String(revision)} alt="Application portrait" className="captain-portrait"/>}
      <MediaUpload endpoint="/api/profile/photo" label="Captain portrait" portrait onSaved={async()=>{setRevision(v=>v+1);await load();}} notify={notify}/>
      {documents.map(([kind,label])=><div className="trust-block" key={kind}>
        <h4>{label} · {state.documents.some(d=>d.kind===kind)?"Uploaded":"Required"}</h4>
        <MediaUpload endpoint={`/api/drivers/documents/${kind}`} label={`Upload ${label}`} onSaved={async()=>{setPreviewDoc("");await load();}} notify={notify}/>
        {state.documents.some(d=>d.kind===kind)&&<button type="button" className="text-button" onClick={()=>setPreviewDoc(previewDoc===kind?"":kind)}>{previewDoc===kind?"Hide":"Review"} document</button>}
        {previewDoc===kind&&<PrivateImage accountId={profile.id} kind={kind} alt={label}/>}
      </div>)}
    </>}
    {draft.step===3 && <>
      <dl className="kv"><dt>Applicant</dt><dd>{profile.name} · +91 {profile.phone}</dd><dt>Vehicle</dt><dd>{draft.vehicle_color} {draft.vehicle_make} {draft.vehicle_model} · {draft.vehicle_number}</dd><dt>Credentials</dt><dd>Licence expires {draft.license_expires}; insurance expires {draft.insurance_expires}</dd><dt>Evidence</dt><dd>Portrait and {state.documents.length}/4 private document images saved</dd></dl>
      <p>Use the pickup PIN only when the rider is present. Confirm payment using the correct method. Never demand an undisclosed fare. Report safety incidents through support and the appropriate emergency service.</p>
      <label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I confirm these details and documents belong to me or I am authorized to use this vehicle. I understand that an operator must review them before I can drive.</label>
    </>}
    <div className="actions">
      {draft.step>0&&<button type="button" className="secondary" disabled={busy} onClick={()=>void save(draft.step-1)}>Back</button>}
      <button type="button" className="secondary" disabled={busy} onClick={()=>void save()}>Save draft</button>
      {draft.step<3?<button type="button" disabled={busy||!areas.length} onClick={()=>void next()}>Continue</button>:<button type="button" disabled={busy||!consent} onClick={()=>void submit()}>{busy?"Submitting…":"Submit for review"}</button>}
      {onClose&&<button type="button" className="text-button" disabled={busy} onClick={onClose}>Close</button>}
    </div>
    {saved&&<p role="status" className="muted">Draft saved.</p>}
  </section>;
}
