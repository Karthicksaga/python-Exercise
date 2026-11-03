import { PrivateImage } from "@hop/shared/TrustProfile";
import ResponsiveTable from "@hop/shared/ResponsiveTable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon, Alert, Badge, Button, Card, Checkbox, Collapse, Container, Drawer, Group, Modal, Select, SimpleGrid,
  Stack, Switch, Table, Tabs, Text, TextInput, Textarea, Tooltip,
} from "@mantine/core";
import { IconAlertTriangle, IconRotateClockwise, IconZoomIn, IconZoomOut } from "@tabler/icons-react";
import { api } from "@hop/shared/api";
import type { Area } from "@hop/shared/types";

// Captain verification console. The backend enforces every rule; this screen makes the
// state visible: queue age, claims, per-document decisions with reasons, and history.

type DocReview = { kind: string; status: "pending" | "accepted" | "rejected"; reason: string; updated_at: string };
type AdminDriver = {
  id: string; name: string; email: string; phone: string; gender: string; status: string; online: boolean;
  has_photo: boolean; phone_verified: boolean; documents: string[]; document_reviews: DocReview[]; onboarding_version: number;
  vehicle_make: string; vehicle_model: string; vehicle_color: string; area: string; area_id?: string;
  vehicle_category: string; vehicle_number: string; license_reference: string; insurance_reference: string;
  license_expires: string; insurance_expires: string; next_expiry: string; docs_expired: boolean; review_note: string; pink_certified: boolean;
  submitted_at?: string; reviewed_at?: string; claimed_by?: string; claimed_at?: string; claimed_name: string;
  identity_ok: boolean; license_ok: boolean; rc_ok: boolean; insurance_ok: boolean; vehicle_ok: boolean; police_ok: boolean;
  gender_ok: boolean; police_reference: string; trips: number;
};
type ListResponse = {
  drivers: AdminDriver[]; counts: Record<string, number>; required_documents: string[]; optional_documents: string[];
  rejection_reasons: Record<string, string>;
};
type Version = { id: number; kind: string; uploaded_at: string; superseded_at?: string; review_status: string; review_reason: string; reviewed_by: string };
type Decision = { status: "accepted" | "rejected" | "pending"; reason?: string; note?: string };

const LABELS: Record<string, string> = {
  identity: "ID · front", identity_back: "ID · back", license: "Licence · front", license_back: "Licence · back",
  rc: "RC · front", rc_back: "RC · back", insurance: "Insurance", police: "Police clearance",
};
const CHECKS: { key: keyof AdminDriver; label: string; hint: string; docs: string[] }[] = [
  { key: "identity_ok", label: "Identity", hint: "ID matches the applicant, portrait and legal name", docs: ["identity", "identity_back"] },
  { key: "license_ok", label: "Driving licence", hint: "Valid for this vehicle class; number and expiry match", docs: ["license", "license_back"] },
  { key: "rc_ok", label: "Registration (RC)", hint: "RC matches the vehicle number and owner", docs: ["rc", "rc_back"] },
  { key: "insurance_ok", label: "Insurance", hint: "Active policy covering commercial use; expiry matches", docs: ["insurance"] },
  { key: "vehicle_ok", label: "Vehicle inspection", hint: "Condition, safety gear and category checked", docs: [] },
  { key: "police_ok", label: "Police verification", hint: "Accepted certificate, or record the police reference below", docs: [] },
];
const statusColor: Record<string, string> = { pending: "yellow", approved: "green", suspended: "red" };
const docColor: Record<string, string> = { pending: "gray", accepted: "green", rejected: "red" };

function hoursSince(iso?: string) {
  return iso ? Math.max(0, (Date.now() - new Date(iso).getTime()) / 3_600_000) : 0;
}
function age(iso?: string) {
  const h = hoursSince(iso);
  return h < 1 ? "< 1 h" : h < 48 ? `${Math.floor(h)} h` : `${Math.floor(h / 24)} d`;
}
function daysUntil(date?: string) {
  return date ? Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000) : Infinity;
}

// Loads one evidence image (current document or a historical version) through the audited API.
function EvidenceImage({ path, alt, rotate = 0, zoom = 1 }: { path: string; alt: string; rotate?: number; zoom?: number }) {
  const [src, setSrc] = useState(""), [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true; setSrc(""); setFailed(false);
    api<{ image: string; content_type: string }>(path)
      .then((r) => live && setSrc(`data:${r.content_type};base64,${r.image}`))
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [path]);
  if (failed) return <Text size="sm" c="red">Image unavailable. Storage may be offline; try again.</Text>;
  if (!src) return <Text size="sm" c="dimmed">Loading…</Text>;
  return <img src={src} alt={alt} style={{ maxWidth: "100%", transform: `rotate(${rotate}deg) scale(${zoom})`, transformOrigin: "center", transition: "transform .15s" }} />;
}

export default function AdminConsole({ notify }: { notify: (s: string) => void; onExit?: () => void }) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [tab, setTab] = useState<string | null>("pending");
  const [search, setSearch] = useState(""), [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const [sel, setSel] = useState<AdminDriver | null>(null);
  const [claimError, setClaimError] = useState("");
  const [form, setForm] = useState<Record<string, boolean>>({});
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [policeRef, setPoliceRef] = useState(""), [note, setNote] = useState(""), [assignedArea, setAssignedArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<{ path: string; title: string } | null>(null);
  const [rotate, setRotate] = useState(0), [zoom, setZoom] = useState(1);
  const [versions, setVersions] = useState<Version[] | null>(null), [showHistory, setShowHistory] = useState(false);
  const claimedRef = useRef<string>("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (tab === "expiring") { params.set("status", "approved"); params.set("expiring", "1"); } else if (tab) params.set("status", tab);
    if (search.trim()) params.set("q", search.trim());
    if (areaFilter) params.set("area_id", areaFilter);
    try {
      const [cfg, res] = await Promise.all([
        api<{ areas: Area[] }>("/api/config"),
        api<ListResponse>(`/api/admin/drivers?${params}`),
      ]);
      setAreas(cfg.areas ?? []);
      setData(res);
    } catch (e) {
      notify((e as Error).message);
    }
  }, [notify, tab, search, areaFilter, limit]);
  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t); }, [load]);

  const required = data?.required_documents ?? [];
  const optional = data?.optional_documents ?? [];
  const reasons = data?.rejection_reasons ?? {};
  const rows = data?.drivers ?? [];
  const counts = data?.counts ?? {};

  async function release() {
    if (claimedRef.current) {
      const id = claimedRef.current; claimedRef.current = "";
      await api(`/api/admin/drivers/${id}/claim`, { release: true }).catch(() => {});
    }
  }
  async function open(r: AdminDriver) {
    await release();
    setSel(r); setClaimError(""); setNote(""); setVersions(null); setShowHistory(false);
    setAssignedArea(r.area_id || ""); setPoliceRef(r.police_reference || "");
    setForm({ ...Object.fromEntries(CHECKS.map((c) => [c.key, Boolean(r[c.key])])), gender_ok: r.gender_ok, pink_certified: r.pink_certified });
    setDecisions({});
    try { await api(`/api/admin/drivers/${r.id}/claim`, {}); claimedRef.current = r.id; }
    catch (e) { setClaimError((e as Error).message); }
  }
  async function close() { await release(); setSel(null); void load(); }
  useEffect(() => () => { void release(); }, []);

  const docState = useMemo(() => {
    const state: Record<string, { uploaded: boolean; status: string; reason: string }> = {};
    for (const k of [...required, ...optional]) {
      const review = sel?.document_reviews?.find((d) => d.kind === k);
      const pendingDecision = decisions[k];
      state[k] = {
        uploaded: Boolean(review),
        status: pendingDecision?.status || review?.status || "missing",
        reason: pendingDecision?.status === "rejected" ? (reasons[pendingDecision.reason || ""] || pendingDecision.note || "") : review?.reason || "",
      };
    }
    return state;
  }, [sel, decisions, required, optional, reasons]);

  const blockers: string[] = [];
  if (sel) {
    if (!sel.phone_verified) blockers.push("Mobile number is not verified");
    if (!sel.has_photo) blockers.push("Portrait is missing");
    for (const k of required) if (docState[k]?.status !== "accepted") blockers.push(`${LABELS[k]} not accepted`);
    for (const c of CHECKS) if (!form[c.key]) blockers.push(`${c.label} check not ticked`);
    if (form.police_ok && !policeRef.trim() && docState.police?.status !== "accepted") blockers.push("Police check needs a certificate or reference");
    if (sel.docs_expired) blockers.push("Licence or insurance has expired");
    if (note.trim().length < 10) blockers.push("Review note (10+ characters) required");
  }
  const rejectedCount = Object.values(docState).filter((d) => d.status === "rejected").length;
  const readOnly = Boolean(claimError);

  async function submit(status: "approved" | "suspended" | "pending" | "") {
    if (!sel) return;
    setBusy(true);
    try {
      const res = await api<{ status: string; rejected: string[] }>(`/api/admin/drivers/${sel.id}`, {
        ...form, police_reference: policeRef.trim(), documents: decisions, status, note,
        area_id: assignedArea && assignedArea !== sel.area_id ? assignedArea : undefined,
      });
      claimedRef.current = status ? "" : claimedRef.current;
      notify(res.status === "approved" ? "Captain enabled." : res.rejected?.length ? `Sent back: ${res.rejected.length} document(s) to re-upload.` : status === "suspended" ? "Captain disabled." : "Review saved.");
      if (status) { setSel(null); } else { setDecisions({}); }
      await load();
      if (!status) setSel((cur) => cur && (data?.drivers.find((d) => d.id === cur.id) || cur));
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadHistory() {
    if (!sel) return;
    setShowHistory((v) => !v);
    if (!versions) {
      try { setVersions((await api<{ versions: Version[] }>(`/api/admin/drivers/${sel.id}/documents`)).versions); }
      catch (e) { notify((e as Error).message); }
    }
  }
  function decide(kind: string, d: Decision) { setDecisions((cur) => ({ ...cur, [kind]: d })); }
  function view(path: string, title: string) { setRotate(0); setZoom(1); setViewer({ path, title }); }

  return (
    // Span every column when placed inside the operator panel grid.
    <Container fluid p={0} w="100%" style={{ gridColumn: "1 / -1" }}>
      <SimpleGrid cols={{ base: 2, md: 5 }} mb="md">
        {[["Awaiting review", counts.pending], ["Enabled", counts.approved], ["Disabled", counts.suspended], ["Expiring ≤ 30 d", counts.expiring], ["Pink certified", counts.pink]].map(([l, v]) => (
          <Card key={l as string} withBorder radius="lg"><Text size="xs" c="dimmed" tt="uppercase" fw={600}>{l}</Text><Text fz={28} fw={800}>{v ?? "—"}</Text></Card>
        ))}
      </SimpleGrid>
      <Group mb="sm" align="end" wrap="wrap">
        <TextInput label="Search" placeholder="Name, phone or vehicle number" value={search} onChange={(e) => setSearch(e.currentTarget.value)} w={280} />
        <Select label="Area" placeholder="All areas" clearable value={areaFilter} onChange={setAreaFilter} w={220}
          data={areas.map((a) => ({ value: a.id, label: a.name }))} />
        <Button variant="default" onClick={() => void load()}>Refresh</Button>
      </Group>
      <Tabs value={tab} onChange={(v) => { setTab(v); setLimit(50); }}>
        <Tabs.List mb="md">
          <Tabs.Tab value="pending">Pending ({counts.pending ?? 0})</Tabs.Tab>
          <Tabs.Tab value="expiring">Expiring soon ({counts.expiring ?? 0})</Tabs.Tab>
          <Tabs.Tab value="approved">Enabled</Tabs.Tab>
          <Tabs.Tab value="suspended">Disabled</Tabs.Tab>
          <Tabs.Tab value="all">All</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <Card withBorder radius="lg" p={0} style={{ overflowX: "auto" }}>
        <ResponsiveTable highlightOnHover verticalSpacing="sm">
          <Table.Thead><Table.Tr><Table.Th>Captain</Table.Th><Table.Th>Vehicle</Table.Th><Table.Th>Area</Table.Th><Table.Th>Documents</Table.Th><Table.Th>Waiting</Table.Th><Table.Th>Status</Table.Th><Table.Th /></Table.Tr></Table.Thead>
          <Table.Tbody>
            {rows.map((r) => {
              const accepted = r.document_reviews.filter((d) => d.status === "accepted" && required.includes(d.kind)).length;
              const rejected = r.document_reviews.filter((d) => d.status === "rejected").length;
              const waited = hoursSince(r.submitted_at);
              const expiresIn = daysUntil(r.next_expiry);
              return (
                <Table.Tr key={r.id}>
                  <Table.Td><Text fw={600} size="sm">{r.name}</Text><Text size="xs" c="dimmed">{r.phone || r.email}</Text></Table.Td>
                  <Table.Td><Text size="sm">{r.vehicle_number}</Text><Text size="xs" c="dimmed">{r.vehicle_category}</Text></Table.Td>
                  <Table.Td>{r.area}</Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={accepted === required.length ? "green" : "gray"}>{accepted}/{required.length} accepted</Badge>
                    {rejected > 0 && <Badge ml={6} color="red" variant="light">{rejected} rejected</Badge>}
                    {r.docs_expired ? <Badge ml={6} color="red">Expired</Badge> : expiresIn <= 30 && <Badge ml={6} color="orange">Expires in {expiresIn} d</Badge>}
                  </Table.Td>
                  <Table.Td>{r.status === "pending" ? <Badge variant="light" color={waited > 48 ? "red" : waited > 24 ? "orange" : "gray"}>{age(r.submitted_at)}</Badge> : <Text size="xs" c="dimmed">—</Text>}</Table.Td>
                  <Table.Td>
                    <Badge color={statusColor[r.status]}>{r.status === "approved" ? "enabled" : r.status === "suspended" ? "disabled" : "pending"}</Badge>
                    {r.pink_certified && <Badge ml={6} color="pink">Pink</Badge>}
                    {r.claimed_name && hoursSince(r.claimed_at) < 0.5 && <Badge ml={6} variant="outline">With {r.claimed_name}</Badge>}
                  </Table.Td>
                  <Table.Td><Button size="compact-sm" variant="light" onClick={() => void open(r)}>Review</Button></Table.Td>
                </Table.Tr>
              );
            })}
            {rows.length === 0 && <Table.Tr><Table.Td colSpan={7}><Text c="dimmed" ta="center" py="lg">{data ? "Nothing here." : "Loading…"}</Text></Table.Td></Table.Tr>}
          </Table.Tbody>
        </ResponsiveTable>
      </Card>
      {rows.length >= limit && <Group justify="center" mt="md"><Button variant="default" onClick={() => setLimit((l) => Math.min(200, l + 50))}>Show more</Button></Group>}

      <Drawer opened={!!sel} onClose={() => void close()} position="right" size="xl" title={sel ? `Review ${sel.name}` : ""}>
        {sel && (
          <Stack gap="md">
            {claimError && <Alert color="orange" icon={<IconAlertTriangle size={16} />}>{claimError}. You can look, but decisions are disabled to avoid conflicting reviews.</Alert>}
            <Card withBorder radius="md">
              <Group align="start" wrap="nowrap">
                {sel.has_photo ? <PrivateImage accountId={sel.id} alt="Applicant portrait" className="captain-portrait" /> : <Badge color="red">No portrait</Badge>}
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" style={{ flex: 1 }}>
                  <div><Text size="xs" c="dimmed">Phone {sel.phone_verified ? "· verified" : "· NOT verified"}</Text><Text size="sm">{sel.phone || "—"}</Text></div>
                  <div><Text size="xs" c="dimmed">Gender (self-declared)</Text><Text size="sm">{sel.gender || "not set"}</Text></div>
                  <div><Text size="xs" c="dimmed">Vehicle</Text><Text size="sm">{sel.vehicle_number} · {sel.vehicle_category}<br />{sel.vehicle_color} {sel.vehicle_make} {sel.vehicle_model}</Text></div>
                  <div><Text size="xs" c="dimmed">Submitted · trips</Text><Text size="sm">{age(sel.submitted_at)} ago · {sel.trips} trips</Text></div>
                  <div><Text size="xs" c="dimmed">Licence no. · expires</Text><Text size="sm">{sel.license_reference} · {sel.license_expires}</Text></div>
                  <div><Text size="xs" c="dimmed">Insurance no. · expires</Text><Text size="sm">{sel.insurance_reference} · {sel.insurance_expires}</Text></div>
                </SimpleGrid>
              </Group>
              {areas.length > 0 && (
                <Select label="Service area" size="xs" mt="sm" w={260} disabled={readOnly}
                  data={areas.filter((a) => a.active !== false).map((a) => ({ value: a.id, label: `${a.name} (${a.state})` }))}
                  value={assignedArea} onChange={(v) => setAssignedArea(v || "")} />
              )}
              {sel.review_note && <Text size="xs" c="dimmed" mt="sm">Last note: {sel.review_note}</Text>}
            </Card>
            {sel.docs_expired && <Alert color="red" icon={<IconAlertTriangle size={16} />}>Licence or insurance has expired. The captain can't be enabled until a renewal is uploaded and the date updated.</Alert>}

            <Group justify="space-between"><Text fw={700}>Documents</Text><Text size="xs" c="dimmed">Every view is audited. Compare each image with the typed details above.</Text></Group>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              {[...required, ...optional].map((k) => {
                const st = docState[k];
                const d = decisions[k];
                return (
                  <Card key={k} withBorder radius="md" p="sm">
                    <Group justify="space-between" mb={6}>
                      <Text fw={600} size="sm">{LABELS[k] || k}{optional.includes(k) && <Text span size="xs" c="dimmed"> · optional</Text>}</Text>
                      <Badge color={st.status === "missing" ? (optional.includes(k) ? "gray" : "red") : docColor[st.status]} variant="light">{st.status === "missing" ? "not uploaded" : st.status}</Badge>
                    </Group>
                    {st.uploaded ? (
                      <div role="button" tabIndex={0} style={{ cursor: "zoom-in", maxHeight: 160, overflow: "hidden", borderRadius: 8 }}
                        onClick={() => view(`/api/drivers/documents/${sel.id}/${k}`, LABELS[k])}
                        onKeyDown={(e) => e.key === "Enter" && view(`/api/drivers/documents/${sel.id}/${k}`, LABELS[k])}>
                        <PrivateImage accountId={sel.id} kind={k} alt={LABELS[k]} />
                      </div>
                    ) : <Text size="xs" c="dimmed">Waiting for the captain to upload.</Text>}
                    {st.reason && st.status === "rejected" && <Text size="xs" c="red" mt={4}>{st.reason}</Text>}
                    {st.uploaded && !readOnly && (
                      <Stack gap={6} mt="xs">
                        <Group gap="xs">
                          <Button size="compact-xs" color="green" variant={d?.status === "accepted" ? "filled" : "light"} onClick={() => decide(k, { status: "accepted" })}>Accept</Button>
                          <Button size="compact-xs" color="red" variant={d?.status === "rejected" ? "filled" : "light"} onClick={() => decide(k, { status: "rejected", reason: "blurry" })}>Reject</Button>
                          {d && <Button size="compact-xs" variant="subtle" onClick={() => setDecisions(({ [k]: _drop, ...rest }) => rest)}>Undo</Button>}
                        </Group>
                        {d?.status === "rejected" && (
                          <>
                            <Select size="xs" label="Reason shown to the captain" value={d.reason || ""} allowDeselect={false}
                              data={[...Object.entries(reasons).map(([value, label]) => ({ value, label })), { value: "custom", label: "Other (write below)" }]}
                              onChange={(v) => decide(k, { ...d, reason: v || "custom" })} />
                            <TextInput size="xs" placeholder={d.reason === "custom" ? "Explain what to fix (10+ characters)" : "Optional extra detail"} value={d.note || ""}
                              onChange={(e) => decide(k, { ...d, note: e.currentTarget.value })} />
                          </>
                        )}
                      </Stack>
                    )}
                  </Card>
                );
              })}
            </SimpleGrid>
            <Button variant="subtle" size="xs" onClick={() => void loadHistory()}>{showHistory ? "Hide" : "Show"} document history</Button>
            <Collapse in={showHistory}>
              <Table fz="xs" withTableBorder>
                <Table.Thead><Table.Tr><Table.Th>Document</Table.Th><Table.Th>Uploaded</Table.Th><Table.Th>Outcome</Table.Th><Table.Th>By</Table.Th><Table.Th /></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {(versions ?? []).map((v) => (
                    <Table.Tr key={v.id}>
                      <Table.Td>{LABELS[v.kind] || v.kind}{v.superseded_at ? " (replaced)" : " (current)"}</Table.Td>
                      <Table.Td>{new Date(v.uploaded_at).toLocaleString()}</Table.Td>
                      <Table.Td><Badge size="xs" color={docColor[v.review_status]} variant="light">{v.review_status}</Badge>{v.review_reason && <Text size="xs" c="dimmed">{v.review_reason}</Text>}</Table.Td>
                      <Table.Td>{v.reviewed_by || "—"}</Table.Td>
                      <Table.Td><Button size="compact-xs" variant="light" onClick={() => view(`/api/admin/document-versions/${v.id}`, `${LABELS[v.kind]} · ${new Date(v.uploaded_at).toLocaleDateString()}`)}>View</Button></Table.Td>
                    </Table.Tr>
                  ))}
                  {versions?.length === 0 && <Table.Tr><Table.Td colSpan={5}>No uploads yet.</Table.Td></Table.Tr>}
                </Table.Tbody>
              </Table>
            </Collapse>

            <Stack gap="xs">
              <Text fw={700}>Verification checklist</Text>
              {CHECKS.map((c) => {
                const docsAccepted = c.docs.every((k) => docState[k]?.status === "accepted");
                const anyRejected = c.docs.some((k) => docState[k]?.status === "rejected");
                return (
                  <Checkbox key={c.key} disabled={readOnly || anyRejected} checked={!!form[c.key]} onChange={(e) => setForm({ ...form, [c.key]: e.currentTarget.checked })}
                    label={c.label} description={anyRejected ? "A linked document is rejected" : c.docs.length && !docsAccepted ? `${c.hint} · accept the linked documents first` : c.hint} />
                );
              })}
              <TextInput label="Police verification reference" description="Certificate number or police portal reference, if no certificate was uploaded" maxLength={80}
                value={policeRef} disabled={readOnly} onChange={(e) => setPoliceRef(e.currentTarget.value)} w={360} />
            </Stack>
            <Card withBorder radius="md">
              <Checkbox label="Gender verified against the ID document" checked={!!form.gender_ok} disabled={readOnly}
                onChange={(e) => setForm({ ...form, gender_ok: e.currentTarget.checked, pink_certified: e.currentTarget.checked && form.pink_certified })} />
              <Switch mt="sm" color="pink" checked={!!form.pink_certified} disabled={readOnly || sel.gender !== "female" || !form.gender_ok}
                onChange={(e) => setForm({ ...form, pink_certified: e.currentTarget.checked })}
                label="Pink rides (women riders only)"
                description={sel.gender !== "female" ? "Available only when the captain's profile gender is female." : !form.gender_ok ? "Verify gender against the ID first." : "Certify this woman captain for pink ride requests."} />
            </Card>
            <Textarea label="Review note" description="Required to approve, send back or disable. Shown to the captain." minRows={3} value={note} disabled={readOnly}
              onChange={(e) => setNote(e.currentTarget.value)} placeholder="What you verified, and how (min 10 characters)" />
            {blockers.length > 0 && !readOnly && (
              <Alert color="gray" title="Before approval">
                <Text size="xs">{blockers.slice(0, 6).join(" · ")}{blockers.length > 6 ? ` · +${blockers.length - 6} more` : ""}</Text>
              </Alert>
            )}
            <Group>
              <Tooltip label={blockers[0] || "Enable this captain"} disabled={blockers.length === 0}>
                <Button disabled={busy || readOnly || blockers.length > 0 || rejectedCount > 0} onClick={() => void submit("approved")}>{sel.status === "approved" ? "Save & keep enabled" : "Approve captain"}</Button>
              </Tooltip>
              <Button variant="light" color="orange" disabled={busy || readOnly || (rejectedCount === 0 && note.trim().length < 10)} onClick={() => void submit("pending")}>
                Send back{rejectedCount ? ` (${rejectedCount} to re-upload)` : " for corrections"}
              </Button>
              <Button color="red" variant="light" disabled={busy || readOnly || note.trim().length < 10} onClick={() => void submit("suspended")}>Disable</Button>
              <Button variant="default" disabled={busy || readOnly} onClick={() => void submit("")}>Save progress</Button>
            </Group>
          </Stack>
        )}
      </Drawer>

      <Modal opened={!!viewer} onClose={() => setViewer(null)} title={viewer?.title} size="xl" centered>
        {viewer && (
          <Stack>
            <Group gap="xs">
              <Tooltip label="Rotate"><ActionIcon variant="light" aria-label="Rotate" onClick={() => setRotate((r) => (r + 90) % 360)}><IconRotateClockwise size={18} /></ActionIcon></Tooltip>
              <Tooltip label="Zoom in"><ActionIcon variant="light" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}><IconZoomIn size={18} /></ActionIcon></Tooltip>
              <Tooltip label="Zoom out"><ActionIcon variant="light" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}><IconZoomOut size={18} /></ActionIcon></Tooltip>
            </Group>
            <div style={{ overflow: "auto", maxHeight: "70vh", display: "grid", placeItems: "center" }}>
              <EvidenceImage path={viewer.path} alt={viewer.title} rotate={rotate} zoom={zoom} />
            </div>
          </Stack>
        )}
      </Modal>
    </Container>
  );
}
