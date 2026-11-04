import { useState } from "react";
import { api } from "@hop/shared/api";
import type { ScreenProps } from "../AdminApp";
import { useLoad, when, type Tone } from "../lib";
import type { LostItem } from "../types";
import { Badge, Empty, Field, Modal, Skeleton, Tabs, useNotify } from "../ui";

const LABEL: Record<LostItem["status"], string> = { open: "Not started", driver_contacted: "Captain contacted", returned: "Returned", closed: "Closed" };
const TONE: Record<LostItem["status"], Tone> = { open: "warn", driver_contacted: "info", returned: "ok", closed: "plain" };
type Tab = "all" | LostItem["status"];

export default function LostFound({ refreshSummary }: ScreenProps) {
  const notify = useNotify();
  const { data, reload } = useLoad<{ lost_items: LostItem[] }>("/api/operator/lost-items", notify);
  const [tab, setTab] = useState<Tab>("all"), [q, setQ] = useState(""), [editing, setEditing] = useState<LostItem | null>(null);
  const items = data?.lost_items ?? [];
  const needle = q.trim().toLowerCase();
  const rows = items.filter((l) => (tab === "all" || l.status === tab) && (!needle || [l.description, l.rider_name, l.driver_name, l.vehicle_number].some((x) => (x || "").toLowerCase().includes(needle))));
  const n = (s: LostItem["status"]) => items.filter((l) => l.status === s).length;
  return (
    <>
      <div className="spread" style={{ flexWrap: "wrap" }}>
        <Tabs value={tab} onChange={setTab} items={[["all", "All"], ["open", LABEL.open, n("open")], ["driver_contacted", LABEL.driver_contacted, n("driver_contacted")], ["returned", LABEL.returned], ["closed", LABEL.closed]]} />
        <Field label={<span className="sr">Search lost items</span>}><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Item, rider, captain or vehicle" /></Field>
      </div>
      <section className="card flush">
        {!data ? <div style={{ padding: 20 }}><Skeleton /></div> : rows.length ? (
          <div className="table-wrap">
            <table className="tbl responsive">
              <thead><tr><th>Item</th><th>Rider</th><th>Captain</th><th>Status</th><th className="actions" /></tr></thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td className="lead"><strong>{l.description}</strong><small>Ride on {when(l.ride_date)} · {l.pickup_label} → {l.dropoff_label}</small></td>
                    <td data-label="Rider">{l.rider_name}</td>
                    <td data-label="Captain">{l.driver_name || "—"}{l.vehicle_number && <> · <span className="mono">{l.vehicle_number}</span></>}</td>
                    <td data-label="Status"><Badge tone={TONE[l.status]}>{LABEL[l.status]}</Badge></td>
                    <td className="actions"><button type="button" className="btn sm secondary" onClick={() => setEditing(l)}>Update</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No items in this list" icon="box" />}
      </section>
      {editing && <UpdateModal item={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); void reload(); refreshSummary(); }} />}
    </>
  );
}

function UpdateModal({ item, onClose, onDone }: { item: LostItem; onClose: () => void; onDone: () => void }) {
  const notify = useNotify();
  const [status, setStatus] = useState<LostItem["status"]>(item.status === "open" ? "driver_contacted" : item.status), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api(`/api/operator/lost-items/${item.id}`, { status, note: note.trim() });
      notify("Saved. The rider was notified.");
      onDone();
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal title="Update lost item" onClose={onClose} footer={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>Save and notify rider</button></>}>
      <p><strong>{item.description}</strong><br /><span className="muted">{item.rider_name} · captain {item.driver_name || "unknown"}</span></p>
      <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value as LostItem["status"])}>{(Object.keys(LABEL) as LostItem["status"][]).map((k) => <option key={k} value={k}>{LABEL[k]}</option>)}</select></Field>
      <Field label="Note to the rider" hint="Optional. Sent with the status update."><textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The captain has your bag and will drop it at 6 pm" /></Field>
    </Modal>
  );
}
