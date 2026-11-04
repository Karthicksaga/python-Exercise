import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@hop/shared/api";
import { PrivateImage } from "@hop/shared/TrustProfile";
import type { Area } from "@hop/shared/types";
import type { ScreenProps } from "../AdminApp";
import { ago, CATS, daysUntil, DOC_LABEL, initials, minutesSince, useLoad, waited, when } from "../lib";
import type { AreaChange, Operations, VehicleChange } from "../types";
import { Badge, Drawer, Empty, Field, Icon, Modal, Note, Skeleton, Switch, Tabs, useNotify } from "../ui";

// Captain verification. The backend enforces every rule (documents.go, admin.go); this screen
// makes the state visible and explains what still blocks an approval.

type DocReview = { kind: string; status: "pending" | "accepted" | "rejected"; reason: string; updated_at: string };
export type AdminDriver = {
  id: string; name: string; email: string; phone: string; gender: string; status: string; online: boolean;
  has_photo: boolean; phone_verified: boolean; documents: string[]; document_reviews: DocReview[];
  vehicle_make: string; vehicle_model: string; vehicle_color: string; area: string; area_id?: string;
  vehicle_category: string; vehicle_number: string; license_reference: string; insurance_reference: string;
  license_expires: string; insurance_expires: string; next_expiry: string; docs_expired: boolean; review_note: string; pink_certified: boolean;
  submitted_at?: string; claimed_at?: string; claimed_name: string;
  identity_ok: boolean; license_ok: boolean; rc_ok: boolean; insurance_ok: boolean; vehicle_ok: boolean; police_ok: boolean;
  gender_ok: boolean; police_reference: string; trips: number;
};
type ListResponse = { drivers: AdminDriver[]; counts: Record<string, number>; required_documents: string[]; optional_documents: string[]; rejection_reasons: Record<string, string> };
type Meta = Pick<ListResponse, "required_documents" | "optional_documents" | "rejection_reasons">;
type Version = { id: number; kind: string; uploaded_at: string; superseded_at?: string; review_status: string; review_reason: string; reviewed_by: string };
type Decision = { status: "accepted" | "rejected"; reason?: string; note?: string };
type Tab = "pending" | "expiring" | "vehicle" | "area" | "approved" | "suspended";

const CHECKS: { key: keyof AdminDriver; label: string; hint: string; docs: string[] }[] = [
  { key: "identity_ok", label: "Identity", hint: "ID matches the applicant, portrait and legal name", docs: ["identity", "identity_back"] },
  { key: "license_ok", label: "Driving licence", hint: "Valid for this vehicle class; number and expiry match", docs: ["license", "license_back"] },
  { key: "rc_ok", label: "Registration (RC)", hint: "RC matches the vehicle number and owner", docs: ["rc", "rc_back"] },
  { key: "insurance_ok", label: "Insurance", hint: "Active policy covering commercial use; expiry matches", docs: ["insurance"] },
  { key: "vehicle_ok", label: "Vehicle inspection", hint: "Condition, safety gear and category checked", docs: [] },
  { key: "police_ok", label: "Police verification", hint: "Accepted certificate, or the police reference below", docs: [] },
];
const NOTE_MIN = 10;

export default function Reviews({ sub, refreshSummary }: ScreenProps) {
  const notify = useNotify();
  const [tab, setTab] = useState<Tab>((["pending", "expiring", "vehicle", "area", "approved", "suspended"].includes(sub) ? sub : "pending") as Tab);
  const [q, setQ] = useState(""), [query, setQuery] = useState(""), [area, setArea] = useState("");
  const [limit, setLimit] = useState(50);
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const listPath = tab === "vehicle" || tab === "area" ? null : (() => {
    const p = new URLSearchParams({ limit: String(limit), status: tab === "expiring" ? "approved" : tab });
    if (tab === "expiring") p.set("expiring", "1");
    if (query) p.set("q", query);
    if (area) p.set("area_id", area);
    return `/api/admin/drivers?${p}`;
  })();
  const list = useLoad<ListResponse>(listPath, notify);
  const ops = useLoad<Operations>("/api/operator", notify);
  const { data: cfg } = useLoad<{ areas: Area[] }>("/api/config", notify);
  const areas = cfg?.areas ?? [];
  const counts = list.data?.counts ?? {};
  const [sel, setSel] = useState("");
  const reload = useCallback(() => { void list.reload(); void ops.reload(); refreshSummary(); }, [list, ops, refreshSummary]);

  const tabs: [Tab, string, number?][] = [
    ["pending", "Applications", counts.pending], ["expiring", "Expiring documents", counts.expiring],
    ["vehicle", "Vehicle changes", ops.data?.vehicle_changes.length], ["area", "Area changes", ops.data?.area_changes.length],
    ["approved", "Enabled", undefined], ["suspended", "Disabled", undefined],
  ];
  const head = <Tabs value={tab} onChange={(t) => { setTab(t); setSel(""); setLimit(50); history.replaceState(null, "", `#reviews/${t}`); }} items={tabs} />;
  const meta: Meta | null = list.data ? { required_documents: list.data.required_documents, optional_documents: list.data.optional_documents, rejection_reasons: list.data.rejection_reasons } : null;
  const filters = (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 140px", gap: 8 }}>
      <Field label={<span className="sr">Search captains</span>}><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or vehicle" /></Field>
      <Field label={<span className="sr">Area</span>}><select value={area} onChange={(e) => setArea(e.target.value)}><option value="">All areas</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
    </div>
  );

  if (tab === "vehicle" || tab === "area") return <>{head}<ChangeRequests kind={tab} items={(tab === "vehicle" ? ops.data?.vehicle_changes : ops.data?.area_changes) ?? null} onDone={reload} /></>;

  const rows = list.data?.drivers ?? [];
  if (tab === "pending") {
    const current = rows.find((r) => r.id === sel) ?? rows[0];
    return (
      <>
        {head}
        <section className="grid g-split">
          <div className="card stack">
            {filters}
            <span className="small muted">Oldest first. Applications waiting more than 2 hours are red.</span>
            {!list.data ? <Skeleton /> : rows.length ? (
              <div className="queue">
                {rows.map((r) => {
                  const m = minutesSince(r.submitted_at), acc = acceptedCount(r, list.data!.required_documents);
                  const claimed = r.claimed_name && minutesSince(r.claimed_at) < 30;
                  return (
                    <button type="button" key={r.id} className="q-item" aria-current={current?.id === r.id} onClick={() => setSel(r.id)}>
                      <span className="initials">{initials(r.name)}</span>
                      <span className="li-main"><strong>{r.name}</strong><small>{CATS[r.vehicle_category] ?? r.vehicle_category} · {r.area} · {acc}/{list.data!.required_documents.length} docs{claimed ? ` · ${r.claimed_name} reviewing` : ""}</small></span>
                      <span className={`wait ${m > 120 ? "late" : m > 60 ? "mid" : "ok"}`}>{waited(r.submitted_at)}</span>
                    </button>
                  );
                })}
                {rows.length >= limit && <div className="load-more"><button type="button" className="btn sm secondary" onClick={() => setLimit((l) => Math.min(200, l + 50))}>Show more</button></div>}
              </div>
            ) : <Empty title="Queue is empty">{query || area ? "No applications match." : "No captain is waiting for review."}</Empty>}
          </div>
          {current && meta ? <ReviewPanel key={current.id} driver={current} meta={meta} areas={areas} onDone={reload} /> : list.data && <div className="card"><Empty title="Nothing to review" icon="id" /></div>}
        </section>
      </>
    );
  }

  const open = rows.find((r) => r.id === sel);
  return (
    <>
      {head}
      {tab === "expiring" && <Note tone="info">Captains get reminders automatically 30, 7 and 1 days before expiry. On the expiry date they go offline until a renewed document is accepted.</Note>}
      <div className="card stack" style={{ padding: 14 }}>{filters}</div>
      <section className="card flush">
        {!list.data ? <div style={{ padding: 20 }}><Skeleton /></div> : rows.length ? (
          <div className="table-wrap">
            <table className="tbl responsive">
              <thead><tr><th>Captain</th><th>Vehicle</th><th>Area</th><th>{tab === "expiring" ? "Expires" : "Documents"}</th><th>Trips</th><th className="actions" /></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const d = daysUntil(r.next_expiry);
                  return (
                    <tr key={r.id}>
                      <td className="lead"><strong>{r.name}</strong><small>{r.phone || r.email}</small></td>
                      <td data-label="Vehicle">{CATS[r.vehicle_category] ?? r.vehicle_category} · <span className="mono">{r.vehicle_number}</span></td>
                      <td data-label="Area">{r.area}</td>
                      <td data-label={tab === "expiring" ? "Expires" : "Documents"}>
                        {r.docs_expired ? <Badge tone="bad">Expired</Badge> : d <= 30 ? <Badge tone={d <= 1 ? "bad" : d <= 7 ? "warn" : "plain"}>{d <= 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d} days`}</Badge> : <Badge tone="ok">Valid</Badge>}
                        {r.pink_certified && <> <Badge tone="info">Pink</Badge></>}
                      </td>
                      <td data-label="Trips">{r.trips}</td>
                      <td className="actions"><button type="button" className="btn sm secondary" onClick={() => setSel(r.id)}>Open</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty title={tab === "expiring" ? "No documents expire in the next 30 days" : `No ${tab === "approved" ? "enabled" : "disabled"} captains${query || area ? " match" : ""}`} />}
        {rows.length >= limit && <div className="load-more"><button type="button" className="btn sm secondary" onClick={() => setLimit((l) => Math.min(200, l + 50))}>Show more</button></div>}
      </section>
      {open && meta && (
        <Drawer title={open.name} subtitle={`${CATS[open.vehicle_category] ?? open.vehicle_category} · ${open.vehicle_number} · ${open.area}`} onClose={() => setSel("")}>
          <ReviewPanel key={open.id} driver={open} meta={meta} areas={areas} onDone={() => { setSel(""); reload(); }} embedded />
        </Drawer>
      )}
    </>
  );
}

const acceptedCount = (r: AdminDriver, required: string[]) => r.document_reviews.filter((d) => d.status === "accepted" && required.includes(d.kind)).length;

function ReviewPanel({ driver: sel, meta, areas, onDone, embedded }: { driver: AdminDriver; meta: Meta; areas: Area[]; onDone: () => void; embedded?: boolean }) {
  const notify = useNotify();
  const { required_documents: required, optional_documents: optional, rejection_reasons: reasons } = meta;
  const [claimError, setClaimError] = useState("");
  const [form, setForm] = useState<Record<string, boolean>>(() => ({ ...Object.fromEntries(CHECKS.map((c) => [c.key, Boolean(sel[c.key])])), gender_ok: sel.gender_ok, pink_certified: sel.pink_certified }));
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [policeRef, setPoliceRef] = useState(sel.police_reference || ""), [note, setNote] = useState(""), [assigned, setAssigned] = useState(sel.area_id || "");
  const [busy, setBusy] = useState(false), [tried, setTried] = useState(false);
  const [viewer, setViewer] = useState<{ path: string; title: string } | null>(null);
  const [versions, setVersions] = useState<Version[] | null>(null), [history, setHistory] = useState(false);
  const claimed = useRef(false);

  // Claim while open so two operators don't review the same captain; release on close.
  useEffect(() => {
    let live = true;
    api(`/api/admin/drivers/${sel.id}/claim`, {}).then(() => { claimed.current = true; }).catch((e) => live && setClaimError((e as Error).message));
    return () => { live = false; if (claimed.current) void api(`/api/admin/drivers/${sel.id}/claim`, { release: true }).catch(() => undefined); };
  }, [sel.id]);

  const docState = useMemo(() => {
    const out: Record<string, { uploaded: boolean; status: string; reason: string }> = {};
    for (const k of [...required, ...optional]) {
      const review = sel.document_reviews.find((d) => d.kind === k), d = decisions[k];
      out[k] = { uploaded: Boolean(review), status: d?.status || review?.status || "missing", reason: d?.status === "rejected" ? (reasons[d.reason || ""] || d.note || "") : review?.reason || "" };
    }
    return out;
  }, [sel, decisions, required, optional, reasons]);
  const readOnly = Boolean(claimError);
  const accepted = required.filter((k) => docState[k]?.status === "accepted").length;
  const rejected = Object.entries(docState).filter(([, d]) => d.status === "rejected").map(([k]) => k);

  const blockers: [boolean, string][] = [
    [sel.phone_verified, sel.phone_verified ? "Mobile number verified" : "Mobile number isn't verified yet"],
    [sel.has_photo, sel.has_photo ? "Portrait uploaded" : "Portrait is missing"],
    [accepted === required.length, `All ${required.length} required documents accepted (${accepted} of ${required.length})`],
    ...CHECKS.map((c) => [Boolean(form[c.key]), `${c.label} check ticked`] as [boolean, string]),
    ...(form.police_ok && !policeRef.trim() && docState.police?.status !== "accepted" ? [[false, "Police check needs an accepted certificate or a reference"] as [boolean, string]] : []),
    [!sel.docs_expired, sel.docs_expired ? "Licence or insurance has expired" : "Licence and insurance in date"],
    [note.trim().length >= NOTE_MIN, `Review note written (${NOTE_MIN}+ characters, shown to the captain)`],
  ];
  const canApprove = blockers.every(([ok]) => ok) && rejected.length === 0 && !readOnly;

  function decide(kind: string, d: Decision | null) {
    setDecisions(({ [kind]: _old, ...rest }) => (d ? { ...rest, [kind]: d } : rest));
  }
  async function submit(status: "approved" | "suspended" | "pending" | "") {
    setTried(true);
    if (status === "approved" && !canApprove) return notify(rejected.length ? "Undo the rejections first, or send the application back." : "Finish the items in “Before you can approve” first.");
    if (status && note.trim().length < NOTE_MIN) return notify(`Write a review note of at least ${NOTE_MIN} characters.`);
    const missingReason = rejected.find((k) => decisions[k] && (!decisions[k].reason || (decisions[k].reason === "custom" && (decisions[k].note || "").trim().length < 10)));
    if (missingReason) return notify(`Choose a reason for ${DOC_LABEL[missingReason]}.`);
    setBusy(true);
    try {
      const res = await api<{ status: string; rejected: string[] }>(`/api/admin/drivers/${sel.id}`, {
        ...form, police_reference: policeRef.trim(), documents: decisions, status, note,
        area_id: assigned && assigned !== sel.area_id ? assigned : undefined,
      });
      if (status) claimed.current = false;
      notify(res.status === "approved" ? `${sel.name} is approved and can go online.` : res.rejected?.length ? `Sent back to ${sel.name}: ${res.rejected.length} document(s) to upload again.` : status === "suspended" ? `${sel.name} is disabled.` : "Review progress saved.");
      if (status) onDone(); else setDecisions({});
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  async function toggleHistory() {
    setHistory((h) => !h);
    if (!versions) {
      try { setVersions((await api<{ versions: Version[] }>(`/api/admin/drivers/${sel.id}/documents`)).versions); } catch (e) { notify((e as Error).message); }
    }
  }
  const noteErr = tried && note.trim().length < NOTE_MIN;
  const liveAreas = areas.filter((a) => a.active !== false);

  return (
    <div className={embedded ? "stack" : "card stack"} style={{ gap: 16 }}>
      <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
        {sel.has_photo ? <PrivateImage accountId={sel.id} alt={`${sel.name} portrait`} className="portrait" /> : <span className="initials" style={{ width: 56, height: 56, fontSize: 17 }}>{initials(sel.name)}</span>}
        <div className="li-main">
          {!embedded && <h2>{sel.name}</h2>}
          <small>{sel.phone || sel.email}{sel.phone && (sel.phone_verified ? " · verified" : " · not verified")} · {sel.gender ? sel.gender : "gender not set"}</small>
          <small>{[sel.vehicle_color, sel.vehicle_make, sel.vehicle_model].filter(Boolean).join(" ")} · {CATS[sel.vehicle_category] ?? sel.vehicle_category} · <span className="mono">{sel.vehicle_number}</span></small>
          <small>{sel.submitted_at ? `Submitted ${ago(sel.submitted_at)}` : ""} · {sel.trips} trips</small>
        </div>
        {liveAreas.length > 0 && <Field label="Service area" className="area-pick"><select value={assigned} disabled={readOnly} onChange={(e) => setAssigned(e.target.value)} style={{ width: 170 }}>{!liveAreas.some((a) => a.id === assigned) && <option value={assigned}>{sel.area}</option>}{liveAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
      </div>
      <dl className="kv"><dt>Licence</dt><dd>{sel.license_reference || "—"} · expires {sel.license_expires || "—"}</dd><dt>Insurance</dt><dd>{sel.insurance_reference || "—"} · expires {sel.insurance_expires || "—"}</dd>{sel.review_note && <><dt>Last note</dt><dd>{sel.review_note}</dd></>}</dl>
      {readOnly ? <Note tone="warn" icon="user"><b>{claimError}.</b> You can look, but decisions are locked so two reviews don't conflict.</Note> : <Note tone="info">You're reviewing this captain. Other operators see it as taken while it's open. Every document view is recorded.</Note>}
      {sel.docs_expired && <Note tone="bad" icon="alert">Licence or insurance has expired. The captain can't be enabled until a renewal is uploaded and the date updated.</Note>}

      <div>
        <div className="spread" style={{ marginBottom: 8 }}><strong>Documents</strong><span className="small muted">{accepted} of {required.length} required accepted{rejected.length ? ` · ${rejected.length} rejected` : ""}</span></div>
        <div className="progress"><i style={{ width: `${(accepted / Math.max(1, required.length)) * 100}%` }} /></div>
      </div>
      <div className="doc-grid">
        {[...required, ...optional].map((k) => {
          const st = docState[k], d = decisions[k], isOptional = optional.includes(k);
          const path = `/api/drivers/documents/${sel.id}/${k}`;
          return (
            <div key={k} className={`doc ${st.status === "missing" ? "missing" : st.status}`}>
              {st.uploaded
                ? <button type="button" className="doc-thumb" onClick={() => setViewer({ path, title: DOC_LABEL[k] ?? k })} aria-label={`Open ${DOC_LABEL[k] ?? k}`}><PrivateImage accountId={sel.id} kind={k} alt={DOC_LABEL[k] ?? k} /></button>
                : <div className="doc-thumb"><span>{isOptional ? "Not uploaded (optional)" : "Waiting for upload"}</span></div>}
              <div className="doc-body">
                <div className="spread"><strong className="small">{DOC_LABEL[k] ?? k}</strong>{isOptional ? <Badge tone="plain">Optional</Badge> : st.status === "accepted" && !d ? <Badge tone="ok">Accepted</Badge> : st.status === "rejected" && !d ? <Badge tone="bad">Rejected</Badge> : null}</div>
                {st.reason && st.status === "rejected" && !d && <span className="small" style={{ color: "var(--danger)" }}>{st.reason}</span>}
                {st.uploaded && !readOnly && (
                  <div className="doc-actions">
                    <button type="button" className="btn secondary ok" aria-pressed={d?.status === "accepted"} onClick={() => decide(k, d?.status === "accepted" ? null : { status: "accepted" })}>Accept</button>
                    <button type="button" className="btn secondary bad" aria-pressed={d?.status === "rejected"} onClick={() => decide(k, d?.status === "rejected" ? null : { status: "rejected", reason: "" })}>Reject</button>
                  </div>
                )}
                {d?.status === "rejected" && <>
                  <label><span className="sr">Reason for {DOC_LABEL[k]}</span>
                    <select value={d.reason || ""} onChange={(e) => decide(k, { ...d, reason: e.target.value })}>
                      <option value="">Choose a reason…</option>
                      {Object.entries(reasons).map(([v, text]) => <option key={v} value={v}>{text}</option>)}
                      <option value="custom">Other (write it)</option>
                    </select>
                  </label>
                  {d.reason === "custom" && <input className="doc-note" value={d.note || ""} onChange={(e) => decide(k, { ...d, note: e.target.value })} placeholder="What to fix (10+ characters)" aria-label="What the captain should fix" />}
                </>}
              </div>
            </div>
          );
        })}
      </div>
      <div><button type="button" className="btn sm ghost" onClick={() => void toggleHistory()}><Icon name="clock" size={14} />{history ? "Hide" : "Show"} upload history</button></div>
      {history && (
        <div className="table-wrap card flush">
          <table className="tbl">
            <thead><tr><th>Document</th><th>Uploaded</th><th>Outcome</th><th>By</th><th /></tr></thead>
            <tbody>
              {(versions ?? []).map((v) => (
                <tr key={v.id}>
                  <td>{DOC_LABEL[v.kind] ?? v.kind}<small>{v.superseded_at ? "replaced" : "current"}</small></td>
                  <td>{when(v.uploaded_at)}</td>
                  <td><Badge tone={v.review_status === "accepted" ? "ok" : v.review_status === "rejected" ? "bad" : "plain"}>{v.review_status}</Badge>{v.review_reason && <small>{v.review_reason}</small>}</td>
                  <td>{v.reviewed_by || "—"}</td>
                  <td className="actions"><button type="button" className="btn sm secondary" onClick={() => setViewer({ path: `/api/admin/document-versions/${v.id}`, title: `${DOC_LABEL[v.kind] ?? v.kind} · ${when(v.uploaded_at)}` })}>View</button></td>
                </tr>
              ))}
              {versions?.length === 0 && <tr><td colSpan={5} className="muted">No uploads yet.</td></tr>}
              {!versions && <tr><td colSpan={5} className="muted">Loading…</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className="stack" style={{ gap: 8 }}>
        <strong>Verification checks</strong>
        <div className="check-list">
          {CHECKS.map((c) => {
            const anyRejected = c.docs.some((k) => docState[k]?.status === "rejected");
            const docsOk = c.docs.every((k) => docState[k]?.status === "accepted");
            return (
              <label key={c.key} className="check">
                <input type="checkbox" checked={Boolean(form[c.key])} disabled={readOnly || anyRejected} onChange={(e) => setForm({ ...form, [c.key]: e.target.checked })} />
                <span>{c.label}<small>{anyRejected ? "A linked document is rejected" : c.docs.length && !docsOk ? `${c.hint}. Accept the linked documents first.` : c.hint}</small></span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="grid g-2" style={{ gap: 14 }}>
        <Field label="Police verification reference" hint="Certificate number or police portal reference, if no certificate was uploaded."><input value={policeRef} maxLength={80} disabled={readOnly} onChange={(e) => setPoliceRef(e.target.value)} placeholder="Reference" /></Field>
        <div className="stack" style={{ gap: 4 }}>
          <label className="check"><input type="checkbox" checked={Boolean(form.gender_ok)} disabled={readOnly} onChange={(e) => setForm({ ...form, gender_ok: e.target.checked, pink_certified: e.target.checked && form.pink_certified })} /><span>Gender checked against the ID document</span></label>
          <Switch checked={Boolean(form.pink_certified)} disabled={readOnly || sel.gender !== "female" || !form.gender_ok} onChange={(v) => setForm({ ...form, pink_certified: v })} label="Pink rides"
            hint={sel.gender !== "female" ? "Only for women captains." : !form.gender_ok ? "Check gender against the ID first." : "Women riders only."} />
        </div>
      </div>
      <Field label="Review note" error={noteErr ? `Write at least ${NOTE_MIN} characters. The captain sees this note.` : undefined} hint="Shown to the captain. Required to approve, send back or disable.">
        <textarea value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} placeholder="What you verified, and how" />
      </Field>
      <div className="card" style={{ background: "var(--surface-2)", boxShadow: "none", padding: "14px 16px" }}>
        <strong className="small">Before you can approve</strong>
        <ul className="blockers" style={{ marginTop: 8 }}>{blockers.map(([ok, t], i) => <li key={i} className={ok ? "done" : "todo"}><Icon name={ok ? "check" : "circle"} size={16} /><span>{t}</span></li>)}</ul>
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost" disabled={busy || readOnly} onClick={() => void submit("")}>Save progress</button>
        <button type="button" className="btn danger-soft" disabled={busy || readOnly} onClick={() => void submit("suspended")}>Disable</button>
        <button type="button" className="btn secondary" disabled={busy || readOnly} onClick={() => void submit("pending")}>Send back{rejected.length ? ` (${rejected.length} to fix)` : " for corrections"}</button>
        <button type="button" className="btn primary" disabled={busy || readOnly} aria-disabled={!canApprove} onClick={() => void submit("approved")}><Icon name="check" size={16} />{sel.status === "approved" ? "Save, keep enabled" : "Approve captain"}</button>
      </div>
      {viewer && <EvidenceViewer {...viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

// Full-size evidence through the audited API, with rotate and zoom.
function EvidenceViewer({ path, title, onClose }: { path: string; title: string; onClose: () => void }) {
  const [src, setSrc] = useState(""), [failed, setFailed] = useState(false), [rot, setRot] = useState(0), [zoom, setZoom] = useState(1);
  useEffect(() => {
    let live = true;
    api<{ image: string; content_type: string }>(path).then((r) => live && setSrc(`data:${r.content_type};base64,${r.image}`)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [path]);
  return (
    <Modal wide title={title} onClose={onClose}>
      <div className="row">
        <button type="button" className="btn sm secondary" onClick={() => setRot((r) => (r + 90) % 360)}><Icon name="rotate" size={16} />Rotate</button>
        <button type="button" className="btn sm secondary" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}><Icon name="plus" size={16} />Zoom in</button>
        <button type="button" className="btn sm secondary" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}><Icon name="minus" size={16} />Zoom out</button>
        <span className="small muted" style={{ marginLeft: "auto" }}>{Math.round(zoom * 100)}%</span>
      </div>
      <div className="viewer">
        {failed ? <span className="muted">Image unavailable. Storage may be offline; try again.</span> : src ? <img src={src} alt={title} style={{ transform: `rotate(${rot}deg) scale(${zoom})` }} /> : <span className="muted">Loading…</span>}
      </div>
    </Modal>
  );
}

function ChangeRequests({ kind, items, onDone }: { kind: "vehicle" | "area"; items: (VehicleChange | AreaChange)[] | null; onDone: () => void }) {
  const notify = useNotify();
  const [notes, setNotes] = useState<Record<string, string>>({}), [errors, setErrors] = useState<Record<string, boolean>>({}), [busy, setBusy] = useState("");
  if (!items) return <Skeleton />;
  if (!items.length) return <div className="card"><Empty title={`No pending ${kind} changes`} /></div>;
  async function decide(id: string, status: "approved" | "rejected", name: string) {
    const note = (notes[id] || "").trim();
    if (note.length < 5) return setErrors({ ...errors, [id]: true });
    setBusy(id);
    try {
      await api(`/api/operator/${kind}-changes/${id}`, { status, note });
      notify(`${kind === "vehicle" ? "Vehicle" : "Area"} change ${status} for ${name}.`);
      onDone();
    } catch (e) { notify((e as Error).message); } finally { setBusy(""); }
  }
  return (
    <section className="grid g-2">
      {items.map((c) => {
        const v = kind === "vehicle" ? (c as VehicleChange) : null, a = kind === "area" ? (c as AreaChange) : null;
        return (
          <div key={c.id} className="card stack">
            <div className="row"><span className="initials">{initials(c.name)}</span><div className="li-main"><strong>{c.name}</strong><small>Requested {ago(c.created_at)}</small></div></div>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <div className="note" style={{ flex: 1 }}><span><small className="muted">Now</small><br /><b>{v ? `${CATS[v.current_category] ?? v.current_category} · ${v.current_number}` : `${a!.current_area_name}, ${a!.current_area_state}`}</b></span></div>
              <Icon name="chevron" size={20} />
              <div className="note info" style={{ flex: 1 }}><span><small>Requested</small><br /><b>{v ? `${CATS[v.vehicle_category] ?? v.vehicle_category} · ${v.vehicle_number}` : `${a!.requested_area_name}, ${a!.requested_area_state}`}</b></span></div>
            </div>
            {v && <span className="small muted">Check the new RC and insurance before approving.</span>}
            <Field label="Note to captain" error={errors[c.id] ? "Write at least 5 characters." : undefined}>
              <textarea value={notes[c.id] || ""} onChange={(e) => { setNotes({ ...notes, [c.id]: e.target.value }); setErrors({ ...errors, [c.id]: false }); }} placeholder={v ? "e.g. RC verified for the new vehicle" : "e.g. Approved for the new zone"} />
            </Field>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn secondary" disabled={busy === c.id} onClick={() => void decide(c.id, "rejected", c.name)}>Reject</button>
              <button type="button" className="btn primary" disabled={busy === c.id} onClick={() => void decide(c.id, "approved", c.name)}>Approve</button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
