import { PrivateImage } from "@hop/shared/TrustProfile";
import ResponsiveTable from "@hop/shared/ResponsiveTable";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Badge, Button, Card, Checkbox, Container, Drawer, Group, Select, SimpleGrid, Stack, Switch, Table, Tabs, Text, Textarea,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { api } from "@hop/shared/api";
import type { Area } from "@hop/shared/types";

type AdminDriver = {
  has_photo: boolean; phone_verified: boolean; documents: string[]; onboarding_version: number; vehicle_make: string; vehicle_model: string; vehicle_color: string;
  id: string; name: string; email: string; phone: string; gender: string; status: string; online: boolean; area: string; area_id?: string;
  vehicle_category: string; vehicle_number: string; license_reference: string; insurance_reference: string;
  license_expires: string; insurance_expires: string; docs_expired: boolean; review_note: string; pink_certified: boolean;
  identity_ok: boolean; license_ok: boolean; rc_ok: boolean; insurance_ok: boolean; vehicle_ok: boolean; police_ok: boolean; trips: number;
};

const CHECKS: [keyof AdminDriver, string, string][] = [
  ["identity_ok", "Identity", "Aadhaar / government ID matches the applicant and photo"],
  ["license_ok", "Driving licence", "Valid licence for this vehicle class, not expired"],
  ["rc_ok", "Registration (RC)", "RC matches the vehicle number and owner"],
  ["insurance_ok", "Insurance", "Active policy covering commercial use"],
  ["vehicle_ok", "Vehicle inspection", "Vehicle condition, safety gear and category checked"],
  ["police_ok", "Police verification", "Background / police clearance received"],
];
const statusColor: Record<string, string> = { pending: "yellow", approved: "green", suspended: "red" };

export default function AdminConsole({ notify }: { notify: (s: string) => void; onExit?: () => void }) {
  const [rows, setRows] = useState<AdminDriver[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [assignedArea, setAssignedArea] = useState<string>("");
  const [tab, setTab] = useState<string | null>("pending");
  const [sel, setSel] = useState<AdminDriver | null>(null);
  const [form, setForm] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [documentKind,setDocumentKind]=useState("");

  const load = useCallback(async () => {
    try {
      const [cfg, driverRes] = await Promise.all([
        api<{ areas: Area[] }>("/api/config"),
        api<{ drivers: AdminDriver[] }>("/api/admin/drivers"),
      ]);
      setAreas(cfg.areas ?? []);
      setRows(driverRes.drivers ?? []);
    } catch (e) {
      notify((e as Error).message);
    }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => rows.filter((r) => tab === "all" || r.status === tab), [rows, tab]);
  const count = (s: string) => rows.filter((r) => r.status === s).length;

  function open(r: AdminDriver) {
    setSel(r); setDocumentKind("");
    setNote("");
    setAssignedArea(r.area_id || "");
    setForm(Object.fromEntries([...CHECKS.map(([k]) => [k, Boolean(r[k])]), ["pink_certified", r.pink_certified]]));
  }
  const all = CHECKS.every(([k]) => form[k]);

  async function submit(status: "approved" | "suspended" | "pending" | "") {
    if (!sel) return;
    setBusy(true);
    try {
      await api(`/api/admin/drivers/${sel.id}`, {
        ...form,
        status,
        note,
        area_id: assignedArea && assignedArea !== sel.area_id ? assignedArea : undefined,
      });
      notify(status === "approved" ? "Driver enabled." : status === "suspended" ? "Driver disabled." : "Checklist saved.");
      setSel(null);
      await load();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container size="xl" p={0}>
      <SimpleGrid cols={{ base: 2, md: 4 }} mb="md">
        {[["Awaiting review", count("pending")], ["Enabled", count("approved")], ["Disabled", count("suspended")], ["Pink certified", rows.filter((r) => r.pink_certified).length]].map(([l, v]) => (
          <Card key={l as string} withBorder radius="lg"><Text size="xs" c="dimmed" tt="uppercase" fw={600}>{l}</Text><Text fz={28} fw={800}>{v}</Text></Card>
        ))}
      </SimpleGrid>
      <Tabs value={tab} onChange={setTab}>
        <Tabs.List mb="md">
          <Tabs.Tab value="pending">Pending ({count("pending")})</Tabs.Tab>
          <Tabs.Tab value="approved">Enabled</Tabs.Tab>
          <Tabs.Tab value="suspended">Disabled</Tabs.Tab>
          <Tabs.Tab value="all">All</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <Card withBorder radius="lg" p={0} style={{ overflowX: "auto" }}>
        <ResponsiveTable highlightOnHover verticalSpacing="sm">
          <Table.Thead><Table.Tr><Table.Th>Driver</Table.Th><Table.Th>Vehicle</Table.Th><Table.Th>Area</Table.Th><Table.Th>Checks</Table.Th><Table.Th>Status</Table.Th><Table.Th /></Table.Tr></Table.Thead>
          <Table.Tbody>
            {shown.map((r) => {
              const done = CHECKS.filter(([k]) => r[k]).length;
              return (
                <Table.Tr key={r.id}>
                  <Table.Td><Text fw={600} size="sm">{r.name}</Text><Text size="xs" c="dimmed">{r.phone || r.email}</Text></Table.Td>
                  <Table.Td><Text size="sm">{r.vehicle_number}</Text><Text size="xs" c="dimmed">{r.vehicle_category}</Text></Table.Td>
                  <Table.Td>{r.area}</Table.Td>
                  <Table.Td><Badge variant="light" color={done === 6 ? "green" : "orange"}>{done}/6</Badge>{r.docs_expired && <Badge ml={6} color="red">Docs expired</Badge>}</Table.Td>
                  <Table.Td><Badge color={statusColor[r.status]}>{r.status === "approved" ? "enabled" : r.status === "suspended" ? "disabled" : "pending"}</Badge>{r.pink_certified && <Badge ml={6} color="pink">Pink</Badge>}</Table.Td>
                  <Table.Td><Button size="compact-sm" variant="light" onClick={() => open(r)}>Review</Button></Table.Td>
                </Table.Tr>
              );
            })}
            {shown.length === 0 && <Table.Tr><Table.Td colSpan={6}><Text c="dimmed" ta="center" py="lg">Nothing here.</Text></Table.Td></Table.Tr>}
          </Table.Tbody>
        </ResponsiveTable>
      </Card>

      <Drawer opened={!!sel} onClose={() => setSel(null)} position="right" size="lg" title={sel ? `Review ${sel.name}` : ""}>
        {sel && (
          <Stack gap="md">
            <Card withBorder radius="md">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                {sel.has_photo && <PrivateImage accountId={sel.id} alt="Applicant portrait" className="captain-portrait"/>}
                <div><Text size="xs" c="dimmed">Phone {sel.phone_verified ? "(verified)" : "(unverified)"}</Text><Text size="sm">{sel.phone || "—"}</Text></div>
                <div><Text size="xs" c="dimmed">Gender (profile)</Text><Text size="sm">{sel.gender || "not set"}</Text></div>
                <div><Text size="xs" c="dimmed">Vehicle</Text><Text size="sm">{sel.vehicle_number} · {sel.vehicle_category}<br/>{sel.vehicle_color} {sel.vehicle_make} {sel.vehicle_model}</Text></div>
                <div>
                  <Text size="xs" c="dimmed">Area · trips</Text>
                  <Text size="sm">{sel.area} · {sel.trips}</Text>
                  {areas.length > 0 && (
                    <Select
                      label="Service area"
                      size="xs"
                      mt={4}
                      data={areas.filter((a) => a.active !== false).map((a) => ({ value: a.id, label: `${a.name} (${a.state})` }))}
                      value={assignedArea}
                      onChange={(val) => setAssignedArea(val || "")}
                    />
                  )}
                </div>
                <div><Text size="xs" c="dimmed">Licence ref · expires</Text><Text size="sm">{sel.license_reference} · {sel.license_expires}</Text></div>
                <div><Text size="xs" c="dimmed">Insurance ref · expires</Text><Text size="sm">{sel.insurance_reference} · {sel.insurance_expires}</Text></div>
              </SimpleGrid>
              {sel.review_note && <Text size="xs" c="dimmed" mt="sm">Last note: {sel.review_note}</Text>}
            </Card>
            <Text size="sm">Private evidence · document views are audited. Confirm images match the application before ticking checks.</Text>
            <Group>{(sel.documents || []).map(kind=><Button key={kind} variant="light" size="compact-sm" onClick={()=>setDocumentKind(documentKind===kind?"":kind)}>{kind}</Button>)}</Group>
            {documentKind && <PrivateImage key={sel.id+documentKind} accountId={sel.id} kind={documentKind} alt={`${documentKind} document`}/>}
            {sel.onboarding_version>0 && (!sel.has_photo || sel.documents.length<4) && <Alert color="orange">Portrait and all four private documents are required.</Alert>}
            {sel.docs_expired && <Alert color="red" icon={<IconAlertTriangle size={16} />}>Documents have expired. The driver cannot be enabled.</Alert>}
            <Stack gap="xs">
              <Text fw={700}>Verification checklist</Text>
              {CHECKS.map(([k, label, hint]) => (
                <Checkbox key={k} checked={!!form[k]} onChange={(e) => setForm({ ...form, [k]: e.currentTarget.checked })} label={label} description={hint} />
              ))}
            </Stack>
            <Switch
              color="pink"
              checked={!!form.pink_certified}
              disabled={sel.gender !== "female"}
              onChange={(e) => setForm({ ...form, pink_certified: e.currentTarget.checked })}
              label="Pink rides (women riders only)"
              description={sel.gender === "female" ? "Certify this woman driver for pink ride requests. Verify gender against her ID first." : "Available only when the driver's profile gender is female."}
            />
            <Textarea label="Review note (required to change status)" minRows={3} value={note} onChange={(e) => setNote(e.currentTarget.value)} placeholder="What you verified, and how (min 10 characters)" />
            <Group>
              <Button disabled={busy || !all || !sel.phone_verified || (sel.onboarding_version>0 && (!sel.has_photo || sel.documents.length<4)) || sel.docs_expired || note.trim().length < 10} onClick={() => submit("approved")}>{sel.status === "approved" ? "Save & keep enabled" : "Approve & enable"}</Button>
              <Button variant="light" disabled={busy || note.trim().length < 10} onClick={() => submit("pending")}>Request corrections</Button>
              <Button color="red" variant="light" disabled={busy || note.trim().length < 10} onClick={() => submit("suspended")}>Disable</Button>
              <Button variant="default" disabled={busy} onClick={() => submit("")}>Save checklist only</Button>
            </Group>
          </Stack>
        )}
      </Drawer>
    </Container>
  );
}
